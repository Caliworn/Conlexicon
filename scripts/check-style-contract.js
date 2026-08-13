#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const tokenPath = path.join(ROOT_DIR, "theme-tokens.css");
const layeredGlassPath = path.join(ROOT_DIR, "theme-layered-glass.css");
const liquidGlassPath = path.join(ROOT_DIR, "theme-liquid-glass.css");
const liquidGlassGeometryPath = path.join(ROOT_DIR, "lib", "liquid-glass-geometry.js");
const liquidGlassWorkerPath = path.join(ROOT_DIR, "lib", "liquid-glass-map-worker.js");
const liquidGlassEnginePath = path.join(ROOT_DIR, "lib", "liquid-glass-engine.js");
const liquidGlassLabPath = path.join(ROOT_DIR, "liquid-glass-lab.html");
const stylesPath = path.join(ROOT_DIR, "styles.css");
const indexPath = path.join(ROOT_DIR, "index.html");
const appPath = path.join(ROOT_DIR, "app.js");
const tokens = fs.readFileSync(tokenPath, "utf8");
const layeredGlass = fs.readFileSync(layeredGlassPath, "utf8");
const liquidGlass = fs.readFileSync(liquidGlassPath, "utf8");
const liquidGlassGeometry = fs.readFileSync(liquidGlassGeometryPath, "utf8");
const liquidGlassWorker = fs.readFileSync(liquidGlassWorkerPath, "utf8");
const liquidGlassEngine = fs.readFileSync(liquidGlassEnginePath, "utf8");
const liquidGlassLab = fs.readFileSync(liquidGlassLabPath, "utf8");
const liquidGlassGeometryApi = require(liquidGlassGeometryPath);
const liquidGlassEngineApi = require(liquidGlassEnginePath);
const styles = fs.readFileSync(stylesPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");

const liquidGlassGeometryScriptPosition = index.indexOf('src="lib/liquid-glass-geometry.js"');
const liquidGlassEngineScriptPosition = index.indexOf('src="lib/liquid-glass-engine.js"');
const appScriptPosition = index.indexOf('src="app.js"');
assert(
  liquidGlassGeometryScriptPosition >= 0
    && liquidGlassGeometryScriptPosition < liquidGlassEngineScriptPosition
    && liquidGlassEngineScriptPosition < appScriptPosition,
  "LQ-4 geometry and engine scripts must load in dependency order before app.js",
);
assert(
  liquidGlassWorker.includes('importScripts("liquid-glass-geometry.js")')
    && liquidGlassWorker.includes("geometry.generateSurfaceMaps")
    && liquidGlassWorker.includes("OffscreenCanvas"),
  "LQ-4 worker must reuse the pure geometry model and prefer off-main-thread PNG generation",
);
assert(
  liquidGlassGeometry.includes("function roundedRectMetrics")
    && liquidGlassGeometry.includes("function refractionProfile")
    && liquidGlassGeometry.includes("function createSurfaceMapGenerator")
    && liquidGlassGeometry.includes("function buildCacheKey"),
  "LQ-4 must provide geometry-aware, chunkable, cacheable surface map generation",
);
assert.equal(
  Object.hasOwn(liquidGlassGeometryApi, "MAP_VERSION"),
  false,
  "The session-only geometry cache must not expose a meaningless persistent format version",
);
assert(
  liquidGlassGeometry.includes("function sampleNormalizedSurface(x, y, options)")
    && liquidGlassGeometry.includes("sampleNormalizedSurface(surfaceX, surfaceY, options)")
    && !liquidGlassGeometry.includes("version: MAP_VERSION")
    && !liquidGlassGeometry.includes("`v${MAP_VERSION}`"),
  "Map generation must use an internal normalized sampling path without version-tagged options or cache keys",
);
assert.deepEqual(
  liquidGlassGeometryApi.EDGE_MODES,
  ["all", "right", "bottom"],
  "Liquid Glass geometry must expose only the implemented all-edge and attached-surface edge models",
);
assert(
  liquidGlassGeometry.includes("const effectiveBezel = Math.max(0, Math.min(")
    && liquidGlassGeometry.includes("effectiveBezel >= MINIMUM_Q3_BEZEL")
    && liquidGlassGeometry.includes("options.edgeMode")
    && liquidGlassGeometry.includes("const horizontalInfluence = clamp(")
    && liquidGlassGeometry.includes("const verticalInfluence = clamp(")
    && liquidGlassGeometry.includes("const blend = smoothstep(0, blendDepth, edgeDistance);")
    && liquidGlassGeometry.includes("displacementX: -metrics.normalX * displacement")
    && liquidGlassGeometry.includes("displacementY: -metrics.normalY * displacement")
    && liquidGlassGeometry.includes("function lateralOffset(sampleProgress)")
    && liquidGlassGeometry.includes("Math.max(sampleProgress, 1 / 128)")
    && liquidGlassGeometry.includes("const derivative = Math.pow(remaining, 3) / Math.pow(base, 0.75);")
    && liquidGlassGeometry.includes("const rim = Math.pow(1 - edgeProgress, 1.5);")
    && liquidGlassGeometry.includes("quantize(options.effectiveBezel, 0.5)"),
  "Q3 geometry must retain a dimension-safe straight-edge bezel, smoothly blend overlapping corner normals, and apply reference-aligned optics",
);
assert(
  liquidGlassEngine.includes("class ByteBudgetLru")
    && liquidGlassEngine.includes("class ResilientMapRenderer")
    && liquidGlassEngine.includes("ResizeObserver")
    && liquidGlassEngine.includes("liquid-glass-map-worker.js")
    && !liquidGlassEngine.includes("MutationObserver"),
  "LQ-4 must use a byte-budget cache, Worker fallback, and registered-surface resize observation without scanning virtual lists",
);
assert(
  app.includes("ConlexiconLiquidGlassEngine?.createEngine")
    && app.includes('liquidGlassOpticalEngine?.setEnabled(currentSkin === "liquid-glass")')
    && app.includes("liquidGlassOpticalEngine?.syncMappedSurfaces()")
    && app.includes("liquidGlassOpticalEngine?.registerMappedSurface")
    && app.includes("liquidGlassOpticalEngine?.unregisterMappedSurface"),
  "The shared app must limit Liquid Glass integration to skin and surface lifecycle signals",
);
const liquidGlassLabInlineScripts = [...liquidGlassLab.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1].trim())
  .filter(Boolean);
