const AUTOSAVE_KEY = "sprinkler-layout:autosave:v1";

export function loadAutosave() {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed.version !== "1.0" || !parsed.project) {
      return null;
    }
    return parsed.project;
  } catch (error) {
    console.warn("Unable to load autosave.", error);
    return null;
  }
}

export function saveAutosave(state) {
  try {
    const payload = {
      version: "1.0",
      savedAt: new Date().toISOString(),
      project: sanitizeForAutosave(state),
    };
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to save autosave.", error);
  }
}

function sanitizeForAutosave(state) {
  const snapshot = structuredClone(state);
  snapshot.history = { undoStack: [], redoStack: [] };
  snapshot.ui.measurePoints = [];
  snapshot.ui.measurePreviewPoint = null;
  snapshot.ui.measureDistance = null;
  snapshot.ui.cursorWorld = null;
  snapshot.ui.hint = "Autosaved project restored.";
  snapshot.ui.activeTool = "select";
  snapshot.ui.expandedZoneIds = [];
  return snapshot;
}
