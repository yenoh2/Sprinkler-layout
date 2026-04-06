import { clamp, normalizeAngle, toDegrees } from "./arcs.js";
import { distancePointToSegmentSquared, normalizePipePoints } from "./pipes.js";

export function normalizeWateringAreaPoints(points) {
  return normalizePipePoints(points);
}

export function calculateWateringAreaAreaSquareUnits(points, pixelsPerUnit) {
  const safePoints = normalizeWateringAreaPoints(points);
  if (safePoints.length < 3 || !(pixelsPerUnit > 0)) {
    return null;
  }
  return Math.abs(calculateSignedPolygonArea(safePoints)) / (pixelsPerUnit ** 2);
}

export function calculateWateringAreaCentroid(points) {
  const safePoints = normalizeWateringAreaPoints(points);
  if (safePoints.length < 3) {
    return safePoints[0] ? { ...safePoints[0] } : { x: 0, y: 0 };
  }

  const signedArea = calculateSignedPolygonArea(safePoints);
  if (Math.abs(signedArea) <= 0.000001) {
    return averagePoint(safePoints);
  }

  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < safePoints.length; index += 1) {
    const current = safePoints[index];
    const next = safePoints[(index + 1) % safePoints.length];
    const cross = current.x * next.y - next.x * current.y;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  const factor = 1 / (6 * signedArea);
  return {
    x: centroidX * factor,
    y: centroidY * factor,
  };
}

export function pointInWateringArea(point, points) {
  const safePoints = normalizeWateringAreaPoints(points);
  if (!point || safePoints.length < 3) {
    return false;
  }

  let inside = false;
  for (let index = 0, previousIndex = safePoints.length - 1; index < safePoints.length; previousIndex = index, index += 1) {
    const current = safePoints[index];
    const previous = safePoints[previousIndex];
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && (point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) || 0.000001) + current.x);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function findBestWateringAreaMatch(point, wateringAreas) {
  const safePoint = normalizePoint(point);
  if (!safePoint) {
    return null;
  }

  let bestMatch = null;

  for (const area of wateringAreas ?? []) {
    const points = normalizeWateringAreaPoints(area?.points);
    if (points.length < 3) {
      continue;
    }

    const centroid = calculateWateringAreaCentroid(points);
    const segmentMatch = findClosestSegmentMatch(safePoint, points);
    const vertexMatch = findClosestVertexMatch(safePoint, points);
    const inside = pointInWateringArea(safePoint, points);
    const score = (inside ? 0 : 1_000_000_000) + segmentMatch.distanceSq;

    if (!bestMatch || score < bestMatch.score) {
      bestMatch = {
        area,
        points,
        centroid,
        inside,
        score,
        segmentMatch,
        vertexMatch,
      };
    }
  }

  return bestMatch;
}

export function inferSectorAutoOrientation(origin, sweepDeg, wateringAreas, options = {}) {
  const sweep = Number(sweepDeg);
  if (!Number.isFinite(sweep) || sweep <= 0 || sweep >= 360) {
    return null;
  }

  const match = findBestWateringAreaMatch(origin, wateringAreas);
  if (!match) {
    return null;
  }

  const sampleDistancePx = resolveSampleDistancePx(options);
  if (sweep <= 120) {
    const inwardDirection = resolveCornerBisector(match, sampleDistancePx, normalizePoint(origin));
    if (!inwardDirection) {
      return null;
    }
    const centerlineDeg = normalizeAngle(toDegrees(Math.atan2(inwardDirection.y, inwardDirection.x)));
    return {
      startDeg: normalizeAngle(centerlineDeg - sweep / 2),
      centerlineDeg,
      areaId: match.area.id,
      mode: "corner",
    };
  }

  const inwardNormal = resolveInteriorNormal(match, sampleDistancePx);
  if (!inwardNormal) {
    return null;
  }
  const centerlineDeg = normalizeAngle(toDegrees(Math.atan2(inwardNormal.y, inwardNormal.x)));
  return {
    startDeg: normalizeAngle(centerlineDeg - sweep / 2),
    centerlineDeg,
    areaId: match.area.id,
    mode: "edge",
  };
}

export function buildAutoOrientedSectorPatch(origin, sweepDeg, wateringAreas, options = {}) {
  const sweep = Number(sweepDeg);
  if (!(Number.isFinite(sweep) && sweep > 0)) {
    return null;
  }

  const fallbackStartDeg = normalizeAngle(Number(options?.fallbackStartDeg ?? 0));
  if (sweep >= 360) {
    return {
      pattern: "full",
      sweepDeg: 360,
      startDeg: fallbackStartDeg,
      rotationDeg: 0,
    };
  }

  const oriented = inferSectorAutoOrientation(origin, sweep, wateringAreas, options);
  return {
    pattern: "arc",
    sweepDeg: Math.max(1, Math.min(359, Math.round(sweep))),
    startDeg: normalizeAngle(oriented?.startDeg ?? fallbackStartDeg),
    rotationDeg: 0,
  };
}

function calculateSignedPolygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function averagePoint(points) {
  const safePoints = normalizeWateringAreaPoints(points);
  if (!safePoints.length) {
    return { x: 0, y: 0 };
  }
  const total = safePoints.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
  }), { x: 0, y: 0 });
  return {
    x: total.x / safePoints.length,
    y: total.y / safePoints.length,
  };
}

