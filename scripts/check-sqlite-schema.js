const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { normalizeEntryQuery } = require("../lib/entry-query-model");
const { normalizeDictionary } = require("../lib/dictionary-model");
const { planMorphologyWrite } = require("../lib/morphology-write-plan");

const {
  createTempSqliteRepository,
  morphologyFormOverride,
  morphologyTableFixture,
  requireSqliteRuntime,
  sampleSqliteDictionary,
} = require("./sqlite-check-utils");

function checkMorphologyWritePlanning() {
  const previous = normalizeDictionary({
    morphology: {
      functions: { leftV: ["a"] },
      slots: [
        { id: "mslot-plan-function", tables: [morphologyTableFixture("mtable-plan-function", {
          matchRules: [{ all: ["n", "base"], none: ["x", "y"] }, { all: ["q"], none: [] }],
          sources: [["{}/leftV(a) = x; else = y/"]],
        })] },
        { id: "mslot-plan-static", tables: [morphologyTableFixture("mtable-plan-static", {
          matchRules: [{ all: ["v"], none: [] }], sources: [["{}-static"]],
        })] },
      ],
    },
  }).morphology;
  const displayOnly = structuredClone(previous);
  const renamed = displayOnly.slots[0].tables[0];
  renamed.title = "Renamed table";
  renamed.rows[0].label = "Renamed row";
  renamed.matchRules = [{ all: [" q "], none: [] }, { all: ["base", "n"], none: ["y", "x"] }];
  const displayPlan = planMorphologyWrite(previous, displayOnly);
  assert.equal(displayPlan.rows.tables.upsert.length, 1);
  assert.deepEqual([...displayPlan.projection.generationTableIds], []);
  assert.equal(displayPlan.projection.assignmentChanged, false);
  renamed.matchRules[0].all = ["Q"];
  assert.equal(planMorphologyWrite(previous, displayOnly).projection.assignmentChanged, true, "structural tags distinguish case");

  const functionsChanged = structuredClone(previous);
  functionsChanged.functions.leftV.push("e");
  const functionPlan = planMorphologyWrite(previous, functionsChanged);
  assert.equal(functionPlan.blobChanged, true);
  assert.deepEqual([...functionPlan.projection.generationTableIds], ["mtable-plan-function"]);
}

