#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { importDictionaryFromJsonPayload } = require("../lib/dictionary-conversion-service");
const { normalizeMorphologyInput } = require("../lib/morphology-validation");
const {
  applyMorphologyRuleSyntax,
  createMorphologyResolver,
  detachMorphologyTable,
  explainAutomaticTables,
  morphologyMatchContexts,
  morphologyMergeRegions,
  morphologySearchValueRecords,
  morphologyDisplayGroups,
  normalizeMorphologyFunctions,
  removeMorphologyAxisItem,
  resolveAutomaticTables,
} = require("../lib/morphology-model");
const { normalizeStructuralKey } = require("../lib/search-normalization-model");
const { migrateJsonDataDirectoryToSqlite } = require("./migrate-json-data-to-sqlite");
const { buildMorphologyTestDictionary, writeMorphologyTestData } = require("./generate-morphology-test-dictionary");
const { buildLegacyStressDictionary } = require("./generate-stress-dictionary");
const { callApi } = require("./repository-contract");
const draftModel = require("../lib/morphology-draft-model");
const {
  createTempSqliteRepository, morphologyFormOverride, morphologyTableFixture, requireSqliteRuntime, sqliteRepositoryOptions,
} = require("./sqlite-check-utils");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");

const rule = (all, none = []) => ({ all, none });
const table = (id, ...matchRules) => morphologyTableFixture(id, { matchRules });
const slot = (id, ...tables) => ({ id, tables });
const at = (shape, row, col) => ({ rowId: shape.rows[row].id, columnId: shape.columns[col].id });
const refer = (shape, row, col, targetRow, targetCol) => ({
  ...at(shape, row, col), kind: "refer", targetRowId: shape.rows[targetRow].id, targetColumnId: shape.columns[targetCol].id,
});
const absent = (shape, row, col) => ({ ...at(shape, row, col), kind: "absent" });
const findTable = (morphology, id) => morphology.slots.flatMap(({ tables }) => tables).find((item) => item.id === id);
const expectApiError = (code, status = 400) => (error) => error.code === code && error.status === status;

function checkAssignment() {
  const morphology = normalizeMorphologyInput({ slots: [
    slot("inflection", table("noun", rule(["n"])), table("nonproper", rule(["n"], ["proper"])),
      table("specific", rule(["n", "special"])), table("tie", rule(["n", "special"])),
      table("multi-rule", rule(["adj"]), rule(["n", "special", "rare"])), table("empty")),
    slot("register", table("archaism", rule(["v", "archaic"]))),
    slot("extra-slot", table("extra", rule(["base", "v"]), rule(["base", "adj"]))),
  ] });
  const entry = {
    tags: ["base"],
    definitions: [
      { id: "verb", tags: ["v"] },
      { id: "noun", tags: ["n", "special", "archaic"] },
      { id: "bare", tags: ["n", "proper"] },
      { id: "adj", tags: ["adj", "rare"] },
      { id: "untagged", tags: [] },
    ],
  };
  const contexts = morphologyMatchContexts(entry);
  assert.deepEqual(contexts[3], { definitionId: "adj", tags: ["base", "adj", "rare"] });
  assert.deepEqual(contexts.at(-1), { definitionId: "untagged", tags: ["base"] });
  assert.deepEqual(morphologyMatchContexts({ tags: ["n", "n"] }), [{ definitionId: null, tags: ["n"] }]);
  const resolved = resolveAutomaticTables(contexts, morphology);
  assert.deepEqual(resolved, {
    tableIds: ["noun", "nonproper", "specific", "tie", "multi-rule", "extra"],
    contexts: [
      { definitionId: "verb", tableIds: ["extra"] },
      { definitionId: "noun", tableIds: ["nonproper", "specific", "tie"] },
      { definitionId: "bare", tableIds: ["noun"] },
      { definitionId: "adj", tableIds: ["multi-rule", "extra"] },
      { definitionId: "untagged", tableIds: [] },
    ],
  });
  const explanation = explainAutomaticTables(contexts, morphology);
  assert.deepEqual(explanation.tableIds, resolved.tableIds);
  explanation.contexts.forEach(({ slots, definitionId }, index) => {
    const effective = slots.flatMap((item) => item.tables
      .filter(({ status }) => status === "effective" || status === "coeffective").map(({ tableId }) => tableId));
    assert.deepEqual({ definitionId, tableIds: effective }, resolved.contexts[index]);
  });
  assert.deepEqual(explanation.contexts[1].slots[0].tables[0], {
    tableId: "noun", status: "covered", coveredByTableIds: ["nonproper", "specific", "tie"],
  });
  assert.deepEqual(explanation.contexts[2].slots[0].tables[1].rules[0].excludedTags, ["proper"]);
  assert.deepEqual(explanation.contexts[0].slots[1].tables[0].rules[0].missingTags, ["archaic"]);
  assert.equal(explanation.contexts[0].slots[0].tables.at(-1).status, "no_rules");
  const moreSpecificContext = [{ definitionId: null, tags: ["n", "special", "rare", "proper"] }];
  assert.deepEqual(resolveAutomaticTables(moreSpecificContext, morphology).tableIds, ["multi-rule"]);
}

