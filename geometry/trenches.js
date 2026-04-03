import { clamp } from "./arcs.js";
import { normalizePipeKind, normalizePipePoints } from "./pipes.js";

const DEFAULT_OPTIONS = {
  sampleSpacingUnits: 0.4,
  maxMatchDistanceUnits: 1.0,
  maxAngleDeltaDeg: 35,
  switchBiasUnits: 0.15,
  coveragePadFactor: 0.75,
  coverageMergeGapFactor: 0.45,
  minWireOnlySpanUnits: 0.35,
  corridorMergeDistanceUnits: 0.9,
  corridorMergeGapUnits: 0.8,
  corridorAngleDeltaDeg: 10,
  corridorEndpointUnits: 0.8,
};

export function buildTrenchCacheKey(state) {
  return JSON.stringify({
    pixelsPerUnit: Number(state.scale?.pixelsPerUnit) || 0,
    zones: (state.zones ?? []).map((zone) => ({
      id: zone.id,
      valveBoxId: zone.valveBoxId ?? null,
    })),
    pipeRuns: (state.pipeRuns ?? []).map((pipeRun) => ({
      id: pipeRun.id,
      kind: normalizePipeKind(pipeRun.kind),
      zoneId: pipeRun.zoneId ?? null,
      points: normalizePipePoints(pipeRun.points),
    })),
    wireRuns: (state.wireRuns ?? []).map((wireRun) => ({
      id: wireRun.id,
      controllerId: wireRun.controllerId ?? null,
      valveBoxId: wireRun.valveBoxId ?? null,
      points: normalizePipePoints(wireRun.points),
    })),
  });
}

export function buildDerivedTrenchSpans(state, overrides = {}) {
  const pixelsPerUnit = Number(state.scale?.pixelsPerUnit);
  const options = resolveOptions(pixelsPerUnit, overrides);
  const zonesByValveBox = buildZonesByValveBox(state.zones ?? []);
  const pipeSegments = explodePipeRuns(state.pipeRuns ?? []);
  const wireSegments = explodeWireRuns(state.wireRuns ?? [], zonesByValveBox);

  if (!pipeSegments.length && !wireSegments.length) {
    return [];
  }

  const wireSamples = sampleWireSegments(wireSegments, options.sampleSpacingPx);
  const matchedSamples = matchWireSamplesToPipeSegments(wireSamples, pipeSegments, options);
  const unmatchedCoverageByWireSegment = buildCoverageIntervals(
    matchedSamples.filter((sample) => !sample.match),
    options.coveragePadPx,
    options.coverageMergeGapPx,
    new Map(wireSegments.map((segment) => [segment.id, segment])),
    (sample) => ({
      segmentId: sample.wireSegmentId,
      t: sample.t,
    }),
  );

  const baseSpans = [
    ...buildPipeCenterlineSpans(pipeSegments),
    ...buildWireOnlyTrenchSpans(wireSegments, unmatchedCoverageByWireSegment, options.minWireOnlySpanPx),
  ];

  return consolidateCorridors(baseSpans, options);
}

function resolveOptions(pixelsPerUnit, overrides) {
  const sampleSpacingPx = pixelsPerUnit > 0
    ? clamp(DEFAULT_OPTIONS.sampleSpacingUnits * pixelsPerUnit, 4, 10)
    : 6;
  const merged = { ...DEFAULT_OPTIONS, ...overrides };
  return {
    ...merged,
    sampleSpacingPx,
    maxMatchDistancePx: pixelsPerUnit > 0 ? merged.maxMatchDistanceUnits * pixelsPerUnit : 12,
    maxAngleDeltaRad: degreesToRadians(merged.maxAngleDeltaDeg),
    switchBiasPx: pixelsPerUnit > 0 ? merged.switchBiasUnits * pixelsPerUnit : 1.5,
    coveragePadPx: sampleSpacingPx * merged.coveragePadFactor,
    coverageMergeGapPx: sampleSpacingPx * merged.coverageMergeGapFactor,
    minWireOnlySpanPx: pixelsPerUnit > 0 ? merged.minWireOnlySpanUnits * pixelsPerUnit : sampleSpacingPx,
    corridorMergeDistancePx: pixelsPerUnit > 0 ? merged.corridorMergeDistanceUnits * pixelsPerUnit : 10,
    corridorMergeGapPx: pixelsPerUnit > 0 ? merged.corridorMergeGapUnits * pixelsPerUnit : 10,
    corridorAngleDeltaRad: degreesToRadians(merged.corridorAngleDeltaDeg),
    corridorEndpointPx: pixelsPerUnit > 0 ? merged.corridorEndpointUnits * pixelsPerUnit : 10,
  };
}