async function checkIncrementalMorphologyWrites(repository) {
  const dictionary = sampleSqliteDictionary();
  dictionary.id = "dict-morphology-incremental";
  dictionary.name = "Incremental Morphology";
  const noun = morphologyTableFixture("mtable-incremental-n", {
    title: "Noun forms", matchRules: [{ all: ["n"], none: [] }], columnLabels: ["First", "Second"], sources: [["{}-n", "{}-second"]],
  });
  const verb = morphologyTableFixture("mtable-incremental-v", {
    title: "Verb forms", matchRules: [{ all: ["v"], none: [] }], sources: [["{}-v"]],
  });
  dictionary.morphology.slots = [
    { id: "mslot-incremental-n", tables: [noun] },
    { id: "mslot-incremental-v", tables: [verb] },
  ];
  dictionary.entries = [
    {
      id: "entry-incremental-manual", lemma: "manual", tags: ["n"], morphologyMode: "manual",
      morphologyTables: [{ tableId: noun.id, overrides: [morphologyFormOverride(noun, 0, 0, "manual-form")] }],
    },
    { id: "entry-incremental-auto-n", lemma: "auto-n", tags: ["n"] },
    { id: "entry-incremental-auto-v", lemma: "auto-v", tags: ["v"] },
    { id: "entry-incremental-auto-multi", lemma: "auto-multi", tags: ["n", "v"] },
  ];
  await repository.importDictionarySnapshot(dictionary);
  const db = repository.openDictionaryDatabase(dictionary.id);
  db.exec(`
    CREATE TEMP TABLE morphology_projection_delete_audit(entry_id TEXT NOT NULL);
    CREATE TEMP TRIGGER audit_morphology_projection_delete
    AFTER DELETE ON entry_morphology_search_values
    BEGIN
      INSERT INTO morphology_projection_delete_audit(entry_id) VALUES (OLD.entry_id);
    END;
  `);
  const auditedEntryIds = () => db.prepare(`
    SELECT DISTINCT entry_id AS entryId
    FROM morphology_projection_delete_audit
    ORDER BY entry_id ASC
  `).all().map((row) => row.entryId);
  const clearAudit = () => db.prepare("DELETE FROM morphology_projection_delete_audit").run();
  const forms = (entryId) => db.prepare(`
    SELECT raw_value AS value FROM entry_morphology_search_values
    WHERE entry_id = ? ORDER BY position
  `).all(entryId).map(({ value }) => value);

  const displayOnly = structuredClone((await repository.getDictionarySnapshot(dictionary.id)).morphology);
  displayOnly.slots[0].name = "Nouns renamed";
  displayOnly.slots[0].tables[0].columns[0].label = "Renamed";
  const displaySaved = await repository.saveMorphology(dictionary.id, displayOnly);
  assert.deepEqual(auditedEntryIds(), [], "display-only changes do not write projections");
  assert.equal(displaySaved.morphology.slots[0].name, "Nouns renamed");

  const reordered = structuredClone(displaySaved.morphology);
  reordered.slots[0].tables[0].columns.reverse();
  reordered.slots.reverse();
  const reorderedSaved = await repository.saveMorphology(dictionary.id, reordered);
  assert.deepEqual(auditedEntryIds(), [], "reorder updates projection positions without regenerating forms");
  assert.deepEqual(forms("entry-incremental-auto-multi"), ["auto-multi-v", "auto-multi-second", "auto-multi-n"]);
  assert.deepEqual(forms("entry-incremental-manual"), ["manual-second", "manual-form"]);

  const changedRule = structuredClone(reorderedSaved.morphology);
  changedRule.slots[1].tables[0].cells.find((cell) => cell.columnId === noun.columns[0].id).sourceText = "{}-changed";
  const ruleSaved = await repository.saveMorphology(dictionary.id, changedRule);
  assert.deepEqual(auditedEntryIds(), [
    "entry-incremental-auto-multi", "entry-incremental-auto-n", "entry-incremental-manual",
  ]);
  assert.deepEqual(forms("entry-incremental-auto-n"), ["auto-n-second", "auto-n-changed"]);
  assert.deepEqual(forms("entry-incremental-auto-v"), ["auto-v-v"]);

  clearAudit();
  const changedAssignment = structuredClone(ruleSaved.morphology);
  changedAssignment.slots[1].tables[0].matchRules = [{ all: ["x"], none: [] }];
  const assignmentSaved = await repository.saveMorphology(dictionary.id, changedAssignment);
  assert.deepEqual(auditedEntryIds(), ["entry-incremental-auto-multi", "entry-incremental-auto-n"]);
  assert.deepEqual(forms("entry-incremental-auto-n"), []);
  assert.deepEqual(forms("entry-incremental-manual"), ["manual-second", "manual-form"]);

  clearAudit();
  const unchanged = await repository.saveMorphology(dictionary.id, assignmentSaved.morphology);
  assert.equal(unchanged.updatedAt, assignmentSaved.updatedAt);
  assert.deepEqual(auditedEntryIds(), [], "no-op save does not touch projections");

  const competing = structuredClone(unchanged.morphology);
  const [verbSlot, nounSlot] = competing.slots;
  nounSlot.tables[0].matchRules = [{ all: ["v", "n"], none: [] }];
  nounSlot.tables.push(...verbSlot.tables);
  competing.slots = [nounSlot];
  await repository.saveMorphology(dictionary.id, competing);
  assert.deepEqual(auditedEntryIds(), ["entry-incremental-auto-multi"], "slot changes rebuild only entries with different assignment");
  assert.deepEqual(forms("entry-incremental-auto-multi"), ["auto-multi-second", "auto-multi-changed"]);
  assert.deepEqual(forms("entry-incremental-auto-v"), ["auto-v-v"]);
  assert.deepEqual(forms("entry-incremental-manual"), ["manual-second", "manual-form"]);
}