function inheritedMorphology() {
  const parent = morphologyTableFixture("parent", {
    title: "Parent", matchRules: [rule(["n"])], rowLabels: ["A", "B", "C"], columnLabels: ["one", "two", "three"],
    sources: [["{}", "", ""], ["{}-b", "", ""], ["/left(i)=x/", "", ""]],
  });
  parent.cells.push(
    refer(parent, 0, 1, 0, 0),
    refer(parent, 0, 2, 0, 1),
    refer(parent, 1, 1, 1, 0),
    refer(parent, 1, 2, 2, 0),
    refer(parent, 2, 2, 1, 0),
    absent(parent, 2, 1),
  );
  const child = {
    id: "child", title: "Child", inheritsFrom: parent.id, matchRules: [rule(["n", "special"])],
    cells: [{ ...at(parent, 0, 0), kind: "rule", sourceText: "{}-child" }],
  };
  const grandchild = {
    id: "grandchild", title: "Grandchild", inheritsFrom: child.id, matchRules: [rule(["n", "special", "rare"])],
    cells: [absent(parent, 1, 0)],
  };
  return { morphology: { slots: [slot("inflection", parent, child, grandchild)] }, parent, child, grandchild };
}

function evaluateCell(resolver, tableId, row, col, overrides, lemma = "test") {
  const { rowId, columnId } = at(resolver.tableShape(tableId), row, col);
  return resolver.cellResolver(tableId, lemma, overrides)(rowId, columnId);
}

function checkCellResolution() {
  const { morphology, parent } = inheritedMorphology();
  const resolver = createMorphologyResolver(normalizeMorphologyInput(morphology));
  assert.deepEqual(evaluateCell(resolver, "grandchild", 0, 2), {
    kind: "form", value: "test-child", referred: true, overridden: false, source: at(parent, 0, 0),
  });
  assert.equal(evaluateCell(resolver, "grandchild", 2, 2).kind, "absent", "child absence propagates through references");
  assert.equal(evaluateCell(resolver, "parent", 1, 2).kind, "blank", "a reference to an empty generating rule is blank");
  assert.equal(evaluateCell(resolver, "parent", 2, 1).kind, "absent");
  const absentOverride = [absent(parent, 0, 0)];
  const referredAbsent = evaluateCell(resolver, "child", 0, 2, absentOverride);
  assert.equal(referredAbsent.kind, "absent");
  assert.equal(referredAbsent.overridden, false, "following an overridden source does not mark the referring cell");
  assert.equal(evaluateCell(resolver, "child", 0, 0, absentOverride).overridden, true, "an explicit absence is an override");
  assert.equal(evaluateCell(resolver, "child", 0, 2, [morphologyFormOverride(parent, 0, 0, "changed")]).value, "changed");
  const broken = evaluateCell(resolver, "child", 0, 1, [morphologyFormOverride(parent, 0, 1, "broken")]);
  assert.deepEqual(broken, { kind: "form", value: "broken", referred: false, overridden: true, source: at(parent, 0, 1) });
  const single = morphologyTableFixture("single", { columnLabels: ["", ""] });
  single.cells.push(refer(single, 0, 0, 0, 1));
  const singleModule = normalizeMorphologyInput({ slots: [slot("single-slot", single)] });
  assert.equal(evaluateCell(createMorphologyResolver(singleModule), single.id, 0, 0).kind, "blank", "references can end at unwritten cells");
  assert.throws(() => removeMorphologyAxisItem(singleModule, single.id, "rows", single.rows[0].id), RangeError);
}