function buildZonesByValveBox(zones) {
  const zonesByValveBox = new Map();
  for (const zone of zones) {
    if (!zone?.valveBoxId) {
      continue;
    }
    const bucket = zonesByValveBox.get(zone.valveBoxId) ?? [];
    bucket.push(zone.id);
    zonesByValveBox.set(zone.valveBoxId, bucket);
  }
  return zonesByValveBox;
}

function explodePipeRuns(pipeRuns) {
  return pipeRuns.flatMap((pipeRun) => {
    const points = normalizePipePoints(pipeRun.points);
    if (points.length < 2) {
      return [];
    }
    const kind = normalizePipeKind(pipeRun.kind);
    const zoneIds = kind === "zone" && pipeRun.zoneId ? [pipeRun.zoneId] : [];
    return explodePolyline(points).map((segment, index) => ({
      ...segment,
      id: `${pipeRun.id}:${index}`,
      sourceType: "pipe",
      sourceRunId: pipeRun.id,
      sourceSegmentIndex: index,
      pipeKind: kind,
      zoneIds,
      controllerId: null,
      valveBoxId: null,
    }));
  });
}

function explodeWireRuns(wireRuns, zonesByValveBox) {
  return wireRuns.flatMap((wireRun) => {
    const points = normalizePipePoints(wireRun.points);
    if (points.length < 2) {
      return [];
    }
    const zoneIds = [...(zonesByValveBox.get(wireRun.valveBoxId ?? "") ?? [])];
    return explodePolyline(points).map((segment, index) => ({
      ...segment,
      id: `${wireRun.id}:${index}`,
      sourceType: "wire",
      sourceRunId: wireRun.id,
      sourceSegmentIndex: index,
      pipeKind: null,
      zoneIds,
      controllerId: wireRun.controllerId ?? null,
      valveBoxId: wireRun.valveBoxId ?? null,
    }));
  });
}

function explodePolyline(points) {
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const lengthPx = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(lengthPx > 0.0001)) {
      continue;
    }
    segments.push({
      a,
      b,
      lengthPx,
      angleRad: Math.atan2(b.y - a.y, b.x - a.x),
    });
  }
  return segments;
}

function sampleWireSegments(wireSegments, sampleSpacingPx) {
  const samples = [];

  for (const segment of wireSegments) {
    const stepCount = Math.max(1, Math.ceil(segment.lengthPx / sampleSpacingPx));
    for (let stepIndex = 0; stepIndex <= stepCount; stepIndex += 1) {
      const t = stepCount > 0 ? stepIndex / stepCount : 0;
      samples.push({
        wireSegmentId: segment.id,
        wireRunId: segment.sourceRunId,
        wireSegmentIndex: segment.sourceSegmentIndex,
        t,
        point: pointAlongSegment(segment, t),
        angleRad: segment.angleRad,
        zoneIds: segment.zoneIds,
        controllerId: segment.controllerId,
        valveBoxId: segment.valveBoxId,
      });
    }
  }

  return samples;
}

