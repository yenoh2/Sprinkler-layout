import { createInitialState, createStore } from "../state/project-state.js";
import { createRenderer } from "../canvas/renderer.js";
import { createInteractionController } from "../canvas/interactions.js";
import { bindPanels } from "../ui/panels.js";
import { loadImageFile, loadProjectFile } from "../io/import.js";
import { exportCanvasPng, exportProjectJson } from "../io/export.js";

const canvas = document.getElementById("sprinkler-canvas");
const store = createStore(createInitialState());
const renderer = createRenderer(canvas, store);
const interactions = createInteractionController(canvas, store, renderer);

bindPanels({
  store,
  renderer,
  interactions,
  io: { loadImageFile, loadProjectFile, exportCanvasPng, exportProjectJson },
});

store.subscribe((state) => {
  renderer.render(state);
  interactions.syncState(state);
  updateStatusText(state);
});

renderer.render(store.getState());
interactions.syncState(store.getState());
updateStatusText(store.getState());

window.addEventListener("resize", () => {
  renderer.resize();
  renderer.render(store.getState());
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    store.dispatch({ type: "UNDO" });
    return;
  }

  if (
    ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") ||
    ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z")
  ) {
    event.preventDefault();
    store.dispatch({ type: "REDO" });
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && !isInputFocused()) {
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
  const cursorText = state.ui.cursorWorld
    ? `Cursor: ${state.ui.cursorWorld.x.toFixed(2)}, ${state.ui.cursorWorld.y.toFixed(2)} ${state.scale.units}`
    : "Cursor: --";
  const measureText = state.ui.measureDistance
    ? `Measure: ${state.ui.measureDistance.toFixed(2)} ${state.scale.units}`
    : "Measure: --";
  document.getElementById("cursor-position").textContent = cursorText;
  document.getElementById("measure-readout").textContent = measureText;
}

function isInputFocused() {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}