function checkBoundaryValidation() {
  const invalid = (mutate, code, reason) => {
    const { morphology, parent, child } = inheritedMorphology();
    mutate(morphology, parent, child);
    assert.throws(() => normalizeMorphologyInput(morphology), (error) => (
      expectApiError(code)(error) && (!reason || error.details.reason === reason)
    ));
  };
  invalid((draft) => { draft.slots.push(slot("empty")); }, "invalid_morphology_slot");
  invalid((_, parent) => { parent.matchRules = [rule([], ["n"])]; }, "invalid_morphology_match_rule", "empty_all");
  invalid((_, parent) => { parent.matchRules = [rule(["n"], [" n "])]; }, "invalid_morphology_match_rule", "conflicting_tags");
  invalid((_, parent) => { parent.rows = []; }, "invalid_morphology_shape", "empty_axis");
  invalid((_, parent) => { parent.columns[0].id = parent.rows[0].id; }, "invalid_morphology_shape", "duplicate_axis_id");
  invalid((_, parent, child) => { child.rows = parent.rows; }, "invalid_morphology_inheritance", "child_has_shape");
  invalid((_, parent, child) => { child.inheritsFrom = "missing"; }, "invalid_morphology_inheritance", "unknown_parent");
  invalid((_, parent, child) => {
    delete parent.rows;
    delete parent.columns;
    parent.inheritsFrom = child.id;
  }, "invalid_morphology_inheritance", "inheritance_cycle");
  invalid((_, parent) => { parent.cells.push(parent.cells[0]); }, "invalid_morphology_cell", "duplicate_coordinate");
  invalid((_, parent) => { parent.cells[0].rowId = ""; }, "invalid_morphology_cell", "invalid_coordinate");
  invalid((_, parent) => { parent.cells[0].rowId = "outside"; parent.cells[0].sourceText = " "; }, "invalid_morphology_cell", "coordinate_outside_shape");
  invalid((_, parent) => { parent.cells[0].targetRowId = "invalid"; }, "invalid_morphology_cell", "invalid_kind_fields");
  invalid((_, parent) => { parent.cells[0] = { ...refer(parent, 0, 0, 0, 0), targetRowId: "outside" }; }, "invalid_morphology_cell", "target_outside_shape");
  invalid((_, parent) => { parent.cells[0] = refer(parent, 0, 0, 0, 0); }, "invalid_morphology_cell", "self_reference");
  invalid((_, parent, child) => { child.cells[0] = refer(parent, 0, 0, 0, 1); }, "invalid_morphology_cell", "reference_cycle");

  const { morphology, parent } = inheritedMorphology();
  const imported = { id: "dict-duplicate-axis", name: "Bad axis", morphology, entries: [] };
  const other = table("other");
  other.rows[0].id = parent.rows[0].id;
  assert.throws(
    () => importDictionaryFromJsonPayload({ ...imported, morphology: { slots: [...morphology.slots, slot("other-slot", other)] } }),
    expectApiError("invalid_morphology_shape"),
  );
  assert.throws(
    () => importDictionaryFromJsonPayload({ ...imported, entries: [{ id: parent.rows[0].id, lemma: "ID collision" }] }),
    expectApiError("duplicate_entity_ids", 409),
  );
}

function checkDisplayAlgorithms() {
  const ctx = (definitionId, ...tableIds) => ({ definitionId, tableIds });
  assert.deepEqual(morphologyDisplayGroups({
    tableIds: ["tense", "case", "tone", "plural", "register", "agreement"],
    contexts: [
      ctx("d1", "case", "tone", "plural", "register"),
      ctx("d2", "tense", "tone", "agreement"),
      ctx("d3", "tone", "register"),
      ctx("d4", "tone"),
    ],
  }), [
    { definitionIds: ["d1", "d2", "d3", "d4"], tableIds: ["tone"], shared: true },
    { definitionIds: ["d1"], tableIds: ["case", "plural"], shared: false },
    { definitionIds: ["d1", "d3"], tableIds: ["register"], shared: false },
    { definitionIds: ["d2"], tableIds: ["tense", "agreement"], shared: false },
  ]);
  assert.deepEqual(morphologyDisplayGroups({
    tableIds: ["case"],
    contexts: [ctx("d1"), ctx("d2", "case")],
  }), [
    { definitionIds: ["d2"], tableIds: ["case"], shared: false },
  ]);
  assert.deepEqual(morphologyDisplayGroups({
    tableIds: ["tone"],
    contexts: [ctx(null, "tone")],
  }), [
    { definitionIds: [null], tableIds: ["tone"], shared: true },
  ]);
  assert.deepEqual(morphologyDisplayGroups({ tableIds: [], contexts: [ctx("d1"), ctx("d2")] }), []);
  const rectangles = (pattern) => {
    const grid = pattern.map((markers, row) => Array.from(markers, (marker, column) => {
      if (marker === ".") return { kind: "blank" };
      if (marker === "-" || marker === "!") return { kind: "absent", overridden: marker === "!" };
      return {
        kind: "form",
        value: "same spelling",
        overridden: marker === "a",
        source: marker === "A" || marker === "a" ? { rowId: 0, columnId: 0 } : { rowId: row, columnId: column },
      };
    }));
    return morphologyMergeRegions(grid).map(({ rectangle }) => [rectangle.row, rectangle.column, rectangle.rowSpan, rectangle.colSpan]);
  };
  assert.deepEqual(rectangles(["A", "A", "A"]), [[0, 0, 3, 1]]);
  assert.deepEqual(rectangles(["AAA"]), [[0, 0, 1, 3]]);
  assert.deepEqual(rectangles(["AA", "A."]), [[0, 0, 1, 2]]);
  assert.deepEqual(rectangles(["AAA", ".A.", ".A."]), [[0, 1, 3, 1]]);
  assert.deepEqual(rectangles(["AA", "AA", "A."]), [[0, 0, 2, 2]]);
  assert.deepEqual(rectangles(["AA.AA"]), [[0, 0, 1, 2], [0, 3, 1, 2]]);
  assert.deepEqual(rectangles(["AXA", ".AA"]), [[1, 1, 1, 2]]);
  assert.deepEqual(rectangles(["A.", ".A"]), []);
  assert.deepEqual(rectangles(["---", "---"]), [[0, 0, 2, 3]]);
  assert.deepEqual(rectangles(["--.", "-!.", "..-"]), [[0, 0, 1, 2]], "mixed absences share a region and keep distinct backgrounds");
  assert.deepEqual(rectangles(["--.--X--"]), [[0, 0, 1, 2], [0, 3, 1, 2], [0, 6, 1, 2]]);
  assert.deepEqual(rectangles(["-.", ".-"]), []);
  assert.deepEqual(rectangles(["aAA"]), [[0, 1, 1, 2]], "same-source forms share a region without extending the override background");
}

