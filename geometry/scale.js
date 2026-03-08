import { distanceBetween } from "./arcs.js";

export function worldToScreen(point, view) {
  return {
    x: point.x * view.zoom + view.offsetX,
    y: point.y * view.zoom + view.offsetY,
  };
}

export function screenToWorld(point, view) {
  return {
    x: (point.x - view.offsetX) / view.zoom,
    y: (point.y - view.offsetY) / view.zoom,
  };
}

export function fitBackgroundToView(background, width, height) {
  if (!background.width || !background.height) {
    return { zoom: 1, offsetX: 0, offsetY: 0 };
  }

  const padding = 80;
  const zoom = Math.min((width - padding * 2) / background.width, (height - padding * 2) / background.height, 1.25);
  return {
    zoom,
    offsetX: (width - background.width * zoom) / 2,
    offsetY: (height - background.height * zoom) / 2,
  };
}

export function computePixelsPerUnitFromPoints(points, realDistance) {
  if (!points || points.length < 2 || realDistance <= 0) {
    return 0;
  }
  return distanceBetween(points[0], points[1]) / realDistance;
}

export function toPixels(realUnits, scale) {
  if (!scale.calibrated || !scale.pixelsPerUnit) {
    return 0;
  }
  return realUnits * scale.pixelsPerUnit;
}
