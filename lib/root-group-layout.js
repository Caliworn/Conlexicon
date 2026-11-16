/* Root mode row estimates. The entry list positions its navigator by these
   (docs/ENHANCED_SCROLLBAR_PLAN.md section 11): a row's weight is its estimated
   height, whatever it later measures, so a window that has not loaded and the
   rows that replace it spread over the same range.

   A group is { derivedCount, matchedDerivedCount }. The expansion state is
   { expandAll, search }: `expandAll` is the "expand all" mode, `search` is true
   while a search expands the groups whose derived entries match. `toggled` says
   the user changed this one group against the mode: expanded it by hand, or
   collapsed it under "expand all". */
(function initRootGroupLayout(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConlexiconRootGroupLayout = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createRootGroupLayoutModule() {
  // A derived entry is one fixed-height line (styles.css .derived-entry-row). An
  // expanded root sits 4px above its panel instead of the usual 12px gap, and
  // the panel ends with its border and that 12px gap.
  const DERIVED_ROW_HEIGHT = 44;
  const DERIVED_PANEL_END = 13;
  const EXPANDED_GAP_TRIM = 8;

  function groupIsExpanded(group, { expandAll, search }, toggled) {
    if (!group.derivedCount) {
      return false;
    }
    if (search && group.matchedDerivedCount) {
      return true;
    }
    return expandAll ? !toggled : Boolean(toggled);
  }

  function rootCardHeight(cardHeight, expanded) {
    return cardHeight - (expanded ? EXPANDED_GAP_TRIM : 0);
  }

  function derivedPanelHeight(derivedCount) {
    return (derivedCount * DERIVED_ROW_HEIGHT) + DERIVED_PANEL_END;
  }

  function derivedRowHeight(last) {
    return DERIVED_ROW_HEIGHT + (last ? DERIVED_PANEL_END : 0);
  }

  function groupHeight(cardHeight, group, expanded) {
    return rootCardHeight(cardHeight, expanded) + (expanded ? derivedPanelHeight(group.derivedCount) : 0);
  }

  /* The height of a whole window from its totals alone. `metric` is the
     window's entry in pageInfo.windowMetrics; `toggledGroups` are the groups of
     this window the user toggled against the mode, the only ones whose state the
     totals cannot tell. */
  function windowHeight(cardHeight, metric, state, toggledGroups = []) {
    let expandedGroups = 0;
    let expandedDerived = 0;
    if (state.expandAll) {
      expandedGroups = metric.derivedGroupCount;
      expandedDerived = metric.derivedCount;
    } else if (state.search) {
      expandedGroups = metric.matchedGroupCount;
      expandedDerived = metric.matchedGroupDerivedCount;
    }
    toggledGroups.forEach((group) => {
      const change = Number(groupIsExpanded(group, state, true)) - Number(groupIsExpanded(group, state, false));
      expandedGroups += change;
      expandedDerived += change * group.derivedCount;
    });
    return (metric.groupCount * cardHeight)
      + (expandedGroups * (DERIVED_PANEL_END - EXPANDED_GAP_TRIM))
      + (expandedDerived * DERIVED_ROW_HEIGHT);
  }

  return {
    groupIsExpanded,
    rootCardHeight,
    derivedPanelHeight,
    derivedRowHeight,
    groupHeight,
    windowHeight,
  };
});