assert.equal(liquidGlassLabInlineScripts.length, 1, "The standalone Liquid Glass lab must keep one auditable inline controller");
assert.doesNotThrow(
  () => new Function(liquidGlassLabInlineScripts[0]),
  "The standalone Liquid Glass lab controller must be valid JavaScript",
);
assert(
  liquidGlassLab.indexOf('src="lib/liquid-glass-geometry.js"')
    < liquidGlassLab.indexOf('src="lib/liquid-glass-engine.js"')
    && liquidGlassLab.includes('id="liquidGlassFilterDefs"')
    && liquidGlassLab.includes("engineApi.createEngine")
    && liquidGlassLab.includes("opticalEngine.register")
    && liquidGlassLab.includes("geometry.generateSurfaceMaps")
    && liquidGlassLab.includes("opticalEngine.detectQuality()"),
  "The standalone lab must execute the production geometry, Worker/filter engine, and quality path",
);
for (const requiredLabControl of [
  "presetSelect",
  "roleSelect",
  "edgeModeSelect",
  "mapLimitSelect",
  "widthInput",
  "heightInput",
  "radiusInput",
  "bezelInput",
  "thicknessInput",
  "iorInput",
  "displacementInput",
  "blurInput",
  "saturationInput",
  "tintInput",
  "specularInput",
  "lightAngleInput",
  "lightStrengthInput",
  "displacementCanvas",
  "normalCanvas",
]) {
  assert(liquidGlassLab.includes(`id="${requiredLabControl}"`), `Liquid Glass lab control is missing: ${requiredLabControl}`);
}
assert(
  liquidGlassLab.includes("const availableWidth = Math.max(120, elements.stage.clientWidth - 40);")
    && liquidGlassLab.includes("const width = Math.min(requestedWidth, availableWidth);")
    && liquidGlassLab.includes('aria-label="可拖动液态玻璃示例卡片"')
    && liquidGlassLab.includes("elements.surface.setPointerCapture(event.pointerId)")
    && liquidGlassLab.includes("window.requestAnimationFrame(flushSurfaceDrag)")
    && liquidGlassLab.includes('window.addEventListener("blur", clearSurfaceDrag)')
    && liquidGlassLab.includes('id="radiusInput" data-optic-control type="range" min="0" max="120"')
    && liquidGlassLab.includes("elements.surface.style.borderRadius = `${radius}px`;")
    && liquidGlassLab.includes('focus: { role: "focus", width: 620, height: 280, radius: 8')
    && liquidGlassLab.includes("<h2>Sample</h2>")
    && !liquidGlassLab.includes("lab-surface-meta")
    && !liquidGlassLab.includes("acar")
    && !/(?:fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|\/api\/)/.test(liquidGlassLab)
    && !/(?:feGaussianBlur|feDisplacementMap|opticalRefractedRed)/.test(liquidGlassLab),
  "The lab must stay draggable, neutral, responsive, non-persistent, API-free, and free of a duplicated optical pipeline",
);

function numericLayer(name) {
  const match = styles.match(new RegExp(`${name}:\\s*(\\d+)`));
  return match ? Number(match[1]) : Number.NaN;
}

function customPropertyMap(block) {
  return new Map(
    [...block.matchAll(/(--(?:ui|material|radius)-[a-z0-9-]+)\s*:\s*([^;]+);/g)]
      .map((match) => [match[1], match[2].trim()]),
  );
}

const tokenLinkPosition = index.indexOf('href="theme-tokens.css"');
const layeredGlassLinkPosition = index.indexOf('href="theme-layered-glass.css"');
const liquidGlassLinkPosition = index.indexOf('href="theme-liquid-glass.css"');
const stylesLinkPosition = index.indexOf('href="styles.css"');
assert(tokenLinkPosition >= 0, "index.html must load theme-tokens.css");
assert(layeredGlassLinkPosition >= 0, "index.html must load theme-layered-glass.css");
assert(liquidGlassLinkPosition >= 0, "index.html must load theme-liquid-glass.css");
assert(stylesLinkPosition >= 0, "index.html must load styles.css");
assert(
  tokenLinkPosition < layeredGlassLinkPosition
    && layeredGlassLinkPosition < liquidGlassLinkPosition
    && liquidGlassLinkPosition < stylesLinkPosition,
  "Skin stylesheets must load after base tokens and before component styles",
);

