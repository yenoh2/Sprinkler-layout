import { clamp, distanceBetween, normalizeAngle } from "../geometry/arcs.js";

const HISTORY_ACTIONS = new Set([
  "ADD_SPRINKLER",
  "MOVE_SPRINKLER",
  "UPDATE_SPRINKLER",
  "DELETE_SPRINKLER",
  "SET_SCALE",
  "SET_HYDRAULICS",
  "SET_BACKGROUND",
  "SET_ANALYSIS",
  "LOAD_PROJECT",
  "DUPLICATE_SPRINKLER",
  "CREATE_ZONE",
  "UPDATE_ZONE",
  "DELETE_ZONE",
  "SET_ACTIVE_ZONE",
  "SET_ZONE_VIEW_MODE",
  "SET_FOCUSED_ZONE",
]);

const ZONE_COLORS = ["#d55d3f", "#4d8b31", "#3876b4", "#9d59c1", "#d18e2f", "#2e8b85"];

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
    analysis: {
      targetDepthInches: 1,
    },
    zones: [],
    sprinklers: [],
    view: {
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      showCoverage: true,
      showGrid: false,
      showLabels: true,
      showZoneLabels: true,
      coverageOpacity: 0.22,
      zoneViewMode: "coverage",
      analysisOverlayMode: "application_rate",
      analysisZoneId: null,
      heatmapCellPx: 18,
      heatmapScaleMode: "zone",
      heatmapScaleMaxInHr: 3,
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
      activeZoneId: null,
      focusedZoneId: null,
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
      state.ui.placementPattern = ["full", "arc", "strip"].includes(action.payload.pattern)
        ? action.payload.pattern
        : "full";
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
    case "SET_ZONE_VIEW_MODE":
      state.view.zoneViewMode = action.payload.mode;
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
    case "SET_ANALYSIS":
      state.analysis = {
        ...state.analysis,
        ...sanitizeAnalysisPatch(action.payload),
      };
      return state;
    case "CREATE_ZONE": {
      const zone = {
        id: action.payload.id,
        name: action.payload.name,
        color: action.payload.color,
        visible: true,
        runtimeMinutes: null,
      };
      state.zones.push(zone);
      state.ui.activeZoneId = zone.id;
      return state;
    }
    case "UPDATE_ZONE": {
      const zone = findZone(state, action.payload.id);
      if (!zone) {
        return null;
      }
      Object.assign(zone, sanitizeZonePatch(action.payload.patch));
      return state;
    }
    case "DELETE_ZONE":
      state.zones = state.zones.filter((zone) => zone.id !== action.payload.id);
      state.sprinklers.forEach((sprinkler) => {
        if (sprinkler.zoneId === action.payload.id) {
          sprinkler.zoneId = null;
        }
      });
      if (state.ui.activeZoneId === action.payload.id) {
        state.ui.activeZoneId = null;
      }
      if (state.ui.focusedZoneId === action.payload.id) {
        state.ui.focusedZoneId = null;
      }
      return state;
    case "SET_ACTIVE_ZONE":
      state.ui.activeZoneId = action.payload.id || null;
      return state;
    case "SET_FOCUSED_ZONE":
      state.ui.focusedZoneId = action.payload.id || null;
      return state;
    case "ADD_SPRINKLER":
      state.sprinklers.push({
        id: action.payload.id,
        x: action.payload.x,
        y: action.payload.y,
        coverageModel: normalizeCoverageModel(action.payload.coverageModel),
        radius: action.payload.radius ?? 12,
        pattern: action.payload.pattern ?? "full",
        startDeg: normalizeAngle(Math.round((action.payload.startDeg ?? 0) + (action.payload.rotationDeg ?? 0))),
        sweepDeg: clamp(Math.round(action.payload.sweepDeg ?? 360), 1, 360),
        rotationDeg: 0,
        stripMode: normalizeStripMode(action.payload.stripMode),
        stripMirror: normalizeStripMirror(action.payload.stripMirror),
        stripLength: Math.max(0.1, Number(action.payload.stripLength ?? action.payload.radius ?? 15)),
        stripWidth: Math.max(0.1, Number(action.payload.stripWidth ?? 4)),
        stripRotationDeg: normalizeAngle(Math.round(Number(action.payload.stripRotationDeg ?? action.payload.startDeg ?? 0))),
        hidden: Boolean(action.payload.hidden),
        label: action.payload.label || `S-${state.sprinklers.length + 1}`,
        zoneId: action.payload.zoneId ?? state.ui.activeZoneId ?? null,
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
        label: buildCopiedSprinklerLabel(state.sprinklers, sprinkler.label),
      });
      state.ui.selectedSprinklerId = action.payload.newId;
      return state;
    }
    case "ADD_MEASURE_POINT":
      state.ui.measurePoints = appendBounded(state.ui.measurePoints, action.payload.point, 2);
      state.ui.measurePreviewPoint = null;
      return state;
    case "CLEAR_MEASURE":
      state.ui.measurePoints = [];
      state.ui.measurePreviewPoint = null;
      state.ui.measureDistance = null;
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
  if (!patch) {
    return {};
  }

  const sanitized = {};

  if ("x" in patch) {
    sanitized.x = Number(patch.x);
  }
  if ("y" in patch) {
    sanitized.y = Number(patch.y);
  }
  if ("radius" in patch) {
    sanitized.radius = Math.max(0.1, Number(patch.radius));
  }
  if ("coverageModel" in patch) {
    sanitized.coverageModel = normalizeCoverageModel(patch.coverageModel);
  }
  if ("pattern" in patch) {
    sanitized.pattern = patch.pattern === "arc" ? "arc" : "full";
  }
  if ("startDeg" in patch) {
    sanitized.startDeg = normalizeAngle(Math.round(Number(patch.startDeg ?? 0)));
  }
  if ("sweepDeg" in patch) {
    sanitized.sweepDeg = clamp(Math.round(Number(patch.sweepDeg ?? 360)), 1, 360);
  }
  if ("rotationDeg" in patch) {
    sanitized.rotationDeg = 0;
  }
  if ("hidden" in patch) {
    sanitized.hidden = Boolean(patch.hidden);
  }
  if ("stripMode" in patch) {
    sanitized.stripMode = normalizeStripMode(patch.stripMode);
  }
  if ("stripMirror" in patch) {
    sanitized.stripMirror = normalizeStripMirror(patch.stripMirror);
  }
  if ("stripLength" in patch) {
    sanitized.stripLength = Math.max(0.1, Number(patch.stripLength));
  }
  if ("stripWidth" in patch) {
    sanitized.stripWidth = Math.max(0.1, Number(patch.stripWidth));
  }
  if ("stripRotationDeg" in patch) {
    sanitized.stripRotationDeg = normalizeAngle(Math.round(Number(patch.stripRotationDeg ?? 0)));
  }
  if ("zoneId" in patch) {
    sanitized.zoneId = patch.zoneId || null;
  }
  if ("label" in patch) {
    sanitized.label = patch.label;
  }

  return sanitized;
}

