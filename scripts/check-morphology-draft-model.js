#!/usr/bin/env node
// Template page draft operations: rows, columns, cells, inheritance, undo and the save payload.
const assert = require("node:assert/strict");
const draftModel = require("../lib/morphology-draft-model");
const { createMorphologyResolver, normalizeMorphology } = require("../lib/morphology-model");

let counter = 0;
const createId = (prefix) => `${prefix}-${(counter += 1)}`;
const options = { createId };
const cellsOf = (morphology, tableId) => draftModel.findTable(morphology, tableId).cells;
const own = (morphology, tableId, rowId, columnId) => draftModel.ownCell(draftModel.findTable(morphology, tableId), rowId, columnId);
const rule = (sourceText) => ({ kind: "rule", sourceText });

function baseMorphology() {
  const root = {
    id: "root", title: "Root", notes: "", inheritsFrom: null,
    matchRules: [{ all: ["n"], none: [] }],
    rows: [{ id: "r1", label: "nom" }, { id: "r2", label: "acc" }, { id: "r3", label: "gen" }],
    columns: [{ id: "c1", label: "sg" }, { id: "c2", label: "pl" }],
    cells: [
      { rowId: "r1", columnId: "c1", ...rule("{}") },
      { rowId: "r3", columnId: "c1", ...rule("{}-s") },
      { rowId: "r2", columnId: "c1", kind: "refer", targetRowId: "r3", targetColumnId: "c1" },
    ],
  };
  const child = {
    id: "child", title: "Child", notes: "", inheritsFrom: "root",
    matchRules: [{ all: ["n", "irr"], none: [] }],
    cells: [{ rowId: "r3", columnId: "c2", kind: "absent" }],
  };
  const other = {
    id: "other", title: "Other", notes: "", inheritsFrom: null,
    matchRules: [{ all: ["n"], none: [] }, { all: ["archaic"], none: [] }],
    rows: [{ id: "o1", label: "" }], columns: [{ id: "oc1", label: "" }], cells: [],
  };
  return normalizeMorphology({
    functions: {},
    slots: [
      { id: "s1", name: "", tables: [root, child, other] },
      { id: "s2", name: "", tables: [{ ...other, id: "lonely", rows: [{ id: "l1" }], columns: [{ id: "lc1" }] }] },
    ],
  });
}

function checkAxisRemovalUndo() {
  const saved = baseMorphology();
  const removal = draftModel.removeAxisItem(saved, "root", "rows", "r3");
  assert.equal(removal.clearedRootReferenceCount, 1, "acc→gen reference is cleared with the gen row");
  assert.equal(own(removal.morphology, "root", "r2", "c1"), null, "a cleared root reference becomes unfilled");
  assert.deepEqual(cellsOf(removal.morphology, "child"), [], "child cells on the removed row go too");

  // Unrelated edits after the removal survive the undo; a re-edited reference cell keeps the edit.
  let edited = draftModel.setRuleText(removal.morphology, "root", "r1", "c2", "{}-i").morphology;
  edited = draftModel.setRuleText(edited, "root", "r2", "c1", "{}-m").morphology;
  assert.ok(!draftModel.draftIsDirty(draftModel.applyUndo(removal.morphology, removal.undo).morphology, saved),
    "undoing the only change leaves nothing to save, whatever order the cells come back in");
  const undone = draftModel.applyUndo(edited, removal.undo);
  assert.deepEqual(undone.morphology.slots[0].tables[0].rows.map(({ id }) => id), ["r1", "r2", "r3"]);
  assert.equal(own(undone.morphology, "root", "r1", "c2").sourceText, "{}-i", "edits elsewhere are kept");
  assert.equal(own(undone.morphology, "root", "r2", "c1").sourceText, "{}-m", "a re-edited reference cell is not overwritten");
  assert.equal(own(undone.morphology, "root", "r3", "c1").sourceText, "{}-s");
  assert.equal(own(undone.morphology, "child", "r3", "c2").kind, "absent");

  // An empty saved row is still removable and restorable.
  const emptyRow = draftModel.removeAxisItem(saved, "root", "columns", "c2");
  assert.deepEqual(draftModel.applyUndo(emptyRow.morphology, emptyRow.undo).morphology.slots[0].tables[0].columns.map(({ id }) => id), ["c1", "c2"]);

  // Inserting next to a neighbour that was moved still finds it.
  const moved = draftModel.moveAxisItem(removal.morphology, "root", "rows", "r1", 1).morphology;
  const restored = draftModel.applyUndo(moved, removal.undo).morphology;
  assert.deepEqual(draftModel.findTable(restored, "root").rows.map(({ id }) => id), ["r2", "r3", "r1"],
    "without a next neighbour the row returns right after its previous one");
}

