export const PIPE_KIND_OPTIONS = [
  { value: "main", label: "Main supply" },
  { value: "zone", label: "Zone line" },
];

export const PIPE_DIAMETER_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5];

export function normalizePipeKind(value) {
  return value === "main" ? "main" : "zone";
}

export function normalizePipePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .map((point) => ({
      x: Number(point?.x),
      y: Number(point?.y),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function calculatePipeLengthPixels(points) {
  const safePoints = normalizePipePoints(points);
  if (safePoints.length < 2) {
    return 0;
  }
  let total = 0;
  for (let index = 1; index < safePoints.length; index += 1) {
    total += Math.hypot(safePoints[index].x - safePoints[index - 1].x, safePoints[index].y - safePoints[index - 1].y);
  }
  return total;
}

export function calculatePipeLengthUnits(points, pixelsPerUnit) {
  if (!(pixelsPerUnit > 0)) {
    return 0;
  }
  return calculatePipeLengthPixels(points) / pixelsPerUnit;
}

export function buildPipeMidpoints(points) {
  const safePoints = normalizePipePoints(points);
  return safePoints.slice(0, -1).map((point, index) => ({
    index,
    point: midpoint(point, safePoints[index + 1]),
  }));
}

export function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function distancePointToSegmentSquared(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return distanceSquared(point, a);
  }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return distanceSquared(point, {
    x: a.x + t * dx,
    y: a.y + t * dy,
  });
}

export function projectPointOntoPipe(points, point) {
  const safePoints = normalizePipePoints(points);
  const safePoint = normalizePipePoints([point])[0];
  if (!safePoint || safePoints.length < 2) {
    return null;
  }

  let best = null;
  let traversedLength = 0;
  for (let index = 1; index < safePoints.length; index += 1) {
    const start = safePoints[index - 1];
    const end = safePoints[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength === 0) {
      continue;
    }

    const t = Math.max(0, Math.min(1, ((safePoint.x - start.x) * dx + (safePoint.y - start.y) * dy) / (dx * dx + dy * dy)));
    const projectionPoint = {
      x: start.x + t * dx,
      y: start.y + t * dy,
    };
    const candidate = {
      point: projectionPoint,
      segmentIndex: index - 1,
      t,
      distanceSquared: distanceSquared(safePoint, projectionPoint),
      distanceAlongPath: traversedLength + segmentLength * t,
    };

    if (!best || candidate.distanceSquared < best.distanceSquared) {
      best = candidate;
    }

    traversedLength += segmentLength;
  }

  return best ? { ...best, totalLength: traversedLength } : null;
}

export function getPointAtPipeDistance(points, distanceAlongPath) {
  const safePoints = normalizePipePoints(points);
  if (!safePoints.length) {
    return null;
  }
  if (safePoints.length === 1) {
    return {
      point: safePoints[0],
      segmentIndex: 0,
      t: 0,
      angleRad: 0,
    };
  }

  const totalLength = calculatePipeLengthPixels(safePoints);
  if (totalLength <= 0) {
    return {
      point: safePoints[0],
      segmentIndex: 0,
      t: 0,
      angleRad: 0,
    };
  }

  const targetDistance = Math.max(0, Math.min(totalLength, Number(distanceAlongPath) || 0));
  let traversedLength = 0;
  for (let index = 1; index < safePoints.length; index += 1) {
    const start = safePoints[index - 1];
    const end = safePoints[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength === 0) {
      continue;
    }

    const isLastSegment = index === safePoints.length - 1;
    if (targetDistance <= traversedLength + segmentLength || isLastSegment) {
      const segmentDistance = Math.max(0, Math.min(segmentLength, targetDistance - traversedLength));
      const t = segmentLength > 0 ? segmentDistance / segmentLength : 0;
      return {
        point: {
          x: start.x + dx * t,
          y: start.y + dy * t,
        },
        segmentIndex: index - 1,
        t,
        angleRad: Math.atan2(dy, dx),
      };
    }

    traversedLength += segmentLength;
  }

  const lastStart = safePoints[safePoints.length - 2];
  const lastPoint = safePoints[safePoints.length - 1];
  return {
    point: lastPoint,
    segmentIndex: safePoints.length - 2,
    t: 1,
    angleRad: Math.atan2(lastPoint.y - lastStart.y, lastPoint.x - lastStart.x),
  };
}

export function pointsEqual(a, b, epsilon = 0.001) {
  if (!a || !b) {
    return false;
  }
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

export function getPipeKindLabel(kind) {
  return normalizePipeKind(kind) === "main" ? "Main supply" : "Zone line";
}

export function formatPipeDiameterLabel(diameterInches) {
  const value = Number(diameterInches);
  return Number.isFinite(value) && value > 0 ? `${trimTrailingZeros(value)} in` : "Unspecified diameter";
}

function distanceSquared(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function trimTrailingZeros(value) {
  return String(Number(value.toFixed(2)));
}
