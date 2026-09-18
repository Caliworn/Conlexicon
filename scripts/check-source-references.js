const assert = require("node:assert/strict");
const { normalizeDictionary } = require("../lib/dictionary-model");
const { parseLegacyJsonDictionary, exportDictionarySnapshot } = require("../lib/dictionary-conversion-service");
const { buildQualityReport } = require("../lib/quality-model");
const { normalizeSourceReferences } = require("../lib/source-reference-model");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");

async function main() {
  requireSqliteRuntime("source reference contract");
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-source-references-");
  try {
    const conversion = parseLegacyJsonDictionary({
      id: "dict-source-references",
      entries: [
        { id: "leaf", lemma: "leaf", etymology: { sources: ["Root", "same", "missing"] } },
        { id: "root", lemma: "Root" },
        { id: "same-a", lemma: "same" },
        { id: "same-b", lemma: "same" },
      ],
    });
    const expected = [
      { entryId: "root", text: "Root" },
      { entryId: "", text: "same" },
      { entryId: "", text: "missing" },
    ];
    assert.deepEqual(conversion.dictionary.entries[0].etymology.sources, expected);
    assert.ok(conversion.report.warnings.some((value) => value.includes("ambiguous")));
    assert.ok(conversion.report.warnings.some((value) => value.includes("unresolved")));
    assert.throws(() => normalizeDictionary({ entries: [{ etymology: { sources: ["Root"] } }] }),
      (error) => error.code === "invalid_source_reference", "string conversion belongs only to JSON import");
    assert.throws(() => normalizeDictionary({ entries: [{ etymology: { sources: [
      { entryId: "root", text: "Root" }, { entryId: " root ", text: "stale label" },
    ] } }] }), (error) => error.code === "duplicate_source_target" && error.status === 400);
    const previouslyStored = [{ entryId: "root", text: "Root" }, { entryId: "root", text: "Root" }];
    assert.deepEqual(normalizeSourceReferences(previouslyStored, { allowDuplicateTargets: true }), previouslyStored,
      "read-side normalization preserves existing duplicates so they can be removed explicitly");
    const mixed = [{ entryId: "", text: "first text" }, { entryId: "same-b", text: "same" },
      { entryId: "", text: "second text" }, { entryId: "same-a", text: "same" }];
    const mixedBefore = structuredClone(mixed);
    const grouped = [mixed[1], mixed[3], mixed[0], mixed[2]];
    assert.deepEqual(normalizeSourceReferences(mixed), grouped, "bound references precede text with stable internal order");
    assert.deepEqual(mixed, mixedBefore, "normalization does not mutate the editor draft");
    const repeatedImport = parseLegacyJsonDictionary({ entries: [
      { id: "root", lemma: "Root" },
      { id: "other", lemma: "Root" },
      { id: "leaf", lemma: "leaf", etymology: { sources: [
        "root", { entryId: "root", text: "old" }, "root",
        { entryId: "other", text: "Root" },
        { entryId: "", text: "Root" }, { entryId: "", text: "Root" },
      ] } },
    ] });
    assert.deepEqual(repeatedImport.dictionary.entries[2].etymology.sources, [
      { entryId: "root", text: "Root" }, { entryId: "other", text: "Root" },
      { entryId: "", text: "Root" }, { entryId: "", text: "Root" },
    ], "import keeps first target, distinct homonyms and all plain text items in order");
    assert.equal(repeatedImport.report.repairs.filter((value) => value.includes("duplicate source reference removed")).length, 2);
    const legacyId = parseLegacyJsonDictionary({ entries: [
      { id: "owner", lemma: "owner", etymology: { sources: ["target"], sourceEntryId: "target" } },
      { id: "target", lemma: "other spelling" },
      { id: "namesake", lemma: "target" },
    ] });
    assert.deepEqual(legacyId.dictionary.entries[0].etymology.sources,
      [{ entryId: "target", text: "other spelling" }], "legacy exact IDs take precedence without duplicating sourceEntryId");

    await repository.importDictionarySnapshot(conversion.dictionary);
    const id = conversion.dictionary.id;
    let leaf = await repository.getEntry(id, "leaf");
    assert.deepEqual(leaf.etymology.sources, expected);
    await assert.rejects(() => repository.saveEntry(id, {
      ...leaf, etymology: { sources: [{ entryId: leaf.id, text: "not its lemma" }] },
    }), (error) => error.code === "self_source_reference" && error.status === 400);
    assert.deepEqual(await repository.getEntry(id, "leaf"), leaf, "self-reference rejection leaves the entry unchanged");
    for (const sources of [[{ entryId: "self", text: "Self" }], ["self"], ["Self"]]) {
      assert.throws(() => parseLegacyJsonDictionary({ entries: [{ id: "self", lemma: "Self", etymology: { sources } }] }),
        (error) => error.code === "self_source_reference", "both current and legacy imports reject self references");
    }
    assert.doesNotThrow(() => normalizeDictionary({ entries: [
      { id: "self", lemma: "Same", etymology: { sources: [{ entryId: "other", text: "Same" }, { entryId: "", text: "Same" }] } },
      { id: "other", lemma: "Same" },
    ] }), "same spelling does not imply self-reference");
    await assert.rejects(() => repository.saveEntry(id, {
      ...leaf, lemma: "must not be saved", etymology: { sources: [expected[0], { ...expected[0], text: "different label" }] },
    }), (error) => error.code === "duplicate_source_target");
    assert.deepEqual(await repository.getEntry(id, "leaf"), leaf, "duplicate rejection leaves the stored entry unchanged");
    let relations = await repository.getEntryRelations(id, "leaf");
    assert.deepEqual(relations.sources.map((source) => source.matchedEntryId), ["root", "", ""]);

    // Explicitly selecting the second homonym is never rebound to the first.
    leaf.etymology.sources[1] = { entryId: "same-b", text: "same" };
    await repository.saveEntry(id, leaf);
    relations = await repository.getEntryRelations(id, "leaf");
    assert.equal(relations.sources[1].matchedEntryId, "same-b");
    const root = await repository.getEntry(id, "root");
    await repository.saveEntry(id, { ...root, lemma: "RenamedRoot" });
    leaf = await repository.getEntry(id, "leaf");
    assert.deepEqual(leaf.etymology.sources[0], { entryId: "root", text: "RenamedRoot" });
    assert.equal((await repository.getEntryRelations(id, "leaf")).sources[0].matchedEntryId, "root");
    assert.ok((await repository.getEntryRelations(id, "root")).derivedEntries.some((entry) => entry.id === "leaf"));
    const db = repository.openDictionaryDatabase(id);
    assert.equal(db.prepare("SELECT raw_value FROM entry_search_values WHERE entry_id = 'leaf' AND source_type = 'etymologySource' AND source_position = 0").get().raw_value, "RenamedRoot");

    // A stale editor may send an old label, but the server refreshes it from the target.
    leaf.etymology.sources[0].text = "Root";
    await repository.saveEntry(id, leaf);
    assert.equal((await repository.getEntry(id, "leaf")).etymology.sources[0].text, "RenamedRoot");
    const invalid = { ...leaf, etymology: { sources: [{ entryId: "absent", text: "absent" }] } };
    await assert.rejects(() => repository.saveEntry(id, invalid), (error) => error.code === "invalid_source_target");
    assert.equal((await repository.getEntry(id, "leaf")).etymology.sources.length, 3);

    await repository.deleteEntry(id, "root");
    leaf = await repository.getEntry(id, "leaf");
    assert.deepEqual(leaf.etymology.sources[0], { entryId: "same-b", text: "same" });
    assert.deepEqual(leaf.etymology.sources[1], { entryId: "", text: "RenamedRoot" }, "deleted target moves behind linked sources without losing text");
    await repository.saveEntry(id, { id: "replacement", lemma: "RenamedRoot", etymology: { sources: [] } });
    assert.equal((await repository.getEntryRelations(id, "leaf")).sources[1].matchedEntryId, "");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);

    const snapshot = await repository.getDictionarySnapshot(id);
    const roundtrip = parseLegacyJsonDictionary(exportDictionarySnapshot(snapshot).payload).dictionary;
    assert.deepEqual(roundtrip.entries.find((entry) => entry.id === "leaf").etymology.sources, leaf.etymology.sources);
    await repository.importDictionarySnapshot(roundtrip);
    assert.deepEqual((await repository.getEntry(id, "leaf")).etymology.sources, leaf.etymology.sources);

    await repository.saveEntry(id, { id: "ordered", lemma: "ordered", etymology: { sources: mixed } });
    assert.deepEqual((await repository.getEntry(id, "ordered")).etymology.sources, grouped);
    const reordered = [grouped[1], grouped[0], ...grouped.slice(2)];
    await repository.saveEntry(id, { id: "ordered", lemma: "ordered", etymology: { sources: reordered } });
    assert.deepEqual((await repository.getEntry(id, "ordered")).etymology.sources, reordered, "reordering references preserves text order");
    assert.deepEqual((await repository.getEntryRelations(id, "ordered")).sources.map((source) => source.matchedEntryId),
      ["same-a", "same-b", "", ""]);
    const reorderedExport = parseLegacyJsonDictionary(exportDictionarySnapshot(await repository.getDictionarySnapshot(id)).payload).dictionary;
    assert.deepEqual(reorderedExport.entries.find((entry) => entry.id === "ordered").etymology.sources, reordered);

    // Deferred foreign keys permit forward references and cycles during a full import.
    const cycle = normalizeDictionary({ id: "dict-cycle-references", entries: [
      { id: "a", lemma: "a", etymology: { sources: [{ entryId: "b", text: "b" }] } },
      { id: "b", lemma: "b", etymology: { sources: [{ entryId: "a", text: "a" }] } },
    ] });
    await repository.importDictionarySnapshot(cycle);
    assert.equal(buildQualityReport(await repository.getDictionarySnapshot(cycle.id)).issues.filter((issue) => issue.code === "source_cycle").length, 2);
    await repository.saveEntry(id, { id: "binding-owner", lemma: "owner", etymology: { sources: [
      { entryId: "same-b", text: "same" }, { entryId: "", text: "new source" }, { entryId: "", text: "new source" },
    ] } });
    const owner = await repository.getEntry(id, "binding-owner");
    const binding = { ownerEntryId: owner.id, sourcePosition: 2, expectedUpdatedAt: owner.updatedAt, expectedSources: owner.etymology.sources };
    const sourceResult = await repository.saveEntry(id, { id: "created-source", lemma: "renamed during draft" }, { createOnly: true, sourceBinding: binding });
    assert.deepEqual(sourceResult.ownerEntry.etymology.sources, [
      { entryId: "same-b", text: "same" }, { entryId: "created-source", text: "renamed during draft" }, { entryId: "", text: "new source" },
    ], "only the selected text occurrence is replaced; new reference follows existing cards");
    assert.ok((await repository.getEntryRelations(id, "created-source")).derivedEntries.some((item) => item.id === owner.id));
    await assert.rejects(() => repository.saveEntry(id, { id: "conflicting-create", lemma: "must roll back" }, { createOnly: true, sourceBinding: binding }),
      (error) => error.code === "source_binding_conflict");
    assert.equal(await repository.getEntry(id, "conflicting-create"), null);
    assert.deepEqual(await repository.getEntry(id, owner.id), sourceResult.ownerEntry);
    const freshBinding = { ...binding, sourcePosition: 2, expectedUpdatedAt: sourceResult.ownerEntry.updatedAt, expectedSources: sourceResult.ownerEntry.etymology.sources };
    await assert.rejects(() => repository.saveEntry(id, { id: "invalid-binding-create", lemma: "invalid" }, {
      createOnly: true, sourceBinding: { ...freshBinding, sourcePosition: -1 },
    }), (error) => error.code === "invalid_source_binding");
    assert.equal(await repository.getEntry(id, "invalid-binding-create"), null);
    await assert.rejects(() => repository.saveEntry(id, { id: "missing-owner-create", lemma: "missing" }, {
      createOnly: true, sourceBinding: { ...freshBinding, ownerEntryId: "missing-owner" },
    }), (error) => error.code === "source_binding_conflict");
    assert.equal(await repository.getEntry(id, "missing-owner-create"), null);
    const writeProjection = repository.writeEntryProjection;
    repository.writeEntryProjection = function (...args) {
      if (args[1].id === owner.id) throw new Error("simulated binding write failure");
      return writeProjection.apply(this, args);
    };
    try {
      await assert.rejects(() => repository.saveEntry(id, { id: "failed-create", lemma: "rollback" }, { createOnly: true, sourceBinding: freshBinding }), /simulated binding write failure/);
    } finally { repository.writeEntryProjection = writeProjection; }
    assert.equal(await repository.getEntry(id, "failed-create"), null);
    assert.deepEqual(await repository.getEntry(id, owner.id), sourceResult.ownerEntry);
    await repository.saveEntry(id, { id: "derived-created", lemma: "derived", etymology: { sources: [{ entryId: "same-b", text: "same" }] } }, { createOnly: true });
    assert.equal((await repository.getEntryRelations(id, "derived-created")).sources[0].matchedEntryId, "same-b");
    assert.ok((await repository.getEntryRelations(id, "same-b")).derivedEntries.some((item) => item.id === "derived-created"));
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    console.log("Source reference model, import, rename, deletion, atomic creation, derived links, search and graph checks passed.");
  } finally {
    await cleanup();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
