#!/usr/bin/env node
const assert = require("node:assert/strict");

const { normalizeDictionary } = require("../lib/dictionary-model");
const entryRelationsModel = require("../lib/entry-relations-model");
const entrySearchModel = require("../lib/entry-search-model");
const morphologyModel = require("../lib/morphology-model");
const searchNormalizationModel = require("../lib/search-normalization-model");
const tagModel = require("../lib/tag-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { createTempSqliteRepository } = require("./sqlite-check-utils");

const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";

function normalizeText(value) {
  return searchNormalizationModel.normalizeSearchText(value);
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function queryOffset(cursor) {
  if (!cursor) {
    return 0;
  }
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    return Math.max(0, Number.parseInt(parsed.offset, 10) || 0);
  } catch {
    return 0;
  }
}

function compareEntries(left, right, sort = "lemmaAsc") {
  const lemmaCompare = String(left.lemma || "").localeCompare(String(right.lemma || ""), "zh-CN");
  const dateCompare = (a, b) => {
    const difference = new Date(a || 0).getTime() - new Date(b || 0).getTime();
    return difference || lemmaCompare;
  };
  if (sort === "lemmaDesc") {
    return -lemmaCompare;
  }
  if (sort === "updatedAsc") {
    return dateCompare(left.updatedAt, right.updatedAt);
  }
  if (sort === "updatedDesc") {
    return -dateCompare(left.updatedAt, right.updatedAt);
  }
  if (sort === "createdAsc") {
    return dateCompare(left.createdAt, right.createdAt);
  }
  if (sort === "createdDesc") {
    return -dateCompare(left.createdAt, right.createdAt);
  }
  return lemmaCompare;
}

function expectedEntryIds(dictionary, query = {}) {
  const searchRuntime = entrySearchModel.searchSettingsQueryOptions(dictionary.settings?.search);
  const searchFields = entrySearchModel.normalizeSearchFields(query.fields || query.searchFields);
  const fuzzyFields = entrySearchModel.normalizeFuzzyFields(query.fuzzyFields);
  const normalizedQuery = searchRuntime.normalizeText(query.q || query.query);
  const tags = splitList(query.tags).map(searchNormalizationModel.normalizeStructuralKey);
  const source = normalizeText(query.source);
  const derivedFrom = normalizeText(query.derivedFrom);
  const relationIndex = entryRelationsModel.buildEntryRelationIndex(dictionary, { normalizeText });
  const derivedIds = !derivedFrom
    ? null
    : new Set((() => {
      const target = entryRelationsModel.resolveSourceEntry(derivedFrom, dictionary, {
        normalizeText: searchRuntime.normalizeText,
        index: relationIndex,
      });
      const derived = target
        ? entryRelationsModel.findDerivedEntries(target, dictionary, { normalizeText, index: relationIndex })
        : relationIndex.derivedBySourceKey.get(derivedFrom) || [];
      return derived.map((entry) => entry.id);
    })());

  return [...(dictionary.entries || [])]
    .filter((entry) => {
      if (normalizedQuery && !entrySearchModel.entryMatchesSearchText(entry, dictionary, query.q || query.query, {
        fields: searchFields,
        fuzzyFields,
        normalizeText: searchRuntime.normalizeText,
      })) {
        return false;
      }
      const parts = tagModel.entryParts(entry, dictionary);
      if (query.part) {
        if (query.part === NO_PART_FILTER_VALUE ? parts.length : !parts.some((part) => (
          searchNormalizationModel.normalizeStructuralKey(part)
            === searchNormalizationModel.normalizeStructuralKey(query.part)
        ))) {
          return false;
        }
      }
      if (tags.length) {
        const entryTags = new Set((entry.tags || []).map(searchNormalizationModel.normalizeStructuralKey));
        const matches = tags.map((tag) => entryTags.has(tag));
        if (query.tagMode === "all" ? matches.some((match) => !match) : !matches.some(Boolean)) {
          return false;
        }
      }
      if (source && !(entry.etymology?.sources || []).some((item) => normalizeText(item) === source)) {
        return false;
      }
      return !derivedIds || derivedIds.has(entry.id);
    })
    .sort((left, right) => compareEntries(left, right, query.sort || "lemmaAsc"))
    .map((entry) => entry.id);
}

async function queryWithoutSnapshot(repository, dictionaryId, query) {
  const original = repository.exportDictionarySnapshot;
  repository.exportDictionarySnapshot = () => {
    throw new Error(`Expected direct SQL query, but ${JSON.stringify(query)} requested a full dictionary snapshot.`);
  };
  try {
    return await repository.queryEntries(dictionaryId, query);
  } finally {
    repository.exportDictionarySnapshot = original;
  }
}

async function queryExpectingSnapshot(repository, dictionaryId, query) {
  const original = repository.exportDictionarySnapshot;
  let snapshotCalls = 0;
  repository.exportDictionarySnapshot = function trackedSnapshot(...args) {
    snapshotCalls += 1;
    return original.apply(this, args);
  };
  try {
    const result = await repository.queryEntries(dictionaryId, query);
    assert.ok(snapshotCalls > 0, `Expected fallback snapshot for ${JSON.stringify(query)}.`);
    return result;
  } finally {
    repository.exportDictionarySnapshot = original;
  }
}

async function assertDirectQuery(repository, dictionary, query, expected = expectedEntryIds(dictionary, query)) {
  const result = await queryWithoutSnapshot(repository, dictionary.id, query);
  const offset = queryOffset(query.cursor);
  const limit = query.limit || 100;
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    expected.slice(offset, offset + limit),
    `direct SQL result differs from shared matcher: ${JSON.stringify(query)}`,
  );
  if (query.q) {
    result.items.forEach((entry) => assert.equal(Array.isArray(entry.searchHits), true));
  }
  return result;
}

