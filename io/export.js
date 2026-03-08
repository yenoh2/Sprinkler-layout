export function exportProjectJson(projectState) {
  const payload = {
    version: "1.0",
    project: projectState,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `${sanitizeFileName(projectState.meta.projectName || "sprinkler-layout")}.json`,
  );
}

export function exportCanvasPng(canvas, projectName) {
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    downloadBlob(blob, `${sanitizeFileName(projectName || "sprinkler-layout")}.png`);
  }, "image/png");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileName(value) {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
}