function matchWireSamplesToPipeSegments(wireSamples, pipeSegments, options) {
  const matchedSamples = [];
  let previousMatchId = null;
  let previousWireRunId = null;

  for (const sample of wireSamples) {
    if (sample.wireRunId !== previousWireRunId) {
      previousWireRunId = sample.wireRunId;
      previousMatchId = null;
    }

    let bestMatch = null;
    let bestScore = Infinity;

    for (const pipeSegment of pipeSegments) {
      const angleDelta = lineAngleDifferenceRadians(sample.angleRad, pipeSegment.angleRad);
      if (angleDelta > options.maxAngleDeltaRad) {
        continue;
      }

      const projection = projectPointToSegment(sample.point, pipeSegment.a, pipeSegment.b);
      const distancePx = Math.sqrt(projection.distanceSquared);
      if (distancePx > options.maxMatchDistancePx) {
        continue;
      }

      let score = distancePx + ((angleDelta / Math.max(options.maxAngleDeltaRad, 0.0001)) * options.maxMatchDistancePx * 0.12);
      if (previousMatchId === pipeSegment.id) {
        score -= options.switchBiasPx;
      }

      if (score < bestScore) {
        bestScore = score;
        bestMatch = {
          pipeSegmentId: pipeSegment.id,
          projectedT: projection.t,
          distancePx,
        };
      }
    }

    matchedSamples.push({
      ...sample,
      match: bestMatch,
    });
    previousMatchId = bestMatch?.pipeSegmentId ?? null;
  }

  return matchedSamples;
}

function buildCoverageIntervals(samples, coveragePadPx, mergeGapPx, segmentsById, resolvePlacement) {
  const rawIntervalsBySegment = new Map();

  for (const sample of samples) {
    const placement = resolvePlacement(sample);
    if (!placement?.segmentId) {
      continue;
    }
    const segment = segmentsById.get(placement.segmentId) ?? null;
    if (!segment || !(segment.lengthPx > 0)) {
      continue;
    }
    const halfSpanT = Math.min(0.5, coveragePadPx / segment.lengthPx);
    const start = clamp(placement.t - halfSpanT, 0, 1);
    const end = clamp(placement.t + halfSpanT, 0, 1);
    const bucket = rawIntervalsBySegment.get(placement.segmentId) ?? [];
    bucket.push({ start, end });
    rawIntervalsBySegment.set(placement.segmentId, bucket);
  }

  const mergedIntervalsBySegment = new Map();
  for (const [segmentId, intervals] of rawIntervalsBySegment.entries()) {
    const segment = segmentsById.get(segmentId) ?? null;
    if (!segment) {
      continue;
    }
    mergedIntervalsBySegment.set(
      segmentId,
      mergeIntervals(intervals, mergeGapPx / Math.max(segment.lengthPx, 0.0001)),
    );
  }

  return mergedIntervalsBySegment;
}

function buildPipeCenterlineSpans(pipeSegments) {
  return pipeSegments.map((segment) => buildSpan(segment, 0, 1, "trench"));
}

function buildWireOnlyTrenchSpans(wireSegments, unmatchedCoverageByWireSegment, minWireOnlySpanPx) {
  const trenchSpans = [];

  for (const segment of wireSegments) {
    const intervals = unmatchedCoverageByWireSegment.get(segment.id) ?? [];
    for (const interval of intervals) {
      const span = buildSpan(segment, interval.start, interval.end, "wire_only");
      if (span.lengthPx >= minWireOnlySpanPx) {
        trenchSpans.push(span);
      }
    }
  }

  return trenchSpans;
}

