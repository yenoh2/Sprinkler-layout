import { clamp, distanceBetween, normalizeAngle } from "../geometry/arcs.js";

const HISTORY_ACTIONS = new Set([
  "ADD_SPRINKLER",
  "MOVE_SPRINKLER",
  "UPDATE_SPRINKLER",
  "DELETE_SPRINKLER",
  "SET_SCALE",
  "SET_HYDRAULICS",
  "SET_BACKGROUND",
  "LOAD_PROJECT",
  "DUPLICATE_SPRINKLER",
]);

export function createInitialState() {
  return {
    meta: {
      projectName: "Sprinkler Layout",
      units: "ft",
      version: "1.0",
    },
    background: {
      src: "",
      width: 0,
      height: 0,
      name: "",
    },
    scale: {
      mode: "twoPoint",
      units: "ft",
      pixelsPerUnit: 0,
      calibrated: false,
      calibrationPoints: [],
      distanceUnits: 10,
    },
    hydraulics: {
      lineSizeInches: null,
      pressurePsi: null,
    },
    sprinklers: [],
    view: {
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      showCoverage: true,
      showGrid: false,
      showLabels: true,
      coverageOpacity: 0.22,
    },
    history: {
      undoStack: [],
      redoStack: [],
    },
    ui: {
      activeTool: "select",
      placementPattern: "full",
      selectedSprinklerId: null,
      hint: "Import an image, calibrate scale, then place sprinklers.",
      measurePoints: [],
      measurePreviewPoint: null,
      measureDistance: null,
      cursorWorld: null,
    },
  };
}

export function createStore(initialState) {
  let state = initialState;
  const subscribers = new Set();

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispatch(action) {
      const nextState = reduceState(state, action);
      if (nextState === state) {
        return;
      }
      state = nextState;
      subscribers.forEach((listener) => listener(state, action));
    },
  };
}

function reduceState(state, action) {
  if (action.type === "UNDO") {
    return undo(state);
  }
  if (action.type === "REDO") {
    return redo(state);
  }

  const working = structuredClone(state);
  const next = applyAction(working, action);
  if (!next) {
    return state;
  }

  if (HISTORY_ACTIONS.has(action.type) && !action.meta?.skipHistory) {
    next.history.undoStack = [...state.history.undoStack, cloneProjectSnapshot(state)];
    next.history.redoStack = [];
  } else {
    next.history = state.history;
  }

  next.meta.units = next.scale.units;
  next.ui.measureDistance = calculateMeasureDistance(next);
  next.ui.hint = buildHint(next);
  return next;
}

function applyAction(state, action) {
  switch (action.type) {
    case "SET_ACTIVE_TOOL":
      state.ui.activeTool = action.payload.tool;
      if (action.payload.tool !== "measure") {
        state.ui.measurePoints = [];
        state.ui.measurePreviewPoint = null;
        state.ui.measureDistance = null;
      }
      return state;
    case "SET_PLACEMENT_PATTERN":
      state.ui.placementPattern = action.payload.pattern;
      return state;
    case "SET_CURSOR_WORLD":
      state.ui.cursorWorld = action.payload.point;
      return state;
    case "SET_PROJECT_NAME":
      state.meta.projectName = action.payload.name || "Sprinkler Layout";
      return state;
    case "SET_UNITS":
      state.scale.units = action.payload.units;
      return state;
    case "SET_VIEW":
      state.view = { ...state.view, ...action.payload };
      return state;
    case "RESET_VIEW":
      state.view.offsetX = 0;
      state.view.offsetY = 0;
      state.view.zoom = 1;
      return state;
    case "SET_BACKGROUND":
      state.background = { ...action.payload };
      state.ui.selectedSprinklerId = null;
      return state;
    case "ADD_CALIBRATION_POINT":
      state.scale.calibrationPoints = appendBounded(state.scale.calibrationPoints, action.payload.point, 2);
      return state;
    case "SET_SCALE":
      state.scale = {
        ...state.scale,
        ...action.payload,
        calibrated: action.payload.pixelsPerUnit > 0,
      };
      return state;
    case "SET_HYDRAULICS":
      state.hydraulics = {
        lineSizeInches: action.payload.lineSizeInches ?? null,
        pressurePsi: action.payload.pressurePsi ?? null,
      };
      return state;
    case "ADD_SPRINKLER":
      state.sprinklers.push({
        id: action.payload.id,
        x: action.payload.x,
        y: action.payload.y,
        radius: action.payload.radius ?? 12,
        pattern: action.payload.pattern ?? "full",
        startDeg: normalizeAngle(action.payload.startDeg ?? 0),
        sweepDeg: clamp(action.payload.sweepDeg ?? 360, 1, 360),
        rotationDeg: normalizeAngle(action.payload.rotationDeg ?? 0),
        hidden: Boolean(action.payload.hidden),
        label: action.payload.label || `S-${state.sprinklers.length + 1}`,
      });
      state.ui.selectedSprinklerId = action.payload.id;
      return state;
    case "MOVE_SPRINKLER": {
      const sprinkler = findSprinkler(state, action.payload.id);
      if (!sprinkler) {
        return null;
      }
      sprinkler.x = action.payload.x;
      sprinkler.y = action.payload.y;
      return state;
    }
    case "UPDATE_SPRINKLER": {
      const sprinkler = findSprinkler(state, action.payload.id);
      if (!sprinkler) {
        return null;
      }
      Object.assign(sprinkler, sanitizePatch(action.payload.patch));
      return state;
    }
    case "DELETE_SPRINKLER":
      state.sprinklers = state.sprinklers.filter((sprinkler) => sprinkler.id !== action.payload.id);
      if (state.ui.selectedSprinklerId === action.payload.id) {
        state.ui.selectedSprinklerId = null;
      }
      return state;
    case "SELECT_SPRINKLER":
      state.ui.selectedSprinklerId = action.payload.id;
      return state;
    case "DUPLICATE_SPRINKLER": {
      const sprinkler = findSprinkler(state, action.payload.id);
      if (!sprinkler) {
        return null;
      }
      state.sprinklers.push({
        ...structuredClone(sprinkler),
        id: action.payload.newId,
        x: sprinkler.x + 1,
        y: sprinkler.y + 1,
        label: `${sprinkler.label} copy`,
      });
      state.ui.selectedSprinklerId = action.payload.newId;
      return state;
    }
    case "ADD_MEASURE_POINT":
      state.ui.measurePoints = appendBounded(state.ui.measurePoints, action.payload.point, 2);
      state.ui.measurePreviewPoint = null;
      return state;
    case "SET_MEASURE_PREVIEW":
      state.ui.measurePreviewPoint = action.payload.point;
      return state;
    case "LOAD_PROJECT":
      return normalizeLoadedProject(action.payload.project);
    default:
      return null;
  }
}

