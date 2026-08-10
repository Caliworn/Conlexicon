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
const stylesPath = path.join(ROOT_DIR, "styles.css");
const indexPath = path.join(ROOT_DIR, "index.html");
const appPath = path.join(ROOT_DIR, "app.js");
const tokens = fs.readFileSync(tokenPath, "utf8");
const layeredGlass = fs.readFileSync(layeredGlassPath, "utf8");
const liquidGlass = fs.readFileSync(liquidGlassPath, "utf8");
const liquidGlassGeometry = fs.readFileSync(liquidGlassGeometryPath, "utf8");
const liquidGlassWorker = fs.readFileSync(liquidGlassWorkerPath, "utf8");
const liquidGlassEngine = fs.readFileSync(liquidGlassEnginePath, "utf8");
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
    && app.includes('liquidGlassOpticalEngine?.setEnabled(currentSkin === "liquid-glass")'),
  "The shared app must limit LQ-4 integration to the skin lifecycle adapter",
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
assert(liquidGlassFilterDefs, "LQ-2 must provide page-level SVG filter definitions");
assert.equal(
  (liquidGlassFilterDefs[0].match(/<filter id="liquid-glass-refraction-(?:soft|strong)"/g) || []).length,
  2,
  "LQ-2 must define exactly one soft and one strong refraction filter",
);
assert.equal(
  (liquidGlassFilterDefs[0].match(/<feDisplacementMap\b/g) || []).length,
  2,
  "Each Liquid Glass filter must contain one displacement stage",
);
assert(
  liquidGlassFilterDefs[0].includes('id="liquid-glass-refraction-soft"')
    && liquidGlassFilterDefs[0].includes('scale="6"')
    && liquidGlassFilterDefs[0].includes('id="liquid-glass-refraction-strong"')
    && liquidGlassFilterDefs[0].includes('scale="14"'),
  "LQ-2 soft and strong filters must retain bounded, distinct displacement scales",
);
assert(
  /@supports \(\(backdrop-filter: url\("#liquid-glass-refraction-soft"\)\) or \(-webkit-backdrop-filter: url\("#liquid-glass-refraction-soft"\)\)\)/.test(liquidGlass),
  "Liquid Glass refraction must be a progressive enhancement behind a URL-filter support query",
);
assert(
  /body\[data-ui-skin="liquid-glass"\] :is\([\s\S]*?\.app-tooltip\.chip-list-tooltip,[\s\S]*?\.app-tooltip\.tag-info-tooltip,[\s\S]*?\.app-tooltip\.rich-tooltip[\s\S]*?\) \{[\s\S]*?liquid-glass-refraction-strong/.test(liquidGlass),
  "Structured tooltip refraction must outrank the shared two-class tooltip material rule",
);
for (const selector of [
  ".entry-display",
  ".mobile-app-bar",
  ".entry-search-config-menu:not([hidden])",
  ".entry-filter-menu:not([hidden])",
  ".source-suggestions:not([hidden])",
  ".entry-context-menu:not([hidden])",
  ".skin-picker-menu:not([hidden])",
  ".app-tooltip.chip-list-tooltip",
  ".app-tooltip.tag-info-tooltip",
  ".app-tooltip.rich-tooltip",
  ".modal-panel",
  ".network-panel",
]) {
  assert(liquidGlass.includes(selector), `LQ-2 refraction allowlist must include ${selector}`);
}
assert.deepEqual(
  liquidGlassStyleBlocks
    .filter(({ selector, declarations }) => (
      /(?:^|[\s,>+~])(?:\.entry-card|\.analysis-card|\.table-row|\.network-node)(?:$|[\s,:.#\[>+~])/i.test(selector)
        && /liquid-glass-refraction/.test(declarations)
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
assert(
  !/(?:entry-card|analysis-card|table-row|td|th)[^{]*\{[^}]*backdrop-filter/is.test(layeredGlass),
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
const pointerLightingRule = layeredGlass.match(
  /body\[data-ui-skin="layered-glass"\] :where\([\s\S]*?\)\[data-layered-glass-pointer\] \{([\s\S]*?)\n\}/,
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
for (const forbiddenTarget of ["entry-card", "entry-display", "analysis-card", "table-row", "network-node"]) {
  assert(
    !pointerTargetContract[1].includes(forbiddenTarget),
    `LG-4C pointer response must not target repeated content surface: ${forbiddenTarget}`,
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
const liquidPointerLightingRule = liquidGlass.match(
  /body\[data-ui-skin="liquid-glass"\] :where\([\s\S]*?\)\[data-liquid-glass-pointer\] \{([\s\S]*?)\n\}/,
);
assert(liquidPointerLightingRule, "LQ-3 must declare a bounded caustic rule");
assert.equal(
  (liquidPointerLightingRule[1].match(/radial-gradient\(/gi) || []).length,
  5,
  "LQ-3 may use only one broad caustic and four bounded edge glints",
);
assert(
  liquidPointerLightingRule[1].includes("--liquid-glass-caustic-opacity: 0")
    && liquidPointerLightingRule[1].includes("var(--liquid-glass-pointer-surface)"),
  "LQ-3 must layer an idle caustic over the fixed material surface",
);
assert(
  !/(?:backdrop-filter|liquid-glass-refraction)/.test(liquidPointerLightingRule[1]),
  "LQ-3 pointer updates must not animate refraction or backdrop blur",
);
const liquidPointerTargetContract = app.match(/const LIQUID_GLASS_POINTER_TARGET_SELECTOR = \[([\s\S]*?)\]\.join\(", "\);/);
assert(liquidPointerTargetContract, "LQ-3 must declare an explicit pointer-responsive surface allowlist");
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
    liquidPointerTargetContract[1].includes(requiredTarget),
    `LQ-3 pointer allowlist must include ${requiredTarget}`,
  );
}
for (const forbiddenTarget of [
  "entry-card",
  "entry-display",
  "analysis-card",
  "table-row",
  "network-node",
  "mobile-app-bar",
  "app-tooltip",
]) {
  assert(
    !liquidPointerTargetContract[1].includes(forbiddenTarget),
    `LQ-3 pointer response must not target ${forbiddenTarget}`,
  );
}
assert(
  /requestAnimationFrame\(flushLiquidGlassPointerEffect\)/.test(app),
  "LQ-3 pointer updates must be coalesced through requestAnimationFrame",
);
assert(
  app.includes('document.addEventListener("pointermove", handleDocumentPointerMove, { passive: true });')
    && !app.includes('document.addEventListener("pointermove", scheduleLayeredGlassPointerEffect')
    && !app.includes('document.addEventListener("pointermove", scheduleLiquidGlassPointerEffect'),
  "Glass pointer effects must share one passive document-level pointermove dispatcher",
);
assert(
  /event\.pointerType === "touch"/.test(app)
    && /function liquidGlassPointerEffectsEnabled\(\)[\s\S]*glassFinePointerMediaQuery\.matches[\s\S]*!glassReducedMotionMediaQuery\.matches[\s\S]*!glassReducedTransparencyMediaQuery\.matches[\s\S]*!glassForcedColorsMediaQuery\.matches/.test(app),
  "LQ-3 must disable caustics for touch, reduced motion, reduced transparency, and forced colors",
);
for (const edge of ["top", "right", "bottom", "left"]) {
  assert(app.includes(`--liquid-glass-edge-${edge}`), `LQ-3 must calculate ${edge} edge proximity`);
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
  /input:is\(\[type="checkbox"\], \[type="radio"\]\)\s*\{[^}]*box-shadow:\s*none;/s.test(styles)
    && /input:is\(\[type="checkbox"\], \[type="radio"\]\):focus-visible/.test(styles)
    && /body\[data-input-modality="pointer"\][^{]*input:is\(\[type="checkbox"\], \[type="radio"\]\):focus-visible/.test(styles),
  "Native choice controls must avoid text-control material shadows and retain keyboard focus visibility",
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
