import { resolvePlacedFittingSizeSpec } from "../analysis/fittings-analysis.js";
import { pointFromAngle, pointInSprinkler, toRadians } from "../geometry/arcs.js";
import { getFittingTypeMeta } from "../geometry/fittings.js";
import { buildPipeMidpoints, calculatePipeLengthUnits, distancePointToSegmentSquared } from "../geometry/pipes.js";
import { normalizeRectificationCorners } from "../geometry/rectification.js";
import { buildStripFootprintWorldPoints, buildStripHandleWorldPoints, isStripCoverage } from "../geometry/coverage.js";
import { toPixels, worldToScreen } from "../geometry/scale.js";
import { buildDerivedTrenchSpans, buildTrenchCacheKey } from "../geometry/trenches.js";
import { findSelectedController, findSelectedFitting, findSelectedPipeRun, findSelectedSprinkler, findSelectedValveBox, findSelectedWireRun, getZoneById, hasHydraulics, isProjectReady } from "../state/project-state.js";

const RATE_COLOR_STOPS = [
  { stop: 0, rgb: [24, 76, 107], alpha: 0 },
  { stop: 0.18, rgb: [62, 156, 170], alpha: 0.26 },
  { stop: 0.42, rgb: [72, 177, 106], alpha: 0.4 },
  { stop: 0.72, rgb: [214, 171, 57], alpha: 0.58 },
  { stop: 1, rgb: [176, 74, 42], alpha: 0.74 },
];

const DEPTH_COLOR_STOPS = [
  { stop: 0, rgb: [34, 73, 110], alpha: 0 },
  { stop: 0.24, rgb: [67, 152, 177], alpha: 0.26 },
  { stop: 0.5, rgb: [84, 166, 92], alpha: 0.44 },
  { stop: 0.76, rgb: [217, 180, 64], alpha: 0.62 },
  { stop: 1, rgb: [176, 74, 42], alpha: 0.76 },
];

const ERROR_COLOR_STOPS = [
  { stop: -1, rgb: [38, 95, 160], alpha: 0.74 },
  { stop: -0.45, rgb: [84, 173, 219], alpha: 0.54 },
  { stop: 0, rgb: [255, 250, 240], alpha: 0.06 },
  { stop: 0.45, rgb: [230, 175, 71], alpha: 0.58 },
  { stop: 1, rgb: [176, 74, 42], alpha: 0.8 },
];

