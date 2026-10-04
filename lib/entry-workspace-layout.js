/* Layout only: move existing controls, preserving their handlers and state.
   Material ownership remains in the skin. No preference or business state.
   The sort menu itself lives in entry-sort-control.js for every layout. */
(() => {
  const LAYOUT_BY_SKIN = Object.freeze({ "liquid-glass": "mail" });
  window.createEntryWorkspaceLayout = (doc = document, { closeSort = () => {} } = {}) => {
    const get = (id) => doc.getElementById(id);
    const tools = get("entryMailTools");
    const primary = get("entryMailPrimaryTools");
    const rootActions = get("entryMailRootActions");
    const settings = get("entryMailSettings");
    const sort = get("entrySortControl");
    const root = get("rootModeToggleButton");
    const search = get("searchInput");
    const clear = get("entrySearchClearButton");
    const panels = [
      [get("entrySearchConfigMenu"), get("entrySearchConfigButton")],
      [get("entryFilterMenu"), get("entryFilterButton")],
      [get("entrySortMenu"), get("entrySortButton")],
    ];
    // Menus, root mode and "new" are units: wrapping moves a whole group.
    const [menuGroup, rootGroup, newGroup] = ["", "", " entry-mail-group-new"].map((extra) => {
      const group = doc.createElement("div");
      group.className = `entry-mail-group${extra}`;
      return group;
    });
    menuGroup.append(settings);
    primary.append(menuGroup, rootGroup, newGroup);
    const moves = [
      [get("entrySearchConfigButton"), settings],
      [get("entryFilterControl"), menuGroup],
      [sort, menuGroup],
      [root, rootGroup],
      [get("entryListNewEntryButton"), newGroup],
      [rootActions, rootGroup],
      [get("expandAllRootsButton"), rootActions],
      [get("collapseAllRootsButton"), rootActions],
      ...panels.map(([panel]) => [panel, doc.body]),
    ].map(([node, destination]) => {
      const anchor = doc.createComment("entry workspace original position");
      node.before(anchor);
      return { node, destination, anchor };
    });
    // Hairlines between the menu triggers, the root-mode group and "new".
    const dividers = [0, 1].map(() => {
      const divider = doc.createElement("span");
      divider.className = "entry-mail-divider";
      divider.setAttribute("aria-hidden", "true");
      return divider;
    });
    let current = "standard";
    // Decorations do not consume flex space. A boundary is only drawn when
    // its two controls share a row; wrapping must not leave an orphan line.
    const positionDividers = () => {
      if (current !== "mail" || !primary.getClientRects().length) return;
      const box = primary.getBoundingClientRect();
      const pairs = [
        [get("entrySortButton"), root],
        [get("collapseAllRootsButton"), get("entryListNewEntryButton")],
      ];
      pairs.forEach(([before, after], index) => {
        const a = before.getBoundingClientRect();
        const b = after.getBoundingClientRect();
        const divider = dividers[index];
        divider.hidden = !a.width || !b.width || Math.abs(a.top - b.top) > 1;
        if (divider.hidden) return;
        const left = `${(a.right + b.left) / 2 - box.left}px`;
        const top = `${(b.top + b.bottom) / 2 - box.top}px`;
        if (divider.style.left !== left) divider.style.left = left;
        if (divider.style.top !== top) divider.style.top = top;
      });
    };
    const toolbarObserver = new ResizeObserver(positionDividers);
    toolbarObserver.observe(primary);
    const closeMenus = () => {
      closeSort();
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
      root.setAttribute("aria-label", root.textContent.trim());
      root.dataset.appTooltip = "always";
      positionDividers();
      reposition();
    };
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
      if (!panels.some(([panel]) => panel === event.target)) reposition();
    }, true);
    clear.addEventListener("click", () => {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.focus();
    });
    search.addEventListener("input", sync);
    return {
      sync,
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
            primary.append(...dividers);
          } else {
            dividers.forEach((divider) => divider.remove());
          }
          current = next;
          for (const [panel] of panels) panel.classList.toggle("entry-workspace-menu", next === "mail");
          if (next === "standard") {
            for (const [panel] of panels) {
              panel.style.removeProperty("left");
              panel.style.removeProperty("top");
            }
            for (const id of ["expandAllRootsButton", "collapseAllRootsButton"]) {
              get(id).removeAttribute("aria-label");
              delete get(id).dataset.appTooltip;
            }
            root.removeAttribute("aria-label");
            delete root.dataset.appTooltip;
          }
        }
        doc.body.dataset.entryLayout = next;
        tools.hidden = next !== "mail";
        sync();
        return changed;
      },
    };
  };
})();
