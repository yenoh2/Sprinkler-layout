import { clamp, normalizeAngle, toDegrees } from "../geometry/arcs.js";
import { buildStripPrimaryPatch, buildStripSecondaryPatch, isStripCoverage } from "../geometry/coverage.js";
import { computePixelsPerUnitFromPoints, fitBackgroundToView, screenToWorld } from "../geometry/scale.js";

export function createInteractionController(canvas, store, renderer) {
  let dragState = null;
  let panState = null;
  let isSpacePressed = false;

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function syncState(state) {
    document.getElementById("hint-text").textContent = `Hint: ${state.ui.hint}`;
    canvas.style.cursor = dragState?.kind?.includes("handle") ? "grabbing" : getCursorForTool(state.ui.activeTool);
  }

  function onPointerDown(event) {
    const state = store.getState();
    const screenPoint = getCanvasPoint(event);
    const worldPoint = screenToWorld(screenPoint, state.view);

    if (shouldStartPan(event, state.ui.activeTool, isSpacePressed)) {
      panState = {
        startX: event.clientX,
        startY: event.clientY,
        offsetX: state.view.offsetX,
        offsetY: state.view.offsetY,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (state.ui.activeTool === "place") {
      if (!state.scale.calibrated) {
        return;
      }
      if (state.ui.placementPattern === "strip") {
        const id = crypto.randomUUID();
        store.dispatch({
          type: "ADD_SPRINKLER",
          payload: {
            id,
            x: worldPoint.x,
            y: worldPoint.y,
            coverageModel: "strip",
            radius: 15,
            pattern: "full",
            startDeg: 0,
            sweepDeg: 360,
            rotationDeg: 0,
            stripMode: "end",
            stripMirror: "right",
            stripLength: 15,
            stripWidth: 4,
            stripRotationDeg: 0,
          },
        });
        dragState = {
          kind: "strip-primary",
          id,
          lastPatch: null,
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      store.dispatch({
        type: "ADD_SPRINKLER",
        payload: {
          id: crypto.randomUUID(),
          x: worldPoint.x,
          y: worldPoint.y,
          radius: 12,
          pattern: state.ui.placementPattern,
          startDeg: 0,
          sweepDeg: state.ui.placementPattern === "arc" ? 180 : 360,
          rotationDeg: 0,
        },
      });
      return;
    }

    if (state.ui.activeTool === "calibrate") {
      store.dispatch({ type: "ADD_CALIBRATION_POINT", payload: { point: worldPoint } });
      return;
    }

    if (state.ui.activeTool === "measure") {
      if (state.ui.measurePoints.length >= 2) {
        store.dispatch({ type: "CLEAR_MEASURE" });
      }
      store.dispatch({ type: "ADD_MEASURE_POINT", payload: { point: worldPoint } });
      return;
    }

    const handleHit = renderer.getArcHandleHit(worldPoint);
    if (handleHit) {
      const sprinkler = state.sprinklers.find((item) => item.id === handleHit.id);
      if (sprinkler) {
        dragState = {
          kind: "arc-handle",
          id: handleHit.id,
          edge: handleHit.edge,
          initialStartDeg: sprinkler.startDeg,
          initialSweepDeg: sprinkler.sweepDeg,
          lastPatch: null,
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }

    const radiusHandleHit = renderer.getRadiusHandleHit(worldPoint);
    if (radiusHandleHit) {
      dragState = {
        kind: "radius-handle",
        id: radiusHandleHit.id,
        lastPatch: null,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const stripHandleHit = renderer.getStripHandleHit?.(worldPoint);
    if (stripHandleHit) {
      dragState = {
        kind: stripHandleHit.edge === "secondary" ? "strip-secondary" : "strip-primary",
        id: stripHandleHit.id,
        lastPatch: null,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const hit = renderer.getHitSprinkler(worldPoint);
    store.dispatch({ type: "SELECT_SPRINKLER", payload: { id: hit?.id ?? null } });
    if (hit) {
      dragState = { kind: "move", id: hit.id, startX: hit.x, startY: hit.y, lastX: hit.x, lastY: hit.y };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    panState = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: state.view.offsetX,
      offsetY: state.view.offsetY,
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const state = store.getState();
    const screenPoint = getCanvasPoint(event);
    const worldPoint = screenToWorld(screenPoint, state.view);
    store.dispatch({ type: "SET_CURSOR_WORLD", payload: { point: worldPoint } });
    if (state.ui.activeTool === "measure" && state.ui.measurePoints.length === 1) {
      store.dispatch({ type: "SET_MEASURE_PREVIEW", payload: { point: worldPoint } });
    }

    if (panState) {
      store.dispatch({
        type: "SET_VIEW",
        payload: {
          offsetX: panState.offsetX + (event.clientX - panState.startX),
          offsetY: panState.offsetY + (event.clientY - panState.startY),
        },
      });
      return;
    }

    if (dragState) {
      if (dragState.kind === "arc-handle") {
        const patch = buildArcHandlePatch(state, dragState, worldPoint);
        if (patch) {
          dragState.lastPatch = patch;
          store.dispatch({
            type: "UPDATE_SPRINKLER",
            payload: { id: dragState.id, patch },
            meta: { skipHistory: true },
          });
        }
        return;
      }
      if (dragState.kind === "radius-handle") {
        const patch = buildRadiusHandlePatch(state, dragState, worldPoint);
        if (patch) {
          dragState.lastPatch = patch;
          store.dispatch({
            type: "UPDATE_SPRINKLER",
            payload: { id: dragState.id, patch },
            meta: { skipHistory: true },
          });
        }
        return;
      }
      if (dragState.kind === "strip-primary") {
        const patch = buildStripHandlePatch(state, dragState, worldPoint, "primary");
        if (patch) {
          dragState.lastPatch = patch;
          store.dispatch({
            type: "UPDATE_SPRINKLER",
            payload: { id: dragState.id, patch },
            meta: { skipHistory: true },
          });
        }
        return;
      }
      if (dragState.kind === "strip-secondary") {
        const patch = buildStripHandlePatch(state, dragState, worldPoint, "secondary");
        if (patch) {
          dragState.lastPatch = patch;
          store.dispatch({
            type: "UPDATE_SPRINKLER",
            payload: { id: dragState.id, patch },
            meta: { skipHistory: true },
          });
        }
        return;
      }
      dragState.lastX = worldPoint.x;
      dragState.lastY = worldPoint.y;
      store.dispatch({
        type: "MOVE_SPRINKLER",
        payload: { id: dragState.id, x: worldPoint.x, y: worldPoint.y },
        meta: { skipHistory: true },
      });
    }
  }

  function onPointerUp(event) {
    if (dragState?.kind === "arc-handle" && dragState.lastPatch) {
      store.dispatch({
        type: "UPDATE_SPRINKLER",
        payload: { id: dragState.id, patch: dragState.lastPatch },
      });
    }
    if (dragState?.kind === "radius-handle" && dragState.lastPatch) {
      store.dispatch({
        type: "UPDATE_SPRINKLER",
        payload: { id: dragState.id, patch: dragState.lastPatch },
      });
    }
    if ((dragState?.kind === "strip-primary" || dragState?.kind === "strip-secondary") && dragState.lastPatch) {
      store.dispatch({
        type: "UPDATE_SPRINKLER",
        payload: { id: dragState.id, patch: dragState.lastPatch },
      });
    }
    if (dragState?.kind === "move" && (dragState.startX !== dragState.lastX || dragState.startY !== dragState.lastY)) {
      store.dispatch({
        type: "MOVE_SPRINKLER",
        payload: { id: dragState.id, x: dragState.lastX, y: dragState.lastY },
      });
    }
    if (dragState || panState) {
      canvas.releasePointerCapture?.(event.pointerId);
    }
    dragState = null;
    panState = null;
  }

  function onPointerLeave(event) {
    store.dispatch({ type: "SET_CURSOR_WORLD", payload: { point: null } });
    onPointerUp(event);
  }

  function onWheel(event) {
    event.preventDefault();
    const state = store.getState();
    const point = getCanvasPoint(event);
    const before = screenToWorld(point, state.view);
    const zoom = clamp(state.view.zoom * (event.deltaY < 0 ? 1.08 : 0.92), 0.2, 5);
    store.dispatch({
      type: "SET_VIEW",
      payload: {
        zoom,
        offsetX: point.x - before.x * zoom,
        offsetY: point.y - before.y * zoom,
      },
    });
  }

  function applyTwoPointCalibration(distanceUnits, units) {
    const state = store.getState();
    const pixelsPerUnit = computePixelsPerUnitFromPoints(state.scale.calibrationPoints, distanceUnits);
    if (!(pixelsPerUnit > 0)) {
      return false;
    }
    store.dispatch({
      type: "SET_SCALE",
      payload: {
        mode: "twoPoint",
        units,
        pixelsPerUnit,
        distanceUnits,
      },
    });
    return true;
  }

  function applyRatioCalibration(pixels, realUnits, units) {
    const pixelsPerUnit = pixels / realUnits;
    if (!(pixelsPerUnit > 0)) {
      return false;
    }
    store.dispatch({
      type: "SET_SCALE",
      payload: {
        mode: "ratio",
        units,
        pixelsPerUnit,
        distanceUnits: realUnits,
      },
    });
    return true;
  }

  function fitBackground() {
    const state = store.getState();
    if (!state.background.width || !state.background.height) {
      return;
    }
    store.dispatch({
      type: "SET_VIEW",
      payload: fitBackgroundToView(state.background, canvas.width, canvas.height),
    });
  }

  return {
    syncState,
    applyTwoPointCalibration,
    applyRatioCalibration,
    fitBackground,
  };

  function onKeyDown(event) {
    if (event.code === "Space" && !isFormField(event.target)) {
      isSpacePressed = true;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (event.code === "Space") {
      isSpacePressed = false;
    }
  }
}

function buildArcHandlePatch(state, dragState, worldPoint) {
  const sprinkler = state.sprinklers.find((item) => item.id === dragState.id);
  if (!sprinkler) {
    return null;
  }

  const angle = toDegrees(Math.atan2(worldPoint.y - sprinkler.y, worldPoint.x - sprinkler.x));
  if (!Number.isFinite(angle)) {
    return null;
  }

  const angleFromCenter = normalizeAngle(angle - sprinkler.rotationDeg);
  if (dragState.edge === "start") {
    const lockedEnd = normalizeAngle(dragState.initialStartDeg + dragState.initialSweepDeg);
    const nextSweep = normalizeAngle(lockedEnd - angleFromCenter);
    return {
      startDeg: angleFromCenter,
      sweepDeg: clamp(nextSweep || 360, 1, 359),
    };
  }

  const nextSweep = normalizeAngle(angleFromCenter - sprinkler.startDeg);
  return {
    sweepDeg: clamp(nextSweep || 360, 1, 359),
  };
}

function buildRadiusHandlePatch(state, dragState, worldPoint) {
  const sprinkler = state.sprinklers.find((item) => item.id === dragState.id);
  if (!sprinkler || !state.scale.pixelsPerUnit) {
    return null;
  }

  const radiusPixels = Math.hypot(worldPoint.x - sprinkler.x, worldPoint.y - sprinkler.y);
  if (!Number.isFinite(radiusPixels)) {
    return null;
  }

  return {
    radius: clamp(radiusPixels / state.scale.pixelsPerUnit, 0.1, 500),
  };
}

function buildStripHandlePatch(state, dragState, worldPoint, handleKind) {
  const sprinkler = state.sprinklers.find((item) => item.id === dragState.id);
  if (!sprinkler || !state.scale.pixelsPerUnit || !isStripCoverage(sprinkler)) {
    return null;
  }

  return handleKind === "secondary"
    ? buildStripSecondaryPatch(sprinkler, worldPoint, state.scale.pixelsPerUnit)
    : buildStripPrimaryPatch(sprinkler, worldPoint, state.scale.pixelsPerUnit);
}

function getCanvasPoint(event) {
  const rect = event.target.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * event.target.width,
    y: ((event.clientY - rect.top) / rect.height) * event.target.height,
  };
}

function shouldStartPan(event, activeTool, isSpacePressed) {
  return activeTool === "pan" || event.button === 1 || event.button === 2 || event.altKey || (isSpacePressed && event.button === 0);
}

function getCursorForTool(tool) {
  switch (tool) {
    case "place":
      return "crosshair";
    case "calibrate":
    case "measure":
      return "cell";
    case "pan":
      return "grab";
    default:
      return "default";
  }
}

function isFormField(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
