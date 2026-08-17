#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const tokenPath = path.join(ROOT_DIR, "theme-tokens.css");
const layeredGlassPath = path.join(ROOT_DIR, "theme-layered-glass.css");
const liquidGlassPath = path.join(ROOT_DIR, "theme-liquid-glass.css");
const liquidGlassGeometryPath = path.join(ROOT_DIR, "lib", "liquid-glass-geometry.js");
const liquidGlassEnginePath = path.join(ROOT_DIR, "lib", "liquid-glass-engine.js");
const liquidGlassLabPath = path.join(ROOT_DIR, "liquid-glass-lab.html");
const stylesPath = path.join(ROOT_DIR, "styles.css");
const indexPath = path.join(ROOT_DIR, "index.html");
const appPath = path.join(ROOT_DIR, "app.js");
const tokens = fs.readFileSync(tokenPath, "utf8");
const layeredGlass = fs.readFileSync(layeredGlassPath, "utf8");
const liquidGlass = fs.readFileSync(liquidGlassPath, "utf8");
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
for (const methodName of [
  "normalizeSurfaceOptions",
  "mapDimensions",
  "sampleSurface",
  "generateSurfaceMaps",
  "buildCacheKey",
]) {
  assert.equal(
    typeof liquidGlassGeometryApi[methodName],
    "function",
    `Liquid Glass geometry API must expose ${methodName}`,
  );
}
assert.equal(typeof liquidGlassEngineApi.LiquidGlassEngine, "function", "Liquid Glass must expose its runtime engine");
assert.equal(typeof liquidGlassEngineApi.ByteBudgetLru, "function", "Liquid Glass must expose its byte-budget cache");
assert(
  !liquidGlassEngine.includes("MutationObserver"),
  "Liquid Glass must not scan virtualized content through a MutationObserver",
);
const liquidGlassLabInlineScripts = [...liquidGlassLab.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1].trim())
  .filter(Boolean);