async function assertFallbackQuery(repository, dictionary, query, expected = expectedEntryIds(dictionary, query)) {
  const result = await queryExpectingSnapshot(repository, dictionary.id, query);
  const offset = queryOffset(query.cursor);
  const limit = query.limit || 100;
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    expected.slice(offset, offset + limit),
    `fallback result differs from shared matcher: ${JSON.stringify(query)}`,
  );
  return result;
}

function searchConsistencyDictionary() {
  return normalizeDictionary({
    id: "dict-entry-search-consistency",
    name: "Entry Search Consistency",
    settings: {
      manualPartOfSpeechTags: true,
      partOfSpeechTags: ["n", "v"],
      tagDisplayMap: { "internal-tag": "DisplayTagToken" },
    },
    morphology: {
      templateGroups: [
        { id: "morph-upper-tag", name: "Upper tag", matchTags: ["N"], tables: [] },
        { id: "morph-lower-tag", name: "Lower tag", matchTags: ["n"], tables: [] },
      ],
    },
    entries: [
      {
        id: "entry-alpha-root",
        lemma: "AlphaRoot",
        pronunciation: "PronunciationToken",
        tags: ["n", "RawTagToken", "internal-tag"],
        definitions: [{
          id: "def-alpha-root",
          meaning: "CommonToken DefinitionToken",
          example: "ExampleToken",
          note: "DefinitionNoteToken",
        }],
        notes: "EntryNoteToken",
        etymology: {
          sources: ["ProtoSourceToken"],
          description: "EtymologyDescriptionToken",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "entry-beta-derived",
        lemma: "BetaDerived",
        tags: ["v"],
        definitions: [{ id: "def-beta-derived", meaning: "CommonToken DerivedDefinition" }],
        etymology: { sources: ["AlphaRoot"] },
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "entry-gamma-untagged",
        lemma: "GammaUntagged",
        definitions: [{ id: "def-gamma-untagged", meaning: "CommonToken UntaggedDefinition" }],
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "entry-separate-search-values",
        lemma: "SeparateSearchValues",
        tags: ["TagLeftMarker", "TagRightMarker"],
        definitions: [
          { id: "def-separate-left", meaning: "DefinitionLeftMarker", example: "f", note: "NoteLeftMarker" },
          { id: "def-separate-right", meaning: "DefinitionRightMarker", example: "ar", note: "NoteRightMarker" },
          { id: "def-single-phrase", meaning: "Phrase Inside Value", example: "Example Phrase Inside Value" },
        ],
        notes: "EntryNoteMarker",
        etymology: {
          sources: ["SourceRightMarker"],
          description: "EtymologyLeftMarker",
        },
      },
      { id: "entry-unicode", lemma: "ČapToken", definitions: [] },
      { id: "entry-pua-one", lemma: "\uE000PrivateToken", definitions: [] },
      { id: "entry-pua-two", lemma: "\uE001PrivateToken", definitions: [] },
      { id: "entry-composed", lemma: "CaféToken", definitions: [] },
      { id: "entry-final-sigma", lemma: "ςToken", definitions: [] },
      { id: "entry-sharp-s", lemma: "StraßeToken", definitions: [] },
      { id: "entry-dotless-i", lemma: "IstanbulToken", definitions: [] },
      { id: "entry-dotted-i", lemma: "İzmirToken", definitions: [] },
      { id: "entry-upper-tag", lemma: "UpperTag", tags: ["N"], definitions: [{ id: "def-upper-tag", meaning: "StructuralToken" }] },
      { id: "entry-lower-tag", lemma: "LowerTag", tags: ["n"], definitions: [{ id: "def-lower-tag", meaning: "StructuralToken" }] },
    ],
  });
}

async function main() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log("SQLite runtime unavailable; entry-search consistency check skipped.");
    return;
  }
  const context = await createTempSqliteRepository("conlexicon-entry-search-consistency-");
  try {
    const source = searchConsistencyDictionary();
    await context.repository.importDictionarySnapshot(source, { overwrite: true });
    let dictionary = await context.repository.exportDictionary(source.id);
    const repository = context.repository;

    const alphaRoot = dictionary.entries.find((entry) => entry.id === "entry-alpha-root");
    const alphaSearchRecords = entrySearchModel.entrySearchValueRecords(alphaRoot, dictionary);
    assert.deepEqual(
      alphaSearchRecords.find((record) => record.field === "definitions"),
      {
        field: "definitions",
        value: "CommonToken DefinitionToken",
        sourceType: "definition",
        sourceId: "def-alpha-root",
        sourcePosition: 0,
        valueType: "meaning",
      },
      "definition search values must retain a stable definition locator",
    );
    assert.deepEqual(
      alphaSearchRecords.filter((record) => record.field === "tags" && record.sourcePosition === 2),
      [
        {
          field: "tags",
          value: "internal-tag",
          sourceType: "tag",
          sourceId: "",
          sourcePosition: 2,
          valueType: "raw",
        },
        {
          field: "tags",
          value: "DisplayTagToken",
          sourceType: "tag",
          sourceId: "",
          sourcePosition: 2,
          valueType: "display",
        },
      ],
      "raw and displayed tag values must share the same tag locator",
    );
    assert.deepEqual(
      entrySearchModel.entrySearchFieldValues(alphaRoot, dictionary).definitions,
      alphaSearchRecords.filter((record) => record.field === "definitions").map((record) => record.value),
      "the current matcher must consume the shared per-value record projection",
    );

    await assertDirectQuery(repository, dictionary, { q: "AlphaRoot", fields: "lemma" });
    await assertDirectQuery(repository, dictionary, { q: "PronunciationToken", fields: "pronunciation" });
    await assertDirectQuery(repository, dictionary, { q: "RawTagToken", fields: "tags" });
    await assertDirectQuery(repository, dictionary, { q: "DisplayTagToken", fields: "tags" });
    const definitionHitResult = await assertDirectQuery(repository, dictionary, { q: "DefinitionToken", fields: "definitions" });
    assert.deepEqual(definitionHitResult.items[0].searchHits, [{
      field: "definitions",
      value: "CommonToken DefinitionToken",
      sourceType: "definition",
      sourceId: "def-alpha-root",
      sourcePosition: 0,
      valueType: "meaning",
    }]);
    await assertDirectQuery(repository, dictionary, { q: "ExampleToken", fields: "examples" });
    await assertDirectQuery(repository, dictionary, { q: "EntryNoteToken", fields: "notes" });
    await assertDirectQuery(repository, dictionary, { q: "DefinitionNoteToken", fields: "notes" });
    await assertDirectQuery(repository, dictionary, { q: "EtymologyDescriptionToken", fields: "etymology" });
    await assertDirectQuery(repository, dictionary, { q: "ProtoSourceToken", fields: "etymology" });
    await assertDirectQuery(repository, dictionary, { q: "Phrase Inside Value", fields: "definitions" }, ["entry-separate-search-values"]);
    await assertDirectQuery(repository, dictionary, { q: "Example Phrase Inside Value", fields: "examples" }, ["entry-separate-search-values"]);

    await assertDirectQuery(repository, dictionary, { q: "DefinitionLeftMarker DefinitionRightMarker", fields: "definitions" }, []);
    await assertDirectQuery(repository, dictionary, { q: "TagLeftMarker TagRightMarker", fields: "tags" }, []);
    await assertDirectQuery(repository, dictionary, { q: "EntryNoteMarker NoteLeftMarker", fields: "notes" }, []);
    await assertDirectQuery(repository, dictionary, { q: "EtymologyLeftMarker SourceRightMarker", fields: "etymology" }, []);
    await assertFallbackQuery(repository, dictionary, {
      q: "far",
      fields: "examples",
      fuzzyFields: "examples",
    }, []);

    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", part: "n" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", tags: "RawTagToken" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", source: "ProtoSourceToken" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", derivedFrom: "AlphaRoot" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", part: NO_PART_FILTER_VALUE });
    await assertDirectQuery(repository, dictionary, { q: "StructuralToken", fields: "definitions", tags: "N" }, ["entry-upper-tag"]);
    await assertDirectQuery(repository, dictionary, { q: "StructuralToken", fields: "definitions", tags: "n" }, ["entry-lower-tag"]);
    await assertDirectQuery(repository, dictionary, { q: "StructuralToken", fields: "definitions", part: "n" }, ["entry-lower-tag"]);
    await assertDirectQuery(repository, dictionary, { q: "StructuralToken", fields: "definitions", part: "N" }, []);
    assert.deepEqual(
      morphologyModel.resolveEntryMorphologyGroups(
        dictionary.entries.find((entry) => entry.id === "entry-upper-tag"),
        dictionary,
      ).map(({ templateGroup }) => templateGroup.id),
      ["morph-upper-tag"],
      "automatic morphology must match uppercase structural tags exactly",
    );
    assert.deepEqual(
      morphologyModel.resolveEntryMorphologyGroups(
        dictionary.entries.find((entry) => entry.id === "entry-lower-tag"),
        dictionary,
      ).map(({ templateGroup }) => templateGroup.id),
      ["morph-lower-tag"],
      "automatic morphology must match lowercase structural tags exactly",
    );
    await assertDirectQuery(repository, dictionary, {
      q: "CommonToken",
      fields: "definitions",
      source: "protosourcetoken",
    }, ["entry-alpha-root"]);

    const fullResult = await assertDirectQuery(repository, dictionary, {
      q: "DefinitionToken",
      fields: "definitions",
      include: "full",
    });
    assert.equal(fullResult.items[0]?.definitions[0]?.meaning, "CommonToken DefinitionToken");

    const pagedQuery = { q: "CommonToken", fields: "definitions", limit: 2 };
    const firstPage = await assertDirectQuery(repository, dictionary, pagedQuery);
    assert.equal(firstPage.pageInfo.hasMore, true);
    const secondPage = await assertDirectQuery(repository, dictionary, {
      ...pagedQuery,
      cursor: firstPage.pageInfo.nextCursor,
    });
    assert.deepEqual(
      [...firstPage.items, ...secondPage.items].map((entry) => entry.id),
      expectedEntryIds(dictionary, pagedQuery),
      "direct SQL pagination differs from shared matcher",
    );

    await assertDirectQuery(repository, dictionary, { q: "ČAPTOKEN", fields: "lemma" }, []);
    await assertDirectQuery(repository, dictionary, { q: "\uE000PrivateToken", fields: "lemma" });
    await assertDirectQuery(repository, dictionary, { q: "\uE001PrivateToken", fields: "lemma" });
    await assertDirectQuery(repository, dictionary, { q: "Cafe\u0301Token", fields: "lemma" }, []);
    await assertDirectQuery(repository, dictionary, { q: "ΣTOKEN", fields: "lemma" }, []);
    await assertDirectQuery(repository, dictionary, { q: "STRASSETOKEN", fields: "lemma" }, []);
    await assertDirectQuery(repository, dictionary, { q: "STRAẞETOKEN", fields: "lemma" }, []);
    await assertDirectQuery(repository, dictionary, { q: "istanbultoken", fields: "lemma" }, []);
    await assertDirectQuery(repository, dictionary, { q: "izmirtoken", fields: "lemma" }, []);

    await repository.updateSettings(dictionary.id, {
      ...dictionary.settings,
      search: {
        ...dictionary.settings.search,
        normalization: {
          unicodeNormalization: "nfc",
          caseFolding: true,
          customRules: [
            { canonical: "t", variants: ["\uE000"] },
            { canonical: "x", variants: ["alpha"] },
            { canonical: "y", variants: ["x"] },
          ],
        },
      },
    });
    dictionary = await repository.exportDictionary(dictionary.id);
    await assertDirectQuery(repository, dictionary, { q: "ČAPTOKEN", fields: "lemma" }, ["entry-unicode"]);
    await assertDirectQuery(repository, dictionary, { q: "Cafe\u0301Token", fields: "lemma" }, ["entry-composed"]);
    await assertDirectQuery(repository, dictionary, { q: "ΣTOKEN", fields: "lemma" }, ["entry-final-sigma"]);
    await assertDirectQuery(repository, dictionary, { q: "STRASSETOKEN", fields: "lemma" }, ["entry-sharp-s"]);
    await assertDirectQuery(repository, dictionary, { q: "tPrivateToken", fields: "lemma" }, ["entry-pua-one"]);
    await assertDirectQuery(repository, dictionary, { q: "AlphaRoot", fields: "lemma" }, ["entry-alpha-root"]);

    console.log("Entry-search S3.3 projection query, search-hit, and fuzzy fallback checks passed.");
  } finally {
    await context.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
