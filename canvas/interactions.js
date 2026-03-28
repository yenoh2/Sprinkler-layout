import { clamp, normalizeAngle, toDegrees } from "../geometry/arcs.js";
import { buildHeadTakeoffPlacementPreview, buildTargetedFittingPlacementPreview } from "../analysis/fittings-analysis.js";
import { getFittingTypeMeta, isManualFittingPlacementSupported } from "../geometry/fittings.js";
import { pointsEqual } from "../geometry/pipes.js";
import { buildStripPrimaryPatch, buildStripSecondaryPatch, isStripCoverage } from "../geometry/coverage.js";
import { computePixelsPerUnitFromPoints, fitBackgroundToView, screenToWorld, worldToScreen } from "../geometry/scale.js";

const PIPE_SNAP_SCREEN_PX = 12;
const PIPE_HANDLE_DRAG_THRESHOLD_PX = 3;

export function createInteractionController(canvas, store, renderer) {
  let dragState = null;
  let fittingPlacementState = null;
  let panState = null;
  let isSpacePressed = false;

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function syncState(state) {
    document.getElementById("hint-text").textContent = `Hint: ${state.ui.hint}`;
    canvas.style.cursor = dragState?.kind?.includes("handle") || dragState?.kind?.startsWith("pipe-") || fittingPlacementState
      ? "grabbing"
      : getCursorForTool(state.ui.activeTool);
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

    if (state.ui.activeTool === "pipe") {
      if (!state.scale.calibrated) {
        return;
      }
      const snappedPoint = getSnappedWorldPoint(state, worldPoint, {
        excludeDraftTerminal: true,
      });
      if (!state.ui.pipeDraft) {
        store.dispatch({
          type: "START_PIPE_DRAFT",
          payload: {
            kind: state.ui.pipePlacementKind,
            zoneId: state.ui.pipePlacementKind === "zone" ? state.ui.activeZoneId ?? null : null,
            diameterInches: state.ui.pipePlacementKind === "main" ? state.hydraulics.lineSizeInches : null,
            points: [snappedPoint],
          },
        });
        return;
      }

      const lastPoint = state.ui.pipeDraft.points.at(-1) ?? null;
      const shouldAppend = !pointsEqual(lastPoint, snappedPoint);
      const nextPoints = shouldAppend
        ? [...state.ui.pipeDraft.points, snappedPoint]
        : [...state.ui.pipeDraft.points];

      if (shouldAppend) {
        store.dispatch({ type: "APPEND_PIPE_DRAFT_POINT", payload: { point: snappedPoint } });
      }

      if (event.detail >= 2 && nextPoints.length >= 2) {
        commitPipeDraft(nextPoints);
      }
      return;
    }

    if (state.ui.activeTool === "valve-box") {
      if (!state.scale.calibrated) {
        return;
      }
      store.dispatch({
        type: "ADD_VALVE_BOX",
        payload: {
          id: crypto.randomUUID(),
          x: worldPoint.x,
          y: worldPoint.y,
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

    const pipeVertexHit = renderer.getPipeVertexHandleHit?.(worldPoint);
    if (pipeVertexHit) {
      store.dispatch({
        type: "SELECT_PIPE_RUN",
        payload: { id: pipeVertexHit.id, vertexIndex: pipeVertexHit.index },
      });
      dragState = {
        kind: "pipe-vertex",
        id: pipeVertexHit.id,
        index: pipeVertexHit.index,
        startScreenPoint: screenPoint,
        historyStarted: false,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const pipeMidpointHit = renderer.getPipeMidpointHandleHit?.(worldPoint);
    if (pipeMidpointHit) {
      store.dispatch({
        type: "SELECT_PIPE_RUN",
        payload: { id: pipeMidpointHit.id, vertexIndex: null },
      });
      dragState = {
        kind: "pipe-midpoint",
        id: pipeMidpointHit.id,
        index: pipeMidpointHit.index,
        startScreenPoint: screenPoint,
        historyStarted: false,
      };
      canvas.setPointerCapture(event.pointerId);
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

    const valveBoxHit = renderer.getHitValveBox?.(worldPoint);
    if (valveBoxHit) {
      store.dispatch({ type: "SELECT_VALVE_BOX", payload: { id: valveBoxHit.id } });
      dragState = {
        kind: "move-valve-box",
        id: valveBoxHit.id,
        startX: valveBoxHit.x,
        startY: valveBoxHit.y,
        lastX: valveBoxHit.x,
        lastY: valveBoxHit.y,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const fittingHit = renderer.getHitFitting?.(worldPoint) ?? null;
    const sprinklerHit = renderer.getHitSprinkler(worldPoint) ?? null;

    if (state.ui.activeTool === "fittings") {
      if (fittingHit) {
        store.dispatch({ type: "SELECT_FITTING", payload: { id: fittingHit.id } });
        return;
      }
      if (sprinklerHit) {
        store.dispatch({ type: "SELECT_SPRINKLER", payload: { id: sprinklerHit.id } });
        dragState = { kind: "move", id: sprinklerHit.id, startX: sprinklerHit.x, startY: sprinklerHit.y, lastX: sprinklerHit.x, lastY: sprinklerHit.y };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    } else {
      if (sprinklerHit) {
        store.dispatch({ type: "SELECT_SPRINKLER", payload: { id: sprinklerHit.id } });
        dragState = { kind: "move", id: sprinklerHit.id, startX: sprinklerHit.x, startY: sprinklerHit.y, lastX: sprinklerHit.x, lastY: sprinklerHit.y };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (fittingHit) {
        store.dispatch({ type: "SELECT_FITTING", payload: { id: fittingHit.id } });
        return;
      }
    }

    const pipeRunHit = renderer.getHitPipeRun?.(worldPoint);
    if (pipeRunHit) {
      store.dispatch({
        type: "SELECT_PIPE_RUN",
        payload: { id: pipeRunHit.id, vertexIndex: null },
      });
      return;
    }

    store.dispatch({ type: "SELECT_SPRINKLER", payload: { id: null } });
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
    if (state.ui.activeTool === "pipe" && state.ui.pipeDraft?.points?.length) {
      store.dispatch({
        type: "SET_PIPE_DRAFT_PREVIEW",
        payload: {
          point: getSnappedWorldPoint(state, worldPoint, {
            excludeDraftTerminal: true,
          }),
        },
      });
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

    if (!dragState) {
      return;
    }

    if (dragState.kind === "pipe-vertex") {
      updateDraggedPipeVertex(state, dragState, screenPoint, worldPoint);
      return;
    }

    if (dragState.kind === "pipe-midpoint") {
      updateDraggedPipeMidpoint(state, dragState, screenPoint, worldPoint);
      return;
    }

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

    if (dragState.kind === "move-valve-box") {
      dragState.lastX = worldPoint.x;
      dragState.lastY = worldPoint.y;
      store.dispatch({
        type: "MOVE_VALVE_BOX",
        payload: { id: dragState.id, x: worldPoint.x, y: worldPoint.y },
        meta: { skipHistory: true },
      });
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
    if (dragState?.kind === "move-valve-box" && (dragState.startX !== dragState.lastX || dragState.startY !== dragState.lastY)) {
      store.dispatch({
        type: "MOVE_VALVE_BOX",
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

  function onWindowPointerMove(event) {
    if (!fittingPlacementState || event.pointerId !== fittingPlacementState.pointerId) {
      return;
    }

    const screenPoint = getCanvasPointFromClient(canvas, event.clientX, event.clientY);
    if (!screenPoint) {
      store.dispatch({ type: "SET_CURSOR_WORLD", payload: { point: null }, meta: { skipHistory: true } });
      store.dispatch({ type: "SET_FITTING_DRAFT_PREVIEW", payload: { preview: null }, meta: { skipHistory: true } });
      return;
    }

    const state = store.getState();
    const worldPoint = screenToWorld(screenPoint, state.view);
    store.dispatch({ type: "SET_CURSOR_WORLD", payload: { point: worldPoint }, meta: { skipHistory: true } });
    store.dispatch({
      type: "SET_FITTING_DRAFT_PREVIEW",
      payload: { preview: buildFittingDraftPreview(state, state.ui.fittingDraft, worldPoint, screenPoint) },
      meta: { skipHistory: true },
    });
  }

  function onWindowPointerUp(event) {
    if (!fittingPlacementState || event.pointerId !== fittingPlacementState.pointerId) {
      return;
    }

    const state = store.getState();
    const preview = state.ui.fittingDraft?.preview ?? null;
    if (preview?.valid) {
      store.dispatch({
        type: "ADD_FITTING",
        payload: {
          id: crypto.randomUUID(),
          type: preview.type ?? state.ui.fittingDraft?.type,
          zoneId: preview.zoneId ?? null,
          sizeSpec: preview.sizeSpec ?? null,
          anchor: preview.anchor ?? null,
          x: preview.x,
          y: preview.y,
          rotationDeg: 0,
        },
      });
    }
    clearFittingPlacement();
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

  function finishPipeDraft() {
    const state = store.getState();
    if (!state.ui.pipeDraft?.points?.length || state.ui.pipeDraft.points.length < 2) {
      return false;
    }
    commitPipeDraft(state.ui.pipeDraft.points);
    return true;
  }

  function cancelPipeDraft() {
    if (!store.getState().ui.pipeDraft) {
      return false;
    }
    store.dispatch({ type: "CLEAR_PIPE_DRAFT" });
    return true;
  }

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

  function beginFittingPlacement(input, pointerEvent) {
    const state = store.getState();
    const type = input?.type;
    const isTargetedPlacement = Boolean(input?.sprinklerId || input?.targetPoint || input?.targetAnchor);
    if (!state.scale.calibrated || (!isManualFittingPlacementSupported(type) && !isTargetedPlacement)) {
      return false;
    }

    fittingPlacementState = {
      pointerId: pointerEvent?.pointerId ?? null,
      type,
    };
    store.dispatch({
      type: "START_FITTING_DRAFT",
      payload: {
        type,
        zoneMode: input?.zoneMode ?? state.ui.fittingsPanel?.zoneMode ?? "auto",
        zoneId: input?.zoneId ?? state.ui.fittingsPanel?.zoneId ?? null,
        sprinklerId: input?.sprinklerId ?? null,
        targetPoint: input?.targetPoint ?? null,
        targetAnchor: input?.targetAnchor ?? null,
        sizeSpec: input?.sizeSpec ?? null,
        label: input?.label ?? "",
      },
      meta: { skipHistory: true },
    });
    return true;
  }

  function placeSuggestedFitting(input) {
    const state = store.getState();
    const preview = buildImmediateFittingPreview(state, input);
    if (!preview?.valid) {
      return false;
    }

    store.dispatch({
      type: "ADD_FITTING",
      payload: {
        id: crypto.randomUUID(),
        type: preview.type ?? input?.type,
        zoneId: preview.zoneId ?? null,
        sizeSpec: preview.sizeSpec ?? null,
        anchor: preview.anchor ?? null,
        x: preview.x,
        y: preview.y,
        rotationDeg: 0,
      },
    });

    if (fittingPlacementState || store.getState().ui.fittingDraft) {
      clearFittingPlacement();
    }

    return true;
  }

  function cancelFittingDraft() {
    if (!fittingPlacementState && !store.getState().ui.fittingDraft) {
      return false;
    }
    clearFittingPlacement();
    return true;
  }

  return {
    syncState,
    applyTwoPointCalibration,
    applyRatioCalibration,
    fitBackground,
    finishPipeDraft,
    cancelPipeDraft,
    beginFittingPlacement,
    placeSuggestedFitting,
    cancelFittingDraft,
  };

  function clearFittingPlacement() {
    fittingPlacementState = null;
    store.dispatch({ type: "SET_CURSOR_WORLD", payload: { point: null }, meta: { skipHistory: true } });
    store.dispatch({ type: "CLEAR_FITTING_DRAFT", meta: { skipHistory: true } });
  }

  function updateDraggedPipeVertex(state, nextDragState, screenPoint, worldPoint) {
    if (!didPointerMoveEnough(nextDragState.startScreenPoint, screenPoint) && !nextDragState.historyStarted) {
      return;
    }
    const snappedPoint = getSnappedWorldPoint(store.getState(), worldPoint, {
      excludePipeRunId: nextDragState.id,
      excludeVertexIndex: nextDragState.index,
    });
    const action = {
      type: "MOVE_PIPE_VERTEX",
      payload: { id: nextDragState.id, index: nextDragState.index, point: snappedPoint },
    };
    if (!nextDragState.historyStarted) {
      nextDragState.historyStarted = true;
      store.dispatch(action);
      return;
    }
    store.dispatch({ ...action, meta: { skipHistory: true } });
  }

  function updateDraggedPipeMidpoint(state, nextDragState, screenPoint, worldPoint) {
    if (!didPointerMoveEnough(nextDragState.startScreenPoint, screenPoint) && !nextDragState.historyStarted) {
      return;
    }
    const snappedPoint = getSnappedWorldPoint(store.getState(), worldPoint, {
      excludePipeRunId: nextDragState.id,
    });
    if (!nextDragState.historyStarted) {
      nextDragState.historyStarted = true;
      nextDragState.insertedIndex = nextDragState.index + 1;
      store.dispatch({
        type: "INSERT_PIPE_VERTEX",
        payload: { id: nextDragState.id, index: nextDragState.index, point: snappedPoint },
      });
      return;
    }
    store.dispatch({
      type: "MOVE_PIPE_VERTEX",
      payload: { id: nextDragState.id, index: nextDragState.insertedIndex, point: snappedPoint },
      meta: { skipHistory: true },
    });
  }

  function commitPipeDraft(points) {
    const currentState = store.getState();
    store.dispatch({
      type: "ADD_PIPE_RUN",
      payload: {
        id: crypto.randomUUID(),
        kind: currentState.ui.pipeDraft?.kind ?? currentState.ui.pipePlacementKind,
        zoneId: currentState.ui.pipeDraft?.zoneId ?? (currentState.ui.pipePlacementKind === "zone" ? currentState.ui.activeZoneId ?? null : null),
        diameterInches: currentState.ui.pipeDraft?.diameterInches ?? (currentState.ui.pipePlacementKind === "main" ? currentState.hydraulics.lineSizeInches : null),
        points,
      },
    });
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

function getCanvasPointFromClient(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function buildFittingDraftPreview(state, fittingDraft, worldPoint, screenPoint) {
  if (!fittingDraft?.type || !worldPoint || !screenPoint) {
    return null;
  }

  if (fittingDraft.type === "head_takeoff") {
    return buildHeadTakeoffPlacementPreview(state, fittingDraft, worldPoint, screenPoint);
  }

  if (fittingDraft.targetPoint || fittingDraft.targetAnchor) {
    return buildTargetedFittingPlacementPreview(state, fittingDraft, worldPoint, screenPoint);
  }

  return {
    type: fittingDraft.type,
    label: getFittingTypeMeta(fittingDraft.type).label,
    valid: false,
    x: worldPoint.x,
    y: worldPoint.y,
    zoneId: null,
    sizeSpec: null,
    anchor: null,
  };
}

function buildImmediateFittingPreview(state, input) {
  if (!input?.type) {
    return null;
  }

  const targetPoint = input?.targetPoint ?? null;
  const screenPoint = targetPoint ? worldToScreen(targetPoint, state.view) : null;
  const fittingDraft = {
    type: input.type,
    zoneMode: input?.zoneMode ?? "auto",
    zoneId: input?.zoneId ?? null,
    sprinklerId: input?.sprinklerId ?? null,
    targetPoint,
    targetAnchor: input?.targetAnchor ?? null,
    sizeSpec: input?.sizeSpec ?? null,
    label: input?.label ?? "",
  };

  if (fittingDraft.type === "head_takeoff" && targetPoint && screenPoint) {
    return buildHeadTakeoffPlacementPreview(state, fittingDraft, targetPoint, screenPoint);
  }

  if ((fittingDraft.targetPoint || fittingDraft.targetAnchor) && targetPoint && screenPoint) {
    return buildTargetedFittingPlacementPreview(state, fittingDraft, targetPoint, screenPoint);
  }

  return null;
}

function getSnappedWorldPoint(state, worldPoint, options = {}) {
  const excludeLastDraftPoint = options.excludeDraftTerminal ? state.ui.pipeDraft?.points?.at(-1) ?? null : null;
  const candidates = [
    ...(state.sprinklers ?? []).map((sprinkler) => ({ x: sprinkler.x, y: sprinkler.y })),
    ...(state.valveBoxes ?? []).map((valveBox) => ({ x: valveBox.x, y: valveBox.y })),
    ...(state.pipeRuns ?? []).flatMap((pipeRun) =>
      pipeRun.points.filter((point, index) =>
        !(pipeRun.id === options.excludePipeRunId && index === options.excludeVertexIndex),
      ),
    ),
  ].filter((candidate) => !excludeLastDraftPoint || !pointsEqual(candidate, excludeLastDraftPoint));

  const screenPoint = worldToScreen(worldPoint, state.view);
  let bestPoint = worldPoint;
  let bestDistance = PIPE_SNAP_SCREEN_PX + 0.001;

  for (const candidate of candidates) {
    const candidateScreen = worldToScreen(candidate, state.view);
    const distance = Math.hypot(candidateScreen.x - screenPoint.x, candidateScreen.y - screenPoint.y);
    if (distance <= PIPE_SNAP_SCREEN_PX && distance < bestDistance) {
      bestDistance = distance;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}

function didPointerMoveEnough(startScreenPoint, screenPoint) {
  if (!startScreenPoint || !screenPoint) {
    return false;
  }
  return Math.hypot(screenPoint.x - startScreenPoint.x, screenPoint.y - startScreenPoint.y) >= PIPE_HANDLE_DRAG_THRESHOLD_PX;
}

function shouldStartPan(event, activeTool, isSpacePressed) {
  return activeTool === "pan" || event.button === 1 || event.button === 2 || event.altKey || (isSpacePressed && event.button === 0);
}

function getCursorForTool(tool) {
  switch (tool) {
    case "place":
    case "pipe":
    case "fittings":
    case "valve-box":
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
