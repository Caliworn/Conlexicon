const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  importDictionaryFromPayload,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const { createApiRouter } = require("../lib/api-routes");
const { createDictionaryConversionService } = require("../lib/dictionary-conversion-service");
const { migrateLegacyDictionary } = require("../lib/legacy-dictionary-migration");
const morphologyModel = require("../lib/morphology-model");
const ipaModel = require("../lib/ipa-model");
const tagModel = require("../lib/tag-model");
const entrySearchModel = require("../lib/entry-search-model");
const entryRelationsModel = require("../lib/entry-relations-model");
const qualityModel = require("../lib/quality-model");

const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";
const CONTRACT_STAGES = {
  lifecycle: 1,
  entryCrud: 2,
  readApi: 3,
  modules: 4,
  all: 99,
};

async function assertRejectStatus(promise, status, label) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.status, status, label);
    return;
  }
  assert.fail(`${label}: expected rejection with status ${status}`);
}

function withPatchedRandomUUID(values, callback) {
  const originalRandomUUID = crypto.randomUUID;
  const queue = [...values];
  crypto.randomUUID = () => {
    if (!queue.length) {
      throw new Error("randomUUID test queue exhausted");
    }
    return queue.shift();
  };
  const restore = () => {
    crypto.randomUUID = originalRandomUUID;
  };
  try {
    const result = callback();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

async function callApi(repository, method, urlPath, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(chunks);
  request.method = method;
  let statusCode = 0;
  let payload = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      payload = value || "";
    },
  };
  const handled = await createApiRouter({ repository })(
    request,
    response,
    new URL(urlPath, "http://localhost"),
  );
  return {
    handled,
    statusCode,
    body: payload ? JSON.parse(payload) : null,
  };
}

async function checkCorpusIdCollisionInvariants(repository) {
  const dictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-corpus-id-collision-contract",
    name: "Corpus ID Collision Contract",
    entries: [
      {
        id: "entry-corpus-contract",
        lemma: "corpus contract",
        definitions: [{ id: "def-corpus-contract", meaning: "contract" }],
      },
    ],
    corpus: {
      units: [{ id: "corpus-unit-contract", content: "corpus unit" }],
    },
  }));

  try {
    await assertRejectStatus(
      repository.saveEntry(dictionary.id, {
        id: "corpus-unit-contract",
        lemma: "entry collides with corpus",
        definitions: [{ meaning: "collision" }],
      }),
      409,
      "entry save rejects entry id colliding with corpus blob id",
    );
    await assertRejectStatus(
      repository.saveEntry(dictionary.id, {
        lemma: "definition collides with corpus",
        definitions: [{ id: "corpus-unit-contract", meaning: "collision" }],
      }),
      409,
      "entry save rejects definition id colliding with corpus blob id",
    );
    await assertRejectStatus(
      repository.saveCorpusChanges(dictionary.id, {
        units: [{ id: "entry-corpus-contract", content: "corpus collides with entry" }],
      }),
      409,
      "corpus save rejects corpus id colliding with existing entry id",
    );
    await assertRejectStatus(
      repository.saveCorpusChanges(dictionary.id, {
        units: [{ id: "def-corpus-contract", content: "corpus collides with definition" }],
      }),
      409,
      "corpus save rejects corpus id colliding with existing definition id",
    );
    await assertRejectStatus(
      repository.saveCorpusChanges(dictionary.id, {
        units: [
          { id: "corpus-duplicate-contract", content: "one" },
          { id: "corpus-duplicate-contract", content: "two" },
        ],
      }),
      409,
      "corpus save rejects duplicate ids inside corpus blob",
    );
  } finally {
    try {
      await repository.deleteDictionary(dictionary.id);
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }
}

async function checkAnalysisQueryContract(repository) {
  const dictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-analysis-query-contract",
    name: "Analysis Query Contract",
    settings: {
      partOfSpeechTags: ["n", "v"],
      tagDisplayMap: { n: "Noun", v: "Verb" },
    },
    entries: [
      {
        id: "entry-analysis-alpha",
        lemma: "alpha",
        pronunciation: "a",
        tags: ["n", "root"],
        definitions: [{ id: "def-analysis-alpha", meaning: "first", example: "alpha example" }],
        notes: "note",
        etymology: { sources: ["beta", "gamma"] },
        createdAt: "2026-07-01T08:00:00.000Z",
        updatedAt: "2026-07-01T09:00:00.000Z",
      },
      {
        id: "entry-analysis-beta",
        lemma: "beta",
        tags: ["v"],
        definitions: [{ id: "def-analysis-beta", meaning: "second" }],
        createdAt: "2026-07-02T08:00:00.000Z",
        updatedAt: "2026-07-02T09:00:00.000Z",
      },
      {
        id: "entry-analysis-gamma",
        lemma: "gamma",
        tags: [],
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-03T09:00:00.000Z",
      },
      {
        id: "entry-analysis-delta",
        lemma: "delta",
        tags: ["n"],
        createdAt: "2026-07-03T08:00:00.000Z",
        updatedAt: "2026-07-04T09:00:00.000Z",
      },
    ],
  }));
  try {
    const topologyBuildsBefore = repository.rootTopologyCache.stats().builds;
    const request = {
      widgets: [
        { id: "entries", type: "entryCount" },
        { id: "lexicon", type: "lexiconSummary" },
        { id: "coverage", type: "coverageBreakdown" },
        { id: "parts", type: "partDistribution", limit: 8 },
        { id: "tags", type: "tagFrequency" },
        { id: "activity", type: "activityPreview", limit: 2 },
        { id: "activityAll", type: "activityDistribution" },
        { id: "families", type: "rootFamilyRanking" },
      ],
    };
    const result = await callApi(
      repository,
      "POST",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`,
      request,
    );
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.dictionaryId, dictionary.id);
    assert.deepEqual(result.body.diagnostics.computedTasks, [
      "entryStats",
      "partStats",
      "tagStats",
      "activityStats",
      "rootTopology",
    ]);
    assert.equal(result.body.widgets.entries.value, 4);
    assert.equal(result.body.widgets.lexicon.entryCount, 4);
    assert.equal(result.body.widgets.lexicon.rootEntryCount, 3);
    assert.equal(result.body.widgets.lexicon.derivedEntryCount, 1);
    assert.equal(result.body.widgets.lexicon.multiSourceEntryCount, 1);
    assert.equal(result.body.widgets.lexicon.rootAction.resultCount, 3);
    assert.deepEqual(result.body.widgets.lexicon.rootAction.filter, {
      presence: [{ field: "source", present: false }],
    });
    assert.deepEqual(result.body.widgets.lexicon.multiSourceAction.filter, { sourceCount: { min: 2 } });

    const coverage = Object.fromEntries(result.body.widgets.coverage.rows.map((row) => [row.field, row]));
    assert.equal(result.body.widgets.coverage.entryTotal, 4);
    assert.equal(coverage.definition.coveredEntryCount, 2);
    assert.equal(coverage.definition.itemCount, 2);
    assert.equal(coverage.example.coveredEntryCount, 1);
    assert.equal(coverage.entryNote.coveredEntryCount, 1);
    assert.equal(coverage.source.coveredEntryCount, 1);
    assert.equal(coverage.ipa.coveredEntryCount, 1);
    assert.equal(coverage.ipa.missingEntryCount, 3);
    assert.equal(coverage.ipa.action.resultCount, 1);
    assert.equal(coverage.ipa.missingAction.resultCount, 3);
    assert.deepEqual(coverage.ipa.missingAction.filter, { presence: [{ field: "ipa", present: false }] });

    const parts = Object.fromEntries(result.body.widgets.parts.rows.map((row) => [row.part, row]));
    assert.equal(parts.n.entryCount, 2);
    assert.equal(parts.n.displayLabel, "Noun");
    assert.equal(parts.v.entryCount, 1);
    assert.equal(parts[NO_PART_FILTER_VALUE].entryCount, 1);
    assert.deepEqual(parts.n.action.filter, { part: "n" });
    assert.equal(result.body.widgets.parts.partTypeCount, 2);
    assert.equal(result.body.widgets.parts.noPartOfSpeechCount, 1);
    assert.deepEqual(result.body.widgets.parts.noPartAction.filter, { part: NO_PART_FILTER_VALUE });

    assert.deepEqual(result.body.widgets.tags.rows.map((row) => row.tag), ["root"]);
    assert.equal(result.body.widgets.tags.rows[0].entryCount, 1);
    assert.deepEqual(result.body.widgets.tags.rows[0].action.filter, {
      tags: { values: ["root"], mode: "any" },
    });
    assert.equal(result.body.widgets.tags.tagTypeCount, 1);

    assert.deepEqual(result.body.widgets.activity.created.map((row) => row.day), ["2026-07-02", "2026-07-03"]);
    assert.deepEqual(Object.keys(result.body.widgets.activity).sort(), ["created", "type", "updated"]);
    assert.deepEqual(result.body.widgets.activity.updated[0].action.filter, {
      activityDays: [{ field: "updated", day: "2026-07-03" }],
    });
    assert.deepEqual(
      result.body.widgets.activityAll.created.map((row) => row.day),
      ["2026-07-01", "2026-07-02", "2026-07-03"],
    );
    assert.deepEqual(
      result.body.widgets.activityAll.updated.map((row) => row.day),
      ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
    );
    assert.equal(result.body.widgets.activityAll.type, "activityDistribution");
    assert.equal(result.body.widgets.families.familyCount, 2);
    assert.deepEqual(result.body.widgets.families.rows, [
      {
        rootId: "entry-analysis-beta",
        lemma: "beta",
        derivedEntryCount: 1,
        action: { type: "entry", entryId: "entry-analysis-beta" },
      },
      {
        rootId: "entry-analysis-gamma",
        lemma: "gamma",
        derivedEntryCount: 1,
        action: { type: "entry", entryId: "entry-analysis-gamma" },
      },
    ]);
    assert.equal(Object.hasOwn(result.body.widgets.families.rows[0], "derivedIds"), false);
    assert.equal(repository.rootTopologyCache.stats().builds, topologyBuildsBefore + 1);
    await repository.queryRootGroups(dictionary.id, { limit: 10 });
    assert.equal(
      repository.rootTopologyCache.stats().builds,
      topologyBuildsBefore + 1,
      "analysis and root-group queries should share one stable topology",
    );

    const withoutActions = await callApi(
      repository,
      "POST",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`,
      {
        widgets: [
          { id: "lexicon", type: "lexiconSummary" },
          { id: "coverage", type: "coverageBreakdown" },
          { id: "activity", type: "activityPreview" },
          { id: "families", type: "rootFamilyRanking" },
        ],
        options: { includeActions: false },
      },
    );
    assert.equal(withoutActions.statusCode, 200);
    assert.deepEqual(withoutActions.body.diagnostics.computedTasks, ["entryStats", "activityStats", "rootTopology"]);
    assert.equal(withoutActions.body.widgets.lexicon.rootAction, undefined);
    assert.equal(withoutActions.body.widgets.coverage.rows[0].action, undefined);
    assert.equal(withoutActions.body.widgets.activity.created[0].action, undefined);
    assert.equal(withoutActions.body.widgets.activity.updated[0].action, undefined);
    assert.equal(withoutActions.body.widgets.families.rows[0].action, undefined);

    const firstGeneration = result.body.generation;
    const firstCacheKey = result.body.cacheKey;
    await repository.saveEntry(dictionary.id, {
      ...(await repository.getEntry(dictionary.id, "entry-analysis-beta")),
      notes: "updated note",
    });
    const refreshed = await callApi(
      repository,
      "POST",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`,
      request,
    );
    assert.equal(refreshed.body.generation, firstGeneration + 1);
    assert.notEqual(refreshed.body.cacheKey, firstCacheKey);
    assert.equal(
      refreshed.body.widgets.coverage.rows.find((row) => row.field === "entryNote").coveredEntryCount,
      2,
    );
    assert.equal(
      repository.rootTopologyCache.stats().builds,
      topologyBuildsBefore + 1,
      "non-relation edits should preserve the root-family topology",
    );

    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`, {
        widgets: [{ id: "unsupported", type: "notAWidget" }],
      }),
      400,
      "unsupported analysis widget",
    );
    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`, {
        widgets: [
          { id: "duplicate", type: "entryCount" },
          { id: "duplicate", type: "coverageBreakdown" },
        ],
      }),
      400,
      "duplicate analysis widget id",
    );
    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`, {
        widgets: [{ id: "activity", type: "activityPreview", limit: 51 }],
      }),
      400,
      "invalid analysis widget limit",
    );
    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`, {
        widgets: [{ id: "activity", type: "activityDistribution", limit: 5 }],
      }),
      400,
      "invalid analysis widget limit",
    );
    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/analysis/query`, {
        widgets: [{ id: "families", type: "rootFamilyRanking", limit: 12 }],
      }),
      400,
      "root-family ranking does not accept a limit",
    );
  } finally {
    await repository.deleteDictionary(dictionary.id);
  }
}

