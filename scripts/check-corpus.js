const assert = require("node:assert/strict");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");
const { importDictionaryFromJsonPayload } = require("../lib/dictionary-conversion-service");
const { CorpusQualityService } = require("../lib/corpus-quality-service");

const DICTIONARY_ID = "dict-corpus-check";

function legacyDictionary() {
  return {
    id: DICTIONARY_ID,
    name: "Corpus check",
    entries: [
      {
        id: "entry-wapm",
        lemma: "wapm",
        tags: ["v"],
        definitions: [
          { id: "def-see", meaning: "see", example: String.raw`\gla wapm -a\n\glb see 3acc\n\ft saw them` },
          { id: "def-watch", meaning: "watch", example: "" },
        ],
      },
      {
        id: "entry-derived",
        lemma: "wapmun",
        tags: ["n"],
        definitions: [{ id: "def-derived", meaning: "sight" }],
        etymology: { sources: [{ entryId: "entry-wapm", text: "wapm" }] },
      },
    ],
    corpus: {
      blocks: [
        {
          id: "block-story",
          title: "Story",
          notes: "told by K.",
          unitIds: ["unit-1"],
          layers: [{ id: "layer-main", name: "Main", speaker: "K", unitIds: ["unit-2", "unit-1"] }],
        },
        { id: "block-empty", title: "", notes: "empty block note", unitIds: [] },
      ],
      units: [
        { id: "unit-1", content: String.raw`\gla a b\n\glb A B`, tags: ["t1"] },
        { id: "unit-2", content: "plain", attributes: { place: "here" } },
        { id: "unit-3", content: "orphan" },
      ],
    },
  };
}

function examplesOf(entry) {
  return entry.definitions.map((definition) => definition.examples.map((example) => example.itemId));
}

