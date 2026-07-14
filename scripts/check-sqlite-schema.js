const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const {
  createTempSqliteRepository,
  sampleSqliteDictionary,
  sqliteRuntimeUnavailableMessage,
} = require("./sqlite-check-utils");

async function runSqliteSchemaCheck() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log(sqliteRuntimeUnavailableMessage("schema check"));
    return;
  }

  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-sqlite-schema-");
  try {
    await repository.ensureDataStore();
    const initialized = await repository.initializeDictionaryDatabase("dict-sqlite-schema", {
      name: "SQLite Schema",
      language: "test",
      description: "schema smoke",
    });
    assert.equal((await fs.stat(initialized.path)).isFile(), true);

    const db = repository.openDictionaryDatabase("dict-sqlite-schema");
    const tables = new Set(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
    `).all().map((row) => row.name));
    [
      "dictionary_meta",
      "module_blobs",
      "entries",
      "definitions",
      "entry_tags",
      "entry_sources",
      "morphology_template_groups",
      "morphology_template_tables",
      "morphology_template_cells",
      "entry_morphology_groups",
      "entry_morphology_cell_overrides",
    ].forEach((table) => assert.equal(tables.has(table), true, `missing table: ${table}`));
    ["schema_migrations", "dictionary_settings", "ipa_rules", "morphology_tables", "entry_morphology_tables", "corpus_units"]
      .forEach((table) => assert.equal(tables.has(table), false, `unexpected table: ${table}`));

    const entryColumns = new Set(db.prepare("PRAGMA table_info(entries)").all().map((row) => row.name));
    ["id", "position", "lemma", "pronunciation", "notes", "etymology_description", "morphology_mode", "created_at", "updated_at", "sort_key"]
      .forEach((column) => assert.equal(entryColumns.has(column), true, `missing entries column: ${column}`));
    assert.equal(entryColumns.has("entry_json"), false);
    const entryTagColumns = new Set(db.prepare("PRAGMA table_info(entry_tags)").all().map((row) => row.name));
    ["entry_id", "position", "tag"].forEach((column) => assert.equal(entryTagColumns.has(column), true, `missing entry_tags column: ${column}`));
    assert.equal(entryTagColumns.has("normalized_tag"), false);
    const entryMorphologyGroupColumns = new Set(db.prepare("PRAGMA table_info(entry_morphology_groups)").all().map((row) => row.name));
    ["entry_id", "position", "template_group_id", "title", "notes", "created_at", "updated_at"]
      .forEach((column) => assert.equal(entryMorphologyGroupColumns.has(column), true, `missing entry morphology group column: ${column}`));
    assert.equal(entryMorphologyGroupColumns.has("id"), false);
    const entryMorphologyOverrideColumns = new Set(db.prepare("PRAGMA table_info(entry_morphology_cell_overrides)").all().map((row) => row.name));
    ["entry_id", "template_group_id", "template_table_id", "row_index", "column_index", "value"]
      .forEach((column) => assert.equal(entryMorphologyOverrideColumns.has(column), true, `missing entry morphology override column: ${column}`));
    assert.equal(entryMorphologyOverrideColumns.has("entry_morphology_group_id"), false);

    const sourceDictionary = sampleSqliteDictionary();
    await repository.importDictionarySnapshot(sourceDictionary);
    const savedMetadata = await repository.updateMetadata(sourceDictionary.id, {
      name: "SQLite Schema Updated",
      language: "test",
      description: "metadata response smoke",
    });
    assert.deepEqual(Object.keys(savedMetadata).sort(), ["createdAt", "description", "id", "language", "name", "updatedAt"]);
    assert.equal(Object.hasOwn(savedMetadata, "entries"), false);
    assert.equal(savedMetadata.name, "SQLite Schema Updated");

    const dictionaryMetadata = await repository.getDictionaryMeta(sourceDictionary.id);
    assert.deepEqual(Object.keys(dictionaryMetadata).sort(), ["createdAt", "description", "id", "language", "name", "summary", "updatedAt"]);
    assert.equal(Object.hasOwn(dictionaryMetadata, "entries"), false);
    assert.equal(dictionaryMetadata.summary.entryCount, sourceDictionary.entries.length);

    const savedSettings = await repository.updateSettings(sourceDictionary.id, { entryListTagDisplayLimit: 4 });
    assert.deepEqual(Object.keys(savedSettings).sort(), ["id", "settings", "updatedAt"]);
    assert.equal(Object.hasOwn(savedSettings, "entries"), false);
    assert.equal(savedSettings.settings.entryListTagDisplayLimit, 4);

    const savedIpaSettings = await repository.updateIpaSettings(sourceDictionary.id, {
      mappings: [{ from: "a", to: "ɑ" }],
    });
    assert.deepEqual(Object.keys(savedIpaSettings).sort(), ["id", "settings", "updatedAt"]);
    assert.equal(Object.hasOwn(savedIpaSettings, "entries"), false);
    assert.equal(savedIpaSettings.settings.ipa.mappings[0].to, "ɑ");

    const savedDocs = await repository.saveDocs(sourceDictionary.id, { markdown: "# SQLite docs" });
    assert.deepEqual(Object.keys(savedDocs).sort(), ["docs", "id", "updatedAt"]);
    assert.equal(Object.hasOwn(savedDocs, "entries"), false);
    assert.equal(savedDocs.docs.markdown, "# SQLite docs");

    const savedCorpus = await repository.saveCorpusChanges(sourceDictionary.id, {
      units: [{ content: "SQLite corpus" }],
    });
    assert.deepEqual(Object.keys(savedCorpus).sort(), ["corpus", "id", "updatedAt"]);
    assert.equal(Object.hasOwn(savedCorpus, "entries"), false);
    assert.equal(savedCorpus.corpus.units[0].content, "SQLite corpus");

    const savedMorphology = await repository.saveMorphology(sourceDictionary.id, sourceDictionary.morphology);
    assert.deepEqual(Object.keys(savedMorphology).sort(), ["id", "morphology", "updatedAt"]);
    assert.equal(Object.hasOwn(savedMorphology, "entries"), false);
    assert.equal(savedMorphology.morphology.templateGroups[0].id, "morph-roundtrip");

    const patchedEntries = await repository.patchEntries(sourceDictionary.id, [{
      id: "entry-root",
      patch: { pronunciation: "/patched/" },
    }], {
      settings: { entryListTagDisplayLimit: 5 },
    });
    assert.deepEqual(Object.keys(patchedEntries).sort(), ["entries", "id", "settings", "updatedAt"]);
    assert.equal(patchedEntries.entries.length, 1);
    assert.equal(patchedEntries.entries[0].id, "entry-root");
    assert.equal(patchedEntries.entries[0].pronunciation, "/patched/");
    assert.equal(patchedEntries.settings.entryListTagDisplayLimit, 5);
    assert.equal(Object.hasOwn(patchedEntries, "name"), false);

    const exported = repository.exportDictionarySnapshot(sourceDictionary.id);
    assert.equal(exported.id, sourceDictionary.id);
    assert.equal(exported.entries.length, sourceDictionary.entries.length);
    assert.equal(exported.morphology.templateGroups[0].id, "morph-roundtrip");
    assert.equal(exported.morphology.templateGroups[0].tables[0].title, "Nouns");
    assert.equal(Object.hasOwn(exported.morphology, "tables"), false);

    const roundtripDb = repository.openDictionaryDatabase(sourceDictionary.id);
    assert.equal(roundtripDb.prepare("SELECT COUNT(*) AS count FROM entries").get().count, 2);
    assert.equal(roundtripDb.prepare("SELECT COUNT(*) AS count FROM definitions").get().count, 2);
    assert.equal(roundtripDb.prepare("SELECT source_key FROM entry_sources WHERE entry_id = 'entry-derived'").get().source_key, "root");
    assert.equal(
      roundtripDb.prepare("SELECT etymology_description FROM entries WHERE id = 'entry-derived'").get().etymology_description,
      "derived from root",
    );
    const projectedTemplateGroup = roundtripDb.prepare(`
      SELECT id, name, match_tags_json AS matchTagsJson
      FROM morphology_template_groups
      WHERE id = 'morph-roundtrip'
    `).get();
    assert.equal(projectedTemplateGroup.name, "Nouns");
    assert.deepEqual(JSON.parse(projectedTemplateGroup.matchTagsJson), ["n"]);
    const projectedTemplateTable = roundtripDb.prepare(`
      SELECT id, group_id AS groupId, title, row_count AS rowCount, column_count AS columnCount
      FROM morphology_template_tables
      WHERE group_id = 'morph-roundtrip'
    `).get();
    assert.equal(projectedTemplateTable.title, "Nouns");
    assert.equal(projectedTemplateTable.rowCount, 2);
    assert.equal(projectedTemplateTable.columnCount, 2);
    const projectedMorphologyGroup = roundtripDb.prepare(`
      SELECT entry_id AS entryId, template_group_id AS templateGroupId, notes
      FROM entry_morphology_groups
      WHERE entry_id = 'entry-root'
      ORDER BY position ASC
    `).get();
    assert.equal(projectedMorphologyGroup.templateGroupId, "morph-roundtrip");
    assert.equal(projectedMorphologyGroup.notes, "Irregular plural retained for this entry.");
    const projectedOverride = roundtripDb.prepare(`
      SELECT template_table_id AS templateTableId, row_index AS rowIndex, column_index AS columnIndex, value
      FROM entry_morphology_cell_overrides
      WHERE entry_id = ? AND template_group_id = ?
    `).get(projectedMorphologyGroup.entryId, projectedMorphologyGroup.templateGroupId);
    assert.equal(projectedOverride.rowIndex, 0);
    assert.equal(projectedOverride.columnIndex, 0);
    assert.equal(projectedOverride.value, "root-form");

    const rebuiltEntry = await repository.getEntry(sourceDictionary.id, "entry-root");
    assert.equal(rebuiltEntry.lemma, "root");
    assert.equal(rebuiltEntry.morphologyMode, "manual");
    assert.equal(rebuiltEntry.definitions[0].meaning, "root meaning");
    assert.equal(rebuiltEntry.morphologyGroups[0].templateGroupId, "morph-roundtrip");
    assert.equal(rebuiltEntry.morphologyGroups[0].notes, "Irregular plural retained for this entry.");
    assert.equal(Object.hasOwn(rebuiltEntry.morphologyGroups[0], "id"), false);
    assert.equal(Object.hasOwn(rebuiltEntry, "morphology"), false);
  } finally {
    await cleanup();
  }
}

async function main() {
  await runSqliteSchemaCheck();
  console.log("SQLite schema checks passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runSqliteSchemaCheck,
};
