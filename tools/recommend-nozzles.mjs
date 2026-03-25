import fs from "node:fs";

const ASSUMPTIONS = {
  designFlowLimitGpm: 14,
  sprayArcNormalizeToleranceDeg: 10,
  preferLongerRangeRotors: true,
  rotorSimplicityPrecipToleranceInHr: 0.01,
  zoneFamilyAutoResolvePrecipToleranceInHr: 0.03,
  universalMaxRadiusReductionPct: 0.25,
};

const layout = JSON.parse(fs.readFileSync("sprinkler-layout.json", "utf8")).project;
const db = JSON.parse(fs.readFileSync("sprinkler_data.json", "utf8")).irrigation_system_database;
const zonesById = new Map(layout.zones.map((zone) => [zone.id, zone]));
const reportLines = [];

const sprayDb = buildSprayDatabase(db.spray_series.rain_bird_1800_prs);
const rotorDb = buildRotorDatabase(db.rotor_series);

const grouped = new Map();
for (const sprinkler of layout.sprinklers) {
  const zone = zonesById.get(sprinkler.zoneId) ?? { name: "Unassigned", color: "#777777" };
  if (!grouped.has(zone.name)) {
    grouped.set(zone.name, { zone, sprinklers: [] });
  }
  grouped.get(zone.name).sprinklers.push(sprinkler);
}

const zoneReports = [...grouped.values()]
  .sort((a, b) => a.zone.name.localeCompare(b.zone.name))
  .map(({ zone, sprinklers }) => analyzeZone(zone, sprinklers, sprayDb, rotorDb, ASSUMPTIONS));

reportLines.push("# Zone Head and Nozzle Analysis");
reportLines.push("");
reportLines.push("Generated from `sprinkler-layout.json` and `sprinkler_data.json`.");
reportLines.push("");
reportLines.push("## Assumptions");
reportLines.push("");
reportLines.push(`- Design flow cap: ${ASSUMPTIONS.designFlowLimitGpm.toFixed(2)} GPM per zone.`);
reportLines.push("- Spray versus rotor classification is based on whether any spray radius class in the dataset can meet the head under the no-undershoot plus allowed reduction rule, so larger spray options like `18-VAN` are preferred over mixing in rotors when they fit.");
reportLines.push(`- Fixed spray arcs are normalized when the drawn arc is within +/-${ASSUMPTIONS.sprayArcNormalizeToleranceDeg} degrees of 90, 180, or 360 and that radius class has a fixed nozzle option.`);
reportLines.push("- Fixed spray preference order is Rain Bird MPR first, then U-Series as a fallback when no matching MPR fixed nozzle exists at that radius and arc.");
reportLines.push(`- All head types are assumed to allow up to ${(ASSUMPTIONS.universalMaxRadiusReductionPct * 100).toFixed(0)}% radius reduction with the screw adjustment.`);
reportLines.push("- Rotor optimization compares Rain Bird 5004 PRS MPR pre-balanced sets plus the standard-angle 25 degree and low-angle 10 degree nozzle families.");
reportLines.push("- The 5004 PRS Red, Green, and Beige pre-balanced sets are treated as discrete fixed-flow nozzle choices: `Q_90`, `T_120`, `H_180`, and `F_360`.");
reportLines.push("- The 5004 standard-angle and low-angle nozzle entries use their listed `flow_gpm` directly as candidate head flow.");
reportLines.push("- Adjustable VAN spray nozzles use arc-aware flow. When the chart provides 90/180/270/360 GPM anchors, intermediate arcs are piecewise-linearly interpolated; otherwise flow is scaled linearly from 0 to the listed 360 degree GPM.");
reportLines.push("- Actual precipitation is recalculated per head from flow, installed arc, and target radius using `96.3 x GPM / sector area`, so installed sweep changes actual PR but does not change nozzle GPM.");
reportLines.push(`- When rotor precipitation spread is within ${ASSUMPTIONS.rotorSimplicityPrecipToleranceInHr.toFixed(3)} in/hr, the optimizer favors simpler installs: fewer specialty nozzles, fewer low-angle heads, and fewer unique SKUs.`);
reportLines.push(`- When a mixed-family zone has a uniform dominant-family alternative within ${ASSUMPTIONS.zoneFamilyAutoResolvePrecipToleranceInHr.toFixed(3)} in/hr of the current spread and without a worse flow overage, the selector auto-resolves to the dominant family.`);
reportLines.push("- No undershoot is allowed for any head type; selected nominal radius must be greater than or equal to the required throw, and the closest qualifying radius is preferred.");
reportLines.push("");

for (const zoneReport of zoneReports) {
  appendZoneReport(reportLines, zoneReport);
}

reportLines.push("## Summary");
reportLines.push("");
for (const zoneReport of zoneReports) {
  const status = zoneReport.totalFlowGpm <= ASSUMPTIONS.designFlowLimitGpm ? "OK" : "Over 14 GPM";
  reportLines.push(`- ${zoneReport.zone.name}: ${zoneReport.totalFlowGpm.toFixed(2)} GPM, ${status}.`);
}
reportLines.push("");

const report = reportLines.join("\n");
fs.writeFileSync("zone-nozzle-analysis.md", report);
process.stdout.write(report);

