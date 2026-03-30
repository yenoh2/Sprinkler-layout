export const WIRE_GAUGE_OPTIONS = ["18", "16", "14"];

export function normalizeWireKind(value) {
  return value === "multiconductor" ? "multiconductor" : "multiconductor";
}

export function normalizeWireGauge(value) {
  const gauge = String(value ?? "").trim();
  return WIRE_GAUGE_OPTIONS.includes(gauge) ? gauge : "18";
}

export function sanitizeWireColorCode(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

export function sanitizeWireConductorCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 2;
}

export function formatWireGaugeLabel(gaugeAwg) {
  return `${normalizeWireGauge(gaugeAwg)} AWG`;
}

export function formatWireConductorLabel(conductorCount) {
  return `${sanitizeWireConductorCount(conductorCount)}-conductor`;
}

export function formatWireRunLabel(conductorCount, gaugeAwg) {
  return `${formatWireGaugeLabel(gaugeAwg)} ${formatWireConductorLabel(conductorCount)} control wire`;
}