function legacyAssignedTables(legacy, entry, tags) {
  const groups = legacy.morphology.templateGroups;
  const wanted = new Set(tags.map(normalizeStructuralKey));
  const assignments = new Map((entry.morphologyGroups || []).map((group) => [group.templateGroupId, group]));
  const assigned = entry.morphologyMode === "manual"
    ? [...assignments.keys()].map((id) => groups.find((group) => group.id === id))
    : groups.filter((group) => group.matchTags.some((tag) => wanted.has(normalizeStructuralKey(tag)))).slice(0, 1);
  const functions = normalizeMorphologyFunctions(legacy.morphology.functions);
  return assigned.flatMap((group) => (group.tables || []).map((item) => {
    const values = [];
    for (let row = 0; row < item.rowCount; row += 1) {
      for (let column = 0; column < item.columnCount; column += 1) {
        const key = `${row},${column}`;
        const value = assignments.get(group.id)?.overrides?.[item.id]?.[key]?.trim();
        const sourceText = item.cells[key]?.sourceText.trim();
        values.push(value || (sourceText ? applyMorphologyRuleSyntax(entry.lemma, sourceText, functions) : ""));
      }
    }
    return { tableId: item.id, values };
  }));
}

function resolvedTableValues(resolver, entry) {
  return resolver.entryTableIds(entry).map((tableId) => {
    const { rows, columns } = resolver.tableShape(tableId);
    const overrides = entry.morphologyTables.find((item) => item.tableId === tableId)?.overrides;
    const resolve = resolver.cellResolver(tableId, entry.lemma, overrides);
    return { tableId, values: rows.flatMap((row) => columns.map((column) => resolve(row.id, column.id).value)) };
  });
}

function compareLegacyForms(legacy, converted) {
  const resolver = createMorphologyResolver(converted.morphology);
  const entries = new Map(converted.entries.map((entry) => [entry.id, entry]));
  for (const entry of legacy.entries) {
    assert.deepEqual(
      resolvedTableValues(resolver, entries.get(entry.id)),
      legacyAssignedTables(legacy, entry, entry.tags),
      `legacy assignment and cell values for ${entry.lemma}`,
    );
  }
}