function analyzeZone(zone, sprinklers, sprayData, rotorData, assumptions) {
  const enriched = sprinklers.map((sprinkler) => ({
    ...sprinkler,
    desiredArcDeg: sprinkler.pattern === "full" ? 360 : sprinkler.sweepDeg,
  }));

  const sprays = enriched.filter((sprinkler) => sprinklerCanUseSpray(sprinkler, sprayData, assumptions));
  const rotors = enriched.filter((sprinkler) => !sprinklerCanUseSpray(sprinkler, sprayData, assumptions));
  const baselineRecommendations = [];
  const baselineNotes = [];

  for (const sprinkler of sprays.sort(compareSprinklers)) {
    baselineRecommendations.push(recommendSpray(sprinkler, sprayData, assumptions));
  }

  if (rotors.length) {
    const rotorRecommendations = recommendRotorZone(rotors.sort(compareSprinklers), rotorData, assumptions);
    baselineRecommendations.push(...rotorRecommendations.recommendations);
    baselineNotes.push(...rotorRecommendations.notes);
  }

  const baselineMetrics = scoreZoneRecommendations(baselineRecommendations, assumptions);
  const preferredFamily = determinePreferredZoneFamily(baselineMetrics.familyCounts);
  const familyResolution = preferredFamily !== "mixed"
    ? tryAutoResolveZoneFamily(preferredFamily, baselineRecommendations, enriched, sprayData, rotorData, assumptions)
    : null;
  const recommendations = familyResolution?.applied
    ? familyResolution.recommendations
    : baselineRecommendations;
  const notes = familyResolution?.applied
    ? [...familyResolution.notes]
    : [...baselineNotes, ...(familyResolution?.notes ?? [])];
  const finalMetrics = scoreZoneRecommendations(recommendations, assumptions);
  const totalFlowGpm = finalMetrics.totalFlowGpm;
  const precipSpread = finalMetrics.precipSpread;

  if (finalMetrics.familyCounts.spray > 0 && finalMetrics.familyCounts.rotor > 0) {
    notes.unshift("Mixed spray and rotor head styles appear in the same zone. That is usually a precipitation mismatch risk.");
  }

  if (totalFlowGpm > assumptions.designFlowLimitGpm) {
    notes.push(`Zone exceeds the ${assumptions.designFlowLimitGpm.toFixed(2)} GPM design cap by ${(totalFlowGpm - assumptions.designFlowLimitGpm).toFixed(2)} GPM.`);
  }

  if (precipSpread > 0.15) {
    notes.push(`Recommended precipitation values span ${precipSpread.toFixed(2)} in/hr. Review for cross-family mismatch.`);
  }

  const suggestedSplit = totalFlowGpm > assumptions.designFlowLimitGpm ? proposeSplit(recommendations) : null;

  return {
    zone,
    sprinklers: enriched,
    recommendations: recommendations.sort((a, b) => a.label.localeCompare(b.label)),
    totalFlowGpm,
    notes,
    suggestedSplit,
  };
}

function recommendSpray(sprinkler, sprayData, assumptions) {
  const desiredRadius = sprinkler.radius;
  const desiredArc = sprinkler.desiredArcDeg;
  const radiusClass = pickRadiusClass(desiredRadius, sprayData.radiusClasses, sprayData.maxRadiusReduction, assumptions);
  if (!radiusClass) {
    const fallback = sprayData.radiusClasses
      .filter((candidate) => candidate >= desiredRadius)
      .sort((a, b) => a - b)[0] ?? sprayData.radiusClasses[sprayData.radiusClasses.length - 1];
    const variable = sprayData.variableByRadius.get(fallback);
    const flowGpm = calculateAdjustableSprayFlow(variable, desiredArc);
    return {
      label: sprinkler.label,
      x: sprinkler.x,
      y: sprinkler.y,
      zoneName: zonesById.get(sprinkler.zoneId)?.name ?? "Unassigned",
      family: "spray",
      body: "Rain Bird 1800 PRS",
      nozzle: variable.model,
      nozzleType: "variable",
      radiusClassFt: fallback,
      desiredRadiusFt: desiredRadius,
      selectedRadiusFt: variable.maxRadiusFt,
      radiusAdjustmentPct: pctReduction(variable.maxRadiusFt, desiredRadius),
      desiredArcDeg: desiredArc,
      selectedArcDeg: desiredArc,
      arcNormalized: false,
      flowGpm,
      precipInHr: variable.precipInHr,
      actualPrecipInHr: calculateActualPrecipInHr(flowGpm, desiredRadius, desiredArc),
      comment: "No spray nozzle met the strict no-undershoot plus 25% reduction rule exactly; nearest larger variable nozzle was used as a fallback.",
    };
  }
  const normalizedArc = nearestFixedArc(desiredArc);
  const canUseFixed =
    sprayData.fixedByRadius.has(radiusClass) &&
    Math.abs(desiredArc - normalizedArc) <= assumptions.sprayArcNormalizeToleranceDeg;

  if (canUseFixed) {
    const fixed = sprayData.fixedByRadius.get(radiusClass).get(normalizedArc);
    return {
      label: sprinkler.label,
      x: sprinkler.x,
      y: sprinkler.y,
      zoneName: zonesById.get(sprinkler.zoneId)?.name ?? "Unassigned",
      family: "spray",
      body: "Rain Bird 1800 PRS",
      nozzle: fixed.series,
      nozzleType: "fixed",
      radiusClassFt: radiusClass,
      desiredRadiusFt: desiredRadius,
      selectedRadiusFt: fixed.radiusFt,
      radiusAdjustmentPct: pctReduction(fixed.radiusFt, desiredRadius),
      desiredArcDeg: desiredArc,
      selectedArcDeg: normalizedArc,
      arcNormalized: normalizedArc !== desiredArc,
      flowGpm: fixed.flowGpm,
      precipInHr: fixed.precipInHr,
      actualPrecipInHr: calculateActualPrecipInHr(fixed.flowGpm, desiredRadius, normalizedArc),
      comment: `Fixed arc ${fixed.series} selected for ${normalizedArc} degrees.`,
    };
  }

  const variable = sprayData.variableByRadius.get(radiusClass);
  return {
    label: sprinkler.label,
    x: sprinkler.x,
    y: sprinkler.y,
    zoneName: zonesById.get(sprinkler.zoneId)?.name ?? "Unassigned",
    family: "spray",
    body: "Rain Bird 1800 PRS",
    nozzle: variable.model,
    nozzleType: "variable",
    radiusClassFt: radiusClass,
    desiredRadiusFt: desiredRadius,
    selectedRadiusFt: variable.maxRadiusFt,
    radiusAdjustmentPct: pctReduction(variable.maxRadiusFt, desiredRadius),
    desiredArcDeg: desiredArc,
    selectedArcDeg: desiredArc,
    arcNormalized: false,
    flowGpm: calculateAdjustableSprayFlow(variable, desiredArc),
    precipInHr: variable.precipInHr,
    actualPrecipInHr: calculateActualPrecipInHr(calculateAdjustableSprayFlow(variable, desiredArc), desiredRadius, desiredArc),
    comment: "Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only.",
  };
}

