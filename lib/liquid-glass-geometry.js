(function initLiquidGlassGeometry(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConlexiconLiquidGlassGeometry = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createLiquidGlassGeometry() {
  const MINIMUM_Q3_BEZEL = 4;
  const EDGE_MODES = Object.freeze(["all", "right", "bottom"]);
  const OUTER_SHAPES = Object.freeze(["round", "superellipse"]);
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
    edgeMode: "all",
    outerShape: "round",
    cornerExponent: 4,
  });

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function smoothstep(minimum, maximum, value) {
    const progress = clamp((value - minimum) / Math.max(1e-6, maximum - minimum), 0, 1);
    return progress * progress * (3 - 2 * progress);
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

  function normalizedEdgeMode(value) {
    return EDGE_MODES.includes(value) ? value : DEFAULTS.edgeMode;
  }

  function normalizedOuterShape(value) {
    return OUTER_SHAPES.includes(value) ? value : DEFAULTS.outerShape;
  }

  function normalizeSurfaceOptions(options = {}) {
    const width = clamp(finiteNumber(options.width, DEFAULTS.width), 8, 4096);
    const height = clamp(finiteNumber(options.height, DEFAULTS.height), 8, 4096);
    const radii = normalizedRadii(options.radii ?? options.radius ?? DEFAULTS.radii, width, height);
    const requestedBezel = clamp(
      finiteNumber(options.bezel, DEFAULTS.bezel),
      2,
      Math.max(2, Math.min(width, height) / 2),
    );
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
    const edgeMode = normalizedEdgeMode(options.edgeMode);
    const outerShape = normalizedOuterShape(options.outerShape);
    const cornerExponent = clamp(
      finiteNumber(options.cornerExponent, DEFAULTS.cornerExponent),
      2,
      8,
    );
    const guard = Math.max(2, width / mapWidth, height / mapHeight);
    const dimensionBezelLimit = Math.max(0, Math.min(width, height) / 2 - guard);
    const effectiveBezel = Math.max(0, Math.min(
      requestedBezel,
      dimensionBezelLimit,
    ));
    const q3Eligible = effectiveBezel >= MINIMUM_Q3_BEZEL;
    return {
      width,
      height,
      radii,
      requestedBezel,
      bezel: effectiveBezel,
      effectiveBezel,
      bezelGuard: guard,
      q3Eligible,
      edgeMode,
      outerShape,
      cornerExponent,
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

  function superellipsePoint(t, radius, exponent) {
    const power = 2 / exponent;
    return {
      x: radius * Math.pow(Math.max(0, Math.cos(t)), power),
      y: radius * Math.pow(Math.max(0, Math.sin(t)), power),
    };
  }

  function superellipseCornerMetrics(x, y, radius, exponent) {
    const normalized = Math.pow(x / radius, exponent) + Math.pow(y / radius, exponent);
    let lower = 0;
    let upper = Math.PI / 2;
    let parameter = Math.atan2(y, x);
    const derivativeStep = 1e-4;

    function distanceSquared(t) {
      const point = superellipsePoint(t, radius, exponent);
      return (point.x - x) ** 2 + (point.y - y) ** 2;
    }

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const before = Math.max(lower, parameter - derivativeStep);
      const after = Math.min(upper, parameter + derivativeStep);
      const currentDistance = distanceSquared(parameter);
      const beforeDistance = distanceSquared(before);
      const afterDistance = distanceSquared(after);
      const span = Math.max(1e-9, after - before);
      const firstDerivative = (afterDistance - beforeDistance) / span;
      const halfSpan = Math.max(1e-9, (after - before) / 2);
      const secondDerivative = (afterDistance - 2 * currentDistance + beforeDistance)
        / (halfSpan * halfSpan);
      if (firstDerivative > 0) {
        upper = parameter;
      } else {
        lower = parameter;
      }
      const candidate = Number.isFinite(secondDerivative) && Math.abs(secondDerivative) > 1e-9
        ? parameter - firstDerivative / secondDerivative
        : Number.NaN;
      parameter = Number.isFinite(candidate) && candidate > lower && candidate < upper
        ? candidate
        : (lower + upper) / 2;
    }

    const boundary = superellipsePoint(parameter, radius, exponent);
    const distance = Math.hypot(x - boundary.x, y - boundary.y);
    const gradientX = Math.pow(Math.max(boundary.x, 1e-9) / radius, exponent - 1);
    const gradientY = Math.pow(Math.max(boundary.y, 1e-9) / radius, exponent - 1);
    const gradientLength = Math.hypot(gradientX, gradientY) || 1;
    return {
      distance: normalized <= 1 ? -distance : distance,
      normalX: gradientX / gradientLength,
      normalY: gradientY / gradientLength,
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
    if (options.edgeMode === "right") {
      return {
        inside: x >= 0 && x <= options.width && y >= 0 && y <= options.height,
        edgeDistance: Math.max(0, options.width - x),
        normalX: 1,
        normalY: 0,
      };
    }
    if (options.edgeMode === "bottom") {
      return {
        inside: x >= 0 && x <= options.width && y >= 0 && y <= options.height,
        edgeDistance: Math.max(0, options.height - y),
        normalX: 0,
        normalY: 1,
      };
    }
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
    let distance = Math.hypot(outsideX, outsideY) + Math.min(Math.max(qx, qy), 0) - radius;
    let normalX = 0;
    let normalY = 0;

    if (qx > 0 && qy > 0) {
      if (options.outerShape === "superellipse" && radius > 0) {
        const corner = superellipseCornerMetrics(qx, qy, radius, options.cornerExponent);
        distance = corner.distance;
        normalX = signX * corner.normalX;
        normalY = signY * corner.normalY;
      } else {
        const length = Math.hypot(qx, qy) || 1;
        normalX = signX * qx / length;
        normalY = signY * qy / length;
      }
    } else if (qx > qy) {
      normalX = signX;
    } else {
      normalY = signY;
    }

    const edgeDistance = Math.max(0, -distance);
    const horizontalInfluence = clamp(1 - (options.width / 2 - Math.abs(px)) / options.bezel, 0, 1);
    const verticalInfluence = clamp(1 - (options.height / 2 - Math.abs(py)) / options.bezel, 0, 1);
    if (horizontalInfluence > 0 && verticalInfluence > 0 && edgeDistance > 0) {
      const blendedLength = Math.hypot(horizontalInfluence, verticalInfluence) || 1;
      const blendedNormalX = signX * horizontalInfluence / blendedLength;
      const blendedNormalY = signY * verticalInfluence / blendedLength;
      const blendDepth = Math.max(options.bezelGuard * 2, Math.min(8, radius / 2));
      const blend = smoothstep(0, blendDepth, edgeDistance);
      const mixedX = normalX * (1 - blend) + blendedNormalX * blend;
      const mixedY = normalY * (1 - blend) + blendedNormalY * blend;
      const mixedLength = Math.hypot(mixedX, mixedY) || 1;
      normalX = mixedX / mixedLength;
      normalY = mixedY / mixedLength;
    }

    return {
      inside: distance <= 0,
      edgeDistance,
      normalX,
      normalY,
    };
  }

  function refractionProfile(edgeProgress, options) {
    const progress = clamp(edgeProgress, 0, 1);
    if (progress >= 1) {
      return 0;
    }

    // Match the reference demo's convex-squircle section and Snell refraction.
    // Its 128-sample profile starts just inside the singular outer derivative;
    // doing the same keeps the useful bezel from collapsing into a few pixels.
    function lateralOffset(sampleProgress) {
      const x = clamp(Math.max(sampleProgress, 1 / 128), 0, 1);
      const remaining = 1 - x;
      const base = Math.max(1e-9, 1 - Math.pow(remaining, 4));
      const height = Math.pow(base, 0.25);
      const derivative = Math.pow(remaining, 3) / Math.pow(base, 0.75);
      const normalLength = Math.hypot(derivative, 1) || 1;
      const normalX = -derivative / normalLength;
      const normalY = -1 / normalLength;
      const eta = 1 / options.ior;
      const dot = normalY;
      const refractedRoot = Math.sqrt(Math.max(0, 1 - eta * eta * (1 - dot * dot)));
      const refractedX = -(eta * dot + refractedRoot) * normalX;
      const refractedY = eta - (eta * dot + refractedRoot) * normalY;
      return Math.abs(refractedX * ((height * options.bezel + options.thickness) / refractedY));
    }

    const peakLateral = Math.max(1e-6, lateralOffset(1 / 128));
    return clamp(lateralOffset(progress) / peakLateral, 0, 1);
  }

  function sampleNormalizedSurface(x, y, options) {
    if (!options.q3Eligible) {
      return {
        displacementX: 0,
        displacementY: 0,
        normalX: 0,
        normalY: 0,
        rim: 0,
      };
    }
    const metrics = roundedRectMetrics(x, y, options);
    if (!metrics.inside) {
      return {
        displacementX: 0,
        displacementY: 0,
        normalX: 0,
        normalY: 0,
        rim: 0,
      };
    }
    const edgeProgress = clamp(metrics.edgeDistance / options.bezel, 0, 1);
    const refraction = refractionProfile(edgeProgress, options);
    const displacement = refraction * options.maxDisplacement;
    const rim = Math.pow(1 - edgeProgress, 1.5);
    return {
      displacementX: -metrics.normalX * displacement,
      displacementY: -metrics.normalY * displacement,
      normalX: metrics.normalX,
      normalY: metrics.normalY,
      rim,
    };
  }

  function sampleSurface(x, y, rawOptions = {}) {
    return sampleNormalizedSurface(x, y, normalizeSurfaceOptions(rawOptions));
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
          const sample = sampleNormalizedSurface(surfaceX, surfaceY, options);
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

          specular[offset] = Math.round(128 + sample.normalX * 127);
          specular[offset + 1] = Math.round(128 + sample.normalY * 127);
          specular[offset + 2] = Math.round(sample.rim * 255);
          specular[offset + 3] = 255;
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
      quantize(options.width, 4),
      quantize(options.height, 4),
      ...options.radii.map((radius) => quantize(radius, 0.5)),
    ];
    if (options.outerShape === "superellipse") {
      parts.push(options.outerShape, quantize(options.cornerExponent, 0.05));
    }
    parts.push(
      options.edgeMode,
      quantize(options.effectiveBezel, 0.5),
      quantize(options.thickness, 0.5),
      quantize(options.ior, 0.005),
      quantize(options.maxDisplacement, 0.25),
      quantize(options.specularStrength, 0.01),
      options.mapWidth,
      options.mapHeight,
    );
    return parts.join(":");
  }

  return {
    MINIMUM_Q3_BEZEL,
    EDGE_MODES,
    OUTER_SHAPES,
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
