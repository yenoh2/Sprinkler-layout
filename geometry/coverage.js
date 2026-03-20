import { clamp, normalizeAngle, toDegrees, toRadians } from "./arcs.js";

const DEFAULT_STRIP_LENGTH_FT = 15;
const DEFAULT_STRIP_WIDTH_FT = 4;
const STRIP_MODES = new Set(["end", "side", "center", "corner"]);

export function getCoverageModel(item) {
  return item?.coverageModel === "strip" ? "strip" : "sector";
}

export function isStripCoverage(item) {
  return getCoverageModel(item) === "strip";
}

export function resolveStripConfiguration(item) {
  const mode = STRIP_MODES.has(item?.stripMode) ? item.stripMode : "end";
  const mirror = item?.stripMirror === "left" ? "left" : "right";
  const lengthFt = Math.max(0.1, Number(item?.stripLength ?? item?.radius ?? DEFAULT_STRIP_LENGTH_FT) || DEFAULT_STRIP_LENGTH_FT);
  const widthFt = Math.max(0.1, Number(item?.stripWidth ?? DEFAULT_STRIP_WIDTH_FT) || DEFAULT_STRIP_WIDTH_FT);
  const rotationDeg = normalizeAngle(Number(item?.stripRotationDeg ?? item?.startDeg ?? 0));

  let forwardFt = 0;
  let backFt = 0;
  let leftFt = 0;
  let rightFt = 0;

  if (mode === "end") {
    forwardFt = lengthFt;
    leftFt = widthFt / 2;
    rightFt = widthFt / 2;
  } else if (mode === "side") {
    forwardFt = widthFt;
    leftFt = lengthFt / 2;
    rightFt = lengthFt / 2;
  } else if (mode === "center") {
    forwardFt = lengthFt / 2;
    backFt = lengthFt / 2;
    leftFt = widthFt / 2;
    rightFt = widthFt / 2;
  } else {
    forwardFt = lengthFt;
    if (mirror === "left") {
      leftFt = widthFt;
    } else {
      rightFt = widthFt;
    }
  }

  return {
    mode,
    mirror,
    lengthFt,
    widthFt,
    rotationDeg,
    forwardFt,
    backFt,
    leftFt,
    rightFt,
  };
}

export function buildStripFootprintWorldPoints(item, pixelsPerUnit) {
  const strip = resolveStripConfiguration(item);
  const forwardPx = strip.forwardFt * pixelsPerUnit;
  const backPx = strip.backFt * pixelsPerUnit;
  const leftPx = strip.leftFt * pixelsPerUnit;
  const rightPx = strip.rightFt * pixelsPerUnit;

  return [
    offsetWorldPoint(item, -leftPx, -backPx, strip.rotationDeg),
    offsetWorldPoint(item, rightPx, -backPx, strip.rotationDeg),
    offsetWorldPoint(item, rightPx, forwardPx, strip.rotationDeg),
    offsetWorldPoint(item, -leftPx, forwardPx, strip.rotationDeg),
  ];
}

export function buildStripHandleWorldPoints(item, pixelsPerUnit) {
  const strip = resolveStripConfiguration(item);
  const forwardPx = strip.forwardFt * pixelsPerUnit;
  const backPx = strip.backFt * pixelsPerUnit;
  const leftPx = strip.leftFt * pixelsPerUnit;
  const rightPx = strip.rightFt * pixelsPerUnit;

  const secondaryX = strip.mode === "corner"
    ? (strip.mirror === "left" ? -leftPx : rightPx)
    : rightPx;
  const secondaryY = strip.mode === "center"
    ? 0
    : (forwardPx - backPx) / 2;

  return {
    primaryWorld: offsetWorldPoint(item, 0, forwardPx, strip.rotationDeg),
    secondaryWorld: offsetWorldPoint(item, secondaryX, secondaryY, strip.rotationDeg),
  };
}

export function pointFallsWithinCoverage(xWorld, yWorld, item, pixelsPerUnit) {
  if (isStripCoverage(item)) {
    return pointFallsWithinStrip(xWorld, yWorld, item, pixelsPerUnit);
  }
  return pointFallsWithinSector(xWorld, yWorld, item, pixelsPerUnit);
}

export function resolveCoverageBounds(item, pixelsPerUnit) {
  if (isStripCoverage(item)) {
    const points = buildStripFootprintWorldPoints(item, pixelsPerUnit);
    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  }

  const radiusPx = Number(item?.desiredRadiusFt ?? item?.radius ?? 0) * pixelsPerUnit;
  return {
    minX: item.x - radiusPx,
    maxX: item.x + radiusPx,
    minY: item.y - radiusPx,
    maxY: item.y + radiusPx,
  };
}

