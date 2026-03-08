export function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, number));
}

export function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalizeAngle(angle) {
  let normalized = Number.isFinite(angle) ? angle % 360 : 0;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

export function pointFromAngle(origin, radius, degrees) {
  const radians = toRadians(degrees);
  return {
    x: origin.x + Math.cos(radians) * radius,
    y: origin.y + Math.sin(radians) * radius,
  };
}

export function pointInSprinkler(point, sprinkler) {
  const dx = point.x - sprinkler.x;
  const dy = point.y - sprinkler.y;
  const distance = Math.hypot(dx, dy);
  if (distance > sprinkler.radius) {
    return false;
  }
  if (sprinkler.pattern === "full" || sprinkler.sweepDeg >= 360) {
    return true;
  }

  const angle = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI - sprinkler.rotationDeg);
  const start = normalizeAngle(sprinkler.startDeg);
  const end = normalizeAngle(start + sprinkler.sweepDeg);
  if (start <= end && sprinkler.sweepDeg < 360) {
    return angle >= start && angle <= end;
  }
  return angle >= start || angle <= end;
}
