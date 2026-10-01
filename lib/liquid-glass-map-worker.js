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
    const lighting = event.data?.lighting || {};
    const highlight = geometry.bakeSpecularHighlight(
      maps.specular,
      maps.width,
      maps.height,
      lighting.light || { x: 0, y: 0 },
      lighting.slope,
    );
    const [displacementBlob, specularBlob, highlightBlob] = await Promise.all([
      mapBlob(maps.displacement, maps.width, maps.height),
      mapBlob(maps.specular, maps.width, maps.height),
      mapBlob(highlight, maps.width, maps.height),
    ]);
    // The normal/rim bytes stay with the engine so a light change can rebake
    // the highlight without regenerating geometry.
    if (displacementBlob && specularBlob && highlightBlob) {
      self.postMessage({
        id: requestId,
        width: maps.width,
        height: maps.height,
        options: maps.options,
        byteLength: maps.byteLength,
        lighting,
        displacementBlob,
        specularBlob,
        highlightBlob,
        specularBuffer: maps.specular.buffer,
      }, [maps.specular.buffer]);
      return;
    }
    self.postMessage({
      id: requestId,
      width: maps.width,
      height: maps.height,
      options: maps.options,
      byteLength: maps.byteLength,
      lighting,
      displacementBuffer: maps.displacement.buffer,
      specularBuffer: maps.specular.buffer,
      highlightBuffer: highlight.buffer,
    }, [maps.displacement.buffer, maps.specular.buffer, highlight.buffer]);
  } catch (error) {
    self.postMessage({
      id: requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
