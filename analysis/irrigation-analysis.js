import { clamp, normalizeAngle } from "../geometry/arcs.js";

const DEFAULT_ASSUMPTIONS = {
  sprayArcNormalizeToleranceDeg: 10,
  rotorSimplicityPrecipToleranceInHr: 0.01,
  zoneFamilyAutoResolvePrecipToleranceInHr: 0.03,
  universalMaxRadiusReductionPct: 0.25,
  maxExactRotorSearchStates: 250000,
  rotorBeamWidth: 160,
};

export const HEATMAP_DETAIL_OPTIONS = [
  { value: 12, label: "Fine" },
  { value: 18, label: "Balanced" },
  { value: 28, label: "Fast" },
];

export function createIrrigationAnalyzer(database, overrides = {}) {
  const assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    designFlowLimitGpm: Number(database?.system_logic_constraints?.design_flow_limit_gpm) || 14,
    ...overrides,
  };
  const sprayData = buildSprayDatabase(database?.spray_series?.rain_bird_1800_prs);
  const rotorData = buildRotorDatabase(database?.rotor_series);
  let cacheKey = "";
  let cacheValue = buildEmptySnapshot(assumptions.designFlowLimitGpm);

  return {
    getSnapshot(state) {
      const nextKey = buildCacheKey(state);
      if (nextKey === cacheKey) {
        return cacheValue;
      }
      cacheValue = analyzeProject(state, { assumptions, sprayData, rotorData });
      cacheKey = nextKey;
      return cacheValue;
    },
  };
}

function buildEmptySnapshot(designFlowLimitGpm, targetDepthInches = 1) {
  return {
    designFlowLimitGpm,
    targetDepthInches,
    recommendations: [],
    recommendationsById: {},
    compatibilityById: {},
    zones: [],
    selectedZoneId: null,
    selectedZone: null,
    grid: null,
    summary: {
      analyzedHeads: 0,
      applicationRateMaxInHr: 0,
      applicationRateAverageInHr: 0,
      wateredAreaSqFt: 0,
      fullScheduleAverageDepthInches: 0,
      fullScheduleMaxDepthInches: 0,
      overLimitZones: 0,
    },
  };
}

function buildCacheKey(state) {
  return JSON.stringify({
    scale: {
      calibrated: state.scale?.calibrated,
      pixelsPerUnit: state.scale?.pixelsPerUnit,
    },
    background: {
      width: state.background?.width,
      height: state.background?.height,
    },
    analysis: {
      targetDepthInches: state.analysis?.targetDepthInches,
    },
    view: {
      heatmapCellPx: state.view?.heatmapCellPx,
      analysisZoneId: state.view?.analysisZoneId,
    },
    ui: {
      activeZoneId: state.ui?.activeZoneId,
    },
    zones: (state.zones ?? []).map((zone) => ({
      id: zone.id,
      name: zone.name,
      color: zone.color,
      runtimeMinutes: zone.runtimeMinutes ?? null,
    })),
    sprinklers: (state.sprinklers ?? []).map((sprinkler) => ({
      id: sprinkler.id,
      x: sprinkler.x,
      y: sprinkler.y,
      radius: sprinkler.radius,
      pattern: sprinkler.pattern,
      startDeg: sprinkler.startDeg,
      sweepDeg: sprinkler.sweepDeg,
      rotationDeg: sprinkler.rotationDeg,
      hidden: sprinkler.hidden,
      label: sprinkler.label,
      zoneId: sprinkler.zoneId,
    })),
  });
}

function analyzeProject(state, context) {
  const targetDepthInches = Math.max(0.1, Number(state.analysis?.targetDepthInches) || 1);
  const zonesById = new Map((state.zones ?? []).map((zone) => [zone.id, zone]));
  const grouped = new Map();
  const sprinklersById = new Map();

  for (const sprinkler of state.sprinklers ?? []) {
    const zone = zonesById.get(sprinkler.zoneId) ?? { id: null, name: "Unassigned", color: "#777777" };
    const enriched = enrichSprinkler(sprinkler);
    sprinklersById.set(enriched.id, { sprinkler: enriched, zone });
    if (!grouped.has(zone.id ?? "__unassigned__")) {
      grouped.set(zone.id ?? "__unassigned__", { zone, sprinklers: [] });
    }
    grouped.get(zone.id ?? "__unassigned__").sprinklers.push(enriched);
  }

  const zoneReports = [...grouped.values()]
    .sort((a, b) => a.zone.name.localeCompare(b.zone.name))
    .map(({ zone, sprinklers }) => analyzeZone(zone, sprinklers, zonesById, context));

  const recommendations = zoneReports
    .flatMap((zoneReport) => zoneReport.recommendations)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));

  const recommendationsById = Object.fromEntries(
    recommendations.map((recommendation) => [recommendation.id, recommendation]),
  );

  const zoneReportsById = new Map(zoneReports.map((zoneReport) => [zoneReport.zone.id ?? "__unassigned__", zoneReport]));
  const grid = buildAnalysisGrid(state, recommendations, state.zones ?? [], targetDepthInches);
  const zoneSummaries = (state.zones ?? []).map((zone) => {
    const report = zoneReportsById.get(zone.id) ?? null;
    const rateLayer = grid?.zoneRateLayers.find((layer) => layer.zoneId === zone.id) ?? null;
    const depthLayer = grid?.zoneDepthLayers.find((layer) => layer.zoneId === zone.id) ?? null;
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      zoneColor: zone.color,
      totalFlowGpm: report?.totalFlowGpm ?? 0,
      precipSpreadInHr: report?.precipSpreadInHr ?? 0,
      headCount: report?.recommendations.length ?? 0,
      preferredFamily: report?.preferredFamily ?? "mixed",
      sprayHeadCount: report?.familyCounts?.spray ?? 0,
      rotorHeadCount: report?.familyCounts?.rotor ?? 0,
      isOverLimit: (report?.totalFlowGpm ?? 0) > context.assumptions.designFlowLimitGpm,
      notes: report?.notes ?? [],
      runtimeMinutesOverride: Number.isFinite(Number(zone.runtimeMinutes)) && Number(zone.runtimeMinutes) > 0
        ? Number(zone.runtimeMinutes)
        : null,
      suggestedRuntimeMinutes: depthLayer?.suggestedRuntimeMinutes ?? null,
      effectiveRuntimeMinutes: depthLayer?.effectiveRuntimeMinutes ?? null,
      averageRateInHr: rateLayer?.averageInHr ?? 0,
      minPositiveRateInHr: rateLayer?.minPositiveInHr ?? 0,
      maxRateInHr: rateLayer?.maxInHr ?? 0,
      wateredAreaSqFt: rateLayer?.wateredAreaSqFt ?? 0,
      averageDepthInches: depthLayer?.averageInches ?? 0,
      minPositiveDepthInches: depthLayer?.minPositiveInches ?? 0,
      maxDepthInches: depthLayer?.maxInches ?? 0,
    };
  });
  const selectedZoneId = resolveAnalysisZoneId(state, zoneSummaries);
  const selectedZone = zoneSummaries.find((zone) => zone.zoneId === selectedZoneId) ?? null;
  const compatibilityById = Object.fromEntries(
    recommendations.map((recommendation) => {
      const sprinklerRecord = sprinklersById.get(recommendation.id) ?? null;
      const report = zoneReportsById.get(recommendation.zoneId ?? "__unassigned__") ?? null;
      return [recommendation.id, buildZoneCompatibility(
        recommendation,
        sprinklerRecord?.sprinkler ?? null,
        sprinklerRecord?.zone ?? null,
        report,
        zonesById,
        context,
      )];
    }),
  );

  return {
    designFlowLimitGpm: context.assumptions.designFlowLimitGpm,
    targetDepthInches,
    recommendations,
    recommendationsById,
    compatibilityById,
    zones: zoneSummaries,
    selectedZoneId,
    selectedZone,
    grid,
    summary: {
      analyzedHeads: recommendations.length,
      applicationRateMaxInHr: grid?.applicationRate.maxInHr ?? 0,
      applicationRateAverageInHr: grid?.applicationRate.averageInHr ?? 0,
      wateredAreaSqFt: grid?.applicationRate.wateredAreaSqFt ?? 0,
      fullScheduleAverageDepthInches: grid?.fullScheduleDepth.averageInches ?? 0,
      fullScheduleMaxDepthInches: grid?.fullScheduleDepth.maxInches ?? 0,
      overLimitZones: zoneSummaries.filter((zone) => zone.isOverLimit).length,
    },
  };
}

