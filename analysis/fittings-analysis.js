import { formatNominalPipeSize, getFittingTypeMeta, resolveHeadElbowSizeSpec, resolveHeadTakeoffSizeSpec } from "../geometry/fittings.js";
import { distancePointToSegmentSquared, pointsEqual } from "../geometry/pipes.js";
import { worldToScreen } from "../geometry/scale.js";

const DEFAULT_HEAD_TAKEOFF_SNAP_SCREEN_PX = 18;
const DEFAULT_TARGETED_FITTING_SNAP_SCREEN_PX = 20;
const CONNECTION_POINT_EPSILON = 1;
const DIRECTION_MERGE_COSINE = Math.cos((10 * Math.PI) / 180);
const STRAIGHT_PAIR_MAX_DELTA_RAD = (40 * Math.PI) / 180;

export function buildFittingSuggestions(state, analysis = null) {
  const headCandidates = buildHeadTakeoffSuggestions(state, analysis);
  const pipeCandidates = buildPipeConnectionSuggestions(state);
  const [headTakeoffs, ignoredHeadTakeoffs] = partitionSuggestionsByIgnoredStatus(state, headCandidates, analysis);
  const [pipeConnections, ignoredPipeConnections] = partitionSuggestionsByIgnoredStatus(state, pipeCandidates, analysis);
  return {
    headTakeoffs,
    pipeConnections,
    ignoredHeadTakeoffs,
    ignoredPipeConnections,
    ignored: [...ignoredHeadTakeoffs, ...ignoredPipeConnections],
    all: [...headTakeoffs, ...pipeConnections],
  };
}

export function buildHeadTakeoffSuggestions(state, analysis = null) {
  return (state.sprinklers ?? [])
    .map((sprinkler) => buildHeadTakeoffSuggestion(state, sprinkler, analysis))
    .filter((suggestion) => suggestion && !hasPlacedHeadFittingMatchingSuggestion(state, suggestion, analysis))
    .sort((a, b) => a.zoneName.localeCompare(b.zoneName) || a.sprinklerLabel.localeCompare(b.sprinklerLabel, undefined, { numeric: true }));
}

export function buildPipeConnectionSuggestions(state) {
  const segments = buildPipeSegments(state.pipeRuns ?? []);
  if (!segments.length) {
    return [];
  }

  const candidates = buildCandidatePointClusters(state.pipeRuns ?? [])
    .map((cluster) => buildPipeConnectionCandidate(cluster, segments))
    .filter(Boolean);

  return candidates
    .map((candidate) => buildPipeConnectionSuggestion(state, candidate))
    .filter(Boolean)
    .filter((suggestion) => !hasPlacedFittingNearSuggestion(state, suggestion))
    .sort((a, b) => a.zoneName.localeCompare(b.zoneName) || a.referenceLabel.localeCompare(b.referenceLabel) || a.y - b.y || a.x - b.x);
}

export function buildHeadTakeoffPlacementPreview(
  state,
  fittingDraft,
  worldPoint,
  screenPoint,
  analysis = null,
  snapDistancePx = DEFAULT_HEAD_TAKEOFF_SNAP_SCREEN_PX,
) {
  const snappedSprinkler = findNearestHeadTakeoffSprinkler(state, fittingDraft, screenPoint, snapDistancePx);
  if (!snappedSprinkler) {
    return {
      type: "head_takeoff",
      label: `${getFittingTypeMeta("head_takeoff").label}: drop on a sprinkler head`,
      valid: false,
      x: worldPoint.x,
      y: worldPoint.y,
      zoneId: null,
      sizeSpec: null,
      anchor: null,
    };
  }

  return buildHeadTakeoffSuggestion(state, snappedSprinkler, analysis);
}

