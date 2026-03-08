import { clamp } from "../geometry/arcs.js";
import { fitBackgroundToView } from "../geometry/scale.js";
import { cloneProjectSnapshot, findSelectedSprinkler, hasHydraulics, isProjectReady } from "../state/project-state.js";

export function bindPanels({ store, renderer, interactions, io }) {
  const elements = bindElements();
  bindEvents(elements, store, renderer, interactions, io);
  store.subscribe((state) => updateUi(elements, state, renderer));
  updateUi(elements, store.getState(), renderer);
}

function bindElements() {
  return {
    toolButtons: [...document.querySelectorAll("[data-tool]")],
    placementPattern: document.getElementById("placement-pattern"),
    projectName: document.getElementById("project-name"),
    unitsSelect: document.getElementById("units-select"),
    backgroundInput: document.getElementById("background-input"),
    saveJsonButton: document.getElementById("save-json-button"),
    loadJsonButton: document.getElementById("load-json-button"),
    exportPngButton: document.getElementById("export-png-button"),
    resetViewButton: document.getElementById("reset-view-button"),
    projectJsonInput: document.getElementById("project-json-input"),
    calibrationDistance: document.getElementById("calibration-distance"),
    ratioPixels: document.getElementById("ratio-pixels"),
    ratioUnits: document.getElementById("ratio-units"),
    applyTwoPointButton: document.getElementById("apply-two-point-button"),
    applyRatioButton: document.getElementById("apply-ratio-button"),
    calibrationPointsLabel: document.getElementById("calibration-points-label"),
    lineSizeSelect: document.getElementById("line-size-select"),
    pressureInput: document.getElementById("pressure-input"),
    toggleCoverage: document.getElementById("toggle-coverage"),
    toggleGrid: document.getElementById("toggle-grid"),
    toggleLabels: document.getElementById("toggle-labels"),
    coverageOpacity: document.getElementById("coverage-opacity"),
    undoButton: document.getElementById("undo-button"),
    redoButton: document.getElementById("redo-button"),
    historySummary: document.getElementById("history-summary"),
    selectionEmpty: document.getElementById("selection-empty"),
    selectionForm: document.getElementById("selection-form"),
    sprinklerLabel: document.getElementById("sprinkler-label"),
    sprinklerX: document.getElementById("sprinkler-x"),
    sprinklerY: document.getElementById("sprinkler-y"),
    sprinklerRadius: document.getElementById("sprinkler-radius"),
    sprinklerPattern: document.getElementById("sprinkler-pattern"),
    sprinklerStart: document.getElementById("sprinkler-start"),
    sprinklerSweep: document.getElementById("sprinkler-sweep"),
    sprinklerRotation: document.getElementById("sprinkler-rotation"),
    sprinklerHidden: document.getElementById("sprinkler-hidden"),
    duplicateButton: document.getElementById("duplicate-sprinkler-button"),
    deleteButton: document.getElementById("delete-sprinkler-button"),
    scaleStatus: document.getElementById("scale-status"),
    hydraulicsStatus: document.getElementById("hydraulics-status"),
    readyStatus: document.getElementById("ready-status"),
    projectSummary: document.getElementById("project-summary"),
  };
}

