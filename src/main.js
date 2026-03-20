import { buildCopiedSprinklerLabel, createInitialState, createStore, findSelectedSprinkler } from "../state/project-state.js";
import { createRenderer } from "../canvas/renderer.js";
import { createInteractionController } from "../canvas/interactions.js";
import { bindPanels } from "../ui/panels.js";
import { createIrrigationAnalyzer, sampleAnalysisAtPoint } from "../analysis/irrigation-analysis.js";
import { loadIrrigationDatabase } from "../analysis/sprinkler-database.js";
import { loadImageFile, loadProjectFile } from "../io/import.js";
import { exportCanvasPng, exportProjectJson } from "../io/export.js";
import { loadAutosave, saveAutosave } from "../io/persistence.js";

const canvas = document.getElementById("sprinkler-canvas");
const store = createStore(createInitialState());
const irrigationDatabase = await loadIrrigationDatabase();
const analyzer = createIrrigationAnalyzer(irrigationDatabase);
const renderer = createRenderer(canvas, store, analyzer);
const interactions = createInteractionController(canvas, store, renderer);
const autosavedProject = loadAutosave();
let autosaveTimer = null;
let sprinklerClipboard = null;
let sprinklerPasteCount = 0;

if (autosavedProject) {
  store.dispatch({ type: "LOAD_PROJECT", payload: { project: autosavedProject } });
}

bindPanels({
  store,
  renderer,
  analyzer,
  interactions,
  io: { loadImageFile, loadProjectFile, exportCanvasPng, exportProjectJson },
});

store.subscribe((state) => {
  renderer.render(state);
  interactions.syncState(state);
  updateStatusText(state);
  queueAutosave(state);
});

renderer.render(store.getState());
interactions.syncState(store.getState());
updateStatusText(store.getState());

window.addEventListener("resize", () => {
  renderer.resize();
  renderer.render(store.getState());
});

window.addEventListener("beforeunload", () => {
  flushAutosave(store.getState());
});

document.addEventListener("keydown", (event) => {
  if (isInputFocused()) {
    if (event.key === "Escape") {
      const state = store.getState();
      if (state.ui.activeTool === "measure" && (state.ui.measurePoints.length || state.ui.measurePreviewPoint)) {
        event.preventDefault();
        store.dispatch({ type: "CLEAR_MEASURE" });
      }
    }
    return;
  }

  if (matchesShortcut(event, "z")) {
    event.preventDefault();
    store.dispatch({ type: "UNDO" });
    return;
  }

  if (matchesRedoShortcut(event)) {
    event.preventDefault();
    store.dispatch({ type: "REDO" });
    return;
  }

  if (matchesShortcut(event, "c") && copySelectedSprinkler()) {
    event.preventDefault();
    return;
  }

  if (matchesShortcut(event, "v") && pasteSprinklerFromClipboard()) {
    event.preventDefault();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    const selectedId = store.getState().ui.selectedSprinklerId;
    if (selectedId) {
      event.preventDefault();
      store.dispatch({ type: "DELETE_SPRINKLER", payload: { id: selectedId } });
    }
  }

  if (event.key === "Escape") {
    const state = store.getState();
    if (state.ui.activeTool === "measure" && (state.ui.measurePoints.length || state.ui.measurePreviewPoint)) {
      event.preventDefault();
      store.dispatch({ type: "CLEAR_MEASURE" });
    }
  }
});

function updateStatusText(state) {
  const analysis = analyzer.getSnapshot(state);
  const analysisSample = sampleAnalysisAtPoint(analysis, state.view.analysisOverlayMode, state.ui.cursorWorld);
  const cursorText = state.ui.cursorWorld
    ? `Cursor: ${state.ui.cursorWorld.x.toFixed(2)}, ${state.ui.cursorWorld.y.toFixed(2)} ${state.scale.units}`
    : "Cursor: --";
  const measureText = state.ui.measureDistance
    ? `Measure: ${state.ui.measureDistance.toFixed(2)} ${state.scale.units}`
    : "Measure: --";
  const analysisText = formatAnalysisReadout(state, analysisSample);
  document.getElementById("cursor-position").textContent = cursorText;
  document.getElementById("measure-readout").textContent = measureText;
  document.getElementById("analysis-readout").textContent = analysisText;
}

