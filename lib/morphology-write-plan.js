const { apiError } = require("./api-error");
const {
  createMorphologyResolver,
  extractMorphologyFunctionCalls,
  morphologyCellKey,
} = require("./morphology-model");
const { normalizeStructuralKey } = require("./search-normalization-model");

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortedSet(values) {
  return [...new Set(values)].sort();
}

function ruleKey(rules) {
  const tags = (items) => sortedSet(items.map(normalizeStructuralKey).filter(Boolean));
  return sortedSet(rules.map(({ all, none }) => JSON.stringify([tags(all), tags(none)])));
}

function morphologyIndex(morphology) {
  const slots = new Map();
  const tables = new Map();
  const rows = new Map();
  const columns = new Map();
  const cells = new Map();
  morphology.slots.forEach(({ tables: slotTables, ...slot }, position) => {
    slots.set(slot.id, { ...slot, position });
    slotTables.forEach((table, tablePosition) => {
      const tableId = table.id;
      tables.set(tableId, {
        id: tableId, slotId: slot.id, position: tablePosition, title: table.title, notes: table.notes,
        matchRules: table.matchRules, inheritsFrom: table.inheritsFrom, createdAt: table.createdAt, updatedAt: table.updatedAt,
      });
      table.rows?.forEach((row, rowPosition) => rows.set(row.id, { ...row, tableId, position: rowPosition }));
      table.columns?.forEach((column, columnPosition) => columns.set(column.id, { ...column, tableId, position: columnPosition }));
      table.cells.forEach((cell) => cells.set(morphologyCellKey(tableId, morphologyCellKey(cell.rowId, cell.columnId)), {
        ...cell, tableId,
      }));
    });
  });
  return { slots, tables, rows, columns, cells, resolver: createMorphologyResolver(morphology) };
}

function planRowChanges(previous, next) {
  return {
    upsert: [...next].filter(([id, row]) => !previous.has(id) || !jsonEqual(previous.get(id), row))
      .map(([, row]) => row),
    remove: [...previous].filter(([id]) => !next.has(id)).map(([, row]) => row),
  };
}

function changedFunctionNames(previous, next) {
  return new Set(Object.keys(next).filter((name) => !jsonEqual(sortedSet(previous[name]), sortedSet(next[name]))));
}

function shapeIds(shape) {
  return [shape.rows.map(({ id }) => id), shape.columns.map(({ id }) => id)];
}

function planProjection(previous, next, rows, functionNames) {
  const generationTableIds = new Set([
    ...rows.cells.upsert, ...rows.cells.remove, ...rows.tables.remove,
  ].map((row) => row.tableId || row.id));
  if (functionNames.size) {
    next.cells.forEach((cell) => {
      if (cell.kind === "rule" && extractMorphologyFunctionCalls(cell.sourceText).some(({ name }) => functionNames.has(name))) {
        generationTableIds.add(cell.tableId);
      }
    });
  }

  let assignmentChanged = previous.tables.size !== next.tables.size;
  const axisOrderTableIds = new Set();
  const childrenById = new Map();
  next.tables.forEach((table, tableId) => {
    if (!childrenById.has(table.inheritsFrom)) childrenById.set(table.inheritsFrom, []);
    childrenById.get(table.inheritsFrom).push(tableId);
    const before = previous.tables.get(tableId);
    if (!before || before.slotId !== table.slotId || !jsonEqual(ruleKey(before.matchRules), ruleKey(table.matchRules))) {
      assignmentChanged = true;
    }
    if (!before || before.inheritsFrom !== table.inheritsFrom) generationTableIds.add(tableId);
    if (before && !table.inheritsFrom && !before.inheritsFrom) {
      const beforeAxes = shapeIds(previous.resolver.tableShape(tableId));
      const afterAxes = shapeIds(next.resolver.tableShape(tableId));
      if (!jsonEqual(beforeAxes, afterAxes)) {
        if (jsonEqual(beforeAxes.map(sortedSet), afterAxes.map(sortedSet))) axisOrderTableIds.add(tableId);
        else generationTableIds.add(tableId);
      }
    }
  });
  const includeDescendants = (ids) => {
    for (const tableId of ids) {
      (childrenById.get(tableId) || []).forEach((childId) => ids.add(childId));
    }
  };
  includeDescendants(generationTableIds);
  includeDescendants(axisOrderTableIds);
  return {
    assignmentChanged,
    tableOrderChanged: !jsonEqual([...previous.tables.keys()], [...next.tables.keys()]),
    generationTableIds,
    axisOrderTableIds,
  };
}

