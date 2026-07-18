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
  const idCompare = String(left.id || "").localeCompare(String(right.id || ""));
  const dateCompare = (a, b, direction = 1) => {
    const difference = new Date(a || 0).getTime() - new Date(b || 0).getTime();
    return (difference * direction) || (lemmaCompare * direction) || idCompare;
  };
  if (sort === "lemmaDesc") {
    return -lemmaCompare || idCompare;
  }
  if (sort === "updatedAsc") {
    return dateCompare(left.updatedAt, right.updatedAt);
  }
  if (sort === "updatedDesc") {
    return dateCompare(left.updatedAt, right.updatedAt, -1);
  }
  if (sort === "createdAsc") {
    return dateCompare(left.createdAt, right.createdAt);
  }
  if (sort === "createdDesc") {
    return dateCompare(left.createdAt, right.createdAt, -1);
  }
  return lemmaCompare || idCompare;
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

async function assertDirectQuery(repository, dictionary, query, expected = expectedEntryIds(dictionary, query)) {
  const result = await queryWithoutSnapshot(repository, dictionary.id, query);
  const offset = queryOffset(query.cursor);
  const limit = query.limit || 100;
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    expected.slice(offset, offset + limit),
    `direct SQL result differs from shared matcher: ${JSON.stringify(query)}`,
  );
  assert.ok(result.pageInfo.windowCursor, "windowed entry queries should always expose a random-access cursor");
  if (query.q) {
    result.items.forEach((entry) => assert.equal(Array.isArray(entry.searchHits), true));
  }
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
        {
          id: "morph-upper-tag",
          name: "Upper tag",
          matchTags: ["N"],
          tables: [{
            id: "mtable-upper-tag",
            title: "Upper forms",
            rowCount: 1,
            columnCount: 1,
            cells: { "0,0": { sourceText: "{}-MorphToken" } },
          }],
        },
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
        morphologyMode: "manual",
        morphologyGroups: [{
          templateGroupId: "morph-lower-tag",
          notes: "MorphologyGroupNoteToken",
        }],
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
    assert.deepEqual(
      alphaSearchRecords.find((record) => record.value === "MorphologyGroupNoteToken"),
      {
        field: "notes",
        value: "MorphologyGroupNoteToken",
        sourceType: "morphologyGroup",
        sourceId: "morph-lower-tag",
        sourcePosition: 0,
        valueType: "note",
      },
      "entry morphology-group notes must participate in the shared notes projection",
    );

    await assertDirectQuery(repository, dictionary, { fields: "lemma", fuzzyFields: "lemma", limit: 2 });
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
    const morphologyHitResult = await assertDirectQuery(
      repository,
      dictionary,
      { q: "UpperTag-MorphToken", fields: "morphology" },
      ["entry-upper-tag"],
    );
    assert.deepEqual(morphologyHitResult.items[0].searchHits, [{
      field: "morphology",
      value: "UpperTag-MorphToken",
      sourceType: "morphology",
      sourceId: "mtable-upper-tag",
      sourcePosition: 0,
      valueType: "generated",
    }]);
    await assertDirectQuery(
      repository,
      dictionary,
      { q: "UpperTag-MorphToken", fields: "definitions,morphology" },
      ["entry-upper-tag"],
    );
    await assertDirectQuery(
      repository,
      dictionary,
      { q: "DefinitionToken", fields: "definitions,morphology" },
      ["entry-alpha-root"],
    );
    await assertDirectQuery(repository, dictionary, { q: "ExampleToken", fields: "examples" });
    await assertDirectQuery(repository, dictionary, { q: "EntryNoteToken", fields: "notes" });
    await assertDirectQuery(repository, dictionary, { q: "DefinitionNoteToken", fields: "notes" });
    const morphologyNoteResult = await assertDirectQuery(
      repository,
      dictionary,
      { q: "MorphologyGroupNoteToken", fields: "notes" },
      ["entry-alpha-root"],
    );
    assert.deepEqual(morphologyNoteResult.items[0].searchHits, [{
      field: "notes",
      value: "MorphologyGroupNoteToken",
      sourceType: "morphologyGroup",
      sourceId: "morph-lower-tag",
      sourcePosition: 0,
      valueType: "note",
    }]);
    await assertDirectQuery(repository, dictionary, { q: "EtymologyDescriptionToken", fields: "etymology" });
    await assertDirectQuery(repository, dictionary, { q: "ProtoSourceToken", fields: "etymology" });
    await assertDirectQuery(repository, dictionary, { q: "Phrase Inside Value", fields: "definitions" }, ["entry-separate-search-values"]);
    await assertDirectQuery(repository, dictionary, { q: "Example Phrase Inside Value", fields: "examples" }, ["entry-separate-search-values"]);

    await assertDirectQuery(repository, dictionary, { q: "DefinitionLeftMarker DefinitionRightMarker", fields: "definitions" }, []);
    await assertDirectQuery(repository, dictionary, { q: "TagLeftMarker TagRightMarker", fields: "tags" }, []);
    await assertDirectQuery(repository, dictionary, { q: "EntryNoteMarker NoteLeftMarker", fields: "notes" }, []);
    await assertDirectQuery(repository, dictionary, { q: "EtymologyLeftMarker SourceRightMarker", fields: "etymology" }, []);
    await assertDirectQuery(repository, dictionary, {
      q: "far",
      fields: "examples",
      fuzzyFields: "examples",
    }, []);
    const fuzzyMorphologyResult = await assertDirectQuery(repository, dictionary, {
      q: "MorphTkn",
      fields: "morphology",
      fuzzyFields: "morphology",
    }, ["entry-upper-tag"]);
    assert.equal(fuzzyMorphologyResult.items[0].searchHits[0].sourceId, "mtable-upper-tag");
    await assertDirectQuery(repository, dictionary, {
      q: "DefTkn",
      fields: "definitions,morphology",
      fuzzyFields: "definitions",
    }, ["entry-alpha-root"]);
    const fuzzySummaryResult = await assertDirectQuery(repository, dictionary, {
      q: "DefTkn",
      fields: "definitions",
      fuzzyFields: "definitions",
    }, ["entry-alpha-root"]);
    assert.equal(fuzzySummaryResult.items[0].definitionPreviews[0].meaning, "CommonToken DefinitionToken");
    await assertDirectQuery(repository, dictionary, {
      q: "StrctrlTkn",
      fields: "definitions",
      fuzzyFields: "definitions",
      tags: "N",
    }, ["entry-upper-tag"]);
    const fuzzyPageQuery = {
      q: "CmonTkn",
      fields: "definitions",
      fuzzyFields: "definitions",
      limit: 2,
    };
    const fuzzyPageIds = expectedEntryIds(dictionary, fuzzyPageQuery);
    const fuzzyFirstPage = await assertDirectQuery(repository, dictionary, fuzzyPageQuery, fuzzyPageIds);
    if (fuzzyFirstPage.pageInfo.hasMore) {
      await assertDirectQuery(repository, dictionary, {
        ...fuzzyPageQuery,
        cursor: fuzzyFirstPage.pageInfo.nextCursor,
      }, fuzzyPageIds);
    }

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

    const summaryResult = await assertDirectQuery(repository, dictionary, {
      q: "DefinitionToken",
      fields: "definitions",
    });
    assert.equal(summaryResult.items[0]?.definitionPreviews[0]?.meaning, "CommonToken DefinitionToken");

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
    const firstWindowAgain = await assertDirectQuery(repository, dictionary, {
      ...pagedQuery,
      cursor: firstPage.pageInfo.windowCursor,
      windowOffset: 0,
    });
    assert.deepEqual(
      firstWindowAgain.items.map((entry) => entry.id),
      firstPage.items.map((entry) => entry.id),
      "the dedicated window cursor should support random access independently of nextCursor",
    );
    const strictResultIds = expectedEntryIds(dictionary, pagedQuery);
    const strictLocatedId = strictResultIds.at(-1);
    const strictLocated = await repository.locateEntryQueryWindow(dictionary.id, strictLocatedId, pagedQuery);
    assert.equal(strictLocated.location.found, true);
    assert.equal(strictLocated.location.resultIndex, strictResultIds.length - 1);
    assert.ok(
      strictLocated.items.some((entry) => entry.id === strictLocatedId),
      "strict SQL location should return the window containing the target",
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
    await assertDirectQuery(repository, dictionary, { q: "UPPERTAG-MORPHTOKEN", fields: "morphology" }, ["entry-upper-tag"]);
    await assertDirectQuery(repository, dictionary, {
      q: "STRSSTKN",
      fields: "lemma",
      fuzzyFields: "lemma",
    }, ["entry-sharp-s"]);

    console.log("Entry-search S4 strict and fuzzy static/morphology projection checks passed.");
  } finally {
    await context.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
