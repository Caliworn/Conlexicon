#!/usr/bin/env node
// Contract for definition tags: an entry as a whole carries its own tags plus
// its definitions' tags, whichever layer a tag is stored on.
const assert = require("node:assert/strict");

const { createDictionaryConversionService } = require("../lib/dictionary-conversion-service");
const { normalizeDictionary } = require("../lib/dictionary-model");
const { resolveAutomaticTemplateGroups } = require("../lib/morphology-model");
const { buildQualityIssues } = require("../lib/quality-model");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");

const NO_PART = "__conlexicon_no_part__";
const PARTS = ["n", "v", "adj"];

// Each entry spec lists its tags and the tags of each definition. The "flat"
// layout puts every tag on the entry; the "split" layout stores them as given.
const ENTRY_SPECS = [
  { id: "red", entryTags: ["archaic"], definitionTags: [["adj"], ["n", "color"]] },
  { id: "walk", entryTags: ["v"], definitionTags: [["n"]] },
  { id: "stone", entryTags: ["n"], definitionTags: [[]] },
  { id: "who", entryTags: [], definitionTags: [["adj", "n"], ["v"]] },
  { id: "and", entryTags: ["particle"], definitionTags: [[]] },
  { id: "bare", entryTags: [], definitionTags: [[]] },
  { id: "dup", entryTags: ["n"], definitionTags: [["adj", "n"], ["adj"]] },
];

function definitionId(entryId, index) {
  return `def-${entryId}-${index}`;
}

function layoutDictionary(id, layout) {
  return normalizeDictionary({
    id,
    name: id,
    settings: {
      partOfSpeechTags: PARTS,
      tagSortOrder: ["v", "n", "adj"],
    },
    morphology: {
      templateGroups: [{
        id: "morph-noun",
        name: "Nouns",
        matchTags: ["n"],
        tables: [{
          id: "mtable-noun",
          title: "Cases",
          rowCount: 1,
          columnCount: 1,
          cells: { "0,0": { sourceText: "{}-s" } },
        }],
      }],
    },
    entries: ENTRY_SPECS.map((spec) => {
      const allTags = [...new Set([...spec.entryTags, ...spec.definitionTags.flat()])];
      return {
        id: spec.id,
        lemma: spec.id,
        tags: layout === "flat" ? allTags : spec.entryTags,
        definitions: spec.definitionTags.map((tags, index) => ({
          id: definitionId(spec.id, index),
          meaning: `${spec.id} ${index}`,
          tags: layout === "flat" ? [] : tags,
        })),
      };
    }),
  });
}

async function resultIds(repository, dictionaryId, filter) {
  const result = await repository.queryEntries(dictionaryId, { filter, limit: 200 });
  return result.items.map((item) => item.id).sort();
}

const FILTERS = {
  partN: { part: "n" },
  partAdj: { part: "adj" },
  noPart: { part: NO_PART },
  anyColor: { tags: { values: ["color"], mode: "any" } },
  allNounAdj: { tags: { values: ["n", "adj"], mode: "all" } },
  exactNounAdj: { tags: { values: ["n", "adj"], mode: "exact" } },
  exactNounVerb: { tags: { values: ["n", "v"], mode: "exact" } },
  tagged: { presence: [{ field: "tag", present: true }] },
  untagged: { presence: [{ field: "tag", present: false }] },
  twoTagsOrMore: { tagCount: { min: 2 } },
  oneTag: { tagCount: { min: 1, max: 1 } },
  multiPart: { partCount: { min: 2 } },
  singlePart: { partCount: { min: 1, max: 1 } },
  nounAdjSet: { partSet: ["n", "adj"] },
  nounVerbSet: { partSet: ["n", "v"] },
  allPartsSet: { partSet: ["n", "v", "adj"] },
  unconfiguredSet: { partSet: ["n", "color"] },
};