export function buildTargetedFittingPlacementPreview(
  state,
  fittingDraft,
  worldPoint,
  screenPoint,
  snapDistancePx = DEFAULT_TARGETED_FITTING_SNAP_SCREEN_PX,
) {
  const targetPoint = normalizePoint(fittingDraft?.targetPoint);
  if (!targetPoint) {
    return buildInvalidTargetedPreview(fittingDraft, worldPoint);
  }

  const targetScreenPoint = worldToScreen(targetPoint, state.view);
  const distance = Math.hypot(targetScreenPoint.x - screenPoint.x, targetScreenPoint.y - screenPoint.y);
  if (distance > snapDistancePx) {
    return buildInvalidTargetedPreview(fittingDraft, worldPoint);
  }

  return {
    type: fittingDraft.type,
    label: fittingDraft.label || getFittingTypeMeta(fittingDraft.type).label,
    valid: true,
    x: targetPoint.x,
    y: targetPoint.y,
    zoneId: fittingDraft.zoneId ?? null,
    sizeSpec: fittingDraft.sizeSpec ?? null,
    anchor: fittingDraft.targetAnchor ?? null,
  };
}

export function buildHeadTakeoffSuggestion(state, sprinkler, analysis = null) {
  if (!sprinkler) {
    return null;
  }

  const nearestZonePipe = findNearestZonePipeForPoint(state, sprinkler.zoneId, sprinkler);
  const isTerminalEndpoint = isTerminalHeadConnection(state, sprinkler, nearestZonePipe);
  const type = isTerminalEndpoint ? "elbow" : "head_takeoff";
  const headConnectionDiameterInches = resolveSprinklerConnectionDiameterInches(sprinkler, analysis);
  const zoneName = state.zones.find((zone) => zone.id === sprinkler.zoneId)?.name ?? "Unassigned";
  return {
    id: `${type}:${sprinkler.id}`,
    type,
    sprinklerId: sprinkler.id,
    sprinklerLabel: sprinkler.label || "Sprinkler",
    referenceLabel: sprinkler.label || "Sprinkler",
    reason: isTerminalEndpoint ? "Terminal head connection" : "Head connection",
    zoneId: sprinkler.zoneId ?? null,
    zoneName,
    label: getFittingTypeMeta(type).label,
    valid: true,
    x: sprinkler.x,
    y: sprinkler.y,
    sizeSpec: isTerminalEndpoint
      ? resolveHeadElbowSizeSpec(nearestZonePipe?.diameterInches ?? null, headConnectionDiameterInches)
      : resolveHeadTakeoffSizeSpec(nearestZonePipe?.diameterInches ?? null, headConnectionDiameterInches),
    anchor: {
      kind: "sprinkler",
      sprinklerId: sprinkler.id,
      pipeRunId: nearestZonePipe?.id ?? null,
    },
  };
}

export function resolvePlacedFittingSizeSpec(state, fitting, analysis = null) {
  if (!fitting) {
    return null;
  }
  if (fitting.anchor?.kind !== "sprinkler" || !["head_takeoff", "elbow"].includes(fitting.type)) {
    return fitting.sizeSpec ?? null;
  }

  const sprinkler = state.sprinklers.find((item) => item.id === fitting.anchor.sprinklerId) ?? null;
  if (!sprinkler) {
    return fitting.sizeSpec ?? null;
  }

  const nearestZonePipe = findNearestZonePipeForPoint(state, sprinkler.zoneId, sprinkler);
  const headConnectionDiameterInches = resolveSprinklerConnectionDiameterInches(sprinkler, analysis);
  return fitting.type === "elbow"
    ? resolveHeadElbowSizeSpec(nearestZonePipe?.diameterInches ?? null, headConnectionDiameterInches)
    : resolveHeadTakeoffSizeSpec(nearestZonePipe?.diameterInches ?? null, headConnectionDiameterInches);
}

