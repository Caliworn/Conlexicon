/* Layout only: move existing controls, preserving their handlers and state.
   Material ownership remains in the skin. No preference or business state. */
(() => {
  const LAYOUT_BY_SKIN = Object.freeze({ "liquid-glass": "mail" });
  window.createEntryWorkspaceLayout = (doc = document, { onMenuOpen = () => {} } = {}) => {
    const get = (id) => doc.getElementById(id);
    const tools = get("entryMailTools");
    const primary = get("entryMailPrimaryTools");
    const rootActions = get("entryMailRootActions");
    const settings = get("entryMailSettings");
    const sort = get("entryMailSort");
    const menu = get("entrySortMenu");
    const trigger = get("entrySortButton");
    const select = get("sortSelect");
    const root = get("rootModeToggleButton");
    const search = get("searchInput");
    const clear = get("entrySearchClearButton");
    const panels = [
      [get("entrySearchConfigMenu"), get("entrySearchConfigButton")],
      [get("entryFilterMenu"), get("entryFilterButton")],
      [menu, trigger],
    ];
    const moves = [
      [get("entrySearchConfigButton"), settings],
      [get("entryFilterControl"), primary],
      [root, primary],
      [get("entryListNewEntryButton"), primary],
      [rootActions, primary],
      [get("expandAllRootsButton"), rootActions],
      [get("collapseAllRootsButton"), rootActions],
      ...panels.map(([panel]) => [panel, doc.body]),
    ].map(([node, destination]) => {
      const anchor = doc.createComment("entry workspace original position");
      node.before(anchor);
      return { node, destination, anchor };
    });
    let current = "standard";
    const close = (focus = false) => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.dataset.appTooltip = "always";
      if (focus) trigger.focus();
    };
    const options = () => [...menu.querySelectorAll('[role="menuitemradio"]')];
    const closeMenus = () => {
      close();
      for (const [, button] of panels.slice(0, 2)) {
        if (button.getAttribute("aria-expanded") === "true") button.click();
      }
    };
    const syncVisibility = () => {
      if (current === "mail" && !tools.getClientRects().length) closeMenus();
    };
    const positionMenu = (panel, button) => {
      if (current !== "mail" || panel.hidden) return;
      syncVisibility();
      if (panel.hidden) return;
      const anchor = button.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      const margin = 12;
      const width = doc.documentElement.clientWidth;
      const height = window.innerHeight;
      panel.style.left = `${Math.max(margin, Math.min(anchor.left, width - box.width - margin))}px`;
      const below = anchor.bottom + 8;
      panel.style.top = `${Math.max(margin, Math.min(below + box.height <= height - margin
        ? below : anchor.top - box.height - 8, height - box.height - margin))}px`;
    };
    const reposition = () => {
      for (const [panel, button] of panels) positionMenu(panel, button);
    };
    const sync = () => {
      clear.hidden = current !== "mail" || !search.value;
      clear.disabled = search.disabled;
      clear.setAttribute("aria-label", doc.documentElement.lang.startsWith("zh") ? "清空搜索" : "Clear search");
      if (current !== "mail") return;
      rootActions.hidden = [...rootActions.children].every((button) => button.hidden);
      tools.classList.toggle("has-root-actions", !rootActions.hidden);
      for (const button of rootActions.children) {
        button.setAttribute("aria-label", button.textContent.trim());
        button.dataset.appTooltip = "always";
      }
      const selected = [...select.options].find((option) => option.value === select.value) || select.options[0];
      trigger.disabled = search.disabled;
      trigger.setAttribute("aria-label", `${select.getAttribute("aria-label")}: ${selected.textContent}`);
      menu.setAttribute("aria-label", select.getAttribute("aria-label"));
      trigger.dataset.sort = selected.value;
      const kind = selected.value.replace(/Asc|Desc/, "");
      const up = selected.value.endsWith("Asc");
      const glyph = kind === "lemma" ? '<path d="m3 17 4-11 4 11M4.5 13h5"/>'
        : kind === "updated" ? '<circle cx="7" cy="11" r="5"/><path d="M7 8v3l2 1"/>'
          : '<rect x="2" y="6" width="10" height="12" rx="2"/><path d="M4 4v4m6-4v4M2 10h10"/>';
      trigger.innerHTML = `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${glyph}<path d="M18 5v14${up ? "M15 8l3-3 3 3" : "M15 16l3 3 3-3"}"/></svg>`;
      root.setAttribute("aria-label", root.textContent.trim());
      root.setAttribute("aria-pressed", String(root.classList.contains("active")));
      root.dataset.appTooltip = "always";
      const focusedValue = doc.activeElement?.dataset.sortValue;
      menu.replaceChildren(...[...select.options].map((option) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "entry-sort-option";
        button.setAttribute("role", "menuitemradio");
        button.setAttribute("aria-checked", String(option.value === selected.value));
        button.tabIndex = -1;
        button.dataset.sortValue = option.value;
        button.textContent = option.textContent;
        return button;
      }));
      if (focusedValue && !menu.hidden) options().find((item) => item.dataset.sortValue === focusedValue)?.focus();
      reposition();
    };
    const open = (last = false) => {
      if (trigger.disabled || current !== "mail") return;
      // Reuse the application's existing mutual-exclusion handlers.
      for (const id of ["entrySearchConfigButton", "entryFilterButton"]) {
        const button = get(id);
        if (button.getAttribute("aria-expanded") === "true") button.click();
      }
      sync();
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      trigger.dataset.appTooltip = "open";
      onMenuOpen();
      positionMenu(menu, trigger);
      const items = options();
      (last ? items.at(-1) : items.find((item) => item.getAttribute("aria-checked") === "true") || items[0])?.focus();
    };
    trigger.addEventListener("click", () => menu.hidden ? open() : close());
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open(event.key === "ArrowUp");
      }
    });
    menu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-sort-value]");
      if (!item) return;
      select.value = item.dataset.sortValue;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      close(true);
    });
    menu.addEventListener("keydown", (event) => {
      const items = options();
      const index = items.indexOf(doc.activeElement);
      const target = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (index + 1) % items.length
          : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : -1;
      if (target >= 0) { event.preventDefault(); items[target].focus(); }
      if (event.key === "Tab") {
        trigger.focus();
        if (event.shiftKey) event.preventDefault();
      }
    });
    const insideSort = (target) => sort.contains(target) || menu.contains(target);
    doc.addEventListener("pointerdown", (event) => { if (!insideSort(event.target)) close(); }, true);
    doc.addEventListener("keydown", (event) => {
      if (!menu.hidden && event.key === "Escape") { event.preventDefault(); close(true); }
    }, true);
    for (const [panel, button] of panels.slice(0, 2)) {
      panel.addEventListener("keydown", (event) => {
        if (current !== "mail" || event.key !== "Tab") return;
        const focusable = [...panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
          .filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
        if ((event.shiftKey && doc.activeElement === focusable[0])
          || (!event.shiftKey && doc.activeElement === focusable.at(-1))) {
          button.focus();
          // Keep the panel open; Tab continues from its original trigger.
          if (event.shiftKey) event.preventDefault();
        }
      });
    }
    window.addEventListener("resize", reposition);
    doc.addEventListener("scroll", (event) => {
      if (![menu, get("entrySearchConfigMenu"), get("entryFilterMenu")].includes(event.target)) reposition();
    }, true);
    clear.addEventListener("click", () => {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.focus();
    });
    search.addEventListener("input", sync);
    return {
      sync,
      close,
      closeMenus,
      syncVisibility,
      positionMenu,
      apply(skin) {
        const next = LAYOUT_BY_SKIN[skin] || "standard";
        const changed = next !== current;
        if (changed) {
          closeMenus();
          for (const { node, destination, anchor } of moves) {
            if (next === "mail") destination.append(node);
            else anchor.after(node);
          }
          // DOM order also defines keyboard order, including temporary root actions.
          if (next === "mail") {
            get("entryFilterControl").after(sort);
            root.after(rootActions);
          }
          current = next;
          for (const [panel] of panels) panel.classList.toggle("entry-workspace-menu", next === "mail");
          if (next === "standard") {
            for (const panel of [menu, get("entrySearchConfigMenu"), get("entryFilterMenu")]) {
              panel.style.removeProperty("left");
              panel.style.removeProperty("top");
            }
            for (const id of ["expandAllRootsButton", "collapseAllRootsButton"]) {
              get(id).removeAttribute("aria-label");
              delete get(id).dataset.appTooltip;
            }
            root.removeAttribute("aria-label");
            root.removeAttribute("aria-pressed");
            delete root.dataset.appTooltip;
          }
        }
        doc.body.dataset.entryLayout = next;
        tools.hidden = next !== "mail";
        select.hidden = next === "mail";
        sync();
        return changed;
      },
    };
  };
})();