async function runSqliteSchemaCheck() {
  requireSqliteRuntime("schema check");
  checkMorphologyWritePlanning();

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
      "definition_tags",
      "entry_sources",
      "entry_search_values",
      "entry_morphology_search_values",
      "morphology_slots",
      "morphology_template_rows",
      "morphology_template_columns",
      "morphology_template_tables",
      "morphology_template_cells",
      "entry_morphology_tables",
      "entry_morphology_cell_overrides",
    ].forEach((table) => assert.equal(tables.has(table), true, `missing table: ${table}`));
    assert.equal(tables.has("schema_migrations"), false, "runtime schema must not introduce migration state");

    const entryColumns = new Set(db.prepare("PRAGMA table_info(entries)").all().map((row) => row.name));
    ["id", "position", "lemma", "pronunciation", "notes", "etymology_description", "morphology_mode", "created_at", "updated_at", "sort_key"]
      .forEach((column) => assert.equal(entryColumns.has(column), true, `missing entries column: ${column}`));
    assert.equal(entryColumns.has("entry_json"), false);
    const entryIndexes = new Set(db.prepare("PRAGMA index_list(entries)").all().map((row) => row.name));
    assert.equal(entryIndexes.has("idx_entries_created_at"), true);
    assert.equal(entryIndexes.has("idx_entries_updated_at"), true);
    const entryTagColumns = new Set(db.prepare("PRAGMA table_info(entry_tags)").all().map((row) => row.name));
    ["entry_id", "tag"].forEach((column) => assert.equal(entryTagColumns.has(column), true, `missing entry_tags column: ${column}`));
    const entryTagIndexes = new Set(db.prepare("PRAGMA index_list(entry_tags)").all().map((row) => row.name));
    assert.equal(entryTagIndexes.has("idx_entry_tags_tag_entry"), true);
    const definitionTagColumns = new Set(db.prepare("PRAGMA table_info(definition_tags)").all().map((row) => row.name));
    ["definition_id", "entry_id", "tag"]
      .forEach((column) => assert.equal(definitionTagColumns.has(column), true, `missing definition_tags column: ${column}`));
    const definitionTagIndexes = new Set(db.prepare("PRAGMA index_list(definition_tags)").all().map((row) => row.name));
    ["idx_definition_tags_tag_entry", "idx_definition_tags_entry_tag"]
      .forEach((index) => assert.equal(definitionTagIndexes.has(index), true, `missing definition_tags index: ${index}`));
    const entrySearchValueColumns = new Set(db.prepare("PRAGMA table_info(entry_search_values)").all().map((row) => row.name));
    ["entry_id", "field", "source_type", "source_id", "source_position", "value_type", "raw_value", "normalized_value"]
      .forEach((column) => assert.equal(entrySearchValueColumns.has(column), true, `missing entry_search_values column: ${column}`));
    assert.equal(entrySearchValueColumns.has("id"), false);
    const entryMorphologySearchValueColumns = new Set(db.prepare("PRAGMA table_info(entry_morphology_search_values)").all().map((row) => row.name));
    ["entry_id", "position", "template_table_id", "row_id", "column_id", "raw_value", "normalized_value"]
      .forEach((column) => assert.equal(entryMorphologySearchValueColumns.has(column), true, `missing entry_morphology_search_values column: ${column}`));
    assert.equal(entryMorphologySearchValueColumns.has("id"), false);
    const entryMorphologyTableColumns = new Set(db.prepare("PRAGMA table_info(entry_morphology_tables)").all().map((row) => row.name));
    ["entry_id", "position", "template_table_id", "notes", "created_at", "updated_at"]
      .forEach((column) => assert.equal(entryMorphologyTableColumns.has(column), true, `missing entry morphology table column: ${column}`));
    assert.equal(entryMorphologyTableColumns.has("id"), false);
    const entryMorphologyOverrideColumns = new Set(db.prepare("PRAGMA table_info(entry_morphology_cell_overrides)").all().map((row) => row.name));
    ["entry_id", "template_table_id", "row_id", "column_id", "kind", "value"]
      .forEach((column) => assert.equal(entryMorphologyOverrideColumns.has(column), true, `missing entry morphology override column: ${column}`));

    const sourceDictionary = sampleSqliteDictionary();
    await repository.importDictionarySnapshot(sourceDictionary);
    await checkIncrementalMorphologyWrites(repository);
    const projectionDb = repository.openDictionaryDatabase(sourceDictionary.id);
    // The part filter reads effective tags through the (tag, entry_id) index of both tag tables.
    const partFilter = repository.entryQueryWhereClauses(
      projectionDb,
      repository.dictionaryQueryContext(sourceDictionary.id),
      normalizeEntryQuery({ filter: { part: "n" } }),
    );
    const partPlan = projectionDb.prepare(`
      EXPLAIN QUERY PLAN
      SELECT e.id FROM entries e WHERE ${partFilter.clauses.join(" AND ")}
    `).all(...partFilter.params).map((row) => row.detail || "").join("\n");
    assert.match(partPlan, /idx_entry_tags_tag_entry/);
    assert.match(partPlan, /idx_definition_tags_tag_entry/);
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
      SELECT position, template_table_id AS templateTableId, row_id AS rowId, column_id AS columnId,
        raw_value AS rawValue, normalized_value AS normalizedValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root'
    `).get() }, {
      position: 0,
      templateTableId: "mtable-roundtrip",
      rowId: "mrow-mtable-roundtrip-1",
      columnId: "mcol-mtable-roundtrip-1",
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
      search: {
        ...savedSettings.settings.search,
        normalization: {
          unicodeNormalization: "none",
          caseFolding: true,
          customRules: [{ canonical: "stem", variants: ["root"] }],
        },
      },
    });
    const rebuiltLemmaSearchRow = projectionDb.prepare(`
      SELECT raw_value AS rawValue, normalized_value AS normalizedValue
      FROM entry_search_values
      WHERE entry_id = 'entry-root' AND field = 'lemma'
    `).get();
    assert.deepEqual({ ...rebuiltLemmaSearchRow }, { rawValue: "root", normalizedValue: "stem" });
    assert.equal(projectionDb.prepare(`
      SELECT COUNT(*) AS count
      FROM entry_search_values
      WHERE entry_id = 'entry-root' AND field = 'tags' AND value_type = 'display' AND raw_value = 'noun'
    `).get().count, 1);
    assert.equal(projectionDb.prepare(`
      SELECT normalized_value AS normalizedValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root' AND template_table_id = 'mtable-roundtrip'
        AND row_id = 'mrow-mtable-roundtrip-1' AND column_id = 'mcol-mtable-roundtrip-1'
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

    const savedCorpusItem = await repository.createCorpusItem(sourceDictionary.id, { content: "SQLite corpus" });
    assert.deepEqual(Object.keys(savedCorpusItem).sort(), ["id", "item", "updatedAt"]);
    assert.equal(savedCorpusItem.item.content, "SQLite corpus");

    const morphologyWithGeneratedCell = structuredClone(sourceDictionary.morphology);
    const table = morphologyWithGeneratedCell.slots[0].tables[0];
    table.cells.push({ rowId: table.rows[0].id, columnId: table.columns[1].id, kind: "rule", sourceText: "{}-suffix" });
    const savedMorphology = await repository.saveMorphology(sourceDictionary.id, morphologyWithGeneratedCell);
    assert.deepEqual(Object.keys(savedMorphology).sort(), ["id", "morphology", "updatedAt"]);
    assert.equal(Object.hasOwn(savedMorphology, "entries"), false);
    assert.equal(savedMorphology.morphology.slots[0].id, "mslot-roundtrip");
    assert.equal(projectionDb.prepare(`
      SELECT normalized_value AS normalizedValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root' AND template_table_id = 'mtable-roundtrip'
        AND row_id = ? AND column_id = ?
    `).get(table.rows[0].id, table.columns[1].id).normalizedValue, "stem-suffix");

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
    entryForSave.morphologyTables[0].overrides[0].value = "saved-form";
    await repository.saveEntry(sourceDictionary.id, entryForSave);
    assert.equal(projectionDb.prepare(`
      SELECT raw_value AS rawValue
      FROM entry_morphology_search_values
      WHERE entry_id = 'entry-root' AND template_table_id = 'mtable-roundtrip'
        AND row_id = ? AND column_id = ?
    `).get(table.rows[0].id, table.columns[0].id).rawValue, "saved-form");

    const exported = repository.exportDictionarySnapshot(sourceDictionary.id);
    assert.equal(exported.id, sourceDictionary.id);
    assert.equal(exported.entries.length, sourceDictionary.entries.length);
    assert.equal(exported.morphology.slots[0].id, "mslot-roundtrip");
    assert.equal(exported.morphology.slots[0].tables[0].title, "Nouns");

    const roundtripDb = repository.openDictionaryDatabase(sourceDictionary.id);
    assert.equal(roundtripDb.prepare("SELECT COUNT(*) AS count FROM entries").get().count, 2);
    assert.equal(roundtripDb.prepare("SELECT COUNT(*) AS count FROM definitions").get().count, 2);
    assert.equal(roundtripDb.prepare("SELECT target_entry_id FROM entry_sources WHERE entry_id = 'entry-derived'").get().target_entry_id, "entry-root");
    assert.equal(
      roundtripDb.prepare("SELECT etymology_description FROM entries WHERE id = 'entry-derived'").get().etymology_description,
      "derived from root",
    );
    const projectedSlot = roundtripDb.prepare(`
      SELECT id, name FROM morphology_slots WHERE id = 'mslot-roundtrip'
    `).get();
    assert.equal(projectedSlot.name, "Nouns");
    const projectedTemplateTable = roundtripDb.prepare(`
      SELECT id, title, match_rules_json AS matchRulesJson
      FROM morphology_template_tables
      WHERE slot_id = 'mslot-roundtrip'
    `).get();
    assert.equal(projectedTemplateTable.title, "Nouns");
    assert.deepEqual(JSON.parse(projectedTemplateTable.matchRulesJson), [{ all: ["n"], none: [] }]);
    for (const axis of ["rows", "columns"]) {
      const ids = roundtripDb.prepare(`
        SELECT id FROM morphology_template_${axis} WHERE table_id = ? ORDER BY position
      `).all(table.id);
      assert.deepEqual(ids.map(({ id }) => id), table[axis].map(({ id }) => id));
    }
    const projectedMorphologyTable = roundtripDb.prepare(`
      SELECT entry_id AS entryId, template_table_id AS tableId, notes
      FROM entry_morphology_tables
      WHERE entry_id = 'entry-root'
      ORDER BY position ASC
    `).get();
    assert.equal(projectedMorphologyTable.tableId, table.id);
    assert.equal(projectedMorphologyTable.notes, "Irregular plural retained for this entry.");
    const projectedOverride = roundtripDb.prepare(`
      SELECT row_id AS rowId, column_id AS columnId, kind, value
      FROM entry_morphology_cell_overrides
      WHERE entry_id = ? AND template_table_id = ?
    `).get(projectedMorphologyTable.entryId, projectedMorphologyTable.tableId);
    assert.deepEqual({ ...projectedOverride }, morphologyFormOverride(table, 0, 0, "saved-form"));

    const rebuiltEntry = await repository.getEntry(sourceDictionary.id, "entry-root");
    assert.equal(rebuiltEntry.lemma, "root");
    assert.equal(rebuiltEntry.morphologyMode, "manual");
    assert.equal(rebuiltEntry.definitions[0].meaning, "root meaning");
    assert.equal(rebuiltEntry.morphologyTables[0].tableId, table.id);
    assert.equal(rebuiltEntry.morphologyTables[0].notes, "Irregular plural retained for this entry.");

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
