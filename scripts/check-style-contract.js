#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const tokenPath = path.join(ROOT_DIR, "theme-tokens.css");
const layeredGlassPath = path.join(ROOT_DIR, "theme-layered-glass.css");
const stylesPath = path.join(ROOT_DIR, "styles.css");
const indexPath = path.join(ROOT_DIR, "index.html");
const appPath = path.join(ROOT_DIR, "app.js");
const tokens = fs.readFileSync(tokenPath, "utf8");
const layeredGlass = fs.readFileSync(layeredGlassPath, "utf8");
const styles = fs.readFileSync(stylesPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");

const tokenLinkPosition = index.indexOf('href="theme-tokens.css"');
const layeredGlassLinkPosition = index.indexOf('href="theme-layered-glass.css"');
const stylesLinkPosition = index.indexOf('href="styles.css"');
assert(tokenLinkPosition >= 0, "index.html must load theme-tokens.css");
assert(layeredGlassLinkPosition >= 0, "index.html must load theme-layered-glass.css");
assert(stylesLinkPosition >= 0, "index.html must load styles.css");
assert(
  tokenLinkPosition < layeredGlassLinkPosition && layeredGlassLinkPosition < stylesLinkPosition,
  "Skin stylesheets must load after base tokens and before component styles",
);

const skinTokenPattern = /--(?:ui|material|radius)-[a-z0-9-]+/g;
const tokenDefinitions = new Set(
  [...tokens.matchAll(/(--(?:ui|material|radius)-[a-z0-9-]+)\s*:/g)]
    .map((match) => match[1]),
);
const tokenReferences = new Set(
  [...`${tokens}\n${layeredGlass}\n${styles}`.matchAll(/var\(\s*(--(?:ui|material|radius)-[a-z0-9-]+)/g)]
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
const classicDarkTheme = tokens.match(/body\.dark-theme\s*\{([\s\S]*?)\n\}/);
assert(classicDarkTheme, "Base tokens must define a classic dark theme scope");
for (const tokenName of [
  "--material-entry-detail-background",
  "--material-entry-detail-mobile-background",
  "--material-entry-detail-border",
  "--material-entry-detail-shadow",
  "--material-entry-detail-section-background",
  "--material-entry-detail-section-border",
]) {
  assert(
    classicDarkTheme[1].includes(`${tokenName}:`),
    `Classic dark theme must override scoped entry detail token: ${tokenName}`,
  );
}
assert(
  layeredGlass.includes('body[data-ui-skin="layered-glass"]'),
  "Layered Glass tokens must use the layered-glass skin scope",
);
assert(!/:root\b/.test(layeredGlass), "Skin overrides must not modify the root token scope");
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
  "layeredGlassFinePointerMediaQuery",
  "layeredGlassReducedMotionMediaQuery",
  "layeredGlassReducedTransparencyMediaQuery",
  "layeredGlassForcedColorsMediaQuery",
]) {
  assert(app.includes(mediaQueryName), `LG-4C must retain its ${mediaQueryName} guard`);
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
  "--material-entry-detail-background",
  "--material-entry-detail-mobile-background",
]) {
  const themeValues = layeredGlassTokenValues(tokenName).slice(0, 2);
  assert.equal(themeValues.length, 2, `${tokenName} must define light and dark Layered Glass values`);
  assert(
    themeValues.every((value) => (value.match(/linear-gradient\(/g) || []).length === 2),
    `${tokenName} must use two static linear optical layers in both themes`,
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
  !/--(?:bg|surface(?:-2)?|shadow)\b/.test(`${tokens}\n${layeredGlass}\n${styles}`),
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
