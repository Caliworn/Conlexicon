const assert = require("node:assert/strict");
const { indexAtScroll, scrollTopForIndex } = require("../lib/list-navigator");
const {
  derivedPanelHeight,
  derivedRowHeight,
  groupHeight,
  groupIsExpanded,
  rootCardHeight,
  windowHeight,
} = require("../lib/root-group-layout");

const CARD = 145;
const group = (derivedCount, matchedDerivedCount = derivedCount) => ({ derivedCount, matchedDerivedCount });

// A window as the server describes it (pageInfo.windowMetrics).
function metricOf(groups) {
  return {
    groupCount: groups.length,
    derivedCount: groups.reduce((total, item) => total + item.derivedCount, 0),
    derivedGroupCount: groups.filter((item) => item.derivedCount).length,
    matchedGroupCount: groups.filter((item) => item.matchedDerivedCount).length,
    matchedGroupDerivedCount: groups.reduce((total, item) => total + (item.matchedDerivedCount ? item.derivedCount : 0), 0),
  };
}

const STATES = [
  { expandAll: false, search: false },
  { expandAll: true, search: false },
  { expandAll: false, search: true },
  { expandAll: true, search: true },
];

function checkExpansion() {
  assert.equal(groupIsExpanded(group(0), { expandAll: true, search: true }, false), false, "a root without derived entries has nothing to expand");
  assert.equal(groupIsExpanded(group(3), { expandAll: false, search: false }, false), false);
  assert.equal(groupIsExpanded(group(3), { expandAll: false, search: false }, true), true, "a manual toggle expands");
  assert.equal(groupIsExpanded(group(3), { expandAll: true, search: false }, true), false, "a toggle under expand-all collapses");
  assert.equal(groupIsExpanded(group(3, 1), { expandAll: false, search: true }, false), true, "a search expands a group with a derived match");
  assert.equal(groupIsExpanded(group(3, 0), { expandAll: false, search: true }, false), false, "a group matched by its root alone stays collapsed");
  assert.equal(groupIsExpanded(group(3, 1), { expandAll: true, search: true }, true), true, "a search's expansion outranks a manual collapse");
}

function checkRowsAddUpToGroup() {
  // The list renders an expanded group as its card plus one row per derived
  // entry, or plus one placeholder while they load; both must total the group.
  [1, 2, 300].forEach((count) => {
    const rows = rootCardHeight(CARD, true)
      + Array.from({ length: count }, (_, index) => derivedRowHeight(index === count - 1)).reduce((a, b) => a + b, 0);
    assert.equal(rows, groupHeight(CARD, group(count), true));
    assert.equal(rootCardHeight(CARD, true) + derivedPanelHeight(count), groupHeight(CARD, group(count), true));
  });
  assert.equal(groupHeight(CARD, group(5), false), CARD);
}

// The navigator relies on this: an unloaded window's weight equals the sum of
// the rows that replace it, in every expansion state, so loading a window does
// not move the thumb or the landing of a drag.
function checkWindowMatchesItsGroups() {
  const groups = [group(0), group(4), group(2, 0), group(300, 7), group(1, 1), group(0), group(9, 0)];
  const metric = metricOf(groups);
  STATES.forEach((state) => {
    [[], [1], [2, 6], [0, 3, 4]].forEach((toggledIndexes) => {
      const toggled = new Set(toggledIndexes);
      const expected = groups.reduce((total, item, index) => (
        total + groupHeight(CARD, item, groupIsExpanded(item, state, toggled.has(index)))
      ), 0);
      assert.equal(
        windowHeight(CARD, metric, state, toggledIndexes.map((index) => groups[index])),
        expected,
        `window height for ${JSON.stringify(state)} with toggles ${toggledIndexes}`,
      );
    });
  });
}

// Weights are not whole numbers of results; the navigator's two conversions
// must stay inverse on such a layout, and a placeholder must name the same
// weight at a scroll position as the rows that replace it.
function checkWeightedLayout() {
  const groups = [group(0), group(3), group(0), group(40), group(1)];
  const state = { expandAll: true, search: false };
  const weights = [];
  groups.forEach((item) => {
    const expanded = groupIsExpanded(item, state, false);
    weights.push(rootCardHeight(CARD, expanded));
    for (let index = 0; expanded && index < item.derivedCount; index += 1) {
      weights.push(derivedRowHeight(index === item.derivedCount - 1));
    }
  });
  const layoutOf = (rowWeights, heights) => {
    const rows = [];
    const offsets = [0];
    let start = 0;
    rowWeights.forEach((weight, index) => {
      rows.push({ start, count: weight });
      start += weight;
      offsets.push(offsets[index] + heights[index]);
    });
    return { rows, offsets, total: start };
  };
  // Measured heights differ from the estimates; the weights do not follow them.
  const measured = weights.map((weight, index) => (weight > 100 ? weight + ((index % 3) - 1) * 17 : weight));
  const loaded = layoutOf(weights, measured);
  for (let index = 0; index < loaded.total; index += 13.7) {
    assert.ok(Math.abs(indexAtScroll(loaded, scrollTopForIndex(loaded, index)) - index) < 1e-9, `weight ${index} should survive a round trip`);
  }
  const total = windowHeight(CARD, metricOf(groups), state);
  assert.equal(loaded.total, total);
  const placeholder = layoutOf([total], [total]);
  const unmeasured = layoutOf(weights, weights);
  for (let top = 0; top < total; top += 97) {
    assert.ok(Math.abs(indexAtScroll(placeholder, top) - indexAtScroll(unmeasured, top)) < 1e-9, `scrollTop ${top} should name the same weight before and after the window loads`);
  }
}

checkExpansion();
checkRowsAddUpToGroup();
checkWindowMatchesItsGroups();
checkWeightedLayout();
console.log("Root group layout checks passed.");