const EXPECTED_IDS = {
  partN: ["dup", "red", "stone", "walk", "who"],
  partAdj: ["dup", "red", "who"],
  noPart: ["and", "bare"],
  anyColor: ["red"],
  allNounAdj: ["dup", "red", "who"],
  exactNounAdj: ["dup"],
  exactNounVerb: ["walk"],
  tagged: ["and", "dup", "red", "stone", "walk", "who"],
  untagged: ["bare"],
  twoTagsOrMore: ["dup", "red", "walk", "who"],
  oneTag: ["and", "stone"],
  multiPart: ["dup", "red", "walk", "who"],
  singlePart: ["stone"],
  nounAdjSet: ["dup", "red"],
  nounVerbSet: ["walk"],
  allPartsSet: ["who"],
  unconfiguredSet: [],
};

async function checkPlacementIndependence(repository) {
  await repository.importDictionarySnapshot(layoutDictionary("dict-flat", "flat"));
  await repository.importDictionarySnapshot(layoutDictionary("dict-split", "split"));

  for (const [name, filter] of Object.entries(FILTERS)) {
    const flat = await resultIds(repository, "dict-flat", filter);
    const split = await resultIds(repository, "dict-split", filter);
    assert.deepEqual(split, flat, `${name}: results must not depend on the tag layer`);
    assert.deepEqual(split, EXPECTED_IDS[name], `${name}: effective tag semantics`);
  }

  const facts = await repository.getEntryFilterFacts("dict-split", {
    filters: [
      { id: "multi", filter: FILTERS.multiPart },
      { id: "none", filter: FILTERS.unconfiguredSet },
    ],
  });
  assert.deepEqual(facts.facts, { multi: { available: true }, none: { available: false } });

  const stripGeneration = ({ generation: _generation, ...rest }) => rest;
  assert.deepEqual(
    stripGeneration(await repository.getEntryFacets("dict-split")),
    stripGeneration(await repository.getEntryFacets("dict-flat")),
    "facets count each entry once per effective tag",
  );
  const facets = await repository.getEntryFacets("dict-split");
  assert.equal(facets.tags.find((tag) => tag.tag === "n").entryCount, 5);
  assert.equal(facets.noPartOfSpeechCount, 2);

  const analysisQuery = {
    widgets: [
      { id: "parts", type: "partDistribution" },
      { id: "partSets", type: "partSetDistribution" },
      { id: "tagSets", type: "tagSetDistribution" },
    ],
  };
  const flatAnalysis = await repository.queryAnalysis("dict-flat", analysisQuery);
  const splitAnalysis = await repository.queryAnalysis("dict-split", analysisQuery);
  assert.deepEqual(splitAnalysis.widgets, flatAnalysis.widgets, "analysis must not depend on the tag layer");

  const { parts, partSets, tagSets } = splitAnalysis.widgets;
  assert.equal(parts.multiPartEntryCount, 4);
  assert.deepEqual(parts.multiPartAction.filter, { partCount: { min: 2 } });
  assert.equal(parts.multiPartAction.resultCount, EXPECTED_IDS.multiPart.length);
  assert.equal(partSets.multiPartEntryCount, parts.multiPartEntryCount);
  assert.equal(partSets.partSetCount, 3);
  assert.deepEqual(
    partSets.rows.map((row) => [row.parts.map((part) => part.value), row.entryCount]),
    [[["n", "adj"], 2], [["v", "n"], 1], [["v", "n", "adj"], 1]],
    "rows order by entry count, parts by tagSortOrder",
  );
  for (const row of partSets.rows) {
    const ids = await resultIds(repository, "dict-split", row.action.filter);
    assert.equal(ids.length, row.entryCount, "a part-set row links to exactly its entries");
    assert.equal(row.action.resultCount, row.entryCount);
  }
  assert.equal(tagSets.taggedEntryCount, 6);
  assert.equal(tagSets.multiTagEntryCount, 4);
}

