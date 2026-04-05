import { clamp, normalizeAngle } from "../geometry/arcs.js";
import { getCoverageModel, pointFallsWithinCoverage, resolveCoverageBounds, resolveStripConfiguration } from "../geometry/coverage.js";
import { formatNominalPipeSize, getFittingTypeMeta } from "../geometry/fittings.js";
import { formatNozzleLabel } from "../geometry/nozzle-labels.js";
import { resolvePlacedFittingSizeSpec } from "./fittings-analysis.js";
import { calculatePipeLengthUnits, formatPipeDiameterLabel, getPipeKindLabel, normalizePipeKind } from "../geometry/pipes.js";
import { formatWireRunLabel } from "../geometry/wires.js";

const BODY_1800_PRS = "Rain Bird 1800 PRS";
const BODY_5004_PRS = "Rain Bird 5004 PRS";
const BODY_3504 = "Rain Bird 3504";

const DEFAULT_ASSUMPTIONS = {
  sprayArcNormalizeToleranceDeg: 10,
  rotorSimplicityPrecipToleranceInHr: 0.01,
  zoneFamilyAutoResolvePrecipToleranceInHr: 0.03,
  universalMaxRadiusReductionPct: 0.25,
  maxExactRotorSearchStates: 250000,
  rotorBeamWidth: 160,
};

const FUNNY_PIPE_ELBOWS_PER_HEAD_CONNECTION = 2;
const HEAD_CONNECTION_FITTING_TYPES = new Set(["head_takeoff", "elbow"]);

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
    parts: {
      groupBy: "body_nozzle_split",
      includedZoneIds: [],
      excludedZoneIds: [],
      zones: [],
      rows: [],
      bodyRows: [],
      nozzleRows: [],
      fittingRows: [],
      mainFittingRows: [],
      zoneFittingRows: [],
      pipeRows: [],
      wireRows: [],
      controllerRows: [],
      showZoneUsage: true,
      includedHeadCount: 0,
      lineItemCount: 0,
      totalBodyQuantity: 0,
      totalNozzleQuantity: 0,
      totalFittingQuantity: 0,
      totalControllerQuantity: 0,
      totalMainPipeLength: 0,
      totalZonePipeLength: 0,
      totalPipeLength: 0,
      totalWireLength: 0,
    },
    grid: null,
    summary: {
      analyzedHeads: 0,
      applicationRateMaxInHr: 0,
      applicationRateAverageInHr: 0,
      wateredAreaSqFt: 0,
      fullScheduleAverageDepthInches: 0,
      fullScheduleMaxDepthInches: 0,
      overLimitZones: 0,
      sharedRuntimeAreaCount: 0,
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
    hydraulics: {
      designFlowLimitGpm: state.hydraulics?.designFlowLimitGpm,
    },
    analysis: {
      targetDepthInches: state.analysis?.targetDepthInches,
    },
    parts: {
      groupBy: state.parts?.groupBy,
      showZoneUsage: state.parts?.showZoneUsage,
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
      runtimeGroupName: zone.runtimeGroupName ?? null,
      includeInPartsList: zone.includeInPartsList !== false,
      valveBoxId: zone.valveBoxId ?? null,
      controllerId: zone.controllerId ?? null,
      stationNumber: zone.stationNumber ?? null,
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
      coverageModel: sprinkler.coverageModel,
      stripMode: sprinkler.stripMode,
      stripMirror: sprinkler.stripMirror,
      stripLength: sprinkler.stripLength,
      stripWidth: sprinkler.stripWidth,
      stripRotationDeg: sprinkler.stripRotationDeg,
    })),
    pipeRuns: (state.pipeRuns ?? []).map((pipeRun) => ({
      id: pipeRun.id,
      kind: pipeRun.kind,
      zoneId: pipeRun.zoneId ?? null,
      label: pipeRun.label ?? "",
      diameterInches: pipeRun.diameterInches ?? null,
      points: pipeRun.points ?? [],
    })),
    controllers: (state.controllers ?? []).map((controller) => ({
      id: controller.id,
      label: controller.label ?? "",
      stationCapacity: controller.stationCapacity ?? 8,
      x: controller.x,
      y: controller.y,
    })),
    valveBoxes: (state.valveBoxes ?? []).map((valveBox) => ({
      id: valveBox.id,
      label: valveBox.label ?? "",
      x: valveBox.x,
      y: valveBox.y,
    })),
    wireRuns: (state.wireRuns ?? []).map((wireRun) => ({
      id: wireRun.id,
      controllerId: wireRun.controllerId ?? null,
      valveBoxId: wireRun.valveBoxId ?? null,
      label: wireRun.label ?? "",
      conductorCount: wireRun.conductorCount ?? 2,
      gaugeAwg: wireRun.gaugeAwg ?? "18",
      colorCode: wireRun.colorCode ?? null,
      points: wireRun.points ?? [],
    })),
    fittings: (state.fittings ?? []).map((fitting) => ({
      id: fitting.id,
      type: fitting.type,
      zoneId: fitting.zoneId ?? null,
      sizeSpec: fitting.sizeSpec ?? null,
      status: fitting.status ?? "placed",
      anchor: fitting.anchor ?? null,
      x: fitting.x,
      y: fitting.y,
    })),
  });
}

