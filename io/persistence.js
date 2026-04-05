import { cloneProjectSnapshot } from "../state/project-state.js";

const AUTOSAVE_KEY = "sprinkler-layout:autosave:v1";
const SUPPORTED_VERSIONS = ["1.0", "1.1"];
const AUTOSAVE_QUOTA_MESSAGE = "Autosave warning: browser storage is full. Export the project manually to avoid losing changes.";
const AUTOSAVE_FAILURE_MESSAGE = "Autosave warning: the latest draft could not be saved. Export the project manually to be safe.";

function isVersionSupported(version) {
  return SUPPORTED_VERSIONS.includes(version);
}

export function loadAutosave() {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!isVersionSupported(parsed.version) || !parsed.project) {
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
    return { ok: true };
  } catch (error) {
    console.warn("Unable to save autosave.", error);
    if (error?.name === "QuotaExceededError") {
      console.warn(AUTOSAVE_QUOTA_MESSAGE);
      return {
        ok: false,
        reason: "quota_exceeded",
        userMessage: AUTOSAVE_QUOTA_MESSAGE,
      };
    }
    return {
      ok: false,
      reason: "save_failed",
      userMessage: AUTOSAVE_FAILURE_MESSAGE,
    };
  }
}

function sanitizeForAutosave(state) {
  const snapshot = cloneProjectSnapshot(state);
  snapshot.ui.measurePoints = [];
  snapshot.ui.measurePreviewPoint = null;
  snapshot.ui.measureDistance = null;
  snapshot.ui.cursorWorld = null;
  snapshot.ui.hint = "Autosaved project restored.";
  snapshot.ui.activeTool = "select";
  snapshot.ui.expandedZoneIds = [];
  return snapshot;
}
