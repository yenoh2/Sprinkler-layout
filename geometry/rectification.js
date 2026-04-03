import { distanceBetween } from "./arcs.js";

const MAX_OUTPUT_DIMENSION = 4096;

export function buildRectificationPlan(points, referenceWidth, referenceHeight, sourceWidth = 0, sourceHeight = 0) {
  const sourceCorners = normalizeQuadrilateral(points);
  if (!sourceCorners || !isConvexQuadrilateral(sourceCorners)) {
    return null;
  }

  const normalizedReferenceWidth = sanitizeReferenceDimension(referenceWidth, 10);
  const normalizedReferenceHeight = sanitizeReferenceDimension(referenceHeight, 10);
  const { width: referencePixelWidth, height: referencePixelHeight } = computeRectifiedReferenceSize(
    sourceCorners,
    normalizedReferenceWidth,
    normalizedReferenceHeight,
  );
  const baseTargetCorners = [
    { x: 0, y: 0 },
    { x: referencePixelWidth, y: 0 },
    { x: referencePixelWidth, y: referencePixelHeight },
    { x: 0, y: referencePixelHeight },
  ];
  const baseMatrix = solveHomography(sourceCorners, baseTargetCorners);
  if (!baseMatrix) {
    return null;
  }

  const sourceImageCorners = buildSourceImageCorners(sourceWidth, sourceHeight);
  const transformedImageCorners = sourceImageCorners
    ? sourceImageCorners.map((point) => applyHomography(point, baseMatrix))
    : baseTargetCorners.map((point) => ({ ...point }));
  if (transformedImageCorners.some((point) => !point)) {
    return null;
  }

  const imageBounds = getBounds(transformedImageCorners);
  const outputScale = imageBounds.maxDimension > MAX_OUTPUT_DIMENSION
    ? MAX_OUTPUT_DIMENSION / imageBounds.maxDimension
    : 1;
  const normalizationMatrix = multiplyMatrices(
    scaleMatrix(outputScale),
    translationMatrix(-imageBounds.minX, -imageBounds.minY),
  );
  const matrix = multiplyMatrices(normalizationMatrix, baseMatrix);
  const inverseMatrix = invertHomography(matrix);
  if (!inverseMatrix) {
    return null;
  }

  const targetCorners = baseTargetCorners.map((point) => applyHomography(point, normalizationMatrix));
  const outputWidth = Math.max(1, Math.ceil(imageBounds.width * outputScale));
  const outputHeight = Math.max(1, Math.ceil(imageBounds.height * outputScale));

  return {
    sourceCorners,
    sourceImageCorners: sourceImageCorners ?? [],
    targetCorners,
    referenceWidth: normalizedReferenceWidth,
    referenceHeight: normalizedReferenceHeight,
    outputWidth,
    outputHeight,
    imageBounds: {
      minX: imageBounds.minX,
      minY: imageBounds.minY,
      maxX: imageBounds.maxX,
      maxY: imageBounds.maxY,
      width: imageBounds.width,
      height: imageBounds.height,
      outputScale,
    },
    matrix,
    inverseMatrix,
  };
}

export async function rectifyImageDataUrl(src, points, referenceWidth, referenceHeight) {
  if (!src) {
    return null;
  }

  const image = await loadImage(src);
  const plan = buildRectificationPlan(points, referenceWidth, referenceHeight, image.naturalWidth, image.naturalHeight);
  if (!plan) {
    return null;
  }
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0);
  const sourceImageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = plan.outputWidth;
  outputCanvas.height = plan.outputHeight;
  const outputContext = outputCanvas.getContext("2d");
  const outputImageData = outputContext.createImageData(outputCanvas.width, outputCanvas.height);

  const sourcePixels = sourceImageData.data;
  const outputPixels = outputImageData.data;
  let offset = 0;
  for (let y = 0; y < outputCanvas.height; y += 1) {
    for (let x = 0; x < outputCanvas.width; x += 1) {
      const sourcePoint = applyHomography({ x: x + 0.5, y: y + 0.5 }, plan.inverseMatrix);
      if (
        !sourcePoint
        || sourcePoint.x < 0
        || sourcePoint.y < 0
        || sourcePoint.x > sourceCanvas.width - 1
        || sourcePoint.y > sourceCanvas.height - 1
      ) {
        outputPixels[offset + 3] = 0;
        offset += 4;
        continue;
      }
      sampleBilinear(sourcePixels, sourceCanvas.width, sourceCanvas.height, sourcePoint.x, sourcePoint.y, outputPixels, offset);
      offset += 4;
    }
  }

  outputContext.putImageData(outputImageData, 0, 0);
  return {
    src: outputCanvas.toDataURL("image/png"),
    width: outputCanvas.width,
    height: outputCanvas.height,
    plan,
  };
}

export function applyHomography(point, matrix) {
  if (!point || !matrix) {
    return null;
  }

  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const denominator = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.0000001) {
    return null;
  }

  return {
    x: (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]) / denominator,
    y: (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]) / denominator,
  };
}

export function multiplyMatrices(a, b) {
  const result = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      result[row][column] =
        a[row][0] * b[0][column]
        + a[row][1] * b[1][column]
        + a[row][2] * b[2][column];
    }
  }
  return result;
}

