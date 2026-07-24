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
      "entry_search_values",
      "entry_morphology_search_values",
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
    const entryIndexes = new Set(db.prepare("PRAGMA index_list(entries)").all().map((row) => row.name));
    assert.equal(entryIndexes.has("idx_entries_created_at"), true);
    assert.equal(entryIndexes.has("idx_entries_updated_at"), true);
    const entryTagColumns = new Set(db.prepare("PRAGMA table_info(entry_tags)").all().map((row) => row.name));
    ["entry_id", "position", "tag"].forEach((column) => assert.equal(entryTagColumns.has(column), true, `missing entry_tags column: ${column}`));
    assert.equal(entryTagColumns.has("normalized_tag"), false);
    const entryTagIndexes = new Set(db.prepare("PRAGMA index_list(entry_tags)").all().map((row) => row.name));
    assert.equal(entryTagIndexes.has("idx_entry_tags_tag_entry"), true);
    assert.equal(entryTagIndexes.has("idx_entry_tags_first_tag"), true);
    assert.equal(entryTagIndexes.has("idx_entry_tags_tag"), false);
    const entrySearchValueColumns = new Set(db.prepare("PRAGMA table_info(entry_search_values)").all().map((row) => row.name));
    ["entry_id", "field", "source_type", "source_id", "source_position", "value_type", "raw_value", "normalized_value"]
      .forEach((column) => assert.equal(entrySearchValueColumns.has(column), true, `missing entry_search_values column: ${column}`));
    assert.equal(entrySearchValueColumns.has("id"), false);
    const entryMorphologySearchValueColumns = new Set(db.prepare("PRAGMA table_info(entry_morphology_search_values)").all().map((row) => row.name));
    ["entry_id", "position", "template_group_id", "template_table_id", "row_index", "column_index", "raw_value", "normalized_value"]
      .forEach((column) => assert.equal(entryMorphologySearchValueColumns.has(column), true, `missing entry_morphology_search_values column: ${column}`));
    assert.equal(entryMorphologySearchValueColumns.has("id"), false);
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
    const projectionDb = repository.openDictionaryDatabase(sourceDictionary.id);
    const automaticPartPlan = projectionDb.prepare(`
      EXPLAIN QUERY PLAN
      SELECT e.id
      FROM entries e
      WHERE e.id IN (
        SELECT first_tag.entry_id
        FROM entry_tags first_tag
        WHERE first_tag.position = 0 AND first_tag.tag = ?
      )
    `).all("n").map((row) => row.detail || "").join("\n");
    assert.match(automaticPartPlan, /idx_entry_tags_first_tag/);
    const manualPartPlan = projectionDb.prepare(`
      EXPLAIN QUERY PLAN
      SELECT e.id
      FROM entries e
      WHERE e.id IN (
        SELECT part_tags.entry_id
        FROM entry_tags part_tags
        WHERE part_tags.tag = ?
      )
    `).all("n").map((row) => row.detail || "").join("\n");
    assert.match(manualPartPlan, /idx_entry_tags_tag_entry/);
    const importedSearchRows = projectionDb.prepare(`
      SELECT field, source_type AS sourceType, source_id AS sourceId, source_position AS sourcePosition,
        value_type AS valueType, raw_value AS rawValue, normalized_value AS normalizedValue
      FROM entry_search_values
      WHERE entry_id = 'entry-root'
      ORDER BY field ASC, source_position ASC, value_type ASC
    `).all();
    assert.equal(importedSearchRows.some((row) => row.field === "morphology"), false);
    assert.deepEqual(
      { ...importedSearchRows.find((row) => row.field === "definitions") },
      {
        field: "definitions",
        sourceType: "definition",
        sourceId: "def-root",
        sourcePosition: 0,
        valueType: "meaning",
        rawValue: "root meaning",
        normalizedValue: "root meaning",
      },
    );
    assert.equal(
      importedSearchRows.some((row) => row.field === "tags" && row.valueType === "display" && row.rawValue === "noun"),
      true,
    );
    assert.deepEqual({ ...projectionDb.prepare(`
      SELECT position, template_group_id AS templateGroupId, template_table_id AS templateTableId,
        row_index AS rowIndex, column_index AS columnIndex,
        raw_value AS rawValue, normalized_value AS normalizedValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root'
    `).get() }, {
      position: 0,
      templateGroupId: "morph-roundtrip",
      templateTableId: "mtable-roundtrip",
      rowIndex: 0,
      columnIndex: 0,
      rawValue: "root-form",
      normalizedValue: "root-form",
    });
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
    assert.equal(dictionaryMetadata.summary.rootCount, 1);

    const savedSettings = await repository.updateSettings(sourceDictionary.id, { entryListTagDisplayLimit: 4 });
    assert.deepEqual(Object.keys(savedSettings).sort(), ["id", "settings", "updatedAt"]);
    assert.equal(Object.hasOwn(savedSettings, "entries"), false);
    assert.equal(savedSettings.settings.entryListTagDisplayLimit, 4);

    const normalizedSearchSettings = await repository.updateSettings(sourceDictionary.id, {
      ...savedSettings.settings,
      tagDisplayMap: { n: "NounLabel" },
      search: {
        ...savedSettings.settings.search,
        normalization: {
          unicodeNormalization: "none",
          caseFolding: true,
          customRules: [{ canonical: "stem", variants: ["root"] }],
        },
      },
    });
    assert.equal(normalizedSearchSettings.settings.tagDisplayMap.n, "NounLabel");
    const rebuiltLemmaSearchRow = projectionDb.prepare(`
      SELECT raw_value AS rawValue, normalized_value AS normalizedValue
      FROM entry_search_values
      WHERE entry_id = 'entry-root' AND field = 'lemma'
    `).get();
    assert.deepEqual({ ...rebuiltLemmaSearchRow }, { rawValue: "root", normalizedValue: "stem" });
    assert.equal(projectionDb.prepare(`
      SELECT COUNT(*) AS count
      FROM entry_search_values
      WHERE entry_id = 'entry-root' AND field = 'tags' AND value_type = 'display' AND raw_value = 'NounLabel'
    `).get().count, 1);
    assert.equal(projectionDb.prepare(`
      SELECT COUNT(*) AS count
      FROM entry_search_values
      WHERE entry_id = 'entry-root' AND field = 'tags' AND value_type = 'display' AND raw_value = 'noun'
    `).get().count, 0);
    assert.equal(projectionDb.prepare(`
      SELECT normalized_value AS normalizedValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root' AND template_table_id = 'mtable-roundtrip'
        AND row_index = 0 AND column_index = 0
    `).get().normalizedValue, "stem-form");

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

    const morphologyWithGeneratedCell = structuredClone(sourceDictionary.morphology);
    morphologyWithGeneratedCell.templateGroups[0].tables[0].cells["0,1"] = { sourceText: "{}-suffix" };
    const savedMorphology = await repository.saveMorphology(sourceDictionary.id, morphologyWithGeneratedCell);
    assert.deepEqual(Object.keys(savedMorphology).sort(), ["id", "morphology", "updatedAt"]);
    assert.equal(Object.hasOwn(savedMorphology, "entries"), false);
    assert.equal(savedMorphology.morphology.templateGroups[0].id, "morph-roundtrip");
    assert.equal(projectionDb.prepare(`
      SELECT normalized_value AS normalizedValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root' AND template_table_id = 'mtable-roundtrip'
        AND row_index = 0 AND column_index = 1
    `).get().normalizedValue, "stem-suffix");

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
    assert.equal(projectionDb.prepare(`
      SELECT normalized_value AS normalizedValue
      FROM entry_search_values
      WHERE entry_id = 'entry-root' AND field = 'pronunciation'
    `).get().normalizedValue, "/patched/");

    const entryForSave = await repository.getEntry(sourceDictionary.id, "entry-root");
    entryForSave.morphologyGroups[0].overrides["mtable-roundtrip"]["0,0"] = "saved-form";
    await repository.saveEntry(sourceDictionary.id, entryForSave);
    assert.equal(projectionDb.prepare(`
      SELECT raw_value AS rawValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root' AND template_table_id = 'mtable-roundtrip'
        AND row_index = 0 AND column_index = 0
    `).get().rawValue, "saved-form");

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
    assert.equal(projectedOverride.value, "saved-form");

    const rebuiltEntry = await repository.getEntry(sourceDictionary.id, "entry-root");
    assert.equal(rebuiltEntry.lemma, "root");
    assert.equal(rebuiltEntry.morphologyMode, "manual");
    assert.equal(rebuiltEntry.definitions[0].meaning, "root meaning");
    assert.equal(rebuiltEntry.morphologyGroups[0].templateGroupId, "morph-roundtrip");
    assert.equal(rebuiltEntry.morphologyGroups[0].notes, "Irregular plural retained for this entry.");
    assert.equal(Object.hasOwn(rebuiltEntry.morphologyGroups[0], "id"), false);
    assert.equal(Object.hasOwn(rebuiltEntry, "morphology"), false);

    await repository.deleteEntry(sourceDictionary.id, "entry-derived");
    assert.equal(projectionDb.prepare("SELECT COUNT(*) AS count FROM entry_search_values WHERE entry_id = 'entry-derived'").get().count, 0);
    await repository.deleteEntry(sourceDictionary.id, "entry-root");
    assert.equal(projectionDb.prepare("SELECT COUNT(*) AS count FROM entry_morphology_search_values WHERE entry_id = 'entry-root'").get().count, 0);
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
