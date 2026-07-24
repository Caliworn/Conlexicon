const assert = require("node:assert/strict");
const { AnalysisFeatureService } = require("../lib/analysis-feature-service");
const { normalizeDictionary } = require("../lib/dictionary-model");
const {
  FeatureResultQueryValidationError,
  normalizeFeatureResultQuery,
} = require("../lib/feature-result-query-model");
const { FeatureResultSessionCache } = require("../lib/feature-result-session-cache");
const { createSimpleIpaEngine } = require("../lib/phonology-engine");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const {
  createTempSqliteRepository,
  sqliteRuntimeUnavailableMessage,
} = require("./sqlite-check-utils");

const SOURCE = {
  type: "ipaAutoCompare",
  version: 1,
  options: {},
};

function featureRequest(category, options = {}) {
  return {
    source: SOURCE,
    view: {
      category,
      search: options.search || {
        text: "",
        fields: ["lemma", "pronunciation"],
        fuzzyFields: [],
      },
      sort: options.sort || "lemmaAsc",
    },
    page: {
      limit: options.limit || 2,
      cursor: options.cursor || "",
      ...(options.windowOffset === undefined ? {} : { windowOffset: options.windowOffset }),
    },
  };
}

function summaryCounts(response, key) {
  return Object.fromEntries((response.summary?.[key] || []).map((row) => [row.key, row.count]));
}

async function checkQueryModel() {
  const normalized = normalizeFeatureResultQuery(featureRequest("strictMismatch"));
  assert.equal(normalized.source.type, "ipaAutoCompare");
  assert.equal(normalized.view.category, "strictMismatch");
  assert.equal(normalized.page.limit, 2);
  assert.throws(
    () => normalizeFeatureResultQuery({ ...featureRequest("match"), source: { ...SOURCE, version: 2 } }),
    (error) => error instanceof FeatureResultQueryValidationError
      && error.code === "invalid_feature_result_source_version",
  );
  assert.throws(
    () => normalizeFeatureResultQuery(featureRequest("unknown")),
    (error) => error instanceof FeatureResultQueryValidationError
      && error.code === "invalid_feature_result_category",
  );
}

async function checkCache() {
  const cache = new FeatureResultSessionCache({
    maxSessionsPerDictionary: 1,
    maxBytes: 1024,
    estimateBytes: () => 100,
  });
  let builds = 0;
  let resolveBuild;
  const pendingBuild = new Promise((resolve) => {
    resolveBuild = resolve;
  });
  const options = {
    descriptor: { dictionaryId: "dict-cache", generation: 1, source: SOURCE },
    build: async () => {
      builds += 1;
      await pendingBuild;
      return { recordsById: new Map() };
    },
  };
  const first = cache.getOrCreate(options);
  const second = cache.getOrCreate(options);
  resolveBuild();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(builds, 1, "concurrent requests should share one build");
  assert.equal(firstResult.cacheStatus, "miss");
  assert.equal(secondResult.cacheStatus, "in_flight");
  const third = await cache.getOrCreate(options);
  assert.equal(third.cacheStatus, "hit");

  await cache.getOrCreate({
    descriptor: { dictionaryId: "dict-cache", generation: 2, source: SOURCE },
    build: () => ({ recordsById: new Map() }),
  });
  assert.equal(cache.stats().sessionCount, 1, "per-dictionary session limit should evict the oldest result");
}