function buildPipeConnectionSuggestion(state, candidate) {
  const zoneMeta = resolveSuggestionZoneMeta(state, candidate);
  return {
    id: `${candidate.type}:${buildPointKey(candidate.point)}`,
    type: candidate.type,
    referenceLabel: candidate.referenceLabel,
    reason: candidate.reason,
    zoneId: zoneMeta.zoneId,
    zoneName: zoneMeta.zoneName,
    label: getFittingTypeMeta(candidate.type).label,
    valid: true,
    x: candidate.point.x,
    y: candidate.point.y,
    sizeSpec: candidate.sizeSpec,
    anchor: candidate.anchor,
  };
}

function buildPipeConnectionCandidate(cluster, segments) {
  const arms = collectCandidatePointArms(cluster.point, segments);
  const mergedArms = mergeArmsByDirection(arms);
  if (mergedArms.length < 2) {
    return null;
  }

  const classification = classifyPipeConnection(mergedArms);
  if (!classification) {
    return null;
  }

  return {
    ...classification,
    point: cluster.point,
    pointRefs: cluster.pointRefs,
    referenceLabel: buildConnectionLabel(cluster.pointRefs, mergedArms),
    anchor: buildPipeConnectionAnchor(cluster.pointRefs),
  };
}

function classifyPipeConnection(arms) {
  if (arms.length === 3) {
    const throughPair = findStraightestArmPair(arms);
    if (!throughPair || throughPair.deltaRad > STRAIGHT_PAIR_MAX_DELTA_RAD) {
      return null;
    }

    const branchIndex = [0, 1, 2].find((index) => index !== throughPair.firstIndex && index !== throughPair.secondIndex);
    const throughDiameters = [
      selectArmDiameter(arms[throughPair.firstIndex]),
      selectArmDiameter(arms[throughPair.secondIndex]),
    ];
    const branchDiameter = selectArmDiameter(arms[branchIndex]);
    const uniqueDiameters = buildUniqueDiameterSet([...throughDiameters, branchDiameter]);
    const type = uniqueDiameters.size > 1 ? "reducing_tee" : "tee";
    return {
      type,
      reason: uniqueDiameters.size > 1 ? "Pipe branch with size change" : "Pipe branch",
      sizeSpec: formatTeeSizeSpec(throughDiameters, branchDiameter),
      zoneIds: collectArmZoneIds(arms),
    };
  }

  if (arms.length === 2) {
    const straightPair = findStraightestArmPair(arms);
    if (!straightPair || straightPair.deltaRad > STRAIGHT_PAIR_MAX_DELTA_RAD) {
      return null;
    }

    const firstDiameter = selectArmDiameter(arms[0]);
    const secondDiameter = selectArmDiameter(arms[1]);
    if (sameDiameter(firstDiameter, secondDiameter)) {
      return null;
    }

    return {
      type: "reducer",
      reason: "Inline size transition",
      sizeSpec: formatReducerSizeSpec(firstDiameter, secondDiameter),
      zoneIds: collectArmZoneIds(arms),
    };
  }

  return null;
}

function buildCandidatePointClusters(pipeRuns) {
  const clusters = [];

  for (const pipeRun of pipeRuns ?? []) {
    const points = Array.isArray(pipeRun.points) ? pipeRun.points : [];
    for (let vertexIndex = 0; vertexIndex < points.length; vertexIndex += 1) {
      const point = normalizePoint(points[vertexIndex]);
      if (!point) {
        continue;
      }

      const cluster = findOrCreateCluster(clusters, point);
      cluster.pointRefs.push({
        pipeRunId: pipeRun.id,
        vertexIndex,
        runLength: points.length,
        label: pipeRun.label || "Pipe run",
        zoneId: pipeRun.zoneId ?? null,
      });
    }
  }

  return clusters;
}

function findOrCreateCluster(clusters, point) {
  const existing = clusters.find((cluster) => pointsNear(cluster.point, point));
  if (existing) {
    return existing;
  }

  const created = {
    point: { x: point.x, y: point.y },
    pointRefs: [],
  };
  clusters.push(created);
  return created;
}

