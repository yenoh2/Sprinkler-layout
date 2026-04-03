export function formatNozzleLabel(source) {
  if (!source) {
    return "";
  }

  const rawNozzle = String(source.nozzle ?? "").trim();
  if (!rawNozzle) {
    return "";
  }

  if (source.coverageModel === "strip" || source.nozzleType === "strip") {
    return rawNozzle;
  }

  if (source.nozzleType === "pre-balanced rotor") {
    const preBalanced = parsePreBalancedRotorNozzle(rawNozzle);
    if (preBalanced) {
      return `${preBalanced.colorInitial}${preBalanced.patternCode}`;
    }
  }

  if (source.family === "rotor") {
    const numericDesignator = parseNumericNozzleDesignator(rawNozzle);
    if (numericDesignator) {
      return source.nozzleType === "low-angle rotor"
        ? `${numericDesignator}LA`
        : numericDesignator;
    }
  }

  if (source.family === "spray") {
    const radiusLabel = formatNozzleRadiusLabel(source.radiusClassFt ?? source.selectedRadiusFt);
    if (source.nozzleType === "variable") {
      return radiusLabel ? `${radiusLabel}V` : rawNozzle;
    }

    const patternCode = resolvePatternCodeForArc(source.selectedArcDeg);
    if (source.nozzleType === "fixed" && radiusLabel && patternCode) {
      return `${radiusLabel}${patternCode}`;
    }
  }

  return rawNozzle;
}

function parsePreBalancedRotorNozzle(value) {
  const parts = String(value).split("_");
  if (parts.length < 3) {
    return null;
  }

  const colorName = parts[1] ?? "";
  const patternCode = normalizePatternCode(parts[2] ?? "");
  const colorInitial = colorName ? colorName[0].toUpperCase() : "";
  if (!colorInitial || !patternCode) {
    return null;
  }

  return { colorInitial, patternCode };
}

function parseNumericNozzleDesignator(value) {
  const match = String(value).trim().match(/^\d+(?:\.\d+)?/);
  return match?.[0] ?? "";
}

function resolvePatternCodeForArc(value) {
  const arcDeg = Number(value);
  if (!Number.isFinite(arcDeg)) {
    return "";
  }

  if (Math.abs(arcDeg - 90) <= 5) {
    return "Q";
  }
  if (Math.abs(arcDeg - 120) <= 5) {
    return "T";
  }
  if (Math.abs(arcDeg - 180) <= 5) {
    return "H";
  }
  if (Math.abs(arcDeg - 360) <= 5) {
    return "F";
  }
  return "";
}

function normalizePatternCode(value) {
  const code = String(value).trim().toUpperCase();
  return ["F", "H", "Q", "T", "V"].includes(code) ? code : "";
}

function formatNozzleRadiusLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  return Number.isInteger(numeric)
    ? String(numeric)
    : String(Number(numeric.toFixed(2)));
}
