export const FITTING_TYPE_OPTIONS = [
  {
    value: "head_takeoff",
    label: "Head takeoff",
    description: "Tee from a zone line to a sprinkler head connection.",
    category: "common",
  },
  {
    value: "tee",
    label: "Pipe tee",
    description: "Branch one pipe run off another run of the same size.",
    category: "common",
  },
  {
    value: "reducing_tee",
    label: "Reducing tee",
    description: "Branch a smaller or larger run from the parent line.",
    category: "common",
  },
  {
    value: "reducer",
    label: "Reducer / transition",
    description: "Change pipe size inline without adding a branch.",
    category: "common",
  },
  {
    value: "elbow",
    label: "Elbow",
    description: "Turn a run through a corner or direction change.",
    category: "common",
  },
  {
    value: "coupling",
    label: "Coupling",
    description: "Join two straight run segments together.",
    category: "common",
  },
  {
    value: "cap",
    label: "Cap",
    description: "Terminate a dead-end run cleanly.",
    category: "all",
  },
  {
    value: "valve_takeoff",
    label: "Valve takeoff",
    description: "Connect a valve box outlet to the start of a zone line.",
    category: "all",
  },
];

export const FITTINGS_PANEL_TABS = [
  { value: "suggested", label: "Suggested" },
  { value: "common", label: "Common" },
  { value: "all", label: "All" },
  { value: "ignored", label: "Ignored" },
];

const FITTING_TYPE_VALUES = new Set(FITTING_TYPE_OPTIONS.map((option) => option.value));
const FITTINGS_PANEL_TAB_VALUES = new Set(FITTINGS_PANEL_TABS.map((tab) => tab.value));
const SUPPORTED_MANUAL_PLACEMENT_TYPES = new Set(["head_takeoff"]);
export const DEFAULT_HEAD_CONNECTION_DIAMETER_INCHES = 0.5;

export function normalizeFittingType(value) {
  return FITTING_TYPE_VALUES.has(value) ? value : "head_takeoff";
}

export function normalizeFittingsPanelTab(value) {
  return FITTINGS_PANEL_TAB_VALUES.has(value) ? value : "suggested";
}

export function getFittingTypeMeta(value) {
  return FITTING_TYPE_OPTIONS.find((option) => option.value === normalizeFittingType(value)) ?? FITTING_TYPE_OPTIONS[0];
}

export function getCommonFittingOptions() {
  return FITTING_TYPE_OPTIONS.filter((option) => option.category === "common");
}

export function getAllFittingOptions() {
  return [...FITTING_TYPE_OPTIONS];
}

export function isManualFittingPlacementSupported(type) {
  return SUPPORTED_MANUAL_PLACEMENT_TYPES.has(normalizeFittingType(type));
}

export function formatNominalPipeSize(diameterInches) {
  const value = Number(diameterInches);
  if (!Number.isFinite(value) || value <= 0) {
    return "Zone";
  }
  if (Math.abs(value - 0.5) <= 0.001) {
    return "1/2";
  }
  if (Math.abs(value - 0.75) <= 0.001) {
    return "3/4";
  }
  if (Math.abs(value - 1) <= 0.001) {
    return "1";
  }
  if (Math.abs(value - 1.25) <= 0.001) {
    return "1 1/4";
  }
  if (Math.abs(value - 1.5) <= 0.001) {
    return "1 1/2";
  }
  return String(Number(value.toFixed(2)));
}

export function resolveHeadTakeoffSizeSpec(
  lineDiameterInches,
  headConnectionDiameterInches = DEFAULT_HEAD_CONNECTION_DIAMETER_INCHES,
) {
  const headConnectionSize = formatNominalPipeSize(resolveHeadConnectionDiameterInches(headConnectionDiameterInches));
  if (!(Number(lineDiameterInches) > 0)) {
    return `Zone line x ${headConnectionSize} tee`;
  }
  const lineSize = formatNominalPipeSize(lineDiameterInches);
  return `${lineSize} x ${lineSize} x ${headConnectionSize} tee`;
}

export function resolveHeadElbowSizeSpec(
  lineDiameterInches,
  headConnectionDiameterInches = DEFAULT_HEAD_CONNECTION_DIAMETER_INCHES,
) {
  const headConnectionSize = formatNominalPipeSize(resolveHeadConnectionDiameterInches(headConnectionDiameterInches));
  if (!(Number(lineDiameterInches) > 0)) {
    return `Zone line x ${headConnectionSize} elbow`;
  }
  return `${formatNominalPipeSize(lineDiameterInches)} x ${headConnectionSize} elbow`;
}

function resolveHeadConnectionDiameterInches(value) {
  const diameter = Number(value);
  return Number.isFinite(diameter) && diameter > 0
    ? diameter
    : DEFAULT_HEAD_CONNECTION_DIAMETER_INCHES;
}