function buildPipeSegments(pipeRuns) {
  const segments = [];

  for (const pipeRun of pipeRuns ?? []) {
    const points = Array.isArray(pipeRun.points) ? pipeRun.points : [];
    for (let segmentIndex = 1; segmentIndex < points.length; segmentIndex += 1) {
      const start = normalizePoint(points[segmentIndex - 1]);
      const end = normalizePoint(points[segmentIndex]);
      if (!start || !end || pointsEqual(start, end, CONNECTION_POINT_EPSILON)) {
        continue;
      }

      segments.push({
        pipeRunId: pipeRun.id,
        label: pipeRun.label || "Pipe run",
        kind: pipeRun.kind,
        zoneId: pipeRun.zoneId ?? null,
        diameterInches: pipeRun.diameterInches ?? null,
        segmentIndex: segmentIndex - 1,
        start,
        end,
      });
    }
  }

  return segments;
}

function collectCandidatePointArms(point, segments) {
  const arms = [];

  for (const segment of segments) {
    const onStart = pointsNear(point, segment.start);
    const onEnd = pointsNear(point, segment.end);
    const onInterior = !onStart && !onEnd && distancePointToSegmentSquared(point, segment.start, segment.end) <= CONNECTION_POINT_EPSILON ** 2;

    if (onStart) {
      const arm = buildArm(point, segment.end, segment);
      if (arm) {
        arms.push(arm);
      }
    }

    if (onEnd) {
      const arm = buildArm(point, segment.start, segment);
      if (arm) {
        arms.push(arm);
      }
    }

    if (onInterior) {
      const startArm = buildArm(point, segment.start, segment);
      const endArm = buildArm(point, segment.end, segment);
      if (startArm) {
        arms.push(startArm);
      }
      if (endArm) {
        arms.push(endArm);
      }
    }
  }

  return arms;
}

function buildArm(origin, target, segment) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= CONNECTION_POINT_EPSILON) {
    return null;
  }

  return {
    dx: dx / length,
    dy: dy / length,
    label: segment.label,
    zoneId: segment.zoneId ?? null,
    diameterInches: segment.diameterInches ?? null,
  };
}

function mergeArmsByDirection(arms) {
  const merged = [];

  for (const arm of arms) {
    const existing = merged.find((candidate) =>
      candidate.dx * arm.dx + candidate.dy * arm.dy >= DIRECTION_MERGE_COSINE,
    );

    if (existing) {
      existing.diameters.push(arm.diameterInches);
      existing.zoneIds.push(arm.zoneId);
      existing.labels.push(arm.label);
      continue;
    }

    merged.push({
      dx: arm.dx,
      dy: arm.dy,
      diameters: [arm.diameterInches],
      zoneIds: [arm.zoneId],
      labels: [arm.label],
    });
  }

  return merged;
}

function findStraightestArmPair(arms) {
  if (arms.length < 2) {
    return null;
  }

  let best = null;
  for (let firstIndex = 0; firstIndex < arms.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < arms.length; secondIndex += 1) {
      const dot = clampCosine(arms[firstIndex].dx * arms[secondIndex].dx + arms[firstIndex].dy * arms[secondIndex].dy);
      const deltaRad = Math.abs(Math.PI - Math.acos(dot));
      if (!best || deltaRad < best.deltaRad) {
        best = { firstIndex, secondIndex, deltaRad };
      }
    }
  }

  return best;
}

function resolveSuggestionZoneMeta(state, suggestion) {
  const zoneIds = [...(suggestion.zoneIds ?? [])].filter(Boolean);
  if (zoneIds.length === 1) {
    const zoneId = zoneIds[0];
    return {
      zoneId,
      zoneName: state.zones.find((zone) => zone.id === zoneId)?.name ?? "Unassigned",
    };
  }

  if (!zoneIds.length) {
    return { zoneId: null, zoneName: "Main" };
  }

  return { zoneId: null, zoneName: "Mixed / main" };
}

