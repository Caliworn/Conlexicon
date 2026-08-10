/* global importScripts, self, OffscreenCanvas, ImageData */
importScripts("liquid-glass-geometry.js");

const geometry = self.ConlexiconLiquidGlassGeometry;

async function mapBlob(bytes, width, height) {
  if (typeof OffscreenCanvas !== "function" || typeof ImageData !== "function") {
    return null;
  }
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: true });
  if (!context || typeof canvas.convertToBlob !== "function") {
    return null;
  }
  context.putImageData(new ImageData(bytes, width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

self.addEventListener("message", async (event) => {
  const requestId = event.data?.id;
  try {
    const maps = geometry.generateSurfaceMaps(event.data?.options || {});
    const [displacementBlob, specularBlob] = await Promise.all([
      mapBlob(maps.displacement, maps.width, maps.height),
      mapBlob(maps.specular, maps.width, maps.height),
    ]);
    if (displacementBlob && specularBlob) {
      self.postMessage({
        id: requestId,
        width: maps.width,
        height: maps.height,
        options: maps.options,
        byteLength: maps.byteLength,
        displacementBlob,
        specularBlob,
      });
      return;
    }
    self.postMessage({
      id: requestId,
      width: maps.width,
      height: maps.height,
      options: maps.options,
      byteLength: maps.byteLength,
      displacementBuffer: maps.displacement.buffer,
      specularBuffer: maps.specular.buffer,
    }, [maps.displacement.buffer, maps.specular.buffer]);
  } catch (error) {
    self.postMessage({
      id: requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
