import fs from "node:fs";

import { createIrrigationAnalyzer } from "../analysis/irrigation-analysis.js";

const LAYOUT_PATH = "sprinkler-layout.json";
const DATABASE_PATH = "sprinkler_data.json";
const OUTPUT_PATH = "zone-nozzle-analysis.md";

const project = JSON.parse(fs.readFileSync(LAYOUT_PATH, "utf8")).project;
const database = JSON.parse(fs.readFileSync(DATABASE_PATH, "utf8")).irrigation_system_database;

const analyzer = createIrrigationAnalyzer(database);
const snapshot = analyzer.getSnapshot(project);
const report = buildReport(snapshot);

fs.writeFileSync(OUTPUT_PATH, report);
process.stdout.write(report);

function buildReport(snapshot) {
  const lines = [];
  const zoneSummaries = [...(snapshot.zones ?? [])]
    .filter((zoneSummary) => zoneSummary.headCount > 0)
    .sort((a, b) => a.zoneName.localeCompare(b.zoneName, undefined, { sensitivity: "base" }));

  lines.push("# Zone Head and Nozzle Analysis");
  lines.push("");
  lines.push(
    `Generated from \`${LAYOUT_PATH}\` and \`${DATABASE_PATH}\` using the shared analyzer in \`analysis/irrigation-analysis.js\`.`,
  );
  lines.push("");
  lines.push("## Assumptions");
  lines.push("");
  lines.push(`- Design flow cap: ${snapshot.designFlowLimitGpm.toFixed(2)} GPM per zone.`);
  lines.push("- Recommendation logic matches the in-app analyzer, so the report and UI stay in sync.");
  lines.push("- Zone notes below come directly from the analyzer, including overlap-based rotor scoring when available.");
  lines.push("");

  for (const zoneSummary of zoneSummaries) {
    appendZoneReport(lines, zoneSummary, snapshot.recommendations ?? [], snapshot.designFlowLimitGpm);
  }

  lines.push("## Summary");
  lines.push("");
  for (const zoneSummary of zoneSummaries) {
    const status = zoneSummary.isOverLimit ? `Over ${snapshot.designFlowLimitGpm.toFixed(0)} GPM` : "OK";
    lines.push(`- ${zoneSummary.zoneName}: ${zoneSummary.totalFlowGpm.toFixed(2)} GPM, ${status}.`);
  }
  lines.push("");

  return lines.join("\n");
}

function appendZoneReport(lines, zoneSummary, recommendations, designFlowLimitGpm) {
  const zoneRecommendations = recommendations
    .filter((recommendation) => recommendation.zoneId === zoneSummary.zoneId)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));

  lines.push(`## Zone ${zoneSummary.zoneName}`);
  lines.push("");
  lines.push(`- Heads analyzed: ${zoneSummary.headCount}`);
  lines.push(`- Estimated zone flow: ${zoneSummary.totalFlowGpm.toFixed(2)} GPM`);
  lines.push(`- Flow status: ${zoneSummary.isOverLimit ? `Over ${designFlowLimitGpm.toFixed(2)} GPM design cap` : `Within ${designFlowLimitGpm.toFixed(2)} GPM design cap`}`);
  lines.push(`- Preferred family: ${capitalize(zoneSummary.preferredFamily)}`);
  lines.push(`- Average zone rate: ${zoneSummary.averageRateInHr.toFixed(3)} in/hr`);
  lines.push(`- Head-level PR spread: ${zoneSummary.precipSpreadInHr.toFixed(3)} in/hr`);
  lines.push("");
  lines.push("| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const recommendation of zoneRecommendations) {
    const nozzleLabel = formatReportNozzleLabel(recommendation);
    const arcCell = recommendation.arcNormalized
      ? `${formatArc(recommendation.desiredArcDeg)} -> ${formatArc(recommendation.selectedArcDeg)}`
      : formatArc(recommendation.selectedArcDeg);
    const radiusCell = recommendation.selectedRadiusFt
      ? `${recommendation.desiredRadiusFt.toFixed(2)} ft -> ${recommendation.selectedRadiusFt.toFixed(0)} ft`
      : `${recommendation.desiredRadiusFt.toFixed(2)} ft`;

    lines.push(
      `| ${escapeTableCell(recommendation.label)} | (${recommendation.x.toFixed(1)}, ${recommendation.y.toFixed(1)}) | ${escapeTableCell(recommendation.family)} | ${escapeTableCell(recommendation.body)} | ${escapeTableCell(nozzleLabel)} | ${escapeTableCell(arcCell)} | ${escapeTableCell(radiusCell)} | ${recommendation.flowGpm.toFixed(2)} GPM | ${recommendation.actualPrecipInHr.toFixed(3)} in/hr | ${escapeTableCell(recommendation.comment)} |`,
    );
  }

  if (zoneSummary.notes?.length) {
    lines.push("");
    lines.push("### Notes");
    lines.push("");
    for (const note of zoneSummary.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
}

function formatReportNozzleLabel(recommendation) {
  const display = String(recommendation.nozzleLabel ?? "").trim();
  const raw = String(recommendation.nozzle ?? "").trim();
  if (!display || display === raw) {
    return raw;
  }
  return `${display} (${raw})`;
}

function formatArc(value) {
  return `${Math.round(Number(value) || 0)} deg`;
}

function escapeTableCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function capitalize(value) {
  return typeof value === "string" && value.length
    ? `${value[0].toUpperCase()}${value.slice(1)}`
    : value;
}
