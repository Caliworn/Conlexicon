const assert = require("node:assert/strict");
const { AnalysisFeatureService } = require("../lib/analysis-feature-service");
const { normalizeDictionary } = require("../lib/dictionary-model");
const {
  FeatureResultQueryValidationError,
  normalizeFeatureResultQuery,
} = require("../lib/feature-result-query-model");
const { FeatureResultSessionCache } = require("../lib/feature-result-session-cache");
const { buildIpaDistributionResult } = require("../lib/ipa-distribution-feature");
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
const DISTRIBUTION_SOURCE = {
  type: "ipaDistribution",
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

function distributionRequest(category, value, options = {}) {
  return {
    source: DISTRIBUTION_SOURCE,
    view: {
      category,
      value,
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

function distributionCounts(response, facet, countField = "count") {
  return Object.fromEntries(
    (response.summary?.distributions?.[facet] || [])
      .map((row) => [row.value, row[countField]]),
  );
}

async function checkQueryModel() {
  const normalized = normalizeFeatureResultQuery(featureRequest("strictMismatch"));
  assert.equal(normalized.source.type, "ipaAutoCompare");
  assert.equal(normalized.responseMode, "items");
  assert.equal(normalized.view.category, "strictMismatch");
  assert.equal(normalized.page.limit, 2);
  const distribution = normalizeFeatureResultQuery(distributionRequest("syllableCount", "02"));
  assert.equal(distribution.source.type, "ipaDistribution");
  assert.equal(distribution.view.category, "syllableCount");
  assert.equal(distribution.view.value, "2");
  assert.deepEqual(
    normalizeFeatureResultQuery({ source: SOURCE, responseMode: "summary" }),
    { source: SOURCE, responseMode: "summary" },
  );
  assert.deepEqual(
    normalizeFeatureResultQuery({ source: DISTRIBUTION_SOURCE, responseMode: "summary" }),
    { source: DISTRIBUTION_SOURCE, responseMode: "summary" },
  );
  assert.throws(
    () => normalizeFeatureResultQuery({ source: SOURCE, responseMode: "summary", page: { limit: 1 } }),
    (error) => error instanceof FeatureResultQueryValidationError
      && error.code === "invalid_feature_result_summary_request",
  );
  assert.throws(
    () => normalizeFeatureResultQuery({ source: SOURCE, responseMode: "unknown" }),
    (error) => error instanceof FeatureResultQueryValidationError
      && error.code === "invalid_feature_result_response_mode",
  );
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
  assert.throws(
    () => normalizeFeatureResultQuery(distributionRequest("unit", "")),
    (error) => error instanceof FeatureResultQueryValidationError
      && error.code === "invalid_feature_result_value",
  );
  assert.throws(
    () => normalizeFeatureResultQuery(distributionRequest("syllableCount", "1.5")),
    (error) => error instanceof FeatureResultQueryValidationError
      && error.code === "invalid_feature_result_value",
  );
}

async function checkIpaDistributionModel() {
  const result = await buildIpaDistributionResult([
    { id: "complex", pronunciation: "/ˈt͡sa-na/" },
    { id: "legacy-dot", pronunciation: "[a.ta]" },
  ], {
    syllable: {
      complexPhonemes: ["t͡s"],
      separator: "-",
    },
  });
  assert.equal(result.summary.inputTotal, 2);
  assert.equal(result.summary.unitTotal, 7);
  assert.equal(result.summary.syllableEntryCount, 2);
  assert.equal(result.summary.syllableTotal, 4);
  assert.equal(result.summary.syllableAverage, 2);
  assert.deepEqual(distributionCounts({ summary: result.summary }, "units"), {
    a: 4,
    t: 1,
    "t͡s": 1,
    n: 1,
  });
  assert.deepEqual(distributionCounts({ summary: result.summary }, "units", "entryCount"), {
    a: 2,
    t: 1,
    "t͡s": 1,
    n: 1,
  });
  assert.equal(result.recordsById.get("complex").initial, "t͡s");
  assert.equal(result.recordsById.get("complex").final, "a");
  assert.equal(result.recordsById.get("legacy-dot").syllableCount, 2);
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
    const generation = repository.querySessionGeneration(dictionary.id);
    const distributionDescriptor = service.sessionDescriptor(
      dictionary,
      generation,
      DISTRIBUTION_SOURCE,
    );
    const autoCompareDescriptor = service.sessionDescriptor(dictionary, generation, SOURCE);
    assert.equal(Object.hasOwn(distributionDescriptor, "engine"), false);
    assert.equal(Object.hasOwn(autoCompareDescriptor, "engine"), true);
    const mappingOnlyDescriptor = service.sessionDescriptor({
      ...dictionary,
      settings: {
        ...dictionary.settings,
        ipa: {
          ...dictionary.settings.ipa,
          mappings: [{ from: "x", to: "y" }],
        },
      },
    }, generation, DISTRIBUTION_SOURCE);
    assert.equal(mappingOnlyDescriptor.settingsDigest, distributionDescriptor.settingsDigest);
    const separatorDescriptor = service.sessionDescriptor({
      ...dictionary,
      settings: {
        ...dictionary.settings,
        ipa: {
          ...dictionary.settings.ipa,
          syllable: {
            ...dictionary.settings.ipa.syllable,
            separator: "-",
          },
        },
      },
    }, generation, DISTRIBUTION_SOURCE);
    assert.notEqual(separatorDescriptor.settingsDigest, distributionDescriptor.settingsDigest);
    let orderedViewCalls = 0;
    let entrySummaryCalls = 0;
    const orderedAnalysisFeatureEntryIds = repository.orderedAnalysisFeatureEntryIds.bind(repository);
    const analysisFeatureEntrySummaries = repository.analysisFeatureEntrySummaries.bind(repository);
    repository.orderedAnalysisFeatureEntryIds = (...args) => {
      orderedViewCalls += 1;
      return orderedAnalysisFeatureEntryIds(...args);
    };
    repository.analysisFeatureEntrySummaries = (...args) => {
      entrySummaryCalls += 1;
      return analysisFeatureEntrySummaries(...args);
    };

    const summary = await service.query(dictionary.id, {
      source: SOURCE,
      responseMode: "summary",
    });
    assert.equal(Object.hasOwn(summary, "items"), false);
    assert.equal(Object.hasOwn(summary, "pageInfo"), false);
    assert.equal(Object.hasOwn(summary.diagnostics, "viewCache"), false);
    assert.equal(orderedViewCalls, 0, "summary mode must not build an ordered result view");
    assert.equal(entrySummaryCalls, 0, "summary mode must not read entry summaries");
    assert.equal(generateCalls, 5);
    assert.deepEqual(summaryCounts(summary, "views"), {
      match: 1,
      looseMismatch: 1,
      strictMismatch: 2,
    });

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
    assert.equal(generateCalls, 5, "item query must reuse the summary request's base feature session");
    assert.equal(orderedViewCalls, 1);
    assert.equal(entrySummaryCalls, 1);

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

    const orderedCallsBeforeDistributionSummary = orderedViewCalls;
    const summaryCallsBeforeDistributionSummary = entrySummaryCalls;
    const distributionSummary = await service.query(dictionary.id, {
      source: DISTRIBUTION_SOURCE,
      responseMode: "summary",
    });
    assert.equal(generateCalls, 5, "IPA distribution must not invoke the phonology engine");
    assert.equal(orderedViewCalls, orderedCallsBeforeDistributionSummary);
    assert.equal(entrySummaryCalls, summaryCallsBeforeDistributionSummary);
    assert.equal(distributionSummary.summary.inputTotal, 5);
    assert.equal(distributionSummary.summary.unitTotal, 11);
    assert.equal(distributionSummary.summary.syllableEntryCount, 5);
    assert.equal(distributionSummary.summary.syllableTotal, 8);
    assert.equal(distributionSummary.summary.syllableAverage, 1.6);
    assert.deepEqual(distributionCounts(distributionSummary, "units"), {
      a: 6,
      d: 1,
      f: 1,
      t: 2,
      x: 1,
    });
    assert.deepEqual(distributionCounts(distributionSummary, "units", "entryCount"), {
      a: 3,
      d: 1,
      f: 1,
      t: 2,
      x: 1,
    });
    assert.deepEqual(distributionCounts(distributionSummary, "syllableCounts"), {
      1: 2,
      2: 3,
    });
    const warmDistributionSummary = await service.query(dictionary.id, {
      source: DISTRIBUTION_SOURCE,
      responseMode: "summary",
    });
    assert.equal(warmDistributionSummary.diagnostics.cache, "hit");
    assert.equal(generateCalls, 5);

    const unitA = await service.query(dictionary.id, distributionRequest("unit", "a"));
    assert.equal(unitA.pageInfo.total, 3);
    assert.equal(unitA.items.length, 2);
    assert.ok(unitA.items.every((item) => item.feature.occurrenceCount === 2));
    assert.ok(unitA.items.every((item) => item.feature.category === "unit"));
    const unitANext = await service.query(dictionary.id, distributionRequest("unit", "a", {
      cursor: unitA.pageInfo.nextCursor,
    }));
    assert.equal(unitANext.items.length, 1);
    assert.equal(unitANext.items[0].feature.value, "a");

    const searchedSyllables = await service.query(dictionary.id, distributionRequest("syllableCount", "2", {
      search: { text: "a.da", fields: ["pronunciation"], fuzzyFields: [] },
    }));
    assert.deepEqual(searchedSyllables.items.map((item) => item.entry.id), ["entry-mismatch"]);
    const locatedUnit = await service.location(dictionary.id, {
      ...distributionRequest("unit", "a", { limit: 1 }),
      entryId: "entry-mismatch",
    });
    assert.equal(locatedUnit.location.found, true);
    assert.equal(locatedUnit.items[0].entry.id, "entry-mismatch");
    assert.equal(generateCalls, 5, "IPA distribution views must reuse their own session without engine work");

    const saved = await repository.getEntry(dictionary.id, "entry-exact");
    await repository.saveEntry(dictionary.id, { ...saved, pronunciation: "/a.da/" });
    const afterSave = await service.query(dictionary.id, featureRequest("match"));
    assert.equal(generateCalls, 10, "dictionary writes must invalidate the base feature session");
    assert.equal(summaryCounts(afterSave, "views").match, 0);
    const distributionAfterSave = await service.query(dictionary.id, {
      source: DISTRIBUTION_SOURCE,
      responseMode: "summary",
    });
    assert.equal(distributionAfterSave.diagnostics.cache, "miss");
    assert.equal(distributionCounts(distributionAfterSave, "units").t, 1);
    assert.equal(distributionCounts(distributionAfterSave, "units").d, 2);
    assert.equal(generateCalls, 10, "distribution rebuilds after writes must remain engine-independent");
  } finally {
    repository.close();
    await cleanup();
  }
}

async function main() {
  await checkQueryModel();
  await checkIpaDistributionModel();
  await checkCache();
  await checkRepositoryIntegration();
  console.log("Feature result session checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
