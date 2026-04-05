export async function loadImageFile(file) {
  const src = await readAsDataUrl(file);
  const { width, height } = await imageDimensions(src);
  return { src, width, height, name: file.name };
}

export async function loadProjectFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const version = String(parsed.version ?? "");
  if (!version.startsWith("1.") || !parsed.project) {
    throw new Error("Unsupported project file.");
  }
  return parsed.project;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}