export function buildStripPrimaryPatch(item, worldPoint, pixelsPerUnit) {
  const dxPx = worldPoint.x - item.x;
  const dyPx = worldPoint.y - item.y;
  const distanceFt = Math.max(0.1, Math.hypot(dxPx, dyPx) / pixelsPerUnit);
  const rotationDeg = normalizeAngle(toDegrees(Math.atan2(dyPx, dxPx)));
  const strip = resolveStripConfiguration(item);

  if (strip.mode === "side") {
    return {
      stripRotationDeg: rotationDeg,
      stripWidth: clamp(distanceFt, 0.1, 200),
    };
  }

  if (strip.mode === "center") {
    return {
      stripRotationDeg: rotationDeg,
      stripLength: clamp(distanceFt * 2, 0.1, 400),
    };
  }

  return {
    stripRotationDeg: rotationDeg,
    stripLength: clamp(distanceFt, 0.1, 400),
  };
}

export function buildStripSecondaryPatch(item, worldPoint, pixelsPerUnit) {
  const strip = resolveStripConfiguration(item);
  const { rightFt } = toLocalStripCoordinates(item, worldPoint, pixelsPerUnit);
  const absoluteRightFt = Math.max(0.1, Math.abs(rightFt));

  if (strip.mode === "side") {
    return {
      stripLength: clamp(absoluteRightFt * 2, 0.1, 400),
    };
  }

  if (strip.mode === "center") {
    return {
      stripWidth: clamp(absoluteRightFt * 2, 0.1, 200),
    };
  }

  if (strip.mode === "corner") {
    return {
      stripWidth: clamp(absoluteRightFt, 0.1, 200),
      stripMirror: rightFt >= 0 ? "right" : "left",
    };
  }

  return {
    stripWidth: clamp(absoluteRightFt * 2, 0.1, 200),
  };
}

export function toLocalStripCoordinates(item, worldPoint, pixelsPerUnit) {
  const strip = resolveStripConfiguration(item);
  const dxFt = (worldPoint.x - item.x) / pixelsPerUnit;
  const dyFt = (worldPoint.y - item.y) / pixelsPerUnit;
  const radians = toRadians(strip.rotationDeg);
  const forwardUnitX = Math.cos(radians);
  const forwardUnitY = Math.sin(radians);
  const rightUnitX = Math.cos(radians + Math.PI / 2);
  const rightUnitY = Math.sin(radians + Math.PI / 2);

  return {
    forwardFt: dxFt * forwardUnitX + dyFt * forwardUnitY,
    rightFt: dxFt * rightUnitX + dyFt * rightUnitY,
  };
}

function pointFallsWithinStrip(xWorld, yWorld, item, pixelsPerUnit) {
  const strip = resolveStripConfiguration(item);
  const { forwardFt, rightFt } = toLocalStripCoordinates(item, { x: xWorld, y: yWorld }, pixelsPerUnit);
  return (
    forwardFt >= -strip.backFt &&
    forwardFt <= strip.forwardFt &&
    rightFt >= -strip.leftFt &&
    rightFt <= strip.rightFt
  );
}

function pointFallsWithinSector(xWorld, yWorld, item, pixelsPerUnit) {
  const dx = xWorld - item.x;
  const dy = yWorld - item.y;
  const distanceFt = Math.hypot(dx, dy) / pixelsPerUnit;
  if (distanceFt > Number(item?.desiredRadiusFt ?? item?.radius ?? 0)) {
    return false;
  }
  if ((item?.pattern ?? "full") === "full" || Number(item?.sweepDeg ?? 360) >= 360) {
    return true;
  }

  const angle = normalizeAngle(toDegrees(Math.atan2(dy, dx)));
  const start = normalizeAngle(Number(item?.startDeg ?? 0));
  const sweepDeg = Number(item?.sweepDeg ?? 360);
  const end = normalizeAngle(start + sweepDeg);
  if (start <= end && sweepDeg < 360) {
    return angle >= start && angle <= end;
  }
  return angle >= start || angle <= end;
}

function offsetWorldPoint(item, rightPx, forwardPx, rotationDeg) {
  const radians = toRadians(rotationDeg);
  const forwardUnitX = Math.cos(radians);
  const forwardUnitY = Math.sin(radians);
  const rightUnitX = Math.cos(radians + Math.PI / 2);
  const rightUnitY = Math.sin(radians + Math.PI / 2);

  return {
    x: item.x + rightPx * rightUnitX + forwardPx * forwardUnitX,
    y: item.y + rightPx * rightUnitY + forwardPx * forwardUnitY,
  };
}
