import { clamp } from "../geometry/arcs.js";
import { computePixelsPerUnitFromPoints, fitBackgroundToView, screenToWorld } from "../geometry/scale.js";

export function createInteractionController(canvas, store, renderer) {
  let dragState = null;
  let panState = null;

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function syncState(state) {
    document.getElementById("hint-text").textContent = `Hint: ${state.ui.hint}`;
  }

  function onPointerDown(event) {
    const state = store.getState();
    const screenPoint = getCanvasPoint(event);
    const worldPoint = screenToWorld(screenPoint, state.view);

    if (event.button === 1 || event.button === 2 || event.altKey) {
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
      store.dispatch({ type: "ADD_MEASURE_POINT", payload: { point: worldPoint } });
      return;
    }

    const hit = renderer.getHitSprinkler(worldPoint);
    store.dispatch({ type: "SELECT_SPRINKLER", payload: { id: hit?.id ?? null } });
    if (hit) {
      dragState = { id: hit.id, startX: hit.x, startY: hit.y, lastX: hit.x, lastY: hit.y };
      canvas.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event) {
    const state = store.getState();
    const screenPoint = getCanvasPoint(event);
    const worldPoint = screenToWorld(screenPoint, state.view);
    store.dispatch({ type: "SET_CURSOR_WORLD", payload: { point: worldPoint } });

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
    if (dragState && (dragState.startX !== dragState.lastX || dragState.startY !== dragState.lastY)) {
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
}

function getCanvasPoint(event) {
  const rect = event.target.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * event.target.width,
    y: ((event.clientY - rect.top) / rect.height) * event.target.height,
  };
}