function undo(state) {
  if (!state.history.undoStack.length) {
    return state;
  }
  const previous = structuredClone(state.history.undoStack[state.history.undoStack.length - 1]);
  previous.history.undoStack = state.history.undoStack.slice(0, -1);
  previous.history.redoStack = [...state.history.redoStack, cloneProjectSnapshot(state)];
  previous.ui.measureDistance = calculateMeasureDistance(previous);
  previous.ui.hint = buildHint(previous);
  return previous;
}

function redo(state) {
  if (!state.history.redoStack.length) {
    return state;
  }
  const next = structuredClone(state.history.redoStack[state.history.redoStack.length - 1]);
  next.history.undoStack = [...state.history.undoStack, cloneProjectSnapshot(state)];
  next.history.redoStack = state.history.redoStack.slice(0, -1);
  next.ui.measureDistance = calculateMeasureDistance(next);
  next.ui.hint = buildHint(next);
  return next;
}

function sanitizePatch(patch) {
  return {
    ...patch,
    x: Number(patch.x),
    y: Number(patch.y),
    radius: Math.max(0.1, Number(patch.radius)),
    pattern: patch.pattern === "arc" ? "arc" : "full",
    startDeg: normalizeAngle(Number(patch.startDeg ?? 0)),
    sweepDeg: clamp(Number(patch.sweepDeg ?? 360), 1, 360),
    rotationDeg: normalizeAngle(Number(patch.rotationDeg ?? 0)),
    hidden: Boolean(patch.hidden),
  };
}

function appendBounded(items, item, limit) {
  return [...items, item].slice(-limit);
}

function calculateMeasureDistance(state) {
  if (!state.scale.pixelsPerUnit) {
    return null;
  }
  if (state.ui.measurePoints.length >= 2) {
    return distanceBetween(state.ui.measurePoints[0], state.ui.measurePoints[1]) / state.scale.pixelsPerUnit;
  }
  if (state.ui.measurePoints.length === 1 && state.ui.measurePreviewPoint) {
    return distanceBetween(state.ui.measurePoints[0], state.ui.measurePreviewPoint) / state.scale.pixelsPerUnit;
  }
  return null;
}

function buildHint(state) {
  if (state.ui.activeTool === "measure" && state.ui.measurePoints.length === 1) {
    return "Move the cursor to preview distance, then click the second point.";
  }
  if (!state.background.src) {
    return "Import a yard image to begin.";
  }
  if (!state.scale.calibrated) {
    return "Calibrate the drawing before placing sprinklers.";
  }
  if (!hasHydraulics(state)) {
    return "Enter line size and pressure before layout review.";
  }
  return `Ready to place sprinklers. ${state.sprinklers.length} head${state.sprinklers.length === 1 ? "" : "s"} on plan.`;
}

function normalizeLoadedProject(project) {
  const initial = createInitialState();
  const merged = {
    ...initial,
    ...project,
    meta: { ...initial.meta, ...project.meta },
    background: { ...initial.background, ...project.background },
    scale: { ...initial.scale, ...project.scale },
    hydraulics: { ...initial.hydraulics, ...project.hydraulics },
    view: { ...initial.view, ...project.view },
    ui: { ...initial.ui, ...project.ui, measurePreviewPoint: null },
    sprinklers: Array.isArray(project.sprinklers) ? project.sprinklers : [],
  };
  merged.history = { undoStack: [], redoStack: [] };
  return merged;
}

function findSprinkler(state, id) {
  return state.sprinklers.find((sprinkler) => sprinkler.id === id) || null;
}

export function findSelectedSprinkler(state) {
  return findSprinkler(state, state.ui.selectedSprinklerId);
}

export function cloneProjectSnapshot(state) {
  const snapshot = structuredClone(state);
  snapshot.history = { undoStack: [], redoStack: [] };
  return snapshot;
}

export function hasHydraulics(state) {
  return Number(state.hydraulics.lineSizeInches) > 0 && Number(state.hydraulics.pressurePsi) > 0;
}

export function isProjectReady(state) {
  return Boolean(state.background.src) && state.scale.calibrated && hasHydraulics(state);
}