function resolveAnalysisZoneId(state, zoneSummaries) {
  const preferredIds = [
    state.view?.analysisZoneId,
    state.ui?.activeZoneId,
    zoneSummaries[0]?.zoneId ?? null,
  ];
  return preferredIds.find((zoneId) => zoneId && zoneSummaries.some((zone) => zone.zoneId === zoneId)) ?? null;
}

function enrichSprinkler(sprinkler) {
  const desiredArcDeg = sprinkler.pattern === "full" || sprinkler.sweepDeg >= 360 ? 360 : sprinkler.sweepDeg;
  return {
    ...sprinkler,
    desiredArcDeg,
    startDeg: normalizeAngle(Number(sprinkler.startDeg ?? 0) + Number(sprinkler.rotationDeg ?? 0)),
  };
}

function analyzeZone(zone, sprinklers, zonesById, context) {
  const sprays = sprinklers.filter((sprinkler) =>
    sprinklerCanUseSpray(sprinkler, context.sprayData, context.assumptions),
  );
  const rotors = sprinklers.filter((sprinkler) =>
    !sprinklerCanUseSpray(sprinkler, context.sprayData, context.assumptions),
  );
  const baselineRecommendations = [];
  const baselineNotes = [];

  for (const sprinkler of sprays.sort(compareSprinklers)) {
    baselineRecommendations.push(recommendSpray(sprinkler, zone, zonesById, context));
  }

  if (rotors.length) {
    const rotorZone = recommendRotorZone(rotors.sort(compareSprinklers), zone, zonesById, context);
    baselineRecommendations.push(...rotorZone.recommendations);
    baselineNotes.push(...rotorZone.notes);
  }

  const baselineMetrics = scoreZoneRecommendations(baselineRecommendations, context.assumptions);
  const baselinePreferredFamily = determinePreferredZoneFamily(baselineMetrics.familyCounts);
  const familyResolution = baselinePreferredFamily !== "mixed"
    ? tryAutoResolveZoneFamily(
      baselinePreferredFamily,
      baselineRecommendations,
      sprinklers,
      zone,
      zonesById,
      context,
    )
    : null;

  const recommendations = familyResolution?.applied
    ? familyResolution.recommendations
    : baselineRecommendations;
  const notes = familyResolution?.applied
    ? [...familyResolution.notes]
    : [...baselineNotes, ...(familyResolution?.notes ?? [])];

  const finalMetrics = scoreZoneRecommendations(recommendations, context.assumptions);
  const familyCounts = finalMetrics.familyCounts;
  const preferredFamily = determinePreferredZoneFamily(familyCounts);

  if (familyCounts.spray > 0 && familyCounts.rotor > 0) {
    notes.unshift("Mixed spray and rotor families in one zone will usually water unevenly.");
  }

  const totalFlowGpm = finalMetrics.totalFlowGpm;
  const precipSpreadInHr = finalMetrics.precipSpread;

  if (totalFlowGpm > context.assumptions.designFlowLimitGpm) {
    notes.push(
      `Zone flow is ${(totalFlowGpm - context.assumptions.designFlowLimitGpm).toFixed(2)} GPM over the ${context.assumptions.designFlowLimitGpm.toFixed(2)} GPM cap.`,
    );
  }

  return {
    zone,
    totalFlowGpm,
    precipSpreadInHr,
    familyCounts,
    preferredFamily,
    recommendations,
    notes,
  };
}

