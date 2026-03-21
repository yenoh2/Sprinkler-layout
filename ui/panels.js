import { clamp } from "../geometry/arcs.js";
import { fitBackgroundToView } from "../geometry/scale.js";
import { cloneProjectSnapshot, findSelectedSprinkler, getNextZoneSeed, hasHydraulics, isProjectReady } from "../state/project-state.js";

export function bindPanels({ store, renderer, analyzer, interactions, io }) {
  const elements = bindElements();
  elements.__store = store;
  bindEvents(elements, store, renderer, interactions, io);
  store.subscribe((state) => updateUi(elements, state, renderer, analyzer));
  updateUi(elements, store.getState(), renderer, analyzer);
}

function bindElements() {
  return {
    screenButtons: [...document.querySelectorAll("[data-screen]")],
    topbarTools: document.querySelector(".topbar-tools"),
    layoutScreen: document.getElementById("layout-screen"),
    partsScreen: document.getElementById("parts-screen"),
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
    zoneViewMode: document.getElementById("zone-view-mode"),
    activeZoneSelect: document.getElementById("active-zone-select"),
    createZoneButton: document.getElementById("create-zone-button"),
    clearZoneFocusButton: document.getElementById("clear-zone-focus-button"),
    zonesList: document.getElementById("zones-list"),
    toggleCoverage: document.getElementById("toggle-coverage"),
    toggleGrid: document.getElementById("toggle-grid"),
    toggleLabels: document.getElementById("toggle-labels"),
    toggleZoneLabels: document.getElementById("toggle-zone-labels"),
    coverageOpacity: document.getElementById("coverage-opacity"),
    analysisOverlayMode: document.getElementById("analysis-overlay-mode"),
    analysisTargetDepth: document.getElementById("analysis-target-depth"),
    analysisZoneSelect: document.getElementById("analysis-zone-select"),
    analysisCellPx: document.getElementById("analysis-cell-px"),
    analysisRateScaleMode: document.getElementById("analysis-rate-scale-mode"),
    analysisRateScaleMax: document.getElementById("analysis-rate-scale-max"),
    analysisLegend: document.getElementById("analysis-legend"),
    analysisSummary: document.getElementById("analysis-summary"),
    undoButton: document.getElementById("undo-button"),
    redoButton: document.getElementById("redo-button"),
    historySummary: document.getElementById("history-summary"),
    selectionEmpty: document.getElementById("selection-empty"),
    selectionForm: document.getElementById("selection-form"),
    sprinklerCoverageModel: document.getElementById("sprinkler-coverage-model"),
    sprinklerLabel: document.getElementById("sprinkler-label"),
    sprinklerX: document.getElementById("sprinkler-x"),
    sprinklerY: document.getElementById("sprinkler-y"),
    sprinklerRadius: document.getElementById("sprinkler-radius"),
    sprinklerPattern: document.getElementById("sprinkler-pattern"),
    sprinklerStart: document.getElementById("sprinkler-start"),
    sprinklerSweep: document.getElementById("sprinkler-sweep"),
    sectorRadiusPattern: document.getElementById("sector-radius-pattern"),
    sectorAngleFields: document.getElementById("sector-angle-fields"),
    stripFields: document.getElementById("strip-fields"),
    sprinklerStripMode: document.getElementById("sprinkler-strip-mode"),
    sprinklerStripMirrorField: document.getElementById("sprinkler-strip-mirror-field"),
    sprinklerStripMirror: document.getElementById("sprinkler-strip-mirror"),
    sprinklerStripLength: document.getElementById("sprinkler-strip-length"),
    sprinklerStripWidth: document.getElementById("sprinkler-strip-width"),
    sprinklerStripRotation: document.getElementById("sprinkler-strip-rotation"),
    sprinklerZone: document.getElementById("sprinkler-zone"),
    sprinklerZonePicker: document.getElementById("sprinkler-zone-picker"),
    sprinklerZoneButton: document.getElementById("sprinkler-zone-button"),
    sprinklerZoneLabel: document.getElementById("sprinkler-zone-label"),
    sprinklerZoneDot: document.getElementById("sprinkler-zone-dot"),
    sprinklerZoneMenu: document.getElementById("sprinkler-zone-menu"),
    sprinklerHidden: document.getElementById("sprinkler-hidden"),
    sprinklerAnalysis: document.getElementById("sprinkler-analysis"),
    duplicateButton: document.getElementById("duplicate-sprinkler-button"),
    deleteButton: document.getElementById("delete-sprinkler-button"),
    scaleStatus: document.getElementById("scale-status"),
    hydraulicsStatus: document.getElementById("hydraulics-status"),
    readyStatus: document.getElementById("ready-status"),
    projectSummary: document.getElementById("project-summary"),
    partsIncludeAll: document.getElementById("parts-include-all"),
    partsExcludeAll: document.getElementById("parts-exclude-all"),
    partsZoneFilters: document.getElementById("parts-zone-filters"),
    partsGroupBy: document.getElementById("parts-group-by"),
    partsShowZoneUsage: document.getElementById("parts-show-zone-usage"),
    partsSummary: document.getElementById("parts-summary"),
    partsEmpty: document.getElementById("parts-empty"),
    partsTable: document.getElementById("parts-table"),
  };
}