function bindEvents(elements, store, renderer, interactions, io) {
  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      store.dispatch({ type: "SET_ACTIVE_TOOL", payload: { tool: button.dataset.tool } });
    });
  });

  elements.placementPattern.addEventListener("change", () => {
    store.dispatch({ type: "SET_PLACEMENT_PATTERN", payload: { pattern: elements.placementPattern.value } });
  });

  elements.projectName.addEventListener("input", () => {
    store.dispatch({ type: "SET_PROJECT_NAME", payload: { name: elements.projectName.value } });
  });

  elements.unitsSelect.addEventListener("change", () => {
    store.dispatch({ type: "SET_UNITS", payload: { units: elements.unitsSelect.value } });
  });

  elements.backgroundInput.addEventListener("change", async () => {
    const file = elements.backgroundInput.files?.[0];
    if (!file) {
      return;
    }
    const background = await io.loadImageFile(file);
    store.dispatch({ type: "SET_BACKGROUND", payload: background });
    const canvas = document.getElementById("sprinkler-canvas");
    store.dispatch({ type: "SET_VIEW", payload: fitBackgroundToView(background, canvas.width, canvas.height) });
  });

  elements.saveJsonButton.addEventListener("click", () => {
    io.exportProjectJson(cloneProjectSnapshot(store.getState()));
  });

  elements.loadJsonButton.addEventListener("click", () => {
    elements.projectJsonInput.click();
  });

  elements.projectJsonInput.addEventListener("change", async () => {
    const file = elements.projectJsonInput.files?.[0];
    if (!file) {
      return;
    }
    const project = await io.loadProjectFile(file);
    store.dispatch({ type: "LOAD_PROJECT", payload: { project } });
    interactions.fitBackground();
  });

  elements.exportPngButton.addEventListener("click", () => {
    io.exportCanvasPng(document.getElementById("sprinkler-canvas"), store.getState().meta.projectName);
  });

  elements.resetViewButton.addEventListener("click", () => {
    interactions.fitBackground();
    if (!store.getState().background.src) {
      store.dispatch({ type: "RESET_VIEW" });
    }
  });

  elements.applyTwoPointButton.addEventListener("click", () => {
    if (!interactions.applyTwoPointCalibration(Number(elements.calibrationDistance.value), elements.unitsSelect.value)) {
      alert("Select two calibration points and enter a valid distance.");
    }
  });

  elements.applyRatioButton.addEventListener("click", () => {
    if (!interactions.applyRatioCalibration(Number(elements.ratioPixels.value), Number(elements.ratioUnits.value), elements.unitsSelect.value)) {
      alert("Enter valid ratio values greater than zero.");
    }
  });

  const updateHydraulics = () => {
    store.dispatch({
      type: "SET_HYDRAULICS",
      payload: {
        lineSizeInches: elements.lineSizeSelect.value ? Number(elements.lineSizeSelect.value) : null,
        pressurePsi: elements.pressureInput.value ? Number(elements.pressureInput.value) : null,
      },
    });
  };
  elements.lineSizeSelect.addEventListener("change", updateHydraulics);
  elements.pressureInput.addEventListener("input", updateHydraulics);

  elements.toggleCoverage.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showCoverage: elements.toggleCoverage.checked } });
  });
  elements.toggleGrid.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showGrid: elements.toggleGrid.checked } });
  });
  elements.toggleLabels.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showLabels: elements.toggleLabels.checked } });
  });
  elements.coverageOpacity.addEventListener("input", () => {
    store.dispatch({ type: "SET_VIEW", payload: { coverageOpacity: Number(elements.coverageOpacity.value) } });
  });

  [
    elements.sprinklerLabel,
    elements.sprinklerX,
    elements.sprinklerY,
    elements.sprinklerRadius,
    elements.sprinklerPattern,
    elements.sprinklerStart,
    elements.sprinklerSweep,
    elements.sprinklerRotation,
    elements.sprinklerHidden,
  ].forEach((element) => {
    const eventName = element.type === "checkbox" || element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, () => updateSelection(elements, store));
  });

  elements.deleteButton.addEventListener("click", () => {
    const selected = findSelectedSprinkler(store.getState());
    if (selected) {
      store.dispatch({ type: "DELETE_SPRINKLER", payload: { id: selected.id } });
    }
  });

  elements.duplicateButton.addEventListener("click", () => {
    const selected = findSelectedSprinkler(store.getState());
    if (selected) {
      store.dispatch({ type: "DUPLICATE_SPRINKLER", payload: { id: selected.id, newId: crypto.randomUUID() } });
    }
  });

  elements.undoButton.addEventListener("click", () => store.dispatch({ type: "UNDO" }));
  elements.redoButton.addEventListener("click", () => store.dispatch({ type: "REDO" }));
}