function checkUndoCycleConflict() {
  const saved = baseMorphology();
  const removal = draftModel.removeAxisItem(saved, "root", "rows", "r3");
  // nom now refers to acc, whose old record (→ gen) comes back with the row; a restored
  // gen → nom record would then close nom → acc → gen → nom.
  let draft = draftModel.setCellRecord(removal.morphology, "root", "r1", "c1", { kind: "refer", targetRowId: "r2", targetColumnId: "c1" }).morphology;
  const fill = draftModel.insertAxisItem(draft, "root", "rows", 3, options);
  draft = fill.morphology;
  const result = draftModel.applyUndo(draft, {
    ...removal.undo,
    removedCells: [{ tableId: "root", cell: { rowId: "r3", columnId: "c1", kind: "refer", targetRowId: "r1", targetColumnId: "c1" } }],
  });
  assert.equal(result.error?.kind, "cycle", "an undo that closes a loop reports the conflict and changes nothing");
}

function checkTableDeletionUndo() {
  const saved = baseMorphology();
  assert.equal(draftModel.deleteTable(saved, "root").error.kind, "has_children");
  const deleted = draftModel.deleteTable(saved, "lonely");
  assert.equal(deleted.morphology.slots.length, 1, "removing a slot's only table removes the slot");
  const moved = draftModel.createTable(deleted.morphology, options).morphology;
  const undone = draftModel.applyUndo(moved, deleted.undo).morphology;
  assert.deepEqual(undone.slots.map(({ id }) => id).slice(0, 2), ["s1", "s2"], "slot and table come back in place");
  assert.equal(undone.slots[1].tables[0].id, "lonely");

  const inSlot = draftModel.deleteTable(saved, "other");
  const elsewhere = draftModel.moveTableToSlot(inSlot.morphology, "child", "s2").morphology;
  const back = draftModel.applyUndo(elsewhere, inSlot.undo).morphology;
  assert.deepEqual(back.slots[0].tables.map(({ id }) => id), ["root", "other"]);
  assert.deepEqual(back.slots[1].tables.map(({ id }) => id), ["lonely", "child"], "tables moved later keep their place");
}

function checkFillAndCells() {
  const saved = baseMorphology();
  const fill = draftModel.fillAxisReferences(saved, "root", "rows", "r1", "r3");
  assert.equal(fill.overwrittenCount, 1);
  assert.deepEqual(own(fill.morphology, "root", "r1", "c2"), { rowId: "r1", columnId: "c2", kind: "refer", targetRowId: "r3", targetColumnId: "c2" });
  const reedited = draftModel.setRuleText(fill.morphology, "root", "r1", "c2", "{}-x").morphology;
  const undone = draftModel.applyUndo(reedited, fill.undo).morphology;
  assert.equal(own(undone, "root", "r1", "c1").sourceText, "{}", "overwritten records come back");
  assert.equal(own(undone, "root", "r1", "c2").sourceText, "{}-x", "cells edited after the fill are left alone");
  assert.equal(draftModel.fillAxisReferences(saved, "root", "columns", "c2", "c1").undo, null,
    "a fill over unfilled cells only leaves nothing to undo");

  const loop = draftModel.setCellRecord(saved, "root", "r3", "c1", { kind: "refer", targetRowId: "r2", targetColumnId: "c1" });
  assert.equal(loop.error.kind, "cycle");
  assert.equal(loop.error.tableId, "root");

  // A child's own record hides a parent reference; clearing it by menu is refused, typing is not.
  assert.equal(draftModel.setCellRecord(saved, "child", "r3", "c1", { kind: "refer", targetRowId: "r2", targetColumnId: "c1" }).error.kind,
    "cycle", "child gen → inherited acc → gen loops only once inheritance is applied");
  let risk = draftModel.setCellRecord(saved, "root", "r3", "c2", { kind: "refer", targetRowId: "r1", targetColumnId: "c2" }).morphology;
  risk = draftModel.setRuleText(risk, "child", "r3", "c2", "{}-c").morphology;
  risk = draftModel.setCellRecord(risk, "child", "r1", "c2", { kind: "refer", targetRowId: "r3", targetColumnId: "c2" }).morphology;
  assert.equal(draftModel.setCellRecord(risk, "child", "r3", "c2", null).error.kind, "cycle", "restoring inheritance by menu is refused");
  const typed = draftModel.setRuleText(risk, "child", "r3", "c2", "  ").morphology;
  assert.deepEqual(draftModel.referenceCycles(typed).map(({ tableId }) => tableId), ["child"], "typing is kept and the loop is reported");
}

