import { clamp, distanceBetween, normalizeAngle } from "../geometry/arcs.js";
import { normalizeFittingType, normalizeFittingsPanelTab } from "../geometry/fittings.js";
import { distancePointToSegmentSquared, normalizePipeKind, normalizePipePoints } from "../geometry/pipes.js";
import { applyHomography, sanitizeReferenceDimension } from "../geometry/rectification.js";
import { computePixelsPerUnitFromPoints } from "../geometry/scale.js";
import { normalizeWateringAreaPoints } from "../geometry/watering-areas.js";
import { normalizeWireGauge, normalizeWireKind, sanitizeWireColorCode, sanitizeWireConductorCount } from "../geometry/wires.js";

const HEAD_CONNECTION_PIPE_EPSILON_PX = 3;
const HEAD_CONNECTION_PIPE_TOLERANCE_FT = 2 / 12;
const MAX_UNDO_DEPTH = 50;
const DEFAULT_SPRINKLER_RADIUS_FT = 12;
const DEFAULT_STRIP_LENGTH_FT = 15;
const DEFAULT_STRIP_WIDTH_FT = 4;
const VALID_TOOLS = ["select", "place", "area", "pipe", "wire", "fittings", "valve-box", "controller", "calibrate", "measure", "pan"];
const ANALYSIS_NOZZLE_SELECTION_MODES = new Set(["conventional", "optimized"]);

const HISTORY_ACTIONS = new Set([
  "ADD_SPRINKLER",
  "MOVE_SPRINKLER",
  "UPDATE_SPRINKLER",
  "DELETE_SPRINKLER",
  "ADD_WATERING_AREA",
  "UPDATE_WATERING_AREA",
  "DELETE_WATERING_AREA",
  "MOVE_WATERING_AREA_VERTEX",
  "INSERT_WATERING_AREA_VERTEX",
  "DELETE_WATERING_AREA_VERTEX",
  "ADD_VALVE_BOX",
  "MOVE_VALVE_BOX",
  "UPDATE_VALVE_BOX",
  "DELETE_VALVE_BOX",
  "ADD_CONTROLLER",
  "MOVE_CONTROLLER",
  "UPDATE_CONTROLLER",
  "DELETE_CONTROLLER",
  "ADD_PIPE_RUN",
  "UPDATE_PIPE_RUN",
  "DELETE_PIPE_RUN",
  "ADD_WIRE_RUN",
  "UPDATE_WIRE_RUN",
  "DELETE_WIRE_RUN",
  "ADD_FITTING",
  "UPDATE_FITTING",
  "DELETE_FITTING",
  "MOVE_PIPE_VERTEX",
  "INSERT_PIPE_VERTEX",
  "DELETE_PIPE_VERTEX",
  "MOVE_WIRE_VERTEX",
  "INSERT_WIRE_VERTEX",
  "DELETE_WIRE_VERTEX",
  "SET_SCALE",
  "SET_HYDRAULICS",
  "SET_BACKGROUND",
  "APPLY_BACKGROUND_RECTIFICATION",
  "SET_ANALYSIS",
  "LOAD_PROJECT",
  "DUPLICATE_SPRINKLER",
  "CREATE_ZONE",
  "UPDATE_ZONE",
  "DELETE_ZONE",
  "SET_ACTIVE_ZONE",
  "SET_ZONE_VIEW_MODE",
  "SET_FOCUSED_ZONE",
  "SET_ALL_ZONES_PARTS_INCLUSION",
]);

