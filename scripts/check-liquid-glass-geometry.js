#!/usr/bin/env node
const assert = require("node:assert/strict");

const geometry = require("../lib/liquid-glass-geometry");
const sdfBaseline = require("../lib/liquid-glass-sdf-baseline");
const {
  ByteBudgetLru,
  LiquidGlassEngine,
  buildResourceKey,
  lightFacingMatrixValues,
  normalizeLightVector,
} = require("../lib/liquid-glass-engine");

function almostEqual(actual, expected, epsilon, message) {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected} ± ${epsilon}, received ${actual}`,
  );
}

const options = geometry.normalizeSurfaceOptions({
  width: 200,
  height: 100,
  radii: [48, 48, 48, 48],
  bezel: 46,
  thickness: 18,
  ior: 1.45,
  maxDisplacement: 15,
  mapWidth: 80,
  mapHeight: 40,
});

const center = geometry.sampleSurface(100, 50, options);
almostEqual(center.displacementX, 0, 1e-9, "Surface center X displacement must be neutral");
almostEqual(center.displacementY, 0, 1e-9, "Surface center Y displacement must be neutral");
assert.equal(center.rim, 0, "Surface center must not be part of the optical rim");

const left = geometry.sampleSurface(2, 50, options);
const right = geometry.sampleSurface(198, 50, options);
const top = geometry.sampleSurface(100, 2, options);
const bottom = geometry.sampleSurface(100, 98, options);
assert(left.displacementX > 0, "Left edge must sample inward instead of importing the exterior backdrop");
assert(right.displacementX < 0, "Right edge must sample inward instead of importing the exterior backdrop");
assert(top.displacementY > 0, "Top edge must sample inward instead of importing the exterior backdrop");
assert(bottom.displacementY < 0, "Bottom edge must sample inward instead of importing the exterior backdrop");
almostEqual(Math.abs(left.displacementX), Math.abs(right.displacementX), 1e-9, "Opposite horizontal edges must be symmetric");
almostEqual(Math.abs(top.displacementY), Math.abs(bottom.displacementY), 1e-9, "Opposite vertical edges must be symmetric");
assert.equal(left.normalX, -1, "Left-edge lighting normals must point out of the surface");
assert.equal(right.normalX, 1, "Right-edge lighting normals must point out of the surface");
assert.equal(top.normalY, -1, "Top-edge lighting normals must point out of the surface");
assert.equal(bottom.normalY, 1, "Bottom-edge lighting normals must point out of the surface");

const cornerA = geometry.sampleSurface(10, 20, options);
const cornerB = geometry.sampleSurface(20, 10, options);
almostEqual(
  Math.hypot(cornerA.displacementX, cornerA.displacementY),
  Math.hypot(cornerB.displacementX, cornerB.displacementY),
  0.12,
  "Rounded-corner displacement must remain continuous across the diagonal",
);
almostEqual(
  Math.abs(cornerA.displacementX),
  Math.abs(cornerB.displacementY),
  0.12,
  "Rounded-corner normals must mirror across the diagonal",
);
assert(
  options.effectiveBezel > 0 && options.effectiveBezel <= options.requestedBezel,
  "Normalized geometry must not enlarge the requested optical bezel",
);
const topOuterOptics = geometry.sampleSurface(options.width / 2, 1, options);
const topQuarterOptics = geometry.sampleSurface(options.width / 2, options.bezel / 4, options);
const topMiddleOptics = geometry.sampleSurface(options.width / 2, options.bezel / 2, options);
assert(
  Math.abs(topOuterOptics.displacementY) > Math.abs(topQuarterOptics.displacementY)
    && Math.abs(topQuarterOptics.displacementY) > Math.abs(topMiddleOptics.displacementY),
  "Reference-aligned convex-squircle refraction must decay continuously toward the readable center",
);
assert(
  Math.abs(topMiddleOptics.displacementY) > 0,
  "The middle of the requested bezel must remain optically active instead of being hard-clipped",
);

const continuousFieldOptions = geometry.normalizeSurfaceOptions({
  width: 194,
  height: 146,
  radii: [24, 24, 24, 24],
  bezel: 30,
  mapWidth: 194,
  mapHeight: 146,
});
const formerActivationX = continuousFieldOptions.bezel;
const formerActivationY = continuousFieldOptions.bezel / 2;
const continuityStep = 0.25;
const normalBefore = geometry.sampleSurface(
  formerActivationX - continuityStep,
  formerActivationY,
  continuousFieldOptions,
);
const normalAt = geometry.sampleSurface(
  formerActivationX,
  formerActivationY,
  continuousFieldOptions,
);
const normalAfter = geometry.sampleSurface(
  formerActivationX + continuityStep,
  formerActivationY,
  continuousFieldOptions,
);
assert(
  Math.hypot(
    normalBefore.normalX - 2 * normalAt.normalX + normalAfter.normalX,
    normalBefore.normalY - 2 * normalAt.normalY + normalAfter.normalY,
  ) < 0.002,
  "The full-support optical field must remain smooth across the wide-bezel interior",
);

const tinySurface = geometry.normalizeSurfaceOptions({
  width: 80,
  height: 10,
  radius: 5,
  bezel: 22,
  mapWidth: 80,
  mapHeight: 10,
});
assert.equal(tinySurface.q3Eligible, false, "Surfaces without a usable optical rim must select Q1");
assert.deepEqual(
  geometry.sampleSurface(1, 1, tinySurface),
  { displacementX: 0, displacementY: 0, normalX: 0, normalY: 0, rim: 0 },
  "Ineligible surfaces must not emit malformed displacement or lighting data",
);

const invalid = geometry.normalizeSurfaceOptions({
  width: -50,
  height: Number.NaN,
  radius: 9999,
  bezel: 0,
  thickness: -1,
  ior: 0,
  maxDisplacement: 999,
});
assert(invalid.width >= 8 && invalid.height >= 8, "Invalid surface dimensions must be clamped");
assert(invalid.ior > 1, "Invalid IOR must be clamped above air");
assert(invalid.requestedBezel >= 2, "Invalid requested bezel width must be clamped");
assert.equal(invalid.q3Eligible, false, "A normalized zero-radius surface must fall back instead of crossing its medial seam");
assert(invalid.radii.every((radius) => radius <= Math.min(invalid.width, invalid.height) / 2), "Corner radii must fit the surface");

const keyA = geometry.buildCacheKey(options);
const keyB = geometry.buildCacheKey({ ...options });
const keyC = geometry.buildCacheKey({ ...options, width: options.width + 8 });
const keyWithMovedLight = geometry.buildCacheKey({ ...options, lightX: 0.92, lightY: 0.38 });
assert.equal(keyA, keyB, "Equivalent geometry must produce a stable cache key");
assert.notEqual(keyA, keyC, "Materially different geometry must not share a cache key");
assert.equal(
  keyA,
  keyWithMovedLight,
  "The unified light vector must update filter matrices without regenerating geometry maps",
);
assert.equal(
  buildResourceKey({ ...options, opticalBlur: 4, saturation: 1.09, role: "focus" }),
  buildResourceKey({ ...options, opticalBlur: 4, saturation: 1.09, role: "diagnostic" }),
  "Equivalent resolved optical output must share one engine resource key across semantic roles",
);
assert.notEqual(
  buildResourceKey({ ...options, opticalBlur: 4, saturation: 1.09 }),
  buildResourceKey({ ...options, opticalBlur: 5.5, saturation: 1.12 }),
  "Different filter output parameters must not share an engine resource key",
);

const superellipseOptions = geometry.normalizeSurfaceOptions({
  ...options,
  outerShape: "superellipse",
  cornerExponent: 4,
});
const superellipseExponentOptions = geometry.normalizeSurfaceOptions({
  ...options,
  outerShape: "superellipse",
  cornerExponent: 8,
});
const exponentTwoOptions = geometry.normalizeSurfaceOptions({
  ...options,
  outerShape: "superellipse",
  cornerExponent: 2,
});
assert.equal(options.outerShape, "round", "Product geometry must keep rounded rectangles as its default");
assert.equal(exponentTwoOptions.outerShape, "round", "Exponent two must use the Product round fast path");
assert.equal(
  keyA,
  geometry.buildCacheKey({ ...options, outerShape: "round", cornerExponent: 8 }),
  "The inactive superellipse exponent must not change the established Product round cache key",
);
assert.equal(
  keyA,
  geometry.buildCacheKey({ ...options, outerShape: "superellipse", cornerExponent: 2 }),
  "Exponent two must reuse the established Product round cache entry",
);
assert.equal(superellipseOptions.cornerExponent, 4, "Product superellipse exponents must be normalized");
assert.equal(
  superellipseOptions.effectiveBezel,
  options.effectiveBezel,
  "Product superellipse corners must not narrow the requested optical bezel",
);
assert.notEqual(keyA, geometry.buildCacheKey(superellipseOptions), "Product outline modes must not share cache entries");
assert.notEqual(
  geometry.buildCacheKey(superellipseOptions),
  geometry.buildCacheKey(superellipseExponentOptions),
  "Different active Product superellipse exponents must not share cache entries",
);
const squircleDiagonalCoordinate = 48 - 48 * Math.pow(0.5, 1 / 4);
const squircleBoundary = geometry.roundedRectMetrics(
  squircleDiagonalCoordinate,
  squircleDiagonalCoordinate,
  superellipseOptions,
);
almostEqual(squircleBoundary.edgeDistance, 0, 0.02, "The Product squircle diagonal must lie on its analytic boundary");
almostEqual(
  Math.abs(squircleBoundary.normalX),
  Math.abs(squircleBoundary.normalY),
  1e-6,
  "The Product squircle diagonal normal must remain symmetric",
);
const roundCornerProbe = geometry.sampleSurface(8, 8, {
  ...options,
  outerShape: "superellipse",
  cornerExponent: 2,
});
const squircleCornerProbe = geometry.sampleSurface(8, 8, superellipseOptions);
assert.equal(roundCornerProbe.rim, 0, "The exponent-two outline must retain the rounded corner exclusion");
assert(squircleCornerProbe.rim > 0, "The exponent-four squircle must include its characteristically fuller corner");
const squircleTop = geometry.sampleSurface(options.width / 2, 1, superellipseOptions);
assert.equal(squircleTop.normalX, 0, "The Product squircle top edge must remain horizontally tangent");
assert.equal(squircleTop.normalY, -1, "The Product squircle top edge must retain its outward normal");

const globalEllipseOptions = geometry.normalizeSurfaceOptions({
  ...options,
  outerShape: "global-superellipse",
  cornerExponent: 2,
});
const globalSquircleOptions = geometry.normalizeSurfaceOptions({
  ...options,
  outerShape: "global-superellipse",
  cornerExponent: 4,
});
assert.equal(
  globalEllipseOptions.outerShape,
  "global-superellipse",
  "Exponent two must remain a global ellipse instead of normalizing to a rounded rectangle",
);
const ellipseBoundary = geometry.sampleSurface(
  options.width / 2 + options.width / 2 / Math.SQRT2,
  options.height / 2 - options.height / 2 / Math.SQRT2,
  globalEllipseOptions,
);
almostEqual(ellipseBoundary.rim, 1, 1e-6, "The Product global ellipse must follow the Lamé boundary");
assert.equal(
  geometry.sampleSurface(1, 1, globalEllipseOptions).rim,
  0,
  "A global ellipse must exclude the rectangular map corner",
);
assert.equal(
  geometry.buildCacheKey(globalSquircleOptions),
  geometry.buildCacheKey({ ...globalSquircleOptions, radius: 2 }),
  "Global superellipse cache identity must ignore the inactive rounded-corner radius",
);
assert.notEqual(
  geometry.buildCacheKey(globalEllipseOptions),
  geometry.buildCacheKey(globalSquircleOptions),
  "Different global superellipse exponents must not share Product cache entries",
);
const globalSquircleMaps = geometry.generateSurfaceMaps(globalSquircleOptions);
const globalCornerOffset = 3;
const globalCenterOffset = (
  Math.floor(globalSquircleMaps.height / 2) * globalSquircleMaps.width
  + Math.floor(globalSquircleMaps.width / 2)
) * 4 + 3;
assert.equal(
  globalSquircleMaps.displacement[globalCornerOffset],
  255,
  "The displacement map must keep opaque neutral RGB outside the global outline",
);
assert.equal(
  globalSquircleMaps.specular[globalCornerOffset],
  0,
  "The lighting map alpha must exclude the rectangular corner outside a global superellipse",
);
assert.equal(
  globalSquircleMaps.specular[globalCenterOffset],
  255,
  "The lighting map alpha must retain the global superellipse interior",
);

const mapsA = geometry.generateSurfaceMaps(options);
const mapsB = geometry.generateSurfaceMaps(options);
const exponentTwoMaps = geometry.generateSurfaceMaps({
  ...options,
  outerShape: "superellipse",
  cornerExponent: 2,
});
assert.equal(mapsA.displacement.length, options.mapWidth * options.mapHeight * 4);
assert.equal(mapsA.specular.length, options.mapWidth * options.mapHeight * 4);
assert.equal(mapsA.byteLength, mapsA.displacement.byteLength + mapsA.specular.byteLength);
assert.deepEqual(mapsA.displacement, mapsB.displacement, "Displacement generation must be deterministic");
assert.deepEqual(mapsA.specular, mapsB.specular, "Specular generation must be deterministic");
assert.deepEqual(
  mapsA.displacement,
  exponentTwoMaps.displacement,
  "Exponent two must preserve the Product round displacement bytes",
);
assert.deepEqual(
  mapsA.specular,
  exponentTwoMaps.specular,
  "Exponent two must preserve the Product round normal/rim bytes",
);
assert(
  mapsA.specular.some((value) => value > 0),
  "The generated lighting map must not be empty",
);

const continuousMaps = geometry.generateSurfaceMaps(continuousFieldOptions);
const centerMapOffset = (
  Math.floor(continuousMaps.height / 2) * continuousMaps.width
  + Math.floor(continuousMaps.width / 2)
) * 4;
assert.deepEqual(
  Array.from(continuousMaps.displacement.slice(centerMapOffset, centerMapOffset + 4)),
  [128, 128, 0, 255],
  "The displacement map must be neutral outside the active optical bezel",
);
assert.deepEqual(
  Array.from(continuousMaps.specular.slice(centerMapOffset, centerMapOffset + 4)),
  [128, 128, 0, 255],
  "The normal/rim map must not retain meaningless direction partitions outside the optical bezel",
);

for (let offset = 0; offset < continuousMaps.displacement.length; offset += 4) {
  const rim = continuousMaps.displacement[offset + 2];
  const displacementX = continuousMaps.displacement[offset] - 128;
  const displacementY = continuousMaps.displacement[offset + 1] - 128;
  const normalX = continuousMaps.specular[offset] - 128;
  const normalY = continuousMaps.specular[offset + 1] - 128;
  const displacementLength = Math.hypot(displacementX, displacementY);
  const normalLength = Math.hypot(normalX, normalY);
  if (rim < 8 || displacementLength < 8 || normalLength < 32) {
    continue;
  }
  const alignment = (displacementX * normalX + displacementY * normalY)
    / (displacementLength * normalLength);
  assert(
    alignment < -0.97,
    "Displacement and specular maps must encode opposite directions from one shared optical field",
  );
}

for (const [mapX, mapY] of [[4, 73], [30, 15], [97, 4], [164, 15]]) {
  const surfaceX = (mapX + 0.5) / continuousMaps.width * continuousFieldOptions.width;
  const surfaceY = (mapY + 0.5) / continuousMaps.height * continuousFieldOptions.height;
  const expected = geometry.sampleSurface(surfaceX, surfaceY, continuousFieldOptions);
  const offset = (mapY * continuousMaps.width + mapX) * 4;
  const expectedRed = Math.round(128 + expected.displacementX
    / continuousFieldOptions.maxDisplacement * 127);
  const expectedGreen = Math.round(128 + expected.displacementY
    / continuousFieldOptions.maxDisplacement * 127);
  assert(
    Math.abs(continuousMaps.displacement[offset] - expectedRed) <= 1
      && Math.abs(continuousMaps.displacement[offset + 1] - expectedGreen) <= 1,
    "The generated refraction lookup must remain visually equivalent to the analytic profile",
  );
}

const sdfOptions = {
  width: 200,
  height: 100,
  radius: 30,
  depth: 14,
  curvature: 0.65,
  quality: 128,
};
const sdfMapA = sdfBaseline.computeDisplacementMap(sdfOptions);
const sdfMapB = sdfBaseline.computeDisplacementMap(sdfOptions);
const sdfExplicitRound = sdfBaseline.computeDisplacementMap({
  ...sdfOptions,
  outerShape: "round",
  cornerExponent: 8,
});
const sdfExponentTwo = sdfBaseline.computeDisplacementMap({
  ...sdfOptions,
  outerShape: "superellipse",
  cornerExponent: 2,
});
assert.equal(sdfMapA.width, 128, "The SDF baseline must preserve its requested square map quality");
assert.equal(sdfMapA.height, 128, "The SDF baseline map must remain square like the upstream renderer");
assert.equal(sdfMapA.pixels.length, 128 * 128 * 4, "The SDF baseline must emit a complete RGBA map");
assert.deepEqual(sdfMapA.pixels, sdfMapB.pixels, "The SDF baseline map must be deterministic");
assert.deepEqual(
  sdfMapA.pixels,
  sdfExplicitRound.pixels,
  "The inactive exponent must not alter the source-compatible SDF round output",
);
assert.deepEqual(
  sdfMapA.pixels,
  sdfExponentTwo.pixels,
  "Exponent two must use the source-compatible SDF round fast path",
);
assert(
  sdfMapA.pixels.every((value, index) => index % 4 !== 3 || value === 0 || value === 255),
  "The SDF research baseline must preserve the upstream binary alpha mask for honest aliasing comparisons",
);

function sdfPixel(map, x, y) {
  const offset = (y * map.width + x) * 4;
  return Array.from(map.pixels.slice(offset, offset + 4));
}

const sdfSquircle = sdfBaseline.computeDisplacementMap({
  ...sdfOptions,
  outerShape: "superellipse",
  cornerExponent: 4,
});
const sdfSquircleRepeat = sdfBaseline.computeDisplacementMap({
  ...sdfOptions,
  outerShape: "superellipse",
  cornerExponent: 4,
});
assert.deepEqual(sdfSquircle.pixels, sdfSquircleRepeat.pixels, "The SDF superellipse extension must be deterministic");
assert.equal(
  sdfBaseline.normalizeOptions({ ...sdfOptions, outerShape: "superellipse" }).depth,
  sdfBaseline.normalizeOptions(sdfOptions).depth,
  "The SDF superellipse outline must not narrow optical depth",
);
assert.equal(sdfPixel(sdfSquircle, 0, 0)[3], 0, "The SDF squircle must still exclude the outer image corner");
assert.equal(sdfPixel(sdfSquircle, 64, 64)[3], 255, "The SDF squircle center must remain inside the mask");
const roundCoverage = sdfMapA.pixels.reduce(
  (total, value, index) => total + (index % 4 === 3 && value === 255 ? 1 : 0),
  0,
);
const squircleCoverage = sdfSquircle.pixels.reduce(
  (total, value, index) => total + (index % 4 === 3 && value === 255 ? 1 : 0),
  0,
);
assert(squircleCoverage > roundCoverage, "A squircle with the same radius must retain more corner area than a rounded rectangle");

const sdfGlobalEllipse = sdfBaseline.computeDisplacementMap({
  ...sdfOptions,
  outerShape: "global-superellipse",
  cornerExponent: 2,
});
const sdfGlobalSquircle = sdfBaseline.computeDisplacementMap({
  ...sdfOptions,
  outerShape: "global-superellipse",
  cornerExponent: 4,
});
assert.equal(
  sdfBaseline.normalizeOptions({
    ...sdfOptions,
    outerShape: "global-superellipse",
    cornerExponent: 2,
  }).outerShape,
  "global-superellipse",
  "The SDF Lab extension must preserve a global ellipse at exponent two",
);
assert.equal(sdfPixel(sdfGlobalEllipse, 0, 0)[3], 0, "The global SDF ellipse must exclude the map corner");
assert.equal(sdfPixel(sdfGlobalEllipse, 64, 64)[3], 255, "The global SDF ellipse must include its center");
const globalEllipseCoverage = sdfGlobalEllipse.pixels.reduce(
  (total, value, index) => total + (index % 4 === 3 && value === 255 ? 1 : 0),
  0,
);
const globalSquircleCoverage = sdfGlobalSquircle.pixels.reduce(
  (total, value, index) => total + (index % 4 === 3 && value === 255 ? 1 : 0),
  0,
);
assert(
  globalSquircleCoverage > globalEllipseCoverage,
  "Increasing the global superellipse exponent must expand the exact Lamé outline toward the box",
);

assert.equal(sdfPixel(sdfMapA, 0, 0)[3], 0, "The rounded SDF corner must stay outside the binary shape mask");
assert.equal(sdfPixel(sdfMapA, 64, 64)[3], 255, "The SDF center must stay inside the binary shape mask");
const sdfTopLeft = sdfPixel(sdfMapA, 20, 20);
const sdfTopRight = sdfPixel(sdfMapA, 107, 20);
const sdfBottomLeft = sdfPixel(sdfMapA, 20, 107);
assert(Math.abs(sdfTopLeft[0] + sdfTopRight[0] - 255) <= 1, "Mirrored SDF X displacement must remain symmetric");
assert(Math.abs(sdfTopLeft[1] + sdfBottomLeft[1] - 255) <= 1, "Mirrored SDF Y displacement must remain symmetric");
assert(
  !sdfBaseline.computeDisplacementMap({ ...sdfOptions, depth: 30 }).pixels.every(
    (value, index) => value === sdfMapA.pixels[index],
  ),
  "Changing SDF optical depth must materially change the generated map",
);

const evicted = [];
const cache = new ByteBudgetLru({
  maxBytes: 10,
  onEvict: (value) => evicted.push(value.id),
});
cache.set("a", { id: "a" }, 6);
cache.retain("a");
cache.set("b", { id: "b" }, 6);
cache.evictOverflow();
assert(cache.has("a"), "Retained optical resources must not be evicted");
assert(!cache.has("b"), "Unretained optical resources must be evicted under byte pressure");
cache.release("a");
cache.set("c", { id: "c" }, 6);
cache.evictOverflow();
assert(!cache.has("a") && cache.has("c"), "Released resources must become LRU eviction candidates");
cache.clear();
assert.deepEqual(cache.stats(), { entries: 0, bytes: 0, retained: 0 });
assert.deepEqual(evicted, ["b", "a", "c"], "Optical resource cleanup must run for eviction and clear");

const movedLight = normalizeLightVector(4, 3, 1.08);
almostEqual(movedLight.x, 0.8, 1e-9, "Unified light X must be normalized");
almostEqual(movedLight.y, 0.6, 1e-9, "Unified light Y must be normalized");
assert.equal(movedLight.strength, 1.08, "Unified light strength must remain independently tunable");
assert.equal(
  lightFacingMatrixValues(movedLight).trim().split(/\s+/).length,
  20,
  "The runtime facing-light matrix must remain a valid 4x5 color matrix",
);

function qualityEngine({ url = true, assisted = false } = {}) {
  const runtimeWindow = {
    CSS: {
      supports: (_property, value) => (value.startsWith("url") ? url : true),
    },
    matchMedia: () => ({ matches: assisted }),
  };
  const document = {
    createElement: () => ({ getContext: () => ({}) }),
  };
  return new LiquidGlassEngine({ window: runtimeWindow, document });
}

assert.equal(qualityEngine().detectQuality(), "q3", "Full URL-filter support must select Q3");
assert.equal(qualityEngine({ url: false }).detectQuality(), "q1", "Missing URL-filter support must select ordinary blur Q1");
assert.equal(qualityEngine({ assisted: true }).detectQuality(), "q0", "Assisted display modes must select solid Q0");

function resizeLifecycleElement(width, height) {
  const size = { width, height };
  return {
    size,
    dataset: {},
    style: { removeProperty() {} },
    removeAttribute() {},
    getBoundingClientRect() {
      return { width: this.size.width, height: this.size.height };
    },
  };
}

const resizeTimers = new Map();
let nextResizeTimer = 1;
const resizeWindow = {
  setTimeout(callback) {
    const id = nextResizeTimer;
    nextResizeTimer += 1;
    resizeTimers.set(id, callback);
    return id;
  },
  clearTimeout(id) {
    resizeTimers.delete(id);
  },
};
const resizeEngine = new LiquidGlassEngine({ window: resizeWindow, document: {} });
const resizeElement = resizeLifecycleElement(320, 180);
const resizeRecord = {
  element: resizeElement,
  role: "floating",
  overrides: {},
  generation: 0,
  cacheKey: "floating-cache-key",
  resource: {},
  observedSize: { width: 320, height: 180 },
};
resizeEngine.active = true;
resizeEngine.quality = "q3";
resizeEngine.surfaces.set(resizeElement, resizeRecord);
let resizeRefreshes = 0;
resizeEngine.refresh = () => {
  resizeRefreshes += 1;
};
resizeEngine.handleResize([{ target: resizeElement }]);
assert.equal(resizeRefreshes, 0, "The first ResizeObserver report must not duplicate an eager surface refresh");
assert.equal(resizeTimers.size, 0, "An unchanged initial observation must not create an 80ms pending timer");
assert(resizeRecord.resource, "An unchanged observation must retain the current optical resource");
resizeEngine.handleResize([{
  target: resizeElement,
  borderBoxSize: [{ inlineSize: 320.1, blockSize: 180.1 }],
}]);
assert.equal(resizeRefreshes, 0, "Subpixel observer noise must not invalidate a quantized geometry cache entry");

resizeElement.size = { width: 0, height: 0 };
resizeEngine.handleResize([{ target: resizeElement }]);
assert.equal(resizeRefreshes, 0, "Hiding a surface must not schedule unusable zero-size geometry");
assert.equal(resizeTimers.size, 0, "Hiding a surface must not leave a delayed refresh behind");
assert.equal(resizeRecord.resource, null, "Hidden surfaces must release their active cache reference");

resizeElement.size = { width: 320, height: 180 };
resizeEngine.handleResize([{ target: resizeElement }]);
assert.equal(resizeRefreshes, 1, "Revealing a surface must query the session cache immediately");
assert.equal(resizeTimers.size, 0, "A visibility transition must bypass the resize debounce");

resizeElement.size = { width: 340, height: 180 };
resizeEngine.handleResize([{ target: resizeElement }]);
assert.equal(resizeRefreshes, 1, "A genuine visible resize must remain debounced");
assert.equal(resizeTimers.size, 1, "A genuine visible resize must retain one coalescing timer");
const [resizeCallback] = resizeTimers.values();
resizeCallback();
assert.equal(resizeRefreshes, 2, "The coalesced visible resize must refresh exactly once");

console.log("Liquid Glass geometry, deterministic map, and byte-budget cache checks passed.");
