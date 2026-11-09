// Entry list overview: the segments the list navigator shows as ticks and in its
// bubble (docs/ENHANCED_SCROLLBAR_PLAN.md 5.3, 5.4). Segments are cut from the
// results in their sort order as runs of equal keys, so each segment is
// contiguous by construction; a key that appears in two places (an unparseable
// date between valid ones) simply forms two segments.

const OVERVIEW_TIME_GRAINS = Object.freeze(["day", "month", "year"]);
const NO_DATE_KEY = "none";
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;
const TIME_SLOT_MS = 15 * 60 * 1000;

class EntryOverviewValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "EntryOverviewValidationError";
    this.code = code;
  }
}

// The first unit of the lemma sort order. Lemma sort compares sort_key as code
// points, so the first code point is the unit; a custom alphabet sort would
// change this function and nothing else (plan 5.4).
function firstSortUnit(sortKey) {
  const value = String(sortKey || "");
  return value ? String.fromCodePoint(value.codePointAt(0)) : "";
}

function parseTimestamp(value) {
  const text = String(value || "");
  if (!ISO_TIMESTAMP.test(text)) {
    return null;
  }
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

function normalizeOverviewTimeZone(value) {
  const timeZone = String(value || "").trim() || "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch (error) {
    if (error instanceof RangeError) {
      throw new EntryOverviewValidationError(`Unknown time zone: ${timeZone}`, "invalid_overview_time_zone");
    }
    throw error;
  }
}

// Spans up to 60 days read by day, up to four years by month, longer by year.
function overviewTimeGrain(times) {
  let min = Infinity;
  let max = -Infinity;
  times.forEach((time) => {
    if (time === null) return;
    min = Math.min(min, time);
    max = Math.max(max, time);
  });
  const days = max >= min ? (max - min) / 86400000 : 0;
  return days <= 60 ? "day" : days <= 4 * 366 ? "month" : "year";
}

// Local calendar keys in the viewer's time zone. Offsets change on quarter-hour
// boundaries at most, so dates are formatted once per 15-minute UTC slot;
// entries created in bursts share slots.
function timeKeyFormatter(timeZone, grain) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  });
  const slots = new Map();
  return (time) => {
    if (time === null) {
      return NO_DATE_KEY;
    }
    const slot = Math.floor(time / TIME_SLOT_MS);
    let key = slots.get(slot);
    if (key === undefined) {
      const parts = Object.fromEntries(format.formatToParts(new Date(time)).map((part) => [part.type, part.value]));
      key = grain === "year" ? parts.year : grain === "month" ? `${parts.year}-${parts.month}` : `${parts.year}-${parts.month}-${parts.day}`;
      slots.set(slot, key);
    }
    return key;
  };
}

function runLengthSegments(keys) {
  const buckets = [];
  keys.forEach((key, index) => {
    const last = buckets[buckets.length - 1];
    if (last && last.key === key) {
      last.count += 1;
    } else {
      buckets.push({ key, start: index, count: 1 });
    }
  });
  return buckets;
}

// rows: the results in sort order, each { sortKey } for lemma sorts or
// { timestamp } for time sorts.
function buildEntryOverview(rows, { sort, timeZone }) {
  if (sort.startsWith("lemma")) {
    return {
      total: rows.length,
      sort,
      grain: "",
      buckets: runLengthSegments(rows.map((row) => firstSortUnit(row.sortKey))),
    };
  }
  const times = rows.map((row) => parseTimestamp(row.timestamp));
  const grain = overviewTimeGrain(times);
  const keyOf = timeKeyFormatter(timeZone, grain);
  return {
    total: rows.length,
    sort,
    grain,
    buckets: runLengthSegments(times.map(keyOf)),
  };
}

module.exports = {
  NO_DATE_KEY,
  OVERVIEW_TIME_GRAINS,
  EntryOverviewValidationError,
  buildEntryOverview,
  firstSortUnit,
  normalizeOverviewTimeZone,
  overviewTimeGrain,
  parseTimestamp,
};