async function checkLegacyConversion(repository, dataDir) {
  const legacy = buildMorphologyTestDictionary();
  const sourceDataDir = path.join(dataDir, "legacy-json");
  const targetDataDir = path.join(dataDir, "converted");
  await writeMorphologyTestData(sourceDataDir);
  const migration = await migrateJsonDataDirectoryToSqlite({ sourceDataDir, targetDataDir });
  assert.equal(migration.migratedCount, 1);
  assert.equal(migration.failedCount, 0);
  assert.equal(migration.targetActiveDictionaryId, legacy.id);
  const migratedRepository = new SqliteDictionaryRepository(sqliteRepositoryOptions(targetDataDir));
  try {
    compareLegacyForms(legacy, await migratedRepository.getDictionarySnapshot(legacy.id));
  } finally {
    migratedRepository.close();
  }
  const converted = importDictionaryFromJsonPayload(legacy).dictionary;
  compareLegacyForms(legacy, converted);
  const stress = buildLegacyStressDictionary(10000);
  compareLegacyForms(stress, importDictionaryFromJsonPayload(stress).dictionary);
  const entryByLemma = (dictionary, lemma) => dictionary.entries.find((entry) => entry.lemma === lemma);
  const overlay = entryByLemma(converted, "kasa").morphologyTables[0];
  assert.equal(overlay.notes, "原标题：Irregular noun paradigm\nThe accusative is suppletive in this entry.");
  const manual = entryByLemma(converted, "panu");
  assert.match(manual.morphologyTables[0].notes, /原标题：Borrowed degree forms/);
  assert.ok(manual.morphologyTables.some((item) => item.overrides.some(({ value }) => value === "panusi")));
  assert.equal(entryByLemma(converted, "none").morphologyTables.length, 0);

  const withDefinitionTags = structuredClone(legacy);
  const mixed = entryByLemma(withDefinitionTags, "kasa");
  mixed.tags = ["base"];
  mixed.definitions = [
    { id: "def-conversion-n", meaning: "noun sense", tags: ["n"] },
    { id: "def-conversion-v", meaning: "verb sense", tags: ["v"] },
    { id: "def-conversion-empty", meaning: "other", tags: [] },
  ];
  const withEarlierEmptyGroup = structuredClone(withDefinitionTags);
  withEarlierEmptyGroup.morphology.templateGroups.unshift({ id: "empty-blocker", matchTags: ["v"], tables: [] });
  for (const input of [withDefinitionTags, withEarlierEmptyGroup]) {
    const next = importDictionaryFromJsonPayload(input).dictionary;
    const entry = entryByLemma(next, "kasa");
    const contexts = morphologyMatchContexts(entry);
    const actual = resolveAutomaticTables(contexts, next.morphology).contexts;
    assert.deepEqual(actual, contexts.map(({ definitionId, tags }) => ({
      definitionId,
      tableIds: legacyAssignedTables(input, mixed, tags).map(({ tableId }) => tableId),
    })));
  }
  const strayInput = structuredClone(legacy);
  const strayGroup = entryByLemma(strayInput, "kasa").morphologyGroups[0];
  const keptTableId = Object.keys(strayGroup.overrides)[0];
  strayGroup.overrides[keptTableId]["99,0"] = "outside-rows";
  strayGroup.overrides["table-outside-group"] = { "0,0": "outside-group" };
  const strayImport = importDictionaryFromJsonPayload(strayInput);
  assert.deepEqual(entryByLemma(strayImport.dictionary, "kasa").morphologyTables, entryByLemma(converted, "kasa").morphologyTables,
    "overrides outside the old table or group are dropped without changing the kept ones");
  assert.equal(strayImport.report.warnings.filter((warning) => warning.startsWith("Dropped legacy morphology override")).length, 2);

  const dormantInput = structuredClone(legacy);
  entryByLemma(dormantInput, "kasa").tags = ["unmatched"];
  const dormant = importDictionaryFromJsonPayload(dormantInput).dictionary;
  const dormantEntry = entryByLemma(dormant, "kasa");
  assert.deepEqual(dormantEntry.morphologyTables[0], overlay);
  assert.deepEqual(createMorphologyResolver(dormant.morphology).entryTableIds(dormantEntry), []);
  await repository.importDictionarySnapshot(dormant);
  assert.deepEqual((await repository.getEntry(dormant.id, dormantEntry.id)).morphologyTables, dormantEntry.morphologyTables);
}