const ZONE_COLORS = [
  "#d55d3f", "#4d8b31", "#3876b4", "#9d59c1", "#d18e2f", "#2e8b85",
  "#c4456d", "#5c83cc", "#73a33d", "#cc8833", "#7a5cc6", "#3da3a3",
  "#c96347", "#4d7a8b",
];

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
      sourceSrc: "",
      sourceWidth: 0,
      sourceHeight: 0,
      rectification: {
        enabled: false,
        referenceWidth: 10,
        referenceHeight: 10,
        outputWidth: 0,
        outputHeight: 0,
        matrix: null,
        inverseMatrix: null,
      },
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
      designFlowLimitGpm: null,
    },
    analysis: {
      targetDepthInches: 1,
      nozzleSelectionMode: "optimized",
    },
    parts: {
      groupBy: "body_nozzle_split",
      scopeMode: "included_zones_only",
      showZoneUsage: true,
    },
    zones: [],
    sprinklers: [],
    wateringAreas: [],
    valveBoxes: [],
    controllers: [],
    pipeRuns: [],
    wireRuns: [],
    fittings: [],
    view: {
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      showCoverage: true,
      showPipe: true,
      showTrench: false,
      showWire: true,
      showFittings: true,
      showGrid: false,
      showLabels: true,
      showNozzleLabels: false,
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
      pipePlacementKind: "zone",
      wirePlacementKind: "multiconductor",
      selectedSprinklerId: null,
      selectedWateringAreaId: null,
      selectedWateringAreaVertexIndex: null,
      selectedValveBoxId: null,
      selectedControllerId: null,
      selectedPipeRunId: null,
      selectedWireRunId: null,
      selectedFittingId: null,
      selectedPipeVertexIndex: null,
      selectedWireVertexIndex: null,
      hint: "Import an image, calibrate scale, then place sprinklers.",
      measurePoints: [],
      measurePreviewPoint: null,
      measureDistance: null,
      fittingDraft: null,
      pipeDraft: null,
      wireDraft: null,
      wateringAreaDraft: null,
      cursorWorld: null,
      activeZoneId: null,
      focusedZoneId: null,
      expandedZoneIds: [],
      appScreen: "layout",
      calibrationMode: "scale",
      rectificationPoints: [],
      fittingsPanel: {
        x: 28,
        y: 28,
        tab: "suggested",
        zoneMode: "auto",
        zoneId: null,
      },
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

  const working = cloneMutableState(state);
  const next = applyAction(working, action);
  if (!next) {
    return state;
  }

  if (HISTORY_ACTIONS.has(action.type) && !action.meta?.skipHistory) {
    const newUndoStack = [...state.history.undoStack, cloneProjectSnapshot(state)];
    next.history.undoStack = newUndoStack.length > MAX_UNDO_DEPTH
      ? newUndoStack.slice(newUndoStack.length - MAX_UNDO_DEPTH)
      : newUndoStack;
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
      state.ui.activeTool = VALID_TOOLS.includes(action.payload.tool)
        ? action.payload.tool
        : "select";
      if (action.payload.tool !== "measure") {
        state.ui.measurePoints = [];
        state.ui.measurePreviewPoint = null;
        state.ui.measureDistance = null;
      }
      if (action.payload.tool !== "fittings") {
        state.ui.fittingDraft = null;
      }
      if (action.payload.tool !== "pipe") {
        state.ui.pipeDraft = null;
        state.ui.selectedPipeVertexIndex = null;
      }
      if (action.payload.tool !== "wire") {
        state.ui.wireDraft = null;
        state.ui.selectedWireVertexIndex = null;
      }
      if (action.payload.tool !== "area") {
        state.ui.wateringAreaDraft = null;
      }
      return state;
    case "SET_CALIBRATION_MODE":
      state.ui.calibrationMode = normalizeCalibrationMode(action.payload.mode);
      return state;
    case "SET_PLACEMENT_PATTERN":
      state.ui.placementPattern = normalizePlacementPattern(action.payload.pattern);
      return state;
    case "SET_PIPE_PLACEMENT_KIND":
      state.ui.pipePlacementKind = normalizePipeKind(action.payload.kind);
      return state;
    case "SET_WIRE_PLACEMENT_KIND":
      state.ui.wirePlacementKind = normalizeWireKind(action.payload.kind);
      return state;
    case "SET_APP_SCREEN":
      state.ui.appScreen = action.payload.screen === "parts" ? "parts" : "layout";
      return state;
    case "SET_CURSOR_WORLD":
      state.ui.cursorWorld = action.payload.point;
      return state;
    case "SET_PROJECT_NAME":
      state.meta.projectName = action.payload.name || "Sprinkler Layout";
      return state;
    case "SET_UNITS":
      state.scale.units = normalizeUnits(action.payload.units);
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
      state.background = normalizeBackgroundPayload(action.payload, createInitialState().background);
      clearAllSelections(state.ui);
      state.ui.pipeDraft = null;
      state.ui.wireDraft = null;
      state.ui.rectificationPoints = [];
      state.ui.calibrationMode = "scale";
      return state;
    case "ADD_RECTIFICATION_POINT":
      if (state.ui.rectificationPoints.length >= 4) {
        state.ui.rectificationPoints = [action.payload.point];
        return state;
      }
      state.ui.rectificationPoints = appendBounded(state.ui.rectificationPoints, action.payload.point, 4);
      return state;
    case "CLEAR_RECTIFICATION_POINTS":
      state.ui.rectificationPoints = [];
      return state;
    case "ADD_CALIBRATION_POINT":
      if (state.scale.calibrationPoints.length >= 2) {
        state.scale.calibrationPoints = [action.payload.point];
        return state;
      }
      state.scale.calibrationPoints = appendBounded(state.scale.calibrationPoints, action.payload.point, 2);
      return state;
    case "CLEAR_CALIBRATION_POINTS":
      state.scale.calibrationPoints = [];
      return state;
    case "SET_SCALE":
      applyScalePatch(state, action.payload);
      return state;
    case "APPLY_BACKGROUND_RECTIFICATION":
      applyBackgroundRectification(state, action.payload);
      return state;
    case "SET_HYDRAULICS":
      state.hydraulics = {
        ...state.hydraulics,
        ...sanitizeHydraulicsPatch(action.payload),
      };
      return state;
    case "SET_ANALYSIS":
      state.analysis = {
        ...state.analysis,
        ...sanitizeAnalysisPatch(action.payload),
      };
      return state;
    case "SET_PARTS_VIEW":
      state.parts = {
        ...state.parts,
        ...sanitizePartsPatch(action.payload),
      };
      return state;
    case "CREATE_ZONE": {
      const zone = {
        id: action.payload.id,
        name: action.payload.name,
        color: action.payload.color,
        visible: true,
        runtimeMinutes: null,
        runtimeGroupName: null,
        includeInPartsList: true,
        valveBoxId: null,
        controllerId: null,
        stationNumber: null,
      };
      state.zones.unshift(zone);
      state.ui.activeZoneId = zone.id;
      state.ui.expandedZoneIds = [zone.id, ...(state.ui.expandedZoneIds ?? []).filter((zoneId) => zoneId !== zone.id)];
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
      state.pipeRuns.forEach((pipeRun) => {
        if (pipeRun.zoneId === action.payload.id) {
          pipeRun.zoneId = null;
        }
      });
      state.fittings.forEach((fitting) => {
        if (fitting.zoneId === action.payload.id) {
          fitting.zoneId = null;
        }
      });
      if (state.ui.activeZoneId === action.payload.id) {
        state.ui.activeZoneId = null;
      }
      if (state.ui.focusedZoneId === action.payload.id) {
        state.ui.focusedZoneId = null;
      }
      state.ui.expandedZoneIds = (state.ui.expandedZoneIds ?? []).filter((zoneId) => zoneId !== action.payload.id);
      return state;
    case "SET_ACTIVE_ZONE":
      state.ui.activeZoneId = action.payload.id || null;
      return state;
    case "SET_FOCUSED_ZONE":
      state.ui.focusedZoneId = action.payload.id || null;
      return state;
    case "SET_ZONE_PANEL_EXPANDED": {
      const zoneId = action.payload.id;
      if (!zoneId) {
        return state;
      }
      const expandedIds = new Set(state.ui.expandedZoneIds ?? []);
      if (action.payload.expanded) {
        expandedIds.add(zoneId);
      } else {
        expandedIds.delete(zoneId);
      }
      state.ui.expandedZoneIds = [...expandedIds];
      return state;
    }
    case "SET_ALL_ZONES_PARTS_INCLUSION":
      state.zones.forEach((zone) => {
        zone.includeInPartsList = Boolean(action.payload.includeInPartsList);
      });
      return state;
    case "ADD_SPRINKLER": {
      const radius = sanitizePositiveQuantity(action.payload.radius, getDefaultSprinklerRadius(state.scale.units));
      const fallbackStripLength = action.payload.radius == null
        ? getDefaultStripLength(state.scale.units)
        : sanitizePositiveQuantity(action.payload.radius, getDefaultStripLength(state.scale.units));
      state.sprinklers.push({
        id: action.payload.id,
        x: action.payload.x,
        y: action.payload.y,
        coverageModel: normalizeCoverageModel(action.payload.coverageModel),
        radius,
        pattern: action.payload.pattern ?? "full",
        startDeg: normalizeAngle(Math.round((action.payload.startDeg ?? 0) + (action.payload.rotationDeg ?? 0))),
        sweepDeg: clamp(Math.round(action.payload.sweepDeg ?? 360), 1, 360),
        rotationDeg: 0,
        stripMode: normalizeStripMode(action.payload.stripMode),
        stripMirror: normalizeStripMirror(action.payload.stripMirror),
        stripLength: sanitizePositiveQuantity(action.payload.stripLength, fallbackStripLength),
        stripWidth: sanitizePositiveQuantity(action.payload.stripWidth, getDefaultStripWidth(state.scale.units)),
        stripRotationDeg: normalizeAngle(Math.round(Number(action.payload.stripRotationDeg ?? action.payload.startDeg ?? 0))),
        hidden: Boolean(action.payload.hidden),
        label: action.payload.label || `S-${state.sprinklers.length + 1}`,
        zoneId: action.payload.zoneId ?? state.ui.activeZoneId ?? null,
      });
      clearAllSelections(state.ui);
      state.ui.selectedSprinklerId = action.payload.id;
      return state;
    }
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
      detachFittingAnchors(state.fittings, "sprinkler", action.payload.id);
      if (state.ui.selectedSprinklerId === action.payload.id) {
        state.ui.selectedSprinklerId = null;
      }
      return state;
    case "SELECT_SPRINKLER":
      clearAllSelections(state.ui);
      state.ui.selectedSprinklerId = action.payload.id;
      return state;
    case "DUPLICATE_SPRINKLER": {
      const sprinkler = findSprinkler(state, action.payload.id);
      if (!sprinkler) {
        return null;
      }
      state.sprinklers.push({
        ...sprinkler,
        id: action.payload.newId,
        x: sprinkler.x + 1,
        y: sprinkler.y + 1,
        label: buildCopiedSprinklerLabel(state.sprinklers, sprinkler.label),
      });
      clearAllSelections(state.ui);
      state.ui.selectedSprinklerId = action.payload.newId;
      return state;
    }
    case "START_WATERING_AREA_DRAFT":
      state.ui.wateringAreaDraft = {
        points: normalizeWateringAreaPoints(action.payload.points),
        previewPoint: null,
      };
      clearAllSelections(state.ui);
      return state;
    case "APPEND_WATERING_AREA_DRAFT_POINT":
      if (!state.ui.wateringAreaDraft) {
        return null;
      }
      state.ui.wateringAreaDraft.points = [
        ...state.ui.wateringAreaDraft.points,
        ...normalizeWateringAreaPoints([action.payload.point]),
      ];
      return state;
    case "SET_WATERING_AREA_DRAFT_PREVIEW":
      if (!state.ui.wateringAreaDraft) {
        return null;
      }
      state.ui.wateringAreaDraft.previewPoint = normalizeWateringAreaPoints([action.payload.point])[0] ?? null;
      return state;
    case "CLEAR_WATERING_AREA_DRAFT":
      state.ui.wateringAreaDraft = null;
      return state;
    case "ADD_WATERING_AREA": {
      const points = normalizeWateringAreaPoints(action.payload.points);
      if (points.length < 3) {
        return null;
      }
      const wateringArea = {
        id: action.payload.id,
        label: sanitizeWateringAreaLabel(action.payload.label, buildDefaultWateringAreaLabel(state.wateringAreas)),
        points,
      };
      state.wateringAreas.push(wateringArea);
      clearAllSelections(state.ui);
      state.ui.selectedWateringAreaId = wateringArea.id;
      state.ui.wateringAreaDraft = null;
      return state;
    }
    case "UPDATE_WATERING_AREA": {
      const wateringArea = findWateringArea(state, action.payload.id);
      if (!wateringArea) {
        return null;
      }
      Object.assign(wateringArea, sanitizeWateringAreaPatch(action.payload.patch, wateringArea, state));
      return state;
    }
    case "DELETE_WATERING_AREA":
      state.wateringAreas = state.wateringAreas.filter((wateringArea) => wateringArea.id !== action.payload.id);
      if (state.ui.selectedWateringAreaId === action.payload.id) {
        state.ui.selectedWateringAreaId = null;
        state.ui.selectedWateringAreaVertexIndex = null;
      }
      return state;
    case "SELECT_WATERING_AREA":
      clearAllSelections(state.ui);
      state.ui.selectedWateringAreaId = action.payload.id || null;
      state.ui.selectedWateringAreaVertexIndex = Number.isInteger(action.payload.vertexIndex) ? action.payload.vertexIndex : null;
      return state;
    case "MOVE_WATERING_AREA_VERTEX": {
      const wateringArea = findWateringArea(state, action.payload.id);
      if (!wateringArea || !Number.isInteger(action.payload.index) || action.payload.index < 0 || action.payload.index >= wateringArea.points.length) {
        return null;
      }
      const point = normalizeWateringAreaPoints([action.payload.point])[0];
      if (!point) {
        return null;
      }
      wateringArea.points[action.payload.index] = point;
      clearAllSelections(state.ui);
      state.ui.selectedWateringAreaId = wateringArea.id;
      state.ui.selectedWateringAreaVertexIndex = action.payload.index;
      return state;
    }
    case "INSERT_WATERING_AREA_VERTEX": {
      const wateringArea = findWateringArea(state, action.payload.id);
      if (!wateringArea || !Number.isInteger(action.payload.index) || action.payload.index < 0 || action.payload.index >= wateringArea.points.length) {
        return null;
      }
      const point = normalizeWateringAreaPoints([action.payload.point])[0];
      if (!point) {
        return null;
      }
      wateringArea.points.splice(action.payload.index + 1, 0, point);
      clearAllSelections(state.ui);
      state.ui.selectedWateringAreaId = wateringArea.id;
      state.ui.selectedWateringAreaVertexIndex = action.payload.index + 1;
      return state;
    }
    case "DELETE_WATERING_AREA_VERTEX": {
      const wateringArea = findWateringArea(state, action.payload.id);
      if (!wateringArea || !Number.isInteger(action.payload.index) || wateringArea.points.length <= 3 || action.payload.index < 0 || action.payload.index >= wateringArea.points.length) {
        return null;
      }
      wateringArea.points.splice(action.payload.index, 1);
      clearAllSelections(state.ui);
      state.ui.selectedWateringAreaId = wateringArea.id;
      state.ui.selectedWateringAreaVertexIndex = clamp(action.payload.index, 0, wateringArea.points.length - 1);
      return state;
    }
    case "ADD_VALVE_BOX":
      state.valveBoxes.push({
        id: action.payload.id,
        x: action.payload.x,
        y: action.payload.y,
        label: action.payload.label || `VB-${state.valveBoxes.length + 1}`,
      });
      clearAllSelections(state.ui);
      state.ui.selectedValveBoxId = action.payload.id;
      return state;
    case "MOVE_VALVE_BOX": {
      const valveBox = findValveBox(state, action.payload.id);
      if (!valveBox) {
        return null;
      }
      valveBox.x = action.payload.x;
      valveBox.y = action.payload.y;
      return state;
    }
    case "UPDATE_VALVE_BOX": {
      const valveBox = findValveBox(state, action.payload.id);
      if (!valveBox) {
        return null;
      }
      Object.assign(valveBox, sanitizeValveBoxPatch(action.payload.patch));
      return state;
    }
    case "DELETE_VALVE_BOX":
      state.valveBoxes = state.valveBoxes.filter((valveBox) => valveBox.id !== action.payload.id);
      detachFittingAnchors(state.fittings, "valve_box", action.payload.id);
      state.zones.forEach((zone) => {
        if (zone.valveBoxId === action.payload.id) {
          zone.valveBoxId = null;
        }
      });
      state.wireRuns.forEach((wireRun) => {
        if (wireRun.valveBoxId === action.payload.id) {
          wireRun.valveBoxId = null;
        }
      });
      if (state.ui.selectedValveBoxId === action.payload.id) {
        state.ui.selectedValveBoxId = null;
      }
      return state;
    case "SELECT_VALVE_BOX":
      clearAllSelections(state.ui);
      state.ui.selectedValveBoxId = action.payload.id;
      return state;
    case "ADD_CONTROLLER":
      state.controllers.push({
        id: action.payload.id,
        x: action.payload.x,
        y: action.payload.y,
        label: action.payload.label || `C-${state.controllers.length + 1}`,
        stationCapacity: sanitizeControllerStationCapacity(action.payload.stationCapacity),
      });
      clearAllSelections(state.ui);
      state.ui.selectedControllerId = action.payload.id;
      return state;
    case "MOVE_CONTROLLER": {
      const controller = findController(state, action.payload.id);
      if (!controller) {
        return null;
      }
      controller.x = action.payload.x;
      controller.y = action.payload.y;
      return state;
    }
    case "UPDATE_CONTROLLER": {
      const controller = findController(state, action.payload.id);
      if (!controller) {
        return null;
      }
      Object.assign(controller, sanitizeControllerPatch(action.payload.patch));
      return state;
    }
    case "DELETE_CONTROLLER":
      state.controllers = state.controllers.filter((controller) => controller.id !== action.payload.id);
      state.zones.forEach((zone) => {
        if (zone.controllerId === action.payload.id) {
          zone.controllerId = null;
          zone.stationNumber = null;
        }
      });
      state.wireRuns.forEach((wireRun) => {
        if (wireRun.controllerId === action.payload.id) {
          wireRun.controllerId = null;
        }
      });
      if (state.ui.selectedControllerId === action.payload.id) {
        state.ui.selectedControllerId = null;
      }
      return state;
    case "SELECT_CONTROLLER":
      clearAllSelections(state.ui);
      state.ui.selectedControllerId = action.payload.id;
      return state;
    case "START_PIPE_DRAFT":
      state.ui.pipeDraft = {
        kind: normalizePipeKind(action.payload.kind ?? state.ui.pipePlacementKind),
        zoneId: action.payload.zoneId ?? null,
        diameterInches: sanitizePipeDiameter(action.payload.diameterInches),
        points: normalizePipePoints(action.payload.points),
        previewPoint: null,
      };
      clearAllSelections(state.ui);
      return state;
    case "APPEND_PIPE_DRAFT_POINT":
      if (!state.ui.pipeDraft) {
        return null;
      }
      state.ui.pipeDraft.points = [...state.ui.pipeDraft.points, ...normalizePipePoints([action.payload.point])];
      return state;
    case "SET_PIPE_DRAFT_ZONE":
      if (!state.ui.pipeDraft) {
        return null;
      }
      state.ui.pipeDraft.zoneId = action.payload.zoneId || null;
      return state;
    case "SET_PIPE_DRAFT_PREVIEW":
      if (!state.ui.pipeDraft) {
        return null;
      }
      state.ui.pipeDraft.previewPoint = normalizePipePoints([action.payload.point])[0] ?? null;
      return state;
    case "CLEAR_PIPE_DRAFT":
      state.ui.pipeDraft = null;
      return state;
    case "ADD_PIPE_RUN": {
      const kind = normalizePipeKind(action.payload.kind ?? state.ui.pipePlacementKind);
      const points = normalizePipePoints(action.payload.points);
      if (points.length < 2) {
        return null;
      }
      const pipeRun = {
        id: action.payload.id,
        kind,
        zoneId: kind === "zone" ? (action.payload.zoneId ?? state.ui.activeZoneId ?? null) : null,
        label: action.payload.label || buildDefaultPipeRunLabel(state.pipeRuns, kind),
        diameterInches: kind === "main"
          ? sanitizePipeDiameter(action.payload.diameterInches ?? state.hydraulics.lineSizeInches)
          : sanitizePipeDiameter(action.payload.diameterInches),
        points,
      };
      state.pipeRuns.push(pipeRun);
      clearAllSelections(state.ui);
      state.ui.selectedPipeRunId = pipeRun.id;
      state.ui.pipeDraft = null;
      return state;
    }
    case "UPDATE_PIPE_RUN": {
      const pipeRun = findPipeRun(state, action.payload.id);
      if (!pipeRun) {
        return null;
      }
      Object.assign(pipeRun, sanitizePipeRunPatch(action.payload.patch, pipeRun, state));
      return state;
    }
    case "DELETE_PIPE_RUN": {
      const pipeRun = findPipeRun(state, action.payload.id);
      if (!pipeRun) {
        return null;
      }

      const dependentFittingIds = collectDependentFittingIdsForPipeRun(state, pipeRun);
      state.pipeRuns = state.pipeRuns.filter((item) => item.id !== action.payload.id);
      if (dependentFittingIds.size) {
        state.fittings = state.fittings.filter((fitting) => !dependentFittingIds.has(fitting.id));
        if (state.ui.selectedFittingId && dependentFittingIds.has(state.ui.selectedFittingId)) {
          state.ui.selectedFittingId = null;
        }
      }
      if (state.ui.selectedPipeRunId === action.payload.id) {
        state.ui.selectedPipeRunId = null;
        state.ui.selectedPipeVertexIndex = null;
      }
      return state;
    }
    case "SELECT_PIPE_RUN":
      clearAllSelections(state.ui);
      state.ui.selectedPipeRunId = action.payload.id || null;
      state.ui.selectedPipeVertexIndex = Number.isInteger(action.payload.vertexIndex) ? action.payload.vertexIndex : null;
      return state;
    case "START_WIRE_DRAFT":
      state.ui.wireDraft = {
        controllerId: action.payload.controllerId ?? null,
        valveBoxId: action.payload.valveBoxId ?? null,
        conductorCount: action.payload.conductorCount == null ? null : sanitizeWireConductorCount(action.payload.conductorCount),
        gaugeAwg: normalizeWireGauge(action.payload.gaugeAwg),
        colorCode: sanitizeWireColorCode(action.payload.colorCode),
        points: normalizePipePoints(action.payload.points),
        previewPoint: null,
      };
      clearAllSelections(state.ui);
      return state;
    case "APPEND_WIRE_DRAFT_POINT":
      if (!state.ui.wireDraft) {
        return null;
      }
      state.ui.wireDraft.points = [...state.ui.wireDraft.points, ...normalizePipePoints([action.payload.point])];
      return state;
    case "SET_WIRE_DRAFT_VALVE_BOX":
      if (!state.ui.wireDraft) {
        return null;
      }
      state.ui.wireDraft.valveBoxId = action.payload.valveBoxId || null;
      return state;
    case "SET_WIRE_DRAFT_CONTROLLER":
      if (!state.ui.wireDraft) {
        return null;
      }
      state.ui.wireDraft.controllerId = action.payload.controllerId || null;
      return state;
    case "SET_WIRE_DRAFT_PREVIEW":
      if (!state.ui.wireDraft) {
        return null;
      }
      state.ui.wireDraft.previewPoint = normalizePipePoints([action.payload.point])[0] ?? null;
      return state;
    case "CLEAR_WIRE_DRAFT":
      state.ui.wireDraft = null;
      return state;
    case "ADD_WIRE_RUN": {
      const points = normalizePipePoints(action.payload.points);
      if (points.length < 2) {
        return null;
      }
      const valveBoxId = action.payload.valveBoxId || null;
      const requiredConductorCount = getRequiredWireConductorsForValveBox(state, valveBoxId);
      const wireRun = {
        id: action.payload.id,
        controllerId: action.payload.controllerId ?? null,
        valveBoxId,
        label: action.payload.label || buildDefaultWireRunLabel(state.wireRuns),
        conductorCount: action.payload.conductorCount == null
          ? (requiredConductorCount ?? 2)
          : sanitizeWireConductorCount(action.payload.conductorCount),
        gaugeAwg: normalizeWireGauge(action.payload.gaugeAwg),
        colorCode: sanitizeWireColorCode(action.payload.colorCode),
        points,
      };
      state.wireRuns.push(wireRun);
      clearAllSelections(state.ui);
      state.ui.selectedWireRunId = wireRun.id;
      state.ui.wireDraft = null;
      return state;
    }
    case "UPDATE_WIRE_RUN": {
      const wireRun = findWireRun(state, action.payload.id);
      if (!wireRun) {
        return null;
      }
      Object.assign(wireRun, sanitizeWireRunPatch(action.payload.patch, wireRun, state));
      return state;
    }
    case "DELETE_WIRE_RUN":
      state.wireRuns = state.wireRuns.filter((wireRun) => wireRun.id !== action.payload.id);
      if (state.ui.selectedWireRunId === action.payload.id) {
        state.ui.selectedWireRunId = null;
        state.ui.selectedWireVertexIndex = null;
      }
      return state;
    case "SELECT_WIRE_RUN":
      clearAllSelections(state.ui);
      state.ui.selectedWireRunId = action.payload.id || null;
      state.ui.selectedWireVertexIndex = Number.isInteger(action.payload.vertexIndex) ? action.payload.vertexIndex : null;
      return state;
    case "ADD_FITTING": {
      const fitting = normalizeFitting(action.payload);
      state.fittings.push(fitting);
      if (fitting.status === "placed") {
        clearAllSelections(state.ui);
        state.ui.selectedFittingId = fitting.id;
      }
      return state;
    }
    case "UPDATE_FITTING": {
      const fitting = findFitting(state, action.payload.id);
      if (!fitting) {
        return null;
      }
      Object.assign(fitting, sanitizeFittingPatch(action.payload.patch, fitting));
      return state;
    }
    case "DELETE_FITTING":
      state.fittings = state.fittings.filter((fitting) => fitting.id !== action.payload.id);
      if (state.ui.selectedFittingId === action.payload.id) {
        state.ui.selectedFittingId = null;
      }
      return state;
    case "SELECT_FITTING":
      clearAllSelections(state.ui);
      state.ui.selectedFittingId = action.payload.id || null;
      return state;
    case "SET_FITTINGS_PANEL_STATE":
      state.ui.fittingsPanel = sanitizeFittingsPanelState({
        ...state.ui.fittingsPanel,
        ...action.payload,
      });
      return state;
    case "START_FITTING_DRAFT":
      state.ui.fittingDraft = {
        type: normalizeFittingType(action.payload.type),
        zoneMode: ["auto", "main", "zone"].includes(action.payload.zoneMode) ? action.payload.zoneMode : "auto",
        zoneId: action.payload.zoneId || null,
        sprinklerId: action.payload.sprinklerId || null,
        targetPoint: normalizeDraftPoint(action.payload.targetPoint),
        targetAnchor: normalizeFittingAnchor(action.payload.targetAnchor),
        sizeSpec: sanitizeFittingSizeSpec(action.payload.sizeSpec),
        label: String(action.payload.label || ""),
        ignoredFittingId: action.payload.ignoredFittingId || null,
        preview: null,
      };
      clearAllSelections(state.ui);
      return state;
    case "SET_FITTING_DRAFT_PREVIEW":
      if (!state.ui.fittingDraft) {
        return null;
      }
      state.ui.fittingDraft.preview = action.payload.preview ?? null;
      return state;
    case "CLEAR_FITTING_DRAFT":
      state.ui.fittingDraft = null;
      return state;
    case "SET_SELECTED_PIPE_VERTEX":
      state.ui.selectedPipeVertexIndex = Number.isInteger(action.payload.index) ? action.payload.index : null;
      return state;
    case "MOVE_PIPE_VERTEX": {
      const pipeRun = findPipeRun(state, action.payload.id);
      if (!pipeRun || !Number.isInteger(action.payload.index) || action.payload.index < 0 || action.payload.index >= pipeRun.points.length) {
        return null;
      }
      const point = normalizePipePoints([action.payload.point])[0];
      if (!point) {
        return null;
      }
      pipeRun.points[action.payload.index] = point;
      state.ui.selectedPipeRunId = pipeRun.id;
      state.ui.selectedPipeVertexIndex = action.payload.index;
      clearAllSelections(state.ui);
      state.ui.selectedPipeRunId = pipeRun.id;
      state.ui.selectedPipeVertexIndex = action.payload.index;
      return state;
    }
    case "INSERT_PIPE_VERTEX": {
      const pipeRun = findPipeRun(state, action.payload.id);
      if (!pipeRun || !Number.isInteger(action.payload.index) || action.payload.index < 0 || action.payload.index >= pipeRun.points.length) {
        return null;
      }
      const point = normalizePipePoints([action.payload.point])[0];
      if (!point) {
        return null;
      }
      pipeRun.points.splice(action.payload.index + 1, 0, point);
      state.ui.selectedPipeRunId = pipeRun.id;
      state.ui.selectedPipeVertexIndex = action.payload.index + 1;
      clearAllSelections(state.ui);
      state.ui.selectedPipeRunId = pipeRun.id;
      state.ui.selectedPipeVertexIndex = action.payload.index + 1;
      return state;
    }
    case "DELETE_PIPE_VERTEX": {
      const pipeRun = findPipeRun(state, action.payload.id);
      if (!pipeRun || !Number.isInteger(action.payload.index) || pipeRun.points.length <= 2 || action.payload.index < 0 || action.payload.index >= pipeRun.points.length) {
        return null;
      }
      pipeRun.points.splice(action.payload.index, 1);
      state.ui.selectedPipeRunId = pipeRun.id;
      state.ui.selectedPipeVertexIndex = clamp(action.payload.index, 0, pipeRun.points.length - 1);
      return state;
    }
    case "MOVE_WIRE_VERTEX": {
      const wireRun = findWireRun(state, action.payload.id);
      if (!wireRun || !Number.isInteger(action.payload.index) || action.payload.index < 0 || action.payload.index >= wireRun.points.length) {
        return null;
      }
      const point = normalizePipePoints([action.payload.point])[0];
      if (!point) {
        return null;
      }
      wireRun.points[action.payload.index] = point;
      state.ui.selectedWireRunId = wireRun.id;
      state.ui.selectedWireVertexIndex = action.payload.index;
      clearAllSelections(state.ui);
      state.ui.selectedWireRunId = wireRun.id;
      state.ui.selectedWireVertexIndex = action.payload.index;
      return state;
    }
    case "INSERT_WIRE_VERTEX": {
      const wireRun = findWireRun(state, action.payload.id);
      if (!wireRun || !Number.isInteger(action.payload.index) || action.payload.index < 0 || action.payload.index >= wireRun.points.length) {
        return null;
      }
      const point = normalizePipePoints([action.payload.point])[0];
      if (!point) {
        return null;
      }
      wireRun.points.splice(action.payload.index + 1, 0, point);
      state.ui.selectedWireRunId = wireRun.id;
      state.ui.selectedWireVertexIndex = action.payload.index + 1;
      clearAllSelections(state.ui);
      state.ui.selectedWireRunId = wireRun.id;
      state.ui.selectedWireVertexIndex = action.payload.index + 1;
      return state;
    }
    case "DELETE_WIRE_VERTEX": {
      const wireRun = findWireRun(state, action.payload.id);
      if (!wireRun || !Number.isInteger(action.payload.index) || wireRun.points.length <= 2 || action.payload.index < 0 || action.payload.index >= wireRun.points.length) {
        return null;
      }
      wireRun.points.splice(action.payload.index, 1);
      state.ui.selectedWireRunId = wireRun.id;
      state.ui.selectedWireVertexIndex = clamp(action.payload.index, 0, wireRun.points.length - 1);
      state.ui.selectedPipeRunId = null;
      state.ui.selectedPipeVertexIndex = null;
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

function clearAllSelections(ui) {
  ui.selectedSprinklerId = null;
  ui.selectedWateringAreaId = null;
  ui.selectedWateringAreaVertexIndex = null;
  ui.selectedValveBoxId = null;
  ui.selectedControllerId = null;
  ui.selectedPipeRunId = null;
  ui.selectedWireRunId = null;
  ui.selectedFittingId = null;
  ui.selectedPipeVertexIndex = null;
  ui.selectedWireVertexIndex = null;
}

function undo(state) {
  if (!state.history.undoStack.length) {
    return state;
  }
  const previous = cloneProjectSnapshot(state.history.undoStack[state.history.undoStack.length - 1]);
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
  const next = cloneProjectSnapshot(state.history.redoStack[state.history.redoStack.length - 1]);
  next.history.undoStack = [...state.history.undoStack, cloneProjectSnapshot(state)];
  next.history.redoStack = state.history.redoStack.slice(0, -1);
  next.ui.measureDistance = calculateMeasureDistance(next);
  next.ui.hint = buildHint(next);
  return next;
}

function cloneMutableState(state) {
  return {
    ...state,
    meta: { ...state.meta },
    background: cloneBackgroundState(state.background),
    scale: {
      ...state.scale,
      calibrationPoints: clonePoints(state.scale.calibrationPoints),
    },
    hydraulics: { ...state.hydraulics },
    analysis: { ...state.analysis },
    parts: { ...state.parts },
    zones: (state.zones ?? []).map((zone) => ({ ...zone })),
    sprinklers: (state.sprinklers ?? []).map((sprinkler) => ({ ...sprinkler })),
    wateringAreas: (state.wateringAreas ?? []).map((wateringArea) => ({
      ...wateringArea,
      points: clonePoints(wateringArea.points),
    })),
    valveBoxes: (state.valveBoxes ?? []).map((valveBox) => ({ ...valveBox })),
    controllers: (state.controllers ?? []).map((controller) => ({ ...controller })),
    pipeRuns: (state.pipeRuns ?? []).map((pipeRun) => ({
      ...pipeRun,
      points: clonePoints(pipeRun.points),
    })),
    wireRuns: (state.wireRuns ?? []).map((wireRun) => ({
      ...wireRun,
      points: clonePoints(wireRun.points),
    })),
    fittings: (state.fittings ?? []).map((fitting) => ({
      ...fitting,
      anchor: cloneAnchor(fitting.anchor),
    })),
    view: { ...state.view },
    history: state.history,
    ui: {
      ...state.ui,
      measurePoints: clonePoints(state.ui.measurePoints),
      measurePreviewPoint: clonePoint(state.ui.measurePreviewPoint),
      fittingDraft: cloneFittingDraft(state.ui.fittingDraft),
      pipeDraft: cloneLineDraft(state.ui.pipeDraft),
      wireDraft: cloneLineDraft(state.ui.wireDraft),
      wateringAreaDraft: cloneLineDraft(state.ui.wateringAreaDraft),
      cursorWorld: clonePoint(state.ui.cursorWorld),
      expandedZoneIds: [...(state.ui.expandedZoneIds ?? [])],
      rectificationPoints: clonePoints(state.ui.rectificationPoints),
      fittingsPanel: { ...state.ui.fittingsPanel },
    },
  };
}

function cloneBackgroundState(background) {
  return {
    ...background,
    rectification: {
      ...background?.rectification,
      matrix: cloneMatrix(background?.rectification?.matrix),
      inverseMatrix: cloneMatrix(background?.rectification?.inverseMatrix),
    },
  };
}

function cloneLineDraft(draft) {
  if (!draft) {
    return null;
  }
  return {
    ...draft,
    points: clonePoints(draft.points),
    previewPoint: clonePoint(draft.previewPoint),
  };
}

function cloneFittingDraft(draft) {
  if (!draft) {
    return null;
  }
  return {
    ...draft,
    targetPoint: clonePoint(draft.targetPoint),
    targetAnchor: cloneAnchor(draft.targetAnchor),
    preview: draft.preview ? structuredClone(draft.preview) : null,
  };
}

function cloneMatrix(matrix) {
  return Array.isArray(matrix)
    ? matrix.map((row) => (Array.isArray(row) ? [...row] : row))
    : null;
}

function clonePoints(points) {
  return Array.isArray(points)
    ? points.map((point) => clonePoint(point)).filter(Boolean)
    : [];
}

function clonePoint(point) {
  return point && typeof point === "object" ? { ...point } : null;
}

function cloneAnchor(anchor) {
  return anchor && typeof anchor === "object" ? { ...anchor } : null;
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

function sanitizeWateringAreaPatch(patch, wateringArea, state) {
  if (!patch) {
    return {};
  }

  const sanitized = {};
  if ("label" in patch) {
    sanitized.label = sanitizeWateringAreaLabel(
      patch.label,
      buildDefaultWateringAreaLabel((state?.wateringAreas ?? []).filter((entry) => entry.id !== wateringArea.id)),
    );
  }
  if ("points" in patch) {
    const points = normalizeWateringAreaPoints(patch.points);
    if (points.length >= 3) {
      sanitized.points = points;
    }
  }
  return sanitized;
}

function sanitizeFittingPatch(patch, fitting) {
  if (!patch) {
    return {};
  }

  const sanitized = {};

  if ("type" in patch) {
    sanitized.type = normalizeFittingType(patch.type);
  }
  if ("label" in patch) {
    sanitized.label = String(patch.label || "");
  }
  if ("zoneId" in patch) {
    sanitized.zoneId = patch.zoneId || null;
  }
  if ("sizeSpec" in patch) {
    sanitized.sizeSpec = sanitizeFittingSizeSpec(patch.sizeSpec);
  }
  if ("anchor" in patch) {
    sanitized.anchor = normalizeFittingAnchor(patch.anchor);
  }
  if ("x" in patch) {
    const x = Number(patch.x);
    sanitized.x = Number.isFinite(x) ? x : fitting.x;
  }
  if ("y" in patch) {
    const y = Number(patch.y);
    sanitized.y = Number.isFinite(y) ? y : fitting.y;
  }
  if ("rotationDeg" in patch) {
    sanitized.rotationDeg = normalizeAngle(Number(patch.rotationDeg ?? 0));
  }
  if ("locked" in patch) {
    sanitized.locked = Boolean(patch.locked);
  }
  if ("status" in patch) {
    sanitized.status = normalizeFittingStatus(patch.status);
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
  if ("runtimeGroupName" in patch) {
    sanitized.runtimeGroupName = sanitizeRuntimeGroupName(patch.runtimeGroupName);
  }
  if ("includeInPartsList" in patch) {
    sanitized.includeInPartsList = Boolean(patch.includeInPartsList);
  }
  if ("valveBoxId" in patch) {
    sanitized.valveBoxId = patch.valveBoxId || null;
  }
  if ("controllerId" in patch) {
    sanitized.controllerId = patch.controllerId || null;
  }
  if ("stationNumber" in patch) {
    sanitized.stationNumber = sanitizeZoneStationNumber(patch.stationNumber);
  }

  return sanitized;
}

function sanitizeValveBoxPatch(patch) {
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
  if ("label" in patch) {
    sanitized.label = patch.label || "Valve Box";
  }
  return sanitized;
}

function sanitizeControllerPatch(patch) {
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
  if ("label" in patch) {
    sanitized.label = patch.label || "Controller";
  }
  if ("stationCapacity" in patch) {
    sanitized.stationCapacity = sanitizeControllerStationCapacity(patch.stationCapacity);
  }
  return sanitized;
}

function sanitizePipeRunPatch(patch, pipeRun, state) {
  if (!patch) {
    return {};
  }

  const sanitized = {};

  if ("label" in patch) {
    sanitized.label = patch.label || buildDefaultPipeRunLabel(state.pipeRuns, pipeRun.kind);
  }

  if ("kind" in patch) {
    sanitized.kind = normalizePipeKind(patch.kind);
  }

  const nextKind = sanitized.kind ?? pipeRun.kind;

  if ("zoneId" in patch || "kind" in patch) {
    sanitized.zoneId = nextKind === "zone" ? (patch.zoneId || pipeRun.zoneId || null) : null;
  }

  if ("diameterInches" in patch || "kind" in patch) {
    const fallbackDiameter = nextKind === "main"
      ? state.hydraulics.lineSizeInches
      : null;
    sanitized.diameterInches = sanitizePipeDiameter(
      "diameterInches" in patch ? patch.diameterInches : (pipeRun.diameterInches ?? fallbackDiameter),
    );
  }

  if ("points" in patch) {
    const points = normalizePipePoints(patch.points);
    if (points.length >= 2) {
      sanitized.points = points;
    }
  }

  return sanitized;
}

function sanitizeWireRunPatch(patch, wireRun, state) {
  if (!patch) {
    return {};
  }

  const sanitized = {};

  if ("label" in patch) {
    sanitized.label = patch.label || buildDefaultWireRunLabel(state.wireRuns);
  }
  if ("controllerId" in patch) {
    sanitized.controllerId = patch.controllerId || null;
  }
  if ("valveBoxId" in patch) {
    sanitized.valveBoxId = patch.valveBoxId || null;
  }
  if ("conductorCount" in patch) {
    sanitized.conductorCount = sanitizeWireConductorCount(patch.conductorCount);
  }
  if ("gaugeAwg" in patch) {
    sanitized.gaugeAwg = normalizeWireGauge(patch.gaugeAwg);
  }
  if ("colorCode" in patch) {
    sanitized.colorCode = sanitizeWireColorCode(patch.colorCode);
  }
  if ("points" in patch) {
    const points = normalizePipePoints(patch.points);
    if (points.length >= 2) {
      sanitized.points = points;
    }
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
  if ("nozzleSelectionMode" in patch) {
    sanitized.nozzleSelectionMode = ANALYSIS_NOZZLE_SELECTION_MODES.has(patch.nozzleSelectionMode)
      ? patch.nozzleSelectionMode
      : "optimized";
  }
  return sanitized;
}

function sanitizeHydraulicsPatch(patch) {
  if (!patch) {
    return {};
  }

  const sanitized = {};
  if ("lineSizeInches" in patch) {
    const lineSize = Number(patch.lineSizeInches);
    sanitized.lineSizeInches = Number.isFinite(lineSize) && lineSize > 0 ? lineSize : null;
  }
  if ("pressurePsi" in patch) {
    const pressure = Number(patch.pressurePsi);
    sanitized.pressurePsi = Number.isFinite(pressure) && pressure > 0 ? pressure : null;
  }
  if ("designFlowLimitGpm" in patch) {
    const flowLimit = Number(patch.designFlowLimitGpm);
    sanitized.designFlowLimitGpm = Number.isFinite(flowLimit) && flowLimit > 0 ? flowLimit : null;
  }
  return sanitized;
}

function sanitizePartsPatch(patch) {
  if (!patch) {
    return {};
  }

  const sanitized = {};
  if ("groupBy" in patch) {
    sanitized.groupBy = ["exact_sku", "sku_family", "body_nozzle_split"].includes(patch.groupBy)
      ? patch.groupBy
      : "body_nozzle_split";
  }
  if ("scopeMode" in patch) {
    sanitized.scopeMode = ["included_zones_only", "all_zones"].includes(patch.scopeMode)
      ? patch.scopeMode
      : "included_zones_only";
  }
  if ("showZoneUsage" in patch) {
    sanitized.showZoneUsage = Boolean(patch.showZoneUsage);
  }
  return sanitized;
}

function sanitizePipeDiameter(value) {
  const diameter = Number(value);
  return Number.isFinite(diameter) && diameter > 0 ? diameter : null;
}

function sanitizeZoneStationNumber(value) {
  const stationNumber = Number(value);
  return Number.isInteger(stationNumber) && stationNumber > 0 ? stationNumber : null;
}

function sanitizeControllerStationCapacity(value) {
  const stationCapacity = Number(value);
  return Number.isInteger(stationCapacity) && stationCapacity > 0 ? stationCapacity : 8;
}

function appendBounded(items, item, limit) {
  return [...items, item].slice(-limit);
}

function applyBackgroundRectification(state, payload) {
  const transformMatrix = normalizeMatrix(payload?.transformMatrix);
  if (!transformMatrix) {
    return;
  }

  state.sprinklers = state.sprinklers.map((sprinkler) => transformEntityPoint(sprinkler, transformMatrix));
  state.wateringAreas = state.wateringAreas.map((wateringArea) => ({
    ...wateringArea,
    points: transformPoints(wateringArea.points, transformMatrix),
  })).filter((wateringArea) => wateringArea.points.length >= 3);
  if (state.ui.selectedWateringAreaId && !state.wateringAreas.some((wateringArea) => wateringArea.id === state.ui.selectedWateringAreaId)) {
    state.ui.selectedWateringAreaId = null;
  }
  state.valveBoxes = state.valveBoxes.map((valveBox) => transformEntityPoint(valveBox, transformMatrix));
  state.controllers = state.controllers.map((controller) => transformEntityPoint(controller, transformMatrix));
  state.pipeRuns = state.pipeRuns.map((pipeRun) => ({
    ...pipeRun,
    points: transformPoints(pipeRun.points, transformMatrix),
  }));
  state.wireRuns = state.wireRuns.map((wireRun) => ({
    ...wireRun,
    points: transformPoints(wireRun.points, transformMatrix),
  }));
  state.fittings = state.fittings.map((fitting) => transformEntityPoint(fitting, transformMatrix));
  state.scale.calibrationPoints = transformPoints(state.scale.calibrationPoints, transformMatrix);
  state.ui.measurePoints = transformPoints(state.ui.measurePoints, transformMatrix);
  state.ui.measurePreviewPoint = transformPoint(state.ui.measurePreviewPoint, transformMatrix);
  state.ui.cursorWorld = transformPoint(state.ui.cursorWorld, transformMatrix);
  if (state.ui.wateringAreaDraft) {
    state.ui.wateringAreaDraft.points = transformPoints(state.ui.wateringAreaDraft.points, transformMatrix);
    state.ui.wateringAreaDraft.previewPoint = transformPoint(state.ui.wateringAreaDraft.previewPoint, transformMatrix);
  }
  state.ui.rectificationPoints = [];
  state.ui.calibrationMode = "scale";
  state.ui.fittingDraft = null;
  state.ui.pipeDraft = null;
  state.ui.wireDraft = null;

  state.background = normalizeBackgroundPayload(
    {
      ...state.background,
      ...payload?.background,
      rectification: payload?.background?.rectification ?? state.background.rectification,
    },
    state.background,
  );

  const recalibratedPixelsPerUnit = computePixelsPerUnitFromPoints(
    state.scale.calibrationPoints,
    Number(state.scale.distanceUnits),
  );
  if (recalibratedPixelsPerUnit > 0) {
    state.scale.pixelsPerUnit = recalibratedPixelsPerUnit;
    state.scale.calibrated = true;
  } else {
    state.scale.pixelsPerUnit = 0;
    state.scale.calibrated = false;
  }
}

function applyScalePatch(state, payload) {
  const { preserveSprinklerFootprint = false, ...scalePatch } = payload ?? {};
  const previousPixelsPerUnit = Number(state.scale.pixelsPerUnit);
  const nextPixelsPerUnit = Number(scalePatch.pixelsPerUnit);

  if (
    preserveSprinklerFootprint
    && previousPixelsPerUnit > 0
    && nextPixelsPerUnit > 0
    && Math.abs(previousPixelsPerUnit - nextPixelsPerUnit) > 0.000001
  ) {
    const geometryScale = previousPixelsPerUnit / nextPixelsPerUnit;
    state.sprinklers.forEach((sprinkler) => scaleSprinklerGeometry(sprinkler, geometryScale));
  }

  state.scale = {
    ...state.scale,
    ...scalePatch,
    calibrated: nextPixelsPerUnit > 0,
  };
}

function normalizeBackgroundPayload(background, fallback) {
  const base = fallback ? structuredClone(fallback) : structuredClone(createInitialState().background);
  const src = String(background?.src ?? base.src ?? "");
  const width = sanitizePositiveDimension(background?.width, base.width ?? 0);
  const height = sanitizePositiveDimension(background?.height, base.height ?? 0);
  const name = String(background?.name ?? base.name ?? "");
  const sourceSrc = String(background?.sourceSrc ?? base.sourceSrc ?? src);
  const sourceWidth = sanitizePositiveDimension(background?.sourceWidth, base.sourceWidth || width);
  const sourceHeight = sanitizePositiveDimension(background?.sourceHeight, base.sourceHeight || height);
  return {
    ...base,
    ...background,
    src,
    width,
    height,
    name,
    sourceSrc,
    sourceWidth,
    sourceHeight,
    rectification: normalizeRectificationState(background?.rectification, base.rectification),
  };
}

function normalizeRectificationState(rectification, fallback) {
  const base = fallback ? structuredClone(fallback) : structuredClone(createInitialState().background.rectification);
  return {
    ...base,
    ...rectification,
    enabled: Boolean(rectification?.enabled ?? base.enabled),
    referenceWidth: sanitizeReferenceDimension(rectification?.referenceWidth, base.referenceWidth),
    referenceHeight: sanitizeReferenceDimension(rectification?.referenceHeight, base.referenceHeight),
    outputWidth: sanitizePositiveDimension(rectification?.outputWidth, base.outputWidth),
    outputHeight: sanitizePositiveDimension(rectification?.outputHeight, base.outputHeight),
    matrix: normalizeMatrix(rectification?.matrix) ?? base.matrix ?? null,
    inverseMatrix: normalizeMatrix(rectification?.inverseMatrix) ?? base.inverseMatrix ?? null,
  };
}

function sanitizePositiveDimension(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
}

function sanitizePositiveQuantity(value, fallback, minimum = 0.1) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(minimum, numericValue) : fallback;
}

function normalizeUnits(value) {
  return "ft";
}

function getDefaultSprinklerRadius(units) {
  return DEFAULT_SPRINKLER_RADIUS_FT;
}

function getDefaultStripLength(units) {
  return DEFAULT_STRIP_LENGTH_FT;
}

function getDefaultStripWidth(units) {
  return DEFAULT_STRIP_WIDTH_FT;
}

function resolveHeadConnectionPipeEpsilon(state) {
  const pixelsPerUnit = Number(state?.scale?.pixelsPerUnit);
  if (!state?.scale?.calibrated || !Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) {
    return HEAD_CONNECTION_PIPE_EPSILON_PX;
  }
  return Math.max(1, pixelsPerUnit * HEAD_CONNECTION_PIPE_TOLERANCE_FT);
}

function transformEntityPoint(entity, matrix) {
  const point = transformPoint(entity, matrix);
  if (!point) {
    return entity;
  }
  return {
    ...entity,
    x: point.x,
    y: point.y,
  };
}

function transformPoints(points, matrix) {
  return (points ?? [])
    .map((point) => transformPoint(point, matrix))
    .filter(Boolean);
}

function transformPoint(point, matrix) {
  if (!point) {
    return null;
  }
  const transformed = applyHomography(point, matrix);
  if (!transformed) {
    return null;
  }
  return {
    x: transformed.x,
    y: transformed.y,
  };
}

function normalizeMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 3) {
    return null;
  }
  const normalized = matrix.map((row) =>
    Array.isArray(row) && row.length === 3
      ? row.map((value) => Number(value))
      : null
  );
  return normalized.every((row) => row && row.every((value) => Number.isFinite(value))) ? normalized : null;
}

function scaleSprinklerGeometry(sprinkler, geometryScale) {
  if (!Number.isFinite(geometryScale) || geometryScale <= 0) {
    return;
  }

  const radius = Number(sprinkler.radius);
  if (Number.isFinite(radius)) {
    sprinkler.radius = Math.max(0.1, radius * geometryScale);
  }

  const stripLength = Number(sprinkler.stripLength);
  if (Number.isFinite(stripLength)) {
    sprinkler.stripLength = Math.max(0.1, stripLength * geometryScale);
  }

  const stripWidth = Number(sprinkler.stripWidth);
  if (Number.isFinite(stripWidth)) {
    sprinkler.stripWidth = Math.max(0.1, stripWidth * geometryScale);
  }
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
  if (state.ui.activeTool === "calibrate" && state.ui.calibrationMode === "rectify" && !state.ui.rectificationPoints.length) {
    return "Click the four corners of the reference rectangle in any order.";
  }
  if (state.ui.activeTool === "calibrate" && state.ui.calibrationMode === "rectify" && state.ui.rectificationPoints.length === 1) {
    return "Click another corner of the reference rectangle.";
  }
  if (state.ui.activeTool === "calibrate" && state.ui.calibrationMode === "rectify" && state.ui.rectificationPoints.length === 2) {
    return "Click a third corner of the reference rectangle.";
  }
  if (state.ui.activeTool === "calibrate" && state.ui.calibrationMode === "rectify" && state.ui.rectificationPoints.length === 3) {
    return "Click the final corner of the reference rectangle.";
  }
  if (state.ui.activeTool === "calibrate" && state.ui.calibrationMode === "rectify" && state.ui.rectificationPoints.length >= 4) {
    return "Enter the reference width and height, then apply rectification. Clicking a new point starts over.";
  }
  if (state.ui.activeTool === "calibrate" && !state.scale.calibrationPoints.length) {
    return "Click the first calibration point on the drawing.";
  }
  if (state.ui.activeTool === "calibrate" && state.scale.calibrationPoints.length === 1) {
    return "Click the second calibration point on the drawing.";
  }
  if (state.ui.activeTool === "calibrate" && state.scale.calibrationPoints.length >= 2) {
    return "Enter the measured distance and apply calibration. Clicking a new point starts over.";
  }
  if (!state.scale.calibrated) {
    return "Calibrate the drawing before tracing watering areas or placing sprinklers, valve boxes, controllers, pipe, or wire.";
  }
  if (!hasHydraulics(state)) {
    return "Enter line size and pressure before layout review.";
  }
  if (state.ui.activeTool === "pipe" && state.ui.pipeDraft?.points?.length) {
    return "Click to add vertices. Press Enter or double-click to finish the run, or Esc to cancel.";
  }
  if (state.ui.activeTool === "pipe") {
    return `Click to start a ${state.ui.pipePlacementKind === "main" ? "main supply" : "zone"} pipe run. ${state.pipeRuns.length} run${state.pipeRuns.length === 1 ? "" : "s"} on plan.`;
  }
  if (state.ui.activeTool === "wire" && state.ui.wireDraft?.points?.length) {
    return "Click to add wire vertices. Press Enter or double-click to finish the run, or Esc to cancel.";
  }
  if (state.ui.activeTool === "wire") {
    return `Click to start a controller-to-valve-box wire run. ${state.wireRuns.length} run${state.wireRuns.length === 1 ? "" : "s"} on plan.`;
  }
  if (state.ui.activeTool === "area" && state.ui.wateringAreaDraft?.points?.length) {
    return "Click to add watering-area corners. Press Enter or double-click to close the shape, or Esc to cancel.";
  }
  if (state.ui.activeTool === "area") {
    return `Click to trace watering-area polygons for quarter and half spray auto-orient. ${state.wateringAreas.length} area${state.wateringAreas.length === 1 ? "" : "s"} on plan.`;
  }
  if (state.ui.activeTool === "fittings" && state.ui.fittingDraft?.type === "head_takeoff") {
    return "Drag over a sprinkler head and release to place a head takeoff. Press Esc to cancel.";
  }
  if (state.ui.activeTool === "fittings" && state.ui.fittingDraft?.targetPoint) {
    if (state.ui.fittingDraft?.targetAnchor?.kind === "sprinkler") {
      return "Drag over the suggested sprinkler head and release to place the fitting. Press Esc to cancel.";
    }
    return "Drag over the suggested pipe connection and release to place the fitting. Press Esc to cancel.";
  }
  if (state.ui.activeTool === "fittings") {
    return `Use the fittings palette to organize fittings. ${state.fittings.length} fitting${state.fittings.length === 1 ? "" : "s"} on plan.`;
  }
  if (state.ui.activeTool === "place" && state.ui.placementPattern === "strip") {
    return "Click and drag to place a strip sprinkler, then fine-tune width or type from the selected head controls.";
  }
  if (state.ui.activeTool === "place" && state.ui.placementPattern === "quarter") {
    return "Click to place a quarter spray. It will auto-face the nearest traced watering-area corner when possible.";
  }
  if (state.ui.activeTool === "place" && state.ui.placementPattern === "half") {
    return "Click to place a half spray. It will auto-face inward from the nearest traced watering-area edge when possible.";
  }
  if (state.ui.activeTool === "valve-box") {
    return `Click to place valve boxes. ${state.valveBoxes.length} box${state.valveBoxes.length === 1 ? "" : "es"} on plan.`;
  }
  if (state.ui.activeTool === "controller") {
    return `Click to place controllers. ${state.controllers.length} controller${state.controllers.length === 1 ? "" : "s"} on plan.`;
  }
  return `Ready to place sprinklers. ${state.sprinklers.length} head${state.sprinklers.length === 1 ? "" : "s"} on plan.`;
}

function normalizeLoadedProject(project) {
  const initial = createInitialState();
  const normalizedView = normalizeView({ ...initial.view, ...project.view });
  const normalizedZones = Array.isArray(project.zones) ? project.zones.map(normalizeZone) : [];
  const normalizedScale = {
    ...initial.scale,
    ...project.scale,
    units: normalizeUnits(project.scale?.units ?? project.meta?.units ?? initial.scale.units),
  };
  const merged = {
    ...initial,
    ...project,
    meta: { ...initial.meta, ...project.meta, units: normalizedScale.units },
    background: normalizeBackgroundPayload(project.background, initial.background),
    scale: normalizedScale,
    hydraulics: { ...initial.hydraulics, ...sanitizeHydraulicsPatch(project.hydraulics) },
    analysis: { ...initial.analysis, ...sanitizeAnalysisPatch(project.analysis) },
    parts: { ...initial.parts, ...sanitizePartsPatch(project.parts) },
    zones: normalizedZones,
    valveBoxes: Array.isArray(project.valveBoxes) ? project.valveBoxes.map(normalizeValveBox) : [],
    controllers: Array.isArray(project.controllers) ? project.controllers.map(normalizeController) : [],
    wateringAreas: Array.isArray(project.wateringAreas)
      ? project.wateringAreas.map((wateringArea) => normalizeWateringArea(wateringArea)).filter(Boolean)
      : [],
    pipeRuns: Array.isArray(project.pipeRuns) ? project.pipeRuns.map(normalizePipeRun).filter(Boolean) : [],
    wireRuns: Array.isArray(project.wireRuns)
      ? project.wireRuns.map((wireRun) => normalizeWireRun(wireRun, normalizedZones)).filter(Boolean)
      : [],
    fittings: Array.isArray(project.fittings) ? project.fittings.map(normalizeFitting).filter(Boolean) : [],
    view: normalizedView,
    ui: {
      ...initial.ui,
      ...project.ui,
      measurePreviewPoint: null,
      fittingDraft: null,
      wateringAreaDraft: null,
      selectedPipeVertexIndex: null,
      selectedWireVertexIndex: null,
      pipeDraft: null,
      wireDraft: null,
      expandedZoneIds: [],
      calibrationMode: normalizeCalibrationMode(project.ui?.calibrationMode),
      rectificationPoints: normalizeDraftPoints(project.ui?.rectificationPoints, 4),
      fittingsPanel: sanitizeFittingsPanelState({
        ...initial.ui.fittingsPanel,
        ...project.ui?.fittingsPanel,
      }),
    },
    sprinklers: Array.isArray(project.sprinklers)
      ? project.sprinklers.map((sprinkler) => normalizeSprinkler(sprinkler, normalizedScale.units))
      : [],
  };
  merged.ui.activeTool = VALID_TOOLS.includes(merged.ui.activeTool)
    ? merged.ui.activeTool
    : "select";
  merged.ui.placementPattern = normalizePlacementPattern(merged.ui.placementPattern);
  merged.ui.pipePlacementKind = normalizePipeKind(merged.ui.pipePlacementKind);
  merged.ui.wirePlacementKind = normalizeWireKind(merged.ui.wirePlacementKind);
  normalizeLoadedSelectionState(merged.ui);
  merged.ui.appScreen = merged.ui.appScreen === "parts" ? "parts" : "layout";
  merged.history = { undoStack: [], redoStack: [] };
  return merged;
}

function findSprinkler(state, id) {
  return state.sprinklers.find((sprinkler) => sprinkler.id === id) || null;
}

export function findSelectedSprinkler(state) {
  return findSprinkler(state, state.ui.selectedSprinklerId);
}

function findWateringArea(state, id) {
  return state.wateringAreas.find((wateringArea) => wateringArea.id === id) || null;
}

export function findSelectedWateringArea(state) {
  return findWateringArea(state, state.ui.selectedWateringAreaId);
}

function findValveBox(state, id) {
  return state.valveBoxes.find((valveBox) => valveBox.id === id) || null;
}

export function findSelectedValveBox(state) {
  return findValveBox(state, state.ui.selectedValveBoxId);
}

function findController(state, id) {
  return state.controllers.find((controller) => controller.id === id) || null;
}

export function findSelectedController(state) {
  return findController(state, state.ui.selectedControllerId);
}

function findPipeRun(state, id) {
  return state.pipeRuns.find((pipeRun) => pipeRun.id === id) || null;
}

export function findSelectedPipeRun(state) {
  return findPipeRun(state, state.ui.selectedPipeRunId);
}

function findWireRun(state, id) {
  return state.wireRuns.find((wireRun) => wireRun.id === id) || null;
}

export function findSelectedWireRun(state) {
  return findWireRun(state, state.ui.selectedWireRunId);
}

function findFitting(state, id) {
  return state.fittings.find((fitting) => fitting.id === id) || null;
}

export function findSelectedFitting(state) {
  return findFitting(state, state.ui.selectedFittingId);
}

export function cloneProjectSnapshot(state) {
  const snapshot = cloneMutableState(state);
  snapshot.history = { undoStack: [], redoStack: [] };
  snapshot.ui.measurePreviewPoint = null;
  snapshot.ui.cursorWorld = null;
  snapshot.ui.fittingDraft = null;
  snapshot.ui.pipeDraft = null;
  snapshot.ui.wireDraft = null;
  snapshot.ui.wateringAreaDraft = null;
  snapshot.ui.selectedWateringAreaVertexIndex = null;
  snapshot.ui.selectedPipeVertexIndex = null;
  snapshot.ui.selectedWireVertexIndex = null;
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

function normalizeSprinkler(sprinkler, units = "ft") {
  const x = Number(sprinkler?.x);
  const y = Number(sprinkler?.y);
  const startDeg = Number(sprinkler?.startDeg);
  const sweepDeg = Number(sprinkler?.sweepDeg);
  const rotationDeg = Number(sprinkler?.rotationDeg);
  const defaultStripLength = sprinkler?.radius == null
    ? getDefaultStripLength(units)
    : sanitizePositiveQuantity(sprinkler.radius, getDefaultStripLength(units));
  const effectiveStartDeg = normalizeAngle(
    (Number.isFinite(startDeg) ? Math.round(startDeg) : 0) +
    (Number.isFinite(rotationDeg) ? Math.round(rotationDeg) : 0)
  );

  return {
    id: sprinkler?.id || crypto.randomUUID(),
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    coverageModel: normalizeCoverageModel(sprinkler?.coverageModel),
    radius: sanitizePositiveQuantity(sprinkler?.radius, getDefaultSprinklerRadius(units)),
    pattern: sprinkler?.pattern === "arc" ? "arc" : "full",
    startDeg: effectiveStartDeg,
    sweepDeg: Number.isFinite(sweepDeg) ? clamp(Math.round(sweepDeg), 1, 360) : 360,
    rotationDeg: 0,
    stripMode: normalizeStripMode(sprinkler?.stripMode),
    stripMirror: normalizeStripMirror(sprinkler?.stripMirror),
    stripLength: sanitizePositiveQuantity(sprinkler?.stripLength, defaultStripLength),
    stripWidth: sanitizePositiveQuantity(sprinkler?.stripWidth, getDefaultStripWidth(units)),
    stripRotationDeg: normalizeAngle(Number(sprinkler?.stripRotationDeg ?? startDeg ?? 0)),
    hidden: Boolean(sprinkler?.hidden),
    label: sprinkler?.label || "Sprinkler",
    zoneId: sprinkler?.zoneId || null,
  };
}

function normalizeWateringArea(wateringArea) {
  const points = normalizeWateringAreaPoints(wateringArea?.points);
  if (points.length < 3) {
    return null;
  }
  return {
    id: wateringArea?.id || crypto.randomUUID(),
    label: sanitizeWateringAreaLabel(wateringArea?.label, "Watering Area"),
    points,
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
    runtimeGroupName: sanitizeRuntimeGroupName(zone?.runtimeGroupName),
    includeInPartsList: "includeInPartsList" in (zone ?? {}) ? Boolean(zone.includeInPartsList) : true,
    valveBoxId: zone?.valveBoxId || null,
    controllerId: zone?.controllerId || null,
    stationNumber: sanitizeZoneStationNumber(zone?.stationNumber),
  };
}

function normalizeValveBox(valveBox) {
  const x = Number(valveBox?.x);
  const y = Number(valveBox?.y);
  return {
    id: valveBox?.id || crypto.randomUUID(),
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    label: valveBox?.label || "Valve Box",
  };
}

function normalizeController(controller) {
  const x = Number(controller?.x);
  const y = Number(controller?.y);
  return {
    id: controller?.id || crypto.randomUUID(),
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    label: controller?.label || "Controller",
    stationCapacity: sanitizeControllerStationCapacity(controller?.stationCapacity),
  };
}

function normalizePipeRun(pipeRun) {
  const points = normalizePipePoints(pipeRun?.points);
  if (points.length < 2) {
    return null;
  }
  const kind = normalizePipeKind(pipeRun?.kind);
  return {
    id: pipeRun?.id || crypto.randomUUID(),
    kind,
    zoneId: kind === "zone" ? (pipeRun?.zoneId || null) : null,
    label: pipeRun?.label || buildDefaultPipeRunLabel([], kind),
    diameterInches: sanitizePipeDiameter(pipeRun?.diameterInches),
    points,
  };
}

function normalizeWireRun(wireRun, zones = []) {
  const points = normalizePipePoints(wireRun?.points);
  if (points.length < 2) {
    return null;
  }
  const zonesById = new Map((zones ?? []).map((zone) => [zone.id, zone]));
  const legacyZone = wireRun?.zoneId ? zonesById.get(wireRun.zoneId) ?? null : null;
  return {
    id: wireRun?.id || crypto.randomUUID(),
    controllerId: wireRun?.controllerId || legacyZone?.controllerId || null,
    valveBoxId: wireRun?.valveBoxId || legacyZone?.valveBoxId || null,
    label: wireRun?.label || buildDefaultWireRunLabel([]),
    conductorCount: sanitizeWireConductorCount(wireRun?.conductorCount),
    gaugeAwg: normalizeWireGauge(wireRun?.gaugeAwg),
    colorCode: sanitizeWireColorCode(wireRun?.colorCode),
    points,
  };
}

function normalizeFitting(fitting) {
  if (!fitting) {
    return null;
  }

  const x = Number(fitting.x);
  const y = Number(fitting.y);
  return {
    id: fitting.id || crypto.randomUUID(),
    type: normalizeFittingType(fitting.type),
    label: String(fitting.label || ""),
    zoneId: fitting.zoneId || null,
    sizeSpec: sanitizeFittingSizeSpec(fitting.sizeSpec),
    anchor: normalizeFittingAnchor(fitting.anchor),
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    rotationDeg: normalizeAngle(Number(fitting.rotationDeg ?? 0)),
    locked: Boolean(fitting.locked),
    status: normalizeFittingStatus(fitting.status),
  };
}

function sanitizeRuntimeGroupName(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function normalizeView(view) {
  const normalized = { ...view };
  normalized.showPipe = "showPipe" in normalized ? Boolean(normalized.showPipe) : true;
  normalized.showTrench = "showTrench" in normalized ? Boolean(normalized.showTrench) : false;
  normalized.showWire = "showWire" in normalized ? Boolean(normalized.showWire) : true;
  normalized.showFittings = "showFittings" in normalized ? Boolean(normalized.showFittings) : true;
  normalized.showNozzleLabels = "showNozzleLabels" in normalized ? Boolean(normalized.showNozzleLabels) : false;

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

function sanitizeFittingsPanelState(panelState) {
  return {
    x: Number.isFinite(Number(panelState?.x)) ? Math.max(12, Number(panelState.x)) : 28,
    y: Number.isFinite(Number(panelState?.y)) ? Math.max(12, Number(panelState.y)) : 28,
    tab: normalizeFittingsPanelTab(panelState?.tab),
    zoneMode: ["auto", "main", "zone"].includes(panelState?.zoneMode) ? panelState.zoneMode : "auto",
    zoneId: panelState?.zoneId || null,
  };
}

function normalizeFittingAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") {
    return null;
  }

  const kind = ["sprinkler", "pipe_vertex", "pipe_segment", "valve_box", "free"].includes(anchor.kind)
    ? anchor.kind
    : null;
  if (!kind) {
    return null;
  }

  const normalized = { kind };
  if ("sprinklerId" in anchor) {
    normalized.sprinklerId = anchor.sprinklerId || null;
  }
  if ("pipeRunId" in anchor) {
    normalized.pipeRunId = anchor.pipeRunId || null;
  }
  if ("vertexIndex" in anchor) {
    normalized.vertexIndex = Number.isInteger(anchor.vertexIndex) ? anchor.vertexIndex : null;
  }
  if ("segmentIndex" in anchor) {
    normalized.segmentIndex = Number.isInteger(anchor.segmentIndex) ? anchor.segmentIndex : null;
  }
  if ("valveBoxId" in anchor) {
    normalized.valveBoxId = anchor.valveBoxId || null;
  }
  if ("t" in anchor) {
    const t = Number(anchor.t);
    normalized.t = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : null;
  }

  return normalized;
}

function sanitizeFittingSizeSpec(sizeSpec) {
  return sizeSpec == null ? null : String(sizeSpec).trim() || null;
}

function normalizeDraftPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!(Number.isFinite(x) && Number.isFinite(y))) {
    return null;
  }
  return { x, y };
}

function normalizeFittingStatus(status) {
  return status === "ignored" ? "ignored" : "placed";
}

function normalizeCalibrationMode(mode) {
  return mode === "rectify" ? "rectify" : "scale";
}

function normalizeDraftPoints(points, limit) {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .slice(0, limit)
    .map((point) => normalizeDraftPoint(point))
    .filter(Boolean);
}

function normalizePlacementPattern(value) {
  return ["full", "quarter", "half", "arc", "strip"].includes(value) ? value : "full";
}

function buildDefaultWateringAreaLabel(wateringAreas) {
  const count = Array.isArray(wateringAreas) ? wateringAreas.length + 1 : 1;
  return `Area ${count}`;
}

function sanitizeWateringAreaLabel(value, fallback = "Watering Area") {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || fallback;
}

function collectDependentFittingIdsForPipeRun(state, pipeRun) {
  const dependentIds = new Set();
  if (!pipeRun?.id) {
    return dependentIds;
  }

  for (const fitting of state.fittings ?? []) {
    if (fitting.anchor?.pipeRunId === pipeRun.id) {
      dependentIds.add(fitting.id);
    }
  }

  if (normalizePipeKind(pipeRun.kind) !== "zone" || !pipeRun.zoneId) {
    return dependentIds;
  }

  for (const fitting of state.fittings ?? []) {
    if (dependentIds.has(fitting.id) || fitting.status !== "placed") {
      continue;
    }
    if (!isSprinklerHeadFitting(fitting)) {
      continue;
    }

    const sprinkler = findSprinkler(state, fitting.anchor.sprinklerId);
    if (!sprinkler || sprinkler.zoneId !== pipeRun.zoneId) {
      continue;
    }

    if (fitting.anchor.pipeRunId && fitting.anchor.pipeRunId === pipeRun.id) {
      dependentIds.add(fitting.id);
      continue;
    }

    if (pipeRunTouchesPoint(state, pipeRun, sprinkler)) {
      dependentIds.add(fitting.id);
      continue;
    }

    const nearestZonePipe = findNearestZonePipeRunForPoint(state.pipeRuns, sprinkler.zoneId, sprinkler);
    if (nearestZonePipe?.id === pipeRun.id) {
      dependentIds.add(fitting.id);
    }
  }

  return dependentIds;
}

function isSprinklerHeadFitting(fitting) {
  return fitting?.anchor?.kind === "sprinkler"
    && Boolean(fitting.anchor.sprinklerId)
    && ["head_takeoff", "elbow"].includes(fitting.type);
}

function findNearestZonePipeRunForPoint(pipeRuns, zoneId, point) {
  if (!zoneId || !point) {
    return null;
  }

  let bestPipeRun = null;
  let bestDistanceSquared = Infinity;

  for (const pipeRun of pipeRuns ?? []) {
    if (normalizePipeKind(pipeRun.kind) !== "zone" || pipeRun.zoneId !== zoneId) {
      continue;
    }

    const points = normalizePipePoints(pipeRun.points);
    for (let index = 1; index < points.length; index += 1) {
      const distanceSquared = distancePointToSegmentSquared(point, points[index - 1], points[index]);
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        bestPipeRun = pipeRun;
      }
    }
  }

  return bestPipeRun;
}

function pipeRunTouchesPoint(state, pipeRun, point, epsilon = resolveHeadConnectionPipeEpsilon(state)) {
  const safePoint = normalizeDraftPoint(point);
  if (!pipeRun?.points?.length || !safePoint) {
    return false;
  }

  const safePoints = normalizePipePoints(pipeRun.points);
  for (let index = 1; index < safePoints.length; index += 1) {
    const distanceSquared = distancePointToSegmentSquared(safePoint, safePoints[index - 1], safePoints[index]);
    if (distanceSquared <= epsilon ** 2) {
      return true;
    }
  }

  return false;
}

function detachFittingAnchors(fittings, targetKind, targetId) {
  for (const fitting of fittings ?? []) {
    if (!fitting.anchor) {
      continue;
    }
    if (targetKind === "sprinkler" && fitting.anchor.sprinklerId === targetId) {
      fitting.anchor = null;
    }
    if (targetKind === "pipe_run" && fitting.anchor.pipeRunId === targetId) {
      fitting.anchor = null;
    }
    if (targetKind === "valve_box" && fitting.anchor.valveBoxId === targetId) {
      fitting.anchor = null;
    }
  }
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

function buildDefaultPipeRunLabel(pipeRuns, kind) {
  const safeKind = normalizePipeKind(kind);
  const count = (pipeRuns ?? []).filter((pipeRun) => normalizePipeKind(pipeRun.kind) === safeKind).length + 1;
  return safeKind === "main" ? `Main line ${count}` : `Zone line ${count}`;
}

function buildDefaultWireRunLabel(wireRuns) {
  const count = (wireRuns ?? []).length + 1;
  return `Wire run ${count}`;
}

function getRequiredWireConductorsForValveBox(state, valveBoxId) {
  if (!valveBoxId) {
    return null;
  }
  const zoneCount = (state.zones ?? []).filter((zone) => zone.valveBoxId === valveBoxId).length;
  return zoneCount + 1;
}

function normalizeLoadedSelectionState(ui) {
  const selectionKeys = [
    "selectedSprinklerId",
    "selectedWateringAreaId",
    "selectedValveBoxId",
    "selectedControllerId",
    "selectedPipeRunId",
    "selectedWireRunId",
    "selectedFittingId",
  ];
  const activeKeys = selectionKeys.filter((key) => ui[key]);
  if (activeKeys.length <= 1) {
    if (!ui.selectedPipeRunId) {
      ui.selectedPipeVertexIndex = null;
    }
    if (!ui.selectedWateringAreaId) {
      ui.selectedWateringAreaVertexIndex = null;
    }
    if (!ui.selectedWireRunId) {
      ui.selectedWireVertexIndex = null;
    }
    return;
  }

  const keepKey = activeKeys[0];
  selectionKeys.forEach((key) => {
    if (key !== keepKey) {
      ui[key] = null;
    }
  });
  if (keepKey !== "selectedPipeRunId") {
    ui.selectedPipeVertexIndex = null;
  }
  if (keepKey !== "selectedWateringAreaId") {
    ui.selectedWateringAreaVertexIndex = null;
  }
  if (keepKey !== "selectedWireRunId") {
    ui.selectedWireVertexIndex = null;
  }
}