async function checkTagSetAnalysisContract(repository) {
  const dictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-tag-set-analysis-contract",
    name: "Tag Set Analysis Contract",
    settings: {
      partOfSpeechTags: ["n", "v"],
      tagDisplayMap: { n: "Noun", topic: "Shared", alias: "Shared" },
      tagSortOrder: ["n", "topic", "alias", "extra"],
    },
    entries: [
      { id: "tag-set-a", lemma: "a", tags: ["n", "topic"] },
      { id: "tag-set-b", lemma: "b", tags: ["topic", "n"] },
      { id: "tag-set-c", lemma: "c", tags: ["n", "topic", "extra"] },
      { id: "tag-set-d", lemma: "d", tags: ["n", "alias"] },
      { id: "tag-set-e", lemma: "e", tags: ["v"] },
      { id: "tag-set-f", lemma: "f", tags: ["v", "extra"] },
    ],
  }));
  try {
    const response = await repository.queryAnalysis(dictionary.id, {
      widgets: [{ id: "sets", type: "tagSetDistribution" }],
    });
    assert.deepEqual(response.diagnostics.computedTasks, ["tagSetStats"]);
    const widget = response.widgets.sets;
    assert.equal(widget.type, "tagSetDistribution");
    assert.equal(widget.tagSetCount, 5);
    assert.equal(widget.taggedEntryCount, 6);
    assert.equal(widget.multiTagEntryCount, 5);
    assert.equal(widget.rows.length, 5);
    assert.ok(
      widget.rows.some((row) => row.tags.length === 1 && row.tags[0].value === "v"),
      "single-tag entries should form a tag set",
    );

    const topicSet = widget.rows.find((row) => (
      row.tags.map((tag) => tag.value).sort().join(",") === "n,topic"
    ));
    assert.equal(topicSet.entryCount, 2, "tag order should not change set identity");
    assert.deepEqual(topicSet.tags.map((tag) => tag.value), ["n", "topic"]);
    assert.equal(topicSet.tags[0].isPartOfSpeech, true);
    assert.equal(topicSet.tags[1].displayLabel, "Shared");
    assert.equal(topicSet.action.resultCount, 2);
    assert.deepEqual(topicSet.action.filter, {
      tags: { values: ["n", "topic"], mode: "exact" },
    });
    assert.ok(
      widget.rows.some((row) => row.tags.some((tag) => tag.value === "alias")),
      "raw tags with the same display label must remain distinct",
    );

    const allMatches = await repository.queryEntries(dictionary.id, {
      filter: { tags: { values: ["n", "topic"], mode: "all" } },
    });
    const exactMatches = await repository.queryEntries(dictionary.id, {
      filter: { tags: { values: ["topic", "n"], mode: "exact" } },
    });
    assert.equal(allMatches.pageInfo.total, 3);
    assert.equal(exactMatches.pageInfo.total, 2, "exact tag sets must exclude supersets");

    const allSingleTagMatches = await repository.queryEntries(dictionary.id, {
      filter: { tags: { values: ["v"], mode: "all" } },
    });
    const exactSingleTagMatches = await repository.queryEntries(dictionary.id, {
      filter: { tags: { values: ["v"], mode: "exact" } },
    });
    assert.equal(allSingleTagMatches.pageInfo.total, 2);
    assert.equal(exactSingleTagMatches.pageInfo.total, 1, "exact single-tag filters must exclude tagged supersets");

    const limited = await repository.queryAnalysis(dictionary.id, {
      widgets: [{ id: "sets", type: "tagSetDistribution", limit: 1 }],
      options: { includeActions: false },
    });
    assert.equal(limited.widgets.sets.tagSetCount, 5);
    assert.equal(limited.widgets.sets.taggedEntryCount, 6);
    assert.equal(limited.widgets.sets.rows.length, 1);
    assert.equal(limited.widgets.sets.rows[0].action, undefined);
  } finally {
    await repository.deleteDictionary(dictionary.id);
  }
}

async function checkEntryFilterFactsContract(repository) {
  const dictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-entry-filter-facts-contract",
    name: "Entry Filter Facts Contract",
    settings: {
      partOfSpeechTags: ["n", "v"],
    },
    entries: [
      {
        id: "entry-filter-facts-alpha",
        lemma: "alpha",
        pronunciation: "/a/",
        tags: ["n"],
        definitions: [{ id: "def-filter-facts-alpha", meaning: "mirror meaning" }],
      },
      {
        id: "entry-filter-facts-beta",
        lemma: "beta",
        tags: ["v"],
        definitions: [{ id: "def-filter-facts-beta", meaning: "second meaning" }],
      },
    ],
  }));
  let compiledFilterFacts = 0;
  const compileEntryFilter = repository.entryQueryWhereClauses.bind(repository);
  repository.entryQueryWhereClauses = (...args) => {
    compiledFilterFacts += 1;
    return compileEntryFilter(...args);
  };

  try {
    const result = await callApi(
      repository,
      "POST",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/filter-facts`,
      {
        filters: [
          { id: "has-ipa", filter: { presence: [{ field: "ipa", present: true }] } },
          { id: "no-sources", filter: { presence: [{ field: "source", present: false }] } },
          { id: "missing-tag", filter: { tags: { values: ["missing"], mode: "any" } } },
          { id: "duplicate-a", filter: { presence: [{ field: "ipa", present: true }] } },
          { id: "duplicate-b", filter: { presence: [{ field: "ipa", present: true }] } },
        ],
      },
    );
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.dictionaryId, dictionary.id);
    assert.equal(Number.isSafeInteger(result.body.generation), true);
    assert.deepEqual(result.body.facts, {
      "has-ipa": { available: true },
      "no-sources": { available: true },
      "missing-tag": { available: false },
      "duplicate-a": { available: true },
      "duplicate-b": { available: true },
    });
    assert.equal(compiledFilterFacts, 3, "normalized duplicate filter facts should compile and execute once");
    await callApi(
      repository,
      "POST",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/filter-facts`,
      { filters: [{ id: "cached", filter: { presence: [{ field: "ipa", present: true }] } }] },
    );
    assert.equal(compiledFilterFacts, 3, "filter facts should be reused within the current generation");

    const alpha = await repository.getEntry(dictionary.id, "entry-filter-facts-alpha");
    await repository.saveEntry(dictionary.id, { ...alpha, notes: "updated" });
    const refreshed = await callApi(
      repository,
      "POST",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/filter-facts`,
      { filters: [{ id: "has-ipa", filter: { presence: [{ field: "ipa", present: true }] } }] },
    );
    assert.equal(refreshed.body.generation, result.body.generation + 1);
    assert.equal(refreshed.body.facts["has-ipa"].available, true);
    assert.equal(compiledFilterFacts, 4, "filter facts should be rebuilt after a successful write");

    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/filter-facts`, {
        filters: [
          { id: "duplicate", filter: {} },
          { id: "duplicate", filter: { part: "n" } },
        ],
      }),
      400,
      "duplicate entry filter fact id",
    );
    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/filter-facts`, {
        filters: [{ id: "paged", filter: {}, limit: 1 }],
      }),
      400,
      "entry filter facts paging rejection",
    );
    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/filter-facts`, {
        filters: [{ id: "searched", filter: {}, search: { text: "alpha" } }],
      }),
      400,
      "entry filter facts search rejection",
    );
  } finally {
    repository.entryQueryWhereClauses = compileEntryFilter;
    await repository.deleteDictionary(dictionary.id);
  }
}