export function createRenderer(canvas, store, analyzer) {
  const ctx = canvas.getContext("2d");
  const backgroundImage = new Image();
  let currentBackground = "";
  let hoveredFittingPreview = null;
  let trenchCacheKey = "";
  let trenchCacheValue = [];

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
    const analysis = analyzer?.getSnapshot(state) ?? null;

    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
      const topLeft = worldToScreen({ x: 0, y: 0 }, state.view);
      const width = state.background.width * state.view.zoom;
      const height = state.background.height * state.view.zoom;
      ctx.drawImage(backgroundImage, topLeft.x, topLeft.y, width, height);
    }

    if (state.view.showGrid) {
      drawGrid(state);
    }
    drawRectificationOverlay(state);
    drawCalibrationLine(state);
    drawMeasureLine(state);
    drawAnalysisOverlay(state, analysis);
    if (state.view.showCoverage) {
      drawCoverage(state, analysis);
    }
    if (state.view.showTrench === true) {
      drawTrenchRuns(state);
    }
    if (state.view.showPipe) {
      drawPipeRuns(state);
    }
    if (state.view.showWire !== false) {
      drawWireRuns(state);
    }
    drawSprinklers(state);
    drawValveBoxes(state);
    drawControllers(state);
    drawFittings(state, analysis);
    drawHoveredFittingPreview(state);
    drawPipeDraft(state);
    drawWireDraft(state);
    drawFittingDraft(state);
    drawSelectedHandles(state);
    drawOverlayWarnings(state);
  }

  function syncBackground(src) {
    if (!src || src === currentBackground) {
      return;
    }
    currentBackground = src;
    backgroundImage.src = src;
  }

  function setHoveredFittingPreview(preview) {
    const normalized = normalizeHoveredFittingPreview(preview);
    if (hoveredFittingPreviewsEqual(hoveredFittingPreview, normalized)) {
      return;
    }
    hoveredFittingPreview = normalized;
    render(store.getState());
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

  function drawRectificationOverlay(state) {
    if (!state.ui.rectificationPoints?.length) {
      return;
    }

    const labels = ["TL", "TR", "BR", "BL"];
    const orderedWorldPoints = state.ui.rectificationPoints.length === 4
      ? normalizeRectificationCorners(state.ui.rectificationPoints)
      : state.ui.rectificationPoints;
    const points = orderedWorldPoints.map((point) => worldToScreen(point, state.view));

    ctx.save();
    ctx.strokeStyle = "rgba(33, 102, 172, 0.9)";
    ctx.fillStyle = "rgba(33, 102, 172, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);

    if (points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      if (points.length === 4) {
        ctx.closePath();
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);
    points.forEach((point, index) => {
      drawMarker(point);
      ctx.fillStyle = "rgba(255, 247, 235, 0.98)";
      ctx.fillRect(point.x + 10, point.y - 18, 28, 18);
      ctx.fillStyle = "rgba(33, 102, 172, 0.98)";
      ctx.font = "11px Aptos, Segoe UI, sans-serif";
      ctx.fillText(state.ui.rectificationPoints.length === 4 ? (labels[index] ?? String(index + 1)) : String(index + 1), point.x + 14, point.y - 5);
      ctx.fillStyle = "rgba(33, 102, 172, 0.9)";
    });
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

  function drawAnalysisOverlay(state, analysis) {
    const overlayMode = state.view.analysisOverlayMode ?? "none";
    const grid = analysis?.grid;
    if (overlayMode === "none" || !grid) {
      return;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (overlayMode === "application_rate") {
      drawApplicationRateOverlay(state, grid);
    } else if (overlayMode === "zone_catch_can") {
      const selectedLayer = grid.zoneDepthLayers.find((layer) => layer.zoneId === analysis.selectedZoneId) ?? null;
      if (selectedLayer) {
        drawSequentialGrid(state, grid, selectedLayer.values, Math.max(0.1, analysis.targetDepthInches * 2), DEPTH_COLOR_STOPS);
      }
    } else if (overlayMode === "full_schedule_depth") {
      drawSequentialGrid(state, grid, grid.fullScheduleDepth.values, Math.max(0.1, analysis.targetDepthInches * 2), DEPTH_COLOR_STOPS);
    } else if (overlayMode === "target_error") {
      drawTargetErrorGrid(state, grid);
    }

    ctx.restore();
  }

  function drawApplicationRateOverlay(state, grid) {
    const scaleMode = state.view.heatmapScaleMode ?? "zone";
    if (scaleMode === "zone" && Array.isArray(grid.zoneRateLayers) && grid.zoneRateLayers.length) {
      for (const zoneLayer of grid.zoneRateLayers) {
        if (zoneLayer.maxInHr <= 0) {
          continue;
        }
        drawSequentialGrid(state, grid, zoneLayer.values, zoneLayer.maxInHr, RATE_COLOR_STOPS);
      }
      return;
    }

    const scaleMaxInHr = scaleMode === "project"
      ? Math.max(0.1, grid.applicationRate.maxInHr)
      : Math.max(0.1, Number(state.view.heatmapScaleMaxInHr) || 3);
    drawSequentialGrid(state, grid, grid.applicationRate.values, scaleMaxInHr, RATE_COLOR_STOPS);
  }

  function drawSequentialGrid(state, grid, values, scaleMax, stops) {
    if (!values?.length || scaleMax <= 0) {
      return;
    }
    const cellSize = grid.cellSizeWorldPx * state.view.zoom;
    forEachGridCell(grid, (cellIndex, topLeftX, topLeftY) => {
      const value = values[cellIndex];
      if (!(value > 0)) {
        return;
      }
      ctx.fillStyle = getSequentialColor(value, scaleMax, stops);
      ctx.fillRect(topLeftX, topLeftY, cellSize + 0.75, cellSize + 0.75);
    });
  }

  function drawTargetErrorGrid(state, grid) {
    const cellSize = grid.cellSizeWorldPx * state.view.zoom;
    const maxAbs = 0.5;
    forEachGridCell(grid, (cellIndex, topLeftX, topLeftY) => {
      const totalDepth = grid.fullScheduleDepth.values[cellIndex];
      if (!(totalDepth > 0)) {
        return;
      }
      const value = Math.max(-maxAbs, Math.min(maxAbs, grid.targetError.values[cellIndex]));
      ctx.fillStyle = getDivergingColor(value / maxAbs, ERROR_COLOR_STOPS);
      ctx.fillRect(topLeftX, topLeftY, cellSize + 0.75, cellSize + 0.75);
    });
  }

  function forEachGridCell(grid, callback) {
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const topLeft = worldToScreen(
          {
            x: grid.x + col * grid.cellSizeWorldPx,
            y: grid.y + row * grid.cellSizeWorldPx,
          },
          store.getState().view,
        );
        callback(row * grid.cols + col, topLeft.x, topLeft.y, row, col);
      }
    }
  }

  function drawCoverage(state, analysis) {
    const overlayActive = Boolean(analysis?.grid) && (state.view.analysisOverlayMode ?? "none") !== "none";
    ctx.save();
    state.sprinklers.forEach((sprinkler) => {
      if (sprinkler.hidden) {
        return;
      }
      const zone = getZoneById(state, sprinkler.zoneId);
      const isFocusedOut = state.ui.focusedZoneId && sprinkler.zoneId !== state.ui.focusedZoneId;
      const opacityBase = isFocusedOut ? Math.max(0.04, state.view.coverageOpacity * 0.35) : state.view.coverageOpacity;
      const fillOpacity = overlayActive ? opacityBase * 0.42 : opacityBase;

      if (state.view.zoneViewMode === "zone" && zone) {
        ctx.fillStyle = hexToRgba(zone.color, fillOpacity);
        ctx.strokeStyle = hexToRgba(zone.color, overlayActive ? (isFocusedOut ? 0.24 : 0.72) : (isFocusedOut ? 0.35 : 0.9));
      } else if (state.view.zoneViewMode === "zone" && !zone) {
        ctx.fillStyle = `rgba(112, 112, 112, ${fillOpacity})`;
        ctx.strokeStyle = `rgba(70, 70, 70, ${overlayActive ? (isFocusedOut ? 0.24 : 0.68) : (isFocusedOut ? 0.35 : 0.8)})`;
      } else {
        ctx.fillStyle = `rgba(56, 133, 196, ${fillOpacity})`;
        ctx.strokeStyle = `rgba(30, 82, 121, ${overlayActive ? (isFocusedOut ? 0.22 : 0.72) : (isFocusedOut ? 0.3 : 0.88)})`;
      }
      ctx.lineWidth = overlayActive ? 1.2 : 1.4;
      drawSprinklerShape(state, sprinkler);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawPipeRuns(state) {
    const selectedPipeRun = findSelectedPipeRun(state);
    const trenchPrimary = state.view.showTrench === true;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    state.pipeRuns.forEach((pipeRun) => {
      if (!pipeRun.points?.length || pipeRun.points.length < 2) {
        return;
      }
      const isSelected = selectedPipeRun?.id === pipeRun.id;
      const isFocusedOut = pipeRun.kind === "zone" && state.ui.focusedZoneId && pipeRun.zoneId !== state.ui.focusedZoneId;
      const strokeColor = resolvePipeStrokeColor(state, pipeRun, isSelected, isFocusedOut, trenchPrimary);

      if (!trenchPrimary || isSelected) {
        const underlayAlpha = trenchPrimary ? (isFocusedOut ? 0.12 : 0.18) : (isFocusedOut ? 0.3 : 0.5);
        ctx.strokeStyle = `rgba(255, 247, 235, ${underlayAlpha})`;
        ctx.lineWidth = trenchPrimary ? (isSelected ? 7 : 4.2) : (isSelected ? 8 : 6);
        drawPipePath(ctx, pipeRun.points, state.view);
        ctx.stroke();
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = trenchPrimary ? (isSelected ? 3.6 : 1.65) : (isSelected ? 4.6 : 3.4);
      drawPipePath(ctx, pipeRun.points, state.view);
      ctx.stroke();

      if (state.view.showLabels) {
        const labelPoint = worldToScreen(resolvePipeLabelPoint(pipeRun.points), state.view);
        ctx.fillStyle = isSelected ? "#b65c2a" : strokeColor;
        ctx.font = "12px Aptos, Segoe UI, sans-serif";
        ctx.fillText(pipeRun.label || pipeRun.id, labelPoint.x + 8, labelPoint.y - 8);
      }
    });

    ctx.restore();
  }

  function drawTrenchRuns(state) {
    const trenchSpans = getDerivedTrenchSpans(state);
    if (!trenchSpans.length) {
      return;
    }

    const lineWidth = resolveTrenchLineWidth(state);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    trenchSpans.forEach((span) => {
      if (!span.points?.length || span.points.length < 2) {
        return;
      }
      const isFocusedOut = Boolean(state.ui.focusedZoneId)
        && span.zoneIds.length > 0
        && !span.zoneIds.includes(state.ui.focusedZoneId);
      ctx.save();
      ctx.strokeStyle = resolveTrenchStrokeColor(isFocusedOut);
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([]);
      drawPipePath(ctx, span.points, state.view);
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();
  }

  function drawPipeDraft(state) {
    if (!state.ui.pipeDraft?.points?.length) {
      return;
    }

    const draftPoints = state.ui.pipeDraft.previewPoint
      ? [...state.ui.pipeDraft.points, state.ui.pipeDraft.previewPoint]
      : [...state.ui.pipeDraft.points];
    if (draftPoints.length < 1) {
      return;
    }

    const draftPipeRun = {
      kind: state.ui.pipeDraft.kind,
      zoneId: state.ui.pipeDraft.zoneId,
    };

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = resolvePipeStrokeColor(state, draftPipeRun, true, false);
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    drawPipePath(ctx, draftPoints, state.view);
    ctx.stroke();
    ctx.setLineDash([]);

    draftPoints.forEach((point, index) => {
      const screenPoint = worldToScreen(point, state.view);
      drawPipeHandle(ctx, screenPoint, index === draftPoints.length - 1 ? "#fff7eb" : "#ffffff", "#4f4033", 5);
    });
    ctx.restore();
  }

  function drawWireRuns(state) {
    const selectedWireRun = findSelectedWireRun(state);
    const trenchPrimary = state.view.showTrench === true;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    state.wireRuns.forEach((wireRun) => {
      if (!wireRun.points?.length || wireRun.points.length < 2) {
        return;
      }
      const isSelected = selectedWireRun?.id === wireRun.id;
      const isFocusedOut = Boolean(state.ui.focusedZoneId) && !wireRunTouchesZone(state, wireRun, state.ui.focusedZoneId);
      const strokeColor = resolveWireStrokeColor(state, wireRun, isSelected, isFocusedOut, trenchPrimary);

      if (!trenchPrimary || isSelected) {
        ctx.strokeStyle = `rgba(255, 247, 235, ${trenchPrimary ? (isFocusedOut ? 0.1 : 0.16) : (isFocusedOut ? 0.28 : 0.44)})`;
        ctx.lineWidth = trenchPrimary ? (isSelected ? 6.2 : 3.8) : (isSelected ? 7 : 5);
        drawPipePath(ctx, wireRun.points, state.view);
        ctx.stroke();
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = trenchPrimary ? (isSelected ? 3.1 : 1.4) : (isSelected ? 3.8 : 2.8);
      drawPipePath(ctx, wireRun.points, state.view);
      ctx.stroke();

      if (state.view.showLabels) {
        const labelPoint = worldToScreen(resolvePipeLabelPoint(wireRun.points), state.view);
        ctx.fillStyle = isSelected ? "#b65c2a" : strokeColor;
        ctx.font = "12px Aptos, Segoe UI, sans-serif";
        ctx.fillText(wireRun.label || wireRun.id, labelPoint.x + 8, labelPoint.y + 14);
      }
    });

    ctx.restore();
  }

  function drawWireDraft(state) {
    if (state.view.showWire === false || !state.ui.wireDraft?.points?.length) {
      return;
    }

    const draftPoints = state.ui.wireDraft.previewPoint
      ? [...state.ui.wireDraft.points, state.ui.wireDraft.previewPoint]
      : [...state.ui.wireDraft.points];
    if (draftPoints.length < 1) {
      return;
    }

    const draftWireRun = {
      valveBoxId: state.ui.wireDraft.valveBoxId,
      colorCode: state.ui.wireDraft.colorCode,
    };

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = resolveWireStrokeColor(state, draftWireRun, true, false);
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    drawPipePath(ctx, draftPoints, state.view);
    ctx.stroke();
    ctx.setLineDash([]);

    draftPoints.forEach((point, index) => {
      const screenPoint = worldToScreen(point, state.view);
      drawPipeHandle(ctx, screenPoint, index === draftPoints.length - 1 ? "#fff7eb" : "#ffffff", "#4f4033", 4.5);
    });
    ctx.restore();
  }

  function drawSprinklers(state) {
    const selected = findSelectedSprinkler(state);
    state.sprinklers.forEach((sprinkler) => {
      const center = worldToScreen({ x: sprinkler.x, y: sprinkler.y }, state.view);
      const zone = getZoneById(state, sprinkler.zoneId);
      const headColor = zone ? zone.color : "#2f2418";
      const isFocusedOut = state.ui.focusedZoneId && sprinkler.zoneId !== state.ui.focusedZoneId;
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = selected?.id === sprinkler.id ? "#b65c2a" : headColor;
      if (isFocusedOut) {
        ctx.globalAlpha = 0.35;
      }
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
        if (zone && state.view.showZoneLabels) {
          ctx.fillStyle = headColor;
          ctx.font = "11px Aptos, Segoe UI, sans-serif";
          ctx.fillText(zone.name, center.x + 10, center.y + 4);
        }
      }
      ctx.restore();
    });
  }

  function drawValveBoxes(state) {
    const selectedValveBox = findSelectedValveBox(state);
    state.valveBoxes.forEach((valveBox) => {
      const center = worldToScreen({ x: valveBox.x, y: valveBox.y }, state.view);
      const linkedZones = state.zones.filter((zone) => zone.valveBoxId === valveBox.id);
      const primaryZone = linkedZones[0] ?? null;
      const isSelected = selectedValveBox?.id === valveBox.id;
      const isFocusedOut = state.ui.focusedZoneId && !linkedZones.some((zone) => zone.id === state.ui.focusedZoneId);
      ctx.save();
      if (isFocusedOut) {
        ctx.globalAlpha = 0.35;
      }
      drawValveBoxSymbol(center, primaryZone?.color ?? "#7d6957", isSelected);
      if (state.view.showLabels) {
        ctx.fillStyle = "#2f2418";
        ctx.font = "12px Aptos, Segoe UI, sans-serif";
        ctx.fillText(valveBox.label || valveBox.id, center.x + 16, center.y - 2);
        if (linkedZones.length && state.view.showZoneLabels) {
          const zoneText = linkedZones.length === 1 ? linkedZones[0].name : `${linkedZones.length} zones`;
          ctx.fillStyle = primaryZone?.color ?? "#7d6957";
          ctx.font = "11px Aptos, Segoe UI, sans-serif";
          ctx.fillText(zoneText, center.x + 16, center.y + 12);
        }
      }
      ctx.restore();
    });
  }

  function drawControllers(state) {
    const selectedController = findSelectedController(state);
    state.controllers.forEach((controller) => {
      const center = worldToScreen({ x: controller.x, y: controller.y }, state.view);
      const linkedValveBoxes = getConnectedValveBoxesForController(state, controller.id);
      const linkedWireRuns = state.wireRuns.filter((wireRun) => wireRun.controllerId === controller.id);
      const isSelected = selectedController?.id === controller.id;
      const isFocusedOut = Boolean(state.ui.focusedZoneId) && !controllerTouchesZone(state, controller.id, state.ui.focusedZoneId);
      ctx.save();
      if (isFocusedOut) {
        ctx.globalAlpha = 0.35;
      }
      drawControllerSymbol(center, isSelected);
      if (state.view.showLabels) {
        ctx.fillStyle = "#2f2418";
        ctx.font = "12px Aptos, Segoe UI, sans-serif";
        ctx.fillText(controller.label || controller.id, center.x + 18, center.y - 2);
        if ((linkedValveBoxes.length || linkedWireRuns.length) && state.view.showZoneLabels) {
          const connectionText = linkedValveBoxes.length === 1
            ? (linkedValveBoxes[0].label || "Valve box")
            : linkedValveBoxes.length > 1
              ? `${linkedValveBoxes.length} valve boxes`
              : `${linkedWireRuns.length} wire run${linkedWireRuns.length === 1 ? "" : "s"}`;
          ctx.fillStyle = "#7d6957";
          ctx.font = "11px Aptos, Segoe UI, sans-serif";
          ctx.fillText(connectionText, center.x + 18, center.y + 12);
        }
      }
      ctx.restore();
    });
  }

  function drawFittings(state, analysis) {
    if (state.view.showFittings === false) {
      return;
    }
    const selectedFitting = findSelectedFitting(state);
    state.fittings.forEach((fitting) => {
      if ((fitting.status ?? "placed") !== "placed") {
        return;
      }
      const worldPoint = resolveFittingWorldPoint(state, fitting);
      const screenPoint = worldToScreen(worldPoint, state.view);
      const zoneColor = getZoneById(state, fitting.zoneId)?.color ?? "#7d6957";
      const isSelected = selectedFitting?.id === fitting.id;
      const isFocusedOut = state.ui.focusedZoneId && fitting.zoneId && fitting.zoneId !== state.ui.focusedZoneId;

      ctx.save();
      if (isFocusedOut) {
        ctx.globalAlpha = 0.35;
      }
      drawFittingGlyph(screenPoint, zoneColor, fitting.type, isSelected, false);
      if (state.view.showLabels && isSelected) {
        const sizeSpec = resolvePlacedFittingSizeSpec(state, fitting, analysis);
        ctx.fillStyle = zoneColor;
        ctx.font = "11px Aptos, Segoe UI, sans-serif";
        ctx.fillText(sizeSpec || getFittingTypeMeta(fitting.type).label, screenPoint.x + 12, screenPoint.y - 12);
      }
      ctx.restore();
    });
  }

  function drawHoveredFittingPreview(state) {
    if (state.ui.fittingDraft?.preview || !hoveredFittingPreview) {
      return;
    }

    const preview = hoveredFittingPreview;
    const screenPoint = worldToScreen({ x: preview.x, y: preview.y }, state.view);
    const zoneColor = getZoneById(state, preview.zoneId)?.color ?? "#b65c2a";

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(screenPoint.x, screenPoint.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.94;
    drawFittingGlyph(screenPoint, zoneColor, preview.type, true, true);
    if (state.view.showLabels) {
      ctx.fillStyle = zoneColor;
      ctx.font = "11px Aptos, Segoe UI, sans-serif";
      ctx.fillText(preview.sizeSpec || preview.label || getFittingTypeMeta(preview.type).label, screenPoint.x + 12, screenPoint.y - 12);
    }
    ctx.restore();
  }

  function drawFittingDraft(state) {
    const preview = state.ui.fittingDraft?.preview ?? null;
    if (!preview) {
      return;
    }

    const screenPoint = worldToScreen({ x: preview.x, y: preview.y }, state.view);
    const zoneColor = getZoneById(state, preview.zoneId)?.color ?? "#b65c2a";

    ctx.save();
    ctx.globalAlpha = preview.valid ? 0.88 : 0.52;
    drawFittingGlyph(screenPoint, zoneColor, preview.type, false, true);
    ctx.fillStyle = "rgba(47, 36, 24, 0.88)";
    ctx.font = "11px Aptos, Segoe UI, sans-serif";
    ctx.fillText(preview.sizeSpec || preview.label || getFittingTypeMeta(preview.type).label, screenPoint.x + 12, screenPoint.y - 12);
    ctx.restore();
  }

  function drawValveBoxSymbol(center, accentColor, isSelected) {
    const width = 24;
    const height = 18;
    const left = center.x - width / 2;
    const top = center.y - height / 2;
    ctx.fillStyle = "#fff7eb";
    ctx.strokeStyle = isSelected ? "#b65c2a" : "#4f4033";
    ctx.lineWidth = isSelected ? 2.6 : 2;
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);

    ctx.fillStyle = accentColor;
    ctx.fillRect(left + 2, top + 2, width - 4, 4);

    ctx.fillStyle = "#4f4033";
    ctx.font = "bold 8px Aptos, Segoe UI, sans-serif";
    ctx.fillText("VB", left + 5, top + 13);
  }

  function drawControllerSymbol(center, isSelected) {
    const width = 26;
    const height = 22;
    const left = center.x - width / 2;
    const top = center.y - height / 2;
    ctx.fillStyle = "#fff7eb";
    ctx.strokeStyle = isSelected ? "#b65c2a" : "#4f4033";
    ctx.lineWidth = isSelected ? 2.6 : 2;
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);

    ctx.fillStyle = "#4f4033";
    ctx.fillRect(left + 5, top + 4, width - 10, 2);
    ctx.fillRect(left + 5, top + 8, width - 10, 2);
    ctx.fillRect(left + 7, top + 13, 3, 3);
    ctx.fillRect(left + 12, top + 13, 3, 3);
    ctx.fillRect(left + 17, top + 13, 3, 3);
  }

  function drawFittingGlyph(center, accentColor, type, isSelected, isDraft) {
    const radius = isSelected ? 10 : 8;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(255, 247, 235, 0.94)";
    ctx.strokeStyle = isSelected ? "#b65c2a" : accentColor;
    ctx.lineWidth = isSelected ? 2.4 : 2;
    ctx.beginPath();
    ctx.rect(-radius, -radius, radius * 2, radius * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = isDraft ? 1.8 : 2;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - 8);
    ctx.lineTo(center.x, center.y + 5);
    if (type === "head_takeoff") {
      ctx.moveTo(center.x - 5.5, center.y - 4);
      ctx.lineTo(center.x + 5.5, center.y - 4);
    } else {
      ctx.moveTo(center.x - 5.5, center.y);
      ctx.lineTo(center.x + 5.5, center.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function resolveFittingWorldPoint(state, fitting) {
    if (fitting.anchor?.kind === "sprinkler" && fitting.anchor.sprinklerId) {
      const sprinkler = state.sprinklers.find((item) => item.id === fitting.anchor.sprinklerId) ?? null;
      if (sprinkler) {
        return { x: sprinkler.x, y: sprinkler.y };
      }
    }

    if (fitting.anchor?.kind === "pipe_vertex" && fitting.anchor.pipeRunId && Number.isInteger(fitting.anchor.vertexIndex)) {
      const pipeRun = state.pipeRuns.find((item) => item.id === fitting.anchor.pipeRunId) ?? null;
      const point = pipeRun?.points?.[fitting.anchor.vertexIndex] ?? null;
      if (point) {
        return { x: point.x, y: point.y };
      }
    }

    if (fitting.anchor?.kind === "pipe_segment" && fitting.anchor.pipeRunId && Number.isInteger(fitting.anchor.segmentIndex)) {
      const pipeRun = state.pipeRuns.find((item) => item.id === fitting.anchor.pipeRunId) ?? null;
      const start = pipeRun?.points?.[fitting.anchor.segmentIndex] ?? null;
      const end = pipeRun?.points?.[fitting.anchor.segmentIndex + 1] ?? null;
      if (start && end) {
        const t = Number.isFinite(fitting.anchor.t) ? fitting.anchor.t : 0.5;
        return {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };
      }
    }

    if (fitting.anchor?.kind === "valve_box" && fitting.anchor.valveBoxId) {
      const valveBox = state.valveBoxes.find((item) => item.id === fitting.anchor.valveBoxId) ?? null;
      if (valveBox) {
        return { x: valveBox.x, y: valveBox.y };
      }
    }

    return {
      x: fitting.x ?? 0,
      y: fitting.y ?? 0,
    };
  }

  function drawSelectedHandles(state) {
    const selectedPipeRun = findSelectedPipeRun(state);
    if (selectedPipeRun && state.view.showPipe) {
      drawSelectedPipeHandles(state, selectedPipeRun);
      return;
    }

    const selected = findSelectedSprinkler(state);
    if (!selected || !state.scale.pixelsPerUnit) {
      return;
    }

    if (isStripCoverage(selected)) {
      drawSelectedStripHandles(state, selected);
      return;
    }

    if (selected.pattern !== "arc" || selected.sweepDeg >= 360) {
      return;
    }

    const handles = getArcHandlePositions(state, selected);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(handles.center.x, handles.center.y);
    ctx.lineTo(handles.start.x, handles.start.y);
    ctx.moveTo(handles.center.x, handles.center.y);
    ctx.lineTo(handles.end.x, handles.end.y);
    ctx.stroke();
    drawHandle(handles.start, "#d55d3f");
    drawHandle(handles.end, "#f1a22c");
    drawRadiusHandle(handles.mid, handles.midArrowTip, handles.midArrowBase, "#4f5bff");
    ctx.restore();
  }

  function drawSelectedPipeHandles(state, selectedPipeRun) {
    if (!selectedPipeRun.points?.length || selectedPipeRun.points.length < 2) {
      return;
    }

    const selectedVertexIndex = Number.isInteger(state.ui.selectedPipeVertexIndex)
      ? state.ui.selectedPipeVertexIndex
      : null;
    const midpoints = buildPipeMidpoints(selectedPipeRun.points);

    ctx.save();
    midpoints.forEach((midpointEntry) => {
      const screenPoint = worldToScreen(midpointEntry.point, state.view);
      drawPipeHandle(ctx, screenPoint, "#fff7eb", "#b65c2a", 4.5);
    });
    selectedPipeRun.points.forEach((point, index) => {
      const screenPoint = worldToScreen(point, state.view);
      drawPipeHandle(
        ctx,
        screenPoint,
        selectedVertexIndex === index ? "#b65c2a" : "#fff7eb",
        selectedVertexIndex === index ? "#ffffff" : "#4f4033",
        6,
      );
    });
    ctx.restore();
  }

  function drawSelectedStripHandles(state, selected) {
    const handles = buildStripHandlePositions(state, selected);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.moveTo(handles.center.x, handles.center.y);
    ctx.lineTo(handles.primary.x, handles.primary.y);
    ctx.moveTo(handles.center.x, handles.center.y);
    ctx.lineTo(handles.secondary.x, handles.secondary.y);
    ctx.stroke();
    drawHandle(handles.primary, "#d55d3f");
    drawHandle(handles.secondary, "#4f5bff");
    ctx.restore();
  }

  function drawSprinklerShape(state, sprinkler) {
    ctx.beginPath();
    if (isStripCoverage(sprinkler) && state.scale.pixelsPerUnit) {
      const points = buildStripFootprintWorldPoints(sprinkler, state.scale.pixelsPerUnit).map((point) =>
        worldToScreen(point, state.view),
      );
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      return;
    }

    const center = worldToScreen({ x: sprinkler.x, y: sprinkler.y }, state.view);
    const radius = toPixels(sprinkler.radius, state.scale) * state.view.zoom;
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

  function drawHandle(point, color) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawRadiusHandle(point, arrowTip, arrowBase, color) {
    const angle = Math.atan2(arrowTip.y - arrowBase.y, arrowTip.x - arrowBase.x);
    const unitX = Math.cos(angle);
    const unitY = Math.sin(angle);
    const perpX = -unitY;
    const perpY = unitX;
    const triangleLength = 8;
    const triangleWidth = 5;
    const gap = 1.5;

    const outwardTip = {
      x: point.x + unitX * (gap + triangleLength),
      y: point.y + unitY * (gap + triangleLength),
    };
    const inwardTip = {
      x: point.x - unitX * (gap + triangleLength),
      y: point.y - unitY * (gap + triangleLength),
    };

    const outwardBaseCenter = {
      x: point.x + unitX * gap,
      y: point.y + unitY * gap,
    };
    const inwardBaseCenter = {
      x: point.x - unitX * gap,
      y: point.y - unitY * gap,
    };

    ctx.fillStyle = color;
    fillTriangle(
      outwardTip,
      {
        x: outwardBaseCenter.x + perpX * triangleWidth,
        y: outwardBaseCenter.y + perpY * triangleWidth,
      },
      {
        x: outwardBaseCenter.x - perpX * triangleWidth,
        y: outwardBaseCenter.y - perpY * triangleWidth,
      },
    );
    fillTriangle(
      inwardTip,
      {
        x: inwardBaseCenter.x + perpX * triangleWidth,
        y: inwardBaseCenter.y + perpY * triangleWidth,
      },
      {
        x: inwardBaseCenter.x - perpX * triangleWidth,
        y: inwardBaseCenter.y - perpY * triangleWidth,
      },
    );

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.moveTo(outwardTip.x + unitX, outwardTip.y + unitY);
    ctx.lineTo(inwardTip.x - unitX, inwardTip.y - unitY);
    ctx.stroke();
  }

  function fillTriangle(a, b, c) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
  }

  function getHitPipeRun(worldPoint) {
    const state = store.getState();
    if (!state.view.showPipe) {
      return null;
    }
    const screenPoint = worldToScreen(worldPoint, state.view);

    return [...state.pipeRuns].reverse().find((pipeRun) =>
      pipeRun.points?.some((point, index) => {
        if (index === 0) {
          return false;
        }
        const start = worldToScreen(pipeRun.points[index - 1], state.view);
        const end = worldToScreen(point, state.view);
        return distancePointToSegmentSquared(screenPoint, start, end) <= 64;
      }),
    ) || null;
  }

  function getHitWireRun(worldPoint) {
    const state = store.getState();
    if (state.view.showWire === false) {
      return null;
    }
    const screenPoint = worldToScreen(worldPoint, state.view);

    return [...state.wireRuns].reverse().find((wireRun) =>
      wireRun.points?.some((point, index) => {
        if (index === 0) {
          return false;
        }
        const start = worldToScreen(wireRun.points[index - 1], state.view);
        const end = worldToScreen(point, state.view);
        return distancePointToSegmentSquared(screenPoint, start, end) <= 49;
      }),
    ) || null;
  }

  function getPipeVertexHandleHit(worldPoint) {
    const state = store.getState();
    const selectedPipeRun = findSelectedPipeRun(state);
    if (!selectedPipeRun || !state.view.showPipe) {
      return null;
    }

    const screenPoint = worldToScreen(worldPoint, state.view);
    return selectedPipeRun.points
      .map((point, index) => ({
        id: selectedPipeRun.id,
        index,
        point,
        distance: distanceSquared(screenPoint, worldToScreen(point, state.view)),
      }))
      .find((entry) => entry.distance <= 100) || null;
  }

  function getPipeMidpointHandleHit(worldPoint) {
    const state = store.getState();
    const selectedPipeRun = findSelectedPipeRun(state);
    if (!selectedPipeRun || !state.view.showPipe) {
      return null;
    }

    const screenPoint = worldToScreen(worldPoint, state.view);
    return buildPipeMidpoints(selectedPipeRun.points)
      .map((entry) => ({
        id: selectedPipeRun.id,
        index: entry.index,
        point: entry.point,
        distance: distanceSquared(screenPoint, worldToScreen(entry.point, state.view)),
      }))
      .find((entry) => entry.distance <= 81) || null;
  }

  function getHitSprinkler(worldPoint) {
    const state = store.getState();
    return [...state.sprinklers].reverse().find((sprinkler) => {
      const hitRadius = Math.max(8 / state.view.zoom, 4 / Math.max(state.scale.pixelsPerUnit || 1, 1));
      return pointInSprinkler(worldPoint, { ...sprinkler, pattern: "full", sweepDeg: 360, radius: hitRadius });
    }) || null;
  }

  function getHitValveBox(worldPoint) {
    const state = store.getState();
    const screenPoint = worldToScreen(worldPoint, state.view);
    return [...state.valveBoxes].reverse().find((valveBox) => {
      const center = worldToScreen({ x: valveBox.x, y: valveBox.y }, state.view);
      return Math.abs(screenPoint.x - center.x) <= 14 && Math.abs(screenPoint.y - center.y) <= 12;
    }) || null;
  }

  function getHitController(worldPoint) {
    const state = store.getState();
    const screenPoint = worldToScreen(worldPoint, state.view);
    return [...state.controllers].reverse().find((controller) => {
      const center = worldToScreen({ x: controller.x, y: controller.y }, state.view);
      return Math.abs(screenPoint.x - center.x) <= 15 && Math.abs(screenPoint.y - center.y) <= 13;
    }) || null;
  }

  function getHitFitting(worldPoint) {
    const state = store.getState();
    if (state.view.showFittings === false) {
      return null;
    }
    const screenPoint = worldToScreen(worldPoint, state.view);
    return [...state.fittings].reverse().find((fitting) => {
      if ((fitting.status ?? "placed") !== "placed") {
        return false;
      }
      const center = worldToScreen(resolveFittingWorldPoint(state, fitting), state.view);
      return distanceSquared(screenPoint, center) <= 144;
    }) || null;
  }

  function getArcHandleHit(worldPoint) {
    const state = store.getState();
    const selected = findSelectedSprinkler(state);
    if (!selected || isStripCoverage(selected) || selected.pattern !== "arc" || selected.sweepDeg >= 360 || !state.scale.pixelsPerUnit) {
      return null;
    }

    const handles = getArcHandlePositions(state, selected);
    const worldHitRadius = Math.max(10 / state.view.zoom, 6 / state.scale.pixelsPerUnit);
    if (distanceSquared(worldPoint, handles.startWorld) <= worldHitRadius * worldHitRadius) {
      return { id: selected.id, edge: "start" };
    }
    if (distanceSquared(worldPoint, handles.endWorld) <= worldHitRadius * worldHitRadius) {
      return { id: selected.id, edge: "end" };
    }
    return null;
  }

  function getRadiusHandleHit(worldPoint) {
    const state = store.getState();
    const selected = findSelectedSprinkler(state);
    if (!selected || isStripCoverage(selected) || selected.pattern !== "arc" || selected.sweepDeg >= 360 || !state.scale.pixelsPerUnit) {
      return null;
    }

    const handles = getArcHandlePositions(state, selected);
    const worldHitRadius = Math.max(10 / state.view.zoom, 6 / state.scale.pixelsPerUnit);
    if (distanceSquared(worldPoint, handles.midWorld) <= worldHitRadius * worldHitRadius) {
      return { id: selected.id, edge: "radius" };
    }
    return null;
  }

  function getStripHandleHit(worldPoint) {
    const state = store.getState();
    const selected = findSelectedSprinkler(state);
    if (!selected || !isStripCoverage(selected) || !state.scale.pixelsPerUnit) {
      return null;
    }

    const handles = buildStripHandlePositions(state, selected);
    const worldHitRadius = Math.max(10 / state.view.zoom, 6 / state.scale.pixelsPerUnit);
    if (distanceSquared(worldPoint, handles.primaryWorld) <= worldHitRadius * worldHitRadius) {
      return { id: selected.id, edge: "primary" };
    }
    if (distanceSquared(worldPoint, handles.secondaryWorld) <= worldHitRadius * worldHitRadius) {
      return { id: selected.id, edge: "secondary" };
    }
    return null;
  }

  function buildExportSummary() {
    const state = store.getState();
    const totalPipeLength = state.scale.pixelsPerUnit
      ? state.pipeRuns.reduce((sum, pipeRun) => sum + calculatePipeLengthUnits(pipeRun.points, state.scale.pixelsPerUnit), 0)
      : 0;
    const totalWireLength = state.scale.pixelsPerUnit
      ? state.wireRuns.reduce((sum, wireRun) => sum + calculatePipeLengthUnits(wireRun.points, state.scale.pixelsPerUnit), 0)
      : 0;
    return {
      sprinklerCount: state.sprinklers.length,
      valveBoxCount: state.valveBoxes.length,
      controllerCount: state.controllers.length,
      pipeRunCount: state.pipeRuns.length,
      wireRunCount: state.wireRuns.length,
      totalPipeLength,
      totalWireLength,
      meanRadius: state.sprinklers.length
        ? state.sprinklers.reduce((sum, sprinkler) =>
          sum + (isStripCoverage(sprinkler) ? Math.max(sprinkler.stripLength ?? 0, sprinkler.stripWidth ?? 0) : sprinkler.radius), 0,
        ) / state.sprinklers.length
        : 0,
      backgroundSize:
        state.scale.calibrated && state.background.width && state.background.height
          ? `${(state.background.width / state.scale.pixelsPerUnit).toFixed(1)} x ${(state.background.height / state.scale.pixelsPerUnit).toFixed(1)} ${state.scale.units}`
          : "--",
    };
  }

  function getDerivedTrenchSpans(state) {
    const nextKey = buildTrenchCacheKey(state);
    if (nextKey === trenchCacheKey) {
      return trenchCacheValue;
    }
    trenchCacheKey = nextKey;
    trenchCacheValue = buildDerivedTrenchSpans(state);
    return trenchCacheValue;
  }

  return {
    resize,
    render,
    setHoveredFittingPreview,
    getHitPipeRun,
    getHitWireRun,
    getPipeVertexHandleHit,
    getPipeMidpointHandleHit,
    getHitSprinkler,
    getHitValveBox,
    getHitController,
    getHitFitting,
    getArcHandleHit,
    getRadiusHandleHit,
    getStripHandleHit,
    buildExportSummary,
  };
}

function normalizeHoveredFittingPreview(preview) {
  const x = Number(preview?.x);
  const y = Number(preview?.y);
  if (!(preview?.type && Number.isFinite(x) && Number.isFinite(y))) {
    return null;
  }

  return {
    type: preview.type,
    x,
    y,
    zoneId: preview.zoneId ?? null,
    sizeSpec: preview.sizeSpec ?? null,
    label: preview.label ?? "",
  };
}

function hoveredFittingPreviewsEqual(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function buildStripHandlePositions(state, sprinkler) {
  const worldHandles = buildStripHandleWorldPoints(sprinkler, state.scale.pixelsPerUnit);
  return {
    center: worldToScreen({ x: sprinkler.x, y: sprinkler.y }, state.view),
    primary: worldToScreen(worldHandles.primaryWorld, state.view),
    secondary: worldToScreen(worldHandles.secondaryWorld, state.view),
    primaryWorld: worldHandles.primaryWorld,
    secondaryWorld: worldHandles.secondaryWorld,
  };
}

function drawPipePath(ctx, points, view) {
  if (!points?.length) {
    return;
  }
  const first = worldToScreen(points[0], view);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  points.slice(1).forEach((point) => {
    const screenPoint = worldToScreen(point, view);
    ctx.lineTo(screenPoint.x, screenPoint.y);
  });
}

function drawPipeHandle(ctx, point, fillColor, strokeColor, radius) {
  ctx.beginPath();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function resolveTrenchLineWidth(state) {
  return state.view.showTrench === true ? 4.8 : 0;
}

function resolveTrenchStrokeColor(isFocusedOut) {
  return isFocusedOut ? "rgba(44, 91, 84, 0.34)" : "rgba(44, 91, 84, 0.98)";
}

function resolvePipeStrokeColor(state, pipeRun, isSelected, isFocusedOut, trenchPrimary = false) {
  if (pipeRun.kind === "main") {
    if (isSelected) {
      return "#b65c2a";
    }
    return `rgba(79, 64, 51, ${trenchPrimary ? (isFocusedOut ? 0.16 : 0.34) : (isFocusedOut ? 0.45 : 0.96)})`;
  }
  const zoneColor = getZoneById(state, pipeRun.zoneId)?.color ?? "#6f6a63";
  return hexToRgba(zoneColor, trenchPrimary
    ? (isSelected ? 0.94 : (isFocusedOut ? 0.14 : 0.32))
    : (isFocusedOut ? 0.36 : (isSelected ? 0.98 : 0.9)));
}

function resolveWireStrokeColor(state, wireRun, isSelected, isFocusedOut, trenchPrimary = false) {
  const accent = resolveWireAccentColor(state, wireRun);
  return hexToRgba(accent, trenchPrimary
    ? (isSelected ? 0.94 : (isFocusedOut ? 0.14 : 0.28))
    : (isFocusedOut ? 0.34 : (isSelected ? 0.98 : 0.9)));
}

function resolveWireAccentColor(state, wireRun) {
  const token = String(wireRun?.colorCode ?? "")
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{3,8}$/i.test(token)) {
    return token;
  }

  const namedColors = {
    white: "#d7d0c3",
    red: "#c9483d",
    blue: "#3876b4",
    yellow: "#d1a12f",
    green: "#4d8b31",
    orange: "#d18e2f",
    black: "#4f4033",
    brown: "#7d6957",
    purple: "#8f5bb6",
  };
  if (namedColors[token]) {
    return namedColors[token];
  }

  const primaryZone = getPrimaryValveBoxZone(state, wireRun?.valveBoxId ?? null);
  if (primaryZone?.color) {
    return primaryZone.color;
  }
  return "#7d6957";
}

function wireRunTouchesZone(state, wireRun, zoneId) {
  if (!wireRun?.valveBoxId || !zoneId) {
    return false;
  }
  return getZonesForValveBox(state, wireRun.valveBoxId).some((zone) => zone.id === zoneId);
}

function controllerTouchesZone(state, controllerId, zoneId) {
  if (!controllerId || !zoneId) {
    return false;
  }
  return getConnectedValveBoxesForController(state, controllerId)
    .some((valveBox) => getZonesForValveBox(state, valveBox.id).some((zone) => zone.id === zoneId));
}

function getConnectedValveBoxesForController(state, controllerId) {
  if (!controllerId) {
    return [];
  }
  const valveBoxesById = new Map((state.valveBoxes ?? []).map((valveBox) => [valveBox.id, valveBox]));
  const connected = new Map();
  (state.wireRuns ?? []).forEach((wireRun) => {
    if (wireRun.controllerId !== controllerId || !wireRun.valveBoxId) {
      return;
    }
    const valveBox = valveBoxesById.get(wireRun.valveBoxId) ?? null;
    if (valveBox) {
      connected.set(valveBox.id, valveBox);
    }
  });
  return [...connected.values()];
}

function getPrimaryValveBoxZone(state, valveBoxId) {
  return getZonesForValveBox(state, valveBoxId)[0] ?? null;
}

function getZonesForValveBox(state, valveBoxId) {
  if (!valveBoxId) {
    return [];
  }
  return (state.zones ?? []).filter((zone) => zone.valveBoxId === valveBoxId);
}

function resolvePipeLabelPoint(points) {
  const midIndex = Math.floor((points.length - 1) / 2);
  return midIndex < points.length - 1
    ? {
      x: (points[midIndex].x + points[midIndex + 1].x) / 2,
      y: (points[midIndex].y + points[midIndex + 1].y) / 2,
    }
    : points[midIndex];
}

function getSequentialColor(value, maxValue, stops) {
  const ratio = maxValue > 0 ? Math.min(1, value / maxValue) : 0;
  return interpolateStops(ratio, stops);
}

function getDivergingColor(normalizedValue, stops) {
  const value = Math.max(-1, Math.min(1, normalizedValue));
  return interpolateStops(value, stops);
}

function interpolateStops(value, stops) {
  const upperIndex = stops.findIndex((stop) => value <= stop.stop);
  if (upperIndex <= 0) {
    return formatRgba(stops[0]);
  }
  if (upperIndex === -1) {
    return formatRgba(stops[stops.length - 1]);
  }

  const upper = stops[upperIndex];
  const lower = stops[upperIndex - 1];
  const span = Math.max(0.0001, upper.stop - lower.stop);
  const weight = (value - lower.stop) / span;
  const rgb = lower.rgb.map((channel, index) =>
    Math.round(channel + (upper.rgb[index] - channel) * weight),
  );
  const alpha = lower.alpha + (upper.alpha - lower.alpha) * weight;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}

function formatRgba(stop) {
  return `rgba(${stop.rgb[0]}, ${stop.rgb[1]}, ${stop.rgb[2]}, ${stop.alpha.toFixed(3)})`;
}

function getArcHandlePositions(state, sprinkler) {
  const radiusWorld = sprinkler.radius * state.scale.pixelsPerUnit;
  const centerWorld = { x: sprinkler.x, y: sprinkler.y };
  const startWorld = pointFromAngle(centerWorld, radiusWorld, sprinkler.startDeg + sprinkler.rotationDeg);
  const endWorld = pointFromAngle(centerWorld, radiusWorld, sprinkler.startDeg + sprinkler.rotationDeg + sprinkler.sweepDeg);
  const midAngle = sprinkler.startDeg + sprinkler.rotationDeg + sprinkler.sweepDeg / 2;
  const midWorld = pointFromAngle(centerWorld, radiusWorld, midAngle);
  const midArrowBaseWorld = pointFromAngle(centerWorld, Math.max(radiusWorld - Math.max(16 / state.view.zoom, 10 / state.scale.pixelsPerUnit), 0), midAngle);
  const midArrowTipWorld = pointFromAngle(centerWorld, radiusWorld + Math.max(16 / state.view.zoom, 10 / state.scale.pixelsPerUnit), midAngle);
  return {
    center: worldToScreen(centerWorld, state.view),
    start: worldToScreen(startWorld, state.view),
    end: worldToScreen(endWorld, state.view),
    mid: worldToScreen(midWorld, state.view),
    midArrowBase: worldToScreen(midArrowBaseWorld, state.view),
    midArrowTip: worldToScreen(midArrowTipWorld, state.view),
    startWorld,
    endWorld,
    midWorld,
  };
}

function distanceSquared(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function hexToRgba(hex, alpha) {
  const safe = hex.replace("#", "");
  const normalized = safe.length === 3
    ? safe.split("").map((value) => value + value).join("")
    : safe;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
