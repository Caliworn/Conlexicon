const assert = require("node:assert/strict");
const { indexAtScroll, scrollTopForIndex, thumbGeometry } = require("../lib/list-navigator");

// A windowed list: loaded window 0 (rows of uneven height), placeholder for
// window 1, loaded window 2, placeholder for the last partial window.
function sampleLayout() {
  const rows = [];
  const heights = [];
  for (let index = 0; index < 4; index += 1) {
    rows.push({ start: index, count: 1 });
    heights.push(100 + index * 20);
  }
  rows.push({ start: 4, count: 4 });
  heights.push(4 * 145);
  for (let index = 8; index < 12; index += 1) {
    rows.push({ start: index, count: 1 });
    heights.push(90);
  }
  rows.push({ start: 12, count: 3 });
  heights.push(3 * 145);
  const offsets = [0];
  heights.forEach((height) => offsets.push(offsets[offsets.length - 1] + height));
  return { rows, offsets, total: 15 };
}

function checkInverse() {
  const layout = sampleLayout();
  // The navigator relies on these being inverse on one layout: a drag released at
  // index i leaves the list at i, so the thumb does not jump back.
  for (let index = 0; index < layout.total; index += 0.25) {
    const top = scrollTopForIndex(layout, index);
    assert.ok(Math.abs(indexAtScroll(layout, top) - index) < 1e-9, `index ${index} should survive a round trip through scrollTop ${top}`);
  }
  const end = layout.offsets[layout.offsets.length - 1];
  for (let top = 0; top < end; top += 37) {
    assert.ok(Math.abs(scrollTopForIndex(layout, indexAtScroll(layout, top)) - top) < 1e-9, `scrollTop ${top} should survive a round trip`);
  }
}

function checkPlaceholderInterpolation() {
  const layout = sampleLayout();
  const placeholderTop = layout.offsets[4];
  assert.equal(scrollTopForIndex(layout, 4), placeholderTop, "a window's first result sits at its placeholder's top");
  assert.equal(scrollTopForIndex(layout, 6), placeholderTop + 2 * 145, "results inside an unloaded window are spaced evenly");
  assert.equal(indexAtScroll(layout, placeholderTop + 145), 5);
}

function checkBounds() {
  const layout = sampleLayout();
  const end = layout.offsets[layout.offsets.length - 1];
  assert.equal(indexAtScroll(layout, 0), 0);
  assert.equal(indexAtScroll(layout, end), layout.total, "the bottom edge maps to the result count");
  assert.equal(scrollTopForIndex(layout, layout.total), end);
  assert.equal(scrollTopForIndex(layout, -3), 0);
  assert.equal(indexAtScroll({ rows: [], offsets: [0], total: 0 }, 0), 0);
}

function checkRowsWithoutResults() {
  // A trailing notice row covers no results and must not capture an index.
  const layout = {
    rows: [{ start: 0, count: 1 }, { start: 1, count: 1 }, { start: 2, count: 0 }],
    offsets: [0, 100, 200, 244],
    total: 2,
  };
  assert.equal(scrollTopForIndex(layout, 1.5), 150);
  assert.equal(indexAtScroll(layout, 220), 2, "a notice row reads as the end of the results");
}

function checkThumbGeometry() {
  assert.deepEqual(thumbGeometry({ trackHeight: 500, total: 1000, visible: 5, minThumb: 32 }), { thumbHeight: 32, travel: 468, maxIndex: 995 }, "a long list keeps the minimum thumb");
  assert.deepEqual(thumbGeometry({ trackHeight: 500, total: 20, visible: 5, minThumb: 32 }), { thumbHeight: 125, travel: 375, maxIndex: 15 }, "a short list gets a proportional thumb");
  assert.equal(thumbGeometry({ trackHeight: 20, total: 1000, visible: 5, minThumb: 32 }).thumbHeight, 20, "the thumb never outgrows its track");
}

checkInverse();
checkPlaceholderInterpolation();
checkBounds();
checkRowsWithoutResults();
checkThumbGeometry();
console.log("List navigator position model checks passed.");