function sanitizeZonePatch(patch) {
  if (!patch) {
    return {};
  }

  const sanitized = {};

  if ("name" in patch) {
    sanitized.name = patch.name || "Untitled Zone";
  }
  if ("color" in patch) {
    sanitized.color = patch.color;
  }
  if ("visible" in patch) {
    sanitized.visible = Boolean(patch.visible);
  }
  if ("runtimeMinutes" in patch) {
    const runtime = Number(patch.runtimeMinutes);
    sanitized.runtimeMinutes = Number.isFinite(runtime) && runtime > 0 ? runtime : null;
  }

  return sanitized;
}

function sanitizeAnalysisPatch(patch) {
  if (!patch) {
    return {};
  }

  const sanitized = {};
  if ("targetDepthInches" in patch) {
    const targetDepth = Number(patch.targetDepthInches);
    sanitized.targetDepthInches = Number.isFinite(targetDepth) && targetDepth > 0 ? targetDepth : 1;
  }
  return sanitized;
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
  if (state.ui.activeTool === "measure" && state.ui.measurePoints.length >= 2) {
    return "Click to start a new measurement, or press Esc to clear.";
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
  if (state.ui.activeTool === "place" && state.ui.placementPattern === "strip") {
    return "Click and drag to place a strip sprinkler, then fine-tune width or type from the selected head controls.";
  }
  return `Ready to place sprinklers. ${state.sprinklers.length} head${state.sprinklers.length === 1 ? "" : "s"} on plan.`;
}

function normalizeLoadedProject(project) {
  const initial = createInitialState();
  const normalizedView = normalizeView({ ...initial.view, ...project.view });
  const merged = {
    ...initial,
    ...project,
    meta: { ...initial.meta, ...project.meta },
    background: { ...initial.background, ...project.background },
    scale: { ...initial.scale, ...project.scale },
    hydraulics: { ...initial.hydraulics, ...project.hydraulics },
    analysis: { ...initial.analysis, ...sanitizeAnalysisPatch(project.analysis) },
    zones: Array.isArray(project.zones) ? project.zones.map(normalizeZone) : [],
    view: normalizedView,
    ui: { ...initial.ui, ...project.ui, measurePreviewPoint: null },
    sprinklers: Array.isArray(project.sprinklers) ? project.sprinklers.map(normalizeSprinkler) : [],
  };
  merged.ui.placementPattern = ["full", "arc", "strip"].includes(merged.ui.placementPattern)
    ? merged.ui.placementPattern
    : "full";
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

export function buildCopiedSprinklerLabel(sprinklers, sourceLabel) {
  const rootLabel = String(sourceLabel || "Sprinkler").replace(/ copy(?: \d+)?$/i, "");
  const baseLabel = `${rootLabel} copy`;
  const existingLabels = new Set((sprinklers ?? []).map((sprinkler) => sprinkler.label));
  if (!existingLabels.has(baseLabel)) {
    return baseLabel;
  }

  let suffix = 2;
  while (existingLabels.has(`${baseLabel} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseLabel} ${suffix}`;
}

export function hasHydraulics(state) {
  return Number(state.hydraulics.lineSizeInches) > 0 && Number(state.hydraulics.pressurePsi) > 0;
}

export function isProjectReady(state) {
  return Boolean(state.background.src) && state.scale.calibrated && hasHydraulics(state);
}

export function getZoneById(state, id) {
  return findZone(state, id);
}

export function getZoneColorById(state, id) {
  return findZone(state, id)?.color || "#2f2418";
}

export function getNextZoneSeed(state) {
  return {
    name: `Zone ${state.zones.length + 1}`,
    color: ZONE_COLORS[state.zones.length % ZONE_COLORS.length],
  };
}

function findZone(state, id) {
  return state.zones.find((zone) => zone.id === id) || null;
}

function normalizeSprinkler(sprinkler) {
  const x = Number(sprinkler?.x);
  const y = Number(sprinkler?.y);
  const radius = Number(sprinkler?.radius);
  const startDeg = Number(sprinkler?.startDeg);
  const sweepDeg = Number(sprinkler?.sweepDeg);
  const rotationDeg = Number(sprinkler?.rotationDeg);
  const effectiveStartDeg = normalizeAngle(
    (Number.isFinite(startDeg) ? Math.round(startDeg) : 0) +
    (Number.isFinite(rotationDeg) ? Math.round(rotationDeg) : 0)
  );

  return {
    id: sprinkler?.id || crypto.randomUUID(),
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    coverageModel: normalizeCoverageModel(sprinkler?.coverageModel),
    radius: Number.isFinite(radius) ? Math.max(0.1, radius) : 12,
    pattern: sprinkler?.pattern === "arc" ? "arc" : "full",
    startDeg: effectiveStartDeg,
    sweepDeg: Number.isFinite(sweepDeg) ? clamp(Math.round(sweepDeg), 1, 360) : 360,
    rotationDeg: 0,
    stripMode: normalizeStripMode(sprinkler?.stripMode),
    stripMirror: normalizeStripMirror(sprinkler?.stripMirror),
    stripLength: Number.isFinite(Number(sprinkler?.stripLength)) ? Math.max(0.1, Number(sprinkler.stripLength)) : 15,
    stripWidth: Number.isFinite(Number(sprinkler?.stripWidth)) ? Math.max(0.1, Number(sprinkler.stripWidth)) : 4,
    stripRotationDeg: normalizeAngle(Number(sprinkler?.stripRotationDeg ?? startDeg ?? 0)),
    hidden: Boolean(sprinkler?.hidden),
    label: sprinkler?.label || "Sprinkler",
    zoneId: sprinkler?.zoneId || null,
  };
}

function normalizeZone(zone) {
  return {
    id: zone?.id || crypto.randomUUID(),
    name: zone?.name || "Untitled Zone",
    color: zone?.color || ZONE_COLORS[0],
    visible: "visible" in (zone ?? {}) ? Boolean(zone.visible) : true,
    runtimeMinutes: Number.isFinite(Number(zone?.runtimeMinutes)) && Number(zone.runtimeMinutes) > 0
      ? Number(zone.runtimeMinutes)
      : null,
  };
}

function normalizeView(view) {
  const normalized = { ...view };

  if (normalized.zoneViewMode === "heatmap") {
    normalized.zoneViewMode = "coverage";
    normalized.analysisOverlayMode = "application_rate";
  }

  if (!["coverage", "zone"].includes(normalized.zoneViewMode)) {
    normalized.zoneViewMode = "coverage";
  }

  if (!["none", "application_rate", "zone_catch_can", "full_schedule_depth", "target_error"].includes(normalized.analysisOverlayMode)) {
    normalized.analysisOverlayMode = "application_rate";
  }

  normalized.analysisZoneId = normalized.analysisZoneId || null;
  normalized.heatmapCellPx = Number.isFinite(Number(normalized.heatmapCellPx))
    ? Math.max(6, Number(normalized.heatmapCellPx))
    : 18;
  normalized.heatmapScaleMode = ["zone", "project", "fixed"].includes(normalized.heatmapScaleMode)
    ? normalized.heatmapScaleMode
    : "zone";
  normalized.heatmapScaleMaxInHr = Number.isFinite(Number(normalized.heatmapScaleMaxInHr)) && Number(normalized.heatmapScaleMaxInHr) > 0
    ? Number(normalized.heatmapScaleMaxInHr)
    : 3;

  return normalized;
}

function normalizeCoverageModel(value) {
  return value === "strip" ? "strip" : "sector";
}

function normalizeStripMode(value) {
  return ["end", "side", "center", "corner"].includes(value) ? value : "end";
}

function normalizeStripMirror(value) {
  return value === "left" ? "left" : "right";
}
