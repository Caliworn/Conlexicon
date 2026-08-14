#!/usr/bin/env node
const assert = require("node:assert/strict");

const geometry = require("../lib/liquid-glass-geometry");
const {
  ByteBudgetLru,
  LiquidGlassEngine,
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

const rightEdge = geometry.normalizeSurfaceOptions({
  width: 240,
  height: 20,
  radii: [0, 0, 0, 0],
  bezel: 30,
  edgeMode: "right",
  mapWidth: 240,
  mapHeight: 20,
});
assert(
  rightEdge.effectiveBezel > 0 && rightEdge.effectiveBezel < rightEdge.height / 2,
  "A single exposed edge must fit within the surface dimension",
);
assert.equal(geometry.sampleSurface(239, 10, rightEdge).normalX, 1, "Right-edge optics must face only right");
assert(geometry.sampleSurface(239, 10, rightEdge).displacementX < 0, "Right-edge refraction must sample back into the surface");
assert.equal(geometry.sampleSurface(120, 1, rightEdge).rim, 0, "Inactive top edges must not receive an optical rim");

const bottomEdge = geometry.normalizeSurfaceOptions({
  width: 240,
  height: 40,
  radii: [0, 0, 0, 0],
  bezel: 30,
  edgeMode: "bottom",
  mapWidth: 240,
  mapHeight: 40,
});
assert.equal(geometry.sampleSurface(120, 39, bottomEdge).normalY, 1, "Bottom-edge optics must face only down");
assert(geometry.sampleSurface(120, 39, bottomEdge).displacementY < 0, "Bottom-edge refraction must sample back into the surface");
assert.equal(geometry.sampleSurface(239, 20, bottomEdge).rim, 0, "Inactive right edges must not receive an optical rim");

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
const keyWithRightEdge = geometry.buildCacheKey({ ...options, edgeMode: "right" });
assert.equal(keyA, keyB, "Equivalent geometry must produce a stable cache key");
assert.notEqual(keyA, keyC, "Materially different geometry must not share a cache key");
assert.equal(
  keyA,
  keyWithMovedLight,
  "The unified light vector must update filter matrices without regenerating geometry maps",
);
assert.notEqual(keyA, keyWithRightEdge, "Different active-edge models must not share a geometry cache entry");

const mapsA = geometry.generateSurfaceMaps(options);
const mapsB = geometry.generateSurfaceMaps(options);
assert.equal(mapsA.displacement.length, options.mapWidth * options.mapHeight * 4);
assert.equal(mapsA.specular.length, options.mapWidth * options.mapHeight * 4);
assert.equal(mapsA.byteLength, mapsA.displacement.byteLength + mapsA.specular.byteLength);
assert.deepEqual(mapsA.displacement, mapsB.displacement, "Displacement generation must be deterministic");
assert.deepEqual(mapsA.specular, mapsB.specular, "Specular generation must be deterministic");
assert(
  mapsA.specular.some((value) => value > 0),
  "The generated lighting map must not be empty",
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

console.log("Liquid Glass geometry, deterministic map, and byte-budget cache checks passed.");
