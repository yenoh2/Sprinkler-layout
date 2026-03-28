import { getFittingTypeMeta, resolveHeadTakeoffSizeSpec } from "../geometry/fittings.js";
import { distancePointToSegmentSquared } from "../geometry/pipes.js";
import { worldToScreen } from "../geometry/scale.js";

const DEFAULT_HEAD_TAKEOFF_SNAP_SCREEN_PX = 18;

export function buildFittingSuggestions(state) {
  const headTakeoffs = buildHeadTakeoffSuggestions(state);
  return {
    headTakeoffs,
    all: headTakeoffs,
  };
}

export function buildHeadTakeoffSuggestions(state) {
  const existingBySprinklerId = new Set(
    (state.fittings ?? [])
      .filter((fitting) => fitting.type === "head_takeoff" && fitting.anchor?.kind === "sprinkler" && fitting.anchor.sprinklerId)
      .map((fitting) => fitting.anchor.sprinklerId),
  );

  return (state.sprinklers ?? [])
    .filter((sprinkler) => !existingBySprinklerId.has(sprinkler.id))
    .map((sprinkler) => buildHeadTakeoffSuggestion(state, sprinkler))
    .filter(Boolean)
    .sort((a, b) => a.zoneName.localeCompare(b.zoneName) || a.sprinklerLabel.localeCompare(b.sprinklerLabel, undefined, { numeric: true }));
}

export function buildHeadTakeoffPlacementPreview(
  state,
  fittingDraft,
  worldPoint,
  screenPoint,
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

  return buildHeadTakeoffSuggestion(state, snappedSprinkler);
}

export function buildHeadTakeoffSuggestion(state, sprinkler) {
  if (!sprinkler) {
    return null;
  }

  const nearestZonePipe = findNearestZonePipeForPoint(state, sprinkler.zoneId, sprinkler);
  const zoneName = state.zones.find((zone) => zone.id === sprinkler.zoneId)?.name ?? "Unassigned";
  return {
    id: `head_takeoff:${sprinkler.id}`,
    type: "head_takeoff",
    sprinklerId: sprinkler.id,
    sprinklerLabel: sprinkler.label || "Sprinkler",
    zoneId: sprinkler.zoneId ?? null,
    zoneName,
    label: getFittingTypeMeta("head_takeoff").label,
    valid: true,
    x: sprinkler.x,
    y: sprinkler.y,
    sizeSpec: resolveHeadTakeoffSizeSpec(nearestZonePipe?.diameterInches ?? null),
    anchor: {
      kind: "sprinkler",
      sprinklerId: sprinkler.id,
    },
  };
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
