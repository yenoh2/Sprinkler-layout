import { clamp } from "../geometry/arcs.js";
import { buildFittingSuggestions } from "../analysis/fittings-analysis.js";
import { getAllFittingOptions, getCommonFittingOptions, getFittingTypeMeta, isManualFittingPlacementSupported } from "../geometry/fittings.js";
import { PIPE_DIAMETER_OPTIONS, calculatePipeLengthUnits, formatPipeDiameterLabel } from "../geometry/pipes.js";
import { fitBackgroundToView } from "../geometry/scale.js";
import { cloneProjectSnapshot, findSelectedFitting, findSelectedPipeRun, findSelectedSprinkler, findSelectedValveBox, getNextZoneSeed, hasHydraulics, isProjectReady } from "../state/project-state.js";

export function bindPanels({ store, renderer, analyzer, interactions, io }) {
  const elements = bindElements();
  elements.__store = store;
  initializePipeControls(elements);
  initializeToolbarPanels(elements);
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
    toolbarPanels: [...document.querySelectorAll(".toolbar-panel > .panel")],
    toolButtons: [...document.querySelectorAll("[data-tool]")],
    placementPattern: document.getElementById("placement-pattern"),
    pipePlacementKind: document.getElementById("pipe-placement-kind"),
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
    designFlowLimitInput: document.getElementById("design-flow-limit-input"),
    zoneViewMode: document.getElementById("zone-view-mode"),
    activeZoneSelect: document.getElementById("active-zone-select"),
    createZoneButton: document.getElementById("create-zone-button"),
    clearZoneFocusButton: document.getElementById("clear-zone-focus-button"),
    zonesList: document.getElementById("zones-list"),
    toggleCoverage: document.getElementById("toggle-coverage"),
    togglePipe: document.getElementById("toggle-pipe"),
    toggleFittings: document.getElementById("toggle-fittings"),
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
    fittingsPanel: document.getElementById("fittings-panel"),
    fittingsPanelHandle: document.getElementById("fittings-panel-handle"),
    fittingsZoneSelect: document.getElementById("fittings-zone-select"),
    fittingsTabButtons: [...document.querySelectorAll("[data-fittings-tab]")],
    fittingsPanelContent: document.getElementById("fittings-panel-content"),
    selectionTitle: document.getElementById("selection-title"),
    selectionEmpty: document.getElementById("selection-empty"),
    selectionForm: document.getElementById("selection-form"),
    valveBoxForm: document.getElementById("valve-box-form"),
    pipeRunForm: document.getElementById("pipe-run-form"),
    fittingForm: document.getElementById("fitting-form"),
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
    valveBoxLabel: document.getElementById("valve-box-label"),
    valveBoxX: document.getElementById("valve-box-x"),
    valveBoxY: document.getElementById("valve-box-y"),
    valveBoxZones: document.getElementById("valve-box-zones"),
    deleteValveBoxButton: document.getElementById("delete-valve-box-button"),
    pipeLabel: document.getElementById("pipe-label"),
    pipeKind: document.getElementById("pipe-kind"),
    pipeZoneField: document.getElementById("pipe-zone-field"),
    pipeZone: document.getElementById("pipe-zone"),
    pipeDiameter: document.getElementById("pipe-diameter"),
    pipeLength: document.getElementById("pipe-length"),
    deletePipeButton: document.getElementById("delete-pipe-button"),
    fittingType: document.getElementById("fitting-type"),
    fittingZone: document.getElementById("fitting-zone"),
    fittingSize: document.getElementById("fitting-size"),
    fittingAnchor: document.getElementById("fitting-anchor"),
    deleteFittingButton: document.getElementById("delete-fitting-button"),
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

function initializeToolbarPanels(elements) {
  elements.toolbarPanels.forEach((panel, index) => {
    const heading = panel.querySelector("h2");
    if (!heading || panel.dataset.collapsibleReady === "true") {
      return;
    }

    const title = heading.textContent?.trim() || `Panel ${index + 1}`;
    const panelId = `toolbar-panel-${slugifyPanelTitle(title)}-${index + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-toggle";
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", panelId);
    button.innerHTML = `
      <span>${escapeHtml(title)}</span>
      <span class="panel-toggle-icon" aria-hidden="true"></span>
    `;

    heading.classList.add("panel-heading");
    heading.textContent = "";
    heading.appendChild(button);

    const body = document.createElement("div");
    body.id = panelId;
    body.className = "panel-body";

    const nodesToMove = [...panel.childNodes].filter((node) => node !== heading);
    nodesToMove.forEach((node) => body.appendChild(node));
    panel.appendChild(body);
    panel.classList.add("panel-collapsible", "is-open");
    panel.dataset.collapsibleReady = "true";

    button.addEventListener("click", () => {
      const isExpanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", isExpanded ? "false" : "true");
      body.hidden = isExpanded;
      panel.classList.toggle("is-open", !isExpanded);
      panel.classList.toggle("is-collapsed", isExpanded);
    });
  });
}

function initializePipeControls(elements) {
  const diameterOptions = ['<option value="">Unspecified</option>']
    .concat(PIPE_DIAMETER_OPTIONS.map((value) => `<option value="${value}">${formatPipeDiameterLabel(value)}</option>`));
  elements.pipeDiameter.innerHTML = diameterOptions.join("");
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

  bindFittingsPanelInteractions(elements, store, interactions);

  elements.placementPattern.addEventListener("change", () => {
    store.dispatch({ type: "SET_PLACEMENT_PATTERN", payload: { pattern: elements.placementPattern.value } });
  });
  elements.pipePlacementKind.addEventListener("change", () => {
    store.dispatch({ type: "SET_PIPE_PLACEMENT_KIND", payload: { kind: elements.pipePlacementKind.value } });
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
        designFlowLimitGpm: elements.designFlowLimitInput.value ? Number(elements.designFlowLimitInput.value) : null,
      },
    });
  };
  elements.lineSizeSelect.addEventListener("change", updateHydraulics);
  elements.pressureInput.addEventListener("input", updateHydraulics);
  elements.designFlowLimitInput.addEventListener("change", updateHydraulics);

  elements.zoneViewMode.addEventListener("change", () => {
    store.dispatch({ type: "SET_ZONE_VIEW_MODE", payload: { mode: elements.zoneViewMode.value } });
  });
  elements.activeZoneSelect.addEventListener("change", () => {
    store.dispatch({ type: "SET_ACTIVE_ZONE", payload: { id: elements.activeZoneSelect.value || null } });
  });
  elements.createZoneButton.addEventListener("click", () => {
    const seed = getNextZoneSeed(store.getState());
    const zoneId = crypto.randomUUID();
    elements.__pendingZoneNameFocusId = zoneId;
    store.dispatch({
      type: "CREATE_ZONE",
      payload: { id: zoneId, name: seed.name, color: seed.color },
    });
  });
  elements.clearZoneFocusButton.addEventListener("click", () => {
    store.dispatch({ type: "SET_FOCUSED_ZONE", payload: { id: null } });
  });

  elements.toggleCoverage.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showCoverage: elements.toggleCoverage.checked } });
  });
  elements.togglePipe.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showPipe: elements.togglePipe.checked } });
  });
  elements.toggleFittings.addEventListener("change", () => {
    store.dispatch({ type: "SET_VIEW", payload: { showFittings: elements.toggleFittings.checked } });
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
    element.addEventListener(eventName, () => updateSprinklerSelection(elements, store));
  });

  [elements.valveBoxLabel, elements.valveBoxX, elements.valveBoxY].forEach((element) => {
    element.addEventListener("input", () => updateValveBoxSelection(elements, store));
  });

  [elements.pipeLabel, elements.pipeKind, elements.pipeZone, elements.pipeDiameter].forEach((element) => {
    const eventName = element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, () => updatePipeRunSelection(elements, store));
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
    updateSprinklerSelection(elements, store);
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

  elements.deleteValveBoxButton.addEventListener("click", () => {
    const selected = findSelectedValveBox(store.getState());
    if (selected) {
      store.dispatch({ type: "DELETE_VALVE_BOX", payload: { id: selected.id } });
    }
  });

  elements.deletePipeButton.addEventListener("click", () => {
    const selected = findSelectedPipeRun(store.getState());
    if (selected) {
      store.dispatch({ type: "DELETE_PIPE_RUN", payload: { id: selected.id } });
    }
  });

  elements.deleteFittingButton.addEventListener("click", () => {
    const selected = findSelectedFitting(store.getState());
    if (selected) {
      store.dispatch({ type: "DELETE_FITTING", payload: { id: selected.id } });
    }
  });

  elements.undoButton.addEventListener("click", () => store.dispatch({ type: "UNDO" }));
  elements.redoButton.addEventListener("click", () => store.dispatch({ type: "REDO" }));
}

function bindFittingsPanelInteractions(elements, store, interactions) {
  let dragState = null;

  elements.fittingsPanelHandle?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const panelState = store.getState().ui.fittingsPanel;
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: panelState.x,
      startY: panelState.y,
    };
    event.preventDefault();
  });

  window.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    store.dispatch({
      type: "SET_FITTINGS_PANEL_STATE",
      payload: {
        x: dragState.startX + (event.clientX - dragState.startClientX),
        y: dragState.startY + (event.clientY - dragState.startClientY),
      },
      meta: { skipHistory: true },
    });
  });

  window.addEventListener("pointerup", (event) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      dragState = null;
    }
  });

  elements.fittingsZoneSelect?.addEventListener("change", () => {
    const value = elements.fittingsZoneSelect.value;
    if (value === "auto" || value === "main") {
      store.dispatch({
        type: "SET_FITTINGS_PANEL_STATE",
        payload: { zoneMode: value, zoneId: null },
        meta: { skipHistory: true },
      });
      return;
    }

    store.dispatch({
      type: "SET_FITTINGS_PANEL_STATE",
      payload: { zoneMode: "zone", zoneId: value || null },
      meta: { skipHistory: true },
    });
  });

  elements.fittingsTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      store.dispatch({
        type: "SET_FITTINGS_PANEL_STATE",
        payload: { tab: button.dataset.fittingsTab },
        meta: { skipHistory: true },
      });
    });
  });

  elements.fittingsPanelContent?.addEventListener("pointerdown", (event) => {
    const placeButton = event.target instanceof Element ? event.target.closest("[data-suggested-place]") : null;
    if (placeButton) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest("[data-fitting-template]") : null;
    const templateType = target?.getAttribute("data-fitting-template");
    const payload = parseFittingCardPayload(target?.getAttribute("data-fitting-payload"));
    const isTargetedSuggestion = Boolean(payload);
    if (!templateType || (!isManualFittingPlacementSupported(templateType) && !isTargetedSuggestion)) {
      return;
    }

    const panelState = store.getState().ui.fittingsPanel;
    const placementStarted = interactions.beginFittingPlacement(
      payload ?? {
        type: templateType,
        zoneMode: panelState.zoneMode,
        zoneId: panelState.zoneId,
      },
      event,
    );

    if (placementStarted) {
      event.preventDefault();
    }
  });

  elements.fittingsPanelContent?.addEventListener("click", (event) => {
    const placeButton = event.target instanceof Element ? event.target.closest("[data-suggested-place]") : null;
    if (!placeButton) {
      return;
    }

    const card = placeButton.closest("[data-fitting-template]");
    const payload = parseFittingCardPayload(card?.getAttribute("data-fitting-payload"));
    if (!payload) {
      return;
    }

    const placed = interactions.placeSuggestedFitting(payload);
    if (placed) {
      event.preventDefault();
      return;
    }

    alert("That suggestion is no longer valid to auto-place. Drag it onto the plan to place it manually.");
  });
}

function updateSprinklerSelection(elements, store) {
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

function updateValveBoxSelection(elements, store) {
  const selected = findSelectedValveBox(store.getState());
  if (!selected) {
    return;
  }
  store.dispatch({
    type: "UPDATE_VALVE_BOX",
    payload: {
      id: selected.id,
      patch: {
        label: elements.valveBoxLabel.value,
        x: Number(elements.valveBoxX.value),
        y: Number(elements.valveBoxY.value),
      },
    },
  });
}

function updatePipeRunSelection(elements, store) {
  const selected = findSelectedPipeRun(store.getState());
  if (!selected) {
    return;
  }
  store.dispatch({
    type: "UPDATE_PIPE_RUN",
    payload: {
      id: selected.id,
      patch: {
        label: elements.pipeLabel.value,
        kind: elements.pipeKind.value,
        zoneId: elements.pipeKind.value === "zone" ? (elements.pipeZone.value || null) : null,
        diameterInches: elements.pipeDiameter.value ? Number(elements.pipeDiameter.value) : null,
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
  elements.placementPattern.disabled = state.ui.activeTool !== "place";
  elements.pipePlacementKind.value = state.ui.pipePlacementKind ?? "main";
  elements.pipePlacementKind.disabled = state.ui.activeTool !== "pipe";
  elements.lineSizeSelect.value = state.hydraulics.lineSizeInches ? String(state.hydraulics.lineSizeInches) : "";
  elements.pressureInput.value = state.hydraulics.pressurePsi ?? "";
  elements.designFlowLimitInput.value = state.hydraulics.designFlowLimitGpm ?? "";
  elements.designFlowLimitInput.placeholder = `Uses default cap (${formatEditableNumber(analysis?.designFlowLimitGpm ?? 14)} GPM)`;
  elements.zoneViewMode.value = state.view.zoneViewMode;
  elements.toggleCoverage.checked = state.view.showCoverage;
  elements.togglePipe.checked = state.view.showPipe !== false;
  elements.toggleFittings.checked = state.view.showFittings !== false;
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

  const selectedSprinkler = findSelectedSprinkler(state);
  const selectedValveBox = findSelectedValveBox(state);
  const selectedPipeRun = findSelectedPipeRun(state);
  const selectedFitting = findSelectedFitting(state);
  populateZoneSelect(elements.activeZoneSelect, state.zones, state.ui.activeZoneId);
  populateAnalysisZoneSelect(elements.analysisZoneSelect, state.zones, analysis?.selectedZoneId ?? state.view.analysisZoneId ?? "");
  populateZoneSelect(elements.pipeZone, state.zones, selectedPipeRun?.zoneId ?? "");
  populateFittingsZoneSelect(elements.fittingsZoneSelect, state.zones, state.ui.fittingsPanel);
  elements.analysisZoneSelect.disabled = (state.view.analysisOverlayMode ?? "application_rate") !== "zone_catch_can" || !state.zones.length;
  populateSprinklerZonePicker(elements, state.zones, selectedSprinkler?.zoneId ?? "");
  if (!selectedSprinkler) {
    setZonePickerOpen(elements, false);
  }

  const panelState = state.ui.fittingsPanel;
  elements.fittingsPanel.hidden = isPartsScreen || state.ui.activeTool !== "fittings";
  elements.fittingsPanel.style.transform = `translate(${panelState.x}px, ${panelState.y}px)`;
  elements.fittingsTabButtons.forEach((button) => {
    const isActive = button.dataset.fittingsTab === panelState.tab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  renderFittingsPanel(elements, state);

  const nextZonesListRenderKey = buildZonesListRenderKey(state, analysis);
  if (elements.zonesList.dataset.renderKey !== nextZonesListRenderKey) {
    renderZonesList(elements, state, analysis);
    elements.zonesList.dataset.renderKey = nextZonesListRenderKey;
  }
  const selectionTitle = selectedSprinkler
    ? "Selected Sprinkler"
    : selectedValveBox
      ? "Selected Valve Box"
      : selectedPipeRun
        ? "Selected Pipe Run"
        : selectedFitting
          ? "Selected Fitting"
          : "Selected Item";
  elements.selectionTitle.textContent = selectionTitle;
  elements.selectionEmpty.hidden = Boolean(selectedSprinkler || selectedValveBox || selectedPipeRun || selectedFitting);
  elements.selectionForm.hidden = !selectedSprinkler;
  elements.valveBoxForm.hidden = !selectedValveBox;
  elements.pipeRunForm.hidden = !selectedPipeRun;
  elements.fittingForm.hidden = !selectedFitting;
  if (selectedSprinkler) {
    const coverageValue = selectedSprinkler.coverageModel === "strip"
      ? "strip"
      : selectedSprinkler.pattern === "arc"
        ? "arc"
        : "full";
    elements.sprinklerLabel.value = selectedSprinkler.label ?? "";
    elements.sprinklerX.value = formatEditableNumber(selectedSprinkler.x);
    elements.sprinklerY.value = formatEditableNumber(selectedSprinkler.y);
    elements.sprinklerCoverageModel.value = coverageValue;
    elements.sprinklerRadius.value = formatEditableNumber(selectedSprinkler.radius);
    elements.sprinklerPattern.value = selectedSprinkler.pattern;
    elements.sprinklerStart.value = String((selectedSprinkler.startDeg + selectedSprinkler.rotationDeg) % 360);
    elements.sprinklerSweep.value = String(selectedSprinkler.sweepDeg);
    elements.sprinklerStripMode.value = selectedSprinkler.stripMode ?? "end";
    elements.sprinklerStripMirror.value = selectedSprinkler.stripMirror ?? "right";
    elements.sprinklerStripLength.value = formatEditableNumber(selectedSprinkler.stripLength ?? 15);
    elements.sprinklerStripWidth.value = formatEditableNumber(selectedSprinkler.stripWidth ?? 4);
    elements.sprinklerStripRotation.value = String(Math.round(selectedSprinkler.stripRotationDeg ?? 0));
    elements.sprinklerZone.value = selectedSprinkler.zoneId ?? "";
    elements.sprinklerHidden.checked = selectedSprinkler.hidden;

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

  if (selectedValveBox) {
    elements.valveBoxLabel.value = selectedValveBox.label ?? "";
    elements.valveBoxX.value = formatEditableNumber(selectedValveBox.x);
    elements.valveBoxY.value = formatEditableNumber(selectedValveBox.y);
    renderValveBoxZones(elements, state, selectedValveBox);
  } else {
    elements.valveBoxZones.innerHTML = "";
  }

  if (selectedPipeRun) {
    elements.pipeLabel.value = selectedPipeRun.label ?? "";
    elements.pipeKind.value = selectedPipeRun.kind ?? "main";
    elements.pipeZone.value = selectedPipeRun.zoneId ?? "";
    elements.pipeZoneField.hidden = false;
    elements.pipeZone.disabled = selectedPipeRun.kind !== "zone";
    elements.pipeDiameter.value = selectedPipeRun.diameterInches ? String(selectedPipeRun.diameterInches) : "";
    elements.pipeLength.value = formatPipeLengthValue(state, selectedPipeRun.points);
  } else {
    elements.pipeZoneField.hidden = false;
    elements.pipeZone.disabled = false;
    elements.pipeLength.value = "";
  }

  if (selectedFitting) {
    const fittingType = getFittingTypeMeta(selectedFitting.type);
    const zoneLabel = resolveFittingZoneLabel(selectedFitting, state.zones);
    elements.fittingType.value = fittingType.label;
    elements.fittingZone.value = zoneLabel;
    elements.fittingSize.value = selectedFitting.sizeSpec ?? "Auto";
    elements.fittingAnchor.value = formatFittingAnchor(selectedFitting.anchor);
  }

  renderSprinklerAnalysis(elements.sprinklerAnalysis, selectedSprinkler, analysis);
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
    ["Valve boxes", String(summary.valveBoxCount ?? 0)],
    ["Pipe runs", String(summary.pipeRunCount ?? 0)],
    ["Fittings", String(state.fittings?.length ?? 0)],
    ["Pipe length", state.scale.pixelsPerUnit ? `${summary.totalPipeLength.toFixed(1)} ${state.scale.units}` : "--"],
    ["Mean size", summary.meanRadius ? `${summary.meanRadius.toFixed(1)} ${state.scale.units}` : "--"],
    ["Peak rate", analysis?.summary.applicationRateMaxInHr ? `${analysis.summary.applicationRateMaxInHr.toFixed(2)} in/hr` : "--"],
    ["Avg rate", analysis?.summary.applicationRateAverageInHr ? `${analysis.summary.applicationRateAverageInHr.toFixed(2)} in/hr` : "--"],
    ["Target depth", `${(analysis?.targetDepthInches ?? state.analysis.targetDepthInches ?? 1).toFixed(2)} in`],
    ["Shared depth areas", String(analysis?.summary.sharedRuntimeAreaCount ?? 0)],
    ["Avg schedule depth", analysis?.summary.fullScheduleAverageDepthInches ? `${analysis.summary.fullScheduleAverageDepthInches.toFixed(2)} in` : "--"],
    ["Peak schedule depth", analysis?.summary.fullScheduleMaxDepthInches ? `${analysis.summary.fullScheduleMaxDepthInches.toFixed(2)} in` : "--"],
    ["Over-limit zones", String(analysis?.summary.overLimitZones ?? 0)],
    ["Line size", state.hydraulics.lineSizeInches ? `${state.hydraulics.lineSizeInches} in` : "--"],
    ["Pressure", state.hydraulics.pressurePsi ? `${state.hydraulics.pressurePsi} psi` : "--"],
    ["Flow cap", analysis?.designFlowLimitGpm ? `${analysis.designFlowLimitGpm.toFixed(2)} GPM` : "--"],
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

function populateFittingsZoneSelect(select, zones, panelState) {
  if (!select) {
    return;
  }

  const options = [
    '<option value="auto">Auto</option>',
    '<option value="main">Main</option>',
    ...zones.map((zone) => `<option value="${zone.id}">${zone.name}</option>`),
  ];
  select.innerHTML = options.join("");

  if (panelState?.zoneMode === "zone" && zones.some((zone) => zone.id === panelState.zoneId)) {
    select.value = panelState.zoneId;
    return;
  }

  select.value = panelState?.zoneMode === "main" ? "main" : "auto";
}

function renderFittingsPanel(elements, state) {
  const tab = state.ui.fittingsPanel?.tab ?? "suggested";
  const suggestions = buildFittingSuggestions(state);

  if (tab === "suggested") {
    elements.fittingsPanelContent.innerHTML = renderSuggestedFittingsPanel(state, suggestions);
    return;
  }

  const options = tab === "common" ? getCommonFittingOptions() : getAllFittingOptions();
  elements.fittingsPanelContent.innerHTML = `
    <div class="fittings-panel-group">
      <h4>${tab === "common" ? "Ready to Place" : "Catalog"}</h4>
      ${options.map((option) => renderFittingCard(option)).join("")}
    </div>
  `;
}

function renderSuggestedFittingsPanel(state, suggestions) {
  const panelState = state.ui.fittingsPanel ?? { zoneMode: "auto", zoneId: null };
  const headTakeoffSuggestions = filterHeadTakeoffSuggestionsForPanel(suggestions?.headTakeoffs ?? [], panelState);
  const pipeConnectionSuggestions = filterPipeConnectionSuggestionsForPanel(suggestions?.pipeConnections ?? [], panelState);

  if (!state.sprinklers?.length && !state.pipeRuns?.length) {
    return `
      <div class="fittings-panel-group">
        <h4>Suggestions</h4>
        <div class="empty-card">
          Place sprinkler heads and pipe runs first, then this tab will suggest missing fittings automatically.
        </div>
      </div>
    `;
  }

  return `
    ${renderSuggestedGroup(
      "Heads",
      headTakeoffSuggestions,
      buildHeadSuggestionEmptyMessage(state, panelState),
    )}
    ${renderSuggestedGroup(
      "Pipe connections",
      pipeConnectionSuggestions,
      buildPipeSuggestionEmptyMessage(state, panelState),
    )}
  `;
}

function renderSuggestedGroup(title, suggestions, emptyMessage) {
  return `
    <div class="fittings-panel-group">
      <h4>${title}</h4>
      ${suggestions.length
        ? suggestions.map((suggestion) => renderSuggestedFittingCard(suggestion)).join("")
        : `<div class="empty-card">${emptyMessage}</div>`}
    </div>
  `;
}

function renderFittingCard(option) {
  const isSupported = isManualFittingPlacementSupported(option.value);
  return `
    <article class="fitting-card ${isSupported ? "is-draggable" : "is-disabled"}" data-fitting-template="${option.value}">
      <strong>${escapeHtml(option.label)}</strong>
      <p>${escapeHtml(option.description)}</p>
      <p>${isSupported ? "Drag onto the plan to place it." : "Placement wiring comes in a later slice."}</p>
    </article>
  `;
}

function renderSuggestedFittingCard(suggestion) {
  const payload = buildSuggestedPlacementPayload(suggestion);
  const payloadAttribute = escapeHtml(JSON.stringify(payload));
  const needsZonePipeSizing = !suggestion.sizeSpec || suggestion.sizeSpec.startsWith("Zone line");
  const supportText = resolveSuggestedSupportText(suggestion, needsZonePipeSizing);
  const subtitle = buildSuggestedSubtitle(suggestion);

  return `
    <article
      class="fitting-card is-draggable ${needsZonePipeSizing ? "is-muted" : ""}"
      data-fitting-template="${escapeHtml(suggestion.type)}"
      data-fitting-payload="${payloadAttribute}"
    >
      <strong>${escapeHtml(suggestion.referenceLabel || suggestion.sprinklerLabel || suggestion.label)}</strong>
      <p>${escapeHtml(subtitle)}</p>
      <p>${escapeHtml(supportText)}</p>
      <div class="fitting-card-actions">
        <button type="button" data-suggested-place>Place</button>
      </div>
    </article>
  `;
}

function filterHeadTakeoffSuggestionsForPanel(suggestions, panelState) {
  if (panelState?.zoneMode === "main") {
    return [];
  }
  if (panelState?.zoneMode === "zone" && panelState.zoneId) {
    return suggestions.filter((suggestion) => suggestion.zoneId === panelState.zoneId);
  }
  return suggestions;
}

function filterPipeConnectionSuggestionsForPanel(suggestions, panelState) {
  if (panelState?.zoneMode === "main") {
    return suggestions.filter((suggestion) => !suggestion.zoneId);
  }
  if (panelState?.zoneMode === "zone" && panelState.zoneId) {
    return suggestions.filter((suggestion) => suggestion.zoneId === panelState.zoneId);
  }
  return suggestions;
}

function buildHeadSuggestionEmptyMessage(state, panelState) {
  if (!state.sprinklers?.length) {
    return "Place sprinkler heads first, then this group will suggest missing head takeoffs.";
  }
  if (panelState?.zoneMode === "main") {
    return "Head takeoffs are tied to zone lines, so there are no main-line head suggestions in this view.";
  }
  if (panelState?.zoneMode === "zone" && panelState.zoneId) {
    return "Every sprinkler in this zone already has a head takeoff placed.";
  }
  return "Every sprinkler head on the plan already has a head takeoff placed.";
}

function buildPipeSuggestionEmptyMessage(state, panelState) {
  if ((state.pipeRuns?.length ?? 0) < 2) {
    return "Draw more connected pipe runs to surface tee and reducer suggestions here.";
  }
  if (panelState?.zoneMode === "main") {
    return "No unresolved main-line pipe connections are suggested right now.";
  }
  if (panelState?.zoneMode === "zone" && panelState.zoneId) {
    return "No unresolved pipe-connection fittings are suggested in this zone right now.";
  }
  return "No unresolved pipe-connection fittings are suggested on the current plan.";
}

function buildSuggestedPlacementPayload(suggestion) {
  return {
    type: suggestion.type,
    zoneMode: suggestion.zoneId ? "zone" : "auto",
    zoneId: suggestion.zoneId ?? null,
    sprinklerId: suggestion.sprinklerId ?? null,
    targetPoint: { x: suggestion.x, y: suggestion.y },
    targetAnchor: suggestion.anchor ?? null,
    sizeSpec: suggestion.sizeSpec ?? null,
    label: suggestion.label ?? "",
  };
}

function buildSuggestedSubtitle(suggestion) {
  const parts = [suggestion.zoneName || "Main / auto"];
  if (suggestion.sizeSpec) {
    parts.push(suggestion.sizeSpec);
  }
  if (suggestion.reason) {
    parts.push(suggestion.reason);
  }
  return parts.join(" | ");
}

function resolveSuggestedSupportText(suggestion, needsZonePipeSizing) {
  if (suggestion.type === "head_takeoff") {
    return needsZonePipeSizing
      ? "Drag onto this sprinkler head to place it. The size will stay generic until a nearby zone pipe has a diameter."
      : `Drag onto this sprinkler head to place ${suggestion.sizeSpec}.`;
  }

  return `Drag onto this pipe connection to place ${suggestion.sizeSpec || getFittingTypeMeta(suggestion.type).label}.`;
}

function parseFittingCardPayload(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
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

function resolveFittingZoneLabel(fitting, zones) {
  if (!fitting?.zoneId) {
    return "Main / auto";
  }
  return zones.find((zone) => zone.id === fitting.zoneId)?.name ?? "Unassigned";
}

function formatFittingAnchor(anchor) {
  if (!anchor?.kind) {
    return "Unanchored";
  }

  if (anchor.kind === "sprinkler") {
    return `Sprinkler ${anchor.sprinklerId ?? "--"}`;
  }
  if (anchor.kind === "pipe_vertex") {
    const suffix = Number.isInteger(anchor.vertexIndex) ? ` vertex ${anchor.vertexIndex + 1}` : "";
    return `Pipe ${anchor.pipeRunId ?? "--"}${suffix}`;
  }
  if (anchor.kind === "pipe_segment") {
    const suffix = Number.isInteger(anchor.segmentIndex) ? ` segment ${anchor.segmentIndex + 1}` : "";
    return `Pipe ${anchor.pipeRunId ?? "--"}${suffix}`;
  }
  if (anchor.kind === "valve_box") {
    return `Valve box ${anchor.valveBoxId ?? "--"}`;
  }

  return capitalize(anchor.kind);
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

function renderValveBoxZones(elements, state, selectedValveBox) {
  if (!state.zones.length) {
    elements.valveBoxZones.innerHTML = '<div class="empty-card">Create zones to assign this box.</div>';
    return;
  }

  elements.valveBoxZones.innerHTML = state.zones.map((zone) => `
    <label class="checkbox-row valve-box-zone-option">
      <input
        type="checkbox"
        data-valve-box-zone="${zone.id}"
        ${zone.valveBoxId === selectedValveBox.id ? "checked" : ""}
      >
      <span class="zone-picker-option">
        <span class="zone-swatch" style="background:${zone.color}"></span>
        <span>${escapeHtml(zone.name)}</span>
      </span>
    </label>
  `).join("");

  elements.valveBoxZones.querySelectorAll("[data-valve-box-zone]").forEach((input) => {
    input.addEventListener("change", () => {
      storeSafeDispatch(elements, "UPDATE_ZONE", {
        id: input.dataset.valveBoxZone,
        patch: { valveBoxId: input.checked ? selectedValveBox.id : null },
      });
    });
  });
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
  const valveBoxesById = new Map((state.valveBoxes ?? []).map((valveBox) => [valveBox.id, valveBox]));
  const runtimeGroupCounts = collectRuntimeGroupCounts(state.zones);
  const runtimeGroupOptions = buildRuntimeGroupOptionsList(state.zones);
  const targetDepth = analysis?.targetDepthInches ?? state.analysis.targetDepthInches ?? 1;
  elements.zonesList.innerHTML = [
    runtimeGroupOptions,
    ...state.zones.map((zone) => {
      const count = state.sprinklers.filter((sprinkler) => sprinkler.zoneId === zone.id).length;
      const metrics = metricsById.get(zone.id) ?? null;
      const isDimmed = state.ui.focusedZoneId && state.ui.focusedZoneId !== zone.id;
      const isFocused = state.ui.focusedZoneId === zone.id;
      const isExpanded = isZonePanelExpanded(state, zone.id);
      const panelBodyId = `zone-panel-body-${zone.id}`;
      const panelButtonId = `zone-panel-button-${zone.id}`;
      const runtimeGroupCount = zone.runtimeGroupName
        ? (runtimeGroupCounts.get(buildRuntimeGroupKey(zone.runtimeGroupName)) ?? 1)
        : 0;
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
      if (zone.runtimeGroupName) {
        metaBits.push(runtimeGroupCount > 1 ? `Shared area ${zone.runtimeGroupName}` : `Area ${zone.runtimeGroupName}`);
      }
      const valveBox = zone.valveBoxId ? valveBoxesById.get(zone.valveBoxId) ?? null : null;
      if (valveBox) {
        metaBits.push(`Valve box ${valveBox.label}`);
      } else if (state.valveBoxes.length) {
        metaBits.push("No valve box");
      }
      return `
        <div class="zone-card ${isDimmed ? "is-dimmed" : ""} ${isExpanded ? "is-expanded" : "is-collapsed"}" data-zone-id="${zone.id}">
          <h3 class="zone-accordion-heading">
            <button
              id="${panelButtonId}"
              type="button"
              class="zone-accordion-trigger"
              data-zone-toggle="${zone.id}"
              aria-expanded="${isExpanded ? "true" : "false"}"
              aria-controls="${panelBodyId}"
            >
              <span class="zone-accordion-title-row">
                <span class="zone-chip">
                  <span class="zone-swatch" style="background:${zone.color}"></span>
                  <span>${escapeHtml(zone.name)}</span>
                </span>
                <span class="zone-accordion-chevron" aria-hidden="true"></span>
              </span>
              <span class="zone-accordion-meta">${escapeHtml(metaBits.join(" | "))}</span>
            </button>
          </h3>
          <div
            id="${panelBodyId}"
            class="zone-card-body"
            role="region"
            aria-labelledby="${panelButtonId}"
            ${isExpanded ? "" : "hidden"}
          >
            ${renderZoneIdentityFields(zone)}
            ${renderZoneAnalysisBlock(zone, metrics, targetDepth, runtimeGroupCount)}
            <div class="zone-card-actions">
              <button type="button" data-zone-focus="${zone.id}">${isFocused ? "Focused" : "Focus"}</button>
              <button type="button" data-zone-active="${zone.id}">Set Active</button>
              <button type="button" data-zone-delete="${zone.id}" class="danger-button">Delete</button>
            </div>
          </div>
        </div>
      `;
    }),
  ].join("");

  elements.zonesList.querySelectorAll("[data-zone-name]").forEach((input) => {
    const commitZoneName = () => {
      storeSafeDispatch(elements, "UPDATE_ZONE", { id: input.dataset.zoneName, patch: { name: input.value || "Untitled Zone" } });
    };
    input.addEventListener("change", commitZoneName);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });
  elements.zonesList.querySelectorAll("[data-zone-color]").forEach((input) => {
    input.addEventListener("input", () => {
      storeSafeDispatch(elements, "UPDATE_ZONE", { id: input.dataset.zoneColor, patch: { color: input.value } });
    });
  });
  elements.zonesList.querySelectorAll("[data-zone-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      storeSafeDispatch(elements, "SET_ZONE_PANEL_EXPANDED", {
        id: button.dataset.zoneToggle,
        expanded: button.getAttribute("aria-expanded") !== "true",
      });
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
  elements.zonesList.querySelectorAll("[data-zone-runtime-group]").forEach((input) => {
    input.addEventListener("change", () => {
      storeSafeDispatch(elements, "UPDATE_ZONE", {
        id: input.dataset.zoneRuntimeGroup,
        patch: { runtimeGroupName: input.value || null },
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
  focusPendingZoneName(elements);
}

function renderZoneAnalysisBlock(zone, metrics, targetDepth, runtimeGroupCount) {
  const runtimeFieldHtml = renderZoneSchedulingFields(
    zone,
    Number.isFinite(metrics?.suggestedRuntimeMinutes) ? metrics.suggestedRuntimeMinutes.toFixed(1) : "Auto",
  );
  const schedulingNote = buildZoneSchedulingNote(zone, metrics, targetDepth, runtimeGroupCount);

  if (!metrics) {
    return `
      <div class="zone-analysis-block">
        ${runtimeFieldHtml}
        <div class="zone-meta">${schedulingNote}</div>
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

  return `
    <div class="zone-analysis-block">
      <div class="zone-stats">
        <div><span>Suggested</span><strong>${suggested}</strong></div>
        <div><span>Effective</span><strong>${effective}</strong></div>
        <div><span>Avg rate</span><strong>${avgRate}</strong></div>
        <div><span>Zone depth</span><strong>${avgDepth}</strong></div>
      </div>
      ${runtimeFieldHtml}
      <div class="zone-meta">${schedulingNote}</div>
      <div class="zone-meta">Flow ${flow} | PR spread ${spread} | Watered ${wateredArea}</div>
    </div>
  `;
}

function renderZoneIdentityFields(zone) {
  return `
    <div class="zone-identity-fields">
      <label class="field zone-name-field">
        <span>Zone name</span>
        <input data-zone-name="${zone.id}" type="text" value="${escapeHtml(zone.name)}">
      </label>
      <label class="field zone-color-field">
        <span>Color</span>
        <input data-zone-color="${zone.id}" type="color" value="${zone.color}">
      </label>
    </div>
  `;
}

function renderZoneSchedulingFields(zone, runtimePlaceholder) {
  return `
    <div class="zone-fields-grid">
      <label class="field zone-runtime-field">
        <span>Runtime min</span>
        <input data-zone-runtime="${zone.id}" type="number" min="0.1" step="0.1" value="${zone.runtimeMinutes ?? ""}" placeholder="${runtimePlaceholder}">
      </label>
      <label class="field zone-runtime-group-field">
        <span>Auto depth area</span>
        <input
          data-zone-runtime-group="${zone.id}"
          type="text"
          value="${escapeHtml(zone.runtimeGroupName ?? "")}"
          list="zone-runtime-group-options"
          placeholder="Independent"
        >
      </label>
    </div>
  `;
}

function buildZoneSchedulingNote(zone, metrics, targetDepth, runtimeGroupCount) {
  const targetDepthText = `${targetDepth.toFixed(2)} in`;
  if (!zone.runtimeGroupName) {
    return `Leave Auto depth area blank to size this zone on its own, or reuse one area name on split zones to share a single ${targetDepthText} target.`;
  }

  const displayName = escapeHtml(zone.runtimeGroupName);
  if (runtimeGroupCount < 2) {
    return `${displayName} is only assigned to this zone right now. Add the same area name to another split zone to share one ${targetDepthText} target.`;
  }

  const combinedDepthText = Number.isFinite(metrics?.runtimeGroupAverageDepthInches)
    ? ` The combined area is averaging ${metrics.runtimeGroupAverageDepthInches.toFixed(2)} in.`
    : "";
  if (zone.runtimeMinutes) {
    return `Shared area ${displayName} balances ${runtimeGroupCount} zones toward one ${targetDepthText} target. This zone is manually overridden, so the remaining auto zones adjust around it.${combinedDepthText}`;
  }

  const scaleText = Number.isFinite(metrics?.runtimeGroupScaleFactor) && metrics.runtimeGroupScaleFactor < 0.995
    ? ` Auto runtimes are scaled to ${formatPercentWhole(metrics.runtimeGroupScaleFactor)} of independent time.`
    : " Auto runtimes are staying at full zone time.";
  return `Shared area ${displayName} balances ${runtimeGroupCount} zones toward one ${targetDepthText} target.${scaleText}${combinedDepthText}`;
}

function buildRuntimeGroupOptionsList(zones) {
  const names = collectRuntimeGroupNames(zones);
  if (!names.length) {
    return "";
  }
  return `
    <datalist id="zone-runtime-group-options">
      ${names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}
    </datalist>
  `;
}

function collectRuntimeGroupCounts(zones) {
  const counts = new Map();
  for (const zone of zones ?? []) {
    if (!zone?.runtimeGroupName) {
      continue;
    }
    const key = buildRuntimeGroupKey(zone.runtimeGroupName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function collectRuntimeGroupNames(zones) {
  const namesByKey = new Map();
  for (const zone of zones ?? []) {
    if (!zone?.runtimeGroupName) {
      continue;
    }
    const key = buildRuntimeGroupKey(zone.runtimeGroupName);
    if (!namesByKey.has(key)) {
      namesByKey.set(key, zone.runtimeGroupName);
    }
  }
  return [...namesByKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function buildRuntimeGroupKey(name) {
  return name ? String(name).trim().toLocaleLowerCase() : "";
}

function isZonePanelExpanded(state, zoneId) {
  return (state.ui?.expandedZoneIds ?? []).includes(zoneId);
}

function focusPendingZoneName(elements) {
  const zoneId = elements.__pendingZoneNameFocusId;
  if (!zoneId) {
    return;
  }

  const input = elements.zonesList.querySelector(`[data-zone-name="${zoneId}"]`);
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  elements.__pendingZoneNameFocusId = null;
  window.requestAnimationFrame(() => {
    input.focus({ preventScroll: false });
    input.select();
  });
}

function slugifyPanelTitle(title) {
  return String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "panel";
}

function buildZonesListRenderKey(state, analysis) {
  const headCountsByZoneId = new Map();
  for (const sprinkler of state.sprinklers ?? []) {
    const zoneId = sprinkler.zoneId ?? "";
    headCountsByZoneId.set(zoneId, (headCountsByZoneId.get(zoneId) ?? 0) + 1);
  }

  const analysisZonesById = new Map((analysis?.zones ?? []).map((zone) => [zone.zoneId, zone]));
  return JSON.stringify({
    activeZoneId: state.ui.activeZoneId ?? null,
    focusedZoneId: state.ui.focusedZoneId ?? null,
    expandedZoneIds: state.ui.expandedZoneIds ?? [],
    targetDepthInches: analysis?.targetDepthInches ?? state.analysis?.targetDepthInches ?? 1,
    zones: (state.zones ?? []).map((zone) => {
      const metrics = analysisZonesById.get(zone.id) ?? null;
      return {
        id: zone.id,
        name: zone.name,
        color: zone.color,
        runtimeMinutes: zone.runtimeMinutes ?? null,
        runtimeGroupName: zone.runtimeGroupName ?? null,
        includeInPartsList: zone.includeInPartsList !== false,
        valveBoxId: zone.valveBoxId ?? null,
        valveBoxLabel: zone.valveBoxId ? (state.valveBoxes ?? []).find((valveBox) => valveBox.id === zone.valveBoxId)?.label ?? null : null,
        headCount: headCountsByZoneId.get(zone.id) ?? 0,
        metrics: metrics ? {
          totalFlowGpm: metrics.totalFlowGpm,
          precipSpreadInHr: metrics.precipSpreadInHr,
          isOverLimit: metrics.isOverLimit,
          suggestedRuntimeMinutes: metrics.suggestedRuntimeMinutes,
          effectiveRuntimeMinutes: metrics.effectiveRuntimeMinutes,
          averageRateInHr: metrics.averageRateInHr,
          averageDepthInches: metrics.averageDepthInches,
          wateredAreaSqFt: metrics.wateredAreaSqFt,
          runtimeGroupZoneCount: metrics.runtimeGroupZoneCount,
          runtimeGroupScaleFactor: metrics.runtimeGroupScaleFactor,
          runtimeGroupAverageDepthInches: metrics.runtimeGroupAverageDepthInches,
        } : null,
      };
    }),
  });
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

function formatPipeLengthValue(state, points) {
  if (!state.scale.pixelsPerUnit) {
    return "--";
  }
  const length = calculatePipeLengthUnits(points, state.scale.pixelsPerUnit);
  return `${length.toFixed(2)} ${state.scale.units}`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;
}

function formatPercentWhole(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function buildSharedRuntimeAnalysisNote(zoneSummary, targetDepth) {
  if (!(zoneSummary?.runtimeGroupName && zoneSummary.runtimeGroupZoneCount > 1)) {
    return "";
  }

  const groupName = escapeHtml(zoneSummary.runtimeGroupName);
  const scaleText = Number.isFinite(zoneSummary.runtimeGroupScaleFactor) && zoneSummary.runtimeGroupScaleFactor < 0.995
    ? ` Auto runtimes are scaled to ${formatPercentWhole(zoneSummary.runtimeGroupScaleFactor)} of independent time.`
    : "";
  const averageText = Number.isFinite(zoneSummary.runtimeGroupAverageDepthInches)
    ? ` Shared area ${groupName} averages ${zoneSummary.runtimeGroupAverageDepthInches.toFixed(2)} in across ${zoneSummary.runtimeGroupZoneCount} zones toward the ${targetDepth.toFixed(2)} in target.`
    : ` Shared area ${groupName} balances ${zoneSummary.runtimeGroupZoneCount} zones toward the ${targetDepth.toFixed(2)} in target.`;
  return `${averageText}${scaleText}`;
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
    const sharedAreaNote = buildSharedRuntimeAnalysisNote(selectedZone, targetDepth);
    const lead = selectedZone.runtimeGroupName && selectedZone.runtimeGroupZoneCount > 1
      ? `${selectedZone.zoneName} contributes ${selectedZone.averageDepthInches.toFixed(2)} in over ${selectedZone.wateredAreaSqFt.toFixed(0)} sq ft at ${selectedZone.effectiveRuntimeMinutes?.toFixed(1) ?? "--"} min.`
      : `${selectedZone.zoneName} averages ${selectedZone.averageDepthInches.toFixed(2)} in over ${selectedZone.wateredAreaSqFt.toFixed(0)} sq ft at ${selectedZone.effectiveRuntimeMinutes?.toFixed(1) ?? "--"} min.`;
    elements.analysisSummary.textContent = `${lead} Positive cells range ${selectedZone.minPositiveDepthInches.toFixed(2)} to ${selectedZone.maxDepthInches.toFixed(2)} in. Suggested runtime is ${selectedZone.suggestedRuntimeMinutes?.toFixed(1) ?? "--"} min.${overrideNote}${sharedAreaNote}`;
    return;
  }

  if (overlayMode === "full_schedule_depth") {
    elements.analysisLegend.innerHTML = buildLegendBar(
      "linear-gradient(90deg, rgba(34, 73, 110, 0) 0%, rgba(67, 152, 177, 0.48) 24%, rgba(84, 166, 92, 0.62) 50%, rgba(217, 180, 64, 0.76) 76%, rgba(176, 74, 42, 0.86) 100%)",
      ["0.00", `${targetDepth.toFixed(2)} in`, `${(targetDepth * 2).toFixed(2)} in`],
    );
    const grid = analysis.grid.fullScheduleDepth;
    const sharedAreaSuffix = analysis.summary.sharedRuntimeAreaCount > 0
      ? ` ${analysis.summary.sharedRuntimeAreaCount} shared depth area${analysis.summary.sharedRuntimeAreaCount === 1 ? "" : "s"} ${analysis.summary.sharedRuntimeAreaCount === 1 ? "is" : "are"} balancing split zones in the schedule.`
      : "";
    elements.analysisSummary.textContent = `The full schedule averages ${grid.averageInches.toFixed(2)} in over ${grid.wateredAreaSqFt.toFixed(0)} sq ft. Positive cells range ${grid.minPositiveInches.toFixed(2)} to ${grid.maxInches.toFixed(2)} in against a ${targetDepth.toFixed(2)} in target.${sharedAreaSuffix}`;
    return;
  }

  elements.analysisLegend.innerHTML = buildLegendBar(
    "linear-gradient(90deg, rgba(38, 95, 160, 0.84) 0%, rgba(84, 173, 219, 0.7) 28%, rgba(255, 250, 240, 0.18) 50%, rgba(230, 175, 71, 0.7) 72%, rgba(176, 74, 42, 0.88) 100%)",
    ["-50%", "On target", "+50%"],
  );
  const targetError = analysis.grid.targetError;
  const grid = analysis.grid.fullScheduleDepth;
  const sharedAreaSuffix = analysis.summary.sharedRuntimeAreaCount > 0
    ? ` ${analysis.summary.sharedRuntimeAreaCount} shared depth area${analysis.summary.sharedRuntimeAreaCount === 1 ? "" : "s"} ${analysis.summary.sharedRuntimeAreaCount === 1 ? "is" : "are"} contributing to that balance.`
    : "";
  elements.analysisSummary.textContent = `Target error compares the full schedule against ${targetDepth.toFixed(2)} in. Wetted cells currently range from ${formatSignedPercent(targetError.minRatio)} to ${formatSignedPercent(targetError.maxRatio)}, with total depth spanning ${grid.minPositiveInches.toFixed(2)} to ${grid.maxInches.toFixed(2)} in.${sharedAreaSuffix}`;
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
  elements.partsSummary.textContent = `${parts.includedHeadCount} included head${parts.includedHeadCount === 1 ? "" : "s"}, ${parts.lineItemCount} line item${parts.lineItemCount === 1 ? "" : "s"}, ${parts.totalBodyQuantity} bodies, ${parts.totalNozzleQuantity} nozzles, ${parts.totalFittingQuantity} fitting${parts.totalFittingQuantity === 1 ? "" : "s"}, ${parts.totalMainPipeLength.toFixed(1)} ${state.scale.units} main pipe, ${parts.totalZonePipeLength.toFixed(1)} ${state.scale.units} zone pipe, ${parts.totalPipeLength.toFixed(1)} ${state.scale.units} total pipe. ${includedZoneCount} zone${includedZoneCount === 1 ? "" : "s"} included${excludedZoneCount ? `, ${excludedZoneCount} excluded` : ""}.`;

  const rows = parts.groupBy === "body_nozzle_split"
    ? parts.bodyRows.concat(parts.nozzleRows).concat(parts.fittingRows ?? []).concat(parts.pipeRows ?? [])
    : parts.rows.concat(parts.fittingRows ?? []).concat(parts.pipeRows ?? []);
  const hasRows = rows.length > 0;
  elements.partsEmpty.hidden = hasRows;
  elements.partsEmpty.textContent = hasRows ? "" : "No included recommended heads, placed fittings, or pipe runs yet.";
  elements.partsTable.innerHTML = hasRows
    ? renderPartsTables(parts, state.scale.units)
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

function renderPartsTables(parts, units) {
  return [
    renderPartsTableSection("Bodies", parts.bodyRows, parts.showZoneUsage),
    renderPartsTableSection("Nozzles", parts.nozzleRows, parts.showZoneUsage),
    renderPartsTableSection("Fittings", parts.fittingRows ?? [], parts.showZoneUsage),
    renderPipeTableSection("Pipe", parts.pipeRows ?? [], parts.showZoneUsage, units),
  ].join("");
}

function renderPartsTableSection(title, rows, showZoneUsage) {
  return `
    <div class="parts-table-section">
      <h3>${title}</h3>
      ${rows.length ? renderPartsTable(rows, showZoneUsage) : '<div class="empty-card">No included items in this section yet.</div>'}
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

function renderPipeTableSection(title, rows, showZoneUsage, units) {
  return `
    <div class="parts-table-section">
      <h3>${title}</h3>
      ${rows.length ? renderPipeTable(rows, showZoneUsage, units) : '<div class="empty-card">No included pipe runs yet.</div>'}
    </div>
  `;
}

function renderPipeTable(rows, showZoneUsage, units) {
  const zoneHeader = showZoneUsage ? "<th>Zones</th>" : "";
  const zoneCells = showZoneUsage
    ? (row) => `<td>${escapeHtml(row.zonesLabel || "--")}</td>`
    : () => "";

  return `
    <table class="parts-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Length</th>
          ${zoneHeader}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>
              <div class="parts-item-label">${escapeHtml(row.itemLabel)}</div>
              ${row.notes ? `<div class="parts-item-notes">${escapeHtml(row.notes)}</div>` : ""}
            </td>
            <td>${row.length.toFixed(2)} ${units}</td>
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
      ? `<div class="analysis-note">${escapeHtml(zoneSummary.zoneName)} runtime ${zoneSummary.effectiveRuntimeMinutes?.toFixed(1) ?? "--"} min (suggested ${zoneSummary.suggestedRuntimeMinutes?.toFixed(1) ?? "--"} min), average zone rate ${zoneSummary.averageRateInHr.toFixed(2)} in/hr.${buildSharedRuntimeAnalysisNote(zoneSummary, analysis?.targetDepthInches ?? 1)}</div>`
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
