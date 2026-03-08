import { pointInSprinkler, toRadians } from "../geometry/arcs.js";
import { toPixels, worldToScreen } from "../geometry/scale.js";
import { findSelectedSprinkler, hasHydraulics, isProjectReady } from "../state/project-state.js";

export function createRenderer(canvas, store) {
  const ctx = canvas.getContext("2d");
  const backgroundImage = new Image();
  let currentBackground = "";

  function resize() {
    const frame = canvas.parentElement;
    const width = Math.max(600, Math.floor(frame.clientWidth - 12));
    const height = Math.max(480, Math.floor(frame.clientHeight - 12));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function render(state) {
    resize();
    syncBackground(state.background.src);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f6f1e4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
      const topLeft = worldToScreen({ x: 0, y: 0 }, state.view);
      const width = state.background.width * state.view.zoom;
      const height = state.background.height * state.view.zoom;
      ctx.drawImage(backgroundImage, topLeft.x, topLeft.y, width, height);
    }

    if (state.view.showGrid) {
      drawGrid(state);
    }
    drawCalibrationLine(state);
    drawMeasureLine(state);
    if (state.view.showCoverage) {
      drawCoverage(state);
    }
    drawSprinklers(state);
    drawOverlayWarnings(state);
  }

  function syncBackground(src) {
    if (!src || src === currentBackground) {
      return;
    }
    currentBackground = src;
    backgroundImage.src = src;
  }

  function drawGrid(state) {
    ctx.save();
    ctx.strokeStyle = "rgba(91, 71, 54, 0.08)";
    ctx.lineWidth = 1;
    const spacing = 50 * state.view.zoom;
    if (spacing >= 18) {
      for (let x = state.view.offsetX % spacing; x < canvas.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = state.view.offsetY % spacing; y < canvas.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCalibrationLine(state) {
    if (!state.scale.calibrationPoints.length) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(182, 92, 42, 0.9)";
    ctx.fillStyle = "rgba(182, 92, 42, 0.9)";
    ctx.lineWidth = 2;
    const [first, second] = state.scale.calibrationPoints.map((point) => worldToScreen(point, state.view));
    drawMarker(first);
    if (second) {
      drawMarker(second);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(second.x, second.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMeasureLine(state) {
    if (!state.ui.measurePoints.length) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(45, 106, 71, 0.92)";
    ctx.fillStyle = "rgba(45, 106, 71, 0.92)";
    ctx.lineWidth = 2;
    const first = worldToScreen(state.ui.measurePoints[0], state.view);
    const secondPoint = state.ui.measurePoints[1] || state.ui.measurePreviewPoint;
    const second = secondPoint ? worldToScreen(secondPoint, state.view) : null;
    drawMarker(first);
    if (second) {
      drawMarker(second);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(second.x, second.y);
      ctx.stroke();
      if (!state.ui.measurePoints[1] && state.ui.measureDistance) {
        const midX = (first.x + second.x) / 2;
        const midY = (first.y + second.y) / 2;
        ctx.fillStyle = "rgba(255, 247, 235, 0.96)";
        ctx.fillRect(midX - 46, midY - 24, 92, 22);
        ctx.fillStyle = "rgba(45, 106, 71, 0.96)";
        ctx.font = "12px Aptos, Segoe UI, sans-serif";
        ctx.fillText(`${state.ui.measureDistance.toFixed(2)} ${state.scale.units}`, midX - 38, midY - 9);
      }
    }
    ctx.restore();
  }

  function drawCoverage(state) {
    ctx.save();
    state.sprinklers.forEach((sprinkler) => {
      if (sprinkler.hidden) {
        return;
      }
      ctx.fillStyle = `rgba(56, 133, 196, ${state.view.coverageOpacity})`;
      ctx.strokeStyle = "rgba(30, 82, 121, 0.88)";
      ctx.lineWidth = 1.4;
      drawSprinklerShape(state, sprinkler);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawSprinklers(state) {
    const selected = findSelectedSprinkler(state);
    state.sprinklers.forEach((sprinkler) => {
      const center = worldToScreen({ x: sprinkler.x, y: sprinkler.y }, state.view);
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = selected?.id === sprinkler.id ? "#b65c2a" : "#2f2418";
      ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.arc(center.x, center.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      if (state.view.showLabels) {
        ctx.fillStyle = "#2f2418";
        ctx.font = "12px Aptos, Segoe UI, sans-serif";
        ctx.fillText(sprinkler.label || sprinkler.id, center.x + 10, center.y - 10);
      }
      ctx.restore();
    });
  }

  function drawSprinklerShape(state, sprinkler) {
    const center = worldToScreen({ x: sprinkler.x, y: sprinkler.y }, state.view);
    const radius = toPixels(sprinkler.radius, state.scale) * state.view.zoom;
    ctx.beginPath();
    if (sprinkler.pattern === "full" || sprinkler.sweepDeg >= 360) {
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      return;
    }
    ctx.moveTo(center.x, center.y);
    ctx.arc(
      center.x,
      center.y,
      radius,
      toRadians(sprinkler.startDeg + sprinkler.rotationDeg),
      toRadians(sprinkler.startDeg + sprinkler.rotationDeg + sprinkler.sweepDeg),
    );
    ctx.closePath();
  }

  function drawOverlayWarnings(state) {
    const lines = [];
    if (!state.background.src) {
      lines.push("Import a yard image to start.");
    } else if (!state.scale.calibrated) {
      lines.push("Scale not calibrated.");
    }
    if (!hasHydraulics(state)) {
      lines.push("Supply line size and pressure required.");
    }
    if (!lines.length) {
      return;
    }
    ctx.save();
    ctx.fillStyle = "rgba(47, 36, 24, 0.72)";
    ctx.fillRect(20, canvas.height - 28 - lines.length * 20, 340, 22 + lines.length * 20);
    ctx.fillStyle = "#fff7eb";
    ctx.font = "13px Aptos, Segoe UI, sans-serif";
    lines.forEach((line, index) => {
      ctx.fillText(line, 32, canvas.height - 18 - (lines.length - index - 1) * 20);
    });
    if (isProjectReady(state)) {
      ctx.fillStyle = "rgba(45, 106, 71, 0.92)";
      ctx.fillText("Project ready for layout review.", canvas.width - 230, 28);
    }
    ctx.restore();
  }

  function drawMarker(point) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function getHitSprinkler(worldPoint) {
    const state = store.getState();
    return [...state.sprinklers].reverse().find((sprinkler) => {
      const hitRadius = Math.max(8 / state.view.zoom, 4 / Math.max(state.scale.pixelsPerUnit || 1, 1));
      return pointInSprinkler(worldPoint, { ...sprinkler, pattern: "full", sweepDeg: 360, radius: hitRadius });
    }) || null;
  }

  function buildExportSummary() {
    const state = store.getState();
    return {
      sprinklerCount: state.sprinklers.length,
      meanRadius: state.sprinklers.length
        ? state.sprinklers.reduce((sum, sprinkler) => sum + sprinkler.radius, 0) / state.sprinklers.length
        : 0,
      backgroundSize:
        state.scale.calibrated && state.background.width && state.background.height
          ? `${(state.background.width / state.scale.pixelsPerUnit).toFixed(1)} x ${(state.background.height / state.scale.pixelsPerUnit).toFixed(1)} ${state.scale.units}`
          : "--",
    };
  }

  return {
    resize,
    render,
    getHitSprinkler,
    buildExportSummary,
  };
}