function buildPipeConnectionAnchor(pointRefs) {
  if (!pointRefs?.length) {
    return null;
  }

  const endpointRef = pointRefs.find((pointRef) =>
    pointRef.vertexIndex === 0 || pointRef.vertexIndex === pointRef.runLength - 1,
  );
  const chosen = endpointRef ?? pointRefs[0];
  return {
    kind: "pipe_vertex",
    pipeRunId: chosen.pipeRunId,
    vertexIndex: chosen.vertexIndex,
  };
}

function buildConnectionLabel(pointRefs, arms) {
  const labels = new Set();
  for (const pointRef of pointRefs ?? []) {
    if (pointRef.label) {
      labels.add(pointRef.label);
    }
  }
  for (const arm of arms ?? []) {
    for (const label of arm.labels ?? []) {
      if (label) {
        labels.add(label);
      }
    }
  }

  const orderedLabels = [...labels];
  if (!orderedLabels.length) {
    return "Pipe connection";
  }
  if (orderedLabels.length === 1) {
    return orderedLabels[0];
  }
  if (orderedLabels.length === 2) {
    return `${orderedLabels[0]} / ${orderedLabels[1]}`;
  }
  return `${orderedLabels[0]} / ${orderedLabels[1]} +${orderedLabels.length - 2}`;
}

function buildUniqueDiameterSet(diameters) {
  const unique = new Set();
  for (const diameter of diameters) {
    if (Number.isFinite(diameter) && diameter > 0) {
      unique.add(Number(diameter.toFixed(3)));
    }
  }
  return unique;
}

function collectArmZoneIds(arms) {
  const zoneIds = new Set();
  for (const arm of arms) {
    for (const zoneId of arm.zoneIds ?? []) {
      if (zoneId) {
        zoneIds.add(zoneId);
      }
    }
  }
  return [...zoneIds];
}

function selectArmDiameter(arm) {
  const finiteDiameters = (arm?.diameters ?? []).filter((value) => Number.isFinite(value) && value > 0);
  if (!finiteDiameters.length) {
    return null;
  }
  return Math.max(...finiteDiameters);
}

function formatTeeSizeSpec(throughDiameters, branchDiameter) {
  const [firstThrough, secondThrough] = throughDiameters;
  if (Number.isFinite(firstThrough) && Number.isFinite(secondThrough) && Number.isFinite(branchDiameter)) {
    const firstLabel = formatNominalPipeSize(firstThrough);
    const secondLabel = formatNominalPipeSize(secondThrough);
    const branchLabel = formatNominalPipeSize(branchDiameter);
    return `${firstLabel} x ${secondLabel} x ${branchLabel} tee`;
  }

  const fallbackDiameter = throughDiameters.find((value) => Number.isFinite(value) && value > 0) ?? branchDiameter;
  return Number.isFinite(fallbackDiameter)
    ? `${formatNominalPipeSize(fallbackDiameter)} tee`
    : "Pipe tee";
}

function formatReducerSizeSpec(firstDiameter, secondDiameter) {
  if (!(Number.isFinite(firstDiameter) && Number.isFinite(secondDiameter))) {
    return "Reducer";
  }

  const larger = Math.max(firstDiameter, secondDiameter);
  const smaller = Math.min(firstDiameter, secondDiameter);
  return `${formatNominalPipeSize(larger)} x ${formatNominalPipeSize(smaller)} reducer`;
}

function sameDiameter(first, second) {
  return Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) <= 0.001;
}

function buildInvalidTargetedPreview(fittingDraft, worldPoint) {
  const targetLabel = fittingDraft?.targetAnchor?.kind === "sprinkler"
    ? "suggested sprinkler head"
    : "suggested pipe connection";
  return {
    type: fittingDraft?.type ?? "tee",
    label: `${getFittingTypeMeta(fittingDraft?.type).label}: drop on the ${targetLabel}`,
    valid: false,
    x: worldPoint.x,
    y: worldPoint.y,
    zoneId: fittingDraft?.zoneId ?? null,
    sizeSpec: fittingDraft?.sizeSpec ?? null,
    anchor: fittingDraft?.targetAnchor ?? null,
  };
}

