/* Entry list toolbar: its three popups (search settings, filter, sort) live
   directly under body, outside the sticky list's stacking context, and are
   positioned beside their triggers here. Also owns the search clear button.
   The sort menu's own behaviour lives in entry-sort-control.js. */
(() => {
  window.createEntryToolbarMenus = (doc = document, { closeSort = () => {} } = {}) => {
    const get = (id) => doc.getElementById(id);
    const tools = get("entryMailTools");
    const search = get("searchInput");
    const clear = get("entrySearchClearButton");
    const panels = [
      [get("entrySearchConfigMenu"), get("entrySearchConfigButton")],
      [get("entryFilterMenu"), get("entryFilterButton")],
      [get("entrySortMenu"), get("entrySortButton")],
    ];
    const closeMenus = () => {
      closeSort();
      for (const [, button] of panels.slice(0, 2)) {
        if (button.getAttribute("aria-expanded") === "true") button.click();
      }
    };
    // A popup must not outlive a hidden toolbar (collapsed list, closed drawer).
    const syncVisibility = () => {
      if (!tools.getClientRects().length) closeMenus();
    };
    const positionMenu = (panel, button) => {
      if (panel.hidden) return;
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
      clear.hidden = !search.value;
      clear.disabled = search.disabled;
      reposition();
    };
    for (const [panel, button] of panels.slice(0, 2)) {
      panel.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const focusable = [...panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
          .filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
        if ((event.shiftKey && doc.activeElement === focusable[0])
          || (!event.shiftKey && doc.activeElement === focusable.at(-1))) {
          button.focus();
          // Keep the panel open; Tab continues from its trigger.
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
    return { sync, closeMenus, syncVisibility, positionMenu };
  };
})();
