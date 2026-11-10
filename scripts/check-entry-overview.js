const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");
const { createApiRouter } = require("../lib/api-routes");
const { importDictionaryFromJsonPayload } = require("../lib/dictionary-conversion-service");
const {
  NO_DATE_KEY,
  buildEntryOverview,
  firstSortUnit,
  normalizeOverviewTimeZone,
  overviewTimeGrain,
} = require("../lib/entry-overview-model");

const DICTIONARY_ID = "dict-overview-check";

// Segments must tile the results exactly; the navigator maps them onto its track.
function assertTiles(overview) {
  let next = 0;
  overview.buckets.forEach((bucket) => {
    assert.equal(bucket.start, next, `segment ${bucket.key} should start where the previous one ended`);
    assert.ok(bucket.count > 0);
    next += bucket.count;
  });
  assert.equal(next, overview.total, "segments should add up to the result count");
}

function checkSortUnits() {
  assert.equal(firstSortUnit("ŋa"), "ŋ");
  assert.equal(firstSortUnit("𐌀b"), "𐌀", "a unit is a code point, not a UTF-16 half");
  assert.equal(firstSortUnit(""), "");
}

function checkTimeGrains() {
  const day = 86400000;
  const start = Date.UTC(2026, 0, 1);
  assert.equal(overviewTimeGrain([start, start + 60 * day]), "day");
  assert.equal(overviewTimeGrain([start, start + 61 * day]), "month");
  assert.equal(overviewTimeGrain([start, start + 4 * 366 * day]), "month");
  assert.equal(overviewTimeGrain([start, start + 4 * 366 * day + day]), "year");
  assert.equal(overviewTimeGrain([null, start]), "day", "missing dates do not widen the span");
}

function checkTimeZones() {
  assert.equal(normalizeOverviewTimeZone(""), "UTC");
  assert.equal(normalizeOverviewTimeZone("Asia/Shanghai"), "Asia/Shanghai");
  assert.throws(() => normalizeOverviewTimeZone("Mars/Base"), { code: "invalid_overview_time_zone" });
  // 16:30 UTC on 31 October is already 1 November in Shanghai.
  const rows = [{ timestamp: "2026-10-31T16:30:00.000Z" }, { timestamp: "2026-08-01T00:00:00.000Z" }];
  const utc = buildEntryOverview(rows, { sort: "createdDesc", timeZone: "UTC" });
  const shanghai = buildEntryOverview(rows, { sort: "createdDesc", timeZone: "Asia/Shanghai" });
  assert.equal(utc.grain, "month");
  assert.deepEqual(utc.buckets.map((bucket) => bucket.key), ["2026-10", "2026-08"]);
  assert.deepEqual(shanghai.buckets.map((bucket) => bucket.key), ["2026-11", "2026-08"], "dates are cut in the viewer's time zone");
}

function checkRunsInSortOrder() {
  const lemma = buildEntryOverview(["ab", "ac", "b", "ŋa", "ŋb"].map((sortKey) => ({ sortKey })), { sort: "lemmaAsc", timeZone: "UTC" });
  assert.deepEqual(lemma.buckets, [
    { key: "a", start: 0, count: 2 },
    { key: "b", start: 2, count: 1 },
    { key: "ŋ", start: 3, count: 2 },
  ]);
  assertTiles(lemma);
  // As SQLite orders strings, "2024/05/03" sorts after every "2024-…" date, so
  // the no-date key forms two segments; each still starts at the right index.
  const time = buildEntryOverview([
    { timestamp: "2025-01-02T00:00:00.000Z" },
    { timestamp: "2024/05/03" },
    { timestamp: "2024-12-01T00:00:00.000Z" },
    { timestamp: "2024-03-01T00:00:00.000Z" },
    { timestamp: "" },
  ], { sort: "createdDesc", timeZone: "UTC" });
  assert.deepEqual(time.buckets.map((bucket) => [bucket.key, bucket.start]), [
    ["2025-01", 0],
    [NO_DATE_KEY, 1],
    ["2024-12", 2],
    ["2024-03", 3],
    [NO_DATE_KEY, 4],
  ]);
  assertTiles(time);
}

