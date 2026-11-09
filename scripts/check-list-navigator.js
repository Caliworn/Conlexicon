const assert = require("node:assert/strict");
const { indexAtScroll, layoutTicks, scrollTopForIndex, thumbGeometry } = require("../lib/list-navigator");

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

// Normal mode estimates every unmeasured card alike and scales the page to its
// reserved height, so a loaded page spreads its results exactly as its
// placeholder did: the result at any scroll position, and so a drag's landing,
// stays put when the placeholder is replaced.
function checkPlaceholderReplacement() {
  const reserved = 26150;
  const before = { rows: [{ start: 0, count: 200 }], offsets: [0, reserved], total: 200 };
  const rowHeight = reserved / 200;
  const after = {
    rows: Array.from({ length: 200 }, (_, index) => ({ start: index, count: 1 })),
    offsets: Array.from({ length: 201 }, (_, index) => index * rowHeight),
    total: 200,
  };
  for (let top = 0; top < reserved; top += 97) {
    assert.ok(Math.abs(indexAtScroll(before, top) - indexAtScroll(after, top)) < 1e-9, `scrollTop ${top} should name the same result before and after the window loads`);
  }
}

function checkTickLayout() {
  const bucket = (start, count, label) => ({ start, count, full: label, short: label });
  const buckets = [bucket(0, 10, "a"), bucket(10, 1, "b"), bucket(11, 1, "c"), bucket(12, 78, "d"), bucket(90, 10, "e")];
  const ticks = layoutTicks({ buckets, trackHeight: 200, thumbHeight: 32, travel: 168, maxIndex: 95, gap: 20 });
  // b and c land within 20px of a and merge into its tick; d and e stand alone.
  assert.deepEqual(ticks.map((tick) => [tick.first.short, tick.last.short, tick.start, tick.end, tick.count]), [
    ["a", "c", 0, 12, 12],
    ["d", "d", 12, 90, 78],
    ["e", "e", 90, 100, 10],
  ]);
  assert.equal(ticks[0].y, 16, "a segment starting at the top sits at the thumb's middle");
  assert.equal(ticks[0].top, 0, "the first band starts at the top of the rail");
  assert.equal(ticks[ticks.length - 1].bottom, 200, "the last band reaches the bottom of the rail");
  ticks.slice(1).forEach((tick, index) => {
    assert.equal(tick.top, ticks[index].bottom, "bands meet without gaps, so every point on the rail picks a tick");
  });
  // A band is its segment's stretch of the track under the mapping the hover
  // preview uses (thumb centred on the pointer), so a press and the preview agree.
  const indexAtY = (y) => ((y - 16) / 168) * 95;
  ticks.slice(1).forEach((tick) => {
    assert.ok(Math.abs(indexAtY(tick.top) - tick.start) < 1e-9, `band ${tick.first.short} starts where its segment starts`);
  });
  ticks.slice(0, -1).forEach((tick) => {
    assert.ok(Math.abs(indexAtY(tick.bottom) - tick.end) < 1e-9, `band ${tick.first.short} ends where its segment ends`);
  });
  ticks.forEach((tick) => {
    assert.equal(tick.labelY, (tick.top + tick.bottom) / 2, "the label sits in the middle of its band");
  });
  // A short last segment starting 16px above the rail's end would get a band
  // shorter than the gap, so it joins the tick before it.
  const tail = layoutTicks({
    buckets: [bucket(0, 50, "a"), bucket(50, 45, "d"), bucket(95, 5, "e")],
    trackHeight: 200,
    thumbHeight: 32,
    travel: 168,
    maxIndex: 95,
    gap: 20,
  });
  assert.deepEqual(tail.map((tick) => [tick.first.short, tick.last.short, tick.end]), [["a", "a", 50], ["d", "e", 100]]);
  tail.forEach((tick) => {
    assert.ok(tick.bottom - tick.top >= 20, `band ${tick.first.short} is at least the gap tall`);
  });
}

checkInverse();
checkPlaceholderReplacement();
checkTickLayout();
checkPlaceholderInterpolation();
checkBounds();
checkRowsWithoutResults();
checkThumbGeometry();
console.log("List navigator position model checks passed.");
