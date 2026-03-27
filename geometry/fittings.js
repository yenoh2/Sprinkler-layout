export const FITTING_TYPE_OPTIONS = [
  {
    value: "head_takeoff",
    label: "Head takeoff",
    description: 'Tee from a zone line to a 1/2" head connection.',
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
];

const FITTING_TYPE_VALUES = new Set(FITTING_TYPE_OPTIONS.map((option) => option.value));
const FITTINGS_PANEL_TAB_VALUES = new Set(FITTINGS_PANEL_TABS.map((tab) => tab.value));

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