function bindEvents(elements, store, renderer, interactions, io) {
  elements.screenButtons.forEach((button) => {
    button.addEventListener("click", () => {
      store.dispatch({ type: "SET_APP_SCREEN", payload: { screen: button.dataset.screen } });
    });
  });

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

  elements.zoneViewMode.addEventListener("change", () => {
    store.dispatch({ type: "SET_ZONE_VIEW_MODE", payload: { mode: elements.zoneViewMode.value } });
  });
  elements.activeZoneSelect.addEventListener("change", () => {
    store.dispatch({ type: "SET_ACTIVE_ZONE", payload: { id: elements.activeZoneSelect.value || null } });
  });
  elements.createZoneButton.addEventListener("click", () => {
    const seed = getNextZoneSeed(store.getState());
    store.dispatch({
      type: "CREATE_ZONE",
      payload: { id: crypto.randomUUID(), name: seed.name, color: seed.color },
    });
  });
  elements.clearZoneFocusButton.addEventListener("click", () => {
    store.dispatch({ type: "SET_FOCUSED_ZONE", payload: { id: null } });
  });

  elements.toggleCoverage.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showCoverage: elements.toggleCoverage.checked } });
  });
  elements.toggleGrid.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showGrid: elements.toggleGrid.checked } });
  });
  elements.toggleLabels.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showLabels: elements.toggleLabels.checked } });
  });
  elements.toggleZoneLabels.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showZoneLabels: elements.toggleZoneLabels.checked } });
  });
  elements.coverageOpacity.addEventListener("input", () => {
    store.dispatch({ type: "SET_VIEW", payload: { coverageOpacity: Number(elements.coverageOpacity.value) } });
  });

  elements.analysisOverlayMode.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { analysisOverlayMode: elements.analysisOverlayMode.value } });
  });
  elements.analysisTargetDepth.addEventListener("change", () => {
    const value = Math.max(0.1, Number(elements.analysisTargetDepth.value) || 1);
    store.dispatch({ type: "SET_ANALYSIS", payload: { targetDepthInches: value } });
  });
  elements.analysisZoneSelect.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { analysisZoneId: elements.analysisZoneSelect.value || null } });
  });
  elements.analysisCellPx.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { heatmapCellPx: Number(elements.analysisCellPx.value) } });
  });
  elements.analysisRateScaleMode.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { heatmapScaleMode: elements.analysisRateScaleMode.value } });
  });
  elements.analysisRateScaleMax.addEventListener("input", () => {
    const value = Math.max(0.1, Number(elements.analysisRateScaleMax.value) || 3);
    store.dispatch({ type: "SET_VIEW", payload: { heatmapScaleMaxInHr: value } });
  });
  elements.partsGroupBy.addEventListener("change", () => {
    store.dispatch({ type: "SET_PARTS_VIEW", payload: { groupBy: elements.partsGroupBy.value } });
  });
  elements.partsShowZoneUsage.addEventListener("change", () => {
    store.dispatch({ type: "SET_PARTS_VIEW", payload: { showZoneUsage: elements.partsShowZoneUsage.checked } });
  });
  elements.partsIncludeAll.addEventListener("click", () => {
    store.dispatch({ type: "SET_ALL_ZONES_PARTS_INCLUSION", payload: { includeInPartsList: true } });
  });
  elements.partsExcludeAll.addEventListener("click", () => {
    store.dispatch({ type: "SET_ALL_ZONES_PARTS_INCLUSION", payload: { includeInPartsList: false } });
  });

  [
    elements.sprinklerCoverageModel,
    elements.sprinklerLabel,
    elements.sprinklerX,
    elements.sprinklerY,
    elements.sprinklerRadius,
    elements.sprinklerPattern,
    elements.sprinklerStart,
    elements.sprinklerSweep,
    elements.sprinklerStripMode,
    elements.sprinklerStripMirror,
    elements.sprinklerStripLength,
    elements.sprinklerStripWidth,
    elements.sprinklerStripRotation,
    elements.sprinklerHidden,
  ].forEach((element) => {
    const eventName = element.type === "checkbox" || element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, () => updateSelection(elements, store));
  });

  elements.sprinklerZoneButton.addEventListener("click", () => {
    setZonePickerOpen(elements, elements.sprinklerZoneMenu.hidden);
  });
  elements.sprinklerZoneButton.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setZonePickerOpen(elements, true);
    }
  });
  elements.sprinklerZoneMenu.addEventListener("click", (event) => {
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-zone-option]");
    if (!button) {
      return;
    }
    setZonePickerOpen(elements, false);
    elements.sprinklerZone.value = button.dataset.zoneOption;
    updateSelection(elements, store);
    elements.sprinklerZoneButton.focus();
  });
  elements.sprinklerZonePicker.addEventListener("focusout", (event) => {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!nextTarget || !elements.sprinklerZonePicker.contains(nextTarget)) {
      setZonePickerOpen(elements, false);
    }
  });
  document.addEventListener("click", (event) => {
    if (!elements.sprinklerZonePicker.contains(event.target)) {
      setZonePickerOpen(elements, false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setZonePickerOpen(elements, false);
    }
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
  const coverageValue = elements.sprinklerCoverageModel.value;
  const isStrip = coverageValue === "strip";
  store.dispatch({
    type: "UPDATE_SPRINKLER",
    payload: {
      id: selected.id,
      patch: {
        label: elements.sprinklerLabel.value,
        x: Number(elements.sprinklerX.value),
        y: Number(elements.sprinklerY.value),
        coverageModel: isStrip ? "strip" : "sector",
        radius: Number(elements.sprinklerRadius.value),
        pattern: coverageValue === "arc" ? "arc" : "full",
        startDeg: Number(elements.sprinklerStart.value),
        sweepDeg: clamp(Number(elements.sprinklerSweep.value), 1, 360),
        rotationDeg: 0,
        stripMode: elements.sprinklerStripMode.value,
        stripMirror: elements.sprinklerStripMirror.value,
        stripLength: Number(elements.sprinklerStripLength.value),
        stripWidth: Number(elements.sprinklerStripWidth.value),
        stripRotationDeg: Number(elements.sprinklerStripRotation.value),
        zoneId: elements.sprinklerZone.value || null,
        hidden: elements.sprinklerHidden.checked,
      },
    },
  });
}

function updateUi(elements, state, renderer, analyzer) {
  const analysis = analyzer?.getSnapshot(state) ?? null;
  const isPartsScreen = state.ui.appScreen === "parts";

  elements.screenButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === state.ui.appScreen);
  });
  elements.layoutScreen.hidden = isPartsScreen;
  elements.partsScreen.hidden = !isPartsScreen;
  elements.topbarTools.hidden = isPartsScreen;

  elements.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === state.ui.activeTool);
  });
  elements.projectName.value = state.meta.projectName;
  elements.unitsSelect.value = state.scale.units;
  elements.placementPattern.value = state.ui.placementPattern;
  elements.lineSizeSelect.value = state.hydraulics.lineSizeInches ? String(state.hydraulics.lineSizeInches) : "";
  elements.pressureInput.value = state.hydraulics.pressurePsi ?? "";
  elements.zoneViewMode.value = state.view.zoneViewMode;
  elements.toggleCoverage.checked = state.view.showCoverage;
  elements.toggleGrid.checked = state.view.showGrid;
  elements.toggleLabels.checked = state.view.showLabels;
  elements.toggleZoneLabels.checked = state.view.showZoneLabels;
  elements.coverageOpacity.value = String(state.view.coverageOpacity);
  elements.analysisOverlayMode.value = state.view.analysisOverlayMode ?? "application_rate";
  elements.analysisTargetDepth.value = formatEditableNumber(state.analysis.targetDepthInches ?? 1);
  elements.analysisCellPx.value = String(state.view.heatmapCellPx ?? 18);
  elements.analysisRateScaleMode.value = state.view.heatmapScaleMode ?? "zone";
  elements.analysisRateScaleMax.value = formatEditableNumber(state.view.heatmapScaleMaxInHr ?? 3);
  elements.partsGroupBy.value = state.parts.groupBy ?? "body_nozzle_split";
  elements.partsShowZoneUsage.checked = state.parts.showZoneUsage !== false;
  elements.analysisRateScaleMode.disabled = (state.view.analysisOverlayMode ?? "application_rate") !== "application_rate";
  elements.analysisRateScaleMax.disabled = elements.analysisRateScaleMode.disabled || (state.view.heatmapScaleMode ?? "zone") !== "fixed";
  elements.calibrationPointsLabel.textContent = `Calibration points: ${state.scale.calibrationPoints.length} selected`;
  elements.historySummary.textContent = `${state.history.undoStack.length} undo / ${state.history.redoStack.length} redo`;
  elements.undoButton.disabled = !state.history.undoStack.length;
  elements.redoButton.disabled = !state.history.redoStack.length;

  const selected = findSelectedSprinkler(state);
  populateZoneSelect(elements.activeZoneSelect, state.zones, state.ui.activeZoneId);
  populateAnalysisZoneSelect(elements.analysisZoneSelect, state.zones, analysis?.selectedZoneId ?? state.view.analysisZoneId ?? "");
  elements.analysisZoneSelect.disabled = (state.view.analysisOverlayMode ?? "application_rate") !== "zone_catch_can" || !state.zones.length;
  populateSprinklerZonePicker(elements, state.zones, selected?.zoneId ?? "");
  if (!selected) {
    setZonePickerOpen(elements, false);
  }

  renderZonesList(elements, state, analysis);
  elements.selectionEmpty.hidden = Boolean(selected);
  elements.selectionForm.hidden = !selected;
  if (selected) {
    const coverageValue = selected.coverageModel === "strip"
      ? "strip"
      : selected.pattern === "arc"
        ? "arc"
        : "full";
    elements.sprinklerLabel.value = selected.label ?? "";
    elements.sprinklerX.value = formatEditableNumber(selected.x);
    elements.sprinklerY.value = formatEditableNumber(selected.y);
    elements.sprinklerCoverageModel.value = coverageValue;
    elements.sprinklerRadius.value = formatEditableNumber(selected.radius);
    elements.sprinklerPattern.value = selected.pattern;
    elements.sprinklerStart.value = String((selected.startDeg + selected.rotationDeg) % 360);
    elements.sprinklerSweep.value = String(selected.sweepDeg);
    elements.sprinklerStripMode.value = selected.stripMode ?? "end";
    elements.sprinklerStripMirror.value = selected.stripMirror ?? "right";
    elements.sprinklerStripLength.value = formatEditableNumber(selected.stripLength ?? 15);
    elements.sprinklerStripWidth.value = formatEditableNumber(selected.stripWidth ?? 4);
    elements.sprinklerStripRotation.value = String(Math.round(selected.stripRotationDeg ?? 0));
    elements.sprinklerZone.value = selected.zoneId ?? "";
    elements.sprinklerHidden.checked = selected.hidden;

    const isStrip = coverageValue === "strip";
    elements.sectorRadiusPattern.hidden = isStrip;
    elements.sectorAngleFields.hidden = isStrip;
    elements.stripFields.hidden = !isStrip;
    elements.sprinklerStripMirrorField.hidden = !isStrip || elements.sprinklerStripMode.value !== "corner";
  } else {
    elements.sectorRadiusPattern.hidden = false;
    elements.sectorAngleFields.hidden = false;
    elements.stripFields.hidden = true;
    elements.sprinklerStripMirrorField.hidden = true;
  }

  renderSprinklerAnalysis(elements.sprinklerAnalysis, selected, analysis);
  renderAnalysisLegend(elements, state, analysis);
  renderPartsScreen(elements, state, analysis);

  applyStatus(elements.scaleStatus, state.scale.calibrated ? "Calibrated" : "Uncalibrated", state.scale.calibrated);
  applyStatus(elements.hydraulicsStatus, hasHydraulics(state) ? "Hydraulics set" : "Hydraulics missing", hasHydraulics(state));
  applyStatus(elements.readyStatus, isProjectReady(state) ? "Ready" : "Draft", isProjectReady(state), !isProjectReady(state) && !!state.background.src);

  const summary = renderer.buildExportSummary();
  const lines = [
    ["Background", state.background.name || "None"],
    ["Scale", state.scale.calibrated ? `${state.scale.pixelsPerUnit.toFixed(2)} px/${state.scale.units}` : "Not calibrated"],
    ["Heads", String(summary.sprinklerCount)],
    ["Mean size", summary.meanRadius ? `${summary.meanRadius.toFixed(1)} ${state.scale.units}` : "--"],
    ["Peak rate", analysis?.summary.applicationRateMaxInHr ? `${analysis.summary.applicationRateMaxInHr.toFixed(2)} in/hr` : "--"],
    ["Avg rate", analysis?.summary.applicationRateAverageInHr ? `${analysis.summary.applicationRateAverageInHr.toFixed(2)} in/hr` : "--"],
    ["Target depth", `${(analysis?.targetDepthInches ?? state.analysis.targetDepthInches ?? 1).toFixed(2)} in`],
    ["Avg schedule depth", analysis?.summary.fullScheduleAverageDepthInches ? `${analysis.summary.fullScheduleAverageDepthInches.toFixed(2)} in` : "--"],
    ["Peak schedule depth", analysis?.summary.fullScheduleMaxDepthInches ? `${analysis.summary.fullScheduleMaxDepthInches.toFixed(2)} in` : "--"],
    ["Over-limit zones", String(analysis?.summary.overLimitZones ?? 0)],
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

function populateZoneSelect(select, zones, value) {
  const current = value ?? "";
  const options = ['<option value="">Unassigned</option>']
    .concat(zones.map((zone) => `<option value="${zone.id}">${zone.name}</option>`));
  select.innerHTML = options.join("");
  select.value = current;
}

function populateAnalysisZoneSelect(select, zones, value) {
  const current = value ?? "";
  const options = ['<option value="">Select zone</option>']
    .concat(zones.map((zone) => `<option value="${zone.id}">${zone.name}</option>`));
  select.innerHTML = options.join("");
  select.value = current && zones.some((zone) => zone.id === current) ? current : "";
}

function populateSprinklerZonePicker(elements, zones, value) {
  const current = value ?? "";
  elements.sprinklerZone.value = current;
  const selectedZone = zones.find((zone) => zone.id === current) ?? null;
  elements.sprinklerZoneLabel.textContent = selectedZone?.name ?? "Unassigned";
  elements.sprinklerZoneDot.style.background = selectedZone?.color ?? "rgba(119, 102, 85, 0.25)";
  elements.sprinklerZoneMenu.innerHTML = [
    renderZonePickerOption({ id: "", name: "Unassigned", color: null }, current === ""),
    ...zones.map((zone) => renderZonePickerOption(zone, zone.id === current)),
  ].join("");
}

function renderZonePickerOption(zone, isSelected) {
  const color = zone.color ?? "rgba(119, 102, 85, 0.25)";
  return `
    <button
      type="button"
      class="zone-picker-item ${isSelected ? "is-selected" : ""}"
      role="option"
      aria-selected="${isSelected ? "true" : "false"}"
      data-zone-option="${zone.id}"
    >
      <span class="zone-picker-option">
        <span class="zone-swatch" style="background:${color}"></span>
        <span>${escapeHtml(zone.name)}</span>
      </span>
      <span class="zone-picker-check">${isSelected ? "Selected" : ""}</span>
    </button>
  `;
}

function setZonePickerOpen(elements, isOpen) {
  elements.sprinklerZoneMenu.hidden = !isOpen;
  elements.sprinklerZoneButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function renderZonesList(elements, state, analysis) {
  if (!state.zones.length) {
    elements.zonesList.innerHTML = '<div class="empty-card">No zones yet. Create one to group heads.</div>';
    return;
  }

  const metricsById = new Map((analysis?.zones ?? []).map((zone) => [zone.zoneId, zone]));
  elements.zonesList.innerHTML = state.zones.map((zone) => {
    const count = state.sprinklers.filter((sprinkler) => sprinkler.zoneId === zone.id).length;
    const metrics = metricsById.get(zone.id) ?? null;
    const isDimmed = state.ui.focusedZoneId && state.ui.focusedZoneId !== zone.id;
    const isFocused = state.ui.focusedZoneId === zone.id;
    const metaBits = [state.ui.activeZoneId === zone.id ? "Active zone" : `${count} head${count === 1 ? "" : "s"}`];
    if (metrics?.isOverLimit) {
      metaBits.push("Over flow limit");
    }
    if (zone.includeInPartsList === false) {
      metaBits.push("Excluded from parts");
    }
    if (zone.runtimeMinutes) {
      metaBits.push("Manual runtime");
    }
    return `
      <div class="zone-card ${isDimmed ? "is-dimmed" : ""}" data-zone-id="${zone.id}">
        <div class="zone-card-head">
          <label class="zone-chip">
            <span class="zone-swatch" style="background:${zone.color}"></span>
            <input data-zone-name="${zone.id}" type="text" value="${escapeHtml(zone.name)}">
          </label>
          <input data-zone-color="${zone.id}" type="color" value="${zone.color}">
        </div>
        <div class="zone-meta">${metaBits.join(" | ")}</div>
        ${renderZoneAnalysisBlock(zone, metrics)}
        <div class="zone-card-actions">
          <button type="button" data-zone-focus="${zone.id}">${isFocused ? "Focused" : "Focus"}</button>
          <button type="button" data-zone-active="${zone.id}">Set Active</button>
          <button type="button" data-zone-delete="${zone.id}" class="danger-button">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  elements.zonesList.querySelectorAll("[data-zone-name]").forEach((input) => {
    input.addEventListener("input", () => {
      storeSafeDispatch(elements, "UPDATE_ZONE", { id: input.dataset.zoneName, patch: { name: input.value || "Untitled Zone" } });
    });
  });
  elements.zonesList.querySelectorAll("[data-zone-color]").forEach((input) => {
    input.addEventListener("input", () => {
      storeSafeDispatch(elements, "UPDATE_ZONE", { id: input.dataset.zoneColor, patch: { color: input.value } });
    });
  });
  elements.zonesList.querySelectorAll("[data-zone-runtime]").forEach((input) => {
    input.addEventListener("change", () => {
      const raw = input.value.trim();
      const runtimeMinutes = raw ? Number(raw) : null;
      storeSafeDispatch(elements, "UPDATE_ZONE", {
        id: input.dataset.zoneRuntime,
        patch: { runtimeMinutes: Number.isFinite(runtimeMinutes) && runtimeMinutes > 0 ? runtimeMinutes : null },
      });
    });
  });
  elements.zonesList.querySelectorAll("[data-zone-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.zoneFocus;
      const focused = elements.zonesList.dataset.focusedZoneId;
      storeSafeDispatch(elements, "SET_FOCUSED_ZONE", { id: focused === id ? null : id });
    });
  });
  elements.zonesList.querySelectorAll("[data-zone-active]").forEach((button) => {
    button.addEventListener("click", () => {
      storeSafeDispatch(elements, "SET_ACTIVE_ZONE", { id: button.dataset.zoneActive });
    });
  });
  elements.zonesList.querySelectorAll("[data-zone-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.zoneDelete;
      if (window.confirm("Delete this zone? Heads in it will become unassigned.")) {
        storeSafeDispatch(elements, "DELETE_ZONE", { id });
      }
    });
  });
  elements.zonesList.dataset.focusedZoneId = state.ui.focusedZoneId || "";
}

function renderZoneAnalysisBlock(zone, metrics) {
  if (!metrics) {
    return `
      <div class="zone-analysis-block">
        <label class="field zone-runtime-field">
          <span>Runtime min</span>
          <input data-zone-runtime="${zone.id}" type="number" min="0.1" step="0.1" value="${zone.runtimeMinutes ?? ""}" placeholder="Auto">
        </label>
        <div class="zone-meta">Calibrate scale and add heads to generate catch-can stats.</div>
      </div>
    `;
  }

  const suggested = formatMaybeNumber(metrics.suggestedRuntimeMinutes, "min");
  const effective = formatMaybeNumber(metrics.effectiveRuntimeMinutes, "min");
  const avgRate = formatMaybeNumber(metrics.averageRateInHr, "in/hr");
  const avgDepth = formatMaybeNumber(metrics.averageDepthInches, "in");
  const wateredArea = formatMaybeNumber(metrics.wateredAreaSqFt, "sq ft", 0);
  const flow = formatMaybeNumber(metrics.totalFlowGpm, "GPM");
  const spread = formatMaybeNumber(metrics.precipSpreadInHr, "in/hr");
  const placeholder = Number.isFinite(metrics.suggestedRuntimeMinutes) ? metrics.suggestedRuntimeMinutes.toFixed(1) : "Auto";

  return `
    <div class="zone-analysis-block">
      <div class="zone-stats">
        <div><span>Suggested</span><strong>${suggested}</strong></div>
        <div><span>Effective</span><strong>${effective}</strong></div>
        <div><span>Avg rate</span><strong>${avgRate}</strong></div>
        <div><span>Avg depth</span><strong>${avgDepth}</strong></div>
      </div>
      <label class="field zone-runtime-field">
        <span>Runtime min</span>
        <input data-zone-runtime="${zone.id}" type="number" min="0.1" step="0.1" value="${zone.runtimeMinutes ?? ""}" placeholder="${placeholder}">
      </label>
      <div class="zone-meta">Flow ${flow} | PR spread ${spread} | Watered ${wateredArea}</div>
    </div>
  `;
}

function storeSafeDispatch(elements, type, payload) {
  elements.__store.dispatch({ type, payload });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatEditableNumber(value) {
  return Number.isFinite(value) ? String(Number(value.toFixed(2))) : "";
}

function formatMaybeNumber(value, unit, decimals = 2) {
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }
  return `${value.toFixed(decimals)} ${unit}`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;
}

function capitalize(value) {
  return typeof value === "string" && value.length
    ? `${value[0].toUpperCase()}${value.slice(1)}`
    : value;
}

function renderAnalysisLegend(elements, state, analysis) {
  const overlayMode = state.view.analysisOverlayMode ?? "application_rate";
  const targetDepth = analysis?.targetDepthInches ?? state.analysis.targetDepthInches ?? 1;
  const scaleMode = state.view.heatmapScaleMode ?? "zone";
  const scaleMaxInHr = Math.max(0.1, Number(state.view.heatmapScaleMaxInHr) || 3);

  if (overlayMode === "none") {
    elements.analysisLegend.innerHTML = legendScaleHtml("Analysis overlay is off.");
    elements.analysisSummary.textContent = "Turn on an analysis overlay to inspect application rate, zone runtime depth, or full-schedule balance.";
    return;
  }

  if (!analysis?.grid) {
    elements.analysisLegend.innerHTML = buildLegendBar("linear-gradient(90deg, rgba(34, 73, 110, 0.05), rgba(176, 74, 42, 0.35))", ["0", "target", "high"]);
    elements.analysisSummary.textContent = "Calibrate scale and place visible heads to generate analysis values.";
    return;
  }

  if (overlayMode === "application_rate") {
    renderApplicationRateLegend(elements, state, analysis, scaleMode, scaleMaxInHr);
    return;
  }

  if (overlayMode === "zone_catch_can") {
    const selectedZone = analysis.selectedZone;
    elements.analysisLegend.innerHTML = buildLegendBar(
      "linear-gradient(90deg, rgba(34, 73, 110, 0) 0%, rgba(67, 152, 177, 0.48) 24%, rgba(84, 166, 92, 0.62) 50%, rgba(217, 180, 64, 0.76) 76%, rgba(176, 74, 42, 0.86) 100%)",
      ["0.00", `${targetDepth.toFixed(2)} in`, `${(targetDepth * 2).toFixed(2)} in`],
    );
    if (!selectedZone) {
      elements.analysisSummary.textContent = "Select a zone to inspect its virtual catch-can depth at the current runtime.";
      return;
    }
    const overrideNote = selectedZone.runtimeMinutesOverride
      ? ` Manual override ${selectedZone.runtimeMinutesOverride.toFixed(1)} min is in effect.`
      : "";
    elements.analysisSummary.textContent = `${selectedZone.zoneName} averages ${selectedZone.averageDepthInches.toFixed(2)} in over ${selectedZone.wateredAreaSqFt.toFixed(0)} sq ft at ${selectedZone.effectiveRuntimeMinutes?.toFixed(1) ?? "--"} min. Positive cells range ${selectedZone.minPositiveDepthInches.toFixed(2)} to ${selectedZone.maxDepthInches.toFixed(2)} in. Suggested runtime is ${selectedZone.suggestedRuntimeMinutes?.toFixed(1) ?? "--"} min.${overrideNote}`;
    return;
  }

  if (overlayMode === "full_schedule_depth") {
    elements.analysisLegend.innerHTML = buildLegendBar(
      "linear-gradient(90deg, rgba(34, 73, 110, 0) 0%, rgba(67, 152, 177, 0.48) 24%, rgba(84, 166, 92, 0.62) 50%, rgba(217, 180, 64, 0.76) 76%, rgba(176, 74, 42, 0.86) 100%)",
      ["0.00", `${targetDepth.toFixed(2)} in`, `${(targetDepth * 2).toFixed(2)} in`],
    );
    const grid = analysis.grid.fullScheduleDepth;
    elements.analysisSummary.textContent = `The full schedule averages ${grid.averageInches.toFixed(2)} in over ${grid.wateredAreaSqFt.toFixed(0)} sq ft. Positive cells range ${grid.minPositiveInches.toFixed(2)} to ${grid.maxInches.toFixed(2)} in against a ${targetDepth.toFixed(2)} in target.`;
    return;
  }

  elements.analysisLegend.innerHTML = buildLegendBar(
    "linear-gradient(90deg, rgba(38, 95, 160, 0.84) 0%, rgba(84, 173, 219, 0.7) 28%, rgba(255, 250, 240, 0.18) 50%, rgba(230, 175, 71, 0.7) 72%, rgba(176, 74, 42, 0.88) 100%)",
    ["-50%", "On target", "+50%"],
  );
  const targetError = analysis.grid.targetError;
  const grid = analysis.grid.fullScheduleDepth;
  elements.analysisSummary.textContent = `Target error compares the full schedule against ${targetDepth.toFixed(2)} in. Wetted cells currently range from ${formatSignedPercent(targetError.minRatio)} to ${formatSignedPercent(targetError.maxRatio)}, with total depth spanning ${grid.minPositiveInches.toFixed(2)} to ${grid.maxInches.toFixed(2)} in.`;
}

function renderApplicationRateLegend(elements, state, analysis, scaleMode, scaleMaxInHr) {
  const applicationRate = analysis.grid.applicationRate;
  if (!(applicationRate.maxInHr > 0)) {
    elements.analysisLegend.innerHTML = buildLegendBar(
      "linear-gradient(90deg, rgba(24, 76, 107, 0) 0%, rgba(62, 156, 170, 0.52) 22%, rgba(72, 177, 106, 0.62) 48%, rgba(214, 171, 57, 0.72) 76%, rgba(176, 74, 42, 0.82) 100%)",
      ["0.00", "50%", "100%"],
    );
    elements.analysisSummary.textContent = "No positive application rate cells are available yet.";
    return;
  }

  const rateGradient = "linear-gradient(90deg, rgba(24, 76, 107, 0) 0%, rgba(62, 156, 170, 0.52) 22%, rgba(72, 177, 106, 0.62) 48%, rgba(214, 171, 57, 0.72) 76%, rgba(176, 74, 42, 0.82) 100%)";
  if (scaleMode === "fixed") {
    elements.analysisLegend.innerHTML = buildLegendBar(
      rateGradient,
      ["0.00", `${(scaleMaxInHr / 2).toFixed(2)}`, `${scaleMaxInHr.toFixed(2)} in/hr`],
    );
    const clippedNote = applicationRate.maxInHr > scaleMaxInHr
      ? ` Peak ${applicationRate.maxInHr.toFixed(2)} in/hr is clipping at the top of the scale.`
      : "";
    elements.analysisSummary.textContent = `Application rate averages ${applicationRate.averageInHr.toFixed(2)} in/hr over ${applicationRate.wateredAreaSqFt.toFixed(0)} sq ft. Positive cells range ${applicationRate.minPositiveInHr.toFixed(2)} to ${applicationRate.maxInHr.toFixed(2)} in/hr on a fixed 0-${scaleMaxInHr.toFixed(2)} in/hr scale.${clippedNote}`;
    return;
  }

  if (scaleMode === "project") {
    elements.analysisLegend.innerHTML = buildLegendBar(
      rateGradient,
      ["0.00", `${(applicationRate.maxInHr / 2).toFixed(2)}`, `${applicationRate.maxInHr.toFixed(2)} in/hr`],
    );
    elements.analysisSummary.textContent = `Application rate is auto-scaled to the plan peak ${applicationRate.maxInHr.toFixed(2)} in/hr, so cross-zone overlaps stay directly comparable.`;
    return;
  }

  elements.analysisLegend.innerHTML = buildLegendBar(rateGradient, ["0%", "50%", "100% of zone peak"]);
  const visibleZoneLayers = (analysis.grid.zoneRateLayers ?? []).filter((layer) => layer.maxInHr > 0);
  const focusedLayer = visibleZoneLayers.find((layer) => layer.zoneId === state.ui.focusedZoneId)
    ?? visibleZoneLayers.find((layer) => layer.zoneId === analysis.selectedZoneId)
    ?? (visibleZoneLayers.length === 1 ? visibleZoneLayers[0] : null);
  if (focusedLayer) {
    elements.analysisSummary.textContent = `${focusedLayer.zoneName} is auto-scaled to its own peak ${focusedLayer.maxInHr.toFixed(2)} in/hr. Positive cells in that zone range from ${focusedLayer.minPositiveInHr.toFixed(2)} to ${focusedLayer.maxInHr.toFixed(2)} in/hr.`;
    return;
  }
  const peakPreview = visibleZoneLayers
    .slice(0, 4)
    .map((layer) => `${layer.zoneName} ${layer.maxInHr.toFixed(2)}`)
    .join(", ");
  const extraCount = Math.max(0, visibleZoneLayers.length - 4);
  elements.analysisSummary.textContent = `Each zone auto-scales to its own peak while all zones stay visible. Current peaks: ${peakPreview}${extraCount ? `, +${extraCount} more` : ""}.`;
}

function renderPartsScreen(elements, state, analysis) {
  const parts = analysis?.parts ?? null;
  renderPartsZoneFilters(elements, parts);

  if (!parts) {
    elements.partsSummary.textContent = "Parts list will populate from the current recommendations.";
    elements.partsEmpty.hidden = false;
    elements.partsEmpty.textContent = "No recommendation snapshot is available yet.";
    elements.partsTable.innerHTML = "";
    return;
  }

  const includedZoneCount = parts.zones.filter((zone) => zone.included).length;
  const excludedZoneCount = parts.zones.length - includedZoneCount;
  elements.partsSummary.textContent = `${parts.includedHeadCount} included head${parts.includedHeadCount === 1 ? "" : "s"}, ${parts.lineItemCount} line item${parts.lineItemCount === 1 ? "" : "s"}, ${parts.totalBodyQuantity} bodies, ${parts.totalNozzleQuantity} nozzles. ${includedZoneCount} zone${includedZoneCount === 1 ? "" : "s"} included${excludedZoneCount ? `, ${excludedZoneCount} excluded` : ""}.`;

  const rows = parts.groupBy === "body_nozzle_split" ? parts.bodyRows.concat(parts.nozzleRows) : parts.rows;
  const hasRows = rows.length > 0;
  elements.partsEmpty.hidden = hasRows;
  elements.partsEmpty.textContent = hasRows ? "" : "No included recommended heads yet.";
  elements.partsTable.innerHTML = hasRows
    ? renderPartsTables(parts)
    : "";
}

function renderPartsZoneFilters(elements, parts) {
  if (!parts?.zones?.length) {
    elements.partsZoneFilters.innerHTML = '<div class="empty-card">Create zones to filter the purchasing scope.</div>';
    return;
  }

  elements.partsZoneFilters.innerHTML = parts.zones.map((zone) => `
    <label class="parts-zone-toggle">
      <input type="checkbox" data-parts-zone="${zone.id}" ${zone.included ? "checked" : ""}>
      <span class="parts-zone-copy">
        <strong>${escapeHtml(zone.name)}</strong>
        <span>${zone.headCount} recommended head${zone.headCount === 1 ? "" : "s"}</span>
      </span>
    </label>
  `).join("");

  elements.partsZoneFilters.querySelectorAll("[data-parts-zone]").forEach((input) => {
    input.addEventListener("change", () => {
      storeSafeDispatch(elements, "UPDATE_ZONE", {
        id: input.dataset.partsZone,
        patch: { includeInPartsList: input.checked },
      });
    });
  });
}

function renderPartsTables(parts) {
  if (parts.groupBy === "body_nozzle_split") {
    return [
      renderPartsTableSection("Bodies", parts.bodyRows, parts.showZoneUsage),
      renderPartsTableSection("Nozzles", parts.nozzleRows, parts.showZoneUsage),
    ].join("");
  }

  return renderPartsTable(parts.rows, parts.showZoneUsage);
}

function renderPartsTableSection(title, rows, showZoneUsage) {
  return `
    <div class="parts-table-section">
      <h3>${title}</h3>
      ${renderPartsTable(rows, showZoneUsage)}
    </div>
  `;
}

function renderPartsTable(rows, showZoneUsage) {
  const zoneHeader = showZoneUsage ? "<th>Zones</th>" : "";
  const zoneCells = showZoneUsage
    ? (row) => `<td>${escapeHtml(row.zonesLabel || "--")}</td>`
    : () => "";

  return `
    <table class="parts-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Item</th>
          <th>Qty</th>
          ${zoneHeader}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.category)}</td>
            <td>
              <div class="parts-item-label">${escapeHtml(row.itemLabel)}</div>
              ${row.notes ? `<div class="parts-item-notes">${escapeHtml(row.notes)}</div>` : ""}
            </td>
            <td>${row.quantity}</td>
            ${zoneCells(row)}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildLegendBar(gradient, labels) {
  return `
    <div class="analysis-legend-bar" style="background:${gradient}"></div>
    <div class="analysis-legend-scale">
      <span>${labels[0]}</span>
      <span>${labels[1]}</span>
      <span>${labels[2]}</span>
    </div>
  `;
}

function legendScaleHtml(message) {
  return `<div class="muted-line">${message}</div>`;
}

function renderSprinklerAnalysis(node, selected, analysis) {
  if (!selected) {
    node.hidden = true;
    node.innerHTML = "";
    return;
  }

  const recommendation = analysis?.recommendationsById?.[selected.id];
  const compatibility = analysis?.compatibilityById?.[selected.id] ?? null;
  if (!recommendation) {
    node.hidden = false;
    node.innerHTML = '<div class="analysis-note">No nozzle recommendation available for this sprinkler yet.</div>';
    return;
  }

  const zoneSummary = analysis?.zones?.find((zone) => zone.zoneId === recommendation.zoneId) ?? null;
  const detailRows = recommendation.coverageModel === "strip"
    ? [
      `<div><dt>Body</dt><dd>${escapeHtml(recommendation.body)}</dd></div>`,
      `<div><dt>Nozzle</dt><dd>${escapeHtml(recommendation.nozzle)}</dd></div>`,
      `<div><dt>Flow</dt><dd>${recommendation.flowGpm.toFixed(2)} GPM</dd></div>`,
      `<div><dt>Actual PR</dt><dd>${recommendation.actualPrecipInHr.toFixed(2)} in/hr</dd></div>`,
      `<div><dt>Strip type</dt><dd>${escapeHtml(capitalize(recommendation.stripMode))}</dd></div>`,
      `<div><dt>Footprint</dt><dd>${recommendation.desiredStripWidthFt.toFixed(1)} x ${recommendation.desiredStripLengthFt.toFixed(1)} ft on ${recommendation.selectedStripWidthFt.toFixed(1)} x ${recommendation.selectedStripLengthFt.toFixed(1)} ft nozzle</dd></div>`,
      `<div><dt>Rotation</dt><dd>${Math.round(recommendation.stripRotationDeg)} deg</dd></div>`,
    ]
    : [
      `<div><dt>Body</dt><dd>${escapeHtml(recommendation.body)}</dd></div>`,
      `<div><dt>Nozzle</dt><dd>${escapeHtml(recommendation.nozzle)}</dd></div>`,
      `<div><dt>Flow</dt><dd>${recommendation.flowGpm.toFixed(2)} GPM</dd></div>`,
      `<div><dt>Actual PR</dt><dd>${recommendation.actualPrecipInHr.toFixed(2)} in/hr</dd></div>`,
      `<div><dt>Throw</dt><dd>${recommendation.desiredRadiusFt.toFixed(2)} ft on ${recommendation.selectedRadiusFt.toFixed(0)} ft nozzle</dd></div>`,
      `<div><dt>Adjustment</dt><dd>${recommendation.radiusAdjustmentPct.toFixed(1)}%</dd></div>`,
    ];
  node.hidden = false;
  node.innerHTML = [
    '<div class="analysis-card">',
    '<div class="analysis-card-title">Recommended Head Logic</div>',
    '<dl class="analysis-grid">',
    ...detailRows,
    '</dl>',
    zoneSummary
      ? `<div class="analysis-note">${escapeHtml(zoneSummary.zoneName)} runtime ${zoneSummary.effectiveRuntimeMinutes?.toFixed(1) ?? "--"} min (suggested ${zoneSummary.suggestedRuntimeMinutes?.toFixed(1) ?? "--"} min), average zone rate ${zoneSummary.averageRateInHr.toFixed(2)} in/hr.</div>`
      : "",
    `<div class="analysis-note">${escapeHtml(recommendation.comment)}</div>`,
    `${selected.hidden ? '<div class="analysis-note">This sprinkler is hidden from the coverage and analysis overlays.</div>' : ""}`,
    "</div>",
    compatibility ? renderCompatibilityCard(compatibility) : "",
  ].join("");
}

function renderCompatibilityCard(compatibility) {
  const familyCounts = compatibility.familyCounts ?? { spray: 0, rotor: 0 };
  const statusClass = `analysis-status-${compatibility.status ?? "info"}`;
  const preferredFamilyLabel = compatibility.zonePreferredFamily === "mixed"
    ? "Mixed"
    : capitalize(compatibility.zonePreferredFamily ?? "mixed");
  const lines = [
    `<div class="analysis-card ${statusClass}">`,
    '<div class="analysis-card-title">Zone Family Compatibility</div>',
    `<div class="analysis-status-row"><span class="analysis-status-pill">${escapeHtml(capitalize(compatibility.status ?? "info"))}</span><span class="analysis-status-meta">Preferred family: ${escapeHtml(preferredFamilyLabel)} | ${familyCounts.spray} spray / ${familyCounts.rotor} rotor</span></div>`,
    `<div class="analysis-emphasis">${escapeHtml(compatibility.headline ?? "")}</div>`,
    `<div class="analysis-note">${escapeHtml(compatibility.detail ?? "")}</div>`,
  ];

  if (compatibility.preferredFitLabel || compatibility.alternateFitLabel) {
    lines.push('<dl class="analysis-grid">');
    if (compatibility.preferredFitLabel) {
      lines.push(`<div><dt>Preferred fit</dt><dd>${escapeHtml(compatibility.preferredFitLabel)}</dd></div>`);
    }
    if (compatibility.alternateFitLabel) {
      lines.push(`<div><dt>Alternate fit</dt><dd>${escapeHtml(compatibility.alternateFitLabel)}</dd></div>`);
    }
    lines.push("</dl>");
  }

  for (const suggestion of compatibility.suggestions ?? []) {
    lines.push(`<div class="analysis-note">Next: ${escapeHtml(suggestion)}</div>`);
  }

  lines.push("</div>");
  return lines.join("");
}
