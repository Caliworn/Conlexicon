/* Entry sort menu shared by every skin and layout. The hidden #sortSelect stays
   the single source of the six sort values; this control only presents them as
   "sort key" and "order" groups and writes the chosen value back. */
(() => {
  const KEYS = Object.freeze([
    Object.freeze({ key: "lemma", label: "sortKeyLemma", glyph: '<path d="M3 18 7.5 6 12 18M4.7 14h5.6M15 15a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M20 12v6"/>' }),
    Object.freeze({ key: "updated", label: "sortKeyUpdated", glyph: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>' }),
    Object.freeze({ key: "created", label: "sortKeyCreated", glyph: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>' }),
  ]);
  // Order labels say what comes first; times default to newest first.
  const ORDERS = Object.freeze({
    lemma: Object.freeze([["Asc", "sortAToZ"], ["Desc", "sortZToA"]]),
    time: Object.freeze([["Desc", "sortNewestFirst"], ["Asc", "sortOldestFirst"]]),
  });
  const SORT_ICON = '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>';
  const CHEVRON = '<path d="m7 10 5 5 5-5"/>';

  const parse = (value) => {
    const match = /^(lemma|updated|created)(Asc|Desc)$/.exec(value || "");
    return match ? { key: match[1], direction: match[2] } : { key: "lemma", direction: "Asc" };
  };
  const ordersFor = (key) => (key === "lemma" ? ORDERS.lemma : ORDERS.time);
  const icon = (paths, className) => `<svg class="nav-icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

  window.createEntrySortControl = (doc = document, {
    translate = (key) => key,
    onMenuOpen = () => {},
    positionMenu = () => {},
  } = {}) => {
    const get = (id) => doc.getElementById(id);
    const control = get("entrySortControl");
    const trigger = get("entrySortButton");
    const menu = get("entrySortMenu");
    const select = get("sortSelect");
    const search = get("searchInput");
    const items = () => [...menu.querySelectorAll('[role="menuitemradio"]')];

    const stateLabel = ({ key, direction }) => {
      const keyLabel = translate(KEYS.find((item) => item.key === key).label);
      const orderLabel = translate(ordersFor(key).find(([value]) => value === direction)[1]);
      return `${keyLabel} · ${orderLabel}`;
    };

    const option = (value, label, checked, glyph = "") => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "entry-sort-option";
      button.setAttribute("role", "menuitemradio");
      button.setAttribute("aria-checked", String(checked));
      button.tabIndex = -1;
      button.dataset.sortValue = value;
      button.innerHTML = `<span class="entry-sort-check" aria-hidden="true"></span>${glyph}<span class="entry-sort-option-label"></span>`;
      button.querySelector(".entry-sort-option-label").textContent = label;
      return button;
    };

    const group = (id, title, children) => {
      const wrapper = doc.createElement("div");
      wrapper.className = "entry-sort-group";
      wrapper.setAttribute("role", "group");
      wrapper.setAttribute("aria-labelledby", id);
      const heading = doc.createElement("div");
      heading.className = "entry-sort-group-label";
      heading.id = id;
      heading.textContent = title;
      wrapper.append(heading, ...children);
      return wrapper;
    };

    const sync = () => {
      const state = parse(select.value);
      const mail = doc.body.dataset.entryLayout === "mail";
      const label = stateLabel(state);
      trigger.disabled = search.disabled;
      trigger.innerHTML = `${icon(SORT_ICON, "entry-sort-icon")}<span class="entry-sort-label"></span>${icon(CHEVRON, "entry-sort-chevron")}`;
      trigger.querySelector(".entry-sort-label").textContent = label;
      trigger.setAttribute("aria-label", `${select.getAttribute("aria-label")}: ${label}`);
      // The icon-only Mail trigger needs a tooltip; the text trigger shows its state.
      if (mail) trigger.dataset.appTooltip = menu.hidden ? "always" : "open";
      else delete trigger.dataset.appTooltip;
      menu.setAttribute("aria-label", select.getAttribute("aria-label"));
      const focusedValue = doc.activeElement?.dataset.sortValue;
      menu.replaceChildren(
        group("entrySortKeyLabel", translate("sortGroupKey"), KEYS.map(({ key, label, glyph }) => {
          // Switching key keeps the order for the two times and resets it otherwise.
          const direction = key === state.key || (key !== "lemma" && state.key !== "lemma")
            ? state.direction
            : ordersFor(key)[0][0];
          return option(`${key}${direction}`, translate(label), key === state.key, icon(glyph, "entry-sort-key-icon"));
        })),
        group("entrySortOrderLabel", translate("sortGroupOrder"), ordersFor(state.key).map(([direction, label]) => (
          option(`${state.key}${direction}`, translate(label), direction === state.direction)
        ))),
      );
      if (focusedValue && !menu.hidden) {
        items().find((item) => item.dataset.sortValue === focusedValue && item.getAttribute("aria-checked") === "true")?.focus();
      }
      positionMenu(menu, trigger);
    };

    const close = (focus = false) => {
      if (menu.hidden) return;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (doc.body.dataset.entryLayout === "mail") trigger.dataset.appTooltip = "always";
      if (focus) trigger.focus();
    };

    const open = (last = false) => {
      if (trigger.disabled) return;
      onMenuOpen();
      sync();
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (doc.body.dataset.entryLayout === "mail") trigger.dataset.appTooltip = "open";
      positionMenu(menu, trigger);
      const list = items();
      (last ? list.at(-1) : list.find((item) => item.getAttribute("aria-checked") === "true") || list[0])?.focus();
    };

    trigger.addEventListener("click", () => (menu.hidden ? open() : close()));
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open(event.key === "ArrowUp");
      }
    });
    menu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-sort-value]");
      if (!item) return;
      if (select.value !== item.dataset.sortValue) {
        select.value = item.dataset.sortValue;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      close(true);
      sync();
    });
    menu.addEventListener("keydown", (event) => {
      const list = items();
      const index = list.indexOf(doc.activeElement);
      const target = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1
        : event.key === "ArrowDown" ? (index + 1) % list.length
          : event.key === "ArrowUp" ? (index - 1 + list.length) % list.length : -1;
      if (target >= 0) {
        event.preventDefault();
        list[target].focus();
      }
      if (event.key === "Tab") {
        close();
        trigger.focus();
        if (event.shiftKey) event.preventDefault();
      }
    });
    doc.addEventListener("pointerdown", (event) => {
      if (!control.contains(event.target) && !menu.contains(event.target)) close();
    }, true);
    doc.addEventListener("keydown", (event) => {
      if (!menu.hidden && event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }, true);

    return { sync, open, close };
  };
})();
