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

// Q2 asks only for the highlight; Q3 also needs the displacement map and the
// raw normal/rim bytes, which let a light change rebake the highlight.
self.addEventListener("message", async (event) => {
  const requestId = event.data?.id;
  try {
    const outputs = event.data?.outputs || {};
    const maps = geometry.generateSurfaceMaps(event.data?.options || {}, outputs);
    const lighting = event.data?.lighting || {};
    const highlight = geometry.bakeSpecularHighlight(
      maps.specular,
      maps.width,
      maps.height,
      lighting.light || { x: 0, y: 0 },
      lighting.slope,
    );
    const encoded = [["highlight", highlight]];
    if (maps.displacement) encoded.push(["displacement", maps.displacement]);
    const blobs = await Promise.all(encoded.map(([, bytes]) => mapBlob(bytes, maps.width, maps.height)));
    const base = {
      id: requestId,
      width: maps.width,
      height: maps.height,
      options: maps.options,
      byteLength: maps.byteLength,
      lighting,
    };
    if (blobs.every(Boolean)) {
      const message = { ...base };
      encoded.forEach(([name], index) => { message[`${name}Blob`] = blobs[index]; });
      if (outputs.normalMap) {
        message.specularBuffer = maps.specular.buffer;
        self.postMessage(message, [maps.specular.buffer]);
      } else {
        self.postMessage(message);
      }
      return;
    }
    const message = { ...base, highlightBuffer: highlight.buffer };
    const transfer = [highlight.buffer];
    if (maps.displacement) {
      message.displacementBuffer = maps.displacement.buffer;
      transfer.push(maps.displacement.buffer);
    }
    if (outputs.normalMap) {
      message.specularBuffer = maps.specular.buffer;
      transfer.push(maps.specular.buffer);
    }
    self.postMessage(message, transfer);
  } catch (error) {
    self.postMessage({
      id: requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