function isTerminalHeadConnection(state, sprinkler, nearestZonePipe) {
  if (!sprinkler || !nearestZonePipe?.points?.length) {
    return false;
  }

  const points = nearestZonePipe.points;
  const endpoint = pointsNear(sprinkler, points[0])
    ? points[0]
    : pointsNear(sprinkler, points[points.length - 1])
      ? points[points.length - 1]
      : null;

  if (!endpoint) {
    return false;
  }

  const segments = buildPipeSegments(state.pipeRuns ?? []);
  const mergedArms = mergeArmsByDirection(collectCandidatePointArms(endpoint, segments));
  return mergedArms.length <= 1;
}

function findNearestHeadTakeoffSprinkler(state, fittingDraft, screenPoint, snapDistancePx) {
  let best = null;

  for (const sprinkler of state.sprinklers ?? []) {
    if (fittingDraft?.sprinklerId && sprinkler.id !== fittingDraft.sprinklerId) {
      continue;
    }
    if (fittingDraft?.zoneMode === "zone" && fittingDraft.zoneId && sprinkler.zoneId !== fittingDraft.zoneId) {
      continue;
    }

    const sprinklerScreen = worldToScreen({ x: sprinkler.x, y: sprinkler.y }, state.view);
    const distance = Math.hypot(sprinklerScreen.x - screenPoint.x, sprinklerScreen.y - screenPoint.y);
    if (distance > snapDistancePx) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { ...sprinkler, distance };
    }
  }

  return best;
}

function findNearestZonePipeForPoint(state, zoneId, point) {
  if (!zoneId) {
    return null;
  }

  const zonePipeRuns = (state.pipeRuns ?? []).filter((pipeRun) =>
    pipeRun.kind === "zone" && pipeRun.zoneId === zoneId,
  );

  let best = null;
  for (const pipeRun of zonePipeRuns) {
    for (let index = 1; index < pipeRun.points.length; index += 1) {
      const distance = distancePointToSegmentSquared(
        point,
        pipeRun.points[index - 1],
        pipeRun.points[index],
      );
      if (!best || distance < best.distance) {
        best = { pipeRun, distance };
      }
    }
  }

  return best?.pipeRun ?? null;
}

function hasPlacedFittingNearSuggestion(state, suggestion) {
  return Boolean(findSuggestionMarker(state, suggestion, "placed"));
}

function partitionSuggestionsByIgnoredStatus(state, suggestions, analysis = null) {
  const active = [];
  const ignored = [];

  for (const suggestion of suggestions ?? []) {
    const ignoredMarker = findSuggestionMarker(state, suggestion, "ignored", analysis);
    if (ignoredMarker) {
      ignored.push({
        ...suggestion,
        ignoredFittingId: ignoredMarker.id,
      });
      continue;
    }
    active.push(suggestion);
  }

  return [active, ignored];
}

function hasPlacedHeadFittingMatchingSuggestion(state, suggestion, analysis = null) {
  if (!suggestion?.sprinklerId) {
    return false;
  }

  return Boolean(findSuggestionMarker(state, suggestion, "placed", analysis));
}

function findSuggestionMarker(state, suggestion, status, analysis = null) {
  for (const fitting of state.fittings ?? []) {
    if (fitting.status !== status) {
      continue;
    }
    if (isSprinklerSuggestion(suggestion)) {
      if (matchesSprinklerSuggestionMarker(state, fitting, suggestion, analysis)) {
        return fitting;
      }
      continue;
    }
    if (matchesPointSuggestionMarker(state, fitting, suggestion)) {
      return fitting;
    }
  }

  return null;
}

function isSprinklerSuggestion(suggestion) {
  return suggestion?.anchor?.kind === "sprinkler" || Boolean(suggestion?.sprinklerId);
}