for (const [scriptIndex, source] of liquidGlassLabInlineScripts.entries()) {
  assert.doesNotThrow(
    () => new Function(source),
    `Liquid Glass lab inline script ${scriptIndex + 1} must be valid JavaScript`,
  );
}
assert(
  liquidGlassLab.indexOf('src="lib/liquid-glass-geometry.js"')
    < liquidGlassLab.indexOf('src="lib/liquid-glass-engine.js"')
    && liquidGlassLab.includes('id="liquidGlassFilterDefs"'),
  "The standalone lab must load the production geometry and engine in dependency order",
);
assert(
  !/(?:fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|\/api\/)/.test(liquidGlassLab),
  "The standalone lab must not access product data, APIs, or persistent browser storage",
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
const liquidGlassNavigationRowRules = liquidGlassStyleBlocks.filter(({ selector }) => (
  selector.includes('.dictionary-panel') && selector.includes('.tool-button')
));
assert(
  liquidGlassNavigationRowRules.some(({ selector, declarations }) => (
    selector.endsWith('.dictionary-panel .tool-button')
      && /background:\s*transparent;/.test(declarations)
      && /box-shadow:\s*none;/.test(declarations)
  ))
    && liquidGlassNavigationRowRules.every(({ declarations }) => !/backdrop-filter\s*:/.test(declarations))
    && liquidGlassNavigationRowRules.some(({ selector, declarations }) => (
      selector.endsWith('.dictionary-panel .tool-button.active')
        && /background:\s*var\(--liquid-glass-navigation-active-background\);/.test(declarations)
        && !/(?:linear|radial|conic)-gradient\(/.test(declarations)
    )),
  "Liquid Glass navigation must remain one optical surface with flat rows and a non-optical active state",
);
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
assert(
  /@supports \(\(backdrop-filter: url\("#liquid-glass-optical-probe"\)\) or \(-webkit-backdrop-filter: url\("#liquid-glass-optical-probe"\)\)\)/.test(liquidGlass),
  "Liquid Glass refraction must be a progressive enhancement behind a URL-filter support query",
);
const liquidGlassSurfaceDefinitions = liquidGlassEngineApi.SURFACE_ROLE_DEFINITIONS;
assert(liquidGlassSurfaceDefinitions.length > 0, "Liquid Glass must define its formal surface registry");
for (const definition of liquidGlassSurfaceDefinitions) {
  assert(
    typeof definition.selector === "string"
      && definition.selector.trim()
      && Object.hasOwn(liquidGlassEngineApi.ROLE_DEFAULTS, definition.role)
      && ["automatic", "explicit", "css"].includes(definition.registration),
    `Liquid Glass surface registration must reference a configured role: ${definition.selector}`,
  );
}
const liquidGlassContinuousDefinitions = liquidGlassSurfaceDefinitions.filter(({ role }) => role === "continuous");
assert.deepEqual(
  new Map(liquidGlassContinuousDefinitions.map(({ selector, overrides }) => [selector, overrides?.edgeMode])),
  new Map([[".dictionary-panel", "right"], [".mobile-app-bar", "bottom"]]),
  "Attached continuous surfaces must sample only their exposed edge",
);
const liquidGlassOpticalRoleRule = liquidGlassStyleBlocks.find(({ selector, declarations }) => (
  selector.includes('[data-liquid-glass-optics-quality="q3"]')
    && selector.includes('[data-liquid-glass-optics="ready"]')
    && declarations.includes("backdrop-filter: var(--liquid-glass-optical-filter);")
));
assert(liquidGlassOpticalRoleRule, "Q3 must apply generated optics only to ready runtime roles");
assert(
  liquidGlassOpticalRoleRule.declarations.includes("background: var(--liquid-glass-q3-surface-tint);")
    && !/blur\(/.test(liquidGlassOpticalRoleRule.declarations),
  "Q3 must use a low-alpha role tint and generated optics without the Q1 material blur",
);
for (const role of new Set(
  liquidGlassSurfaceDefinitions.filter(({ sampleBackdrop }) => sampleBackdrop).map(({ role }) => role),
)) {
  assert(
    liquidGlassOpticalRoleRule.selector.includes(`[data-liquid-glass-role="${role}"]`),
    `Q3 ready-state styling must cover the ${role} surface role`,
  );
}
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
    && !/repeating-linear-gradient\(/.test(liquidGlassDarkProductBackground[1]),
  "Liquid Glass product backgrounds must not paint diagnostic grid textures",
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
const layeredGlassToastValues = [...layeredGlass.matchAll(/--material-toast-background:\s*([^;]+);/g)]
  .map((match) => match[1]);
assert(
  layeredGlassToastValues.length >= 2
    && layeredGlassToastValues.every((value) => !/gradient\(|rgba?\([^)]*,\s*0(?:\.\d+)?\s*\)/i.test(value)),
  "Layered Glass toast must remain solid in light and dark themes",
);
const pointerLightingRule = layeredGlass.match(
  /body\[data-ui-skin="layered-glass"\] :where\([^)]*\)\[data-layered-glass-pointer\] \{([\s\S]*?)\n\}/,
);
assert(pointerLightingRule, "LG-4C must declare a bounded pointer-lighting rule");
assert(
  /radial-gradient\(/i.test(pointerLightingRule[1])
    && !/radial-gradient\(/i.test(layeredGlass.replace(pointerLightingRule[0], "")),
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
  !/data-layered-glass-pointer="active"[^}]*background-position/s.test(layeredGlass)
    && /--layered-glass-pointer-surface/.test(layeredGlass)
    && /--layered-glass-point-alpha/.test(layeredGlass)
    && /--layered-glass-edge-alpha/.test(layeredGlass),
  "LG-4C.1 must layer bounded point and edge lighting over a fixed base material",
);
for (const edge of ["top", "right", "bottom", "left"]) {
  assert(app.includes(`--layered-glass-edge-${edge}`), `LG-4C.1 must calculate ${edge} edge proximity`);
}
assert(
  (app.match(/document\.addEventListener\("pointermove",[^\n]+\{ passive: true \}\);/g) || []).length === 1
    && app.includes('(hover: hover) and (pointer: fine)')
    && app.includes('(prefers-reduced-motion: reduce)')
    && app.includes('(prefers-reduced-transparency: reduce)')
    && app.includes('(forced-colors: active)'),
  "Interactive glass effects must share one passive pointer listener and honor assisted-mode guards",
);
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
    && app.includes('group.dataset.appTooltipVariant = "rich";'),
  "Structured tag tooltips must use a skin-scoped, degradable backdrop filter",
);
assert(
  tokens.includes("--material-rich-tooltip-muted: var(--ui-text-muted);")
    && layeredGlass.includes("--material-rich-tooltip-muted: var(--ui-text-muted);")
    && liquidGlass.includes("--material-rich-tooltip-muted: var(--ui-text-muted);")
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
    && themeToggleMarkup.includes('class="theme-toggle-glyph theme-toggle-moon"'),
  "Theme toggle must provide both current-state glyphs and an accessible light-theme default",
);
assert(
  app.includes('const themeToggleLabel = t("darkMode");')
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
    && /transition:[^;]*opacity[^;]*transform|transition:[^;]*transform[^;]*opacity/.test(themeToggleMotion)
    && themeToggleMotion.includes('.theme-toggle-button[data-theme-state="light"] .theme-toggle-sun')
    && themeToggleMotion.includes('.theme-toggle-button[data-theme-state="dark"] .theme-toggle-moon')
    && !/(?:color|filter|animation)\s*:/.test(themeToggleMotion),
  "Theme glyphs must use a shared color-neutral opacity and transform transition",
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
