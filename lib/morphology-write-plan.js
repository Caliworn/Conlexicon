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

function planProjection(previous, next, rows, functionNames, mappedTableIds) {
  const generationTableIds = new Set([
    ...rows.cells.upsert, ...rows.cells.remove, ...rows.tables.remove,
  ].map((row) => row.tableId || row.id));
  for (const id of mappedTableIds) generationTableIds.add(id);
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
  throw apiError("Invalid morphology inheritance change", 400, "invalid_morphology_inheritance", { tableId, reason });
}

function axisIdMap(value, oldAxis, newAxis, tableId, kind) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidDetachment(tableId, `invalid_${kind}_map`);
  const source = new Set(oldAxis.map(({ id }) => id));
  const destinations = new Set(newAxis.map(({ id }) => id));
  const used = new Set();
  const pairs = Object.entries(value);
  pairs.forEach(([oldId, newId]) => {
    if (!source.has(oldId) || !destinations.has(newId) || used.has(newId)) {
      invalidDetachment(tableId, `invalid_${kind}_coordinate`);
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
    if (!previous.tables.has(tableId) || !next.tables.has(tableId)) {
      invalidDetachment(tableId, "invalid_detachment_table");
    }
    const beforeShape = previous.resolver.tableShape(tableId);
    const afterShape = next.resolver.tableShape(tableId);
    if (result.has(afterShape.id) || (afterShape.id !== tableId && previous.tables.has(afterShape.id))) {
      invalidDetachment(tableId, "invalid_detachment_table");
    }
    if (afterShape.rows.some(({ id }) => previous.rows.has(id) || previous.columns.has(id))
      || afterShape.columns.some(({ id }) => previous.rows.has(id) || previous.columns.has(id))) {
      invalidDetachment(tableId, "detachment_requires_new_axes");
    }
    result.set(afterShape.id, {
      oldRootId: beforeShape.id,
      rowIds: axisIdMap(detachment.rowIdMap, beforeShape.rows, afterShape.rows, tableId, "detachment"),
      columnIds: axisIdMap(detachment.columnIdMap, beforeShape.columns, afterShape.columns, tableId, "detachment"),
    });
  });
  return result;
}

function planCoordinateMappings(previous, next, coordinateMappings) {
  if (!Array.isArray(coordinateMappings)) invalidDetachment(undefined, "invalid_coordinate_mappings");
  const result = new Map();
  for (const mapping of coordinateMappings) {
    const tableId = mapping?.tableId;
    const before = previous.tables.get(tableId);
    if (!before || !next.tables.has(tableId) || result.has(tableId) || typeof mapping.expectedUpdatedAt !== "string") {
      invalidDetachment(tableId, "invalid_coordinate_mapping_table");
    }
    if (before.updatedAt !== mapping.expectedUpdatedAt) {
      throw apiError("Morphology coordinates already changed", 409, "morphology_coordinates_changed", { tableId });
    }
    const source = previous.resolver.tableShape(tableId);
    const target = next.resolver.tableShape(tableId);
    result.set(tableId, {
      rowIds: axisIdMap(mapping.rowIdMap, source.rows, target.rows, tableId, "coordinate"),
      columnIds: axisIdMap(mapping.columnIdMap, source.columns, target.columns, tableId, "coordinate"),
    });
  }
  return result;
}

// Moving saved axes to a new root preserves the coordinates owned by their original family.
function carriesPreviousAxes(previous, beforeShape, afterShape) {
  if (previous.tables.has(afterShape.id)) return false;
  const owners = new Set([
    ...afterShape.rows.map(({ id }) => previous.rows.get(id)?.tableId),
    ...afterShape.columns.map(({ id }) => previous.columns.get(id)?.tableId),
  ]);
  owners.delete(undefined);
  return owners.size === 1 && owners.has(beforeShape.id);
}

function planReferenceChanges(previous, next, removedTables, detachments, coordinateMappings) {
  const detachmentMaps = planDetachments(previous, next, detachments);
  const shapeChanges = new Map();
  next.tables.forEach((table, tableId) => {
    const before = previous.tables.get(tableId);
    if (!before) return;
    const beforeShape = previous.resolver.tableShape(tableId);
    const afterShape = next.resolver.tableShape(tableId);
    const legacy = detachmentMaps.get(afterShape.id);
    const detachment = legacy?.oldRootId === beforeShape.id ? legacy : undefined;
    const coordinates = coordinateMappings.get(tableId);
    if (coordinates && detachment) invalidDetachment(tableId, "duplicate_coordinate_mapping");
    const axisMapping = coordinates || detachment;
    if (beforeShape.id !== afterShape.id && !axisMapping
      && !carriesPreviousAxes(previous, beforeShape, afterShape)) {
      invalidDetachment(tableId, table.inheritsFrom ? "parent_has_different_root" : "detachment_map_required");
    }
    const nextRowIds = new Set(afterShape.rows.map(({ id }) => id));
    const nextColumnIds = new Set(afterShape.columns.map(({ id }) => id));
    if (axisMapping || beforeShape.rows.some(({ id }) => !nextRowIds.has(id))
      || beforeShape.columns.some(({ id }) => !nextColumnIds.has(id))) {
      shapeChanges.set(tableId, { beforeShape, nextRowIds, nextColumnIds, axisMapping });
    }
  });
  return {
    removedTables: new Map(removedTables.map((table) => [table.id, table])),
    shapeChanges,
  };
}

function planMorphologyWrite(previousMorphology, nextMorphology, { detachments = [], coordinateMappings = [] } = {}) {
  const previous = morphologyIndex(previousMorphology);
  const next = morphologyIndex(nextMorphology);
  const mappings = planCoordinateMappings(previous, next, coordinateMappings);
  const rows = Object.fromEntries(["slots", "tables", "rows", "columns", "cells"].map((name) => [
    name, planRowChanges(previous[name], next[name]),
  ]));
  // An override-only relocation still advances the table version so it cannot be applied twice.
  const upsertedTableIds = new Set(rows.tables.upsert.map(({ id }) => id));
  for (const id of mappings.keys()) {
    if (!upsertedTableIds.has(id)) rows.tables.upsert.push(next.tables.get(id));
  }
  const blobChanged = !jsonEqual(previousMorphology.functions, nextMorphology.functions);
  const functionNames = changedFunctionNames(previousMorphology.functions, nextMorphology.functions);
  return {
    previous: previousMorphology,
    next: nextMorphology,
    rows,
    projection: planProjection(previous, next, rows, functionNames, mappings.keys()),
    references: planReferenceChanges(previous, next, rows.tables.remove, detachments, mappings),
    blobChanged,
    hasStorageChanges: blobChanged || Object.values(rows).some(({ upsert, remove }) => upsert.length || remove.length),
  };
}

module.exports = { planMorphologyWrite };