export function sanitizeReferenceDimension(value, fallback = 10) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function computeRectifiedReferenceSize(sourceCorners, referenceWidth, referenceHeight) {
  const topEdge = distanceBetween(sourceCorners[0], sourceCorners[1]);
  const bottomEdge = distanceBetween(sourceCorners[3], sourceCorners[2]);
  const leftEdge = distanceBetween(sourceCorners[0], sourceCorners[3]);
  const rightEdge = distanceBetween(sourceCorners[1], sourceCorners[2]);
  const horizontalPixelsPerUnit = ((topEdge + bottomEdge) / 2) / referenceWidth;
  const verticalPixelsPerUnit = ((leftEdge + rightEdge) / 2) / referenceHeight;
  const averagedPixelsPerUnit = Math.max(1, (horizontalPixelsPerUnit + verticalPixelsPerUnit) / 2);
  let width = Math.max(1, Math.round(referenceWidth * averagedPixelsPerUnit));
  let height = Math.max(1, Math.round(referenceHeight * averagedPixelsPerUnit));

  const maxDimension = Math.max(width, height);
  if (maxDimension > MAX_OUTPUT_DIMENSION) {
    const scale = MAX_OUTPUT_DIMENSION / maxDimension;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  return { width, height };
}

function buildSourceImageCorners(sourceWidth, sourceHeight) {
  const width = Number(sourceWidth);
  const height = Number(sourceHeight);
  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function getBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    maxDimension: Math.max(maxX - minX, maxY - minY),
  };
}

function normalizeQuadrilateral(points) {
  if (!Array.isArray(points) || points.length < 4) {
    return null;
  }

  const normalized = points
    .slice(0, 4)
    .map((point) => ({
      x: Number(point?.x),
      y: Number(point?.y),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  return normalized.length === 4 ? normalized : null;
}

function isConvexQuadrilateral(points) {
  let previousCross = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const cross = crossProduct(a, b, c);
    if (Math.abs(cross) < 0.000001) {
      return false;
    }
    if (previousCross && cross * previousCross < 0) {
      return false;
    }
    previousCross = previousCross || cross;
  }
  return polygonArea(points) > 1;
}

function crossProduct(a, b, c) {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function polygonArea(points) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }
  return Math.abs(total) / 2;
}

function solveHomography(sourcePoints, targetPoints) {
  const matrix = [];
  const vector = [];

  for (let index = 0; index < 4; index += 1) {
    const source = sourcePoints[index];
    const target = targetPoints[index];

    matrix.push([source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y]);
    vector.push(target.x);

    matrix.push([0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y]);
    vector.push(target.y);
  }

  const solution = solveLinearSystem(matrix, vector);
  if (!solution) {
    return null;
  }

  return [
    [solution[0], solution[1], solution[2]],
    [solution[3], solution[4], solution[5]],
    [solution[6], solution[7], 1],
  ];
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    let pivotValue = Math.abs(augmented[column][column]);
    for (let row = column + 1; row < size; row += 1) {
      const candidateValue = Math.abs(augmented[row][column]);
      if (candidateValue > pivotValue) {
        pivotValue = candidateValue;
        pivotRow = row;
      }
    }

    if (pivotValue < 0.0000001) {
      return null;
    }

    if (pivotRow !== column) {
      [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    }

    const pivot = augmented[column][column];
    for (let currentColumn = column; currentColumn <= size; currentColumn += 1) {
      augmented[column][currentColumn] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      if (Math.abs(factor) < 0.0000001) {
        continue;
      }

      for (let currentColumn = column; currentColumn <= size; currentColumn += 1) {
        augmented[row][currentColumn] -= factor * augmented[column][currentColumn];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function invertHomography(matrix) {
  const [
    [a, b, c],
    [d, e, f],
    [g, h, i],
  ] = matrix;
  const determinant =
    a * (e * i - f * h)
    - b * (d * i - f * g)
    + c * (d * h - e * g);

  if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.0000001) {
    return null;
  }

  const inverseScale = 1 / determinant;
  return [
    [
      (e * i - f * h) * inverseScale,
      (c * h - b * i) * inverseScale,
      (b * f - c * e) * inverseScale,
    ],
    [
      (f * g - d * i) * inverseScale,
      (a * i - c * g) * inverseScale,
      (c * d - a * f) * inverseScale,
    ],
    [
      (d * h - e * g) * inverseScale,
      (b * g - a * h) * inverseScale,
      (a * e - b * d) * inverseScale,
    ],
  ];
}

function translationMatrix(dx, dy) {
  return [
    [1, 0, dx],
    [0, 1, dy],
    [0, 0, 1],
  ];
}

function scaleMatrix(scale) {
  return [
    [scale, 0, 0],
    [0, scale, 0],
    [0, 0, 1],
  ];
}


function sampleBilinear(sourcePixels, sourceWidth, sourceHeight, x, y, destinationPixels, offset) {
  const clampedX = Math.max(0, Math.min(sourceWidth - 1, x));
  const clampedY = Math.max(0, Math.min(sourceHeight - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, sourceWidth - 1);
  const y1 = Math.min(y0 + 1, sourceHeight - 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const topLeftOffset = (y0 * sourceWidth + x0) * 4;
  const topRightOffset = (y0 * sourceWidth + x1) * 4;
  const bottomLeftOffset = (y1 * sourceWidth + x0) * 4;
  const bottomRightOffset = (y1 * sourceWidth + x1) * 4;

  for (let channel = 0; channel < 4; channel += 1) {
    const top = sourcePixels[topLeftOffset + channel] * (1 - fx) + sourcePixels[topRightOffset + channel] * fx;
    const bottom = sourcePixels[bottomLeftOffset + channel] * (1 - fx) + sourcePixels[bottomRightOffset + channel] * fx;
    destinationPixels[offset + channel] = Math.round(top * (1 - fy) + bottom * fy);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
