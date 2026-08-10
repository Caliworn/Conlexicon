(function initLiquidGlassGeometry(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConlexiconLiquidGlassGeometry = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createLiquidGlassGeometry() {
  const MAP_VERSION = 1;
  const DEFAULTS = Object.freeze({
    width: 320,
    height: 180,
    radii: Object.freeze([28, 28, 28, 28]),
    bezel: 22,
    thickness: 18,
    ior: 1.45,
    maxDisplacement: 18,
    specularStrength: 0.72,
    lightX: -0.55,
    lightY: -0.84,
    mapWidth: 320,
    mapHeight: 180,
  });

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function quantize(value, step) {
    return Math.round(value / step) * step;
  }

  function normalizedRadii(value, width, height) {
    const source = Array.isArray(value) ? value : [value, value, value, value];
    const radii = [0, 1, 2, 3].map((index) => clamp(
      finiteNumber(source[index], finiteNumber(source[0], DEFAULTS.radii[index])),
      0,
      Math.min(width, height) / 2,
    ));
    const sums = [
      width / Math.max(1e-6, radii[0] + radii[1]),
      width / Math.max(1e-6, radii[3] + radii[2]),
      height / Math.max(1e-6, radii[0] + radii[3]),
      height / Math.max(1e-6, radii[1] + radii[2]),
    ];
    const scale = Math.min(1, ...sums);
    return radii.map((radius) => radius * scale);
  }

  function normalizeSurfaceOptions(options = {}) {
    const width = clamp(finiteNumber(options.width, DEFAULTS.width), 8, 4096);
    const height = clamp(finiteNumber(options.height, DEFAULTS.height), 8, 4096);
    const radii = normalizedRadii(options.radii ?? options.radius ?? DEFAULTS.radii, width, height);
    const bezelLimit = Math.max(2, Math.min(width, height) / 2);
    const bezel = clamp(finiteNumber(options.bezel, DEFAULTS.bezel), 2, bezelLimit);
    const thickness = clamp(finiteNumber(options.thickness, DEFAULTS.thickness), 1, 96);
    const ior = clamp(finiteNumber(options.ior, DEFAULTS.ior), 1.01, 2.5);
    const maxDisplacement = clamp(
      finiteNumber(options.maxDisplacement, DEFAULTS.maxDisplacement),
      0.5,
      Math.min(64, Math.min(width, height) / 3),
    );
    const specularStrength = clamp(
      finiteNumber(options.specularStrength, DEFAULTS.specularStrength),
      0,
      1,
    );
    let lightX = finiteNumber(options.lightX, DEFAULTS.lightX);
    let lightY = finiteNumber(options.lightY, DEFAULTS.lightY);
    const lightLength = Math.hypot(lightX, lightY) || 1;
    lightX /= lightLength;
    lightY /= lightLength;
    const mapWidth = Math.round(clamp(finiteNumber(options.mapWidth, width), 8, 1024));
    const mapHeight = Math.round(clamp(finiteNumber(options.mapHeight, height), 8, 1024));

    return {
      version: MAP_VERSION,
      width,
      height,
      radii,
      bezel,
      thickness,
      ior,
      maxDisplacement,
      specularStrength,
      lightX,
      lightY,
      mapWidth,
      mapHeight,
    };
  }

  function mapDimensions(width, height, devicePixelRatio = 1, maximumDimension = 512) {
    const safeWidth = clamp(finiteNumber(width, DEFAULTS.width), 8, 4096);
    const safeHeight = clamp(finiteNumber(height, DEFAULTS.height), 8, 4096);
    const pixelRatio = clamp(finiteNumber(devicePixelRatio, 1), 0.75, 2);
    const limit = clamp(finiteNumber(maximumDimension, 512), 96, 1024);
    const scale = Math.min(pixelRatio, limit / Math.max(safeWidth, safeHeight));
    return {
      width: Math.max(8, Math.round(safeWidth * scale)),
      height: Math.max(8, Math.round(safeHeight * scale)),
    };
  }

  function roundedRectMetrics(x, y, options) {
    const px = x - options.width / 2;
    const py = y - options.height / 2;
    const signX = px < 0 ? -1 : 1;
    const signY = py < 0 ? -1 : 1;
    const cornerIndex = py < 0
      ? (px < 0 ? 0 : 1)
      : (px < 0 ? 3 : 2);
    const radius = options.radii[cornerIndex];
    const qx = Math.abs(px) - (options.width / 2 - radius);
    const qy = Math.abs(py) - (options.height / 2 - radius);
    const outsideX = Math.max(qx, 0);
    const outsideY = Math.max(qy, 0);
    const distance = Math.hypot(outsideX, outsideY) + Math.min(Math.max(qx, qy), 0) - radius;
    let normalX = 0;
    let normalY = 0;

    if (qx > 0 && qy > 0) {
      const length = Math.hypot(qx, qy) || 1;
      normalX = signX * qx / length;
      normalY = signY * qy / length;
    } else if (qx > qy) {
      normalX = signX;
    } else {
      normalY = signY;
    }

    return {
      inside: distance <= 0,
      edgeDistance: Math.max(0, -distance),
      normalX,
      normalY,
    };
  }

  function refractionProfile(edgeProgress, options) {
    const remaining = 1 - clamp(edgeProgress, 0, 1);
    if (remaining <= 0) {
      return 0;
    }
    const shapeSlope = 2.4 * Math.pow(remaining, 1.4);
    const peakSlope = 2.4;
    const slopeScale = options.thickness / options.bezel;
    const surfaceAngle = Math.atan(shapeSlope * slopeScale);
    const peakAngle = Math.atan(peakSlope * slopeScale);
    const refractedAngle = Math.asin(clamp(Math.sin(surfaceAngle) / options.ior, -1, 1));
    const peakRefractedAngle = Math.asin(clamp(Math.sin(peakAngle) / options.ior, -1, 1));
    const lateral = Math.tan(surfaceAngle - refractedAngle) * options.thickness;
    const peakLateral = Math.max(
      1e-6,
      Math.tan(peakAngle - peakRefractedAngle) * options.thickness,
    );
    return clamp(lateral / peakLateral, 0, 1);
  }

  function sampleSurface(x, y, rawOptions = {}) {
    const options = rawOptions.version === MAP_VERSION ? rawOptions : normalizeSurfaceOptions(rawOptions);
    const metrics = roundedRectMetrics(x, y, options);
    if (!metrics.inside) {
      return {
        displacementX: 0,
        displacementY: 0,
        specular: 0,
        rim: 0,
      };
    }
    const edgeProgress = clamp(metrics.edgeDistance / options.bezel, 0, 1);
    const refraction = refractionProfile(edgeProgress, options);
    const displacement = refraction * options.maxDisplacement;
    const rim = Math.pow(1 - edgeProgress, 0.72);
    const facingLight = clamp(
      metrics.normalX * options.lightX + metrics.normalY * options.lightY,
      0,
      1,
    );
    const specular = clamp(
      rim * (0.12 + 0.88 * Math.pow(facingLight, 2.2)) * options.specularStrength,
      0,
      1,
    );
    return {
      displacementX: metrics.normalX * displacement,
      displacementY: metrics.normalY * displacement,
      specular,
      rim,
    };
  }

  function createSurfaceMapGenerator(rawOptions = {}) {
    const options = normalizeSurfaceOptions(rawOptions);
    const pixelCount = options.mapWidth * options.mapHeight;
    const displacement = new Uint8ClampedArray(pixelCount * 4);
    const specular = new Uint8ClampedArray(pixelCount * 4);
    let nextRow = 0;

    function step(maxRows = 24) {
      const endRow = Math.min(options.mapHeight, nextRow + Math.max(1, Math.round(maxRows)));
      for (let y = nextRow; y < endRow; y += 1) {
        const surfaceY = (y + 0.5) / options.mapHeight * options.height;
        for (let x = 0; x < options.mapWidth; x += 1) {
          const surfaceX = (x + 0.5) / options.mapWidth * options.width;
          const sample = sampleSurface(surfaceX, surfaceY, options);
          const offset = (y * options.mapWidth + x) * 4;
          displacement[offset] = Math.round(128 + clamp(
            sample.displacementX / options.maxDisplacement,
            -1,
            1,
          ) * 127);
          displacement[offset + 1] = Math.round(128 + clamp(
            sample.displacementY / options.maxDisplacement,
            -1,
            1,
          ) * 127);
          displacement[offset + 2] = Math.round(sample.rim * 255);
          displacement[offset + 3] = 255;

          specular[offset] = 255;
          specular[offset + 1] = 255;
          specular[offset + 2] = 255;
          specular[offset + 3] = Math.round(sample.specular * 255);
        }
      }
      nextRow = endRow;
      return nextRow >= options.mapHeight;
    }

    function result() {
      if (nextRow < options.mapHeight) {
        throw new Error("Liquid Glass surface maps are not complete.");
      }
      return {
        options,
        width: options.mapWidth,
        height: options.mapHeight,
        displacement,
        specular,
        byteLength: displacement.byteLength + specular.byteLength,
      };
    }

    return {
      options,
      step,
      result,
      get progress() {
        return nextRow / options.mapHeight;
      },
    };
  }

  function generateSurfaceMaps(options = {}) {
    const generator = createSurfaceMapGenerator(options);
    while (!generator.step(64)) {
      // Synchronous generation is reserved for workers and deterministic checks.
    }
    return generator.result();
  }

  function buildCacheKey(rawOptions = {}) {
    const options = normalizeSurfaceOptions(rawOptions);
    const parts = [
      `v${MAP_VERSION}`,
      quantize(options.width, 4),
      quantize(options.height, 4),
      ...options.radii.map((radius) => quantize(radius, 0.5)),
      quantize(options.bezel, 0.5),
      quantize(options.thickness, 0.5),
      quantize(options.ior, 0.005),
      quantize(options.maxDisplacement, 0.25),
      quantize(options.specularStrength, 0.01),
      quantize(options.lightX, 0.01),
      quantize(options.lightY, 0.01),
      options.mapWidth,
      options.mapHeight,
    ];
    return parts.join(":");
  }

  return {
    MAP_VERSION,
    DEFAULTS,
    normalizeSurfaceOptions,
    mapDimensions,
    roundedRectMetrics,
    refractionProfile,
    sampleSurface,
    createSurfaceMapGenerator,
    generateSurfaceMaps,
    buildCacheKey,
  };
});