function testNormalize(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function testDisplayTag(tag, dictionary = {}) {
  const value = String(tag || "");
  return dictionary.settings?.tagDisplayMap?.[value] || value;
}

function testEntryParts(entry = {}, dictionary = {}) {
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  if (!tags.length) {
    return [];
  }
  const settings = dictionary.settings || {};
  const configuredParts = new Set((settings.partOfSpeechTags || []).map(testNormalize));
  if (!configuredParts.size) {
    return [];
  }
  return tags.filter((tag) => configuredParts.has(testNormalize(tag)));
}

function testEntryMatches(entry, dictionary, query = {}) {
  const parts = testEntryParts(entry, dictionary);
  const matchesPart = !query.part
    || (query.part === NO_PART_FILTER_VALUE
      ? !parts.length
      : parts.includes(query.part));
  if (!matchesPart) {
    return false;
  }
  const searchRuntime = entrySearchModel.searchSettingsQueryOptions(dictionary.settings?.search);
  const normalizedQuery = searchRuntime.normalizeText(query.q);
  if (!normalizedQuery) {
    return true;
  }
  return entrySearchModel.entryMatchesSearchText(entry, dictionary, query.q || query.query || "", {
    fields: entrySearchModel.normalizeSearchFields(query.fields || query.searchFields),
    fuzzyFields: entrySearchModel.normalizeFuzzyFields(query.fuzzyFields),
    normalizeText: searchRuntime.normalizeText,
  });
}

function testCompareEntries(sort = "lemmaAsc") {
  return (a, b) => {
    const lemmaCompare = String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
    const idCompare = String(a.id || "").localeCompare(String(b.id || ""));
    const dateCompare = (left, right, direction = 1) => {
      const diff = new Date(left || 0).getTime() - new Date(right || 0).getTime();
      return (diff * direction) || (lemmaCompare * direction) || idCompare;
    };
    if (sort === "lemmaDesc") {
      return -lemmaCompare || idCompare;
    }
    if (sort === "updatedAsc") {
      return dateCompare(a.updatedAt, b.updatedAt);
    }
    if (sort === "updatedDesc") {
      return dateCompare(a.updatedAt, b.updatedAt, -1);
    }
    if (sort === "createdAsc") {
      return dateCompare(a.createdAt, b.createdAt);
    }
    if (sort === "createdDesc") {
      return dateCompare(a.createdAt, b.createdAt, -1);
    }
    return lemmaCompare || idCompare;
  };
}

function expectedEntryIds(dictionary, query = {}) {
  return [...(dictionary.entries || [])]
    .filter((entry) => testEntryMatches(entry, dictionary, query))
    .sort(testCompareEntries(query.sort || "lemmaAsc"))
    .map((entry) => entry.id);
}

function expectedParts(dictionary) {
  return [...new Set((dictionary.entries || []).flatMap((entry) => testEntryParts(entry, dictionary)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

async function apiEntryIds(repository, dictionaryId, params = {}) {
  const qs = queryString({ ...params, limit: 100 });
  const apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries?${qs}`);
  assert.equal(apiResult.statusCode, 200);
  assert.equal(apiResult.body.pageInfo.hasMore, false);
  return apiResult.body.items.map((entry) => entry.id);
}

async function assertEntryQueryConsistency(repository, dictionary, params = {}) {
  assert.deepEqual(
    await apiEntryIds(repository, dictionary.id, params),
    expectedEntryIds(dictionary, params),
    `entry query consistency: ${JSON.stringify(params)}`,
  );
}

async function assertStructuredEntryFilter(repository, dictionaryId, filter, expectedIds, params = {}) {
  assert.deepEqual(
    await apiEntryIds(repository, dictionaryId, {
      ...params,
      filter: JSON.stringify(filter),
    }),
    expectedIds,
    `structured entry filter: ${JSON.stringify(filter)}`,
  );
}

function expectedRootGroupSnapshot(dictionary, query = {}) {
  const searchRuntime = entrySearchModel.searchSettingsQueryOptions(dictionary.settings?.search);
  const normalizedQuery = searchRuntime.normalizeText(query.q || query.query);
  return entryRelationsModel.rootModeGroups(dictionary, {
    query: normalizedQuery,
    normalizeText: testNormalize,
    compareEntries: testCompareEntries(query.sort || "lemmaAsc"),
    matchesEntry: (entry) => entrySearchModel.entryMatchesSearchText(entry, dictionary, query.q || query.query || "", {
      fields: entrySearchModel.normalizeSearchFields(query.fields || query.searchFields),
      fuzzyFields: entrySearchModel.normalizeFuzzyFields(query.fuzzyFields),
      normalizeText: searchRuntime.normalizeText,
    }),
  }).map((group) => ({
    rootId: group.root.id,
    derivedIds: group.derived.map((entry) => entry.id),
    matchedDerivedIds: group.matchedDerived.map((entry) => entry.id),
    rootMatches: Boolean(group.rootMatches),
  }));
}

async function assertRootGroupQueryConsistency(repository, dictionary, params = {}) {
  const qs = queryString({ ...params, limit: 100 });
  const apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups?${qs}`);
  assert.equal(apiResult.statusCode, 200);
  assert.equal(apiResult.body.pageInfo.hasMore, false);
  assert.equal(
    apiResult.body.pageInfo.windowMetrics.reduce((total, metric) => total + metric.groupCount, 0),
    apiResult.body.pageInfo.total,
  );
  const actualGroups = [];
  for (const group of apiResult.body.items) {
    const entriesQs = queryString(params);
    const entriesResult = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups/${encodeURIComponent(group.root.id)}/entries?${entriesQs}`,
    );
    assert.equal(entriesResult.statusCode, 200);
    actualGroups.push({
      rootId: group.root.id,
      derivedIds: entriesResult.body.items.map((entry) => entry.id),
      matchedDerivedIds: entriesResult.body.items.filter((entry) => entry.rootGroupMatch).map((entry) => entry.id),
      rootMatches: Boolean(group.rootMatches),
    });
    assert.equal(group.derivedCount, entriesResult.body.items.length);
  }
  assert.deepEqual(
    actualGroups,
    expectedRootGroupSnapshot(dictionary, params),
    `root group query consistency: ${JSON.stringify(params)}`,
  );
}

function checkModelNormalization() {
  assert.deepEqual(tagModel.parseTagListText("n，v、n,adj"), ["n", "v", "adj"]);
  assert.deepEqual(tagModel.normalizeTagList([null, undefined, "", "  ", "null", " proper noun ", "null"]), ["null", "proper noun"]);
  assert.deepEqual(tagModel.normalizeTagList("n,v"), []);
  assert.equal(tagModel.serializeTagList(["n", "v"], "commaSpace"), "n, v");
  assert.equal(tagModel.serializeTagList(["n", "v"], "fullwidthComma"), "n，v");
  assert.equal(tagModel.serializeTagList(["n", "v"], "ideographicComma"), "n、v");
  assert.equal(tagModel.normalizeTagListSeparatorStyle("unknown"), "commaSpace");
  assert.equal(tagModel.normalizeEntryListTagDisplayLimit(99), 10);
  const normalizedTagLists = normalizeDictionary({
    entries: [{ lemma: "entry", tags: [" n ", null, "n", "null"] }],
    settings: {
      partOfSpeechTags: [" n ", "n"],
      redHighlightTags: ["proper noun", "proper noun"],
      tagListSeparatorStyle: "ideographicComma",
    },
    corpus: {
      blocks: [{ title: "block", tags: [" corpus ", "corpus"] }],
    },
    morphology: {
      templateGroups: [{ name: "group", matchTags: [" n ", "n"], tables: [] }],
    },
  });
  assert.deepEqual(normalizedTagLists.entries[0].tags, ["n", "null"]);
  assert.deepEqual(normalizedTagLists.settings.partOfSpeechTags, ["n"]);
  assert.deepEqual(normalizedTagLists.settings.redHighlightTags, ["proper noun"]);
  assert.equal(normalizedTagLists.settings.tagListSeparatorStyle, "ideographicComma");
  assert.deepEqual(normalizedTagLists.corpus.blocks[0].tags, ["corpus"]);
  assert.deepEqual(normalizedTagLists.morphology.templateGroups[0].matchTags, ["n"]);
  assert.deepEqual(
    tagModel.entryParts(
      { tags: ["topic", "n", "v"] },
      { partOfSpeechTags: ["n", "v"] },
    ),
    ["n", "v"],
  );
  assert.deepEqual(tagModel.entryParts({ tags: ["topic", "n"] }, { partOfSpeechTags: [] }), []);
  assert.equal(tagModel.displayTag("n", { tagDisplayMap: { n: "noun" } }), "noun");
  assert.deepEqual([...entrySearchModel.normalizeSearchFields("lemma,unknown,tags")], ["lemma", "tags"]);
  assert.deepEqual([...entrySearchModel.normalizeFuzzyFields("")], []);
  assert.deepEqual([...entrySearchModel.normalizeFuzzyFields("definitions,tags,unknown")], ["definitions", "tags"]);
  assert.deepEqual(entrySearchModel.normalizeEntrySearchSettings({
    fields: { lemma: { enabled: false, fuzzy: false } },
    etymologyAutocomplete: { fuzzy: false },
  }), {
    fields: {
      lemma: { enabled: false, fuzzy: false },
      pronunciation: { enabled: true, fuzzy: true },
      tags: { enabled: true, fuzzy: true },
      definitions: { enabled: true, fuzzy: true },
      examples: { enabled: true, fuzzy: true },
      notes: { enabled: true, fuzzy: true },
      etymology: { enabled: true, fuzzy: true },
      morphology: { enabled: true, fuzzy: true },
    },
    etymologyAutocomplete: { fuzzy: false },
    normalization: {
      unicodeNormalization: "none",
      caseFolding: false,
      customRules: [],
    },
  });
  assert.equal(entrySearchModel.searchSettingsHaveEnabledField({
    fields: Object.fromEntries(entrySearchModel.ENTRY_SEARCH_FIELD_KEYS.map((field) => [field, { enabled: false }])),
  }), false);
  const configuredSearchOptions = entrySearchModel.searchSettingsQueryOptions({
    fields: {
      lemma: { enabled: true, fuzzy: false },
      definitions: { enabled: true, fuzzy: true },
      morphology: { enabled: false, fuzzy: true },
    },
  });
  assert.deepEqual([...configuredSearchOptions.fields], [
    "lemma",
    "pronunciation",
    "tags",
    "definitions",
    "examples",
    "notes",
    "etymology",
  ]);
  assert.deepEqual([...configuredSearchOptions.fuzzyFields], [
    "pronunciation",
    "tags",
    "definitions",
    "examples",
    "notes",
    "etymology",
  ]);
  assert.throws(
    () => entrySearchModel.textMatches("mirror meaning", "mrmeaning", { fuzzy: true }),
    /Search normalizeText option is required/,
  );
  assert.throws(
    () => entrySearchModel.fuzzyScore("mirror meaning", "mrmeaning"),
    /Search normalizeText option is required/,
  );
  assert.throws(
    () => entrySearchModel.entryMatchesSearchText({ lemma: "mirror" }, {}, "mirror"),
    /Search normalizeText option is required/,
  );
  assert.equal(entrySearchModel.textMatches("mirror meaning", "mrmeaning", {
    fuzzy: true,
    normalizeText: testNormalize,
  }), true);
  assert.equal(entrySearchModel.textMatches("mirror meaning", "mrmeaning", {
    fuzzy: false,
    normalizeText: testNormalize,
  }), false);
  assert.equal(entrySearchModel.fieldFuzzyEnabled("tags", { fuzzyFields: "tags" }), true);
  assert.equal(entrySearchModel.fieldFuzzyEnabled("tags", { fuzzyFields: "definitions" }), false);
  const relationDictionary = {
    entries: [
      { id: "entry-root", lemma: "root" },
      { id: "entry-derived-lemma", lemma: "derived lemma", etymology: { sources: ["root", "root"] } },
      { id: "entry-derived-id", lemma: "derived id", etymology: { sources: ["entry-root"] } },
      { id: "entry-derived-unresolved", lemma: "derived unresolved", etymology: { sources: ["missing-root"] } },
    ],
  };
  const relationIndex = entryRelationsModel.buildEntryRelationIndex(relationDictionary, { normalizeText: testNormalize });
  assert.equal(relationIndex.derivedBySourceKey.get("root").length, 1);
  assert.deepEqual(
    entryRelationsModel.findDerivedEntries(relationDictionary.entries[0], relationDictionary, { index: relationIndex }).map((entry) => entry.id),
    ["entry-derived-id", "entry-derived-lemma"],
  );
  assert.equal(entryRelationsModel.rootCount(relationDictionary, { index: relationIndex }), 1);
  assert.equal(
    entrySearchModel.entryMatchesSearchText(
      { lemma: "acar", definitions: [{ meaning: "root" }] },
      {},
      "root",
      { fields: "definitions", normalizeText: testNormalize },
    ),
    true,
  );
  assert.equal(
    entrySearchModel.entryMatchesSearchText(
      { lemma: "acar", tags: ["n"], definitions: [{ meaning: "mirror meaning" }] },
      { settings: { tagDisplayMap: { n: "Noun Display" } } },
      "mrmeaning",
      { fuzzyFields: "definitions", normalizeText: testNormalize },
    ),
    true,
  );
  assert.equal(
    entrySearchModel.entryMatchesSearchText(
      { lemma: "acar", tags: ["n"], definitions: [{ meaning: "mirror meaning" }] },
      { settings: { tagDisplayMap: { n: "Noun Display" } } },
      "nd",
      { fuzzyFields: "definitions", normalizeText: testNormalize },
    ),
    false,
  );
  assert.deepEqual(qualityModel.parseGloss("\\gla a b\n\\glb A B\n\\ft test"), {
    gla: ["a", "b"],
    glb: ["A", "B"],
    glc: [],
    ft: "test",
  });
  const qualityReport = qualityModel.buildQualityReport({
    entries: [
      {
        id: "entry-quality-a",
        lemma: "same",
        pronunciation: "/ˈaˈb/",
        tags: ["proper noun", "tag-with-a-very-very-long-name"],
        definitions: [{ meaning: "a", example: "\\gla a b\n\\glb A\n\\ft test" }],
        etymology: { sources: ["missing-root"] },
      },
      {
        id: "entry-quality-b",
        lemma: "same",
        pronunciation: "",
        tags: ["proper-noun"],
        definitions: [],
      },
    ],
  }, { text: (_zh, en) => en, normalizeText: testNormalize });
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Duplicate lemma" && issue.entryId === "entry-quality-a"), true);
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Multiple primary stresses"), true);
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Gloss alignment mismatch"), true);
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Near-duplicate tags"), true);
  assert.equal(qualityReport.networkIssues.some((issue) => issue.title === "Unresolved source"), true);
  assert.equal(ipaModel.normalizeIpaSettings({ mappings: [{ from: "a", to: "ˈa" }] }).mappings[0].to, "ˈa");
  assert.deepEqual(ipaModel.normalizeClusterList("t͡ʃ, t, t͡ʃ"), ["t͡ʃ", "t"]);
  assert.equal(
    ipaModel.generateIpaFromLemma("ata", {
      mappings: [
        { from: "a", to: "a" },
        { from: "t", to: "t" },
      ],
      syllable: { vowels: "a", separator: ".", onsetClusters: "t" },
      defaultStress: -2,
      unstressMonosyllables: true,
    }),
    "/ˈa.ta/",
  );
  assert.equal(
    ipaModel.generateIpaFromLemma("a", {
      mappings: [{ from: "a", to: "a" }],
      syllable: { vowels: "a", separator: "." },
      defaultStress: -1,
      unstressMonosyllables: true,
    }),
    "/a/",
  );
  assert.deepEqual(
    ipaModel.tokenizePhonemeUnits("t͡ʃa", ["t͡ʃ"]).map((token) => token.value),
    ["t͡ʃ", "a"],
  );
  assert.deepEqual(
    morphologyModel.extractMorphologyReferences("{lemma}-{a=o}"),
    [
      { body: "lemma", unterminated: false },
      { body: "a=o", unterminated: false },
    ],
  );
  assert.equal(
    morphologyModel.morphologyCellDefaultValue(
      { lemma: "root" },
      { rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "" } } },
      0,
      0,
      {},
    ),
    "",
  );
  assert.deepEqual(
    morphologyModel.extractMorphologyFunctionCalls("/rightV(a)(x)=x;else=y/").map((call) => ({
      name: call.name,
      invalidOffset: call.invalidOffset,
    })),
    [{ name: "rightV", invalidOffset: true }],
  );
  assert.deepEqual(
    morphologyModel.validateMorphologyReferenceSyntax({
      templateGroups: [{ name: "Bad", tables: [{ title: "Bad", rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "{a}" } } }] }],
    }),
    ["Bad: 1 / 1: {a} - missing ="],
  );
  assert.deepEqual(
    morphologyModel.validateMorphologyFunctionUsage({
      functions: { leftV: "a" },
      templateGroups: [{ name: "BadFn", tables: [{ title: "BadFn", rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "/rightV(a)=x/" } } }] }],
    }),
    ["BadFn: rightV not configured"],
  );
  const automaticMorphologyDictionary = {
    morphology: {
      templateGroups: [{
        id: "morph-auto",
        name: "Auto group",
        matchTags: ["n"],
        tables: [{
          id: "mtable-auto",
          title: "Auto table",
          rowCount: 1,
          columnCount: 1,
          cells: { "0,0": { sourceText: "{lemma}-generated" } },
        }],
      }],
    },
  };
  assert.deepEqual(
    morphologyModel.morphologySearchStrings({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "auto",
      morphologyGroups: [{ templateGroupId: "morph-auto", overrides: { "mtable-auto": { "0,0": "roots" } } }],
    }, automaticMorphologyDictionary),
    ["roots"],
  );
  assert.deepEqual(
    morphologyModel.morphologySearchStrings({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "manual",
      morphologyGroups: [],
    }, automaticMorphologyDictionary),
    [],
  );

  const canonicalMorphologyDictionary = {
    morphology: {
      templateGroups: [
        automaticMorphologyDictionary.morphology.templateGroups[0],
        {
          id: "morph-manual",
          name: "Manual group",
          matchTags: ["v"],
          tables: [{
            id: "mtable-manual",
            title: "Manual table",
            rowCount: 1,
            columnCount: 1,
            cells: { "0,0": { sourceText: "{lemma}-manual" } },
          }],
        },
      ],
    },
  };
  const autoOverlayEntry = {
    lemma: "root",
    tags: ["n"],
    morphologyMode: "auto",
    morphologyGroups: [{
      templateGroupId: "morph-auto",
      title: "Irregular auto group",
      notes: "Entry-specific note",
      overrides: { "mtable-auto": { "0,0": "roots" } },
    }],
  };
  const autoOverlayResolution = morphologyModel.resolveCanonicalEntryMorphologyGroups(
    autoOverlayEntry,
    canonicalMorphologyDictionary,
  );
  assert.equal(autoOverlayResolution.length, 1);
  assert.equal(autoOverlayResolution[0].templateGroup.id, "morph-auto");
  assert.equal(autoOverlayResolution[0].entryGroup.title, "Irregular auto group");
  assert.equal(
    morphologyModel.morphologyCellValue(
      autoOverlayEntry,
      autoOverlayResolution[0].entryGroup,
      autoOverlayResolution[0].templateGroup.tables[0],
      0,
      0,
      canonicalMorphologyDictionary,
    ),
    "roots",
  );
  assert.deepEqual(
    morphologyModel.materializeAutomaticMorphologyGroups({
      ...autoOverlayEntry,
      morphologyGroups: [
        ...autoOverlayEntry.morphologyGroups,
        { templateGroupId: "morph-manual", notes: "keep dormant", overrides: {} },
      ],
    }, canonicalMorphologyDictionary).map((group) => group.templateGroupId),
    ["morph-auto", "morph-manual"],
  );
  assert.deepEqual(
    morphologyModel.resolveCanonicalEntryMorphologyGroups({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "manual",
      morphologyGroups: [{ templateGroupId: "morph-manual" }],
    }, canonicalMorphologyDictionary).map(({ templateGroup }) => templateGroup.id),
    ["morph-manual"],
  );
  assert.deepEqual(
    morphologyModel.resolveCanonicalEntryMorphologyGroups({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "manual",
      morphologyGroups: [],
    }, canonicalMorphologyDictionary),
    [],
  );
  assert.deepEqual(
    morphologyModel.normalizeEntryMorphologyState({
      morphologyMode: "auto",
      morphologyGroups: [
        { templateGroupId: "morph-auto" },
        { templateGroupId: "morph-manual", notes: "keep" },
      ],
    }).morphologyGroups.map((group) => group.templateGroupId),
    ["morph-manual"],
  );
  assert.deepEqual(
    morphologyModel.validateCanonicalEntryMorphology({
      morphologyMode: "auto",
      morphologyGroups: [{
        templateGroupId: "morph-auto",
        overrides: { "mtable-auto": { "1,0": "out of range" } },
      }],
    }, canonicalMorphologyDictionary),
    ["invalid morphology override cell: mtable-auto:1,0"],
  );
  assert.deepEqual(
    morphologyModel.validateCanonicalEntryMorphology({
      morphologyMode: "manual",
      morphologyGroups: [{ templateGroupId: "auto" }],
    }, canonicalMorphologyDictionary),
    ["invalid morphology template group: auto"],
  );
  assert.deepEqual(
    morphologyModel.validateCanonicalEntryMorphology({
      morphologyMode: "manual",
      morphologyGroups: [
        { templateGroupId: "morph-manual" },
        { templateGroupId: "morph-manual", notes: "duplicate" },
      ],
    }, canonicalMorphologyDictionary),
    ["duplicate entry morphology group: morph-manual"],
  );
  const migratedLegacyMorphology = migrateLegacyDictionary({
    morphology: canonicalMorphologyDictionary.morphology,
    entries: [
      {
        id: "legacy-auto",
        lemma: "root",
        tags: ["n"],
        morphology: { tableId: "auto", overrides: { "0,0": "roots" } },
      },
      {
        id: "legacy-manual",
        lemma: "root",
        tags: ["n"],
        morphology: { id: "emorph-legacy", tableId: "morph-manual", overrides: { "0,0": "root-manual" } },
      },
      {
        id: "legacy-none",
        lemma: "root",
        tags: ["n"],
        morphology: { tableId: "none" },
      },
    ],
  }).dictionary.entries;
  assert.deepEqual(
    migratedLegacyMorphology.map((entry) => entry.morphologyMode),
    ["auto", "manual", "manual"],
  );
  assert.deepEqual(
    migratedLegacyMorphology[0].morphologyGroups[0].overrides,
    { "mtable-auto": { "0,0": "roots" } },
  );
  assert.deepEqual(
    migratedLegacyMorphology[1].morphologyGroups[0].overrides,
    { "mtable-manual": { "0,0": "root-manual" } },
  );
  assert.equal(Object.hasOwn(migratedLegacyMorphology[1].morphologyGroups[0], "id"), false);
  assert.equal(Object.hasOwn(migratedLegacyMorphology[0], "morphology"), false);

  const normalized = normalizeDictionary({
    name: "Current",
    entries: [
      {
        lemma: "acar",
        tags: ["n"],
        definitions: [{ meaning: "root" }],
        etymology: { sources: ["entry-source"], description: "source note" },
      },
    ],
    settings: {
      entryListTagDisplayLimit: 99,
      entryListPartDisplay: "chips",
      entrySectionOrder: ["notes", "derived", "notes", "unknown"],
      ipa: { mappings: [{ from: "a", to: "ˈa" }] },
    },
  });

  assert.match(normalized.id, /^dict-/);
  assert.equal(normalized.entries[0].tags[0], "n");
  assert.equal(normalized.entries[0].definitions[0].meaning, "root");
  assert.deepEqual(normalized.entries[0].etymology.sources, ["entry-source"]);
  assert.equal(normalized.entries[0].etymology.description, "source note");
  assert.equal(normalized.settings.entryListTagDisplayLimit, 10);
  assert.equal(normalized.settings.entryListPartDisplay, "chips");
  assert.equal(normalized.settings.showEmptyEntrySections, false);
  assert.deepEqual(normalized.settings.entrySectionOrder, ["notes", "derived", "definitions", "etymology", "morphology"]);
  assert.equal(normalized.settings.ipa.mappings[0].to, "ˈa");

  const normalizedWithoutDefinitions = normalizeDictionary({
    name: "Definitionless",
    entries: [{ lemma: "empty", definitions: [] }],
  });
  assert.deepEqual(normalizedWithoutDefinitions.entries[0].definitions, []);

  const imported = importDictionaryFromPayload({
    activeDictionaryId: "dict-11111111-1111-4111-8111-111111111111",
    dictionaries: [
      {
        id: "dict-11111111-1111-4111-8111-111111111111",
        name: "Imported",
        entries: [{ lemma: "item", definitions: [{ meaning: "ok" }] }],
      },
    ],
  });
  assert.equal(imported.id, "dict-11111111-1111-4111-8111-111111111111");
  assert.equal(imported.entries[0].lemma, "item");

  const conversionService = createDictionaryConversionService();
  const legacyConvertedImport = conversionService.importDictionaryFromJsonPayload({
    name: "Legacy",
    entries: [
      {
        lemma: "legacy",
        partOfSpeech: "n",
        meaning: "root",
        roots: "old source",
        etymology: { sourceEntryId: "entry-source" },
      },
      {
        lemma: "legacy-note",
        definitions: [{ meaning: "note", notes: "legacy definition note" }],
      },
    ],
    settings: {
      ipa: { stressMappings: [{ id: "ipa-legacy", from: "a", to: "a" }] },
      toolNavOrder: ["editor", "morphology", "settings"],
      glossFontFamily: "sans",
      corpusGlossAlign: false,
      savePartialEditOnSwitch: true,
      fuzzySearch: false,
      tagFuzzySearch: false,
      sourceFuzzyCompletion: false,
    },
  });
  assert.equal(legacyConvertedImport.dictionary.entries[0].tags[0], "n");
  assert.equal(legacyConvertedImport.dictionary.entries[0].definitions[0].meaning, "root");
  assert.equal(legacyConvertedImport.dictionary.entries[0].etymology.description, "old source");
  assert.deepEqual(legacyConvertedImport.dictionary.entries[0].etymology.sources, ["entry-source"]);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0], "partOfSpeech"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0], "meaning"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0], "roots"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0].etymology, "sourceEntryId"), false);
  assert.equal(legacyConvertedImport.dictionary.settings.ipa.mappings[0].to, "ˈa");
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings.ipa.mappings[0], "id"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings.ipa, "stressMappings"), false);
  assert.equal(legacyConvertedImport.dictionary.settings.glossStyles.gla.fontFamily, "sans");
  assert.equal(legacyConvertedImport.dictionary.settings.corpusUnitCardGlossAlign, false);
  assert.equal(legacyConvertedImport.dictionary.settings.partialEditPageSwitchAction, "save");
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "glossFontFamily"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "corpusGlossAlign"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "savePartialEditOnSwitch"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "fuzzySearch"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "tagFuzzySearch"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "sourceFuzzyCompletion"), false);
  assert.equal(legacyConvertedImport.dictionary.settings.search.fields.lemma.enabled, true);

  const migratedIpaRuleIds = migrateLegacyDictionary({
    settings: { ipa: { mappings: [{ id: "ipa-old", from: "b", to: "p" }] } },
  }).dictionary.settings.ipa.mappings;
  assert.deepEqual(migratedIpaRuleIds, [{ from: "b", to: "p" }]);

  const obsoleteChildIds = migrateLegacyDictionary({
    id: "dict-obsolete-child-ids",
    morphology: canonicalMorphologyDictionary.morphology,
    entries: [{
      id: "shared-obsolete-id",
      lemma: "legacy",
      morphologyMode: "manual",
      morphologyGroups: [{ id: "shared-obsolete-id", templateGroupId: "morph-manual" }],
    }],
    settings: { ipa: { mappings: [{ id: "shared-obsolete-id", from: "a", to: "b" }] } },
  }).dictionary;
  assert.equal(Object.hasOwn(obsoleteChildIds.entries[0].morphologyGroups[0], "id"), false);
  assert.equal(Object.hasOwn(obsoleteChildIds.settings.ipa.mappings[0], "id"), false);
  assert.doesNotThrow(() => assertUniqueDictionaryEntityIds(normalizeDictionary(obsoleteChildIds)));
  assert.equal(legacyConvertedImport.dictionary.settings.search.fields.lemma.fuzzy, true);
  assert.equal(legacyConvertedImport.dictionary.settings.search.etymologyAutocomplete.fuzzy, true);
  assert.equal(legacyConvertedImport.dictionary.entries[1].definitions[0].note, "legacy definition note");
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[1].definitions[0], "notes"), false);
  assert.deepEqual(legacyConvertedImport.dictionary.settings.toolNavOrder, [
    "editor",
    "morphology-functions",
    "morphology-tables",
    "settings",
  ]);
  assert.ok(legacyConvertedImport.report.repairs.length);

  const convertedImport = conversionService.importDictionaryFromJsonPayload({
    id: "dict-22222222-2222-4222-8222-222222222222",
    name: "Converted",
    entries: [{ lemma: "converted", definitions: [{ meaning: "ok" }] }],
  });
  assert.equal(convertedImport.dictionary.id, "dict-22222222-2222-4222-8222-222222222222");
  assert.equal(convertedImport.report.sourceProfile, "legacy-json");
  const convertedExport = conversionService.exportDictionarySnapshot(convertedImport.dictionary, {
    format: "json",
    profile: "portable-json",
  });
  assert.equal(convertedExport.format, "json");
  assert.equal(convertedExport.profile, "portable-json");
  assert.equal(convertedExport.extension, "json");
  assert.equal(convertedExport.payload.id, convertedImport.dictionary.id);

  assert.throws(
    () => importDictionaryFromPayload({ unrelated: true }),
    (error) => error.status === 400,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-id", lemma: "a" }],
        corpus: { units: [{ id: "shared-id", content: "x" }] },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [
          { id: "shared-entry-id", lemma: "a" },
          { id: "shared-entry-id", lemma: "b" },
        ],
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-cross-type-id", lemma: "a" }],
        settings: { ipa: { mappings: [{ from: "a", to: "b" }] } },
        morphology: { templateGroups: [{ id: "shared-cross-type-id", name: "A", tables: [] }] },
        corpus: { units: [{ id: "shared-cross-type-id", content: "x" }] },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [
          {
            id: "entry-one",
            lemma: "a",
            definitions: [{ id: "shared-definition-id", meaning: "a" }],
          },
          {
            id: "entry-two",
            lemma: "b",
            definitions: [{ id: "shared-definition-id", meaning: "b" }],
          },
        ],
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-config-id", lemma: "a" }],
        morphology: { templateGroups: [{ id: "shared-config-id", name: "A", tables: [] }] },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  withPatchedRandomUUID(["collision", "fresh"], () => {
    const normalized = normalizeDictionary({
      id: "dict-static",
      entries: [
        {
          id: "def-collision",
          lemma: "a",
          definitions: [{ meaning: "a" }],
        },
      ],
    });
    assert.equal(normalized.entries[0].definitions[0].id, "def-fresh");
  });

  withPatchedRandomUUID(["collision", "fresh"], () => {
    const normalized = normalizeDictionary({
      id: "dict-static",
      entries: [{ id: "morph-collision", lemma: "a" }],
      morphology: { templateGroups: [{ name: "A", tables: [] }] },
    });
    assert.equal(normalized.morphology.templateGroups[0].id, "morph-fresh");
  });

  const textOnlyIpa = normalizeDictionary({
    id: "dict-static",
    settings: { ipa: { mappings: [{ from: "a", to: "b" }] } },
  });
  assert.deepEqual(textOnlyIpa.settings.ipa.mappings, [{ from: "a", to: "b", before: "", after: "" }]);
}

async function checkReadApiConsistency(repository) {
  const previousState = await repository.readState();
  const dictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-read-api-consistency",
    name: "Read API Consistency",
    settings: {
      partOfSpeechTags: ["n", "v", "adj"],
      tagDisplayMap: {
        n: "Noun Display",
        v: "Verb Display",
        motion: "Motion Display",
      },
    },
    morphology: {
      functions: { leftV: "a,e,i,o,u", rightV: "a,e,i,o,u" },
      templateGroups: [
        {
          id: "morph-n-group",
          name: "N table",
          matchTags: ["n"],
          tables: [{
            id: "mtable-n-main",
            title: "N table",
            rowCount: 1,
            columnCount: 2,
            cells: {
              "0,0": { sourceText: "{lemma}-generated" },
              "0,1": { sourceText: "{a=o}" },
            },
          }],
        },
      ],
    },
    entries: [
      {
        id: "entry-alpha",
        lemma: "alpha",
        pronunciation: "/alpha/",
        tags: ["n", "motion"],
        definitions: [{ id: "def-alpha", meaning: "mirror meaning", example: "alpha example", note: "alpha note" }],
        etymology: { sources: ["root"], description: "source note" },
        notes: "entry note",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "entry-beta",
        lemma: "beta",
        pronunciation: "/beta/",
        tags: ["v", "n", "derived"],
        definitions: [{ id: "def-beta", meaning: "movement" }],
        etymology: { sources: ["alpha", "root"], description: "" },
        morphologyGroups: [{
          templateGroupId: "morph-n-group",
          overrides: { "mtable-n-main": { "0,0": "manual-beta-form" } },
        }],
        createdAt: "2026-01-02T23:59:59.999Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "entry-gamma",
        lemma: "gamma",
        pronunciation: "/gamma/",
        tags: ["topic"],
        definitions: [{ id: "def-gamma", meaning: "topic only" }],
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "entry-delta",
        lemma: "delta",
        pronunciation: "",
        tags: [],
        definitions: [{ id: "def-delta", meaning: "untagged" }],
        createdAt: "2026-01-04T00:00:00.000Z",
        updatedAt: "2026-01-04T00:00:00.000Z",
      },
      {
        id: "entry-same-a",
        lemma: "same",
        tags: ["adj"],
        definitions: [{ id: "def-same-a", meaning: "first same lemma" }],
        createdAt: "2026-01-05T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
      },
      {
        id: "entry-same-b",
        lemma: "same",
        tags: ["adj"],
        definitions: [{ id: "def-same-b", meaning: "second same lemma" }],
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z",
      },
      {
        id: "entry-empty",
        lemma: "empty",
        pronunciation: "",
        tags: [],
        definitions: [],
        createdAt: "2026-01-07T00:00:00.000Z",
        updatedAt: "2026-01-07T00:00:00.000Z",
      },
    ],
  }));

  try {
    await assertEntryQueryConsistency(repository, dictionary, {});
    await assertEntryQueryConsistency(repository, dictionary, { q: "mirror" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "Noun Display" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "source note" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "/beta/" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "manual-beta-form" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "olpha" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "mrmeaning", fuzzyFields: "definitions" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "nd", fuzzyFields: "tags" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "mrmeaning", fuzzyFields: "tags" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated", fields: "morphology" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated", fields: "definitions" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha example", fields: "examples" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha example", fields: "notes" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "n" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "v" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "adj" });
    await assertEntryQueryConsistency(repository, dictionary, { part: NO_PART_FILTER_VALUE });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "lemmaDesc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "updatedAsc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "updatedDesc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "createdAsc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "createdDesc" });
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { presence: { definition: false } },
      ["entry-empty"],
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { presence: { example: true } },
      ["entry-alpha"],
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { presence: { entryNote: true } },
      ["entry-alpha"],
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { presence: { source: true } },
      ["entry-alpha", "entry-beta"],
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { presence: { ipa: false } },
      ["entry-delta", "entry-empty", "entry-same-a", "entry-same-b"],
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { sourceCount: { min: 2, max: 2 } },
      ["entry-beta"],
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { activityDay: { field: "created", day: "2026-01-02" } },
      ["entry-beta"],
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      { presence: { source: true } },
      ["entry-beta"],
      { q: "movement", fields: "definitions" },
    );
    await assertStructuredEntryFilter(
      repository,
      dictionary.id,
      {
        tags: { values: ["n"], mode: "all" },
        presence: { source: true },
      },
      ["entry-alpha", "entry-beta"],
    );
    await assertRootGroupQueryConsistency(repository, dictionary, {});
    await assertRootGroupQueryConsistency(repository, dictionary, { q: "movement" });
    await assertRootGroupQueryConsistency(repository, dictionary, { q: "manual-beta-form" });
    await assertRootGroupQueryConsistency(repository, dictionary, { q: "mrmeaning", fuzzyFields: "definitions" });
    await assertRootGroupQueryConsistency(repository, dictionary, { sort: "lemmaDesc" });

    let apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/facets`);
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(apiResult.body.parts.map((part) => part.tag), expectedParts(dictionary));
    assert.equal(apiResult.body.parts.find((part) => part.tag === "n")?.displayLabel, "Noun Display");
    assert.equal(apiResult.body.noPartOfSpeechCount, 3);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries?sort=lemmaAsc&limit=3`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 3);
    assert.equal(apiResult.body.pageInfo.hasMore, true);
    assert.ok(apiResult.body.pageInfo.nextCursor);
    assert.ok(apiResult.body.pageInfo.windowCursor);
    const nextPage = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries?sort=lemmaAsc&limit=100&cursor=${encodeURIComponent(apiResult.body.pageInfo.nextCursor)}`,
    );
    assert.equal(nextPage.statusCode, 200);
    assert.deepEqual(
      [...apiResult.body.items, ...nextPage.body.items].map((entry) => entry.id),
      expectedEntryIds(dictionary, { sort: "lemmaAsc" }),
    );

    const orderedEntryIds = expectedEntryIds(dictionary, { sort: "lemmaAsc" });
    const locatedEntryId = orderedEntryIds.at(-1);
    const locatedEntry = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(locatedEntryId)}/location?sort=lemmaAsc&limit=2`,
    );
    assert.equal(locatedEntry.statusCode, 200);
    assert.equal(locatedEntry.body.location.found, true);
    assert.equal(locatedEntry.body.location.entryId, locatedEntryId);
    assert.equal(locatedEntry.body.location.resultIndex, orderedEntryIds.length - 1);
    assert.equal(locatedEntry.body.location.windowOffset, Math.floor((orderedEntryIds.length - 1) / 2) * 2);
    assert.ok(locatedEntry.body.items.some((entry) => entry.id === locatedEntryId));
    assert.ok(locatedEntry.body.pageInfo.windowCursor);

    const excludedEntry = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(locatedEntryId)}/location?part=missing-part&limit=2`,
    );
    assert.equal(excludedEntry.statusCode, 200);
    assert.equal(excludedEntry.body.location.found, false);
    assert.equal(excludedEntry.body.location.reason, "not_in_results");
    assert.deepEqual(excludedEntry.body.items, []);

    const betaFilter = JSON.stringify({ sourceCount: { min: 2 } });
    const locatedFilteredEntry = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/entry-beta/location?filter=${encodeURIComponent(betaFilter)}&limit=2`,
    );
    assert.equal(locatedFilteredEntry.statusCode, 200);
    assert.equal(locatedFilteredEntry.body.location.found, true);
    assert.deepEqual(locatedFilteredEntry.body.items.map((entry) => entry.id), ["entry-beta"]);

    const locatedFilteredSearchEntry = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/entry-beta/location?filter=${encodeURIComponent(betaFilter)}&q=movement&fields=definitions&limit=2`,
    );
    assert.equal(locatedFilteredSearchEntry.statusCode, 200);
    assert.equal(locatedFilteredSearchEntry.body.location.found, true);
    assert.deepEqual(locatedFilteredSearchEntry.body.items.map((entry) => entry.id), ["entry-beta"]);

    const excludedFilteredEntry = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/entry-alpha/location?filter=${encodeURIComponent(betaFilter)}&limit=2`,
    );
    assert.equal(excludedFilteredEntry.statusCode, 200);
    assert.equal(excludedFilteredEntry.body.location.found, false);
    assert.equal(excludedFilteredEntry.body.location.reason, "not_in_results");

    await assert.rejects(
      () => repository.locateEntryQueryWindow(dictionary.id, "entry-does-not-exist", { limit: 2 }),
      (error) => error?.status === 404 && error?.code === "entry_not_found",
    );

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups?sort=lemmaAsc&limit=2`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 2);
    assert.equal(apiResult.body.pageInfo.hasMore, true);
    assert.ok(apiResult.body.pageInfo.nextCursor);
    assert.ok(apiResult.body.pageInfo.windowCursor);
    const nextRootGroupPage = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups?sort=lemmaAsc&limit=100&cursor=${encodeURIComponent(apiResult.body.pageInfo.nextCursor)}`,
    );
    assert.equal(nextRootGroupPage.statusCode, 200);
    assert.deepEqual(
      [...apiResult.body.items, ...nextRootGroupPage.body.items].map((group) => group.root.id),
      expectedRootGroupSnapshot(dictionary, { sort: "lemmaAsc" }).map((group) => group.rootId),
    );

    const rootSnapshot = expectedRootGroupSnapshot(dictionary, { sort: "lemmaAsc" });
    const locatedRootGroup = rootSnapshot.find((group) => group.derivedIds.length > 0);
    assert.ok(locatedRootGroup, "root locator fixture must contain a derived entry");
    const locatedDerivedId = locatedRootGroup.derivedIds[0];
    const locatedRoot = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups/location?entryId=${encodeURIComponent(locatedDerivedId)}&sort=lemmaAsc&limit=1`,
    );
    assert.equal(locatedRoot.statusCode, 200);
    assert.equal(locatedRoot.body.location.found, true);
    assert.equal(locatedRoot.body.location.entryId, locatedDerivedId);
    assert.equal(locatedRoot.body.location.rootId, locatedRootGroup.rootId);
    assert.equal(locatedRoot.body.location.groupIndex, rootSnapshot.indexOf(locatedRootGroup));
    assert.equal(locatedRoot.body.location.windowOffset, rootSnapshot.indexOf(locatedRootGroup));
    assert.equal(locatedRoot.body.items[0]?.root?.id, locatedRootGroup.rootId);
    assert.ok(locatedRoot.body.pageInfo.windowCursor);
    assert.ok(locatedRoot.body.pageInfo.windowMetrics.length > 0);

    const excludedRoot = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups/location?entryId=${encodeURIComponent(locatedDerivedId)}&q=no-such-root-result&limit=1`,
    );
    assert.equal(excludedRoot.statusCode, 200);
    assert.equal(excludedRoot.body.location.found, false);
    assert.ok(["not_in_results", "root_context_not_in_results"].includes(excludedRoot.body.location.reason));

    await assert.rejects(
      () => repository.locateRootGroupQueryWindow(dictionary.id, locatedDerivedId, {
        preferredRootId: "entry-does-not-exist",
        limit: 1,
      }),
      (error) => error?.status === 400 && error?.code === "invalid_root_context",
    );
    await assert.rejects(
      () => callApi(
        repository,
        "GET",
        `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups/location?limit=1`,
      ),
      (error) => error?.status === 400 && error?.code === "invalid_entry_location_target",
    );
  } finally {
    await repository.deleteDictionary(dictionary.id);
    if (previousState.activeDictionaryId) {
      await repository.activateDictionary(previousState.activeDictionaryId);
    }
  }

  const noConfiguredPartDictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-read-api-no-configured-part",
    name: "Read API No Configured Part",
    settings: {
      tagDisplayMap: { topic: "Topic Display" },
    },
    entries: [
      { id: "entry-topic-first", lemma: "topic first", tags: ["topic", "n"], definitions: [{ id: "def-topic", meaning: "topic" }] },
      { id: "entry-n-first", lemma: "noun first", tags: ["n", "topic"], definitions: [{ id: "def-n", meaning: "noun" }] },
    ],
  }));

  try {
    await assertEntryQueryConsistency(repository, noConfiguredPartDictionary, { part: "topic" });
    let apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(noConfiguredPartDictionary.id)}/facets`);
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(apiResult.body.parts, []);
    assert.equal(apiResult.body.noPartOfSpeechCount, 2);
  } finally {
    await repository.deleteDictionary(noConfiguredPartDictionary.id);
    if (previousState.activeDictionaryId) {
      await repository.activateDictionary(previousState.activeDictionaryId);
    }
  }
}

