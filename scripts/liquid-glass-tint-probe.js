/*
 * Liquid Glass tint probe: a temporary visual test, not part of the app or check-all.
 *
 * Usage: open the app with the Liquid Glass skin, paste this file into the browser
 * console, and use the panel in the bottom-right corner. It scales the alpha of the
 * role surface tints (navigation, drawer, mobile bar, focus, floating, tooltip, modal),
 * optionally swaps the page background for a Lab photo, and toggles the theme.
 * Control recipes, borders and shadows are untouched. Everything is injected at
 * runtime and disappears on reload; call window.__liquidGlassTintProbe.remove()
 * to clean up earlier. Theme changes go through the app and are saved as usual,
 * so run it against a test data directory.
 */
(() => {
  window.__liquidGlassTintProbe?.remove();

  const ROLES = ["navigation", "navigation-drawer", "mobile-bar", "focus", "floating", "tooltip", "modal"];
  const PHOTOS = ["interior", "diamond-valley-lake-poppies", "whangarei-falls-footbridge", "turquoise-shallow-water-rocks", "people-in-dry-grass-field"];
  const state = { scale: 1, photo: -1 };
  // The dark theme defines its tokens and background on body.dark-theme[...],
  // so overrides must match that specificity to win in both themes.
  const SKIN_SELECTOR = 'body[data-ui-skin="liquid-glass"], body.dark-theme[data-ui-skin="liquid-glass"]';
  const tintStyle = document.createElement("style");
  const photoStyle = document.createElement("style");
  document.head.append(tintStyle, photoStyle);

  // Read the skin's own values for the current theme, so the probe never
  // carries a stale copy of the tokens.
  function baseTints() {
    const previous = tintStyle.textContent;
    tintStyle.textContent = "";
    const computed = getComputedStyle(document.body);
    const values = Object.fromEntries(ROLES.map((role) => [role, computed.getPropertyValue(`--liquid-glass-${role}-surface-tint`).trim()]));
    tintStyle.textContent = previous;
    return values;
  }

  function scaled(color, factor) {
    const match = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
    if (!match) {
      return color;
    }
    const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : Number(match[4]);
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${(alpha * factor).toFixed(3)})`;
  }

  function applyTint() {
    const base = baseTints();
    tintStyle.textContent = `${SKIN_SELECTOR} { ${ROLES.map((role) => `--liquid-glass-${role}-surface-tint: ${scaled(base[role], state.scale)};`).join(" ")} }`;
  }

  function applyPhoto() {
    photoStyle.textContent = state.photo < 0 ? "" : `${SKIN_SELECTOR} { background: url("assets/liquid-glass-lab/${PHOTOS[state.photo]}.jpg") center / cover no-repeat fixed; }`;
  }

  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:380px;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.78);color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)";
  const label = document.createElement("span");
  label.style.cssText = "flex-basis:100%;opacity:.85";

  function sync() {
    const background = state.photo < 0 ? "渐变" : PHOTOS[state.photo];
    const theme = document.body.classList.contains("dark-theme") ? "暗色" : "浅色";
    const skin = document.body.dataset.uiSkin === "liquid-glass" ? "" : " · 当前不是液态玻璃皮肤";
    label.textContent = `tint ×${state.scale} · 背景：${background} · ${theme}${skin}`;
  }

  function button(text, onClick) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.style.cssText = "padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font:inherit";
    element.addEventListener("click", () => {
      onClick();
      sync();
    });
    return element;
  }

  panel.append(
    label,
    ...[1, 0.6, 0.3, 0].map((scale) => button(`tint ×${scale}`, () => {
      state.scale = scale;
      applyTint();
    })),
    button("切换背景", () => {
      state.photo = state.photo + 1 < PHOTOS.length ? state.photo + 1 : -1;
      applyPhoto();
    }),
    button("明暗主题", () => document.querySelector("#themeToggleButton")?.click()),
    button("关闭", () => window.__liquidGlassTintProbe.remove()),
  );
  document.body.append(panel);

  // Base tints differ per theme; re-derive them whenever the theme or skin changes.
  const observer = new MutationObserver(() => {
    applyTint();
    sync();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-ui-skin"] });

  window.__liquidGlassTintProbe = {
    setScale(scale) {
      state.scale = scale;
      applyTint();
      sync();
    },
    remove() {
      observer.disconnect();
      panel.remove();
      tintStyle.remove();
      photoStyle.remove();
      delete window.__liquidGlassTintProbe;
    },
  };

  applyTint();
  sync();
})();
