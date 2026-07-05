const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const {
  SQLITE_SCHEMA_VERSION,
  SqliteDictionaryRepository,
} = require("../lib/sqlite-dictionary-repository");

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

async function main() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log("SQLite runtime unavailable; skeleton check skipped.");
    return;
  }

  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-sqlite-check-"));
  const repository = new SqliteDictionaryRepository({
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  });

  try {
    await repository.ensureDataStore();
    assert.deepEqual(await repository.readIndex(), {
      activeDictionaryId: "",
      dictionaryIds: [],
      uiLanguage: "zh",
      uiTheme: "light",
    });

    const initialized = await repository.initializeDictionaryDatabase("dict-sqlite-skeleton", {
      name: "SQLite Skeleton",
      language: "test",
      description: "schema smoke",
    });
    assert.equal(initialized.schemaVersion, SQLITE_SCHEMA_VERSION);

    const stat = await fs.stat(initialized.path);
    assert.equal(stat.isFile(), true);

    const db = repository.openDictionaryDatabase("dict-sqlite-skeleton");
    const meta = {
      ...db.prepare("SELECT id, name, language, schema_version AS schemaVersion FROM dictionary_meta").get(),
    };
    assert.deepEqual(meta, {
      id: "dict-sqlite-skeleton",
      name: "SQLite Skeleton",
      language: "test",
      schemaVersion: SQLITE_SCHEMA_VERSION,
    });

    const tableNames = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all().map((row) => row.name);
    assert.equal(tableNames.includes("entries"), true);
    assert.equal(tableNames.includes("entry_sources"), true);
    assert.equal(tableNames.includes("module_blobs"), true);
    assert.equal(tableNames.includes("schema_migrations"), true);
    assert.equal(tableNames.includes("dictionary_settings"), false);
    assert.equal(tableNames.includes("ipa_rules"), false);
    assert.equal(tableNames.includes("morphology_tables"), false);
    assert.equal(tableNames.includes("corpus_units"), false);

    await assert.rejects(
      () => repository.initializeDictionaryDatabase("bad id"),
      (error) => error.status === 400 && error.code === "invalid_dictionary_id",
    );

    const sourceDictionary = normalizeDictionary({
      id: "dict-sqlite-roundtrip",
      name: "SQLite Roundtrip",
      language: "test-lang",
      description: "roundtrip check",
      settings: {
        manualPartOfSpeechTags: true,
        partOfSpeechTags: ["n", "v"],
        tagDisplayMap: { n: "noun" },
      },
      docs: { markdown: "# Notes" },
      corpus: { units: [{ id: "corpus-unit-roundtrip", content: "unit" }] },
      morphology: { tables: [{ id: "morph-roundtrip", name: "Nouns" }] },
      entries: [
        {
          id: "entry-root",
          lemma: "root",
          pronunciation: "/root/",
          tags: ["n", "root-tag"],
          definitions: [{ id: "def-root", meaning: "root meaning", example: "root example", note: "root note" }],
          notes: "entry note",
          morphology: { tableId: "morph-roundtrip", overrides: { "0,0": "root-form" } },
        },
        {
          id: "entry-derived",
          lemma: "derived",
          tags: ["v"],
          definitions: [{ id: "def-derived", meaning: "derived meaning" }],
          etymology: { sources: ["root"], description: "derived from root" },
        },
      ],
    });

    await repository.importDictionarySnapshot(sourceDictionary);
    const exported = repository.exportDictionarySnapshot(sourceDictionary.id);
    assert.deepEqual(exported, sourceDictionary);

    const dbRoundtrip = repository.openDictionaryDatabase(sourceDictionary.id);
    assert.equal(
      dbRoundtrip.prepare("SELECT COUNT(*) AS count FROM entries").get().count,
      sourceDictionary.entries.length,
    );
    assert.equal(
      dbRoundtrip.prepare("SELECT COUNT(*) AS count FROM definitions").get().count,
      2,
    );
    assert.equal(
      dbRoundtrip.prepare("SELECT COUNT(*) AS count FROM entry_tags WHERE normalized_tag = 'n'").get().count,
      1,
    );
    assert.equal(
      dbRoundtrip.prepare("SELECT source_key FROM entry_sources WHERE entry_id = 'entry-derived'").get().source_key,
      "root",
    );

    const first = await repository.createDictionary(normalizeDictionary({
      id: "dict-sqlite-first",
      name: "First",
      language: "one",
    }));
    const second = await repository.createDictionary(normalizeDictionary({
      id: "dict-sqlite-second",
      name: "Second",
      language: "two",
    }));
    let state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [
      "dict-sqlite-roundtrip",
      first.id,
      second.id,
    ]);
    const roundtripMeta = state.dictionaries.find((dictionary) => dictionary.id === sourceDictionary.id);
    assert.equal(roundtripMeta.entries, undefined);
    assert.deepEqual(roundtripMeta.summary, { entryCount: 2, rootCount: 1 });
    assert.deepEqual(state.dictionaries.find((dictionary) => dictionary.id === first.id).summary, { entryCount: 0, rootCount: 0 });

    await repository.activateDictionary(first.id);
    state = await repository.readState();
    assert.equal(state.activeDictionaryId, first.id);
    assert.equal((await repository.exportDictionary()).id, first.id);
    assert.deepEqual(await repository.listDictionaries(), state.dictionaries);
    assert.equal((await repository.getDictionarySnapshot(second.id)).name, "Second");

    assert.deepEqual((await repository.queryEntries(first.id)).map((entry) => entry.id), first.entries.map((entry) => entry.id));
    const savedWithNewEntry = await repository.saveEntry(first.id, {
      lemma: "new sqlite entry",
      definitions: [{ meaning: "new sqlite meaning" }],
    });
    const newEntry = savedWithNewEntry.entries.at(-1);
    assert.match(newEntry.id, /^entry-/);
    assert.equal((await repository.getEntry(first.id, newEntry.id)).lemma, "new sqlite entry");
    assert.equal(
      repository.openDictionaryDatabase(first.id).prepare("SELECT meaning FROM definitions WHERE entry_id = ?").get(newEntry.id).meaning,
      "new sqlite meaning",
    );
    const savedWithUpdatedEntry = await repository.saveEntry(first.id, {
      ...newEntry,
      lemma: "updated sqlite entry",
      tags: ["n", "sqlite"],
    });
    assert.equal(savedWithUpdatedEntry.entries.find((entry) => entry.id === newEntry.id).lemma, "updated sqlite entry");
    assert.equal((await repository.getEntry(first.id, newEntry.id)).tags[1], "sqlite");
    await repository.deleteEntry(first.id, newEntry.id);
    assert.equal(await repository.getEntry(first.id, newEntry.id), null);
    await assert.rejects(
      () => repository.deleteEntry(first.id, newEntry.id),
      (error) => error.status === 404 && error.code === "entry_not_found",
    );

    await repository.saveEntry(first.id, {
      id: "entry-sqlite-root",
      lemma: "sqlite root",
      tags: ["n", "root"],
      definitions: [{ id: "def-sqlite-root", meaning: "root searchable" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    await repository.saveEntry(first.id, {
      id: "entry-sqlite-derived",
      lemma: "sqlite derived",
      tags: ["v", "derived"],
      definitions: [{ id: "def-sqlite-derived", meaning: "derived searchable" }],
      etymology: { sources: ["sqlite root"], description: "" },
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    let queryResult = await repository.queryEntries(first.id, { q: "derived searchable", include: "summary" });
    assert.deepEqual(queryResult.items.map((entry) => entry.id), ["entry-sqlite-derived"]);
    assert.equal(queryResult.items[0].definitionPreview, "derived searchable");
    queryResult = await repository.queryEntries(first.id, { part: "v" });
    assert.deepEqual(queryResult.items.map((entry) => entry.id), ["entry-sqlite-derived"]);
    queryResult = await repository.queryEntries(first.id, { tags: "derived", tagMode: "all" });
    assert.deepEqual(queryResult.items.map((entry) => entry.id), ["entry-sqlite-derived"]);
    queryResult = await repository.queryEntries(first.id, { derivedFrom: "sqlite root" });
    assert.deepEqual(queryResult.items.map((entry) => entry.id), ["entry-sqlite-derived"]);
    queryResult = await repository.queryEntries(first.id, { sort: "updatedDesc", include: "full" });
    assert.equal(queryResult.items[0].id, "entry-sqlite-derived");
    queryResult = await repository.queryEntries(first.id, { sort: "lemmaAsc", limit: 1 });
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.pageInfo.hasMore, true);
    assert.ok(queryResult.pageInfo.nextCursor);
    const secondPage = await repository.queryEntries(first.id, { sort: "lemmaAsc", cursor: queryResult.pageInfo.nextCursor, limit: 100 });
    assert.equal(secondPage.pageInfo.hasMore, false);
    const facets = await repository.getEntryFacets(first.id);
    assert.deepEqual(facets.parts.map((part) => part.tag), ["n", "v"]);
    assert.equal(facets.parts.find((part) => part.tag === "n").displayLabel, "n");
    assert.equal(facets.tags.find((tag) => tag.tag === "derived").count, 1);
    assert.equal(facets.tags.find((tag) => tag.tag === "n").isPartOfSpeech, true);
    assert.equal(facets.noPartOfSpeechCount, 0);
    let relations = await repository.getEntryRelations(first.id, "entry-sqlite-root");
    assert.deepEqual(relations.derivedEntries.map((entry) => entry.id), ["entry-sqlite-derived"]);
    relations = await repository.getEntryRelations(first.id, "entry-sqlite-derived");
    assert.equal(relations.sources[0].matchedEntryId, "entry-sqlite-root");
    assert.deepEqual(relations.rootGroup.entries.map((entry) => entry.id), ["entry-sqlite-root", "entry-sqlite-derived"]);
    await assert.rejects(
      () => repository.getEntryRelations(first.id, "missing-entry"),
      (error) => error.status === 404 && error.code === "entry_not_found",
    );
    let rootGroups = await repository.queryRootGroups(first.id, { q: "derived searchable", limit: 100 });
    assert.equal(rootGroups.items.length, 1);
    assert.equal(rootGroups.items[0].root.id, "entry-sqlite-root");
    assert.deepEqual(rootGroups.items[0].derivedEntries.map((entry) => entry.id), ["entry-sqlite-derived"]);
    assert.deepEqual(rootGroups.items[0].matchedDerivedIds, ["entry-sqlite-derived"]);
    await repository.saveEntry(first.id, {
      id: "entry-sqlite-isolated",
      lemma: "sqlite isolated",
      tags: ["n"],
      definitions: [{ id: "def-sqlite-isolated", meaning: "isolated root" }],
    });
    rootGroups = await repository.queryRootGroups(first.id, { sort: "lemmaAsc", limit: 1 });
    assert.equal(rootGroups.items.length, 1);
    assert.equal(rootGroups.pageInfo.hasMore, true);
    assert.ok(rootGroups.pageInfo.nextCursor);
    const nextRootGroups = await repository.queryRootGroups(first.id, {
      sort: "lemmaAsc",
      cursor: rootGroups.pageInfo.nextCursor,
      limit: 100,
    });
    assert.equal(nextRootGroups.pageInfo.hasMore, false);
    rootGroups = await repository.queryRootGroups(first.id, { q: "derived searchable", include: "full" });
    assert.equal(rootGroups.items[0].derivedEntries[0].definitions[0].meaning, "derived searchable");

    const renamed = await repository.updateMetadata(first.id, {
      name: "First renamed",
      language: "renamed",
      description: "metadata update",
    });
    assert.equal(renamed.name, "First renamed");
    assert.equal(repository.exportDictionarySnapshot(first.id).language, "renamed");

    const withIpa = await repository.updateIpaSettings(first.id, {
      mappings: [{ id: "ipa-sqlite-a", from: "a", to: "ɑ" }],
    });
    assert.equal(withIpa.settings.ipa.mappings[0].to, "ɑ");
    const withSettings = await repository.updateSettings(first.id, {
      allowEmptyTags: false,
      ipa: { mappings: [{ id: "ipa-ignored", from: "x", to: "x" }] },
    });
    assert.equal(withSettings.settings.allowEmptyTags, false);
    assert.equal(withSettings.settings.ipa.mappings[0].to, "ɑ");

    const withDocs = await repository.saveDocs(first.id, { markdown: "# SQLite docs" });
    assert.equal(withDocs.docs.markdown, "# SQLite docs");
    const withCorpus = await repository.saveCorpusChanges(first.id, { units: [{ id: "corpus-unit-sqlite", content: "sqlite corpus" }] });
    assert.equal((await repository.queryCorpusUnits(first.id))[0].content, "sqlite corpus");
    assert.equal(withCorpus.corpus.units[0].id, "corpus-unit-sqlite");
    const withMorphology = await repository.saveMorphology(first.id, { tables: [{ id: "morph-sqlite", name: "SQLite Morph" }] });
    assert.equal(withMorphology.morphology.tables[0].name, "SQLite Morph");
    await assert.rejects(
      () => repository.saveMorphology(first.id, {
        tables: [{ name: "Broken", rows: 1, cols: 1, cells: { "0,0": { value: "{a}" } } }],
      }),
      (error) => error.status === 400 && error.code === "invalid_morphology_payload",
    );
    const blobModules = repository.openDictionaryDatabase(first.id)
      .prepare("SELECT module FROM module_blobs ORDER BY module")
      .all()
      .map((row) => row.module);
    assert.deepEqual(blobModules, ["corpus", "docs", "morphology", "settings"]);

    await assert.rejects(
      () => repository.importDictionary({ ...first, name: "Duplicate" }),
      (error) => error.status === 409 && error.code === "dictionary_id_exists",
    );
    const overwritten = await repository.importDictionary({ ...first, name: "First overwritten" }, { overwrite: true });
    assert.equal(overwritten.name, "First overwritten");
    assert.equal((await repository.exportDictionary(first.id)).name, "First overwritten");

    const regenerated = await withPatchedRandomUUID(
      ["sqlite-regenerated"],
      () => repository.importDictionary({ id: "bad id", name: "Regenerated" }, { regenerateId: true }),
    );
    assert.equal(regenerated.id, "dict-sqlite-regenerated");
    await assert.rejects(
      () => repository.importDictionary({ id: "bad id", name: "Bad" }),
      (error) => error.status === 400 && error.code === "invalid_dictionary_id",
    );

    const preferences = await repository.updatePreferences({ uiLanguage: "en", uiTheme: "dark" });
    assert.deepEqual(preferences, { uiLanguage: "en", uiTheme: "dark" });
    state = await repository.readState();
    assert.equal(state.uiLanguage, "en");
    assert.equal(state.uiTheme, "dark");

    await repository.deleteDictionary(first.id);
    state = await repository.readState();
    assert.equal(state.dictionaries.some((dictionary) => dictionary.id === first.id), false);
    await assert.rejects(
      () => repository.activateDictionary(first.id),
      (error) => error.status === 404 && error.code === "dictionary_not_found",
    );
  } finally {
    repository.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }

  console.log("SQLite repository skeleton checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