async function checkRepositoryIntegration() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log(sqliteRuntimeUnavailableMessage("feature result session integration check"));
    return;
  }
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-feature-result-");
  try {
    const dictionary = normalizeDictionary({
      id: "dict-feature-result",
      name: "Feature result",
      language: "Test",
      settings: {
        search: {
          fields: {
            lemma: { enabled: true, fuzzy: false },
            pronunciation: { enabled: true, fuzzy: false },
          },
        },
      },
      entries: [
        { id: "entry-exact", lemma: "ata", pronunciation: "/ˈa.ta/" },
        { id: "entry-normalized", lemma: "ata", pronunciation: "[a.ta]" },
        { id: "entry-mismatch", lemma: "ata", pronunciation: "/a.da/" },
        { id: "entry-unavailable", lemma: "", pronunciation: "/x/" },
        { id: "entry-failed", lemma: "fail", pronunciation: "/f/" },
      ],
    });
    await repository.importDictionarySnapshot(dictionary);

    const simpleEngine = createSimpleIpaEngine();
    let generateCalls = 0;
    const engine = {
      ...simpleEngine,
      async generate(input) {
        generateCalls += 1;
        if (input?.input?.orthography === "fail") {
          throw Object.assign(new Error("fixture failure"), { code: "fixture_failure" });
        }
        return simpleEngine.generate(input);
      },
    };
    const service = new AnalysisFeatureService({ repository, engine });

    const strict = await service.query(dictionary.id, featureRequest("strictMismatch", { limit: 1 }));
    assert.equal(strict.items.length, 1);
    assert.equal(strict.pageInfo.total, 2);
    assert.equal(strict.pageInfo.hasMore, true);
    assert.equal(strict.items[0].feature.outcome, "normalizedOnlyMatch");
    assert.ok(strict.items[0].entry.id);
    assert.equal(Object.hasOwn(strict, "entryIds"), false);
    assert.deepEqual(summaryCounts(strict, "outcomes"), {
      exactMatch: 1,
      normalizedOnlyMatch: 1,
      mismatch: 1,
      unavailable: 1,
      failed: 1,
    });
    assert.deepEqual(summaryCounts(strict, "views"), {
      match: 1,
      looseMismatch: 1,
      strictMismatch: 2,
    });
    assert.equal(generateCalls, 5);

    const strictNext = await service.query(dictionary.id, featureRequest("strictMismatch", {
      limit: 1,
      cursor: strict.pageInfo.nextCursor,
    }));
    assert.equal(strictNext.items[0].feature.outcome, "mismatch");
    assert.equal(generateCalls, 5, "paging must reuse the base feature session");

    const loose = await service.query(dictionary.id, featureRequest("looseMismatch"));
    assert.deepEqual(loose.items.map((item) => item.entry.id), ["entry-mismatch"]);
    assert.equal(generateCalls, 5, "category changes must not rerun the engine");

    const searched = await service.query(dictionary.id, featureRequest("strictMismatch", {
      search: { text: "a.da", fields: ["pronunciation"], fuzzyFields: [] },
    }));
    assert.deepEqual(searched.items.map((item) => item.entry.id), ["entry-mismatch"]);
    assert.equal(searched.items[0].entry.searchHits[0].field, "pronunciation");
    assert.equal(generateCalls, 5, "search changes must not rerun the engine");

    const located = await service.location(dictionary.id, {
      ...featureRequest("strictMismatch", { limit: 1 }),
      entryId: "entry-normalized",
    });
    assert.equal(located.location.found, true);
    assert.equal(located.location.windowIndex, 0);
    assert.equal(located.items[0].entry.id, "entry-normalized");

    await assert.rejects(
      service.query(dictionary.id, featureRequest("match", {
        limit: 1,
        cursor: strict.pageInfo.nextCursor,
      })),
      (error) => error.code === "query_cursor_stale",
    );

    const saved = await repository.getEntry(dictionary.id, "entry-exact");
    await repository.saveEntry(dictionary.id, { ...saved, pronunciation: "/a.da/" });
    const afterSave = await service.query(dictionary.id, featureRequest("match"));
    assert.equal(generateCalls, 10, "dictionary writes must invalidate the base feature session");
    assert.equal(summaryCounts(afterSave, "views").match, 0);
  } finally {
    repository.close();
    await cleanup();
  }
}

async function main() {
  await checkQueryModel();
  await checkCache();
  await checkRepositoryIntegration();
  console.log("Feature result session checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