function legacyDictionary() {
  const lemmas = ["ama", "apo", "bela", "ŋoru", "ŋata", "sola", "sune", "Tika"];
  return {
    id: DICTIONARY_ID,
    name: "Overview check",
    entries: [
      ...lemmas.map((lemma, index) => ({
        id: `entry-${index}`,
        lemma,
        tags: ["n"],
        definitions: [{ id: `def-${index}`, meaning: `meaning ${index}` }],
        createdAt: index === 3 ? "2024/05/03" : new Date(Date.UTC(2026, index, 15)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
      })),
      // Imported IDs are free-form; this one must stay readable at /entries/overview.
      {
        id: "overview",
        lemma: "ovo",
        tags: ["n"],
        definitions: [{ id: "def-overview", meaning: "egg" }],
        createdAt: "2026-09-15T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ],
  };
}

async function getRoute(repository, pathname) {
  const request = Readable.from([]);
  request.headers = {};
  request.method = "GET";
  let statusCode = 0;
  let responseBody = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      responseBody = value || "";
    },
  };
  await createApiRouter({ repository })(request, response, new URL(pathname, "http://localhost"));
  return { statusCode, body: JSON.parse(responseBody) };
}

async function checkRepository() {
  requireSqliteRuntime("entry overview check");
  const temp = await createTempSqliteRepository("conlexicon-overview-check-");
  try {
    const { repository } = temp;
    const { dictionary } = importDictionaryFromJsonPayload(legacyDictionary());
    await repository.importDictionary(dictionary, { overwrite: true });

    // Without a search the overview is read in SQL, in the list's own order.
    const lemma = await repository.getEntryQueryOverview(DICTIONARY_ID, { sort: "lemmaAsc" });
    assertTiles(lemma);
    assert.deepEqual(lemma.buckets.map((bucket) => [bucket.key, bucket.count]), [["a", 2], ["b", 1], ["o", 1], ["s", 2], ["t", 1], ["ŋ", 2]], "lemma segments follow the code point sort of the lowercased lemma");
    assert.equal(lemma.total, (await repository.queryEntries(DICTIONARY_ID, { sort: "lemmaAsc", limit: 1 })).pageInfo.total);
    const lemmaDesc = await repository.getEntryQueryOverview(DICTIONARY_ID, { sort: "lemmaDesc" });
    assert.deepEqual(lemmaDesc.buckets.map((bucket) => bucket.key), ["ŋ", "t", "s", "o", "b", "a"]);

    // The overview has its own path, so no entry ID can collide with it.
    const entryRoute = await getRoute(repository, `/api/dictionaries/${DICTIONARY_ID}/entries/overview`);
    assert.equal(entryRoute.statusCode, 200);
    assert.equal(entryRoute.body.id, "overview", "/entries/overview reads the entry whose ID is overview");
    const overviewRoute = await getRoute(repository, `/api/dictionaries/${DICTIONARY_ID}/entry-overview?sort=lemmaAsc`);
    assert.equal(overviewRoute.statusCode, 200);
    assert.deepEqual(overviewRoute.body, lemma);

    const created = await repository.getEntryQueryOverview(DICTIONARY_ID, { sort: "createdAsc", tz: "UTC" });
    assertTiles(created);
    assert.equal(created.grain, "month");
    assert.ok(created.buckets.some((bucket) => bucket.key === NO_DATE_KEY), "an unparseable creation date gets the no-date segment");
    const updated = await repository.getEntryQueryOverview(DICTIONARY_ID, { sort: "updatedDesc", tz: "UTC" });
    assert.equal(updated.grain, "day", "updates within a week read by day");
    assert.equal(updated.buckets[0].key, "2026-10-08");

    // With a search the overview follows the query session's ordered hits.
    const searchQuery = { q: "a", fields: "lemma", sort: "lemmaAsc" };
    const searched = await repository.getEntryQueryOverview(DICTIONARY_ID, searchQuery);
    const searchedWindow = await repository.queryEntries(DICTIONARY_ID, { ...searchQuery, limit: 200 });
    assertTiles(searched);
    assert.equal(searched.total, searchedWindow.pageInfo.total);
    assert.deepEqual(
      searched.buckets.flatMap((bucket) => Array(bucket.count).fill(bucket.key)),
      searchedWindow.items.map((entry) => firstSortUnit(entry.lemma.toLowerCase())),
      "search segments line up with the search results",
    );

    await assert.rejects(
      () => repository.getEntryQueryOverview(DICTIONARY_ID, { sort: "createdAsc", tz: "Mars/Base" }),
      { status: 400, code: "invalid_overview_time_zone" },
    );
  } finally {
    await temp.cleanup();
  }
}

async function main() {
  checkSortUnits();
  checkTimeGrains();
  checkTimeZones();
  checkRunsInSortOrder();
  await checkRepository();
  console.log("Entry overview segment and repository checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
