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

  // Ticks for the overview segments. A tick sits where the thumb's middle is when
  // its segment's first result is at the top. Segments closer than `gap` merge
  // into one tick; each tick owns the band between the midpoints to its
  // neighbours, so the whole rail is clickable.
  function layoutTicks({ buckets, trackHeight, thumbHeight, travel, maxIndex, gap }) {
    const yOf = (start) => (maxIndex > 0 ? clamp(start / maxIndex, 0, 1) : 0) * travel + thumbHeight / 2;
    const ticks = [];
    buckets.forEach((bucket) => {
      const y = yOf(bucket.start);
      const last = ticks[ticks.length - 1];
      if (last && y < last.y + gap) {
        last.members.push(bucket);
      } else {
        ticks.push({ y, members: [bucket] });
      }
    });
    return ticks.map((tick, index) => ({
      y: tick.y,
      first: tick.members[0],
      last: tick.members[tick.members.length - 1],
      start: tick.members[0].start,
      end: tick.members[tick.members.length - 1].start + tick.members[tick.members.length - 1].count,
      count: tick.members.reduce((sum, bucket) => sum + bucket.count, 0),
      top: index === 0 ? 0 : (ticks[index - 1].y + tick.y) / 2,
      bottom: index === ticks.length - 1 ? trackHeight : (tick.y + ticks[index + 1].y) / 2,
    }));
  }

  /* Browser controller. The navigator sits beside the scroll container (inside
     `frame`) because the virtual list removes any child it did not render.
     It is aria-hidden and takes no focus, like a native scrollbar; the list's own
     scrolling stays native. Options:
       getLayout()        current { rows, offsets, total }
       renderWindow()     render the virtual list window at the current scrollTop
       setLoadsHeld(held) pause window loading while a drag keeps moving
       requestOverview()  ask for segments; they arrive through setOverview()
       jumpToIndex(index) land precisely on a result (a tick press)
       formatCount(count)               a segment's size, for the tick tip
       formatPosition(position, total)  the bubble's position text
       minThumb, loadDelay, tickThreshold, tickGap

     An overview is { total, buckets: [{ start, count, full, short }] }: the
     segments in result order with their bubble (`full`) and tick (`short`) labels. */
  function createListNavigator({
    frame,
    list,
    getLayout,
    renderWindow,
    setLoadsHeld,
    requestOverview,
    jumpToIndex,
    formatCount,
    formatPosition,
    minThumb = 32,
    loadDelay = 50,
    tickThreshold = 100,
    tickGap = 20,
  }) {
    const doc = frame.ownerDocument;
    const nav = doc.createElement("div");
    nav.className = "list-navigator";
    nav.setAttribute("aria-hidden", "true");
    nav.hidden = true;
    const rail = doc.createElement("div");
    rail.className = "list-navigator-rail";
    rail.hidden = true;
    const band = doc.createElement("div");
    band.className = "list-navigator-band";
    band.hidden = true;
    const thumb = doc.createElement("div");
    thumb.className = "list-navigator-thumb";
    nav.append(rail, thumb);
    const bubble = doc.createElement("div");
    bubble.className = "list-navigator-bubble";
    bubble.setAttribute("aria-hidden", "true");
    bubble.hidden = true;
    const bubbleLabel = doc.createElement("strong");
    const bubbleCount = doc.createElement("small");
    bubble.append(bubbleLabel, bubbleCount);
    const tip = doc.createElement("div");
    tip.className = "list-navigator-tip";
    tip.setAttribute("aria-hidden", "true");
    tip.hidden = true;
    frame.append(nav, bubble, tip);

    let active = false;
    let frameRequest = 0;
    let drag = null;
    let dragFrame = 0;
    let loadTimer = 0;
    let bubbleTimer = 0;
    let overview = null;
    let ticks = [];
    let tickSignature = [];

    const scrollMax = () => Math.max(0, list.scrollHeight - list.clientHeight);
    const showsTicks = () => Boolean(overview) && overview.total >= tickThreshold;

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

    function bucketAt(index) {
      const { buckets } = overview;
      let low = 0;
      let high = buckets.length - 1;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (buckets[middle].start <= index) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }
      return buckets[low];
    }

    function setRailWidth(width) {
      frame.style.setProperty("--list-navigator-rail-width", `${width}px`);
    }

    function renderTicks(geometry) {
      const signature = [overview ? overview.buckets : null, nav.clientHeight, Math.round(geometry.thumbHeight)];
      if (signature.every((value, index) => value === tickSignature[index])) {
        return;
      }
      tickSignature = signature;
      rail.replaceChildren(band);
      band.hidden = true;
      rail.hidden = !showsTicks();
      if (rail.hidden) {
        ticks = [];
        setRailWidth(0);
        return;
      }
      ticks = layoutTicks({ buckets: overview.buckets, trackHeight: nav.clientHeight, gap: tickGap, ...geometry });
      ticks.forEach((tick) => {
        const label = doc.createElement("span");
        label.className = "list-navigator-label";
        label.style.top = `${tick.y}px`;
        const merged = tick.first !== tick.last;
        label.textContent = merged ? `${tick.first.short}–${tick.last.short}` : tick.first.short;
        label.classList.toggle("merged", merged);
        tick.label = label;
        tick.tip = `${merged ? `${tick.first.full} – ${tick.last.full}` : tick.first.full} · ${formatCount(tick.count)}`;
        rail.append(label);
      });
      // The rail is as wide as its widest label; a fixed width clips merged date labels.
      const widest = Math.max(...ticks.map((tick) => tick.label.getBoundingClientRect().width));
      setRailWidth(Math.max(22, Math.ceil(widest + 8)));
    }

    function highlightTick(index) {
      ticks.forEach((tick) => tick.label.classList.toggle("current", index >= tick.start && index < tick.end));
    }

    function showBubble(index, centerY) {
      if (!overview) {
        return;
      }
      clearTimeout(bubbleTimer);
      const total = overview.total;
      const position = clamp(Math.floor(index), 0, total - 1);
      bubbleLabel.textContent = bucketAt(position).full;
      bubbleCount.textContent = formatPosition(position + 1, total);
      bubble.hidden = false;
      // Kept inside the frame, which clips its children.
      const height = bubble.offsetHeight;
      bubble.style.top = `${clamp(nav.offsetTop + centerY - height / 2, 0, frame.clientHeight - height)}px`;
    }

    function hideBubble(delay = 0) {
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => {
        bubble.hidden = true;
      }, delay);
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
      renderTicks(geometry);
      highlightTick(top);
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
      showBubble(drag.target, thumbTop + geometry.thumbHeight / 2);
      highlightTick(drag.target);
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
      hideBubble(350);
      // Only the thumb resyncs to the list; the list itself does not move.
      scheduleUpdate();
    }

    function tickAt(event) {
      const y = event.clientY - rail.getBoundingClientRect().top;
      return ticks.find((tick) => y >= tick.top && y < tick.bottom) || null;
    }

    function hoverTick(tick) {
      ticks.forEach((candidate) => candidate.label.classList.toggle("hovered", candidate === tick));
      band.hidden = !tick;
      tip.hidden = !tick;
      if (!tick) return;
      band.style.top = `${tick.top}px`;
      band.style.height = `${tick.bottom - tick.top}px`;
      tip.textContent = tick.tip;
      tip.style.top = `${nav.offsetTop + tick.y}px`;
    }

    // Segments are only needed once the pointer reaches the navigator: the ticks
    // and the bubble appear on hover or drag.
    nav.addEventListener("pointerenter", () => requestOverview());

    nav.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || rail.contains(event.target)) return;
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
      if (drag) {
        dragTo(event);
        return;
      }
      if (rail.contains(event.target)) {
        hideBubble();
        hoverTick(tickAt(event));
        return;
      }
      hoverTick(null);
      if (event.pointerType === "touch") return;
      // Hover preview: where a press here would land, with the thumb centred on the pointer.
      const layout = getLayout();
      const { visible } = measure(layout);
      const geometry = thumbGeometry({ trackHeight: nav.clientHeight, total: layout.total, visible, minThumb });
      const thumbTop = clamp(event.clientY - nav.getBoundingClientRect().top - geometry.thumbHeight / 2, 0, geometry.travel);
      showBubble((geometry.travel > 0 ? thumbTop / geometry.travel : 0) * geometry.maxIndex, thumbTop + geometry.thumbHeight / 2);
    });
    nav.addEventListener("pointerleave", () => {
      hoverTick(null);
      if (!drag) hideBubble();
    });
    nav.addEventListener("pointerup", endDrag);
    nav.addEventListener("pointercancel", endDrag);
    nav.addEventListener("lostpointercapture", endDrag);

    rail.addEventListener("click", (event) => {
      const tick = tickAt(event);
      if (tick) jumpToIndex(tick.start);
    });

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
      setOverview(next) {
        overview = next;
        scheduleUpdate();
      },
      update: scheduleUpdate,
    };
  }

  return {
    indexAtScroll,
    scrollTopForIndex,
    thumbGeometry,
    layoutTicks,
    createListNavigator,
  };
});