function checkInheritanceAndDetachment() {
  const saved = baseMorphology();
  const withGrandchild = draftModel.createChildTable(saved, "child", options);
  const grandchildId = withGrandchild.tableId;
  assert.deepEqual(draftModel.parentCandidates(withGrandchild.morphology, "child").map(({ id }) => id), ["root"]);
  assert.deepEqual(draftModel.parentCandidates(withGrandchild.morphology, grandchildId).map(({ id }) => id), ["root", "child"]);
  assert.equal(draftModel.detachBlockedReason(withGrandchild.morphology, saved, grandchildId), "");

  let lineage = draftModel.initialLineage(saved);
  const first = draftModel.detachTable(saved, "child", lineage, options);
  lineage = first.lineage;
  const childShape = draftModel.findTable(first.morphology, "child");
  assert.equal(childShape.inheritsFrom, null);
  assert.equal(childShape.cells.length, 4, "the detached table copies what it inherited");
  const detachments = draftModel.detachmentsForSave(first.morphology, saved, lineage);
  assert.deepEqual(Object.keys(detachments[0].rowIdMap), ["r1", "r2", "r3"]);

  // A saved child moved under a new child blocks detaching that new child until saved.
  const newParent = draftModel.createChildTable(saved, "root", options);
  const moved = draftModel.changeParent(newParent.morphology, "child", newParent.tableId).morphology;
  assert.equal(draftModel.detachBlockedReason(moved, saved, newParent.tableId), "save_first");

  assert.ok(draftModel.undoSurvivesDetach({ type: "fillAxis", tableId: "other" }, first.family));
  assert.ok(!draftModel.undoSurvivesDetach({ type: "fillAxis", tableId: "child" }, first.family));
}

function checkRulesAndPayload() {
  const saved = baseMorphology();
  // Imported tags may contain separators; untouched inputs keep them whole.
  const withSeparatorTag = draftModel.updateTable(saved, "other", {
    matchRules: [{ all: ["a, b"], none: ["c"] }, { all: [], none: [] }],
  }).morphology;
  const retitled = draftModel.updateTable(withSeparatorTag, "other", { title: "Renamed" }).morphology;
  const payload = draftModel.morphologyForSave(retitled);
  assert.deepEqual(draftModel.findTable(payload, "other").matchRules, [{ all: ["a, b"], none: ["c"] }],
    "blank rows are dropped and untouched tag arrays are kept");
  const editedNone = draftModel.updateTable(retitled, "other", {
    matchRules: [{ all: ["a, b"], none: ["c"], noneText: "c，d" }],
  }).morphology;
  assert.deepEqual(draftModel.findTable(draftModel.morphologyForSave(editedNone), "other").matchRules, [{ all: ["a, b"], none: ["c", "d"] }]);
  assert.ok(!("rows" in draftModel.findTable(payload, "child")), "children carry no shape");
  assert.ok(!draftModel.draftIsDirty(saved, saved));
  assert.ok(draftModel.draftIsDirty(retitled, saved));

  const conflicting = draftModel.updateTable(saved, "other", { matchRules: [{ all: ["n"], none: [], noneText: "n" }, { all: [], none: [], noneText: "x" }] }).morphology;
  assert.deepEqual(draftModel.ruleRowErrors(conflicting).map(({ index, reason }) => [index, reason]),
    [[0, "conflicting_tags"], [1, "empty_all"]]);

  const coverage = draftModel.slotCoverage(saved.slots[0]);
  assert.deepEqual(coverage.get("child"), [
    { tableId: "root", rowIndexes: [0], full: true },
    { tableId: "other", rowIndexes: [0], full: false },
  ], "a table covering one of two rule rows is a partial cover");
  assert.deepEqual(coverage.get("root"), []);

  const removal = draftModel.removeAxisItem(saved, "root", "rows", "r3");
  assert.equal(draftModel.clearedTemplateReferenceCount(saved, removal.morphology), 1);
  assert.ok(createMorphologyResolver(draftModel.normalizedDraft(removal.morphology)));
}

function checkSlotArrangement() {
  const saved = baseMorphology();
  const joined = draftModel.moveTableToSlot(saved, "lonely", "s1").morphology;
  assert.equal(joined.slots.length, 1);
  assert.equal(joined.slots[0].tables.at(-1).id, "lonely");
  const extracted = draftModel.extractTableToOwnSlot(joined, "child", options).morphology;
  assert.deepEqual(extracted.slots.map(({ tables }) => tables.map(({ id }) => id)), [["root", "other", "lonely"], ["child"]]);
  const created = draftModel.createTable(extracted, { afterSlotId: extracted.slots[0].id, ...options });
  assert.equal(created.morphology.slots[1].tables[0].id, created.tableId, "a new table follows the selected slot");
  assert.equal(draftModel.moveSlot(created.morphology, created.morphology.slots[2].id, 0).morphology.slots[0].tables[0].id, "child");

  const appended = draftModel.createTable(saved, { slotId: "s2", ...options });
  assert.deepEqual(appended.morphology.slots.map(({ id, tables }) => [id, tables.map((table) => table.id)]), [
    ["s1", ["root", "child", "other"]],
    ["s2", ["lonely", appended.tableId]],
  ], "creating in a slot appends to it and leaves the other slots in place");
}

checkAxisRemovalUndo();
checkUndoCycleConflict();
checkTableDeletionUndo();
checkFillAndCells();
checkInheritanceAndDetachment();
checkRulesAndPayload();
checkSlotArrangement();
console.log("Morphology draft model checks passed.");