async function checkStorageAndReferences(repository) {
  const { morphology, parent, child, grandchild } = inheritedMorphology();
  const id = "dict-morphology-stage-one";
  const draft = {
    id, name: "Morphology stage one", morphology,
    entries: [
      {
        id: "manual", lemma: "manual", morphologyMode: "manual",
        morphologyTables: [
          { tableId: child.id, notes: "Selected", overrides: [morphologyFormOverride(parent, 1, 0, "manual-b")] },
          { tableId: grandchild.id, notes: "Manual leaf notes", overrides: [morphologyFormOverride(parent, 0, 0, "unique")] },
        ],
      },
      {
        id: "active", lemma: "active", tags: ["n", "special", "rare"],
        morphologyTables: [{ tableId: grandchild.id, notes: "Active leaf notes", overrides: [morphologyFormOverride(parent, 1, 0, "active-b")] }],
      },
      {
        id: "dormant", lemma: "dormant", tags: ["unmatched"],
        morphologyTables: [
          { tableId: child.id, overrides: [absent(parent, 1, 0)] },
          { tableId: grandchild.id, notes: "Dormant leaf notes", overrides: [] },
        ],
      },
      ...Array.from({ length: 52 }, (_, index) => ({
        id: `extra-${index}`, lemma: `extra-${index}`,
        morphologyTables: [{ tableId: grandchild.id, notes: "Retained while dormant" }],
      })),
      { id: "plain", lemma: "plain", tags: ["n"] },
    ],
  };
  const { dictionary } = importDictionaryFromJsonPayload(draft);
  await repository.importDictionarySnapshot(dictionary);
  const db = repository.openDictionaryDatabase(id);
  const snapshot = () => repository.getDictionarySnapshot(id);
  const save = (morphology, options = {}) => callApi(repository, "PUT", `/api/dictionaries/${id}/morphology`, { morphology, ...options });
  const positions = db.prepare(`
    SELECT template_table_id AS tableId, row_id AS rowId, column_id AS columnId, position AS sourcePosition,
      raw_value AS value
    FROM entry_morphology_search_values WHERE entry_id = ? ORDER BY position
  `);
  const projected = (entryId) => positions.all(entryId).map((row) => ({ ...row }));
  const checkProjection = (current, entryId) => {
    const entry = current.entries.find((item) => item.id === entryId);
    const values = morphologySearchValueRecords(entry, current);
    assert.deepEqual(projected(entryId), values);
    return values;
  };
  const starting = await snapshot();
  const invalidEntry = (override) => callApi(repository, "PUT", `/api/dictionaries/${id}/entries/manual`, {
    entry: { ...starting.entries[0], morphologyTables: [{ tableId: child.id, overrides: override }] },
  });
  await assert.rejects(invalidEntry([{ ...at(parent, 0, 0), kind: "form", value: " " }]), expectApiError("invalid_morphology_override"));
  await assert.rejects(invalidEntry([absent(parent, 0, 0), absent(parent, 0, 0)]), expectApiError("invalid_morphology_override"));
  await assert.rejects(invalidEntry([{ ...absent(parent, 0, 0), rowId: "missing" }]), expectApiError("invalid_morphology_override"));
  await assert.rejects(invalidEntry([refer(parent, 0, 0, 0, 1)]), expectApiError("invalid_morphology_override"));
  await assert.rejects(save(starting.morphology, { confirmReferenceRemoval: "true" }), expectApiError("invalid_morphology_payload"));
  const someSummary = { referenceCount: 1, targets: [{ tableId: parent.id, entryCount: 1 }] };
  await assert.rejects(save(starting.morphology, { confirmReferenceRemoval: true }), expectApiError("invalid_morphology_payload"),
    "a confirmation carries the summary the user saw");
  await assert.rejects(save(starting.morphology, { confirmedReferences: someSummary }), expectApiError("invalid_morphology_payload"));
  await assert.rejects(save(starting.morphology, {
    confirmReferenceRemoval: true, confirmedReferences: { referenceCount: 1, targets: [{ tableId: parent.id, entryCount: 0 }] },
  }), expectApiError("invalid_morphology_payload"));

  const brokenParent = structuredClone(starting.morphology);
  brokenParent.slots[0].tables.shift();
  await assert.rejects(save(brokenParent, { confirmReferenceRemoval: true, confirmedReferences: someSummary }), (error) => (
    expectApiError("morphology_table_has_children", 409)(error)
      && error.details.tableId === parent.id && error.details.childTableIds.includes(child.id)
  ));
  assert.deepEqual(await snapshot(), starting);
  checkProjection(starting, "active");
  checkProjection(starting, "manual");
  assert.deepEqual(projected("dormant"), []);

  const inheritedChange = structuredClone(starting.morphology);
  const root = findTable(inheritedChange, parent.id);
  const blankCoord = at(root, 2, 0);
  const changedCell = root.cells.find((cell) => cell.rowId === blankCoord.rowId && cell.columnId === blankCoord.columnId);
  changedCell.sourceText = "{}-inherited";
  await save(inheritedChange);
  const afterChange = await snapshot();
  const descendantForms = checkProjection(afterChange, "active");
  assert.ok(descendantForms.some(({ value }) => value === "active-inherited"));

  const newRootColumn = { id: "mcol-new", label: "Inserted before two" };
  const insertAndMove = structuredClone(afterChange.morphology);
  const changedRoot = findTable(insertAndMove, parent.id);
  changedRoot.columns.splice(1, 0, newRootColumn);
  changedRoot.rows.reverse();
  const beforeByCell = new Map(descendantForms.map(({ rowId, columnId, value }) => [JSON.stringify([rowId, columnId]), value]));
  await save(insertAndMove);
  const afterInsert = await snapshot();
  const insertedForms = checkProjection(afterInsert, "active");
  assert.equal(insertedForms.length, beforeByCell.size);
  for (const { rowId, columnId, value } of insertedForms) {
    assert.equal(value, beforeByCell.get(JSON.stringify([rowId, columnId])));
  }

  const { morphology: detached, detachment } = detachMorphologyTable(afterInsert.morphology, child.id);
  await assert.rejects(save(detached), expectApiError("invalid_morphology_inheritance"));
  assert.equal((await save(detached, { detachments: [detachment] })).statusCode, 200);
  const afterDetach = await snapshot();
  assert.equal(findTable(afterDetach.morphology, child.id).inheritsFrom, null);
  const detachedSearchValues = checkProjection(afterDetach, "active");
  assert.deepEqual(detachedSearchValues.map(({ value, sourcePosition }) => [sourcePosition, value]),
    insertedForms.map(({ value, sourcePosition }) => [sourcePosition, value]));
  assert.deepEqual(detachedSearchValues.map(({ rowId, columnId }) => [rowId, columnId]),
    insertedForms.map(({ rowId, columnId }) => [detachment.rowIdMap[rowId], detachment.columnIdMap[columnId]]));
  const detachedResolver = createMorphologyResolver(afterDetach.morphology);
  const detachedShape = detachedResolver.tableShape(child.id);
  assert.equal(detachedResolver.tableShape(grandchild.id).id, child.id);
  assert.ok(findTable(afterDetach.morphology, child.id).cells.some((cell) => (
    cell.kind === "refer" && cell.targetColumnId === detachment.columnIdMap[parent.columns[0].id]
  )));
  const manualAfterDetach = await repository.getEntry(id, "manual");
  assert.equal(manualAfterDetach.morphologyTables[1].overrides[0].rowId, detachment.rowIdMap[parent.rows[0].id]);
  assert.equal(manualAfterDetach.morphologyTables[1].overrides[0].value, "unique");

  const differentRoot = structuredClone(afterDetach.morphology);
  Object.assign(findTable(differentRoot, grandchild.id), { inheritsFrom: parent.id, cells: [] });
  await assert.rejects(save(differentRoot), (error) => expectApiError("invalid_morphology_inheritance")(error)
    && error.details.reason === "parent_has_different_root");
  const removedRowId = detachment.rowIdMap[parent.rows[1].id];
  const removedRow = removeMorphologyAxisItem(afterDetach.morphology, child.id, "rows", removedRowId);
  const losingCoordinate = { rowId: detachment.rowIdMap[parent.rows[2].id], columnId: detachment.columnIdMap[parent.columns[2].id] };
  await assert.rejects(save(removedRow), (error) => {
    assert.ok(expectApiError("morphology_references_in_use", 409)(error));
    assert.equal(error.details.referenceCount, 3);
    assert.deepEqual(error.details.targets, [{ tableId: child.id, rowId: removedRowId, label: "B", entryCount: 3 }]);
    assert.deepEqual(error.details.references.map(({ entryId, tableId, reason }) => [entryId, tableId, reason]), [
      ["manual", child.id, "override"], ["active", grandchild.id, "override"], ["dormant", child.id, "override"],
    ]);
    return true;
  });
  assert.deepEqual(await snapshot(), afterDetach, "an unconfirmed deletion preserves all main and derived data");
  assert.deepEqual(projected("active"), detachedSearchValues);
  const rowSummary = { referenceCount: 3, targets: [{ tableId: child.id, rowId: removedRowId, entryCount: 3 }] };
  await assert.rejects(save(removedRow, {
    confirmReferenceRemoval: true, confirmedReferences: { ...rowSummary, referenceCount: 2 },
  }), (error) => expectApiError("morphology_references_in_use", 409)(error) && error.details.referenceCount === 3,
  "a stale summary returns the current one");
  assert.deepEqual(await snapshot(), afterDetach, "a stale confirmation writes nothing");
  await save(removedRow, { confirmReferenceRemoval: true, confirmedReferences: rowSummary });
  const afterRow = await snapshot();
  const afterRowResolver = createMorphologyResolver(afterRow.morphology);
  assert.equal(afterRowResolver.tableShape(grandchild.id).rows.length, detachedShape.rows.length - 1);
  assert.equal(afterRowResolver.cellResolver(grandchild.id, "active")(losingCoordinate.rowId, losingCoordinate.columnId).kind, "blank");
  assert.equal((await repository.getEntry(id, "dormant")).morphologyTables.length, 1);
  checkProjection(afterRow, "active");

  const removedLeaf = structuredClone(afterRow.morphology);
  removedLeaf.slots[0].tables.pop();
  await assert.rejects(save(removedLeaf), (error) => {
    assert.ok(expectApiError("morphology_references_in_use", 409)(error));
    assert.equal(error.details.referenceCount, 56);
    assert.deepEqual(error.details.targets, [{ tableId: grandchild.id, label: "Grandchild", entryCount: 55 }]);
    assert.equal(error.details.references.length, 50);
    assert.deepEqual(new Set(error.details.references.map(({ reason }) => reason)), new Set(["manual_table", "overlay", "override"]));
    return true;
  });
  assert.deepEqual(await snapshot(), afterRow);
  const plain = await repository.getEntry(id, "plain");
  await callApi(repository, "PUT", `/api/dictionaries/${id}/entries/plain`, { entry: { ...plain, notes: "changed meanwhile" } });
  await save(removedLeaf, {
    confirmReferenceRemoval: true,
    confirmedReferences: { referenceCount: 56, targets: [{ tableId: grandchild.id, entryCount: 55 }] },
  });
  const final = await snapshot();
  assert.deepEqual(final.entries.find(({ id: key }) => key === "manual").morphologyTables.map(({ tableId }) => tableId), [child.id]);
  assert.deepEqual(final.entries.find(({ id: key }) => key === "dormant").morphologyTables, []);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM entry_search_values WHERE source_type = 'morphologyTable' AND source_id = ?").get(grandchild.id).count, 0);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  checkProjection(final, "active");
  assert.deepEqual(importDictionaryFromJsonPayload(final).dictionary.morphology, final.morphology);
}