async function checkDtosAndPersistence(repository) {
  const dictionaryId = "dict-split";
  const red = await repository.getEntry(dictionaryId, "red");
  assert.deepEqual(red.tags, ["archaic"], "detail tags stay entry tags");
  assert.deepEqual(red.definitions.map((definition) => definition.tags), [["adj"], ["n", "color"]]);

  const summaries = (await repository.queryEntries(dictionaryId, { limit: 200 })).items;
  const redSummary = summaries.find((item) => item.id === "red");
  assert.deepEqual(redSummary.tags, ["archaic"], "summary tags stay entry tags");
  assert.deepEqual(
    redSummary.effectiveTags,
    ["n", "adj", "archaic", "color"],
    "effective tags: first occurrence, then tagSortOrder",
  );
  assert.deepEqual(redSummary.parts, ["n", "adj"]);
  assert.equal(redSummary.partOfSpeech, "n");
  assert.equal(redSummary.definitionPreviews[0].tags, undefined, "previews carry no tags");
  assert.deepEqual(
    redSummary.definitionPreviews.map((preview) => preview.parts),
    [["adj"], ["n"]],
    "previews carry each definition's own parts of speech only",
  );
  assert.deepEqual(
    summaries.find((item) => item.id === "stone").definitionPreviews[0].parts,
    [],
    "a part of speech on the entry is not repeated on its definitions",
  );

  const exported = await repository.exportDictionary(dictionaryId);
  assert.deepEqual(
    exported.entries.find((entry) => entry.id === "who").definitions.map((definition) => definition.tags),
    [["n", "adj"], ["v"]],
  );

  // Two definitions may hold a tag at the same position; tags normalize like entry tags.
  const saved = await repository.saveEntry(dictionaryId, {
    ...red,
    definitions: [
      { ...red.definitions[0], tags: [" adj ", "rare", "adj", ""] },
      { ...red.definitions[1], tags: ["rare"] },
      { id: "def-red-tag-only", meaning: "", tags: ["v"] },
    ],
  }, { requireExisting: true });
  assert.deepEqual(saved.entry.definitions.map((definition) => definition.tags), [["adj", "rare"], ["rare"], ["v"]]);

  // A definition removed from the entry takes its tags with it.
  await repository.saveEntry(dictionaryId, {
    ...saved.entry,
    definitions: [saved.entry.definitions[0]],
  }, { requireExisting: true });
  const db = repository.openDictionaryDatabase(dictionaryId);
  const definitionTagIds = () => db.prepare("SELECT DISTINCT definition_id AS id FROM definition_tags WHERE entry_id = 'red' ORDER BY id").all()
    .map((row) => row.id);
  assert.deepEqual(definitionTagIds(), [definitionId("red", 0)]);
  await repository.deleteEntry(dictionaryId, "red");
  assert.deepEqual(definitionTagIds(), []);
}

async function checkSearch(repository) {
  const dictionaryId = "dict-split";
  const result = await repository.queryEntries(dictionaryId, {
    search: { text: "adj", fields: ["tags"], fuzzyFields: [] },
    limit: 200,
  });
  const who = result.items.find((item) => item.id === "who");
  assert.ok(who, "tag search finds definition tags");
  assert.deepEqual(
    who.searchHits.filter((hit) => hit.field === "tags").map((hit) => [hit.sourceType, hit.sourceId, hit.sourcePosition]),
    [["definitionTag", definitionId("who", 0), 0]],
    "hits locate the definition and the tag position inside it",
  );

  const db = repository.openDictionaryDatabase(dictionaryId);
  const projection = () => db.prepare(`
    SELECT entry_id, field, source_type, source_id, source_position, value_type, raw_value, normalized_value
    FROM entry_search_values
    ORDER BY entry_id, field, source_type, source_id, source_position, value_type
  `).all().map((row) => ({ ...row }));
  const incremental = projection();
  repository.rebuildEntrySearchProjection(db, repository.dictionaryQueryContext(dictionaryId));
  assert.deepEqual(projection(), incremental, "incremental search projection matches a full rebuild");
}

