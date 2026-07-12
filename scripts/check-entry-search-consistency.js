#!/usr/bin/env node
const assert = require("node:assert/strict");

const { normalizeDictionary } = require("../lib/dictionary-model");
const entryRelationsModel = require("../lib/entry-relations-model");
const entrySearchModel = require("../lib/entry-search-model");
const tagModel = require("../lib/tag-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { createTempSqliteRepository } = require("./sqlite-check-utils");

const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
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
  const searchFields = entrySearchModel.normalizeSearchFields(query.fields || query.searchFields);
  const fuzzyFields = entrySearchModel.normalizeFuzzyFields(query.fuzzyFields);
  const normalizedQuery = normalizeText(query.q || query.query);
  const tags = splitList(query.tags).map(normalizeText);
  const source = normalizeText(query.source);
  const derivedFrom = normalizeText(query.derivedFrom);
  const relationIndex = entryRelationsModel.buildEntryRelationIndex(dictionary, { normalizeText });
  const derivedIds = !derivedFrom
    ? null
    : new Set((() => {
      const target = entryRelationsModel.resolveSourceEntry(derivedFrom, dictionary, {
        normalizeText,
        index: relationIndex,
      });
      const derived = target
        ? entryRelationsModel.findDerivedEntries(target, dictionary, { normalizeText, index: relationIndex })
        : relationIndex.derivedBySourceKey.get(derivedFrom) || [];
      return derived.map((entry) => entry.id);
    })());

  return [...(dictionary.entries || [])]
    .filter((entry) => {
      if (normalizedQuery && !entrySearchModel.entryMatchesSearchText(entry, dictionary, normalizedQuery, {
        fields: searchFields,
        fuzzyFields,
        normalizeText,
      })) {
        return false;
      }
      const parts = tagModel.entryParts(entry, dictionary, { normalizeText });
      if (query.part) {
        if (query.part === NO_PART_FILTER_VALUE ? parts.length : !parts.some((part) => normalizeText(part) === normalizeText(query.part))) {
          return false;
        }
      }
      if (tags.length) {
        const entryTags = new Set((entry.tags || []).map(normalizeText));
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
      { id: "entry-unicode", lemma: "ČapToken", definitions: [] },
      { id: "entry-pua-one", lemma: "\uE000PrivateToken", definitions: [] },
      { id: "entry-pua-two", lemma: "\uE001PrivateToken", definitions: [] },
      { id: "entry-composed", lemma: "CaféToken", definitions: [] },
      { id: "entry-final-sigma", lemma: "ςToken", definitions: [] },
      { id: "entry-sharp-s", lemma: "StraßeToken", definitions: [] },
      { id: "entry-dotless-i", lemma: "IstanbulToken", definitions: [] },
      { id: "entry-dotted-i", lemma: "İzmirToken", definitions: [] },
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
    const dictionary = await context.repository.exportDictionary(source.id);
    const repository = context.repository;

    await assertDirectQuery(repository, dictionary, { q: "AlphaRoot", fields: "lemma" });
    await assertDirectQuery(repository, dictionary, { q: "PronunciationToken", fields: "pronunciation" });
    await assertDirectQuery(repository, dictionary, { q: "RawTagToken", fields: "tags" });
    await assertDirectQuery(repository, dictionary, { q: "DisplayTagToken", fields: "tags" });
    await assertDirectQuery(repository, dictionary, { q: "DefinitionToken", fields: "definitions" });
    await assertDirectQuery(repository, dictionary, { q: "ExampleToken", fields: "examples" });
    await assertDirectQuery(repository, dictionary, { q: "EntryNoteToken", fields: "notes" });
    await assertDirectQuery(repository, dictionary, { q: "DefinitionNoteToken", fields: "notes" });
    await assertDirectQuery(repository, dictionary, { q: "EtymologyDescriptionToken", fields: "etymology" });
    await assertDirectQuery(repository, dictionary, { q: "ProtoSourceToken", fields: "etymology" });

    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", part: "n" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", tags: "RawTagToken" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", source: "ProtoSourceToken" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", derivedFrom: "AlphaRoot" });
    await assertDirectQuery(repository, dictionary, { q: "CommonToken", fields: "definitions", part: NO_PART_FILTER_VALUE });

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

    await assertFallbackQuery(repository, dictionary, { q: "ČAPTOKEN", fields: "lemma" });
    await assertFallbackQuery(repository, dictionary, { q: "\uE000PrivateToken", fields: "lemma" });
    await assertFallbackQuery(repository, dictionary, { q: "\uE001PrivateToken", fields: "lemma" });
    await assertFallbackQuery(repository, dictionary, { q: "Cafe\u0301Token", fields: "lemma" }, []);
    await assertFallbackQuery(repository, dictionary, { q: "ΣTOKEN", fields: "lemma" }, []);
    await assertDirectQuery(repository, dictionary, { q: "STRASSETOKEN", fields: "lemma" }, []);
    await assertFallbackQuery(repository, dictionary, { q: "STRAẞETOKEN", fields: "lemma" });
    await assertDirectQuery(repository, dictionary, { q: "istanbultoken", fields: "lemma" });
    await assertDirectQuery(repository, dictionary, { q: "izmirtoken", fields: "lemma" }, []);

    console.log("Entry-search SQL fast-path and Unicode fallback consistency checks passed.");
  } finally {
    await context.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