async function main() {
  requireSqliteRuntime("corpus check");
  const temp = await createTempSqliteRepository("conlexicon-corpus-check-");
  try {
    const { repository } = temp;
    const { dictionary, report } = importDictionaryFromJsonPayload(legacyDictionary());

    // Legacy JSON: blocks become groups, units keep IDs and order, extra
    // structure becomes % comments, and examples become linked items.
    assert.ok(report.warnings.some((line) => line.includes("unit-1")), "a unit placed twice is reported");
    assert.deepEqual(dictionary.corpus.items.slice(0, 5).map(({ id, group, content }) => [id, group, content]), [
      ["unit-1", "Story", ["% 块备注：told by K.", "% 标签：t1", String.raw`\gla a b`, String.raw`\glb A B`].join("\n")],
      ["unit-2", "Story", ["% 层：Main · 发言人：K", "% 属性 place：here", "plain"].join("\n")],
      [dictionary.corpus.items[2].id, "未命名块 2", "% 块备注：empty block note"],
      ["unit-3", "", "orphan"],
      [dictionary.corpus.items[4].id, "", [String.raw`\gla wapm -a`, String.raw`\glb see 3acc`, String.raw`\ft saw them`].join("\n")],
    ]);
    const exampleItemId = dictionary.corpus.items[4].id;
    assert.deepEqual(examplesOf(dictionary.entries[0]), [[exampleItemId], []], "empty examples create no items");
    await repository.importDictionary(dictionary, { overwrite: true });

    assert.deepEqual((await repository.getCorpusGroups(DICTIONARY_ID)).groups, [
      { name: "Story", count: 2 },
      { name: "未命名块 2", count: 1 },
      { name: "", count: 2 },
    ]);
    const storyWindow = await repository.queryCorpusItems(DICTIONARY_ID, { group: "Story", limit: 1, offset: 1 });
    assert.deepEqual(storyWindow.items.map((item) => item.id), ["unit-2"]);
    assert.deepEqual(storyWindow.pageInfo, { total: 2, limit: 1, windowOffset: 1, hasMore: false });
    assert.deepEqual((await repository.queryCorpusItems(DICTIONARY_ID, { q: "here" })).items.map((item) => item.id), ["unit-2"],
      "corpus search includes comment lines");
    assert.deepEqual((await repository.queryCorpusItems(DICTIONARY_ID, { q: "3acc" })).items.map((item) => item.linkCount), [1]);

    const entry = await repository.getEntry(DICTIONARY_ID, "entry-wapm");
    assert.deepEqual(entry.definitions[0].examples, [{
      itemId: exampleItemId,
      content: [String.raw`\gla wapm -a`, String.raw`\glb see 3acc`, String.raw`\ft saw them`].join("\n"),
    }]);
    assert.equal((await repository.queryEntries(DICTIONARY_ID, { q: "3acc", fields: "examples" })).items.length, 1);

    // A new example written in the entry editor becomes an ungrouped item.
    const saved = await repository.saveEntry(DICTIONARY_ID, {
      ...entry,
      definitions: [entry.definitions[0], { ...entry.definitions[1], examples: [{ content: String.raw`new \textsc{sentence}` }] }],
    }, { requireExisting: true });
    const newItem = saved.entry.definitions[1].examples[0];
    assert.match(newItem.itemId, /^corpus-item-/);
    assert.equal(newItem.content, String.raw`new \textsc{sentence}`);
    assert.equal((await repository.queryEntries(DICTIONARY_ID, { q: "new sentence", fields: "examples" })).items.length, 1,
      "example search values have the inline markup removed");

    // Writes that rebuild an entry from the database keep its links.
    await repository.patchEntries(DICTIONARY_ID, [{ id: "entry-wapm", patch: { pronunciation: "/wapm/" } }]);
    await repository.batchUpdateEntries(DICTIONARY_ID, { operation: "generateIpa", mode: "all" });
    const renamed = await repository.getEntry(DICTIONARY_ID, "entry-wapm");
    await repository.saveEntry(DICTIONARY_ID, { ...renamed, lemma: "wapma" }, { requireExisting: true });
    assert.deepEqual(examplesOf(await repository.getEntry(DICTIONARY_ID, "entry-wapm")), [[exampleItemId], [newItem.itemId]],
      "patches, batch edits and a lemma rename that rewrites referencing entries keep the links");

    // Editing an item updates the search values of the entries linking to it.
    const edited = await repository.saveCorpusItem(DICTIONARY_ID, newItem.itemId, { name: "N", group: "Story", content: "changed text" });
    assert.equal(edited.item.group, "Story");
    assert.equal((await repository.queryEntries(DICTIONARY_ID, { q: "sentence", fields: "examples" })).items.length, 0);
    assert.equal((await repository.queryEntries(DICTIONARY_ID, { q: "changed", fields: "examples" })).items.length, 1);
    assert.deepEqual((await repository.getCorpusItem(DICTIONARY_ID, newItem.itemId)).location, { group: "Story", index: 2 },
      "a new group appends the item at its end");
    assert.deepEqual((await repository.getCorpusItemLinks(DICTIONARY_ID, newItem.itemId)).links.map((link) => [link.entryId, link.definitionPosition]),
      [["entry-wapm", 1]]);

    // A linked item is only deleted together with its links.
    await assert.rejects(repository.deleteCorpusItem(DICTIONARY_ID, newItem.itemId), (error) => (
      error.code === "corpus_item_linked" && error.details.links.length === 1
    ));
    assert.deepEqual((await repository.deleteCorpusItem(DICTIONARY_ID, newItem.itemId, { unlink: true })).entryIds, ["entry-wapm"]);
    assert.deepEqual(examplesOf(await repository.getEntry(DICTIONARY_ID, "entry-wapm")), [[exampleItemId], []]);
    assert.equal((await repository.queryEntries(DICTIONARY_ID, { q: "changed", fields: "examples" })).items.length, 0);
    await assert.rejects(repository.getCorpusItem(DICTIONARY_ID, newItem.itemId), (error) => error.code === "corpus_item_not_found");

    const withExample = await repository.queryEntries(DICTIONARY_ID, { filter: JSON.stringify({ presence: { example: true } }) });
    assert.deepEqual(withExample.items.map((item) => item.id), ["entry-wapm"]);

    // Export writes examples by item ID and imports back unchanged.
    const exported = await repository.exportDictionary(DICTIONARY_ID);
    assert.deepEqual(exported.entries.find((item) => item.id === "entry-wapm").definitions[0].examples, [{ itemId: exampleItemId }]);
    const roundTrip = importDictionaryFromJsonPayload({ ...exported, id: "dict-corpus-check-copy" }).dictionary;
    await repository.importDictionary(roundTrip, { overwrite: true });
    const reexported = await repository.exportDictionary("dict-corpus-check-copy");
    assert.deepEqual(reexported.corpus.items.map(({ id, group, content }) => [id, group, content]),
      exported.corpus.items.map(({ id, group, content }) => [id, group, content]));
    assert.throws(() => importDictionaryFromJsonPayload({
      name: "Broken",
      entries: [{ lemma: "x", definitions: [{ meaning: "x", examples: [{ itemId: "corpus-item-missing" }] }] }],
    }), (error) => error.code === "invalid_example_reference");

    // Corpus quality checks every item once.
    const quality = new CorpusQualityService({ repository });
    await repository.createCorpusItem(DICTIONARY_ID, { content: [String.raw`\gla a b`, String.raw`\glb A`, String.raw`\ft x`].join("\n") });
    await repository.createCorpusItem(DICTIONARY_ID, { content: [String.raw`\gla a //`, "stray", String.raw`\glb A //`, String.raw`\ft x`].join("\n") });
    await repository.createCorpusItem(DICTIONARY_ID, { content: [String.raw`\pex`, String.raw`\gla a`, String.raw`\glb A`, String.raw`\ft x`].join("\n") });
    const source = { type: "corpusQuality", version: 1 };
    const summary = await quality.query(DICTIONARY_ID, { source, responseMode: "summary" });
    assert.deepEqual(summary.summary.codes.map((row) => [row.key, row.itemCount]), [
      ["gloss_unparsed", 1],
      ["gloss_incomplete", 1],
      ["gloss_alignment_mismatch", 1],
      ["gloss_unknown_command", 1],
    ]);
    const mismatch = await quality.query(DICTIONARY_ID, {
      source,
      view: { itemKind: "corpusItem", selector: { group: "code", value: "gloss_alignment_mismatch" } },
    });
    assert.deepEqual(mismatch.items.map(({ issues }) => issues.map((issue) => issue.params)), [[{ glaCount: 2, glbCount: 1 }]]);
    await assert.rejects(quality.query(DICTIONARY_ID, { source, view: { itemKind: "entry" } }),
      (error) => error.code === "invalid_quality_item_kind");

    console.log("Corpus checks passed.");
  } finally {
    await temp.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