function analyzeProject(state, context) {
  const designFlowLimitGpm = Number.isFinite(Number(state.hydraulics?.designFlowLimitGpm)) && Number(state.hydraulics.designFlowLimitGpm) > 0
    ? Number(state.hydraulics.designFlowLimitGpm)
    : context.assumptions.designFlowLimitGpm;
  const analysisContext = {
    ...context,
    assumptions: {
      ...context.assumptions,
      designFlowLimitGpm,
    },
  };
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
    .map(({ zone, sprinklers }) => analyzeZone(zone, sprinklers, zonesById, analysisContext));

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
      isOverLimit: (report?.totalFlowGpm ?? 0) > analysisContext.assumptions.designFlowLimitGpm,
      notes: report?.notes ?? [],
      runtimeMinutesOverride: Number.isFinite(Number(zone.runtimeMinutes)) && Number(zone.runtimeMinutes) > 0
        ? Number(zone.runtimeMinutes)
        : null,
      suggestedRuntimeMinutes: depthLayer?.suggestedRuntimeMinutes ?? null,
      independentSuggestedRuntimeMinutes: depthLayer?.independentSuggestedRuntimeMinutes ?? null,
      effectiveRuntimeMinutes: depthLayer?.effectiveRuntimeMinutes ?? null,
      runtimeGroupName: depthLayer?.runtimeGroupName ?? zone.runtimeGroupName ?? null,
      runtimeGroupZoneCount: depthLayer?.runtimeGroupZoneCount ?? (zone.runtimeGroupName ? 1 : 0),
      runtimeGroupScaleFactor: depthLayer?.runtimeGroupScaleFactor ?? null,
      runtimeGroupAverageDepthInches: depthLayer?.runtimeGroupAverageDepthInches ?? null,
      runtimeGroupWateredAreaSqFt: depthLayer?.runtimeGroupWateredAreaSqFt ?? 0,
      runtimeGroupManualOverrideCount: depthLayer?.runtimeGroupManualOverrideCount ?? 0,
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
        analysisContext,
      )];
    }),
  );
  const parts = buildPartsSnapshot(state, recommendations, recommendationsById, zonesById);

  return {
    designFlowLimitGpm: analysisContext.assumptions.designFlowLimitGpm,
    targetDepthInches,
    recommendations,
    recommendationsById,
    compatibilityById,
    zones: zoneSummaries,
    selectedZoneId,
    selectedZone,
    parts,
    grid,
    summary: {
      analyzedHeads: recommendations.length,
      applicationRateMaxInHr: grid?.applicationRate.maxInHr ?? 0,
      applicationRateAverageInHr: grid?.applicationRate.averageInHr ?? 0,
      wateredAreaSqFt: grid?.applicationRate.wateredAreaSqFt ?? 0,
      fullScheduleAverageDepthInches: grid?.fullScheduleDepth.averageInches ?? 0,
      fullScheduleMaxDepthInches: grid?.fullScheduleDepth.maxInches ?? 0,
      overLimitZones: zoneSummaries.filter((zone) => zone.isOverLimit).length,
      sharedRuntimeAreaCount: countSharedRuntimeAreas(zoneSummaries),
    },
  };
}