function recommendRotorZone(rotors, rotorData, assumptions) {
  const notes = [];
  const candidateMatrix = rotors.map((sprinkler) =>
    buildRotorCandidatesForHead(sprinkler, rotorData, assumptions),
  );

  if (candidateMatrix.some((candidates) => candidates.length === 0)) {
    notes.push("At least one rotor has no valid nozzle candidate under the strict no-undershoot plus 25% reduction rule.");
    return {
      notes,
      recommendations: candidateMatrix.flat().sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })),
    };
  }

  if (candidateMatrix.every((candidates) => candidates.some((candidate) => candidate.body === "Rain Bird 5004 PRS"))) {
    const optimized = optimizeRotorAssignments(candidateMatrix, assumptions);
    notes.push(`Rotor zone optimized zone-wide for actual precipitation first, then install simplicity, then coverage reserve. Score: actual PR spread ${optimized.metrics.precipSpread.toFixed(3)} in/hr, specialty heads ${optimized.metrics.specialtyCount}, low-angle heads ${optimized.metrics.lowAngleCount}, unique SKUs ${optimized.metrics.uniqueNozzles}, reserve ${optimized.metrics.coverageReserveFt.toFixed(2)} ft, flow ${optimized.metrics.totalFlowGpm.toFixed(2)} GPM.`);
    return { notes, recommendations: optimized.recommendations };
  }

  const recommendations = candidateMatrix.map((candidates) => candidates[0]);
  if (recommendations.some((item) => item.body === "Rain Bird 3504")) {
    notes.push("Some rotors could not be placed cleanly in the 5004 PRS matched sets, so those heads fell back to 3504 nozzle fits.");
  }
  return { notes, recommendations };
}

function tryAutoResolveZoneFamily(preferredFamily, baselineRecommendations, sprinklers, sprayData, rotorData, assumptions) {
  const baselineMetrics = scoreZoneRecommendations(baselineRecommendations, assumptions);
  const outlierCount = baselineRecommendations.filter((recommendation) => recommendation.family !== preferredFamily).length;
  if (!outlierCount) {
    return { applied: false, recommendations: baselineRecommendations, notes: [] };
  }

  const uniformZone = buildUniformZoneRecommendations(preferredFamily, sprinklers, sprayData, rotorData, assumptions);
  if (!uniformZone) {
    return { applied: false, recommendations: baselineRecommendations, notes: [] };
  }

  const uniformMetrics = scoreZoneRecommendations(uniformZone.recommendations, assumptions);
  const withinFlowTolerance = uniformMetrics.flowOverageGpm <= baselineMetrics.flowOverageGpm;
  const withinPrecipTolerance =
    uniformMetrics.precipSpread <= baselineMetrics.precipSpread + assumptions.zoneFamilyAutoResolvePrecipToleranceInHr;

  if (!withinFlowTolerance || !withinPrecipTolerance) {
    const reasons = [];
    if (!withinFlowTolerance) {
      reasons.push(`flow would rise from ${baselineMetrics.totalFlowGpm.toFixed(2)} to ${uniformMetrics.totalFlowGpm.toFixed(2)} GPM`);
    }
    if (!withinPrecipTolerance) {
      reasons.push(`spread would rise from ${baselineMetrics.precipSpread.toFixed(3)} to ${uniformMetrics.precipSpread.toFixed(3)} in/hr`);
    }
    return {
      applied: false,
      recommendations: baselineRecommendations,
      notes: [
        `A uniform ${preferredFamily} alternative exists, but it was not auto-applied because ${reasons.join(" and ")}.`,
      ],
    };
  }

  const notes = [];
  if (uniformZone.searchMode === "beam") {
    notes.push("Zone-family auto-resolution used beam search to keep the report optimizer responsive.");
  }
  notes.push(
    `Auto-resolved ${outlierCount} outlier head${outlierCount === 1 ? "" : "s"} to the ${preferredFamily} family. Zone spread ${baselineMetrics.precipSpread.toFixed(3)} -> ${uniformMetrics.precipSpread.toFixed(3)} in/hr at ${baselineMetrics.totalFlowGpm.toFixed(2)} -> ${uniformMetrics.totalFlowGpm.toFixed(2)} GPM.`,
  );

  return {
    applied: true,
    recommendations: uniformZone.recommendations.map((recommendation) => ({
      ...recommendation,
      comment: `${recommendation.comment} Auto-resolved to keep the ${preferredFamily}-dominant zone uniform.`,
    })),
    notes,
  };
}