function matchesSprinklerSuggestionMarker(state, fitting, suggestion, analysis = null) {
  if (!suggestion?.sprinklerId) {
    return false;
  }
  if (fitting.anchor?.kind !== "sprinkler" || fitting.anchor.sprinklerId !== suggestion.sprinklerId) {
    return false;
  }
  if (fitting.type !== suggestion.type) {
    return false;
  }
  return areCompatibleSuggestionSizeSpecs(resolvePlacedFittingSizeSpec(state, fitting, analysis), suggestion.sizeSpec);
}

function matchesPointSuggestionMarker(state, fitting, suggestion) {
  if (fitting.type !== suggestion.type) {
    return false;
  }
  if (!areCompatibleSuggestionSizeSpecs(fitting.sizeSpec, suggestion.sizeSpec)) {
    return false;
  }

  const point = resolvePlacedFittingPoint(state, fitting);
  return Boolean(point && distanceSquared(point, suggestion) <= CONNECTION_POINT_EPSILON ** 2);
}

function areCompatibleSuggestionSizeSpecs(existingSizeSpec, suggestedSizeSpec) {
  if (!existingSizeSpec || !suggestedSizeSpec) {
    return true;
  }
  if (existingSizeSpec === suggestedSizeSpec) {
    return true;
  }
  return isGenericZoneLineSizeSpec(existingSizeSpec) || isGenericZoneLineSizeSpec(suggestedSizeSpec);
}

function isGenericZoneLineSizeSpec(sizeSpec) {
  return typeof sizeSpec === "string" && sizeSpec.startsWith("Zone line");
}

function resolvePlacedFittingPoint(state, fitting) {
  if (fitting.anchor?.kind === "sprinkler" && fitting.anchor.sprinklerId) {
    const sprinkler = state.sprinklers.find((item) => item.id === fitting.anchor.sprinklerId) ?? null;
    if (sprinkler) {
      return { x: sprinkler.x, y: sprinkler.y };
    }
  }

  if (fitting.anchor?.kind === "pipe_vertex" && fitting.anchor.pipeRunId && Number.isInteger(fitting.anchor.vertexIndex)) {
    const pipeRun = state.pipeRuns.find((item) => item.id === fitting.anchor.pipeRunId) ?? null;
    const point = pipeRun?.points?.[fitting.anchor.vertexIndex] ?? null;
    if (point) {
      return { x: point.x, y: point.y };
    }
  }

  if (fitting.anchor?.kind === "pipe_segment" && fitting.anchor.pipeRunId && Number.isInteger(fitting.anchor.segmentIndex)) {
    const pipeRun = state.pipeRuns.find((item) => item.id === fitting.anchor.pipeRunId) ?? null;
    const start = pipeRun?.points?.[fitting.anchor.segmentIndex] ?? null;
    const end = pipeRun?.points?.[fitting.anchor.segmentIndex + 1] ?? null;
    if (start && end) {
      const t = Number.isFinite(fitting.anchor.t) ? fitting.anchor.t : 0.5;
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }
  }

  return normalizePoint(fitting);
}

function normalizePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!(Number.isFinite(x) && Number.isFinite(y))) {
    return null;
  }
  return { x, y };
}

function pointsNear(first, second) {
  return pointsEqual(first, second, CONNECTION_POINT_EPSILON);
}

function buildPointKey(point) {
  return `${Number(point.x.toFixed(2))}:${Number(point.y.toFixed(2))}`;
}

function resolveSprinklerConnectionDiameterInches(sprinkler, analysis) {
  const recommendation = analysis?.recommendationsById?.[sprinkler?.id] ?? null;
  const inletSizeInches = Number(recommendation?.inletSizeInches);
  if (Number.isFinite(inletSizeInches) && inletSizeInches > 0) {
    return inletSizeInches;
  }
  if (recommendation?.body === "Rain Bird 5004 PRS") {
    return 0.75;
  }
  return null;
}

function distanceSquared(first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  return dx * dx + dy * dy;
}

function clampCosine(value) {
  return Math.max(-1, Math.min(1, value));
}