const skinTokenPattern = /--(?:ui|material|radius)-[a-z0-9-]+/g;
const tokenDefinitions = new Set(
  [...tokens.matchAll(/(--(?:ui|material|radius)-[a-z0-9-]+)\s*:/g)]
    .map((match) => match[1]),
);
const tokenReferences = new Set(
  [...`${tokens}\n${layeredGlass}\n${liquidGlass}\n${styles}`.matchAll(/var\(\s*(--(?:ui|material|radius)-[a-z0-9-]+)/g)]
    .map((match) => match[1]),
);
const undefinedTokens = [...tokenReferences]
  .filter((tokenName) => !tokenDefinitions.has(tokenName))
  .sort();
assert.deepEqual(undefinedTokens, [], `Undefined skin tokens: ${undefinedTokens.join(", ")}`);

const layeredGlassDefinitions = new Set(
  [...layeredGlass.matchAll(/(--(?:ui|material|radius)-[a-z0-9-]+)\s*:/g)]
    .map((match) => match[1]),
);
const unknownLayeredGlassTokens = [...layeredGlassDefinitions]
  .filter((tokenName) => !tokenDefinitions.has(tokenName))
  .sort();
assert.deepEqual(
  unknownLayeredGlassTokens,
  [],
  `Layered Glass may only override base skin tokens: ${unknownLayeredGlassTokens.join(", ")}`,
);
const liquidGlassDefinitions = new Set(
  [...liquidGlass.matchAll(/(--(?:ui|material|radius)-[a-z0-9-]+)\s*:/g)]
    .map((match) => match[1]),
);
const unknownLiquidGlassTokens = [...liquidGlassDefinitions]
  .filter((tokenName) => !tokenDefinitions.has(tokenName))
  .sort();
assert.deepEqual(
  unknownLiquidGlassTokens,
  [],
  `Liquid Glass may only override base skin tokens: ${unknownLiquidGlassTokens.join(", ")}`,
);
const classicDarkTheme = tokens.match(/body\.dark-theme\s*\{([\s\S]*?)\n\}/);
assert(classicDarkTheme, "Base tokens must define a classic dark theme scope");
const classicLightTheme = tokens.match(/:root\s*\{([\s\S]*?)\n\}/);
assert(classicLightTheme, "Base tokens must define a classic light root scope");
const classicLightTokenValues = customPropertyMap(classicLightTheme[1]);
const classicDarkTokenValues = customPropertyMap(classicDarkTheme[1]);
for (const tokenName of [
  "--material-entry-detail-background",
  "--material-entry-detail-mobile-background",
  "--material-entry-detail-border",
  "--material-entry-detail-shadow",
  "--material-entry-detail-section-background",
  "--material-entry-detail-section-border",
  "--material-navigation-drawer-background",
  "--material-overlay-panel-background",
]) {
  assert(
    classicDarkTheme[1].includes(`${tokenName}:`),
    `Classic dark theme must override scoped material token: ${tokenName}`,
  );
}
for (const [tokenName, lightValue] of classicLightTokenValues) {
  const aliasMatch = lightValue.match(/^var\((--(?:ui|material|radius)-[a-z0-9-]+)\)$/);
  if (!aliasMatch || !classicDarkTokenValues.has(aliasMatch[1])) {
    continue;
  }
  assert.equal(
    classicDarkTokenValues.get(tokenName),
    lightValue,
    `Classic dark theme must rebind ${tokenName} to its dark-scoped dependency ${aliasMatch[1]}`,
  );
}
assert(
  classicDarkTheme[1].includes("--material-navigation-drawer-background: var(--material-navigation-background);"),
  "Classic dark navigation drawer must rebind to the navigation background in the same theme scope",
);
assert(
  layeredGlass.includes('body[data-ui-skin="layered-glass"]'),
  "Layered Glass tokens must use the layered-glass skin scope",
);
assert(!/:root\b/.test(layeredGlass), "Skin overrides must not modify the root token scope");
assert(
  liquidGlass.includes('body[data-ui-skin="liquid-glass"]'),
  "Liquid Glass tokens must use the liquid-glass skin scope",
);
assert(!/:root\b/.test(liquidGlass), "Liquid Glass overrides must not modify the root token scope");
assert(
  /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/.test(liquidGlass),
  "Liquid Glass must provide a no-backdrop-filter fallback",
);
assert(
  /@media \(prefers-reduced-transparency: reduce\)/.test(liquidGlass),
  "Liquid Glass must provide a reduced-transparency fallback",
);
assert(
  /@media \(forced-colors: active\)/.test(liquidGlass),
  "Liquid Glass must provide a forced-colors fallback",
);
const liquidGlassStyleBlocks = [...liquidGlass.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((match) => ({ selector: match[1].trim(), declarations: match[2] }));
const repeatedSurfaceSelectorPattern = /(?:^|[\s,>+~])(?:\.entry-card|\.analysis-card|\.table-row|td|th)(?:$|[\s,:.#\[>+~])/i;
assert.deepEqual(
  liquidGlassStyleBlocks
    .filter(({ selector, declarations }) => (
      repeatedSurfaceSelectorPattern.test(selector) && /backdrop-filter\s*:/.test(declarations)
    ))
    .map(({ selector }) => selector),
  [],
  "Repeated content surfaces must not receive Liquid Glass backdrop blur",
);
assert(
  !/(?:transition|animation)[^;]*(?:backdrop-filter|blur\(|box-shadow)/i.test(liquidGlass),
  "Liquid Glass must not animate blur or large material shadows",
);
const liquidGlassFilterDefs = index.match(
  /<svg id="liquidGlassFilterDefs"[\s\S]*?<\/svg>/,
);
assert(liquidGlassFilterDefs, "Liquid Glass must retain a page-level runtime SVG filter host");
assert.equal(
  (liquidGlassFilterDefs[0].match(/<filter\b/g) || []).length,
  0,
  "LQ-6 must leave the SVG host empty until geometry filters are registered at runtime",
);
assert.equal(
  (liquidGlassEngine.match(/svgElement\(this\.document, "feDisplacementMap"/g) || []).length,
  3,
  "LQ-6 runtime filters must refract red, green, and blue through distinct displacement stages",
);
assert(
  liquidGlassEngine.includes('result: "opticalRefractedRed"')
    && liquidGlassEngine.includes('result: "opticalRefractedGreen"')
    && liquidGlassEngine.includes('result: "opticalRefractedBlue"')
    && liquidGlassEngine.includes('result: "opticalRgbRim"'),
  "LQ-6 must recompose separately displaced RGB channels into a physical dispersion rim",
);
assert(
  /@supports \(\(backdrop-filter: url\("#liquid-glass-optical-probe"\)\) or \(-webkit-backdrop-filter: url\("#liquid-glass-optical-probe"\)\)\)/.test(liquidGlass),
  "Liquid Glass refraction must be a progressive enhancement behind a URL-filter support query",
);
assert(
  liquidGlassEngine.includes("function lightFacingMatrixValues")
    && liquidGlassEngine.includes("setLightVector(x, y, strength = 1)")
    && liquidGlassEngine.includes('result: "opticalNormalRimMap"')
    && liquidGlassEngine.includes('result: "opticalSpecular"'),
  "Liquid Glass must derive environment specular from a retained light vector and the cached normal/rim map",
);
const liquidGlassBlurPosition = liquidGlassEngine.indexOf('svgElement(this.document, "feGaussianBlur"');
const liquidGlassFirstDisplacementPosition = liquidGlassEngine.indexOf('svgElement(this.document, "feDisplacementMap"');
assert(
  liquidGlassBlurPosition >= 0
    && liquidGlassBlurPosition < liquidGlassFirstDisplacementPosition
    && liquidGlassEngine.includes('stdDeviation: options.opticalBlur')
    && liquidGlassEngine.includes('edgeMode: "duplicate"')
    && liquidGlassEngine.includes("const blurExpansion = Math.ceil(options.opticalBlur * 3);")
    && !liquidGlassEngine.includes("preBlur"),
  "Q3 must blur the sampled backdrop inside the optical filter before displacement and expand its clipped edge",
);
const liquidGlassSurfaceDefinitions = liquidGlassEngineApi.SURFACE_ROLE_DEFINITIONS;
assert.deepEqual(
  [...new Set(liquidGlassSurfaceDefinitions.map(({ role }) => role))],
  ["continuous", "focus", "floating", "modal", "micro"],
  "LQ-5 must retain the five formal surface roles in migration order",
);
assert.deepEqual(
  Object.fromEntries(Object.entries(liquidGlassEngineApi.ROLE_DEFAULTS).map(([role, value]) => [
    role,
    value.opticalBlur,
  ])),
  {
    continuous: 3,
    focus: 4,
    floating: 5.5,
    modal: 7,
    micro: 0.1,
  },
  "Q3 role defaults must retain the approved integrated optical blur strengths",
);
assert.deepEqual(
  Object.fromEntries(Object.entries(liquidGlassEngineApi.ROLE_DEFAULTS).map(([role, value]) => [
    role,
    value.bezel,
  ])),
  {
    continuous: 44,
    focus: 46,
    floating: 36,
    modal: 52,
    micro: 8,
  },
  "Q3 role bezels must retain broad straight-edge optics independently of shared UI corner radii",
);
const liquidGlassContinuousDefinitions = liquidGlassSurfaceDefinitions.filter(({ role }) => role === "continuous");
assert.deepEqual(
  liquidGlassContinuousDefinitions.map(({ selector, overrides }) => [selector, overrides?.edgeMode]),
  [[".dictionary-panel", "right"], [".mobile-app-bar", "bottom"]],
  "Attached continuous surfaces must sample only their exposed edge instead of synthesizing a four-corner lens",
);
assert(
  /if \(!options\.q3Eligible\) \{[\s\S]*?record\.generation \+= 1;[\s\S]*?releaseSurfaceResource\(record\);[\s\S]*?liquidGlassOptics = "fallback";/.test(liquidGlassEngine),
  "Surfaces without a usable optical rim must cancel stale resources and remain on Q1",
);
const liquidGlassFormalSurfaceRadiusPattern = /(?:\.dictionary-panel|\.mobile-app-bar|\.entry-display|#entryForm|\.entry-search-config-menu|\.entry-filter-menu|\.source-suggestions|\.entry-context-menu|\.skin-picker-menu|\.toast|\.app-tooltip|\.entry-quality-issue-tooltip|\.modal-panel|\.network-panel)/;
assert.deepEqual(
  liquidGlassStyleBlocks
    .filter(({ selector, declarations }) => (
      liquidGlassFormalSurfaceRadiusPattern.test(selector) && /border-radius\s*:/.test(declarations)
    ))
    .map(({ selector }) => selector),
  [],
  "Liquid Glass formal surfaces must preserve shared component corner radii instead of imposing skin-only geometry",
);
assert(!liquidGlass.includes("--liquid-glass-radius-"), "Liquid Glass must not define private surface-radius tokens");
const liquidGlassOpticalRoleRule = liquidGlass.match(
  /body\[data-ui-skin="liquid-glass"\]\[data-liquid-glass-optics-quality="q3"\] :is\([\s\S]*?\[data-liquid-glass-role="continuous"\]\[data-liquid-glass-optics="ready"\][\s\S]*?\[data-liquid-glass-role="focus"\]\[data-liquid-glass-optics="ready"\][\s\S]*?\[data-liquid-glass-role="floating"\]\[data-liquid-glass-optics="ready"\][\s\S]*?\[data-liquid-glass-role="modal"\]\[data-liquid-glass-optics="ready"\][\s\S]*?\) \{([\s\S]*?)\n  \}/,
);
assert(liquidGlassOpticalRoleRule, "Q3 must apply generated optics only to ready runtime roles");
assert(
  liquidGlassOpticalRoleRule[1].includes("background: var(--liquid-glass-q3-surface-tint);")
    && liquidGlassOpticalRoleRule[1].includes("backdrop-filter: var(--liquid-glass-optical-filter);")
    && !liquidGlassOpticalRoleRule[1].includes("--liquid-glass-surface-filter")
    && !/blur\(/.test(liquidGlassOpticalRoleRule[1]),
  "Q3 must use a low-alpha role tint and generated optics without the Q1 material blur",
);
for (const materialToken of [
  "--material-entry-detail-background",
  "--material-entry-detail-mobile-background",
  "--material-floating-background",
  "--material-mobile-bar-background",
  "--material-navigation-background",
  "--material-navigation-drawer-background",
  "--material-rich-tooltip-background",
  "--material-overlay-panel-background",
]) {
  const values = [...liquidGlass.matchAll(new RegExp(`${materialToken}:\\s*([^;]+);`, "g"))]
    .map((match) => match[1]);
  assert(values.length >= 2, `Liquid Glass must define light and dark values for ${materialToken}`);
  assert(
    values.every((value) => !/gradient\(/i.test(value)),
    `${materialToken} must remain a pure tint instead of painted component lighting`,
  );
}
for (const [q3Tint, expectedValues] of Object.entries({
  navigation: ["rgba(19, 39, 49, 0.52)", "rgba(7, 18, 24, 0.56)"],
  "navigation-drawer": ["rgba(19, 39, 49, 0.62)", "rgba(7, 18, 24, 0.66)"],
  "mobile-bar": ["rgba(235, 246, 247, 0.28)", "rgba(13, 26, 32, 0.34)"],
  focus: ["rgba(241, 249, 250, 0.3)", "rgba(18, 30, 36, 0.34)"],
  floating: ["rgba(239, 248, 249, 0.28)", "rgba(16, 29, 35, 0.32)"],
  tooltip: ["rgba(239, 248, 249, 0.36)", "rgba(14, 27, 33, 0.4)"],
  modal: ["rgba(235, 246, 248, 0.32)", "rgba(13, 26, 32, 0.36)"],
})) {
  const values = [...liquidGlass.matchAll(new RegExp(`--liquid-glass-q3-${q3Tint}-tint:\\s*([^;]+);`, "g"))]
    .map((match) => match[1]);
  assert.deepEqual(values, expectedValues, `Q3 must retain the approved light and dark ${q3Tint} tints`);
}
const liquidGlassLightProductBackground = liquidGlass.match(
  /body\[data-ui-skin="liquid-glass"\] \{\n  background:\n([\s\S]*?)\n  background-attachment:/,
);
const liquidGlassDarkProductBackground = liquidGlass.match(
  /body\.dark-theme\[data-ui-skin="liquid-glass"\] \{\n  background:\n([\s\S]*?)\n\}/,
);
assert(
  liquidGlassLightProductBackground
    && liquidGlassDarkProductBackground
    && !/repeating-linear-gradient\(/.test(liquidGlassLightProductBackground[1])
    && !/repeating-linear-gradient\(/.test(liquidGlassDarkProductBackground[1])
    && (liquidGlassLightProductBackground[1].match(/radial-gradient\(/g) || []).length === 3
    && (liquidGlassDarkProductBackground[1].match(/radial-gradient\(/g) || []).length === 3
    && (liquidGlass.match(/repeating-linear-gradient\(/g) || []).length === 2,
  "Liquid Glass product backgrounds must use only the continuous color field while diagnostics retain their test grid",
);
assert(
  !liquidGlass.includes("--liquid-glass-static-refraction")
    && !liquidGlass.includes("liquid-glass-refraction-soft")
    && !liquidGlass.includes("liquid-glass-refraction-strong"),
  "Pending and failed LQ-6 surfaces must use ordinary component blur without a fixed URL-filter fallback",
);
for (const definition of liquidGlassSurfaceDefinitions) {
  for (const selector of definition.selector.split(",").map((value) => value.trim())) {
    assert(
      liquidGlass.includes(selector),
      `Liquid Glass CSS must configure the ${definition.role} registry selector: ${selector}`,
    );
  }
  if (definition.sampleBackdrop) {
    assert(
      liquidGlass.includes(`[data-liquid-glass-role="${definition.role}"]`),
      `Liquid Glass optical CSS must consume the ${definition.role} runtime role`,
    );
  }
}
const liquidGlassMicroDefinition = liquidGlassSurfaceDefinitions.find(({ role }) => role === "micro");
assert(
  liquidGlassMicroDefinition
    && liquidGlassMicroDefinition.sampleBackdrop === false
    && liquidGlassMicroDefinition.registration === "css"
    && !liquidGlass.includes('[data-liquid-glass-role="micro"]'),
  "LQ-5 micro surfaces must remain CSS volume materials without per-control backdrop maps",
);
for (const explicitSelector of [
  ".entry-context-menu",
  ".app-tooltip.chip-list-tooltip",
  ".app-tooltip.tag-info-tooltip",
  ".app-tooltip.rich-tooltip",
  ".entry-quality-issue-tooltip",
  ".toast",
]) {
  const definition = liquidGlassSurfaceDefinitions.find(({ selector }) => selector.includes(explicitSelector));
  assert.equal(
    definition?.registration,
    "explicit",
    `Transient or virtualized surface must use explicit lifecycle registration: ${explicitSelector}`,
  );
}
const liquidGlassFocusDefinition = liquidGlassSurfaceDefinitions.find(({ role }) => role === "focus");
assert(
  liquidGlassFocusDefinition?.registration === "automatic"
    && liquidGlassFocusDefinition.selector.includes(".entry-display")
    && liquidGlassFocusDefinition.selector.includes("#entryForm")
    && liquidGlass.includes(':is(.entry-display, #entryForm)')
    && /:where\(#entryForm\)\s*\{[\s\S]*?background:\s*var\(--material-entry-detail-background\);[\s\S]*?backdrop-filter:\s*var\(--material-entry-detail-filter\);/.test(liquidGlass),
  "Liquid Glass focus optics must cover both the current entry display and the primary entry form shell",
);
assert(
  /function syncToastLiquidGlassSurface\(\) \{[\s\S]*?classList\.contains\("show"\)[\s\S]*?registerMappedSurface\(elements\.toast\)[\s\S]*?unregisterMappedSurface\(elements\.toast\)[\s\S]*?\n\}/.test(app)
    && /function showToast\(message\) \{[\s\S]*?classList\.add\("show"\);\n  syncToastLiquidGlassSurface\(\);[\s\S]*?classList\.remove\("show"\);\n    syncToastLiquidGlassSurface\(\);/.test(app)
    && /body\[data-ui-skin="liquid-glass"\] \.toast \{[\s\S]*?background:\s*var\(--material-floating-background\);[\s\S]*?color:\s*var\(--ui-text\);[\s\S]*?backdrop-filter:\s*var\(--material-floating-filter\);/.test(liquidGlass),
  "Liquid Glass toast optics must use the floating material only for the visible toast lifecycle",
);
assert.deepEqual(
  liquidGlassStyleBlocks
    .filter(({ selector, declarations }) => (
      /(?:^|[\s,>+~])(?:\.entry-card|\.analysis-card|\.table-row|\.network-node)(?:$|[\s,:.#\[>+~])/i.test(selector)
        && /(?:--liquid-glass-optical-filter|data-liquid-glass-optics)/.test(declarations)
    ))
    .map(({ selector }) => selector),
  [],
  "Repeated surfaces must not receive Liquid Glass SVG refraction",
);
assert(
  /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/.test(layeredGlass),
  "Layered Glass must provide a no-backdrop-filter fallback",
);
assert(
  /@media \(prefers-reduced-transparency: reduce\)/.test(layeredGlass),
  "Layered Glass must provide a reduced-transparency fallback",
);
assert(
  /@media \(forced-colors: active\)/.test(layeredGlass),
  "Layered Glass must provide a forced-colors fallback",
);
const layeredGlassStyleBlocks = [...layeredGlass.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((match) => ({ selector: match[1].trim(), declarations: match[2] }));
assert.deepEqual(
  layeredGlassStyleBlocks
    .filter(({ selector, declarations }) => (
      repeatedSurfaceSelectorPattern.test(selector) && /backdrop-filter\s*:/.test(declarations)
    ))
    .map(({ selector }) => selector),
  [],
  "Repeated content surfaces must not receive Layered Glass backdrop blur",
);
assert(
  !/(?:transition|animation)[^;]*(?:backdrop-filter|blur\(|box-shadow)/i.test(layeredGlass),
  "Layered Glass must not animate blur or large material shadows",
);
const overlayAnimationBlock = styles.slice(
  styles.indexOf("@keyframes overlayIn"),
  styles.indexOf("@keyframes networkIn"),
);
const networkAnimationBlock = styles.slice(
  styles.indexOf("@keyframes networkIn"),
  styles.indexOf("@keyframes tooltipIn"),
);
assert(
  overlayAnimationBlock.includes("background-color: transparent")
    && !overlayAnimationBlock.includes("opacity"),
  "Overlay entry animation must fade the scrim color without creating an opacity backdrop root",
);
assert(
  networkAnimationBlock.includes("transform:")
    && !networkAnimationBlock.includes("opacity"),
  "Network panel entry animation must preserve backdrop sampling while moving the panel",
);
const componentStyleBlocks = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((match) => ({ selector: match[1].trim(), declarations: match[2] }));
for (const [backgroundToken, filterToken] of [
  ["--material-floating-background", "--material-floating-filter"],
  ["--material-overlay-panel-background", "--material-floating-filter"],
  ["--material-rich-tooltip-background", "--material-rich-tooltip-filter"],
  ["--material-entry-detail-background", "--material-entry-detail-filter"],
  ["--material-entry-detail-mobile-background", "--material-entry-detail-mobile-filter"],
  ["--material-mobile-bar-background", "--material-mobile-bar-filter"],
  ["--material-navigation-drawer-background", "--material-navigation-drawer-filter"],
]) {
  const consumers = componentStyleBlocks.filter(({ declarations }) => (
    declarations.includes(`background: var(${backgroundToken});`)
  ));
  assert(consumers.length > 0, `Material background must have an active consumer: ${backgroundToken}`);
  for (const { selector, declarations } of consumers) {
    assert(
      declarations.includes(`backdrop-filter: var(${filterToken});`),
      `${selector} must pair ${backgroundToken} with ${filterToken}`,
    );
  }
}
assert(
  /body\[data-ui-skin="layered-glass"\] :where\(#entryForm\) \{[\s\S]*?border-color:\s*var\(--material-entry-detail-border\);[\s\S]*?background:\s*var\(--material-entry-detail-background\);[\s\S]*?box-shadow:\s*var\(--material-entry-detail-shadow\);[\s\S]*?backdrop-filter:\s*var\(--material-entry-detail-filter\);/.test(layeredGlass)
    && /@media \(max-width: 799\.98px\) \{[\s\S]*?body\[data-ui-skin="layered-glass"\] :where\(#entryForm\) \{[\s\S]*?background:\s*var\(--material-entry-detail-mobile-background\);[\s\S]*?backdrop-filter:\s*var\(--material-entry-detail-mobile-filter\);/.test(layeredGlass),
  "Layered Glass must treat the mutually exclusive primary entry form as the focused entry workspace shell",
);
assert.deepEqual(
  [...layeredGlass.matchAll(/--material-toast-background:\s*([^;]+);/g)].map((match) => match[1]),
  ["#172126", "#081115"],
  "Layered Glass toast must remain a high-contrast solid in light and dark themes",
);
const pointerLightingRule = layeredGlass.match(
  /body\[data-ui-skin="layered-glass"\] :where\([^)]*\)\[data-layered-glass-pointer\] \{([\s\S]*?)\n\}/,
);
assert(pointerLightingRule, "LG-4C must declare a bounded pointer-lighting rule");
assert.equal(
  (pointerLightingRule[1].match(/radial-gradient\(/gi) || []).length,
  5,
  "LG-4C may use only one point light and four bounded edge glints",
);
assert(
  !/radial-gradient\(/i.test(layeredGlass.replace(pointerLightingRule[0], "")),
  "Radial gradients may only serve the bounded LG-4C pointer response",
);
const pointerTargetContract = app.match(/const LAYERED_GLASS_POINTER_TARGET_SELECTOR = \[([\s\S]*?)\]\.join\(", "\);/);
assert(pointerTargetContract, "LG-4C must declare an explicit pointer-responsive surface allowlist");
assert(
  index.includes('aria-controls="skinPickerMenu"')
    && index.includes('id="skinPickerMenu" role="menu"'),
  "The skin selector must expose a top-level menu controlled by its navigation trigger",
);
assert(
  numericLayer("--layer-drawer") < numericLayer("--layer-floating-menu")
    && numericLayer("--layer-floating-menu") < numericLayer("--layer-network-overlay"),
  "Top-level floating menus must render above mobile drawers and below full overlays",
);
for (const requiredTarget of [
  "entry-search-config-menu",
  "entry-filter-menu",
  "source-suggestions",
  "entry-context-menu",
  "skin-picker-menu",
  "modal-panel",
  "network-panel",
]) {
  assert(
    pointerTargetContract[1].includes(requiredTarget),
    `LG-4C pointer allowlist must include ${requiredTarget}`,
  );
  assert(
    pointerLightingRule[0].includes(`.${requiredTarget}`),
    `LG-4C pointer styling must include ${requiredTarget}`,
  );
}
for (const floatingTarget of ["source-suggestions", "entry-context-menu"]) {
  assert.equal(
    (layeredGlass.match(new RegExp(`\\.${floatingTarget}\\b`, "g")) || []).length,
    3,
    `LG-4C floating pointer styling must cover ${floatingTarget} in base, surface, and dark rules`,
  );
}
assert(
  !pointerTargetContract[1].includes("dictionary-panel"),
  "LG-4C pointer response must remain limited to popup surfaces",
);
for (const forbiddenTarget of [
  "entry-card",
  "entry-display",
  "entryForm",
  "toast",
  "analysis-card",
  "table-row",
  "network-node",
]) {
  assert(
    !pointerTargetContract[1].includes(forbiddenTarget)
      && !pointerLightingRule[0].includes(forbiddenTarget),
    `LG-4C pointer response must remain off non-popup surface: ${forbiddenTarget}`,
  );
}
assert(
  /requestAnimationFrame\(flushLayeredGlassPointerEffect\)/.test(app),
  "LG-4C pointer updates must be coalesced through requestAnimationFrame",
);
assert(
  !/data-layered-glass-pointer="active"[^}]*background-position/s.test(layeredGlass)
    && /--layered-glass-pointer-surface/.test(layeredGlass)
    && /--layered-glass-point-alpha/.test(layeredGlass)
    && /--layered-glass-edge-alpha/.test(layeredGlass),
  "LG-4C.1 must layer bounded point and edge lighting over a fixed base material",
);
for (const edge of ["top", "right", "bottom", "left"]) {
  assert(app.includes(`--layered-glass-edge-${edge}`), `LG-4C.1 must calculate ${edge} edge proximity`);
}
for (const mediaQueryName of [
  "glassFinePointerMediaQuery",
  "glassReducedMotionMediaQuery",
  "glassReducedTransparencyMediaQuery",
  "glassForcedColorsMediaQuery",
]) {
  assert(app.includes(mediaQueryName), `LG-4C must retain its ${mediaQueryName} guard`);
}
assert(
  app.includes('document.addEventListener("pointermove", handleDocumentPointerMove, { passive: true });')
    && !app.includes('document.addEventListener("pointermove", scheduleLayeredGlassPointerEffect')
    && !app.includes("scheduleLiquidGlassLightEffect"),
  "The shared passive pointer dispatcher must retain tooltip and Layered Glass behavior without Liquid Glass local lighting",
);
assert(
  !/conic-gradient\(/i.test(liquidGlass)
    && !/--liquid-glass-light|data-liquid-glass-light|liquidGlassLight/.test(`${liquidGlass}\n${app}`)
    && !/liquid-glass-settle|SurfaceSettle|settleTasks/.test(`${liquidGlass}\n${liquidGlassEngine}`),
  "Q3 must not retain CSS caustics, painted rims, local-light scheduling, or decorative settle state",
);
const retiredLiquidOptics = `${index}\n${liquidGlass}\n${app}\n${liquidGlassEngine}`;
for (const retiredIdentifier of [
  "liquid-glass-refraction-soft",
  "liquid-glass-refraction-strong",
  "feTurbulence",
  "--liquid-glass-static-refraction",
  "--liquid-glass-edge-cool",
  "--liquid-glass-edge-warm",
  "data-liquid-glass-pointer",
  "--liquid-glass-pointer",
  "--liquid-glass-caustic",
  "liquidGlassPointer",
  "LIQUID_GLASS_POINTER",
]) {
  assert(
    !retiredLiquidOptics.includes(retiredIdentifier),
    `LQ-6 must remove retired optical identifier: ${retiredIdentifier}`,
  );
}
assert(
  styles.includes("box-shadow: var(--material-navigation-control-hover-shadow);"),
  "Navigation controls must use the navigation hover shadow instead of generic control hover styling",
);
assert(
  styles.includes("box-shadow: var(--material-navigation-control-pressed-shadow);"),
  "Navigation controls must use the navigation pressed shadow instead of generic control pressed styling",
);
assert(
  styles.includes("background: var(--material-navigation-drawer-background);")
    && styles.includes("backdrop-filter: var(--material-navigation-drawer-filter);"),
  "Mobile navigation drawers must consume their dedicated overlay material",
);
assert(
  styles.includes("background: var(--material-entry-detail-background);")
    && styles.includes("background: var(--material-entry-detail-section-background);")
    && styles.includes("backdrop-filter: var(--material-entry-detail-filter);"),
  "Entry detail must use its focused-object shell and stable section materials",
);
assert(
  styles.includes("background: var(--material-rich-tooltip-background);")
    && styles.includes("backdrop-filter: var(--material-rich-tooltip-filter);")
    && /--material-rich-tooltip-filter:\s*none;/.test(tokens)
    && /--material-rich-tooltip-filter:\s*blur\(18px\)/.test(layeredGlass)
    && app.includes('group.dataset.appTooltipVariant = "rich";'),
  "Structured tag tooltips must use a skin-scoped, degradable backdrop filter",
);
assert(
  (tokens.match(/--material-rich-tooltip-muted:\s*var\(--ui-text-muted\);/g) || []).length === 2
    && (layeredGlass.match(/--material-rich-tooltip-muted:\s*var\(--ui-text-muted\);/g) || []).length === 2
    && (liquidGlass.match(/--material-rich-tooltip-muted:\s*var\(--ui-text-muted\);/g) || []).length === 2
    && layeredGlass.includes("--material-rich-tooltip-muted: CanvasText;")
    && liquidGlass.includes("--material-rich-tooltip-muted: CanvasText;")
    && styles.includes(".tag-tooltip-label {\n  color: var(--material-rich-tooltip-muted);")
    && /\.app-tooltip \.network-tooltip-content > span,[\s\S]*?color:\s*var\(--material-rich-tooltip-muted\);/.test(styles)
    && !/\.network-tooltip-content[\s\S]*?color:\s*var\(--material-tooltip-muted\);/.test(styles)
    && /\.chip\.amber\s*\{[^}]*color:\s*var\(--ui-warning-badge-text\);/s.test(styles)
    && /\.chip\.part-chip\s*\{[^}]*color:\s*var\(--ui-warning-badge-text\);/s.test(styles)
    && /\.entry-quality-issue\.medium\s*\{[^}]*color:\s*var\(--ui-warning-badge-text\);/s.test(styles)
    && !styles.includes("var(--text)"),
  "Structured tooltips and compact warning badges must use theme-aware readable text contracts",
);
assert(
  /input:is\(\[type="checkbox"\], \[type="radio"\]\)\s*\{[^}]*box-shadow:\s*none;/s.test(styles)
    && /input:is\(\[type="checkbox"\], \[type="radio"\]\):focus-visible/.test(styles)
    && /body\[data-input-modality="pointer"\][^{]*input:is\(\[type="checkbox"\], \[type="radio"\]\):focus-visible/.test(styles),
  "Native choice controls must avoid text-control material shadows and retain keyboard focus visibility",
);

const themeToggleMarkup = index.match(/<button[^>]*id="themeToggleButton"[\s\S]*?<\/button>/)?.[0] || "";
const languageToggleMarkup = index.match(/<button[^>]*id="languageToggleButton"[\s\S]*?<\/button>/)?.[0] || "";
assert(
  themeToggleMarkup.includes('class="secondary-button utility-button theme-toggle-button"')
    && themeToggleMarkup.includes('type="button"')
    && themeToggleMarkup.includes('data-theme-state="light"')
    && themeToggleMarkup.includes('aria-pressed="false"')
    && themeToggleMarkup.includes('aria-label="暗黑模式"')
    && themeToggleMarkup.includes('class="nav-icon theme-toggle-icon"')
    && themeToggleMarkup.includes('class="theme-toggle-glyph theme-toggle-sun"')
    && themeToggleMarkup.includes('<circle cx="12" cy="12" r="4"></circle>')
    && themeToggleMarkup.includes('class="theme-toggle-glyph theme-toggle-moon"'),
  "Theme toggle must provide both current-state glyphs and an accessible light-theme default",
);
assert(
  !app.includes("lightMode:")
    && app.includes('const themeToggleLabel = t("darkMode");')
    && app.includes("elements.themeToggleLabel.textContent = themeToggleLabel;")
    && app.includes('elements.themeToggleButton.setAttribute("aria-label", themeToggleLabel);')
    && app.includes('elements.themeToggleButton.dataset.themeState = darkThemeActive ? "dark" : "light";')
    && app.includes('elements.themeToggleButton.setAttribute("aria-pressed", String(darkThemeActive));')
    && languageToggleMarkup.includes('aria-label="English"')
    && !languageToggleMarkup.includes("aria-pressed"),
  "Theme toggle must keep a stable setting label and pressed state without changing language-button semantics",
);
const themeToggleMotionStart = styles.indexOf(".theme-toggle-icon {");
const themeToggleMotionEnd = styles.indexOf(".nav-collapse-icon {");
const themeToggleMotion = styles.slice(themeToggleMotionStart, themeToggleMotionEnd);
assert(
  themeToggleMotionStart >= 0
    && themeToggleMotionEnd > themeToggleMotionStart
    && themeToggleMotion.includes("transform-box: fill-box;")
    && themeToggleMotion.includes("transform-origin: center;")
    && themeToggleMotion.includes("transition: opacity 180ms cubic-bezier(0.22, 0.75, 0.25, 1), transform 180ms cubic-bezier(0.22, 0.75, 0.25, 1);")
    && themeToggleMotion.includes('.theme-toggle-button[data-theme-state="light"] .theme-toggle-sun')
    && themeToggleMotion.includes('.theme-toggle-button[data-theme-state="dark"] .theme-toggle-moon')
    && themeToggleMotion.includes("transform: rotate(0deg) scale(1);")
    && themeToggleMotion.includes("transform: rotate(-28deg) scale(0.72);")
    && themeToggleMotion.includes("transform: rotate(28deg) scale(0.72);")
    && !/(?:color|filter|animation)\s*:/.test(themeToggleMotion),
  "Theme glyphs must use the shared color-neutral 180ms orbital transition",
);
const finalReducedMotionBlock = styles.slice(styles.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
assert(
  /body\.app-booting :where\([^)]*\.theme-toggle-glyph/.test(styles)
    && /body\.app-boot-settling :where\([^)]*\.theme-toggle-glyph/.test(styles)
    && finalReducedMotionBlock.includes(".theme-toggle-glyph {")
    && finalReducedMotionBlock.includes("transition: none;"),
  "Theme glyph motion must be suppressed during boot and when reduced motion is requested",
);

const layeredGlassTokenValues = (tokenName) => [
  ...layeredGlass.matchAll(new RegExp(`${tokenName}\\s*:\\s*([^;]+);`, "g")),
].map((match) => match[1]);
for (const tokenName of [
  "--material-floating-background",
  "--material-mobile-bar-background",
  "--material-navigation-background",
  "--material-navigation-drawer-background",
  "--material-overlay-panel-background",
]) {
  const themeValues = layeredGlassTokenValues(tokenName).slice(0, 2);
  assert.equal(themeValues.length, 2, `${tokenName} must define light and dark Layered Glass values`);
  assert(
    themeValues.every((value) => !/gradient\(/.test(value)),
    `${tokenName} must remain free of fixed optical gradients`,
  );
}
for (const tokenName of [
  "--material-entry-detail-background",
  "--material-entry-detail-mobile-background",
]) {
  const themeValues = layeredGlassTokenValues(tokenName).slice(0, 2);
  assert.equal(themeValues.length, 2, `${tokenName} must define light and dark Layered Glass values`);
  assert(
    themeValues.every((value) => (value.match(/linear-gradient\(/g) || []).length === 2),
    `${tokenName} must remain the sole two-layer fixed-reflection material`,
  );
}
for (const tokenName of [
  "--material-panel-background",
  "--material-list-item-background",
  "--material-browser-background",
]) {
  const themeValues = layeredGlassTokenValues(tokenName).slice(0, 2);
  assert.equal(themeValues.length, 2, `${tokenName} must define light and dark Layered Glass values`);
  assert(
    themeValues.every((value) => !/gradient\(/.test(value)),
    `${tokenName} must remain a stable content surface without optical gradients`,
  );
}

const componentTokenDefinitions = [...styles.matchAll(new RegExp(`(${skinTokenPattern.source})\\s*:`, "g"))]
  .map((match) => match[1]);
assert.deepEqual(
  componentTokenDefinitions,
  [],
  `Skin tokens must be declared in theme-tokens.css: ${componentTokenDefinitions.join(", ")}`,
);

assert(!/body\.dark-theme/.test(styles), "Component CSS must not contain theme branches");
assert(
  !/--(?:bg|surface(?:-2)?|shadow)\b/.test(`${tokens}\n${layeredGlass}\n${liquidGlass}\n${styles}`),
  "Legacy theme aliases must not be restored",
);
assert(
  !/(?:^|[\s:(,])#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/im.test(styles),
  "Theme color literals belong in theme-tokens.css",
);
assert(
  !/(?:backdrop-filter\s*:\s*blur\(|filter\s*:\s*drop-shadow\()/i.test(styles),
  "Material blur and drop shadows belong in theme-tokens.css",
);

for (const match of styles.matchAll(/box-shadow\s*:\s*([^;]+);/gi)) {
  const value = match[1].trim();
  assert(
    value === "none" || value.startsWith("var(") || /^inset\b.*var\(--ui-/.test(value),
    `Material box shadow belongs in theme-tokens.css: ${value}`,
  );
}

console.log("Style skin contract checks passed.");