function recommendSpray(sprinkler, zone, zonesById, context) {
  const desiredRadius = sprinkler.radius;
  const desiredArc = sprinkler.desiredArcDeg;
  const radiusClass = pickRadiusClass(
    desiredRadius,
    context.sprayData.radiusClasses,
    context.sprayData.maxRadiusReduction,
    context.assumptions,
  );

  if (!radiusClass) {
    const fallbackRadius = context.sprayData.radiusClasses
      .filter((candidate) => candidate >= desiredRadius)
      .sort((a, b) => a - b)[0] ?? context.sprayData.radiusClasses.at(-1);
    const variable = context.sprayData.variableByRadius.get(fallbackRadius);
    return buildRecommendationBase(sprinkler, zone, zonesById, {
      family: "spray",
      body: "Rain Bird 1800 PRS",
      nozzle: variable.model,
      nozzleType: "variable",
      skuFamily: variable.model,
      radiusClassFt: fallbackRadius,
      selectedRadiusFt: variable.maxRadiusFt,
      flowGpm: calculateAdjustableSprayFlow(variable, desiredArc),
      catalogPrecipInHr: variable.precipInHr,
      comment: "Nearest larger variable nozzle used as fallback.",
    });
  }

  const normalizedArc = nearestFixedArc(desiredArc);
  const fixed = context.sprayData.fixedByRadius.get(radiusClass)?.get(normalizedArc);
  if (fixed && Math.abs(desiredArc - normalizedArc) <= context.assumptions.sprayArcNormalizeToleranceDeg) {
    return buildRecommendationBase(sprinkler, zone, zonesById, {
      family: "spray",
      body: "Rain Bird 1800 PRS",
      nozzle: fixed.series,
      nozzleType: "fixed",
      skuFamily: fixed.series,
      radiusClassFt: radiusClass,
      selectedRadiusFt: fixed.radiusFt,
      flowGpm: fixed.flowGpm,
      catalogPrecipInHr: fixed.precipInHr,
      selectedArcDeg: normalizedArc,
      arcNormalized: normalizedArc !== desiredArc,
      comment: `Fixed arc ${fixed.series} normalized to ${normalizedArc} degrees.`,
    });
  }

  const variable = context.sprayData.variableByRadius.get(radiusClass);
  return buildRecommendationBase(sprinkler, zone, zonesById, {
    family: "spray",
    body: "Rain Bird 1800 PRS",
    nozzle: variable.model,
    nozzleType: "variable",
    skuFamily: variable.model,
    radiusClassFt: radiusClass,
    selectedRadiusFt: variable.maxRadiusFt,
    flowGpm: calculateAdjustableSprayFlow(variable, desiredArc),
    catalogPrecipInHr: variable.precipInHr,
    comment: "Variable arc kept because the drawn arc is not close to a fixed spray pattern.",
  });
}

function recommendRotorZone(rotors, zone, zonesById, context) {
  const candidateMatrix = rotors.map((sprinkler) => buildRotorCandidatesForHead(sprinkler, zone, zonesById, context));
  const notes = [];

  if (candidateMatrix.some((candidates) => candidates.length === 0)) {
    notes.push("At least one rotor has no valid nozzle under the current radius rules.");
    return { recommendations: candidateMatrix.flat(), notes };
  }

  const optimized = optimizeRotorAssignments(candidateMatrix, context.assumptions);
  if (optimized.searchMode === "beam") {
    notes.push("Rotor mix used beam search to keep the in-app optimizer responsive.");
  }

  notes.push(
    `Rotor zone target spread ${optimized.metrics.precipSpread.toFixed(3)} in/hr at ${optimized.metrics.totalFlowGpm.toFixed(2)} GPM using ${optimized.metrics.uniqueFamilies} family SKU${optimized.metrics.uniqueFamilies === 1 ? "" : "s"}.`,
  );

  return { recommendations: optimized.recommendations, notes };
}