function findClosestSegmentMatch(point, points) {
  let bestMatch = null;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const projection = projectPointToSegment(point, start, end);
    if (!projection) {
      continue;
    }

    if (!bestMatch || projection.distanceSq < bestMatch.distanceSq) {
      bestMatch = {
        index,
        start,
        end,
        point: projection.point,
        t: projection.t,
        distanceSq: projection.distanceSq,
      };
    }
  }

  return bestMatch;
}

function findClosestVertexMatch(point, points) {
  let bestMatch = null;

  for (let index = 0; index < points.length; index += 1) {
    const vertex = points[index];
    const dx = vertex.x - point.x;
    const dy = vertex.y - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (!bestMatch || distanceSq < bestMatch.distanceSq) {
      bestMatch = {
        index,
        point: vertex,
        distanceSq,
      };
    }
  }

  return bestMatch;
}

function projectPointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return {
      point: { ...start },
      t: 0,
      distanceSq: distancePointToSegmentSquared(point, start, end),
    };
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projectedPoint = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  const deltaX = projectedPoint.x - point.x;
  const deltaY = projectedPoint.y - point.y;
  return {
    point: projectedPoint,
    t,
    distanceSq: deltaX * deltaX + deltaY * deltaY,
  };
}

function resolveInteriorNormal(match, sampleDistancePx) {
  const segmentMatch = match?.segmentMatch;
  if (!segmentMatch) {
    return null;
  }

  const dx = segmentMatch.end.x - segmentMatch.start.x;
  const dy = segmentMatch.end.y - segmentMatch.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0.000001)) {
    return null;
  }

  const candidates = [
    { x: -dy / length, y: dx / length },
    { x: dy / length, y: -dx / length },
  ];

  return chooseInteriorDirection(
    match.points,
    segmentMatch.point,
    candidates,
    sampleDistancePx,
    match.centroid,
  );
}

function resolveCornerBisector(match, sampleDistancePx, origin) {
  const vertexMatch = match?.vertexMatch;
  if (!vertexMatch) {
    return null;
  }

  const points = match.points;
  const index = vertexMatch.index;
  const vertex = points[index];
  const previous = points[(index - 1 + points.length) % points.length];
  const next = points[(index + 1) % points.length];
  const edgeDirections = [
    normalizeVector({ x: previous.x - vertex.x, y: previous.y - vertex.y }),
    normalizeVector({ x: next.x - vertex.x, y: next.y - vertex.y }),
  ].filter(Boolean);

  const centroidDirection = normalizeVector({
    x: match.centroid.x - vertex.x,
    y: match.centroid.y - vertex.y,
  });

  const candidates = [];
  if (edgeDirections.length === 2) {
    const combined = normalizeVector({
      x: edgeDirections[0].x + edgeDirections[1].x,
      y: edgeDirections[0].y + edgeDirections[1].y,
    });
    if (combined) {
      candidates.push(combined, { x: -combined.x, y: -combined.y });
    }
  }
  if (centroidDirection) {
    candidates.push(centroidDirection, { x: -centroidDirection.x, y: -centroidDirection.y });
  }

  const uniqueCandidates = dedupeDirections(candidates);
  const anchor = origin ?? vertex;
  return chooseInteriorDirection(match.points, anchor, uniqueCandidates, sampleDistancePx, match.centroid);
}

function chooseInteriorDirection(points, anchorPoint, candidates, sampleDistancePx, centroid) {
  const safeCandidates = (candidates ?? []).filter(Boolean);
  if (!safeCandidates.length) {
    return null;
  }

  const scoredCandidates = safeCandidates.map((candidate) => {
    const samplePoint = {
      x: anchorPoint.x + candidate.x * sampleDistancePx,
      y: anchorPoint.y + candidate.y * sampleDistancePx,
    };
    const inside = pointInWateringArea(samplePoint, points);
    const centroidVector = normalizeVector({
      x: centroid.x - anchorPoint.x,
      y: centroid.y - anchorPoint.y,
    });
    const centroidAlignment = centroidVector ? dot(candidate, centroidVector) : 0;
    return {
      candidate,
      inside,
      centroidAlignment,
    };
  });

  scoredCandidates.sort((left, right) => {
    if (left.inside !== right.inside) {
      return left.inside ? -1 : 1;
    }
    return right.centroidAlignment - left.centroidAlignment;
  });

  return scoredCandidates[0]?.candidate ?? null;
}

function resolveSampleDistancePx(options) {
  const pixelsPerUnit = Number(options?.pixelsPerUnit);
  const radiusFt = Number(options?.radiusFt);
  if (pixelsPerUnit > 0 && radiusFt > 0) {
    return clamp(radiusFt * pixelsPerUnit * 0.24, 10, 64);
  }
  return 24;
}

function dedupeDirections(candidates) {
  const unique = [];
  for (const candidate of candidates ?? []) {
    if (!candidate) {
      continue;
    }
    if (unique.some((entry) => Math.abs(entry.x - candidate.x) <= 0.0001 && Math.abs(entry.y - candidate.y) <= 0.0001)) {
      continue;
    }
    unique.push(candidate);
  }
  return unique;
}

function normalizePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!(Number.isFinite(x) && Number.isFinite(y))) {
    return null;
  }
  return { x, y };
}

function normalizeVector(vector) {
  const x = Number(vector?.x);
  const y = Number(vector?.y);
  const length = Math.hypot(x, y);
  if (!(Number.isFinite(x) && Number.isFinite(y)) || !(length > 0.000001)) {
    return null;
  }
  return {
    x: x / length,
    y: y / length,
  };
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y;
}