async function checkMorphologyInput(repository) {
  const dictionaryId = "dict-split";
  const who = await repository.getEntry(dictionaryId, "who");
  const dictionary = await repository.exportDictionary(dictionaryId);
  assert.deepEqual(
    resolveAutomaticTemplateGroups(who, dictionary).map((group) => group.id),
    ["morph-noun"],
    "automatic morphology matches a part of speech stored on a definition",
  );
  const featureInput = repository.morphologyAnalysisFeatureInput(dictionaryId).entries.find((entry) => entry.id === "who");
  assert.deepEqual(featureInput.tags, ["adj", "n", "v"], "entry tags, then each definition's new tags");
  const db = repository.openDictionaryDatabase(dictionaryId);
  assert.ok(
    db.prepare("SELECT 1 FROM entry_morphology_search_values WHERE entry_id = 'who'").get(),
    "morphology search projection includes forms from definition-tag matches",
  );

  await repository.saveMorphology(dictionaryId, {
    ...dictionary.morphology,
    templateGroups: dictionary.morphology.templateGroups.map((group) => ({ ...group, matchTags: ["particle"] })),
  });
  assert.equal(
    db.prepare("SELECT 1 FROM entry_morphology_search_values WHERE entry_id = 'who'").get(),
    undefined,
    "a template change re-resolves entries matched through definition tags",
  );
}

async function checkQualityAndBatch(repository) {
  const dictionaryId = "dict-split";
  const issues = buildQualityIssues(repository.qualityInputRecords(dictionaryId));
  assert.deepEqual(
    issues.filter((issue) => issue.code === "missing_tags").map((issue) => issue.entryId),
    ["bare"],
    "missing_tags reads effective tags",
  );

  const dryRun = await repository.batchUpdateEntries(dictionaryId, { operation: "applyTagOrder", dryRun: true });
  assert.equal(dryRun.targetCount, 2, "definition tag lists out of order count as targets");
  await repository.batchUpdateEntries(dictionaryId, { operation: "applyTagOrder" });
  assert.deepEqual(
    (await repository.getEntry(dictionaryId, "who")).definitions.map((definition) => definition.tags),
    [["n", "adj"], ["v"]],
  );
  assert.deepEqual(
    (await repository.getEntry(dictionaryId, "dup")).definitions.map((definition) => definition.tags),
    [["n", "adj"], ["adj"]],
  );
  await assert.rejects(
    repository.patchEntries(dictionaryId, [{ id: "who", patch: { definitions: [] } }]),
    (error) => error.code === "unsupported_entry_patch_fields",
    "PATCH /entries still accepts only entry-level fields",
  );
}

async function checkJsonImport(repository) {
  const conversion = createDictionaryConversionService();
  const { dictionary } = conversion.importDictionaryFromJsonPayload({
    id: "dict-json-definition-tags",
    name: "JSON",
    entries: [{
      id: "entry-json",
      lemma: "json",
      tags: [],
      definitions: [
        { id: "def-json-tag-only", meaning: "", example: "", note: "", tags: ["n"] },
        { id: "def-json-legacy", meaning: "old" },
      ],
    }],
  });
  assert.deepEqual(
    dictionary.entries[0].definitions.map((definition) => [definition.id, definition.tags]),
    [["def-json-tag-only", ["n"]], ["def-json-legacy", []]],
    "JSON import keeps tag-only definitions and defaults missing tags to []",
  );
  await repository.importDictionarySnapshot(dictionary);
  const exported = await repository.exportDictionary(dictionary.id);
  assert.deepEqual(exported.entries[0].definitions[0].tags, ["n"]);
}

async function main() {
  requireSqliteRuntime("Definition tag check");
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-definition-tags-");
  try {
    await checkPlacementIndependence(repository);
    await checkSearch(repository);
    await checkMorphologyInput(repository);
    await checkQualityAndBatch(repository);
    await checkDtosAndPersistence(repository);
    await checkJsonImport(repository);
  } finally {
    await cleanup();
  }
  console.log("Definition tag checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
