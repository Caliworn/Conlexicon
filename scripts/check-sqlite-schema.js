const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

const {
  SQLITE_SCHEMA_VERSION,
  SqliteDictionaryRepository,
} = require("../lib/sqlite-dictionary-repository");
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
    assert.equal(initialized.schemaVersion, SQLITE_SCHEMA_VERSION);
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
      "entry_morphology_tables",
      "schema_migrations",
    ].forEach((table) => assert.equal(tables.has(table), true, `missing table: ${table}`));
    ["dictionary_settings", "ipa_rules", "morphology_tables", "corpus_units"]
      .forEach((table) => assert.equal(tables.has(table), false, `unexpected table: ${table}`));

    const entryColumns = new Set(db.prepare("PRAGMA table_info(entries)").all().map((row) => row.name));
    ["id", "position", "lemma", "pronunciation", "notes", "etymology_description", "created_at", "updated_at", "sort_key"]
      .forEach((column) => assert.equal(entryColumns.has(column), true, `missing entries column: ${column}`));
    assert.equal(entryColumns.has("entry_json"), false);

    const sourceDictionary = sampleSqliteDictionary();
    await repository.importDictionarySnapshot(sourceDictionary);
    const exported = repository.exportDictionarySnapshot(sourceDictionary.id);
    assert.deepEqual(exported, sourceDictionary);

    const roundtripDb = repository.openDictionaryDatabase(sourceDictionary.id);
    assert.equal(roundtripDb.prepare("SELECT COUNT(*) AS count FROM entries").get().count, 2);
    assert.equal(roundtripDb.prepare("SELECT COUNT(*) AS count FROM definitions").get().count, 2);
    assert.equal(roundtripDb.prepare("SELECT source_key FROM entry_sources WHERE entry_id = 'entry-derived'").get().source_key, "root");
    assert.equal(
      roundtripDb.prepare("SELECT etymology_description FROM entries WHERE id = 'entry-derived'").get().etymology_description,
      "derived from root",
    );
    const projectedMorphology = roundtripDb.prepare(`
      SELECT table_id AS tableId, overrides_json AS overridesJson
      FROM entry_morphology_tables
      WHERE entry_id = 'entry-root'
      ORDER BY position ASC
    `).get();
    assert.equal(projectedMorphology.tableId, "morph-roundtrip");
    assert.deepEqual(JSON.parse(projectedMorphology.overridesJson), { "0,0": "root-form" });

    const rebuiltEntry = await repository.getEntry(sourceDictionary.id, "entry-root");
    assert.equal(rebuiltEntry.lemma, "root");
    assert.equal(rebuiltEntry.definitions[0].meaning, "root meaning");
    assert.equal(rebuiltEntry.morphology.tableId, "morph-roundtrip");
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