function buildPartsSnapshot(state, recommendations, recommendationsById, zonesById) {
  const groupBy = ["exact_sku", "sku_family", "body_nozzle_split"].includes(state.parts?.groupBy)
    ? state.parts.groupBy
    : "body_nozzle_split";
  const showZoneUsage = state.parts?.showZoneUsage !== false;
  const includedZoneIds = new Set(
    (state.zones ?? [])
      .filter((zone) => zone.includeInPartsList !== false)
      .map((zone) => zone.id),
  );
  const zoneOrder = new Map((state.zones ?? []).map((zone, index) => [zone.id, index]));
  const zoneSummaries = (state.zones ?? []).map((zone) => ({
    id: zone.id,
    name: zone.name,
    color: zone.color,
    included: zone.includeInPartsList !== false,
    headCount: recommendations.filter((recommendation) => recommendation.zoneId === zone.id).length,
  }));

  const filteredRecommendations = recommendations.filter((recommendation) =>
    recommendation.zoneId ? includedZoneIds.has(recommendation.zoneId) : true,
  );
  const rows = buildPartsRows(filteredRecommendations, groupBy, zoneOrder, zonesById);
  const bodyRows = rows.filter((row) => row.category === "Body");
  const nozzleRows = rows.filter((row) => row.category === "Nozzle");
  const {
    allRows: fittingRows,
    mainRows: mainFittingRows,
    zoneRows: zoneFittingRows,
  } = buildFittingRows(state, includedZoneIds, zoneOrder, zonesById, recommendationsById);
  const pipeRows = buildPipeRows(state, includedZoneIds, zoneOrder, zonesById);
  const wireRows = buildWireRows(state, includedZoneIds, zoneOrder, zonesById);
  const controllerRows = buildControllerRows(state, includedZoneIds, zoneOrder, zonesById);
  const totalMainPipeLength = pipeRows
    .filter((row) => row.kind === "main")
    .reduce((sum, row) => sum + row.length, 0);
  const totalZonePipeLength = pipeRows
    .filter((row) => row.kind === "zone")
    .reduce((sum, row) => sum + row.length, 0);
  const totalWireLength = wireRows.reduce((sum, row) => sum + row.length, 0);

  return {
    groupBy,
    showZoneUsage,
    includedZoneIds: zoneSummaries.filter((zone) => zone.included).map((zone) => zone.id),
    excludedZoneIds: zoneSummaries.filter((zone) => !zone.included).map((zone) => zone.id),
    zones: zoneSummaries,
    rows,
    bodyRows,
    nozzleRows,
    fittingRows,
    mainFittingRows,
    zoneFittingRows,
    pipeRows,
    wireRows,
    controllerRows,
    includedHeadCount: filteredRecommendations.length,
    lineItemCount: rows.length + mainFittingRows.length + zoneFittingRows.length + pipeRows.length + wireRows.length + controllerRows.length,
    totalBodyQuantity: bodyRows.reduce((sum, row) => sum + row.quantity, 0),
    totalNozzleQuantity: nozzleRows.reduce((sum, row) => sum + row.quantity, 0),
    totalFittingQuantity: fittingRows.reduce((sum, row) => sum + row.quantity, 0),
    totalControllerQuantity: controllerRows.reduce((sum, row) => sum + row.quantity, 0),
    totalMainPipeLength,
    totalZonePipeLength,
    totalPipeLength: totalMainPipeLength + totalZonePipeLength,
    totalWireLength,
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
    coverageModel: getCoverageModel(sprinkler),
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
  if (sprinkler.coverageModel === "strip") {
    return recommendStripSpray(sprinkler, zone, zonesById, context);
  }

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
      body: BODY_1800_PRS,
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
      body: BODY_1800_PRS,
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
    body: BODY_1800_PRS,
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

function recommendStripSpray(sprinkler, zone, zonesById, context) {
  const strip = resolveStripConfiguration(sprinkler);
  const candidate = pickStripCandidate(strip, context.sprayData.stripSeries);
  if (!candidate) {
    const fallbackFlow = calculateActualStripFlowGpm(1.58, strip.lengthFt, strip.widthFt);
    return buildRecommendationBase(sprinkler, zone, zonesById, {
      coverageModel: "strip",
      family: "spray",
      body: BODY_1800_PRS,
      nozzle: `Custom ${capitalize(strip.mode)} strip`,
      nozzleType: "strip",
      skuFamily: "generic_strip",
      flowGpm: fallbackFlow,
      catalogPrecipInHr: 1.58,
      selectedStripLengthFt: strip.lengthFt,
      selectedStripWidthFt: strip.widthFt,
      stripMode: strip.mode,
      stripMirror: strip.mirror,
      stripRotationDeg: strip.rotationDeg,
      comment: "No matching strip nozzle data fit the drawn footprint, so a generic strip placeholder was used for analysis.",
    });
  }

  const footprintNote = candidate.footprintNote ? ` ${candidate.footprintNote}.` : "";
  return buildRecommendationBase(sprinkler, zone, zonesById, {
    coverageModel: "strip",
    family: "spray",
    body: BODY_1800_PRS,
    nozzle: candidate.model,
    nozzleType: "strip",
    skuFamily: candidate.model,
    flowGpm: candidate.flowGpmNominal,
    catalogPrecipInHr: candidate.precipInHr,
    selectedStripLengthFt: candidate.maxLengthFt,
    selectedStripWidthFt: candidate.maxWidthFt,
    stripMode: strip.mode,
    stripMirror: candidate.mirror === "both" ? strip.mirror : candidate.mirror,
    stripRotationDeg: strip.rotationDeg,
    comment: `Strip nozzle ${candidate.model} selected for a ${candidate.maxWidthFt.toFixed(0)} x ${candidate.maxLengthFt.toFixed(0)} ft ${strip.mode} strip.${footprintNote}`,
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
  const coverageModel = details.coverageModel ?? sprinkler.coverageModel ?? "sector";
  const installedArcDeg = details.selectedArcDeg ?? sprinkler.desiredArcDeg;
  const flowGpm = Number(details.flowGpm) || 0;
  const strip = coverageModel === "strip" ? resolveStripConfiguration({
    stripMode: details.stripMode ?? sprinkler.stripMode,
    stripMirror: details.stripMirror ?? sprinkler.stripMirror,
    stripLength: details.selectedStripLengthFt ?? sprinkler.stripLength,
    stripWidth: details.selectedStripWidthFt ?? sprinkler.stripWidth,
    stripRotationDeg: details.stripRotationDeg ?? sprinkler.stripRotationDeg,
  }) : null;
  const actualPrecipInHr = coverageModel === "strip"
    ? calculateActualStripPrecipInHr(flowGpm, sprinkler.stripLength, sprinkler.stripWidth)
    : calculateActualPrecipInHr(flowGpm, sprinkler.radius, installedArcDeg);

  return {
    id: sprinkler.id,
    label: sprinkler.label,
    zoneId: sprinkler.zoneId ?? zone.id ?? null,
    zoneName: zonesById.get(sprinkler.zoneId)?.name ?? zone.name ?? "Unassigned",
    zoneColor: zonesById.get(sprinkler.zoneId)?.color ?? zone.color ?? "#777777",
    hidden: Boolean(sprinkler.hidden),
    x: sprinkler.x,
    y: sprinkler.y,
    coverageModel,
    startDeg: sprinkler.startDeg,
    sweepDeg: installedArcDeg,
    pattern: sprinkler.pattern,
    family: details.family,
    body: details.body,
    inletSizeInches: resolveRecommendationInletSizeInches(details),
    nozzle: details.nozzle,
    nozzleLabel: formatNozzleLabel({
      ...details,
      family: details.family,
      coverageModel,
      selectedArcDeg: installedArcDeg,
    }),
    nozzleType: details.nozzleType,
    skuFamily: details.skuFamily ?? details.nozzle,
    radiusClassFt: details.radiusClassFt,
    desiredRadiusFt: sprinkler.radius,
    selectedRadiusFt: details.selectedRadiusFt ?? null,
    radiusAdjustmentPct: Number.isFinite(Number(details.selectedRadiusFt))
      ? pctReduction(details.selectedRadiusFt, sprinkler.radius)
      : 0,
    desiredArcDeg: sprinkler.desiredArcDeg,
    selectedArcDeg: installedArcDeg,
    arcNormalized: Boolean(details.arcNormalized),
    desiredStripLengthFt: sprinkler.stripLength ?? null,
    desiredStripWidthFt: sprinkler.stripWidth ?? null,
    selectedStripLengthFt: strip?.lengthFt ?? null,
    selectedStripWidthFt: strip?.widthFt ?? null,
    stripLength: strip?.lengthFt ?? sprinkler.stripLength ?? null,
    stripWidth: strip?.widthFt ?? sprinkler.stripWidth ?? null,
    stripMode: strip?.mode ?? null,
    stripMirror: strip?.mirror ?? null,
    stripRotationDeg: strip?.rotationDeg ?? null,
    flowGpm,
    catalogPrecipInHr: details.catalogPrecipInHr ?? null,
    actualPrecipInHr,
    coverageReserveFt: coverageModel === "strip"
      ? Math.max(
        0,
        (details.selectedStripLengthFt ?? sprinkler.stripLength ?? 0) - (sprinkler.stripLength ?? 0),
        (details.selectedStripWidthFt ?? sprinkler.stripWidth ?? 0) - (sprinkler.stripWidth ?? 0),
      )
      : Math.max(0, (details.selectedRadiusFt ?? 0) - sprinkler.radius),
    comment: details.comment,
  };
}

function resolveRecommendationInletSizeInches(details) {
  const explicit = Number(details?.inletSizeInches);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  if (details?.body === BODY_5004_PRS) {
    return 0.75;
  }
  if (details?.body === BODY_3504 || details?.body === BODY_1800_PRS) {
    return 0.5;
  }
  return 0.5;
}

function buildSprayDatabase(series) {
  const fixedByRadius = new Map();
  addFixedSpraySeries(fixedByRadius, series?.mpr_series_fixed ?? [], { overwriteExisting: true });
  addFixedSpraySeries(fixedByRadius, series?.u_series_fixed_mpr ?? [], { overwriteExisting: false });

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
    stripSeries: (series?.mpr_strip_series ?? []).map((nozzle) => ({
      model: nozzle.model,
      mode: nozzle.mode,
      mirror: nozzle.mirror ?? "both",
      minLengthFt: Number(nozzle.min_length_ft),
      maxLengthFt: Number(nozzle.max_length_ft),
      minWidthFt: Number(nozzle.min_width_ft),
      maxWidthFt: Number(nozzle.max_width_ft),
      flowGpmNominal: Number(nozzle.flow_gpm_nominal),
      precipInHr: Number(nozzle.precip_avg),
      footprintNote: nozzle.footprint_note ?? "",
    })),
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
  if (sprinkler?.coverageModel === "strip") {
    return true;
  }
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
      body: BODY_5004_PRS,
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
      body: BODY_5004_PRS,
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
      body: BODY_5004_PRS,
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
    body: BODY_3504,
    nozzle: fallback3504.nozzle,
    nozzleType: "adjustable rotor",
    skuFamily: "3504_standard",
    radiusClassFt: fallback3504.radiusFt,
    selectedRadiusFt: fallback3504.radiusFt,
    flowGpm: fallback3504.flowGpm,
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
      detail: `${assignedZone.name} is currently ${countsLabel}. This head stays in-family with ${recommendation.body} ${recommendation.nozzleLabel || recommendation.nozzle}.`,
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
      detail: `${assignedZone.name} is ${countsLabel}. Current recommendation is ${recommendation.body} ${recommendation.nozzleLabel || recommendation.nozzle}, while the best ${preferredFamily} fit is ${preferredFit.label}.`,
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
  if (sprinkler.coverageModel === "strip") {
    const strip = resolveStripConfiguration(sprinkler);
    const candidate = pickStripCandidate(strip, sprayData.stripSeries);
    return candidate
      ? {
        canFit: true,
        label: `${BODY_1800_PRS} ${formatNozzleLabel({
          nozzle: candidate.model,
          nozzleType: "strip",
          coverageModel: "strip",
        })}`,
      }
      : { canFit: false, label: "No valid strip fit" };
  }
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
    return {
      canFit: true,
      label: `${BODY_1800_PRS} ${formatNozzleLabel({
        family: "spray",
        nozzle: fixed.series,
        nozzleType: "fixed",
        radiusClassFt: radiusClass,
        selectedRadiusFt: fixed.radiusFt,
        selectedArcDeg: normalizedArc,
      })}`,
    };
  }
  const variable = sprayData.variableByRadius.get(radiusClass) ?? null;
  return variable
    ? {
      canFit: true,
      label: `${BODY_1800_PRS} ${formatNozzleLabel({
        family: "spray",
        nozzle: variable.model,
        nozzleType: "variable",
        radiusClassFt: radiusClass,
        selectedRadiusFt: variable.maxRadiusFt,
        selectedArcDeg: sprinkler.desiredArcDeg,
      })}`,
    }
    : { canFit: false, label: "No valid spray fit" };
}

function describeRotorFit(sprinkler, zone, zonesById, context) {
  if (sprinkler.coverageModel === "strip") {
    return { canFit: false, label: "No valid rotor fit for strip coverage" };
  }
  const candidates = buildRotorCandidatesForHead(sprinkler, zone, zonesById, context);
  const bestCandidate = candidates[0] ?? null;
  return bestCandidate
    ? { canFit: true, label: `${bestCandidate.body} ${bestCandidate.nozzleLabel || bestCandidate.nozzle}` }
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
        if (pointFallsWithinCoverage(x, y, recommendation, pixelsPerUnit)) {
          totalRateInHr += recommendation.actualPrecipInHr;
        }
      }
      applicationRateValues[cellIndex] = totalRateInHr;

      for (const zoneLayer of zoneRateLayers) {
        let zoneRateInHr = 0;
        for (const recommendation of zoneLayer.recommendations) {
          if (pointFallsWithinCoverage(x, y, recommendation, pixelsPerUnit)) {
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

  const runtimePlansByZoneId = buildRuntimePlans(summarizedZoneRateLayers, zones, targetDepthInches, cellAreaSqFt);
  const zoneDepthLayers = summarizedZoneRateLayers.map((zoneLayer) => {
    const runtimePlan = runtimePlansByZoneId.get(zoneLayer.zoneId) ?? null;
    const suggestedRuntimeMinutes = runtimePlan?.suggestedRuntimeMinutes ?? null;
    const independentSuggestedRuntimeMinutes = runtimePlan?.independentSuggestedRuntimeMinutes ?? null;
    const runtimeMinutesOverride = runtimePlan?.runtimeMinutesOverride ?? null;
    const effectiveRuntimeMinutes = runtimePlan?.effectiveRuntimeMinutes ?? suggestedRuntimeMinutes;
    const depthValues = multiplyGrid(zoneLayer.values, effectiveRuntimeMinutes / 60);
    return {
      zoneId: zoneLayer.zoneId,
      zoneName: zoneLayer.zoneName,
      zoneColor: zoneLayer.zoneColor,
      values: depthValues,
      runtimeMinutesOverride,
      suggestedRuntimeMinutes,
      independentSuggestedRuntimeMinutes,
      effectiveRuntimeMinutes,
      runtimeGroupName: runtimePlan?.runtimeGroupName ?? null,
      runtimeGroupZoneCount: runtimePlan?.runtimeGroupZoneCount ?? 0,
      runtimeGroupScaleFactor: runtimePlan?.runtimeGroupScaleFactor ?? null,
      runtimeGroupAverageDepthInches: runtimePlan?.runtimeGroupAverageDepthInches ?? null,
      runtimeGroupWateredAreaSqFt: runtimePlan?.runtimeGroupWateredAreaSqFt ?? 0,
      runtimeGroupManualOverrideCount: runtimePlan?.runtimeGroupManualOverrideCount ?? 0,
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

function buildRuntimePlans(zoneRateLayers, zones, targetDepthInches, cellAreaSqFt) {
  const zonesById = new Map((zones ?? []).map((zone) => [zone.id, zone]));
  const plans = zoneRateLayers.map((zoneLayer) => {
    const zoneModel = zonesById.get(zoneLayer.zoneId) ?? null;
    const independentSuggestedRuntimeMinutes = calculateSuggestedRuntimeMinutes(zoneLayer.averageInHr, targetDepthInches);
    const runtimeMinutesOverride = Number.isFinite(Number(zoneModel?.runtimeMinutes)) && Number(zoneModel.runtimeMinutes) > 0
      ? Number(zoneModel.runtimeMinutes)
      : null;
    const runtimeGroupName = zoneModel?.runtimeGroupName ?? null;
    return {
      zoneId: zoneLayer.zoneId,
      zoneLayer,
      independentSuggestedRuntimeMinutes,
      runtimeMinutesOverride,
      runtimeGroupName,
      runtimeGroupKey: buildRuntimeGroupKey(runtimeGroupName),
      runtimeGroupZoneCount: runtimeGroupName ? 1 : 0,
      runtimeGroupScaleFactor: null,
      runtimeGroupAverageDepthInches: null,
      runtimeGroupWateredAreaSqFt: 0,
      runtimeGroupManualOverrideCount: runtimeMinutesOverride ? 1 : 0,
      suggestedRuntimeMinutes: independentSuggestedRuntimeMinutes,
      effectiveRuntimeMinutes: runtimeMinutesOverride ?? independentSuggestedRuntimeMinutes,
    };
  });

  const plansByZoneId = new Map(plans.map((plan) => [plan.zoneId, plan]));
  const groupedPlans = new Map();

  for (const plan of plans) {
    if (!plan.runtimeGroupKey) {
      continue;
    }
    if (!groupedPlans.has(plan.runtimeGroupKey)) {
      groupedPlans.set(plan.runtimeGroupKey, []);
    }
    groupedPlans.get(plan.runtimeGroupKey).push(plan);
  }

  for (const groupPlans of groupedPlans.values()) {
    if (!groupPlans.length) {
      continue;
    }

    const sampleLength = groupPlans[0].zoneLayer.values.length;
    const groupRateValues = new Float32Array(sampleLength);
    const manualDepthValues = new Float32Array(sampleLength);
    const autoBaseDepthValues = new Float32Array(sampleLength);
    let autoPlanCount = 0;
    let manualOverrideCount = 0;

    for (const plan of groupPlans) {
      const { values } = plan.zoneLayer;
      for (let index = 0; index < sampleLength; index += 1) {
        groupRateValues[index] += values[index];
      }

      if (plan.runtimeMinutesOverride) {
        manualOverrideCount += 1;
        const factor = plan.runtimeMinutesOverride / 60;
        for (let index = 0; index < sampleLength; index += 1) {
          manualDepthValues[index] += values[index] * factor;
        }
        continue;
      }

      if (!(plan.independentSuggestedRuntimeMinutes > 0)) {
        continue;
      }

      autoPlanCount += 1;
      const factor = plan.independentSuggestedRuntimeMinutes / 60;
      for (let index = 0; index < sampleLength; index += 1) {
        autoBaseDepthValues[index] += values[index] * factor;
      }
    }

    const manualSummary = summarizeGridOverMask(manualDepthValues, groupRateValues, cellAreaSqFt, "Inches");
    const autoBaseSummary = summarizeGridOverMask(autoBaseDepthValues, groupRateValues, cellAreaSqFt, "Inches");
    const runtimeGroupScaleFactor = autoPlanCount > 0 && autoBaseSummary.averageInches > 0
      ? clamp((targetDepthInches - manualSummary.averageInches) / autoBaseSummary.averageInches, 0, 1)
      : 1;

    const effectiveGroupDepthValues = new Float32Array(sampleLength);
    for (const plan of groupPlans) {
      const sharedSuggestedRuntimeMinutes = plan.independentSuggestedRuntimeMinutes
        ? plan.independentSuggestedRuntimeMinutes * runtimeGroupScaleFactor
        : null;
      plan.runtimeGroupZoneCount = groupPlans.length;
      plan.runtimeGroupScaleFactor = runtimeGroupScaleFactor;
      plan.runtimeGroupManualOverrideCount = manualOverrideCount;
      plan.suggestedRuntimeMinutes = sharedSuggestedRuntimeMinutes ?? plan.independentSuggestedRuntimeMinutes;
      plan.effectiveRuntimeMinutes = plan.runtimeMinutesOverride ?? plan.suggestedRuntimeMinutes;

      const factor = Number(plan.effectiveRuntimeMinutes) > 0 ? Number(plan.effectiveRuntimeMinutes) / 60 : 0;
      if (!(factor > 0)) {
        continue;
      }
      for (let index = 0; index < sampleLength; index += 1) {
        effectiveGroupDepthValues[index] += plan.zoneLayer.values[index] * factor;
      }
    }

    const effectiveSummary = summarizeGridOverMask(effectiveGroupDepthValues, groupRateValues, cellAreaSqFt, "Inches");
    for (const plan of groupPlans) {
      plan.runtimeGroupAverageDepthInches = effectiveSummary.averageInches;
      plan.runtimeGroupWateredAreaSqFt = effectiveSummary.wateredAreaSqFt;
    }
  }

  return plansByZoneId;
}

function buildRuntimeGroupKey(name) {
  return name ? String(name).trim().toLocaleLowerCase() : "";
}

function summarizeGridOverMask(values, maskValues, cellAreaSqFt, suffix = "InHr") {
  let maskCount = 0;
  let sumValue = 0;
  let maxValue = 0;
  let minValue = Number.POSITIVE_INFINITY;

  for (let index = 0; index < values.length; index += 1) {
    if (!(maskValues[index] > 0)) {
      continue;
    }
    maskCount += 1;
    const value = values[index];
    sumValue += value;
    maxValue = Math.max(maxValue, value);
    minValue = Math.min(minValue, value);
  }

  const summary = {
    wateredAreaSqFt: maskCount * cellAreaSqFt,
  };

  if (suffix === "Inches") {
    summary.averageInches = maskCount ? sumValue / maskCount : 0;
    summary.maxInches = maxValue;
    summary.minInches = Number.isFinite(minValue) ? minValue : 0;
    return summary;
  }

  summary.averageInHr = maskCount ? sumValue / maskCount : 0;
  summary.maxInHr = maxValue;
  summary.minInHr = Number.isFinite(minValue) ? minValue : 0;
  return summary;
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

function countSharedRuntimeAreas(zoneSummaries) {
  const sharedKeys = new Set();
  for (const zone of zoneSummaries ?? []) {
    if (!(zone?.runtimeGroupName && zone.runtimeGroupZoneCount > 1)) {
      continue;
    }
    sharedKeys.add(buildRuntimeGroupKey(zone.runtimeGroupName));
  }
  return sharedKeys.size;
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
  const extents = recommendations.map((recommendation) => resolveCoverageBounds(recommendation, pixelsPerUnit));

  const minX = Math.min(...extents.map((extent) => extent.minX));
  const maxX = Math.max(...extents.map((extent) => extent.maxX));
  const minY = Math.min(...extents.map((extent) => extent.minY));
  const maxY = Math.max(...extents.map((extent) => extent.maxY));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function calculateActualPrecipInHr(flowGpm, radiusFt, arcDeg) {
  const clampedArc = clamp(Number(arcDeg) || 360, 0.1, 360);
  const safeRadius = Math.max(0.1, Number(radiusFt) || 0.1);
  const sectorAreaSqFt = Math.PI * safeRadius * safeRadius * (clampedArc / 360);
  return 96.3 * flowGpm / sectorAreaSqFt;
}

function calculateActualStripPrecipInHr(flowGpm, lengthFt, widthFt) {
  const areaSqFt = Math.max(0.1, Number(lengthFt) || 0.1) * Math.max(0.1, Number(widthFt) || 0.1);
  return 96.3 * flowGpm / areaSqFt;
}

function calculateActualStripFlowGpm(precipInHr, lengthFt, widthFt) {
  return (Math.max(0.1, Number(precipInHr) || 0.1) * Math.max(0.1, Number(lengthFt) || 0.1) * Math.max(0.1, Number(widthFt) || 0.1)) / 96.3;
}

function buildPipeRows(state, includedZoneIds, zoneOrder, zonesById) {
  const rows = new Map();
  const pixelsPerUnit = Number(state.scale?.pixelsPerUnit);

  for (const pipeRun of state.pipeRuns ?? []) {
    const kind = normalizePipeKind(pipeRun.kind);
    const include = kind === "main" || !pipeRun.zoneId || includedZoneIds.has(pipeRun.zoneId);
    if (!include) {
      continue;
    }

    const zoneName = kind === "zone"
      ? (pipeRun.zoneId ? zonesById.get(pipeRun.zoneId)?.name ?? "Unassigned" : "Unassigned")
      : null;
    const itemLabel = `${getPipeKindLabel(kind)} - ${formatPipeDiameterLabel(pipeRun.diameterInches)}`;
    addPipeRow(rows, {
      kind,
      category: "Pipe",
      itemKey: `${kind}:${pipeRun.diameterInches ?? "unspecified"}`,
      itemLabel,
      length: pixelsPerUnit > 0 ? calculatePipeLengthUnits(pipeRun.points, pixelsPerUnit) : 0,
      zoneName,
      zoneOrderValue: pipeRun.zoneId ? (zoneOrder.get(pipeRun.zoneId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      note: kind === "zone" && !pipeRun.zoneId ? "Unassigned zone" : "",
    });
  }

  return [...rows.values()]
    .map((row) => finalizePipeRow(row))
    .sort((a, b) => comparePipeRows(a, b));
}

function buildWireRows(state, includedZoneIds, zoneOrder, zonesById) {
  const rows = new Map();
  const pixelsPerUnit = Number(state.scale?.pixelsPerUnit);

  for (const wireRun of state.wireRuns ?? []) {
    const linkedZones = getZonesForValveBox(state, wireRun.valveBoxId);
    const includedZones = linkedZones.filter((zone) => includedZoneIds.has(zone.id));
    const include = !linkedZones.length || includedZones.length > 0;
    if (!include) {
      continue;
    }

    const displayZones = includedZones.length ? includedZones : linkedZones;
    const zoneName = displayZones.length
      ? displayZones.map((zone) => zonesById.get(zone.id)?.name ?? zone.name ?? "Unassigned").join(", ")
      : null;
    const zoneOrderValue = displayZones.length
      ? Math.min(...displayZones.map((zone) => zoneOrder.get(zone.id) ?? Number.MAX_SAFE_INTEGER))
      : Number.MAX_SAFE_INTEGER;
    const requiredConductors = getRequiredWireConductorsForValveBox(state, wireRun.valveBoxId);
    const noteParts = [];
    const valveBox = wireRun.valveBoxId
      ? (state.valveBoxes ?? []).find((item) => item.id === wireRun.valveBoxId) ?? null
      : null;
    if (valveBox?.label) {
      noteParts.push(`Box ${valveBox.label}`);
    } else if (!wireRun.valveBoxId) {
      noteParts.push("No valve box assigned");
    }
    if (wireRun.colorCode) {
      noteParts.push(`Color ${wireRun.colorCode}`);
    }
    if (requiredConductors && wireRun.conductorCount < requiredConductors) {
      noteParts.push(`Needs ${requiredConductors} conductors minimum`);
    }
    addPipeRow(rows, {
      kind: "wire",
      category: "Wire",
      itemKey: `wire:${wireRun.gaugeAwg ?? "18"}:${wireRun.conductorCount ?? 2}`,
      itemLabel: formatWireRunLabel(wireRun.conductorCount, wireRun.gaugeAwg),
      length: pixelsPerUnit > 0 ? calculatePipeLengthUnits(wireRun.points, pixelsPerUnit) : 0,
      zoneName,
      zoneOrderValue,
      note: noteParts.join(" | "),
    });
  }

  return [...rows.values()]
    .map((row) => finalizePipeRow(row))
    .sort((a, b) => comparePipeRows(a, b));
}

function buildControllerRows(state, includedZoneIds, zoneOrder, zonesById) {
  return (state.controllers ?? [])
    .flatMap((controller) => {
      const linkedWireRuns = (state.wireRuns ?? []).filter((wireRun) => wireRun.controllerId === controller.id);
      const linkedValveBoxes = getConnectedValveBoxesForController(state, controller.id);
      const linkedZones = linkedValveBoxes.flatMap((valveBox) => getZonesForValveBox(state, valveBox.id));
      const includedZones = linkedZones.filter((zone) => includedZoneIds.has(zone.id));
      if (linkedZones.length && !includedZones.length) {
        return [];
      }
      const zones = (includedZones.length ? includedZones : linkedZones)
        .map((zone) => ({
          name: zonesById.get(zone.id)?.name ?? zone.name ?? "Unassigned",
          order: zoneOrder.get(zone.id) ?? Number.MAX_SAFE_INTEGER,
        }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .map((entry) => entry.name);
      return [{
        category: "Controller",
        itemKey: `controller:${controller.id}`,
        itemLabel: `${controller.label || "Controller"} - ${controller.stationCapacity ?? 8}-station controller`,
        quantity: 1,
        zones,
        zonesLabel: zones.join(", "),
        notes: linkedValveBoxes.length
          ? `${linkedWireRuns.length} wire run${linkedWireRuns.length === 1 ? "" : "s"} | ${linkedValveBoxes.length} valve box${linkedValveBoxes.length === 1 ? "" : "es"}`
          : linkedWireRuns.length
            ? `${linkedWireRuns.length} wire run${linkedWireRuns.length === 1 ? "" : "s"} | no valve box assigned`
            : "No connected wire runs",
      }];
    })
    .sort((a, b) => comparePartRows(a, b));
}

function buildFittingRows(state, includedZoneIds, zoneOrder, zonesById, recommendationsById) {
  const allRows = new Map();
  const mainRows = new Map();
  const zoneRows = new Map();
  const pipeRunsById = new Map((state.pipeRuns ?? []).map((pipeRun) => [pipeRun.id, pipeRun]));

  for (const fitting of state.fittings ?? []) {
    if ((fitting.status ?? "placed") !== "placed") {
      continue;
    }

    const include = !fitting.zoneId || includedZoneIds.has(fitting.zoneId);
    if (!include) {
      continue;
    }

    const meta = getFittingTypeMeta(fitting.type);
    const itemLabel = resolvePlacedFittingSizeSpec(state, fitting, { recommendationsById }) || meta.label;
    const zoneMeta = resolveFittingZoneMeta(state, fitting, zoneOrder, zonesById);

    const rowInput = {
      category: "Fitting",
      itemKey: `fitting:${itemLabel}`,
      itemLabel,
      zoneName: zoneMeta.zoneName,
      zoneOrderValue: zoneMeta.zoneOrderValue,
      note: itemLabel !== meta.label ? meta.label : "",
      variant: fitting.type,
      exactLabel: itemLabel,
    };
    addPartRow(allRows, rowInput);
    const fittingBucketRows = resolveFittingPartsBucket(fitting, pipeRunsById) === "zone" ? zoneRows : mainRows;
    addPartRow(fittingBucketRows, rowInput);

    for (const accessoryRow of buildDerivedHeadConnectionAccessoryRows(state, fitting, zoneMeta, recommendationsById)) {
      addPartRow(allRows, accessoryRow);
      addPartRow(zoneRows, accessoryRow);
    }
  }

  return {
    allRows: finalizeFittingPartRows(allRows),
    mainRows: finalizeFittingPartRows(mainRows),
    zoneRows: finalizeFittingPartRows(zoneRows),
  };
}

function finalizeFittingPartRows(rows) {
  return [...rows.values()]
    .map((row) => finalizePartRow(row, "exact_sku"))
    .sort((a, b) => comparePartRows(a, b));
}

function resolveFittingZoneMeta(state, fitting, zoneOrder, zonesById) {
  const sprinkler = fitting.anchor?.kind === "sprinkler" && fitting.anchor.sprinklerId
    ? (state.sprinklers ?? []).find((item) => item.id === fitting.anchor.sprinklerId) ?? null
    : null;
  const zoneId = fitting.zoneId ?? sprinkler?.zoneId ?? null;
  if (!zoneId) {
    return {
      zoneId: null,
      zoneName: fitting.anchor?.kind === "sprinkler" ? "Unassigned" : "Main",
      zoneOrderValue: Number.MAX_SAFE_INTEGER,
    };
  }

  return {
    zoneId,
    zoneName: zonesById.get(zoneId)?.name ?? "Unassigned",
    zoneOrderValue: zoneOrder.get(zoneId) ?? Number.MAX_SAFE_INTEGER,
  };
}

function buildDerivedHeadConnectionAccessoryRows(state, fitting, zoneMeta, recommendationsById) {
  if (fitting.anchor?.kind !== "sprinkler" || !HEAD_CONNECTION_FITTING_TYPES.has(fitting.type)) {
    return [];
  }

  const sprinkler = (state.sprinklers ?? []).find((item) => item.id === fitting.anchor.sprinklerId) ?? null;
  if (!sprinkler) {
    return [];
  }

  const inletSizeInches = resolveRecommendationInletSizeInches(recommendationsById?.[sprinkler.id]);
  const inletSizeLabel = formatNominalPipeSize(inletSizeInches);
  return [{
    category: "Fitting",
    itemKey: `fitting:funny_pipe_elbow:${inletSizeLabel}`,
    itemLabel: `${inletSizeLabel} funny pipe elbow`,
    zoneName: zoneMeta.zoneName,
    zoneOrderValue: zoneMeta.zoneOrderValue,
    note: `${FUNNY_PIPE_ELBOWS_PER_HEAD_CONNECTION} per sprinkler connection`,
    quantity: FUNNY_PIPE_ELBOWS_PER_HEAD_CONNECTION,
  }];
}

function resolveFittingPartsBucket(fitting, pipeRunsById) {
  if (fitting.anchor?.kind === "sprinkler" || fitting.zoneId) {
    return "zone";
  }

  const pipeKind = normalizePipeKind(pipeRunsById.get(fitting.anchor?.pipeRunId ?? "")?.kind);
  return pipeKind === "zone" ? "zone" : "main";
}

function addPipeRow(rows, input) {
  const existing = rows.get(input.itemKey) ?? {
    kind: input.kind,
    category: input.category,
    itemKey: input.itemKey,
    itemLabel: input.itemLabel,
    length: 0,
    zones: new Map(),
    notes: new Set(),
  };

  existing.length += input.length;
  if (input.zoneName) {
    existing.zones.set(input.zoneName, input.zoneOrderValue);
  }
  if (input.note) {
    existing.notes.add(input.note);
  }
  rows.set(input.itemKey, existing);
}

function finalizePipeRow(row) {
  const zones = [...row.zones.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([zoneName]) => zoneName);
  return {
    kind: row.kind,
    category: row.category,
    itemKey: row.itemKey,
    itemLabel: row.itemLabel,
    length: row.length,
    zones,
    zonesLabel: zones.join(", "),
    notes: [...row.notes].join(" | "),
  };
}

function comparePipeRows(a, b) {
  const kindOrder = { main: 0, zone: 1, wire: 2 };
  return (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99)
    || a.itemLabel.localeCompare(b.itemLabel, undefined, { numeric: true, sensitivity: "base" });
}

function getZonesForValveBox(state, valveBoxId) {
  if (!valveBoxId) {
    return [];
  }
  return (state.zones ?? []).filter((zone) => zone.valveBoxId === valveBoxId);
}

function getRequiredWireConductorsForValveBox(state, valveBoxId) {
  if (!valveBoxId) {
    return null;
  }
  return getZonesForValveBox(state, valveBoxId).length + 1;
}

function getConnectedValveBoxesForController(state, controllerId) {
  if (!controllerId) {
    return [];
  }
  const valveBoxesById = new Map((state.valveBoxes ?? []).map((valveBox) => [valveBox.id, valveBox]));
  const connected = new Map();
  (state.wireRuns ?? []).forEach((wireRun) => {
    if (wireRun.controllerId !== controllerId || !wireRun.valveBoxId) {
      return;
    }
    const valveBox = valveBoxesById.get(wireRun.valveBoxId) ?? null;
    if (valveBox) {
      connected.set(valveBox.id, valveBox);
    }
  });
  return [...connected.values()];
}

function buildPartsRows(recommendations, groupBy, zoneOrder, zonesById) {
  const rows = new Map();

  for (const recommendation of recommendations) {
    const zoneName = recommendation.zoneId
      ? zonesById.get(recommendation.zoneId)?.name ?? recommendation.zoneName ?? "Unassigned"
      : recommendation.zoneName ?? "Unassigned";
    addPartRow(rows, {
      category: "Body",
      itemKey: `body:${recommendation.body}`,
      itemLabel: recommendation.body,
      zoneName,
      zoneOrderValue: recommendation.zoneId ? (zoneOrder.get(recommendation.zoneId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      note: buildBodyPartNote(recommendation),
      variant: recommendation.body,
    });

    const nozzleLabel = resolveNozzlePartLabel(recommendation, groupBy);
    addPartRow(rows, {
      category: "Nozzle",
      itemKey: `nozzle:${nozzleLabel}`,
      itemLabel: nozzleLabel,
      zoneName,
      zoneOrderValue: recommendation.zoneId ? (zoneOrder.get(recommendation.zoneId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      note: buildNozzlePartNote(recommendation),
      variant: recommendation.nozzle,
      exactLabel: recommendation.nozzle,
    });
  }

  return [...rows.values()]
    .map((row) => finalizePartRow(row, groupBy))
    .sort((a, b) => comparePartRows(a, b));
}

function addPartRow(rows, input) {
  const existing = rows.get(input.itemKey) ?? {
    category: input.category,
    itemKey: input.itemKey,
    itemLabel: input.itemLabel,
    quantity: 0,
    zones: new Map(),
    notes: new Set(),
    variants: new Set(),
  };

  existing.quantity += normalizePartQuantity(input.quantity);
  existing.zones.set(input.zoneName, input.zoneOrderValue);
  if (input.note) {
    existing.notes.add(input.note);
  }
  if (input.variant && input.exactLabel && input.itemLabel !== input.exactLabel) {
    existing.variants.add(input.exactLabel);
  }
  rows.set(input.itemKey, existing);
}

function normalizePartQuantity(value) {
  const quantity = Math.round(Number(value));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function finalizePartRow(row, groupBy) {
  const zones = [...row.zones.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([zoneName]) => zoneName);
  const notes = [...row.notes];
  if (groupBy === "sku_family" && row.category === "Nozzle" && row.variants.size) {
    notes.push(`Variants: ${[...row.variants].sort().join(", ")}`);
  }

  return {
    category: row.category,
    itemKey: row.itemKey,
    itemLabel: row.itemLabel,
    quantity: row.quantity,
    zones,
    zonesLabel: zones.join(", "),
    notes: notes.join(" | "),
  };
}

function comparePartRows(a, b) {
  if (a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }
  return a.itemLabel.localeCompare(b.itemLabel, undefined, { numeric: true, sensitivity: "base" });
}

function resolveNozzlePartLabel(recommendation, groupBy) {
  if (groupBy === "sku_family") {
    return recommendation.skuFamily ?? recommendation.nozzle;
  }
  return recommendation.nozzle;
}

function buildBodyPartNote(recommendation) {
  if (recommendation.coverageModel === "strip") {
    return "Used with strip nozzles";
  }
  if (recommendation.family === "rotor") {
    return "Rotor body";
  }
  return "";
}

function buildNozzlePartNote(recommendation) {
  const notes = [];
  if (recommendation.coverageModel === "strip") {
    notes.push(`${capitalize(recommendation.stripMode ?? "strip")} strip`);
  }
  if (recommendation.nozzleType === "variable") {
    notes.push("Variable spray");
  } else if (recommendation.nozzleType === "fixed") {
    notes.push("Fixed spray");
  } else if (recommendation.nozzleType === "strip") {
    notes.push("Strip nozzle");
  } else if (recommendation.nozzleType === "pre-balanced rotor") {
    notes.push("Pre-balanced rotor");
  } else if (recommendation.nozzleType === "standard-angle rotor") {
    notes.push("Standard-angle rotor");
  } else if (recommendation.nozzleType === "low-angle rotor") {
    notes.push("Low-angle rotor");
  } else if (recommendation.nozzleType === "adjustable rotor") {
    notes.push("Adjustable rotor");
  }
  return notes.join(" | ");
}

function pickStripCandidate(strip, candidates = []) {
  const matches = candidates.filter((candidate) =>
    candidate.mode === strip.mode &&
    (candidate.mirror === "both" || candidate.mirror === strip.mirror) &&
    stripDimensionsFit(strip.lengthFt, strip.widthFt, candidate),
  );

  return matches.reduce((best, current) =>
    best === null || scoreStripCandidate(current, strip) < scoreStripCandidate(best, strip)
      ? current
      : best,
  null);
}

function stripDimensionsFit(lengthFt, widthFt, candidate) {
  return (
    lengthFt <= candidate.maxLengthFt &&
    lengthFt >= candidate.minLengthFt &&
    widthFt <= candidate.maxWidthFt &&
    widthFt >= candidate.minWidthFt
  );
}

function scoreStripCandidate(candidate, strip) {
  return (
    ((candidate.maxLengthFt - strip.lengthFt) / Math.max(strip.lengthFt, 0.1)) +
    ((candidate.maxWidthFt - strip.widthFt) / Math.max(strip.widthFt, 0.1))
  );
}

function compareSprinklers(a, b) {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
}

function cloneRecommendation(recommendation) {
  return { ...recommendation };
}