function tryAutoResolveZoneFamily(preferredFamily, baselineRecommendations, sprinklers, zone, zonesById, context) {
  const baselineMetrics = scoreZoneRecommendations(baselineRecommendations, context.assumptions);
  const outlierCount = baselineRecommendations.filter((recommendation) => recommendation.family !== preferredFamily).length;
  if (!outlierCount) {
    return { applied: false, recommendations: baselineRecommendations, notes: [] };
  }

  const uniformZone = buildUniformZoneRecommendations(preferredFamily, sprinklers, zone, zonesById, context);
  if (!uniformZone) {
    return { applied: false, recommendations: baselineRecommendations, notes: [] };
  }

  const uniformMetrics = scoreZoneRecommendations(uniformZone.recommendations, context.assumptions);
  const withinFlowTolerance = uniformMetrics.flowOverageGpm <= baselineMetrics.flowOverageGpm;
  const withinPrecipTolerance =
    uniformMetrics.precipSpread <= baselineMetrics.precipSpread + context.assumptions.zoneFamilyAutoResolvePrecipToleranceInHr;

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
    notes.push("Zone-family auto-resolution used beam search to keep the in-app optimizer responsive.");
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

function buildUniformZoneRecommendations(preferredFamily, sprinklers, zone, zonesById, context) {
  const sortedSprinklers = [...sprinklers].sort(compareSprinklers);
  if (preferredFamily === "spray") {
    if (sortedSprinklers.some((sprinkler) => !sprinklerCanUseSpray(sprinkler, context.sprayData, context.assumptions))) {
      return null;
    }
    return {
      recommendations: sortedSprinklers.map((sprinkler) => recommendSpray(sprinkler, zone, zonesById, context)),
      searchMode: "direct",
    };
  }

  if (preferredFamily === "rotor") {
    const candidateMatrix = sortedSprinklers.map((sprinkler) => buildRotorCandidatesForHead(sprinkler, zone, zonesById, context));
    if (candidateMatrix.some((candidates) => candidates.length === 0)) {
      return null;
    }
    const optimized = optimizeRotorAssignments(candidateMatrix, context.assumptions);
    return {
      recommendations: optimized.recommendations,
      searchMode: optimized.searchMode,
    };
  }

  return null;
}

function optimizeRotorAssignments(candidateMatrix, assumptions) {
  const totalCombinations = candidateMatrix.reduce((product, candidates) => product * Math.max(candidates.length, 1), 1);
  if (totalCombinations <= assumptions.maxExactRotorSearchStates) {
    return optimizeRotorAssignmentsExact(candidateMatrix, assumptions);
  }
  return optimizeRotorAssignmentsBeam(candidateMatrix, assumptions);
}

function optimizeRotorAssignmentsExact(candidateMatrix, assumptions) {
  let best = null;

  search(0, []);

  return { ...best, searchMode: "exact" };

  function search(index, picks) {
    if (index === candidateMatrix.length) {
      const metrics = scoreRotorAssignment(picks, assumptions);
      const candidate = { recommendations: picks.map(cloneRecommendation), metrics };
      if (!best || compareRotorScores(candidate.metrics, best.metrics, assumptions) < 0) {
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

function optimizeRotorAssignmentsBeam(candidateMatrix, assumptions) {
  let beams = [{ picks: [], metrics: scoreRotorAssignment([], assumptions) }];

  for (const candidates of candidateMatrix) {
    const next = [];
    for (const beam of beams) {
      for (const candidate of candidates) {
        const picks = beam.picks.concat(candidate);
        next.push({ picks, metrics: scoreRotorAssignment(picks, assumptions) });
      }
    }
    next.sort((a, b) => compareRotorScores(a.metrics, b.metrics, assumptions));
    beams = next.slice(0, assumptions.rotorBeamWidth);
  }

  const best = beams[0] ?? { picks: [], metrics: scoreRotorAssignment([], assumptions) };
  return {
    recommendations: best.picks.map(cloneRecommendation),
    metrics: best.metrics,
    searchMode: "beam",
  };
}

function buildRecommendationBase(sprinkler, zone, zonesById, details) {
  const installedArcDeg = details.selectedArcDeg ?? sprinkler.desiredArcDeg;
  const flowGpm = Number(details.flowGpm) || 0;
  const actualPrecipInHr = calculateActualPrecipInHr(flowGpm, sprinkler.radius, installedArcDeg);

  return {
    id: sprinkler.id,
    label: sprinkler.label,
    zoneId: sprinkler.zoneId ?? zone.id ?? null,
    zoneName: zonesById.get(sprinkler.zoneId)?.name ?? zone.name ?? "Unassigned",
    zoneColor: zonesById.get(sprinkler.zoneId)?.color ?? zone.color ?? "#777777",
    hidden: Boolean(sprinkler.hidden),
    x: sprinkler.x,
    y: sprinkler.y,
    startDeg: sprinkler.startDeg,
    sweepDeg: installedArcDeg,
    pattern: sprinkler.pattern,
    family: details.family,
    body: details.body,
    nozzle: details.nozzle,
    nozzleType: details.nozzleType,
    skuFamily: details.skuFamily ?? details.nozzle,
    radiusClassFt: details.radiusClassFt,
    desiredRadiusFt: sprinkler.radius,
    selectedRadiusFt: details.selectedRadiusFt,
    radiusAdjustmentPct: pctReduction(details.selectedRadiusFt, sprinkler.radius),
    desiredArcDeg: sprinkler.desiredArcDeg,
    selectedArcDeg: installedArcDeg,
    arcNormalized: Boolean(details.arcNormalized),
    flowGpm,
    catalogPrecipInHr: details.catalogPrecipInHr ?? null,
    actualPrecipInHr,
    coverageReserveFt: Math.max(0, details.selectedRadiusFt - sprinkler.radius),
    comment: details.comment,
  };
}

function buildSprayDatabase(series) {
  const fixedByRadius = new Map();
  for (const nozzle of series?.u_series_fixed_mpr ?? []) {
    const radius = Number(nozzle.radius_ft);
    if (!fixedByRadius.has(radius)) {
      fixedByRadius.set(radius, new Map());
    }
    fixedByRadius.get(radius).set(Number(nozzle.arc), {
      series: nozzle.series,
      radiusFt: Number(nozzle.radius_ft),
      flowGpm: Number(nozzle.flow_gpm),
      precipInHr: Number(nozzle.precip_in_hr),
    });
  }

  const variableByRadius = new Map();
  for (const nozzle of series?.he_van_high_efficiency ?? []) {
    variableByRadius.set(Number(nozzle.max_radius_ft), createAdjustableSprayEntry(nozzle));
  }

  for (const nozzle of series?.van_series_variable_arc ?? []) {
    variableByRadius.set(Number(nozzle.max_radius_ft), createAdjustableSprayEntry(nozzle));
  }

  return {
    maxRadiusReduction: Number(series?.mechanical_specs?.max_radius_reduction_pct ?? 25) / 100,
    radiusClasses: [...new Set([...fixedByRadius.keys(), ...variableByRadius.keys()])].sort((a, b) => a - b),
    fixedByRadius,
    variableByRadius,
  };
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
  const flowAt360 = anchors.at(-1)?.flowGpm ?? Number(nozzle.flow_gpm_360) ?? 0;
  return {
    model: nozzle.model,
    maxRadiusFt: Number(nozzle.max_radius_ft),
    flowAt360,
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
  const clampedArcDeg = clamp(Number(desiredArcDeg) || 0, 0, 360);

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
  if (sprayCount > 0 || rotorCount > 0) {
    return "mixed";
  }
  return "mixed";
}

function buildRotorDatabase(rotorSeries) {
  const prsSeries = rotorSeries?.rain_bird_5004_prs ?? {};
  const standard3504 = rotorSeries?.rain_bird_3504?.standard_nozzles ?? [];

  const matchedSets = (prsSeries.mpr_pre_balanced_sets ?? []).map((set) => {
    const radiusFt = Number(set.set?.match(/(\d+)ft/)?.[1] ?? 0);
    return {
      label: set.set,
      radiusFt,
      maxReduction: Number(prsSeries.mechanical_specs?.max_radius_reduction_pct ?? 25) / 100,
      variants: [
        { code: "Q_90", flowGpm: Number(set.Q_90), nominalArcDeg: 90 },
        ...(Number.isFinite(Number(set.T_120)) ? [{ code: "T_120", flowGpm: Number(set.T_120), nominalArcDeg: 120 }] : []),
        { code: "H_180", flowGpm: Number(set.H_180), nominalArcDeg: 180 },
        { code: "F_360", flowGpm: Number(set.F_360), nominalArcDeg: 360 },
      ],
    };
  });

  return {
    matchedSets,
    standard5004: (prsSeries.standard_angle_25_deg ?? []).map((nozzle) => ({
      nozzle: nozzle.nozzle,
      radiusFt: Number(nozzle.radius_ft),
      flowGpm: Number(nozzle.flow_gpm),
      angleFamily: "standard_angle_25_deg",
      maxReduction: Number(prsSeries.mechanical_specs?.max_radius_reduction_pct ?? 25) / 100,
    })),
    lowAngle5004: (prsSeries.low_angle_10_deg ?? []).map((nozzle) => ({
      nozzle: nozzle.nozzle,
      radiusFt: Number(nozzle.radius_ft),
      flowGpm: Number(nozzle.flow_gpm),
      angleFamily: "low_angle_10_deg",
      maxReduction: Number(prsSeries.mechanical_specs?.max_radius_reduction_pct ?? 25) / 100,
    })),
    standard3504: standard3504.map((nozzle) => ({
      nozzle: nozzle.nozzle,
      radiusFt: Number(nozzle.radius_ft),
      flowGpm: Number(nozzle.flow_gpm),
      precipInHr: Number(nozzle.precip_in_hr_square),
    })),
    standard3504Reduction: Number(rotorSeries?.rain_bird_3504?.mechanical_specs?.max_radius_reduction_pct ?? 35) / 100,
  };
}

function buildRotorCandidatesForHead(sprinkler, zone, zonesById, context) {
  const matchedCandidates = context.rotorData.matchedSets
    .filter((set) => radiusFits(set.radiusFt, sprinkler.radius, set.maxReduction, context.assumptions))
    .flatMap((set) => set.variants.map((variant) => buildRecommendationBase(sprinkler, zone, zonesById, {
      family: "rotor",
      body: "Rain Bird 5004 PRS",
      nozzle: `${set.label}_${variant.code}`,
      nozzleType: "pre-balanced rotor",
      skuFamily: set.label,
      radiusClassFt: set.radiusFt,
      selectedRadiusFt: set.radiusFt,
      flowGpm: variant.flowGpm,
      comment: `Pre-balanced ${set.label} ${variant.code} nozzle.`,
    })));

  const standardCandidate = pickPerHeadRotorNozzle(
    sprinkler.radius,
    context.rotorData.standard5004,
    context.assumptions.universalMaxRadiusReductionPct,
    context.assumptions,
  );
  const lowAngleCandidate = pickPerHeadRotorNozzle(
    sprinkler.radius,
    context.rotorData.lowAngle5004,
    context.assumptions.universalMaxRadiusReductionPct,
    context.assumptions,
  );

  const specialtyCandidates = [];
  if (standardCandidate) {
    specialtyCandidates.push(buildRecommendationBase(sprinkler, zone, zonesById, {
      family: "rotor",
      body: "Rain Bird 5004 PRS",
      nozzle: standardCandidate.nozzle,
      nozzleType: "standard-angle rotor",
      skuFamily: "5004_standard_angle_25_deg",
      radiusClassFt: standardCandidate.radiusFt,
      selectedRadiusFt: standardCandidate.radiusFt,
      flowGpm: standardCandidate.flowGpm,
      comment: `Standard-angle 25 degree ${standardCandidate.nozzle}.`,
    }));
  }
  if (lowAngleCandidate) {
    specialtyCandidates.push(buildRecommendationBase(sprinkler, zone, zonesById, {
      family: "rotor",
      body: "Rain Bird 5004 PRS",
      nozzle: lowAngleCandidate.nozzle,
      nozzleType: "low-angle rotor",
      skuFamily: "5004_low_angle_10_deg",
      radiusClassFt: lowAngleCandidate.radiusFt,
      selectedRadiusFt: lowAngleCandidate.radiusFt,
      flowGpm: lowAngleCandidate.flowGpm,
      comment: `Low-angle 10 degree ${lowAngleCandidate.nozzle}.`,
    }));
  }

  const candidates = pruneRotorCandidates(matchedCandidates.concat(specialtyCandidates), sprinkler.radius);
  if (candidates.length) {
    return candidates;
  }

  const fallback3504 = pickPerHeadRotorNozzle(
    sprinkler.radius,
    context.rotorData.standard3504,
    context.rotorData.standard3504Reduction,
    context.assumptions,
  );
  if (!fallback3504) {
    return [];
  }
  return [buildRecommendationBase(sprinkler, zone, zonesById, {
    family: "rotor",
    body: "Rain Bird 3504",
    nozzle: fallback3504.nozzle,
    nozzleType: "adjustable rotor",
    skuFamily: "3504_standard",
    radiusClassFt: fallback3504.radiusFt,
    selectedRadiusFt: fallback3504.radiusFt,
    flowGpm: fallback3504.flowGpm * (sprinkler.desiredArcDeg / 360),
    catalogPrecipInHr: fallback3504.precipInHr,
    comment: "3504 fallback rotor.",
  })];
}

function buildZoneCompatibility(recommendation, sprinkler, zone, zoneReport, zonesById, context) {
  if (!recommendation || !sprinkler) {
    return null;
  }

  const assignedZone = zone?.id ? zone : { id: null, name: "Unassigned", color: "#777777" };
  const sprayFit = describeSprayFit(sprinkler, context.sprayData, context.assumptions);
  const rotorFit = describeRotorFit(sprinkler, assignedZone, zonesById, context);
  const preferredFamily = zoneReport?.preferredFamily ?? "mixed";
  const familyCounts = zoneReport?.familyCounts ?? { spray: 0, rotor: 0 };

  if (!assignedZone.id) {
    return {
      status: "info",
      zonePreferredFamily: "mixed",
      familyCounts,
      headline: "Assign this head to a zone to review family compatibility.",
      detail: buildFitSummaryLine(sprayFit, rotorFit),
      suggestions: [
        "Assign the sprinkler to a zone before relying on the recommended family.",
      ],
      preferredFitLabel: null,
      alternateFitLabel: null,
    };
  }

  if (preferredFamily === "mixed") {
    return {
      status: familyCounts.spray > 0 && familyCounts.rotor > 0 ? "warning" : "info",
      zonePreferredFamily: "mixed",
      familyCounts,
      headline: `${assignedZone.name} currently mixes spray and rotor families.`,
      detail: `This head is currently modeled as ${recommendation.family}. ${buildFitSummaryLine(sprayFit, rotorFit)}`,
      suggestions: [
        "Try to keep a zone on one family when possible.",
        "If this head is the outlier, move it or split the zone rather than mixing spray and rotor.",
      ],
      preferredFitLabel: null,
      alternateFitLabel: recommendation.family === "spray" ? rotorFit.label : sprayFit.label,
    };
  }

  const preferredFit = preferredFamily === "spray" ? sprayFit : rotorFit;
  const alternateFit = preferredFamily === "spray" ? rotorFit : sprayFit;
  const countsLabel = `${familyCounts.spray} spray / ${familyCounts.rotor} rotor`;

  if (recommendation.family === preferredFamily) {
    return {
      status: "ok",
      zonePreferredFamily: preferredFamily,
      familyCounts,
      headline: `Fits the ${preferredFamily}-dominant zone family.`,
      detail: `${assignedZone.name} is currently ${countsLabel}. This head stays in-family with ${recommendation.body} ${recommendation.nozzle}.`,
      suggestions: preferredFit.canFit
        ? [`Preferred family fit: ${preferredFit.label}.`]
        : [],
      preferredFitLabel: preferredFit.label,
      alternateFitLabel: alternateFit.label,
    };
  }

  if (preferredFit.canFit) {
    return {
      status: "warning",
      zonePreferredFamily: preferredFamily,
      familyCounts,
      headline: `${capitalize(preferredFamily)} fit is available, but this head is crossing families.`,
      detail: `${assignedZone.name} is ${countsLabel}. Current recommendation is ${recommendation.body} ${recommendation.nozzle}, while the best ${preferredFamily} fit is ${preferredFit.label}.`,
      suggestions: [
        `Prefer ${preferredFamily} here to keep the zone uniform unless there is a strong design reason not to.`,
        "Review neighboring heads and precipitation balance before accepting the mismatch.",
      ],
      preferredFitLabel: preferredFit.label,
      alternateFitLabel: alternateFit.label,
    };
  }

  return {
    status: "error",
    zonePreferredFamily: preferredFamily,
    familyCounts,
    headline: `No valid ${preferredFamily} fit exists for this head.`,
    detail: `${assignedZone.name} is ${countsLabel}. Current recommendation uses ${recommendation.family}, because a ${preferredFamily} option does not meet the radius/reduction rules. ${buildFitSummaryLine(sprayFit, rotorFit)}`,
    suggestions: [
      "Move or resize this head so it can fit the zone family.",
      "Split the zone if this radius needs to stay different from the dominant family.",
      "Treat the mixed-family recommendation as a last-resort compromise.",
    ],
    preferredFitLabel: null,
    alternateFitLabel: alternateFit.label,
  };
}

function describeSprayFit(sprinkler, sprayData, assumptions) {
  const radiusClass = pickRadiusClass(
    sprinkler.radius,
    sprayData.radiusClasses,
    sprayData.maxRadiusReduction,
    assumptions,
  );
  if (!radiusClass) {
    return { canFit: false, label: "No valid spray fit" };
  }
  const normalizedArc = nearestFixedArc(sprinkler.desiredArcDeg);
  const fixed = sprayData.fixedByRadius.get(radiusClass)?.get(normalizedArc) ?? null;
  if (fixed && Math.abs(sprinkler.desiredArcDeg - normalizedArc) <= assumptions.sprayArcNormalizeToleranceDeg) {
    return { canFit: true, label: `Rain Bird 1800 PRS ${fixed.series}` };
  }
  const variable = sprayData.variableByRadius.get(radiusClass) ?? null;
  return variable
    ? { canFit: true, label: `Rain Bird 1800 PRS ${variable.model}` }
    : { canFit: false, label: "No valid spray fit" };
}

function describeRotorFit(sprinkler, zone, zonesById, context) {
  const candidates = buildRotorCandidatesForHead(sprinkler, zone, zonesById, context);
  const bestCandidate = candidates[0] ?? null;
  return bestCandidate
    ? { canFit: true, label: `${bestCandidate.body} ${bestCandidate.nozzle}` }
    : { canFit: false, label: "No valid rotor fit" };
}

function buildFitSummaryLine(sprayFit, rotorFit) {
  return `Spray fit: ${sprayFit.label}. Rotor fit: ${rotorFit.label}.`;
}

function capitalize(value) {
  return typeof value === "string" && value.length
    ? `${value[0].toUpperCase()}${value.slice(1)}`
    : value;
}

function pruneRotorCandidates(candidates, desiredRadiusFt) {
  if (!candidates.length) {
    return [];
  }

  const preBalancedFamilies = [...new Set(
    candidates
      .filter((candidate) => candidate.nozzleType === "pre-balanced rotor")
      .sort((a, b) => compareRadiusPreference(a.selectedRadiusFt, b.selectedRadiusFt, desiredRadiusFt))
      .map((candidate) => candidate.skuFamily),
  )].slice(0, 2);

  const kept = candidates.filter((candidate) => {
    if (candidate.nozzleType === "pre-balanced rotor") {
      return preBalancedFamilies.includes(candidate.skuFamily);
    }
    return true;
  });

  return kept.sort((a, b) => compareRadiusPreference(a.selectedRadiusFt, b.selectedRadiusFt, desiredRadiusFt));
}

function compareRadiusPreference(radiusA, radiusB, desiredRadiusFt) {
  return scoreRadiusCandidate(radiusA, desiredRadiusFt) - scoreRadiusCandidate(radiusB, desiredRadiusFt);
}

function pickRadiusClass(desiredRadius, radiusClasses, maxReduction, assumptions) {
  const candidates = (radiusClasses ?? []).filter((radiusClass) =>
    radiusFits(radiusClass, desiredRadius, maxReduction, assumptions),
  );
  return candidates.reduce(
    (best, current) =>
      best === null || scoreRadiusCandidate(current, desiredRadius) < scoreRadiusCandidate(best, desiredRadius)
        ? current
        : best,
    null,
  );
}

function pickPerHeadRotorNozzle(desiredRadius, nozzles, maxReduction, assumptions) {
  const candidates = (nozzles ?? []).filter((nozzle) =>
    radiusFits(nozzle.radiusFt, desiredRadius, maxReduction, assumptions),
  );
  return candidates.reduce(
    (best, current) =>
      best === null || scoreRadiusCandidate(current.radiusFt, desiredRadius) < scoreRadiusCandidate(best.radiusFt, desiredRadius)
        ? current
        : best,
    null,
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

function nearestFixedArc(arc) {
  return [90, 180, 360].reduce((best, current) =>
    Math.abs(current - arc) < Math.abs(best - arc) ? current : best,
  );
}

function pctReduction(selectedRadius, desiredRadius) {
  return ((selectedRadius - desiredRadius) / Math.max(selectedRadius, 0.1)) * 100;
}

function scoreRotorAssignment(picks, assumptions) {
  const totalFlowGpm = picks.reduce((sum, pick) => sum + pick.flowGpm, 0);
  const actualPrecipValues = picks
    .map((pick) => pick.actualPrecipInHr)
    .filter((value) => Number.isFinite(value));
  const precipSpread = actualPrecipValues.length
    ? Math.max(...actualPrecipValues) - Math.min(...actualPrecipValues)
    : 0;

  return {
    flowOverageGpm: Math.max(0, totalFlowGpm - assumptions.designFlowLimitGpm),
    totalFlowGpm,
    precipSpread,
    specialtyCount: picks.filter((pick) => pick.nozzleType !== "pre-balanced rotor").length,
    lowAngleCount: picks.filter((pick) => pick.nozzleType === "low-angle rotor").length,
    uniqueFamilies: new Set(picks.map((pick) => pick.skuFamily)).size,
    uniqueNozzleTypes: new Set(picks.map((pick) => pick.nozzleType)).size,
    coverageReserveFt: picks.reduce((sum, pick) => sum + pick.coverageReserveFt, 0),
    maxAdjustmentPct: picks.reduce((max, pick) => Math.max(max, pick.radiusAdjustmentPct), 0),
  };
}

function scoreZoneRecommendations(recommendations, assumptions) {
  const totalFlowGpm = recommendations.reduce((sum, recommendation) => sum + recommendation.flowGpm, 0);
  const actualPrecipValues = recommendations
    .map((recommendation) => recommendation.actualPrecipInHr)
    .filter((value) => Number.isFinite(value));
  const precipSpread = actualPrecipValues.length
    ? Math.max(...actualPrecipValues) - Math.min(...actualPrecipValues)
    : 0;
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

function compareRotorScores(a, b, assumptions) {
  if (a.flowOverageGpm !== b.flowOverageGpm) {
    return a.flowOverageGpm - b.flowOverageGpm;
  }
  if (Math.abs(a.precipSpread - b.precipSpread) > assumptions.rotorSimplicityPrecipToleranceInHr) {
    return a.precipSpread - b.precipSpread;
  }
  if (a.specialtyCount !== b.specialtyCount) {
    return a.specialtyCount - b.specialtyCount;
  }
  if (a.lowAngleCount !== b.lowAngleCount) {
    return a.lowAngleCount - b.lowAngleCount;
  }
  if (a.uniqueFamilies !== b.uniqueFamilies) {
    return a.uniqueFamilies - b.uniqueFamilies;
  }
  if (a.uniqueNozzleTypes !== b.uniqueNozzleTypes) {
    return a.uniqueNozzleTypes - b.uniqueNozzleTypes;
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

function buildAnalysisGrid(state, recommendations, zones, targetDepthInches) {
  if (!state.scale?.calibrated || !Number(state.scale.pixelsPerUnit) || !recommendations.length) {
    return null;
  }

  const visibleRecommendations = recommendations.filter((recommendation) => !recommendation.hidden);
  if (!visibleRecommendations.length) {
    return null;
  }

  const cellSizeWorldPx = Number(state.view?.heatmapCellPx) || 18;
  const bounds = resolveHeatmapBounds(state, visibleRecommendations);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const cols = Math.max(1, Math.ceil(bounds.width / cellSizeWorldPx));
  const rows = Math.max(1, Math.ceil(bounds.height / cellSizeWorldPx));
  const pixelsPerUnit = Number(state.scale.pixelsPerUnit);
  const cellAreaSqFt = (cellSizeWorldPx / pixelsPerUnit) ** 2;
  const applicationRateValues = new Float32Array(cols * rows);
  const zoneRateLayers = zones
    .map((zone) => ({
      zoneId: zone.id,
      zoneName: zone.name,
      zoneColor: zone.color,
      recommendations: visibleRecommendations.filter((recommendation) => recommendation.zoneId === zone.id),
      values: new Float32Array(cols * rows),
    }))
    .filter((zoneLayer) => zoneLayer.recommendations.length);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cellIndex = row * cols + col;
      const x = bounds.x + (col + 0.5) * cellSizeWorldPx;
      const y = bounds.y + (row + 0.5) * cellSizeWorldPx;
      let totalRateInHr = 0;

      for (const recommendation of visibleRecommendations) {
        if (pointFallsWithinSector(x, y, recommendation, pixelsPerUnit)) {
          totalRateInHr += recommendation.actualPrecipInHr;
        }
      }
      applicationRateValues[cellIndex] = totalRateInHr;

      for (const zoneLayer of zoneRateLayers) {
        let zoneRateInHr = 0;
        for (const recommendation of zoneLayer.recommendations) {
          if (pointFallsWithinSector(x, y, recommendation, pixelsPerUnit)) {
            zoneRateInHr += recommendation.actualPrecipInHr;
          }
        }
        zoneLayer.values[cellIndex] = zoneRateInHr;
      }
    }
  }

  const applicationRate = {
    values: applicationRateValues,
    ...summarizePositiveGrid(applicationRateValues, cellAreaSqFt),
  };

  const summarizedZoneRateLayers = zoneRateLayers.map((zoneLayer) => ({
    zoneId: zoneLayer.zoneId,
    zoneName: zoneLayer.zoneName,
    zoneColor: zoneLayer.zoneColor,
    values: zoneLayer.values,
    ...summarizePositiveGrid(zoneLayer.values, cellAreaSqFt),
  }));

  const zoneDepthLayers = summarizedZoneRateLayers.map((zoneLayer) => {
    const zoneModel = zones.find((zone) => zone.id === zoneLayer.zoneId) ?? null;
    const suggestedRuntimeMinutes = calculateSuggestedRuntimeMinutes(zoneLayer.averageInHr, targetDepthInches);
    const runtimeMinutesOverride = Number.isFinite(Number(zoneModel?.runtimeMinutes)) && Number(zoneModel.runtimeMinutes) > 0
      ? Number(zoneModel.runtimeMinutes)
      : null;
    const effectiveRuntimeMinutes = runtimeMinutesOverride ?? suggestedRuntimeMinutes;
    const depthValues = multiplyGrid(zoneLayer.values, effectiveRuntimeMinutes / 60);
    return {
      zoneId: zoneLayer.zoneId,
      zoneName: zoneLayer.zoneName,
      zoneColor: zoneLayer.zoneColor,
      values: depthValues,
      runtimeMinutesOverride,
      suggestedRuntimeMinutes,
      effectiveRuntimeMinutes,
      ...summarizePositiveGrid(depthValues, cellAreaSqFt, "Inches"),
    };
  });

  const fullScheduleDepthValues = new Float32Array(cols * rows);
  for (const zoneLayer of zoneDepthLayers) {
    for (let index = 0; index < fullScheduleDepthValues.length; index += 1) {
      fullScheduleDepthValues[index] += zoneLayer.values[index];
    }
  }

  const fullScheduleDepth = {
    values: fullScheduleDepthValues,
    ...summarizePositiveGrid(fullScheduleDepthValues, cellAreaSqFt, "Inches"),
  };
  const targetErrorValues = new Float32Array(cols * rows);
  for (let index = 0; index < targetErrorValues.length; index += 1) {
    targetErrorValues[index] = targetDepthInches > 0
      ? (fullScheduleDepthValues[index] - targetDepthInches) / targetDepthInches
      : 0;
  }
  const targetError = {
    values: targetErrorValues,
    ...summarizeSignedGrid(targetErrorValues, fullScheduleDepthValues),
  };

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    cols,
    rows,
    cellSizeWorldPx,
    applicationRate,
    zoneRateLayers: summarizedZoneRateLayers,
    zoneDepthLayers,
    fullScheduleDepth,
    targetError,
  };
}

function summarizePositiveGrid(values, cellAreaSqFt, suffix = "InHr") {
  let maxValue = 0;
  let positiveCount = 0;
  let positiveSum = 0;
  let minPositiveValue = Number.POSITIVE_INFINITY;

  for (const value of values) {
    maxValue = Math.max(maxValue, value);
    if (value > 0) {
      positiveCount += 1;
      positiveSum += value;
      minPositiveValue = Math.min(minPositiveValue, value);
    }
  }

  const summary = {
    maxInHr: 0,
    averageInHr: 0,
    minPositiveInHr: 0,
    wateredAreaSqFt: positiveCount * cellAreaSqFt,
  };

  if (suffix === "Inches") {
    summary.maxInches = maxValue;
    summary.averageInches = positiveCount ? positiveSum / positiveCount : 0;
    summary.minPositiveInches = Number.isFinite(minPositiveValue) ? minPositiveValue : 0;
  } else {
    summary.maxInHr = maxValue;
    summary.averageInHr = positiveCount ? positiveSum / positiveCount : 0;
    summary.minPositiveInHr = Number.isFinite(minPositiveValue) ? minPositiveValue : 0;
  }

  return summary;
}

function summarizeSignedGrid(values, positiveMaskValues = null) {
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  let maxAbsValue = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (positiveMaskValues && !(positiveMaskValues[index] > 0)) {
      continue;
    }
    const value = values[index];
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
    maxAbsValue = Math.max(maxAbsValue, Math.abs(value));
  }

  return {
    minRatio: Number.isFinite(minValue) ? minValue : 0,
    maxRatio: Number.isFinite(maxValue) ? maxValue : 0,
    maxAbsRatio: maxAbsValue,
  };
}

function multiplyGrid(values, factor) {
  const multiplied = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    multiplied[index] = values[index] * factor;
  }
  return multiplied;
}

function calculateSuggestedRuntimeMinutes(averageRateInHr, targetDepthInches) {
  if (!Number.isFinite(averageRateInHr) || averageRateInHr <= 0) {
    return null;
  }
  return (targetDepthInches / averageRateInHr) * 60;
}

export function sampleAnalysisAtPoint(snapshot, overlayMode, point) {
  const grid = snapshot?.grid;
  if (!grid || !point || overlayMode === "none") {
    return null;
  }

  const cellIndex = getGridCellIndex(grid, point);
  if (cellIndex === null) {
    return null;
  }

  if (overlayMode === "application_rate") {
    return {
      mode: overlayMode,
      value: grid.applicationRate.values[cellIndex],
      unit: "in/hr",
      contributions: [],
    };
  }

  if (overlayMode === "zone_catch_can") {
    const selectedLayer = grid.zoneDepthLayers.find((layer) => layer.zoneId === snapshot.selectedZoneId) ?? null;
    return {
      mode: overlayMode,
      zoneName: selectedLayer?.zoneName ?? "Zone",
      value: selectedLayer ? selectedLayer.values[cellIndex] : 0,
      unit: "in",
      contributions: [],
    };
  }

  if (overlayMode === "full_schedule_depth") {
    if (!(grid.fullScheduleDepth.values[cellIndex] > 0)) {
      return null;
    }
    return {
      mode: overlayMode,
      value: grid.fullScheduleDepth.values[cellIndex],
      unit: "in",
      contributions: summarizeZoneContributions(grid.zoneDepthLayers, cellIndex),
    };
  }

  if (overlayMode === "target_error") {
    if (!(grid.fullScheduleDepth.values[cellIndex] > 0)) {
      return null;
    }
    return {
      mode: overlayMode,
      value: grid.targetError.values[cellIndex],
      unit: "ratio",
      totalDepthInches: grid.fullScheduleDepth.values[cellIndex],
      contributions: summarizeZoneContributions(grid.zoneDepthLayers, cellIndex),
    };
  }

  return null;
}

function getGridCellIndex(grid, point) {
  if (
    point.x < grid.x ||
    point.y < grid.y ||
    point.x >= grid.x + grid.width ||
    point.y >= grid.y + grid.height
  ) {
    return null;
  }

  const col = Math.floor((point.x - grid.x) / grid.cellSizeWorldPx);
  const row = Math.floor((point.y - grid.y) / grid.cellSizeWorldPx);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) {
    return null;
  }
  return row * grid.cols + col;
}

function summarizeZoneContributions(zoneDepthLayers, cellIndex) {
  return zoneDepthLayers
    .map((layer) => ({
      zoneId: layer.zoneId,
      zoneName: layer.zoneName,
      value: layer.values[cellIndex],
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
}

function resolveHeatmapBounds(state, recommendations) {
  if (state.background?.width && state.background?.height) {
    return { x: 0, y: 0, width: state.background.width, height: state.background.height };
  }

  if (!recommendations.length || !state.scale?.pixelsPerUnit) {
    return null;
  }

  const pixelsPerUnit = Number(state.scale.pixelsPerUnit);
  const extents = recommendations.map((recommendation) => ({
    minX: recommendation.x - recommendation.desiredRadiusFt * pixelsPerUnit,
    maxX: recommendation.x + recommendation.desiredRadiusFt * pixelsPerUnit,
    minY: recommendation.y - recommendation.desiredRadiusFt * pixelsPerUnit,
    maxY: recommendation.y + recommendation.desiredRadiusFt * pixelsPerUnit,
  }));

  const minX = Math.min(...extents.map((extent) => extent.minX));
  const maxX = Math.max(...extents.map((extent) => extent.maxX));
  const minY = Math.min(...extents.map((extent) => extent.minY));
  const maxY = Math.max(...extents.map((extent) => extent.maxY));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function pointFallsWithinSector(xWorld, yWorld, recommendation, pixelsPerUnit) {
  const dx = xWorld - recommendation.x;
  const dy = yWorld - recommendation.y;
  const distanceFt = Math.hypot(dx, dy) / pixelsPerUnit;
  if (distanceFt > recommendation.desiredRadiusFt) {
    return false;
  }
  if (recommendation.pattern === "full" || recommendation.sweepDeg >= 360) {
    return true;
  }

  const angle = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI);
  const start = normalizeAngle(recommendation.startDeg);
  const end = normalizeAngle(start + recommendation.sweepDeg);
  if (start <= end && recommendation.sweepDeg < 360) {
    return angle >= start && angle <= end;
  }
  return angle >= start || angle <= end;
}

function calculateActualPrecipInHr(flowGpm, radiusFt, arcDeg) {
  const clampedArc = clamp(Number(arcDeg) || 360, 0.1, 360);
  const safeRadius = Math.max(0.1, Number(radiusFt) || 0.1);
  const sectorAreaSqFt = Math.PI * safeRadius * safeRadius * (clampedArc / 360);
  return 96.3 * flowGpm / sectorAreaSqFt;
}

function compareSprinklers(a, b) {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
}

function cloneRecommendation(recommendation) {
  return { ...recommendation };
}
