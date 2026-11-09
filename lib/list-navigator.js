/* List navigator: a custom scrollbar for windowed virtual lists, positioned by
   result index instead of pixels (docs/ENHANCED_SCROLLBAR_PLAN.md). Pixel offsets
   come from estimated and measured row heights and change as rows are measured;
   result indexes do not, so the thumb stays put while heights settle.

   A layout is { rows, offsets, total }: rows[r] = { start, count } covers result
   indexes [start, start + count) in result order (an entry row has count 1, an
   unloaded window placeholder covers its whole window), and offsets are the
   virtual list's prefix sums of row heights. */
(function initListNavigator(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConlexiconListNavigator = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createListNavigatorModule() {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function rowAtPosition(offsets, position) {
    let low = 0;
    let high = Math.max(0, offsets.length - 2);
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (offsets[middle + 1] <= position) {
        low = middle + 1;
      } else if (offsets[middle] > position) {
        high = middle - 1;
      } else {
        return middle;
      }
    }
    return Math.min(low, Math.max(0, offsets.length - 2));
  }

  // The last row that starts at or before `index` and actually covers results.
  function rowForIndex(rows, index) {
    let low = 0;
    let high = rows.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (rows[middle].start <= index) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    while (low > 0 && rows[low].count === 0) {
      low -= 1;
    }
    return low;
  }

  // scrollTop -> fractional result index.
  function indexAtScroll(layout, position) {
    const { rows, offsets, total } = layout;
    const end = offsets[offsets.length - 1] || 0;
    if (!rows.length || position >= end) {
      return total;
    }
    const r = rowAtPosition(offsets, Math.max(0, position));
    const height = offsets[r + 1] - offsets[r];
    const fraction = height > 0 ? clamp((position - offsets[r]) / height, 0, 1) : 0;
    return rows[r].start + fraction * rows[r].count;
  }

  // Fractional result index -> scrollTop; the inverse of indexAtScroll on the same layout.
  function scrollTopForIndex(layout, index) {
    const { rows, offsets, total } = layout;
    const end = offsets[offsets.length - 1] || 0;
    if (!rows.length || index >= total) {
      return end;
    }
    const i = Math.max(0, index);
    const r = rowForIndex(rows, i);
    const row = rows[r];
    const fraction = row.count > 0 ? clamp((i - row.start) / row.count, 0, 1) : 0;
    return offsets[r] + fraction * (offsets[r + 1] - offsets[r]);
  }

  // Thumb size and travel. `visible` is the number of results in the viewport.
  function thumbGeometry({ trackHeight, total, visible, minThumb }) {
    const thumbHeight = clamp(total > 0 ? (visible / total) * trackHeight : trackHeight, Math.min(minThumb, trackHeight), trackHeight);
    return {
      thumbHeight,
      travel: Math.max(0, trackHeight - thumbHeight),
      maxIndex: Math.max(0, total - visible),
    };
  }

  /* Browser controller. The navigator sits beside the scroll container (inside
     `frame`) because the virtual list removes any child it did not render.
     It is aria-hidden and takes no focus, like a native scrollbar; the list's own
     scrolling stays native. Options:
       getLayout()        current { rows, offsets, total }
       renderWindow()     render the virtual list window at the current scrollTop
       setLoadsHeld(held) pause window loading while a drag keeps moving
       minThumb, loadDelay */
  function createListNavigator({ frame, list, getLayout, renderWindow, setLoadsHeld, minThumb = 32, loadDelay = 50 }) {
    const doc = frame.ownerDocument;
    const nav = doc.createElement("div");
    nav.className = "list-navigator";
    nav.setAttribute("aria-hidden", "true");
    nav.hidden = true;
    const thumb = doc.createElement("div");
    thumb.className = "list-navigator-thumb";
    nav.append(thumb);
    frame.append(nav);

    let active = false;
    let frameRequest = 0;
    let drag = null;
    let dragFrame = 0;
    let loadTimer = 0;

    const scrollMax = () => Math.max(0, list.scrollHeight - list.clientHeight);

    function measure(layout) {
      const top = indexAtScroll(layout, list.scrollTop);
      const visible = Math.max(0.0001, indexAtScroll(layout, list.scrollTop + list.clientHeight) - top);
      return { top, visible };
    }

    function fractionFromScroll(top, maxIndex) {
      if (list.scrollTop <= 0) return 0;
      if (list.scrollTop >= scrollMax() - 1) return 1;
      return maxIndex > 0 ? clamp(top / maxIndex, 0, 1) : 0;
    }

    function update() {
      frameRequest = 0;
      const layout = getLayout();
      const end = layout.offsets[layout.offsets.length - 1] || 0;
      nav.hidden = !active || layout.total <= 0 || end <= list.clientHeight + 1;
      if (nav.hidden || drag) {
        return;
      }
      const { top, visible } = measure(layout);
      const geometry = thumbGeometry({ trackHeight: nav.clientHeight, total: layout.total, visible, minThumb });
      thumb.style.height = `${geometry.thumbHeight}px`;
      thumb.style.transform = `translateY(${fractionFromScroll(top, geometry.maxIndex) * geometry.travel}px)`;
    }

    function scheduleUpdate() {
      if (!frameRequest) {
        frameRequest = requestAnimationFrame(update);
      }
    }

    function releaseLoads() {
      clearTimeout(loadTimer);
      loadTimer = 0;
      setLoadsHeld(false);
      renderWindow();
    }

    function dragTo(event) {
      const layout = getLayout();
      const geometry = thumbGeometry({ trackHeight: nav.clientHeight, total: layout.total, visible: drag.visible, minThumb });
      const thumbTop = clamp(event.clientY - nav.getBoundingClientRect().top - drag.grab, 0, geometry.travel);
      drag.fraction = geometry.travel > 0 ? thumbTop / geometry.travel : 0;
      drag.target = drag.fraction * geometry.maxIndex;
      thumb.style.height = `${geometry.thumbHeight}px`;
      thumb.style.transform = `translateY(${thumbTop}px)`;
      if (!dragFrame) {
        dragFrame = requestAnimationFrame(applyDrag);
      }
      // Load windows only once the pointer pauses, not for every window passed.
      setLoadsHeld(true);
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        releaseLoads();
        if (drag) setLoadsHeld(true);
      }, loadDelay);
    }

    function applyDrag() {
      dragFrame = 0;
      list.scrollTop = drag.fraction >= 1 ? scrollMax() : scrollTopForIndex(getLayout(), drag.target);
      renderWindow();
    }

    function endDrag() {
      if (!drag) return;
      // A quick click can release before the scheduled frame; apply it now.
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        applyDrag();
      }
      drag = null;
      nav.classList.remove("dragging");
      releaseLoads();
      // Only the thumb resyncs to the list; the list itself does not move.
      scheduleUpdate();
    }

    nav.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const layout = getLayout();
      const { top, visible } = measure(layout);
      const geometry = thumbGeometry({ trackHeight: nav.clientHeight, total: layout.total, visible, minThumb });
      const thumbTop = fractionFromScroll(top, geometry.maxIndex) * geometry.travel;
      const y = event.clientY - nav.getBoundingClientRect().top;
      const onThumb = y >= thumbTop && y <= thumbTop + geometry.thumbHeight;
      // A track press jumps proportionally, then keeps dragging from the thumb's middle.
      drag = { grab: onThumb ? y - thumbTop : geometry.thumbHeight / 2, visible, fraction: 0, target: 0 };
      nav.classList.add("dragging");
      nav.setPointerCapture(event.pointerId);
      dragTo(event);
    });
    nav.addEventListener("pointermove", (event) => {
      if (drag) dragTo(event);
    });
    nav.addEventListener("pointerup", endDrag);
    nav.addEventListener("pointercancel", endDrag);
    nav.addEventListener("lostpointercapture", endDrag);

    // Wheel events over the navigator do not reach the list beside it.
    nav.addEventListener("wheel", (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientHeight : 1;
      list.scrollBy({ top: event.deltaY * unit });
    }, { passive: false });

    list.addEventListener("scroll", scheduleUpdate, { passive: true });

    return {
      setActive(next) {
        active = Boolean(next);
        frame.classList.toggle("has-list-navigator", active);
        if (!active && drag) endDrag();
        scheduleUpdate();
      },
      update: scheduleUpdate,
    };
  }

  return {
    indexAtScroll,
    scrollTopForIndex,
    thumbGeometry,
    createListNavigator,
  };
});
