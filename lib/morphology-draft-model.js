(function initMorphologyDraftModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./morphology-model"), require("./tag-model"));
    return;
  }
  root.ConlexiconMorphologyDraft = factory(root.ConlexiconMorphology, root.ConlexiconTags);
})(typeof globalThis !== "undefined" ? globalThis : this, function createMorphologyDraftModel(morphologyModel, tagModel) {
  // Operations on the template page's working copy of a morphology module.
  // Every operation returns a new module and leaves its input untouched. A discrete
  // operation that would close a reference loop returns `{ error }` instead.
  // Undo records are plain data: `applyUndo()` replays them on whatever the draft is now.

  const { createMorphologyResolver, findMorphologyReferenceCycle, morphologyCellKey } = morphologyModel;

  function defaultCreateId(prefix) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  function clone(value) {
    return structuredClone(value);
  }

  function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function allTables(morphology) {
    return morphology.slots.flatMap((slot) => slot.tables);
  }

  function findTable(morphology, tableId) {
    for (const slot of morphology.slots) {
      const table = slot.tables.find(({ id }) => id === tableId);
      if (table) return table;
    }
    return null;
  }

  function locateTable(morphology, tableId) {
    for (let slotIndex = 0; slotIndex < morphology.slots.length; slotIndex += 1) {
      const slot = morphology.slots[slotIndex];
      const index = slot.tables.findIndex(({ id }) => id === tableId);
      if (index >= 0) return { slot, slotIndex, index, table: slot.tables[index] };
    }
    return null;
  }

  function rootTable(morphology, tableId) {
    let table = findTable(morphology, tableId);
    while (table?.inheritsFrom) table = findTable(morphology, table.inheritsFrom);
    return table;
  }

  function childTableIds(morphology, tableId) {
    return allTables(morphology).filter((table) => table.inheritsFrom === tableId).map(({ id }) => id);
  }

  // The table itself and everything that inherits from it, parents before children.
  function descendantTableIds(morphology, tableId) {
    const ids = [tableId];
    for (let index = 0; index < ids.length; index += 1) {
      ids.push(...childTableIds(morphology, ids[index]));
    }
    return ids;
  }

  function newAxisItems(count, prefix, createId) {
    return Array.from({ length: count }, () => ({ id: createId(prefix), label: "" }));
  }

  function clampIndex(index, length) {
    return Math.max(0, Math.min(length, index));
  }

  // Put `item` back next to the neighbours it had when it was removed.
  function insertNearNeighbours(list, item, { previousId, nextId, index }) {
    const nextIndex = nextId ? list.findIndex(({ id }) => id === nextId) : -1;
    if (nextIndex >= 0) {
      list.splice(nextIndex, 0, item);
      return;
    }
    const previousIndex = previousId ? list.findIndex(({ id }) => id === previousId) : -1;
    list.splice(previousIndex >= 0 ? previousIndex + 1 : clampIndex(index, list.length), 0, item);
  }

  // ---- Tables and slots -------------------------------------------------------

  function createTable(morphology, { afterSlotId = null, rows = 2, columns = 2, createId = defaultCreateId } = {}) {
    const next = clone(morphology);
    const table = {
      id: createId("mtable"),
      title: "",
      notes: "",
      matchRules: [],
      inheritsFrom: null,
      rows: newAxisItems(rows, "mrow", createId),
      columns: newAxisItems(columns, "mcol", createId),
      cells: [],
      createdAt: "",
      updatedAt: "",
    };
    const slotIndex = next.slots.findIndex(({ id }) => id === afterSlotId);
    next.slots.splice(slotIndex >= 0 ? slotIndex + 1 : next.slots.length, 0, newSlot([table], createId));
    return { morphology: next, tableId: table.id };
  }

  function newSlot(tables, createId) {
    return { id: createId("mslot"), name: "", tables, createdAt: "", updatedAt: "" };
  }

  function createChildTable(morphology, parentId, { createId = defaultCreateId } = {}) {
    const next = clone(morphology);
    const location = locateTable(next, parentId);
    const table = {
      id: createId("mtable"),
      title: "",
      notes: "",
      matchRules: [],
      inheritsFrom: parentId,
      cells: [],
      createdAt: "",
      updatedAt: "",
    };
    location.slot.tables.splice(location.index + 1, 0, table);
    return { morphology: next, tableId: table.id };
  }

  function updateTable(morphology, tableId, changes) {
    const next = clone(morphology);
    Object.assign(findTable(next, tableId), changes);
    return { morphology: next };
  }

  function renameSlot(morphology, slotId, name) {
    const next = clone(morphology);
    const slot = next.slots.find(({ id }) => id === slotId);
    slot.name = name;
    return { morphology: next };
  }

  function moveSlot(morphology, slotId, toIndex) {
    const next = clone(morphology);
    const from = next.slots.findIndex(({ id }) => id === slotId);
    const [slot] = next.slots.splice(from, 1);
    next.slots.splice(clampIndex(toIndex, next.slots.length), 0, slot);
    return { morphology: next };
  }

  function moveTableInSlot(morphology, tableId, toIndex) {
    const next = clone(morphology);
    const { slot, index } = locateTable(next, tableId);
    const [table] = slot.tables.splice(index, 1);
    slot.tables.splice(clampIndex(toIndex, slot.tables.length), 0, table);
    return { morphology: next };
  }

  function takeTable(next, tableId) {
    const { slot, slotIndex, index, table } = locateTable(next, tableId);
    slot.tables.splice(index, 1);
    if (!slot.tables.length) next.slots.splice(slotIndex, 1);
    return table;
  }

  // Joining another slot appends to its end; the emptied source slot disappears.
  function moveTableToSlot(morphology, tableId, slotId) {
    const next = clone(morphology);
    const table = takeTable(next, tableId);
    next.slots.find(({ id }) => id === slotId).tables.push(table);
    return { morphology: next };
  }

  function extractTableToOwnSlot(morphology, tableId, { createId = defaultCreateId } = {}) {
    const next = clone(morphology);
    const { slot, slotIndex, index } = locateTable(next, tableId);
    const [table] = slot.tables.splice(index, 1);
    next.slots.splice(slotIndex + 1, 0, newSlot([table], createId));
    return { morphology: next };
  }

  function deleteTable(morphology, tableId) {
    const children = childTableIds(morphology, tableId);
    if (children.length) return { error: { kind: "has_children", tableId, childTableIds: children } };
    const next = clone(morphology);
    const { slot, slotIndex, index, table } = locateTable(next, tableId);
    const { tables, ...slotFields } = slot;
    const undo = {
      type: "deleteTable",
      table,
      slot: slotFields,
      slotRemoved: tables.length === 1,
      slotIndex,
      previousSlotId: next.slots[slotIndex - 1]?.id || null,
      nextSlotId: next.slots[slotIndex + 1]?.id || null,
      index,
      previousTableId: tables[index - 1]?.id || null,
      nextTableId: tables[index + 1]?.id || null,
    };
    takeTable(next, tableId);
    return { morphology: next, undo };
  }

  function undoDeleteTable(next, record) {
    if (findTable(next, record.table.id)) return { invalid: true };
    const slot = next.slots.find(({ id }) => id === record.slot.id);
    if (slot) {
      insertNearNeighbours(slot.tables, record.table, {
        previousId: record.previousTableId,
        nextId: record.nextTableId,
        index: record.index,
      });
    } else {
      insertNearNeighbours(next.slots, { ...record.slot, tables: [record.table] }, {
        previousId: record.previousSlotId,
        nextId: record.nextSlotId,
        index: record.slotIndex,
      });
    }
    return { focusTableId: record.table.id };
  }

  // ---- Rows and columns ---------------------------------------------------------

  const AXIS_FIELDS = {
    rows: { prefix: "mrow", coordinate: "rowId", target: "targetRowId" },
    columns: { prefix: "mcol", coordinate: "columnId", target: "targetColumnId" },
  };

  function insertAxisItem(morphology, rootId, axis, index, { createId = defaultCreateId } = {}) {
    const next = clone(morphology);
    const root = findTable(next, rootId);
    const item = { id: createId(AXIS_FIELDS[axis].prefix), label: "" };
    root[axis].splice(clampIndex(index, root[axis].length), 0, item);
    return { morphology: next, itemId: item.id };
  }

  function moveAxisItem(morphology, rootId, axis, itemId, toIndex) {
    const next = clone(morphology);
    const items = findTable(next, rootId)[axis];
    const [item] = items.splice(items.findIndex(({ id }) => id === itemId), 1);
    items.splice(clampIndex(toIndex, items.length), 0, item);
    return { morphology: next };
  }

  function setAxisLabel(morphology, rootId, axis, itemId, label) {
    const next = clone(morphology);
    findTable(next, rootId)[axis].find(({ id }) => id === itemId).label = label;
    return { morphology: next };
  }

  // Removes a row or column from a root table together with the cells on it in the whole
  // inheritance family, and drops references that pointed at it.
  function removeAxisItem(morphology, rootId, axis, itemId) {
    const next = clone(morphology);
    const root = findTable(next, rootId);
    if (root.inheritsFrom || root[axis].length === 1) {
      throw new RangeError("Morphology axes can only be removed from a root table and cannot be empty");
    }
    const { coordinate, target } = AXIS_FIELDS[axis];
    const removedCells = [];
    const clearedReferences = [];
    descendantTableIds(next, rootId).forEach((tableId) => {
      const table = findTable(next, tableId);
      table.cells = table.cells.filter((cell) => {
        if (cell[coordinate] === itemId) {
          removedCells.push({ tableId, cell });
          return false;
        }
        if (cell.kind === "refer" && cell[target] === itemId) {
          clearedReferences.push({ tableId, cell });
          return false;
        }
        return true;
      });
    });
    const index = root[axis].findIndex(({ id }) => id === itemId);
    const [item] = root[axis].splice(index, 1);
    return {
      morphology: next,
      undo: {
        type: "removeAxis",
        tableId: rootId,
        axis,
        item,
        index,
        previousId: root[axis][index - 1]?.id || null,
        nextId: root[axis][index]?.id || null,
        removedCells,
        clearedReferences,
      },
      clearedRootReferenceCount: clearedReferences.filter(({ tableId }) => tableId === rootId).length,
      clearedChildReferenceCount: clearedReferences.filter(({ tableId }) => tableId !== rootId).length,
    };
  }

  function undoRemoveAxis(next, record) {
    const root = findTable(next, record.tableId);
    if (!root || root.inheritsFrom || root[record.axis].some(({ id }) => id === record.item.id)) {
      return { invalid: true };
    }
    insertNearNeighbours(root[record.axis], record.item, record);
    const family = new Set(descendantTableIds(next, root.id));
    const rowIds = new Set(root.rows.map(({ id }) => id));
    const columnIds = new Set(root.columns.map(({ id }) => id));
    const inShape = (rowId, columnId) => rowIds.has(rowId) && columnIds.has(columnId);
    const restore = ({ tableId, cell }) => {
      if (!family.has(tableId) || !inShape(cell.rowId, cell.columnId)) return;
      if (cell.kind === "refer" && !inShape(cell.targetRowId, cell.targetColumnId)) return;
      const table = findTable(next, tableId);
      // A coordinate edited since the removal keeps the newer record.
      if (table.cells.some(({ rowId, columnId }) => rowId === cell.rowId && columnId === cell.columnId)) return;
      table.cells.push(cell);
    };
    record.removedCells.forEach(restore);
    record.clearedReferences.forEach(restore);
    return { focusAxis: { tableId: root.id, axis: record.axis, itemId: record.item.id } };
  }

  // ---- Cells --------------------------------------------------------------------------

  function ownCell(table, rowId, columnId) {
    return table.cells.find((cell) => cell.rowId === rowId && cell.columnId === columnId) || null;
  }

  function writeCell(table, rowId, columnId, record) {
    table.cells = table.cells.filter((cell) => cell.rowId !== rowId || cell.columnId !== columnId);
    if (record) table.cells.push({ rowId, columnId, ...record });
  }

  function referenceCycles(morphology, tableIds = allTables(morphology).map(({ id }) => id)) {
    const resolver = createMorphologyResolver(morphology);
    return tableIds.flatMap((tableId) => {
      const cycle = findMorphologyReferenceCycle(resolver.templateCells(tableId));
      return cycle ? [{ tableId, rowId: cycle.rowId, columnId: cycle.columnId }] : [];
    });
  }

  // Reject a discrete change that closes a loop in a table that had none before it.
  function guardCycles(before, after, tableId) {
    const scope = descendantTableIds(after, tableId);
    const existing = new Set(referenceCycles(before, scope.filter((id) => findTable(before, id))).map(({ tableId: id }) => id));
    const created = referenceCycles(after, scope).filter(({ tableId: id }) => !existing.has(id));
    return created.length ? { error: { kind: "cycle", ...created[0] } } : { morphology: after };
  }

  // Text typed into a rule input: blank text removes the record. Typing never fails, so a
  // loop revealed by clearing a child cell is reported by `referenceCycles()` instead.
  function setRuleText(morphology, tableId, rowId, columnId, sourceText) {
    const next = clone(morphology);
    writeCell(findTable(next, tableId), rowId, columnId, sourceText.trim() ? { kind: "rule", sourceText } : null);
    return { morphology: next };
  }

  // Menu operations on one cell: `record` is `{ kind: "absent" }`, `{ kind: "refer", ... }` or null.
  function setCellRecord(morphology, tableId, rowId, columnId, record) {
    const next = clone(morphology);
    writeCell(findTable(next, tableId), rowId, columnId, record);
    return guardCycles(morphology, next, tableId);
  }

  // "Whole row same as …" refers each cell of the row to the cell in the same column of
  // `targetItemId`; columns work the same way across rows.
  function fillAxisReferences(morphology, tableId, axis, itemId, targetItemId) {
    const next = clone(morphology);
    const table = findTable(next, tableId);
    const shape = rootTable(next, tableId);
    const crossAxis = axis === "rows" ? shape.columns : shape.rows;
    const changes = crossAxis.map(({ id: crossId }) => {
      const [rowId, columnId] = axis === "rows" ? [itemId, crossId] : [crossId, itemId];
      const [targetRowId, targetColumnId] = axis === "rows" ? [targetItemId, crossId] : [crossId, targetItemId];
      const previous = ownCell(table, rowId, columnId);
      const applied = { kind: "refer", targetRowId, targetColumnId };
      writeCell(table, rowId, columnId, applied);
      return { rowId, columnId, previous: previous && stripCoordinate(previous), applied };
    });
    const guarded = guardCycles(morphology, next, tableId);
    if (guarded.error) return guarded;
    const overwritten = changes.filter(({ previous }) => previous);
    return {
      morphology: next,
      overwrittenCount: overwritten.length,
      undo: overwritten.length ? { type: "fillAxis", tableId, axis, itemId, targetItemId, changes } : null,
    };
  }

  function stripCoordinate({ rowId, columnId, ...record }) {
    return record;
  }

  function undoFillAxis(next, record) {
    const table = findTable(next, record.tableId);
    if (!table) return { invalid: true };
    record.changes.forEach(({ rowId, columnId, previous, applied }) => {
      const current = ownCell(table, rowId, columnId);
      if (current && sameJson(stripCoordinate(current), applied)) writeCell(table, rowId, columnId, previous);
    });
    return { focusTableId: table.id };
  }

  // ---- Inheritance --------------------------------------------------------------------

  // A child may move to another table of the same root that is not itself or a descendant.
  function parentCandidates(morphology, tableId) {
    const excluded = new Set(descendantTableIds(morphology, tableId));
    const rootId = rootTable(morphology, tableId).id;
    return allTables(morphology).filter((table) => !excluded.has(table.id) && rootTable(morphology, table.id).id === rootId);
  }

  function changeParent(morphology, tableId, parentId) {
    const next = clone(morphology);
    findTable(next, tableId).inheritsFrom = parentId;
    return guardCycles(morphology, next, tableId);
  }

  function savedTableIds(saved) {
    return new Set(allTables(saved).map(({ id }) => id));
  }

  // A new child that already received saved descendants needs its inheritance saved first,
  // or the server could not relocate their overrides.
  function detachBlockedReason(morphology, saved, tableId) {
    const savedIds = savedTableIds(saved);
    if (savedIds.has(tableId)) return "";
    return descendantTableIds(morphology, tableId).slice(1).some((id) => savedIds.has(id)) ? "save_first" : "";
  }

  // `lineage` maps every current axis ID to the saved axis ID it carries on, if any.
  function initialLineage(saved) {
    const lineage = {};
    allTables(saved).forEach((table) => {
      if (table.inheritsFrom) return;
      [...table.rows, ...table.columns].forEach(({ id }) => {
        lineage[id] = id;
      });
    });
    return lineage;
  }

  function detachTable(morphology, tableId, lineage, { createId = defaultCreateId } = {}) {
    const family = descendantTableIds(morphology, tableId);
    const { morphology: next, detachment } = morphologyModel.detachMorphologyTable(clone(morphology), tableId, createId);
    const nextLineage = { ...lineage };
    [detachment.rowIdMap, detachment.columnIdMap].forEach((map) => Object.entries(map).forEach(([oldId, newId]) => {
      if (lineage[oldId]) nextLineage[newId] = lineage[oldId];
    }));
    const guarded = guardCycles(morphology, next, tableId);
    return guarded.error ? guarded : { morphology: next, lineage: nextLineage, family };
  }

  // Records that address coordinates of a detached family no longer apply.
  function undoSurvivesDetach(record, family) {
    if (!record) return false;
    const ids = new Set(family);
    if (record.type === "deleteTable") return !ids.has(record.table.inheritsFrom);
    if (record.type === "fillAxis") return !ids.has(record.tableId);
    if (record.type === "removeAxis") {
      return ![...record.removedCells, ...record.clearedReferences].some(({ tableId }) => ids.has(tableId));
    }
    return true;
  }

  // ---- Undo ------------------------------------------------------------------------------

  // Applies the record to the current draft. `{ invalid }` means the record no longer fits
  // the draft and should be dropped; `{ error }` (a loop) keeps both the draft and the record.
  function applyUndo(morphology, record) {
    const next = clone(morphology);
    const handlers = { deleteTable: undoDeleteTable, removeAxis: undoRemoveAxis, fillAxis: undoFillAxis };
    const result = handlers[record.type](next, record);
    if (result.invalid) return { invalid: true };
    const shapeProblem = coordinateProblems(next);
    if (shapeProblem) return { invalid: true };
    const cycles = referenceCycles(next);
    const existing = new Set(referenceCycles(morphology).map(({ tableId }) => tableId));
    const created = cycles.find(({ tableId }) => !existing.has(tableId));
    if (created) return { error: { kind: "cycle", ...created } };
    return { morphology: next, ...result };
  }

  // Missing parents or cells outside their shape, which only a stale undo record can cause.
  function coordinateProblems(morphology) {
    const tables = new Map(allTables(morphology).map((table) => [table.id, table]));
    for (const table of tables.values()) {
      if (table.inheritsFrom && !tables.has(table.inheritsFrom)) return { tableId: table.id, reason: "missing_parent" };
      const shape = rootTable(morphology, table.id);
      const rowIds = new Set(shape.rows.map(({ id }) => id));
      const columnIds = new Set(shape.columns.map(({ id }) => id));
      const outside = table.cells.find((cell) => !rowIds.has(cell.rowId) || !columnIds.has(cell.columnId)
        || (cell.kind === "refer" && (!rowIds.has(cell.targetRowId) || !columnIds.has(cell.targetColumnId))));
      if (outside) return { tableId: table.id, reason: "coordinate_outside_shape" };
    }
    return null;
  }

  // ---- Match rules ---------------------------------------------------------------------

  // A rule row keeps its saved tag arrays until the user edits one of its inputs; an edited
  // input stores its text in `allText` / `noneText` and is split only when collected.
  function collectRuleRows(table) {
    return table.matchRules.map((rule, index) => {
      const all = rule.allText !== undefined ? tagModel.parseTagListText(rule.allText) : rule.all;
      const none = rule.noneText !== undefined ? tagModel.parseTagListText(rule.noneText) : rule.none;
      const empty = !all.length && !none.length;
      return { index, all, none, empty, error: empty ? "" : morphologyModel.morphologyMatchRuleError({ all, none }) };
    });
  }

  function ruleRowErrors(morphology) {
    return allTables(morphology).flatMap((table) => collectRuleRows(table)
      .filter(({ error }) => error)
      .map(({ index, error }) => ({ tableId: table.id, index, reason: error })));
  }

  // For each table, which tables of its slot it covers: Y covers a rule row of X when one of
  // Y's rows is strictly more specific. `full` means every rule row of X is covered.
  function slotCoverage(slot) {
    const rules = new Map(slot.tables.map((table) => [
      table.id,
      collectRuleRows(table).filter(({ empty, error }) => !empty && !error),
    ]));
    return new Map(slot.tables.map((table) => {
      const own = rules.get(table.id);
      const covered = slot.tables.filter(({ id }) => id !== table.id).flatMap((other) => {
        const otherRows = rules.get(other.id);
        const rows = otherRows.filter((row) => own.some((rule) => morphologyModel.morphologyRuleMoreSpecific(rule, row)));
        return rows.length ? [{
          tableId: other.id,
          rowIndexes: rows.map(({ index }) => index),
          full: rows.length === otherRows.length,
        }] : [];
      });
      return [table.id, covered];
    }));
  }

  // ---- Saving -----------------------------------------------------------------------------

  function morphologyForSave(morphology) {
    return {
      functions: morphology.functions,
      slots: morphology.slots.map((slot) => ({
        ...slot,
        tables: slot.tables.map((table) => {
          const { rows, columns, ...rest } = table;
          return {
            ...rest,
            ...(table.inheritsFrom ? {} : { rows, columns }),
            matchRules: collectRuleRows(table).filter(({ empty }) => !empty).map(({ all, none }) => ({ all, none })),
          };
        }),
      })),
    };
  }

  function normalizedDraft(morphology) {
    return morphologyModel.normalizeMorphology(morphologyForSave(morphology));
  }

  // Cells are keyed by coordinate, so their order in the array is not an edit.
  function canonicalCells(morphology) {
    return {
      ...morphology,
      slots: morphology.slots.map((slot) => ({
        ...slot,
        tables: slot.tables.map((table) => ({
          ...table,
          cells: [...table.cells].sort((left, right) => (
            left.rowId.localeCompare(right.rowId) || left.columnId.localeCompare(right.columnId)
          )),
        })),
      })),
    };
  }

  function draftIsDirty(morphology, saved) {
    return !sameJson(canonicalCells(normalizedDraft(morphology)), canonicalCells(saved));
  }

  // Saved children that this draft turned into roots, with the saved coordinates they carry on.
  function detachmentsForSave(morphology, saved, lineage) {
    const savedTables = new Map(allTables(saved).map((table) => [table.id, table]));
    const savedResolver = createMorphologyResolver(saved);
    return allTables(morphology).flatMap((table) => {
      if (table.inheritsFrom || !savedTables.get(table.id)?.inheritsFrom) return [];
      const savedShape = savedResolver.tableShape(table.id);
      const map = (current, savedItems) => {
        const savedIds = new Set(savedItems.map(({ id }) => id));
        return Object.fromEntries(current
          .filter(({ id }) => savedIds.has(lineage[id]))
          .map(({ id }) => [lineage[id], id]));
      };
      return [{ tableId: table.id, rowIdMap: map(table.rows, savedShape.rows), columnIdMap: map(table.columns, savedShape.columns) }];
    });
  }

  // Saved template references that the draft dropped because their target row or column is gone.
  function clearedTemplateReferenceCount(saved, morphology) {
    let count = 0;
    allTables(saved).forEach((savedTable) => {
      const table = findTable(morphology, savedTable.id);
      if (!table) return;
      const shape = rootTable(morphology, table.id);
      const rowIds = new Set(shape.rows.map(({ id }) => id));
      const columnIds = new Set(shape.columns.map(({ id }) => id));
      savedTable.cells.forEach((cell) => {
        if (cell.kind === "refer" && rowIds.has(cell.rowId) && columnIds.has(cell.columnId)
          && (!rowIds.has(cell.targetRowId) || !columnIds.has(cell.targetColumnId))) {
          count += 1;
        }
      });
    });
    return count;
  }

  return {
    allTables,
    applyUndo,
    changeParent,
    childTableIds,
    clearedTemplateReferenceCount,
    collectRuleRows,
    createChildTable,
    createTable,
    deleteTable,
    descendantTableIds,
    detachBlockedReason,
    detachTable,
    detachmentsForSave,
    draftIsDirty,
    extractTableToOwnSlot,
    fillAxisReferences,
    findTable,
    initialLineage,
    insertAxisItem,
    locateTable,
    morphologyCellKey,
    morphologyForSave,
    moveAxisItem,
    moveSlot,
    moveTableInSlot,
    moveTableToSlot,
    normalizedDraft,
    ownCell,
    parentCandidates,
    referenceCycles,
    removeAxisItem,
    renameSlot,
    rootTable,
    ruleRowErrors,
    setAxisLabel,
    setCellRecord,
    setRuleText,
    slotCoverage,
    undoSurvivesDetach,
    updateTable,
  };
});