function mergeIntervals(intervals, maxGapT = 0) {
  if (!intervals.length) {
    return [];
  }

  const sorted = [...intervals]
    .map((interval) => ({
      start: clamp(interval.start, 0, 1),
      end: clamp(interval.end, 0, 1),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (!sorted.length) {
    return [];
  }

  const merged = [sorted[0]];
  for (const interval of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (interval.start <= current.end + maxGapT) {
      current.end = Math.max(current.end, interval.end);
      continue;
    }
    merged.push({ ...interval });
  }
  return merged;
}

function buildSpan(segment, startT, endT, trenchClass) {
  const start = pointAlongSegment(segment, startT);
  const end = pointAlongSegment(segment, endT);
  return {
    id: `${segment.id}:${trenchClass}:${startT.toFixed(4)}:${endT.toFixed(4)}`,
    class: trenchClass,
    sourceType: segment.sourceType,
    sourceRunId: segment.sourceRunId,
    sourceSegmentIndex: segment.sourceSegmentIndex,
    pipeKind: segment.pipeKind,
    zoneIds: [...segment.zoneIds],
    controllerId: segment.controllerId ?? null,
    valveBoxId: segment.valveBoxId ?? null,
    startT,
    endT,
    points: [start, end],
    lengthPx: segment.lengthPx * Math.max(0, endT - startT),
  };
}

function consolidateCorridors(spans, options) {
  if (!spans.length) {
    return [];
  }

  const records = spans
    .map((span, index) => createStraightSpanRecord(span, index))
    .filter(Boolean);
  const groups = buildCorridorGroups(records, options);
  return groups.flatMap((group, groupIndex) => buildCorridorOutputSpans(group, groupIndex, options));
}

function createStraightSpanRecord(span, index) {
  const start = span.points?.[0] ?? null;
  const end = span.points?.[span.points.length - 1] ?? null;
  if (!start || !end) {
    return null;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthPx = Math.hypot(dx, dy);
  if (!(lengthPx > 0.0001)) {
    return null;
  }
  return {
    ...span,
    recordIndex: index,
    start,
    end,
    midpoint: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    },
    lengthPx,
    direction: {
      x: dx / lengthPx,
      y: dy / lengthPx,
    },
    normal: {
      x: -dy / lengthPx,
      y: dx / lengthPx,
    },
    angleRad: Math.atan2(dy, dx),
  };
}

function buildCorridorGroups(records, options) {
  const parent = records.map((_, index) => index);

  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      if (corridorRecordsCompatible(records[leftIndex], records[rightIndex], options)) {
        union(parent, leftIndex, rightIndex);
      }
    }
  }

  const groups = new Map();
  records.forEach((record, index) => {
    const root = find(parent, index);
    const bucket = groups.get(root) ?? [];
    bucket.push(record);
    groups.set(root, bucket);
  });
  return [...groups.values()];
}

function corridorRecordsCompatible(left, right, options) {
  const angleDelta = lineAngleDifferenceRadians(left.angleRad, right.angleRad);
  if (angleDelta > options.corridorAngleDeltaRad) {
    return false;
  }

  const dominant = left.lengthPx >= right.lengthPx ? left : right;
  const secondary = dominant === left ? right : left;
  const perpendicularOffset = Math.abs(dotPoint(secondary.midpoint, dominant.normal) - dotPoint(dominant.start, dominant.normal));
  if (perpendicularOffset > options.corridorMergeDistancePx) {
    return false;
  }

  const dominantRange = normalizeScalarRange(
    dotPoint(dominant.start, dominant.direction),
    dotPoint(dominant.end, dominant.direction),
  );
  const secondaryRange = normalizeScalarRange(
    dotPoint(secondary.start, dominant.direction),
    dotPoint(secondary.end, dominant.direction),
  );
  const overlap = Math.min(dominantRange.max, secondaryRange.max) - Math.max(dominantRange.min, secondaryRange.min);
  if (overlap >= -options.corridorMergeGapPx) {
    return true;
  }

  return minEndpointDistance(left, right) <= options.corridorEndpointPx;
}

function buildCorridorOutputSpans(group, groupIndex, options) {
  if (!group.length) {
    return [];
  }

  const representative = chooseRepresentativeRecord(group, options);
  const axisOrigin = representative.start;
  const axisDirection = representative.direction;
  const intervals = group
    .map((record) =>
      normalizeScalarRange(
        dotRelative(record.start, axisOrigin, axisDirection),
        dotRelative(record.end, axisOrigin, axisDirection),
      ))
    .sort((a, b) => a.min - b.min || a.max - b.max);
  const mergedIntervals = mergeScalarIntervals(intervals, options.corridorMergeGapPx);
  const zoneIds = [...new Set(group.flatMap((record) => record.zoneIds ?? []))].sort();
  const controllerId = firstNonNull(group.map((record) => record.controllerId ?? null));
  const valveBoxId = firstNonNull(group.map((record) => record.valveBoxId ?? null));
  const pipeKind = firstNonNull(group.map((record) => record.pipeKind ?? null));

  return mergedIntervals.map((interval, intervalIndex) => {
    const start = pointFromAxis(axisOrigin, axisDirection, interval.min);
    const end = pointFromAxis(axisOrigin, axisDirection, interval.max);
    return {
      id: `corridor:${groupIndex}:${intervalIndex}`,
      class: "trench",
      sourceType: "derived",
      sourceRunId: `corridor:${groupIndex}`,
      sourceSegmentIndex: intervalIndex,
      pipeKind,
      zoneIds,
      controllerId,
      valveBoxId,
      startT: 0,
      endT: 1,
      points: [start, end],
      lengthPx: Math.max(0, interval.max - interval.min),
    };
  });
}

function chooseRepresentativeRecord(group, options) {
  if (group.length === 1) {
    return group[0];
  }

  let bestRecord = group[0];
  let bestScore = Infinity;

  for (const candidate of group) {
    let score = 0;
    for (const other of group) {
      const angleDelta = lineAngleDifferenceRadians(candidate.angleRad, other.angleRad);
      const perpendicularOffset = Math.abs(dotPoint(other.midpoint, candidate.normal) - dotPoint(candidate.start, candidate.normal));
      score += perpendicularOffset + (angleDelta / Math.max(options.corridorAngleDeltaRad, 0.0001)) * options.corridorMergeDistancePx * 0.25;
    }
    score -= candidate.lengthPx * 0.02;
    if (score < bestScore) {
      bestScore = score;
      bestRecord = candidate;
    }
  }

  return bestRecord;
}

function mergeScalarIntervals(intervals, maxGapPx) {
  if (!intervals.length) {
    return [];
  }

  const merged = [{ ...intervals[0] }];
  for (const interval of intervals.slice(1)) {
    const current = merged[merged.length - 1];
    if (interval.min <= current.max + maxGapPx) {
      current.max = Math.max(current.max, interval.max);
      continue;
    }
    merged.push({ ...interval });
  }
  return merged;
}

function normalizeScalarRange(first, second) {
  return first <= second
    ? { min: first, max: second }
    : { min: second, max: first };
}

function pointFromAxis(origin, direction, scalar) {
  return {
    x: origin.x + direction.x * scalar,
    y: origin.y + direction.y * scalar,
  };
}

function dotRelative(point, origin, direction) {
  return ((point.x - origin.x) * direction.x) + ((point.y - origin.y) * direction.y);
}

function dotPoint(point, vector) {
  return (point.x * vector.x) + (point.y * vector.y);
}

function minEndpointDistance(left, right) {
  return Math.min(
    Math.hypot(left.start.x - right.start.x, left.start.y - right.start.y),
    Math.hypot(left.start.x - right.end.x, left.start.y - right.end.y),
    Math.hypot(left.end.x - right.start.x, left.end.y - right.start.y),
    Math.hypot(left.end.x - right.end.x, left.end.y - right.end.y),
  );
}

function firstNonNull(values) {
  return values.find((value) => value != null) ?? null;
}

function find(parent, index) {
  if (parent[index] !== index) {
    parent[index] = find(parent, parent[index]);
  }
  return parent[index];
}

function union(parent, leftIndex, rightIndex) {
  const leftRoot = find(parent, leftIndex);
  const rightRoot = find(parent, rightIndex);
  if (leftRoot !== rightRoot) {
    parent[rightRoot] = leftRoot;
  }
}

function pointAlongSegment(segment, t) {
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * t,
    y: segment.a.y + (segment.b.y - segment.a.y) * t,
  };
}

function projectPointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return {
      t: 0,
      distanceSquared: distanceSquared(point, a),
    };
  }
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return {
    t,
    distanceSquared: distanceSquared(point, {
      x: a.x + dx * t,
      y: a.y + dy * t,
    }),
  };
}

function lineAngleDifferenceRadians(first, second) {
  let delta = Math.abs(first - second) % Math.PI;
  if (delta > Math.PI / 2) {
    delta = Math.PI - delta;
  }
  return Math.abs(delta);
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function distanceSquared(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}