function invalidDetachment(tableId, reason) {
  throw apiError("Invalid morphology detachment", 400, "invalid_morphology_inheritance", { tableId, reason });
}

function detachmentAxisMap(value, oldAxis, newAxis, tableId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidDetachment(tableId, "invalid_detachment_map");
  const source = new Set(oldAxis.map(({ id }) => id));
  const destinations = new Set(newAxis.map(({ id }) => id));
  const used = new Set();
  const pairs = Object.entries(value);
  pairs.forEach(([oldId, newId]) => {
    if (!source.has(oldId) || !destinations.has(newId) || used.has(newId)) {
      invalidDetachment(tableId, "invalid_detachment_coordinate");
    }
    used.add(newId);
  });
  return new Map(pairs);
}

function planDetachments(previous, next, detachments) {
  if (!Array.isArray(detachments)) invalidDetachment(undefined, "invalid_detachments");
  const result = new Map();
  detachments.forEach((detachment) => {
    const tableId = detachment?.tableId;
    const after = next.tables.get(tableId);
    if (result.has(tableId) || !previous.tables.get(tableId)?.inheritsFrom || !after || after.inheritsFrom) {
      invalidDetachment(tableId, "invalid_detachment_table");
    }
    const beforeShape = previous.resolver.tableShape(tableId);
    const afterShape = next.resolver.tableShape(tableId);
    if (afterShape.rows.some(({ id }) => previous.rows.has(id) || previous.columns.has(id))
      || afterShape.columns.some(({ id }) => previous.rows.has(id) || previous.columns.has(id))) {
      invalidDetachment(tableId, "detachment_requires_new_axes");
    }
    result.set(tableId, {
      oldRootId: beforeShape.id,
      rowIds: detachmentAxisMap(detachment.rowIdMap, beforeShape.rows, afterShape.rows, tableId),
      columnIds: detachmentAxisMap(detachment.columnIdMap, beforeShape.columns, afterShape.columns, tableId),
    });
  });
  return result;
}

function planReferenceChanges(previous, next, removedTables, detachments) {
  const detachmentMaps = planDetachments(previous, next, detachments);
  const shapeChanges = new Map();
  next.tables.forEach((table, tableId) => {
    const before = previous.tables.get(tableId);
    if (!before) return;
    const beforeShape = previous.resolver.tableShape(tableId);
    const afterShape = next.resolver.tableShape(tableId);
    const detachment = beforeShape.id !== afterShape.id ? detachmentMaps.get(afterShape.id) : undefined;
    if (before.inheritsFrom && beforeShape.id !== afterShape.id && detachment?.oldRootId !== beforeShape.id) {
      invalidDetachment(tableId, table.inheritsFrom ? "parent_has_different_root" : "detachment_map_required");
    }
    const nextRowIds = new Set(afterShape.rows.map(({ id }) => id));
    const nextColumnIds = new Set(afterShape.columns.map(({ id }) => id));
    if (detachment || beforeShape.rows.some(({ id }) => !nextRowIds.has(id))
      || beforeShape.columns.some(({ id }) => !nextColumnIds.has(id))) {
      shapeChanges.set(tableId, { beforeShape, nextRowIds, nextColumnIds, detachment });
    }
  });
  return {
    removedTables: new Map(removedTables.map((table) => [table.id, table])),
    shapeChanges,
  };
}

function planMorphologyWrite(previousMorphology, nextMorphology, { detachments = [] } = {}) {
  const previous = morphologyIndex(previousMorphology);
  const next = morphologyIndex(nextMorphology);
  const rows = Object.fromEntries(["slots", "tables", "rows", "columns", "cells"].map((name) => [
    name, planRowChanges(previous[name], next[name]),
  ]));
  const blobChanged = !jsonEqual(previousMorphology.functions, nextMorphology.functions);
  return {
    previous: previousMorphology,
    next: nextMorphology,
    rows,
    projection: planProjection(previous, next, rows, changedFunctionNames(previousMorphology.functions, nextMorphology.functions)),
    references: planReferenceChanges(previous, next, rows.tables.remove, detachments),
    blobChanged,
    hasStorageChanges: blobChanged || Object.values(rows).some(({ upsert, remove }) => upsert.length || remove.length),
  };
}

module.exports = { planMorphologyWrite };