function buildUniformZoneRecommendations(preferredFamily, sprinklers, sprayData, rotorData, assumptions) {
  const sortedSprinklers = [...sprinklers].sort(compareSprinklers);
  if (preferredFamily === "spray") {
    if (sortedSprinklers.some((sprinkler) => !sprinklerCanUseSpray(sprinkler, sprayData, assumptions))) {
      return null;
    }
    return {
      recommendations: sortedSprinklers.map((sprinkler) => recommendSpray(sprinkler, sprayData, assumptions)),
      searchMode: "direct",
    };
  }

  if (preferredFamily === "rotor") {
    const candidateMatrix = sortedSprinklers.map((sprinkler) =>
      buildRotorCandidatesForHead(sprinkler, rotorData, assumptions),
    );
    if (candidateMatrix.some((candidates) => candidates.length === 0)) {
      return null;
    }
    const optimized = optimizeRotorAssignments(candidateMatrix, assumptions);
    return {
      recommendations: optimized.recommendations,
      searchMode: optimized.searchMode,
    };
  }

  return null;
}

function appendZoneReport(lines, zoneReport) {
  lines.push(`## Zone ${zoneReport.zone.name}`);
  lines.push("");
  lines.push(`- Heads analyzed: ${zoneReport.recommendations.length}`);
  lines.push(`- Estimated zone flow: ${zoneReport.totalFlowGpm.toFixed(2)} GPM`);
  lines.push(`- Flow status: ${zoneReport.totalFlowGpm <= ASSUMPTIONS.designFlowLimitGpm ? "Within 14 GPM" : "Over 14 GPM"}`);
  lines.push("");
  lines.push("| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const rec of zoneReport.recommendations) {
    const arcCell =
      rec.arcNormalized
        ? `${formatArc(rec.desiredArcDeg)} -> ${formatArc(rec.selectedArcDeg)}`
        : formatArc(rec.selectedArcDeg);
    const radiusCell = `${rec.desiredRadiusFt.toFixed(2)} ft -> ${rec.selectedRadiusFt.toFixed(0)} ft`;
    lines.push(
      `| ${rec.label} | (${rec.x.toFixed(1)}, ${rec.y.toFixed(1)}) | ${rec.family} | ${rec.body} | ${rec.nozzle} | ${arcCell} | ${radiusCell} | ${rec.flowGpm.toFixed(2)} GPM | ${rec.actualPrecipInHr.toFixed(3)} in/hr | ${rec.comment} |`,
    );
  }
  lines.push("");

  if (zoneReport.notes.length) {
    lines.push("### Notes");
    lines.push("");
    for (const note of zoneReport.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  if (zoneReport.suggestedSplit) {
    lines.push("### Suggested Split");
    lines.push("");
    lines.push(`- ${zoneReport.suggestedSplit.primary.name}: ${zoneReport.suggestedSplit.primary.flowGpm.toFixed(2)} GPM (${zoneReport.suggestedSplit.primary.labels.join(", ")}).`);
    lines.push(`- ${zoneReport.suggestedSplit.secondary.name}: ${zoneReport.suggestedSplit.secondary.flowGpm.toFixed(2)} GPM (${zoneReport.suggestedSplit.secondary.labels.join(", ")}).`);
    lines.push("");
  }
}

function buildSprayDatabase(series) {
  const fixedByRadius = new Map();
  addFixedSpraySeries(fixedByRadius, series.mpr_series_fixed ?? [], { overwriteExisting: true });
  addFixedSpraySeries(fixedByRadius, series.u_series_fixed_mpr ?? [], { overwriteExisting: false });

  const variableByRadius = new Map();
  for (const nozzle of series.he_van_high_efficiency) {
    variableByRadius.set(nozzle.max_radius_ft, createAdjustableSprayEntry(nozzle));
  }

  for (const nozzle of series.van_series_variable_arc ?? []) {
    variableByRadius.set(nozzle.max_radius_ft, createAdjustableSprayEntry(nozzle));
  }

  return {
    maxRadiusReduction: series.mechanical_specs.max_radius_reduction_pct / 100,
    radiusClasses: [...new Set([...fixedByRadius.keys(), ...variableByRadius.keys()])].sort((a, b) => a - b),
    fixedByRadius,
    variableByRadius,
  };
}

function addFixedSpraySeries(fixedByRadius, nozzles, { overwriteExisting }) {
  for (const nozzle of nozzles) {
    const radius = Number(nozzle.radius_ft);
    const arc = Number(nozzle.arc);
    if (!fixedByRadius.has(radius)) {
      fixedByRadius.set(radius, new Map());
    }
    if (!overwriteExisting && fixedByRadius.get(radius).has(arc)) {
      continue;
    }
    fixedByRadius.get(radius).set(arc, {
      series: nozzle.series,
      radiusFt: Number(nozzle.radius_ft),
      flowGpm: Number(nozzle.flow_gpm),
      precipInHr: Number(nozzle.precip_in_hr),
    });
  }
}

function sprinklerCanUseSpray(sprinkler, sprayData, assumptions) {
  const desiredRadius = Number(sprinkler?.radius);
  if (!Number.isFinite(desiredRadius) || desiredRadius <= 0) {
    return false;
  }

  return (sprayData?.radiusClasses ?? []).some((radiusClass) =>
    radiusFits(radiusClass, desiredRadius, sprayData.maxRadiusReduction, assumptions),
  );
}

function createAdjustableSprayEntry(nozzle) {
  const anchors = buildAdjustableSprayAnchors(nozzle);
  return {
    model: nozzle.model,
    maxRadiusFt: Number(nozzle.max_radius_ft),
    flowAt360: anchors.at(-1)?.flowGpm ?? Number(nozzle.flow_gpm_360) ?? 0,
    flowAnchors: anchors,
    precipInHr: Number(nozzle.precip_avg),
  };
}

function buildAdjustableSprayAnchors(nozzle) {
  const explicitAnchors = [
    { arcDeg: 90, flowGpm: Number(nozzle.flow_gpm_90) },
    { arcDeg: 180, flowGpm: Number(nozzle.flow_gpm_180) },
    { arcDeg: 270, flowGpm: Number(nozzle.flow_gpm_270) },
    { arcDeg: 360, flowGpm: Number(nozzle.flow_gpm_360) },
  ].filter((anchor) => Number.isFinite(anchor.flowGpm) && anchor.flowGpm > 0);

  if (explicitAnchors.length) {
    return [{ arcDeg: 0, flowGpm: 0 }].concat(explicitAnchors);
  }

  const flowAt360 = Number(nozzle.flow_gpm_360);
  return Number.isFinite(flowAt360) && flowAt360 > 0
    ? [
      { arcDeg: 0, flowGpm: 0 },
      { arcDeg: 360, flowGpm: flowAt360 },
    ]
    : [{ arcDeg: 0, flowGpm: 0 }];
}

function calculateAdjustableSprayFlow(nozzle, desiredArcDeg) {
  const anchors = Array.isArray(nozzle?.flowAnchors) && nozzle.flowAnchors.length
    ? nozzle.flowAnchors
    : [
      { arcDeg: 0, flowGpm: 0 },
      { arcDeg: 360, flowGpm: Number(nozzle?.flowAt360) || 0 },
    ];
  const clampedArcDeg = Math.max(0, Math.min(360, Number(desiredArcDeg) || 0));

  for (let index = 1; index < anchors.length; index += 1) {
    const lower = anchors[index - 1];
    const upper = anchors[index];
    if (clampedArcDeg <= upper.arcDeg) {
      const span = Math.max(upper.arcDeg - lower.arcDeg, 0.0001);
      const weight = (clampedArcDeg - lower.arcDeg) / span;
      return lower.flowGpm + (upper.flowGpm - lower.flowGpm) * weight;
    }
  }

  return anchors.at(-1)?.flowGpm ?? 0;
}

function determinePreferredZoneFamily(familyCounts) {
  const sprayCount = familyCounts?.spray ?? 0;
  const rotorCount = familyCounts?.rotor ?? 0;
  if (sprayCount > rotorCount) {
    return "spray";
  }
  if (rotorCount > sprayCount) {
    return "rotor";
  }
  return "mixed";
}

function buildRotorDatabase(rotorSeries) {
  const matchedSets = rotorSeries.rain_bird_5004_prs.mpr_pre_balanced_sets.map((set) => ({
    label: set.set,
    radiusFt: Number(set.set.match(/(\d+)ft/)?.[1] ?? "0"),
    quarterFlow: set.Q_90,
    thirdFlow: set.T_120,
    halfFlow: set.H_180,
    fullCircleFlow: set.F_360,
    variants: [
      { code: "Q_90", nominalArcDeg: 90, flowGpm: set.Q_90 },
      ...(typeof set.T_120 === "number" ? [{ code: "T_120", nominalArcDeg: 120, flowGpm: set.T_120 }] : []),
      { code: "H_180", nominalArcDeg: 180, flowGpm: set.H_180 },
      { code: "F_360", nominalArcDeg: 360, flowGpm: set.F_360 },
    ],
    precipSquareInHr: estimateRotorPrecip(set),
    precipObjectiveInHr: 0,
    precipGroup: "5004_prs_mpr",
    maxReduction: rotorSeries.rain_bird_5004_prs.mechanical_specs.max_radius_reduction_pct / 100,
  }));
  const standard5004 = rotorSeries.rain_bird_5004_prs.standard_angle_25_deg.map((nozzle) => ({
    nozzle: nozzle.nozzle,
    radiusFt: nozzle.radius_ft,
    flowGpm: nozzle.flow_gpm,
    angleFamily: "standard_angle_25_deg",
    maxReduction: rotorSeries.rain_bird_5004_prs.mechanical_specs.max_radius_reduction_pct / 100,
  }));
  const lowAngle5004 = rotorSeries.rain_bird_5004_prs.low_angle_10_deg.map((nozzle) => ({
    nozzle: nozzle.nozzle,
    radiusFt: nozzle.radius_ft,
    flowGpm: nozzle.flow_gpm,
    angleFamily: "low_angle_10_deg",
    maxReduction: rotorSeries.rain_bird_5004_prs.mechanical_specs.max_radius_reduction_pct / 100,
  }));
  const standard3504 = rotorSeries.rain_bird_3504.standard_nozzles.map((nozzle) => ({
    nozzle: nozzle.nozzle,
    radiusFt: nozzle.radius_ft,
    flowGpm: nozzle.flow_gpm,
    precipInHr: nozzle.precip_in_hr_square,
    precipObjectiveInHr: nozzle.precip_in_hr_square,
    precipGroup: `3504_${nozzle.nozzle}`,
  }));
  return {
    matchedSets,
    standard5004,
    lowAngle5004,
    standard3504,
    standard3504Reduction: rotorSeries.rain_bird_3504.mechanical_specs.max_radius_reduction_pct / 100,
  };
}

function pickRadiusClass(desiredRadius, radiusClasses, maxReduction, assumptions) {
  const candidates = radiusClasses.filter((radiusClass) =>
    radiusFits(radiusClass, desiredRadius, maxReduction, assumptions),
  );
  if (candidates.length) {
    return candidates.reduce((best, current) =>
      scoreRadiusCandidate(current, desiredRadius) < scoreRadiusCandidate(best, desiredRadius) ? current : best,
    );
  }

  return null;
}

function pickPerHeadRotorNozzle(desiredRadius, nozzles, maxReduction, assumptions) {
  const candidates = nozzles.filter((nozzle) => radiusFits(nozzle.radiusFt, desiredRadius, maxReduction, assumptions));
  if (candidates.length) {
    return candidates.reduce((best, current) =>
      scoreRadiusCandidate(current.radiusFt, desiredRadius) < scoreRadiusCandidate(best.radiusFt, desiredRadius) ? current : best,
    );
  }

  return null;
}

function nearestFixedArc(arc) {
  const fixedArcs = [90, 180, 360];
  return fixedArcs.reduce((best, current) =>
    Math.abs(current - arc) < Math.abs(best - arc) ? current : best,
  );
}

function radiusFits(selectedRadius, desiredRadius, maxReduction, assumptions) {
  const effectiveMaxReduction = Math.min(
    Number.isFinite(maxReduction) ? maxReduction : assumptions.universalMaxRadiusReductionPct,
    assumptions.universalMaxRadiusReductionPct,
  );
  if (selectedRadius < desiredRadius) {
    return false;
  }
  return desiredRadius >= selectedRadius * (1 - effectiveMaxReduction);
}

function scoreRadiusCandidate(selectedRadius, desiredRadius) {
  return (selectedRadius - desiredRadius) / Math.max(desiredRadius, 0.1);
}

function pctReduction(selectedRadius, desiredRadius) {
  return ((selectedRadius - desiredRadius) / selectedRadius) * 100;
}

function estimateRotorPrecip(set) {
  const avgFlow = (set.Q_90 * 4 + set.H_180 * 2 + set.F_360) / 7;
  const radius = Number(set.set.match(/(\d+)ft/)?.[1] ?? "25");
  return avgFlow / (Math.PI * (radius ** 2)) * 96.3;
}

function compareSprinklers(a, b) {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
}

function formatArc(arc) {
  return `${Math.round(arc)} deg`;
}

function proposeSplit(recommendations) {
  const buckets = new Map();
  for (const rec of recommendations) {
    const key = `${rec.family}-${rec.radiusClassFt}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        labels: [],
        flowGpm: 0,
      });
    }
    const bucket = buckets.get(key);
    bucket.labels.push(rec.label);
    bucket.flowGpm += rec.flowGpm;
  }

  const sorted = [...buckets.values()].sort((a, b) => b.flowGpm - a.flowGpm);
  if (sorted.length < 2) {
    return null;
  }

  return {
    primary: {
      name: `${sorted[0].key} group`,
      flowGpm: sorted[0].flowGpm,
      labels: sorted[0].labels,
    },
    secondary: {
      name: `${sorted.slice(1).map((bucket) => bucket.key).join(" + ")} group`,
      flowGpm: sorted.slice(1).reduce((sum, bucket) => sum + bucket.flowGpm, 0),
      labels: sorted.slice(1).flatMap((bucket) => bucket.labels),
    },
  };
}

function buildRotorCandidatesForHead(sprinkler, rotorData, assumptions) {
  const matchedCandidates = rotorData.matchedSets
    .filter((set) => radiusFits(set.radiusFt, sprinkler.radius, set.maxReduction, assumptions))
    .flatMap((set) => set.variants.map((variant) => ({
      label: sprinkler.label,
      x: sprinkler.x,
      y: sprinkler.y,
      zoneName: zonesById.get(sprinkler.zoneId)?.name ?? "Unassigned",
      family: "rotor",
      body: "Rain Bird 5004 PRS",
      nozzle: `${set.label}_${variant.code}`,
      nozzleType: "pre-balanced rotor",
      radiusClassFt: set.radiusFt,
      desiredRadiusFt: sprinkler.radius,
      selectedRadiusFt: set.radiusFt,
      radiusAdjustmentPct: pctReduction(set.radiusFt, sprinkler.radius),
      desiredArcDeg: sprinkler.desiredArcDeg,
      selectedArcDeg: sprinkler.desiredArcDeg,
      arcNormalized: false,
      flowGpm: variant.flowGpm,
      precipInHr: set.precipSquareInHr,
      precipGroup: `${set.precipGroup}_${variant.code}`,
      skuFamily: set.label,
      coverageReserveFt: set.radiusFt - sprinkler.radius,
      actualPrecipInHr: calculateActualPrecipInHr(variant.flowGpm, sprinkler.radius, sprinkler.desiredArcDeg),
      comment: `Pre-balanced nozzle ${set.label}_${variant.code} uses fixed ${variant.flowGpm.toFixed(2)} GPM; installed sweep stays ${Math.round(sprinkler.desiredArcDeg)} degrees and throw would be reduced ${pctReduction(set.radiusFt, sprinkler.radius).toFixed(1)}%.`,
    })))
  const standardCandidates = rotorData.standard5004
    .filter((nozzle) => radiusFits(nozzle.radiusFt, sprinkler.radius, nozzle.maxReduction, assumptions))
    .map((nozzle) => ({
      label: sprinkler.label,
      x: sprinkler.x,
      y: sprinkler.y,
      zoneName: zonesById.get(sprinkler.zoneId)?.name ?? "Unassigned",
      family: "rotor",
      body: "Rain Bird 5004 PRS",
      nozzle: nozzle.nozzle,
      nozzleType: "standard-angle rotor",
      radiusClassFt: nozzle.radiusFt,
      desiredRadiusFt: sprinkler.radius,
      selectedRadiusFt: nozzle.radiusFt,
      radiusAdjustmentPct: pctReduction(nozzle.radiusFt, sprinkler.radius),
      desiredArcDeg: sprinkler.desiredArcDeg,
      selectedArcDeg: sprinkler.desiredArcDeg,
      arcNormalized: false,
      flowGpm: nozzle.flowGpm,
      precipInHr: null,
      precipGroup: `5004_std_${nozzle.nozzle}`,
      skuFamily: "5004_standard_angle_25_deg",
      coverageReserveFt: nozzle.radiusFt - sprinkler.radius,
      actualPrecipInHr: calculateActualPrecipInHr(nozzle.flowGpm, sprinkler.radius, sprinkler.desiredArcDeg),
      comment: `Standard-angle 25 degree nozzle ${nozzle.nozzle} selected as a candidate; listed flow is used directly and the throw would be reduced ${pctReduction(nozzle.radiusFt, sprinkler.radius).toFixed(1)}%.`,
    }));
  const lowAngleCandidates = rotorData.lowAngle5004
    .filter((nozzle) => radiusFits(nozzle.radiusFt, sprinkler.radius, nozzle.maxReduction, assumptions))
    .map((nozzle) => ({
      label: sprinkler.label,
      x: sprinkler.x,
      y: sprinkler.y,
      zoneName: zonesById.get(sprinkler.zoneId)?.name ?? "Unassigned",
      family: "rotor",
      body: "Rain Bird 5004 PRS",
      nozzle: nozzle.nozzle,
      nozzleType: "low-angle rotor",
      radiusClassFt: nozzle.radiusFt,
      desiredRadiusFt: sprinkler.radius,
      selectedRadiusFt: nozzle.radiusFt,
      radiusAdjustmentPct: pctReduction(nozzle.radiusFt, sprinkler.radius),
      desiredArcDeg: sprinkler.desiredArcDeg,
      selectedArcDeg: sprinkler.desiredArcDeg,
      arcNormalized: false,
      flowGpm: nozzle.flowGpm,
      precipInHr: null,
      precipGroup: `5004_la_${nozzle.nozzle}`,
      skuFamily: "5004_low_angle_10_deg",
      coverageReserveFt: nozzle.radiusFt - sprinkler.radius,
      actualPrecipInHr: calculateActualPrecipInHr(nozzle.flowGpm, sprinkler.radius, sprinkler.desiredArcDeg),
      comment: `Low-angle 10 degree nozzle ${nozzle.nozzle} selected as a candidate; listed flow is used directly and the throw would be reduced ${pctReduction(nozzle.radiusFt, sprinkler.radius).toFixed(1)}%.`,
    }));

  const all5004Candidates = matchedCandidates
    .concat(standardCandidates, lowAngleCandidates)
    .sort((a, b) => {
      const precipDelta = a.actualPrecipInHr - b.actualPrecipInHr;
      if (precipDelta !== 0) {
        return precipDelta;
      }
      if (assumptions.preferLongerRangeRotors) {
        return b.selectedRadiusFt - a.selectedRadiusFt;
      }
      return Math.abs(a.selectedRadiusFt - a.desiredRadiusFt) - Math.abs(b.selectedRadiusFt - b.desiredRadiusFt);
    });

  if (all5004Candidates.length) {
    return all5004Candidates;
  }

  const nozzle = pickPerHeadRotorNozzle(sprinkler.radius, rotorData.standard3504, rotorData.standard3504Reduction, assumptions);
  if (!nozzle) {
    return [];
  }
  return [{
    label: sprinkler.label,
    x: sprinkler.x,
    y: sprinkler.y,
    zoneName: zonesById.get(sprinkler.zoneId)?.name ?? "Unassigned",
    family: "rotor",
    body: "Rain Bird 3504",
    nozzle: nozzle.nozzle,
    nozzleType: "adjustable rotor",
    radiusClassFt: nozzle.radiusFt,
    desiredRadiusFt: sprinkler.radius,
    selectedRadiusFt: nozzle.radiusFt,
    radiusAdjustmentPct: pctReduction(nozzle.radiusFt, sprinkler.radius),
    desiredArcDeg: sprinkler.desiredArcDeg,
    selectedArcDeg: sprinkler.desiredArcDeg,
    arcNormalized: false,
    flowGpm: nozzle.flowGpm,
    precipInHr: nozzle.precipInHr,
    precipGroup: nozzle.precipGroup,
    skuFamily: "3504_standard",
    coverageReserveFt: nozzle.radiusFt - sprinkler.radius,
    actualPrecipInHr: calculateActualPrecipInHr(nozzle.flowGpm, sprinkler.radius, sprinkler.desiredArcDeg),
    comment: "Rotor arc stays adjustable. External regulation is still needed above 55 PSI with the 3504.",
  }];
}

function optimizeRotorAssignments(candidateMatrix, assumptions) {
  let best = null;

  search(0, []);

  return best;

  function search(index, picks) {
    if (index === candidateMatrix.length) {
      const metrics = scoreRotorAssignment(picks, assumptions);
      const candidate = { recommendations: picks.map((pick) => ({ ...pick })), metrics };
      if (!best || compareRotorScores(candidate.metrics, best.metrics) < 0) {
        best = candidate;
      }
      return;
    }

    for (const candidate of candidateMatrix[index]) {
      picks.push(candidate);
      search(index + 1, picks);
      picks.pop();
    }
  }
}

function scoreZoneRecommendations(recommendations, assumptions) {
  const totalFlowGpm = recommendations.reduce((sum, recommendation) => sum + recommendation.flowGpm, 0);
  const precipValues = recommendations
    .map((recommendation) => recommendation.actualPrecipInHr)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const precipSpread = precipValues.length ? Math.max(...precipValues) - Math.min(...precipValues) : 0;
  const familyCounts = recommendations.reduce((counts, recommendation) => {
    counts[recommendation.family] = (counts[recommendation.family] ?? 0) + 1;
    return counts;
  }, { spray: 0, rotor: 0 });

  return {
    totalFlowGpm,
    flowOverageGpm: Math.max(0, totalFlowGpm - assumptions.designFlowLimitGpm),
    precipSpread,
    familyCounts,
  };
}

function scoreRotorAssignment(picks, assumptions) {
  const totalFlowGpm = picks.reduce((sum, pick) => sum + pick.flowGpm, 0);
  const actualPrecipValues = picks.map((pick) => pick.actualPrecipInHr);
  const precipSpread = actualPrecipValues.length ? Math.max(...actualPrecipValues) - Math.min(...actualPrecipValues) : 0;
  const coverageReserveFt = picks.reduce((sum, pick) => sum + pick.coverageReserveFt, 0);
  const maxAdjustmentPct = picks.reduce((max, pick) => Math.max(max, pick.radiusAdjustmentPct), 0);
  const specialtyCount = picks.filter((pick) => pick.nozzleType !== "pre-balanced rotor").length;
  const lowAngleCount = picks.filter((pick) => pick.nozzleType === "low-angle rotor").length;
  const uniqueNozzles = new Set(picks.map((pick) => pick.skuFamily ?? pick.nozzle)).size;
  const uniqueNozzleTypes = new Set(picks.map((pick) => pick.nozzleType)).size;
  const uniqueRadiusClasses = new Set(picks.map((pick) => pick.radiusClassFt)).size;
  const flowOverageGpm = Math.max(0, totalFlowGpm - assumptions.designFlowLimitGpm);
  return {
    flowOverageGpm,
    precipSpread,
    coverageReserveFt,
    totalFlowGpm,
    maxAdjustmentPct,
    specialtyCount,
    lowAngleCount,
    uniqueNozzles,
    uniqueNozzleTypes,
    uniqueRadiusClasses,
  };
}

function compareRotorScores(a, b) {
  if (a.flowOverageGpm !== b.flowOverageGpm) {
    return a.flowOverageGpm - b.flowOverageGpm;
  }
  const precipDiff = a.precipSpread - b.precipSpread;
  if (Math.abs(precipDiff) > ASSUMPTIONS.rotorSimplicityPrecipToleranceInHr) {
    return precipDiff;
  }
  if (a.specialtyCount !== b.specialtyCount) {
    return a.specialtyCount - b.specialtyCount;
  }
  if (a.lowAngleCount !== b.lowAngleCount) {
    return a.lowAngleCount - b.lowAngleCount;
  }
  if (a.uniqueNozzles !== b.uniqueNozzles) {
    return a.uniqueNozzles - b.uniqueNozzles;
  }
  if (a.uniqueNozzleTypes !== b.uniqueNozzleTypes) {
    return a.uniqueNozzleTypes - b.uniqueNozzleTypes;
  }
  if (a.uniqueRadiusClasses !== b.uniqueRadiusClasses) {
    return a.uniqueRadiusClasses - b.uniqueRadiusClasses;
  }
  if (a.precipSpread !== b.precipSpread) {
    return a.precipSpread - b.precipSpread;
  }
  if (a.coverageReserveFt !== b.coverageReserveFt) {
    return b.coverageReserveFt - a.coverageReserveFt;
  }
  if (a.totalFlowGpm !== b.totalFlowGpm) {
    return a.totalFlowGpm - b.totalFlowGpm;
  }
  return a.maxAdjustmentPct - b.maxAdjustmentPct;
}

function calculateActualPrecipInHr(flowGpm, radiusFt, arcDeg) {
  const clampedArc = Math.max(0.1, Math.min(360, arcDeg));
  const safeRadius = Math.max(0.1, radiusFt);
  const sectorAreaSqFt = Math.PI * safeRadius * safeRadius * (clampedArc / 360);
  return 96.3 * flowGpm / sectorAreaSqFt;
}
