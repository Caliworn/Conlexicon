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
  radii: [20, 20, 20, 20],
  bezel: 20,
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
assert(left.displacementX < 0, "Left edge must sample toward its outward normal");
assert(right.displacementX > 0, "Right edge must sample toward its outward normal");
assert(top.displacementY < 0, "Top edge must sample toward its outward normal");
assert(bottom.displacementY > 0, "Bottom edge must sample toward its outward normal");
almostEqual(Math.abs(left.displacementX), Math.abs(right.displacementX), 1e-9, "Opposite horizontal edges must be symmetric");
almostEqual(Math.abs(top.displacementY), Math.abs(bottom.displacementY), 1e-9, "Opposite vertical edges must be symmetric");
assert.equal(left.normalX, -1, "Left-edge lighting normals must point out of the surface");
assert.equal(right.normalX, 1, "Right-edge lighting normals must point out of the surface");
assert.equal(top.normalY, -1, "Top-edge lighting normals must point out of the surface");
assert.equal(bottom.normalY, 1, "Bottom-edge lighting normals must point out of the surface");

const cornerA = geometry.sampleSurface(7, 16, options);
const cornerB = geometry.sampleSurface(16, 7, options);
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
assert(invalid.bezel >= 2, "Invalid bezel width must be clamped");
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

const mapsA = geometry.generateSurfaceMaps(options);
const mapsB = geometry.generateSurfaceMaps(options);
assert.equal(mapsA.displacement.length, options.mapWidth * options.mapHeight * 4);
assert.equal(mapsA.specular.length, options.mapWidth * options.mapHeight * 4);
assert.equal(mapsA.byteLength, mapsA.displacement.byteLength + mapsA.specular.byteLength);
assert.deepEqual(mapsA.displacement, mapsB.displacement, "Displacement generation must be deterministic");
assert.deepEqual(mapsA.specular, mapsB.specular, "Specular generation must be deterministic");
assert(
  mapsA.specular.some((value, index) => index % 4 === 2 && value > 0),
  "The lighting map must encode a non-empty rim channel",
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