function updateSelection(elements, store) {
  const selected = findSelectedSprinkler(store.getState());
  if (!selected) {
    return;
  }
  store.dispatch({
    type: "UPDATE_SPRINKLER",
    payload: {
      id: selected.id,
      patch: {
        label: elements.sprinklerLabel.value,
        x: Number(elements.sprinklerX.value),
        y: Number(elements.sprinklerY.value),
        radius: Number(elements.sprinklerRadius.value),
        pattern: elements.sprinklerPattern.value,
        startDeg: Number(elements.sprinklerStart.value),
        sweepDeg: clamp(Number(elements.sprinklerSweep.value), 1, 360),
        rotationDeg: Number(elements.sprinklerRotation.value),
        hidden: elements.sprinklerHidden.checked,
      },
    },
  });
}

function updateUi(elements, state, renderer) {
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === state.ui.activeTool);
  });
  elements.projectName.value = state.meta.projectName;
  elements.unitsSelect.value = state.scale.units;
  elements.placementPattern.value = state.ui.placementPattern;
  elements.lineSizeSelect.value = state.hydraulics.lineSizeInches ? String(state.hydraulics.lineSizeInches) : "";
  elements.pressureInput.value = state.hydraulics.pressurePsi ?? "";
  elements.toggleCoverage.checked = state.view.showCoverage;
  elements.toggleGrid.checked = state.view.showGrid;
  elements.toggleLabels.checked = state.view.showLabels;
  elements.coverageOpacity.value = String(state.view.coverageOpacity);
  elements.calibrationPointsLabel.textContent = `Calibration points: ${state.scale.calibrationPoints.length} selected`;
  elements.historySummary.textContent = `${state.history.undoStack.length} undo / ${state.history.redoStack.length} redo`;
  elements.undoButton.disabled = !state.history.undoStack.length;
  elements.redoButton.disabled = !state.history.redoStack.length;

  const selected = findSelectedSprinkler(state);
  elements.selectionEmpty.hidden = Boolean(selected);
  elements.selectionForm.hidden = !selected;
  if (selected) {
    elements.sprinklerLabel.value = selected.label ?? "";
    elements.sprinklerX.value = selected.x.toFixed(2);
    elements.sprinklerY.value = selected.y.toFixed(2);
    elements.sprinklerRadius.value = selected.radius.toFixed(2);
    elements.sprinklerPattern.value = selected.pattern;
    elements.sprinklerStart.value = String(selected.startDeg);
    elements.sprinklerSweep.value = String(selected.sweepDeg);
    elements.sprinklerRotation.value = String(selected.rotationDeg);
    elements.sprinklerHidden.checked = selected.hidden;
  }

  applyStatus(elements.scaleStatus, state.scale.calibrated ? "Calibrated" : "Uncalibrated", state.scale.calibrated);
  applyStatus(elements.hydraulicsStatus, hasHydraulics(state) ? "Hydraulics set" : "Hydraulics missing", hasHydraulics(state));
  applyStatus(elements.readyStatus, isProjectReady(state) ? "Ready" : "Draft", isProjectReady(state), !isProjectReady(state) && !!state.background.src);

  const summary = renderer.buildExportSummary();
  const lines = [
    ["Background", state.background.name || "None"],
    ["Scale", state.scale.calibrated ? `${state.scale.pixelsPerUnit.toFixed(2)} px/${state.scale.units}` : "Not calibrated"],
    ["Heads", String(summary.sprinklerCount)],
    ["Mean radius", summary.meanRadius ? `${summary.meanRadius.toFixed(1)} ${state.scale.units}` : "--"],
    ["Line size", state.hydraulics.lineSizeInches ? `${state.hydraulics.lineSizeInches} in` : "--"],
    ["Pressure", state.hydraulics.pressurePsi ? `${state.hydraulics.pressurePsi} psi` : "--"],
    ["Plan size", summary.backgroundSize],
  ];
  elements.projectSummary.innerHTML = lines.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
}

function applyStatus(node, label, ok, warningOnly = false) {
  node.textContent = label;
  node.className = "status-pill";
  if (!ok) {
    node.classList.add(warningOnly ? "status-pill-danger" : "status-pill-warning");
  }
}