async function checkOldDatabaseIsOpenedWithoutWrites(repository) {
  await repository.ensureDataStore();
  const id = "dict-old-morphology";
  const databasePath = repository.dictionaryPath(id);
  const db = new DatabaseSync(databasePath);
  db.exec("CREATE TABLE morphology_template_tables(id TEXT PRIMARY KEY, group_id TEXT NOT NULL)");
  db.close();
  const before = await fs.readFile(databasePath);
  assert.throws(() => repository.openDictionaryDatabase(id), expectApiError("incompatible_sqlite_schema", 409));
  assert.deepEqual(await fs.readFile(databasePath), before, "schema rejection occurs before writing to the old database");
}

// The template page detaches two saved levels, edits the new axes and saves once: the overrides
// of both tables follow the coordinates they carried on.
async function checkDraftDetachmentSave(repository) {
  const { morphology, parent, child, grandchild } = inheritedMorphology();
  const id = "dict-morphology-draft-detach";
  const { dictionary } = importDictionaryFromJsonPayload({
    id, name: "Draft detachments", morphology,
    entries: [{
      id: "chained", lemma: "chained", morphologyMode: "manual",
      morphologyTables: [
        { tableId: child.id, overrides: [morphologyFormOverride(parent, 0, 1, "child-a")] },
        { tableId: grandchild.id, overrides: [morphologyFormOverride(parent, 2, 2, "grand-c")] },
      ],
    }],
  });
  await repository.importDictionarySnapshot(dictionary);
  const saved = (await repository.getDictionarySnapshot(id)).morphology;
  let lineage = draftModel.initialLineage(saved);
  const first = draftModel.detachTable(saved, child.id, lineage);
  const second = draftModel.detachTable(first.morphology, grandchild.id, first.lineage);
  lineage = second.lineage;
  let next = draftModel.insertAxisItem(second.morphology, grandchild.id, "rows", 0).morphology;
  const grandchildTable = () => draftModel.findTable(next, grandchild.id);
  next = draftModel.moveAxisItem(next, grandchild.id, "columns", grandchildTable().columns.at(-1).id, 0).morphology;
  const carried = (axis, savedId) => grandchildTable()[axis].find(({ id: current }) => lineage[current] === savedId).id;
  next = draftModel.removeAxisItem(next, grandchild.id, "rows", carried("rows", parent.rows[1].id)).morphology;
  await callApi(repository, "PUT", `/api/dictionaries/${id}/morphology`, {
    morphology: draftModel.morphologyForSave(next),
    detachments: draftModel.detachmentsForSave(next, saved, lineage),
  });
  const entry = await repository.getEntry(id, "chained");
  const childTable = draftModel.findTable(next, child.id);
  const childCarried = (axis, savedId) => childTable[axis].find(({ id: current }) => lineage[current] === savedId).id;
  assert.deepEqual(entry.morphologyTables.map(({ overrides }) => overrides.map(({ rowId, columnId, value }) => [rowId, columnId, value])), [
    [[childCarried("rows", parent.rows[0].id), childCarried("columns", parent.columns[1].id), "child-a"]],
    [[carried("rows", parent.rows[2].id), carried("columns", parent.columns[2].id), "grand-c"]],
  ], "each detached table keeps its overrides on the coordinates it carried on");
  const resolver = createMorphologyResolver((await repository.getDictionarySnapshot(id)).morphology);
  assert.equal(resolver.tableShape(grandchild.id).id, grandchild.id);
  assert.equal(resolver.tableShape(child.id).rows.length, parent.rows.length);
}

async function runMorphologyAcceptanceCheck() {
  requireSqliteRuntime("morphology acceptance check");
  checkAssignment();
  checkCellResolution();
  checkBoundaryValidation();
  checkDisplayAlgorithms();
  const { dataDir, repository, cleanup } = await createTempSqliteRepository("conlexicon-morphology-acceptance-");
  try {
    await checkLegacyConversion(repository, dataDir);
    await checkStorageAndReferences(repository);
    await checkDraftDetachmentSave(repository);
    await checkOldDatabaseIsOpenedWithoutWrites(repository);
  } finally {
    await cleanup();
  }
}

if (require.main === module) {
  runMorphologyAcceptanceCheck().then(() => {
    console.log("Morphology assignment, cell resolution, SQLite writes, legacy conversion and display checks passed.");
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { runMorphologyAcceptanceCheck };