async function runRepositoryContractTests(options = {}) {
  assert.equal(typeof options.createRepository, "function", "createRepository option is required");
  const stopAfter = options.stopAfter || "all";
  assert.ok(
    Object.hasOwn(CONTRACT_STAGES, stopAfter),
    `Unknown repository contract stopAfter stage: ${stopAfter}`,
  );
  const shouldStopAfter = (stage) => CONTRACT_STAGES[stage] >= CONTRACT_STAGES[stopAfter];
  const context = await options.createRepository({
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  });
  const repository = context.repository || context;
  const cleanup = context.cleanup || (async () => {});
  try {
    await repository.ensureDataStore?.();

    let state = await repository.readState();
    assert.equal(state.activeDictionaryId, "");
    assert.deepEqual(state.dictionaries, []);
    assert.equal(state.uiLanguage, "zh");
    assert.equal(state.uiTheme, "light");

    const first = await repository.createDictionary(normalizeDictionary({
      name: "First",
      language: "one",
      settings: { partOfSpeechTags: ["n", "v"] },
    }));
    const second = await repository.createDictionary(normalizeDictionary({ name: "Second", language: "two" }));

    state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [first.id, second.id]);

    await repository.activateDictionary(first.id);
    assert.equal((await repository.readState()).activeDictionaryId, first.id);

    const activeExport = await repository.exportDictionary();
    assert.equal(activeExport.id, first.id);
    let apiResult = await callApi(repository, "GET", `/api/export?dictionaryId=${encodeURIComponent(first.id)}&profile=portable-json`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.id, first.id);
    await assertRejectStatus(
      callApi(repository, "GET", `/api/export?dictionaryId=${encodeURIComponent(first.id)}&format=xlsx`),
      400,
      "unsupported export format",
    );
    if (shouldStopAfter("lifecycle")) {
      return { completedStage: "lifecycle" };
    }

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/meta`, {
      name: "First Renamed",
      language: "renamed",
      description: "meta only",
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.name, "First Renamed");
    assert.equal(apiResult.body.language, "renamed");
    const removedSnapshotPut = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}`, {
      name: "Must Not Replace Snapshot",
    });
    assert.equal(removedSnapshotPut.handled, false, "full snapshot PUT should not be routed");

    const savedRoot = await repository.saveEntry(first.id, {
      lemma: "root",
      tags: ["n"],
      definitions: [{ meaning: "root meaning" }],
    });
    assert.equal(savedRoot.entry.tags[0], "n");
    assert.equal(savedRoot.entry.definitions[0].meaning, "root meaning");
    assert.deepEqual(savedRoot.summary, { entryCount: 1, rootCount: 1 });
    const rootEntryId = savedRoot.entry.id;

    const savedWithNewEntry = await repository.saveEntry(first.id, {
      lemma: "new entry",
      tags: [" tag ", null, "tag", "null"],
      definitions: [{ meaning: "new" }],
    });
    assert.equal(savedWithNewEntry.id, first.id);
    assert.equal(savedWithNewEntry.entry.lemma, "new entry");
    assert.deepEqual(savedWithNewEntry.entry.tags, ["tag", "null"]);
    const repositoryEntryId = savedWithNewEntry.entry.id;
    assert.equal((await repository.getEntry(first.id, repositoryEntryId)).lemma, "new entry");

    const savedWithoutDefinitions = await repository.saveEntry(first.id, { lemma: "definitionless", definitions: [] });
    assert.deepEqual(savedWithoutDefinitions.entry.definitions, []);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`);
    assert.equal(apiResult.handled, true);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 3);
    assert.equal(typeof apiResult.body.pageInfo, "object");
    assert.equal(Object.hasOwn(apiResult.body.items[0], "definitions"), false);
    assert.equal(Array.isArray(apiResult.body.items[0].definitionPreviews), true);

    apiResult = await callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
      lemma: "api entry",
      definitions: [{ meaning: "created through API" }],
    });
    assert.equal(apiResult.statusCode, 201);
    assert.match(apiResult.body.entry.id, /^entry-/);
    assert.equal(apiResult.body.entry.lemma, "api entry");
    assert.equal(apiResult.body.summary.entryCount, 4);
    const apiEntryId = apiResult.body.entry.id;

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.definitions[0].meaning, "created through API");

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`, {
      ...apiResult.body,
      lemma: "api entry updated",
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.entry.lemma, "api entry updated");
    assert.equal(apiResult.body.summary.entryCount, 4);

    apiResult = await callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
      lemma: "derived smoke",
      pronunciation: "/derived/",
      tags: ["v", "derived"],
      definitions: [{ meaning: "derived from root" }],
      etymology: { sources: ["root"], description: "" },
    });
    assert.equal(apiResult.statusCode, 201);
    assert.equal(apiResult.body.summary.rootCount, 4);
    const derivedEntryId = apiResult.body.entry.id;
    if (shouldStopAfter("entryCrud")) {
      return { completedStage: "entryCrud" };
    }

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries?q=derived`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 1);
    assert.equal(apiResult.body.items[0].lemma, "derived smoke");
    assert.deepEqual(apiResult.body.items[0].definitionPreviews.map((definition) => definition.meaning), ["derived from root"]);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries?part=v&tags=derived&tagMode=all&limit=1`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 1);
    assert.equal(apiResult.body.pageInfo.total, 1);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries?limit=2&sort=lemmaAsc`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 2);
    assert.equal(apiResult.body.pageInfo.hasMore, true);
    assert.ok(apiResult.body.pageInfo.nextCursor);
    assert.ok(apiResult.body.pageInfo.windowCursor);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/facets`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.parts.some((part) => part.tag === "n" && part.entryCount === 1), true);
    assert.equal(apiResult.body.parts.some((part) => part.tag === "v" && part.entryCount === 1), true);
    assert.equal(apiResult.body.tags.some((tag) => tag.tag === "derived" && tag.entryCount === 1), true);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entry-relations/${encodeURIComponent(rootEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.derivedEntries.some((entry) => entry.id === derivedEntryId), true);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entry-relations/${encodeURIComponent(derivedEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.sources[0].matchedEntryId, rootEntryId);
    assert.equal(apiResult.body.sources[0].matchedEntry.id, rootEntryId);
    assert.equal(apiResult.body.sources[0].matchedEntry.lemma, "root");

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/root-groups?q=derived&limit=100`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 1);
    assert.equal(apiResult.body.items[0].root.id, rootEntryId);
    assert.equal(apiResult.body.items[0].derivedCount, 1);
    assert.equal(apiResult.body.items[0].matchedDerivedCount, 1);
    apiResult = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(first.id)}/root-groups/${encodeURIComponent(rootEntryId)}/entries?q=derived`,
    );
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(apiResult.body.items.map((entry) => entry.id), [derivedEntryId]);
    assert.equal(apiResult.body.items[0].rootGroupMatch, true);

    await checkReadApiConsistency(repository);
    if (shouldStopAfter("readApi")) {
      return { completedStage: "readApi" };
    }

    apiResult = await callApi(repository, "DELETE", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(Object.keys(apiResult.body), ["updatedAt", "summary"]);
    assert.ok(apiResult.body.updatedAt);
    assert.equal(apiResult.body.summary.entryCount, 4);
    await assertRejectStatus(
      callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`),
      404,
      "deleted entry lookup",
    );

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/settings`, {
      allowEmptyTags: false,
      docsAutoSave: true,
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.settings.allowEmptyTags, false);
    assert.equal(apiResult.body.settings.docsAutoSave, true);

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/docs`, {
      markdown: "# Notes",
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.docs.markdown, "# Notes");

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/corpus`, {
      units: [{ content: "corpus unit" }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.corpus.units[0].content, "corpus unit");
    assert.match(apiResult.body.corpus.units[0].id, /^corpus-unit-/);

    apiResult = await callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/autosave`, {
      docs: { markdown: "# Autosaved notes" },
      corpus: { units: [{ content: "autosaved corpus unit" }] },
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.docs.markdown, "# Autosaved notes");
    assert.equal(apiResult.body.corpus.units[0].content, "autosaved corpus unit");

    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/autosave`, {}),
      400,
      "empty autosave payload",
    );

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/morphology`, {
      templateGroups: [{ name: "Nouns", tables: [{ title: "Nouns", rowCount: 2, columnCount: 2 }] }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.morphology.templateGroups[0].name, "Nouns");
    assert.match(apiResult.body.morphology.templateGroups[0].id, /^morph-/);
    await assertRejectStatus(
      callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/morphology`, {
        templateGroups: [{ name: "Broken", tables: [{ title: "Broken", rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "{a}" } } }] }],
      }),
      400,
      "invalid morphology syntax save",
    );

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/settings/ipa`, {
      mappings: [{ from: "a", to: "ɑ" }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.settings.ipa.mappings[0].to, "ɑ");
    if (shouldStopAfter("modules")) {
      return { completedStage: "modules" };
    }

    apiResult = await callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
      settings: { allowEmptyDefinitions: false },
      updates: [{ id: repositoryEntryId, patch: { tags: ["n", "root"] } }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.entries.length, 1);
    assert.equal(apiResult.body.entries[0].id, repositoryEntryId);
    assert.deepEqual(apiResult.body.entries[0].tags, ["n", "root"]);
    assert.equal(apiResult.body.settings.allowEmptyDefinitions, false);
    await assertRejectStatus(
      callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
        updates: [{ id: repositoryEntryId, patch: { definitions: [] } }],
      }),
      400,
      "unsupported entry patch field",
    );
    await assertRejectStatus(
      callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
        updates: [{ id: repositoryEntryId, patch: { tags: "n" } }],
      }),
      400,
      "invalid entry patch tags",
    );
    await assertRejectStatus(
      callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
        updates: [{ id: repositoryEntryId, patch: { pronunciation: ["/n/"] } }],
      }),
      400,
      "invalid entry patch pronunciation",
    );

    await checkCorpusIdCollisionInvariants(repository);
    await checkEntryFilterFactsContract(repository);
    await checkAnalysisQueryContract(repository);
    await checkTagSetAnalysisContract(repository);

    const preferences = await repository.updatePreferences({ uiLanguage: "en", uiTheme: "dark" });
    assert.deepEqual(preferences, { uiLanguage: "en", uiTheme: "dark" });
    state = await repository.readState();
    assert.equal(state.uiLanguage, "en");
    assert.equal(state.uiTheme, "dark");

    await assertRejectStatus(repository.importDictionary(first), 409, "duplicate import");
    await repository.importDictionary({ ...first, name: "First Overwritten" }, { overwrite: true });
    assert.equal((await repository.getDictionarySnapshot(first.id)).name, "First Overwritten");

    await repository.deleteDictionary(first.id);
    state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [second.id]);

    await assertRejectStatus(repository.activateDictionary(first.id), 404, "activate deleted dictionary");
    await assertRejectStatus(repository.exportDictionary(first.id), 404, "export deleted dictionary");

    await repository.createDictionary({ id: "dict-collision", name: "Collision" });
    const generated = withPatchedRandomUUID(["collision", "fresh"], () => repository.createDictionary({ name: "Generated" }));
    assert.equal((await generated).id, "dict-fresh");

    await assertRejectStatus(
      repository.importDictionary(normalizeDictionary({
        id: "dict-duplicate-entry-import",
        name: "Duplicate Entry Import",
        entries: [
          { id: "entry-import-duplicate", lemma: "a" },
          { id: "entry-import-duplicate", lemma: "b" },
        ],
      })),
      409,
      "duplicate entry id import",
    );
    await assertRejectStatus(
      repository.importDictionary(normalizeDictionary({
        id: "dict-cross-type-import",
        name: "Cross Type Import",
        entries: [{ id: "shared-import-id", lemma: "a" }],
        settings: { ipa: { mappings: [{ from: "a", to: "b" }] } },
        morphology: { templateGroups: [{ id: "shared-import-id", name: "A", tables: [] }] },
        corpus: { units: [{ id: "shared-import-id", content: "x" }] },
      })),
      409,
      "cross type duplicate id import",
    );

    await assertRejectStatus(repository.importDictionary({ id: "bad id", name: "Bad" }), 400, "invalid dictionary id import");
    const regeneratedImport = withPatchedRandomUUID(
      ["collision", "imported"],
      () => repository.importDictionary({ id: "bad id", name: "Regenerated" }, { regenerateId: true }),
    );
    assert.equal((await regeneratedImport).id, "dict-imported");
    return { completedStage: "all" };
  } finally {
    await cleanup();
  }
}

module.exports = {
  callApi,
  checkModelNormalization,
  runRepositoryContractTests,
};