function formatAnalysisReadout(state, sample) {
  if (state.view.analysisOverlayMode === "none") {
    return "Analysis: off";
  }
  if (!sample) {
    return "Analysis: --";
  }

  if (sample.mode === "application_rate") {
    return `Analysis: ${sample.value.toFixed(2)} in/hr`;
  }

  if (sample.mode === "zone_catch_can") {
    return `Catch Can (${sample.zoneName}): ${sample.value.toFixed(2)} in`;
  }

  const contributionText = sample.contributions?.length
    ? ` (${sample.contributions
      .slice(0, 3)
      .map((entry) => `${entry.zoneName} ${entry.value.toFixed(2)}`)
      .join(", ")}${sample.contributions.length > 3 ? ", ..." : ""})`
    : "";

  if (sample.mode === "full_schedule_depth") {
    return `Schedule: ${sample.value.toFixed(2)} in${contributionText}`;
  }

  if (sample.mode === "target_error") {
    const percent = `${sample.value >= 0 ? "+" : ""}${(sample.value * 100).toFixed(0)}%`;
    return `Target Error: ${percent} (${sample.totalDepthInches.toFixed(2)} in total${contributionText})`;
  }

  return "Analysis: --";
}

function isInputFocused() {
  const active = document.activeElement;
  return active instanceof HTMLInputElement
    || active instanceof HTMLTextAreaElement
    || active instanceof HTMLSelectElement
    || Boolean(active?.isContentEditable);
}

function matchesShortcut(event, key) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === key;
}

function matchesRedoShortcut(event) {
  return (
    ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "y")
    || ((event.ctrlKey || event.metaKey) && !event.altKey && event.shiftKey && event.key.toLowerCase() === "z")
  );
}

function copySelectedSprinkler() {
  const selected = findSelectedSprinkler(store.getState());
  if (!selected) {
    return false;
  }
  sprinklerClipboard = structuredClone(selected);
  sprinklerPasteCount = 0;
  return true;
}

function pasteSprinklerFromClipboard() {
  if (!sprinklerClipboard) {
    return false;
  }

  const state = store.getState();
  const basePoint = state.ui.cursorWorld ?? { x: sprinklerClipboard.x, y: sprinklerClipboard.y };
  const offset = state.ui.cursorWorld ? sprinklerPasteCount : sprinklerPasteCount + 1;
  const nextLabel = buildCopiedSprinklerLabel(state.sprinklers, sprinklerClipboard.label);

  store.dispatch({
    type: "ADD_SPRINKLER",
    payload: {
      id: crypto.randomUUID(),
      x: basePoint.x + offset,
      y: basePoint.y + offset,
      coverageModel: sprinklerClipboard.coverageModel,
      radius: sprinklerClipboard.radius,
      pattern: sprinklerClipboard.pattern,
      startDeg: sprinklerClipboard.startDeg,
      sweepDeg: sprinklerClipboard.sweepDeg,
      rotationDeg: 0,
      stripMode: sprinklerClipboard.stripMode,
      stripMirror: sprinklerClipboard.stripMirror,
      stripLength: sprinklerClipboard.stripLength,
      stripWidth: sprinklerClipboard.stripWidth,
      stripRotationDeg: sprinklerClipboard.stripRotationDeg,
      hidden: sprinklerClipboard.hidden,
      label: nextLabel,
      zoneId: sprinklerClipboard.zoneId,
    },
  });

  sprinklerPasteCount += 1;
  return true;
}

function queueAutosave(state) {
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    flushAutosave(state);
  }, 250);
}

function flushAutosave(state) {
  saveAutosave(state);
}
