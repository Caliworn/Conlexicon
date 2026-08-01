const {
  extractMorphologyFunctionCalls,
  morphologyCellSourceText,
  normalizeMorphology,
} = require("./morphology-model");
const { normalizeStructuralKey } = require("./search-normalization-model");

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function structuralTagSet(tags = []) {
  return [...new Set(tags.map(normalizeStructuralKey).filter(Boolean))].sort();
}

function exactStringSet(values = []) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function groupRow(group, position) {
  return {
    id: group.id,
    position,
    name: group.name || "",
    matchTags: group.matchTags || [],
    notes: group.notes || "",
    createdAt: group.createdAt || "",
    updatedAt: group.updatedAt || "",
  };
}

function tableRow(table, groupId, position) {
  return {
    id: table.id,
    groupId,
    position,
    title: table.title || "",
    rowCount: table.rowCount || 1,
    columnCount: table.columnCount || 1,
    rowLabels: table.rowLabels || [],
    columnLabels: table.columnLabels || [],
    createdAt: table.createdAt || "",
    updatedAt: table.updatedAt || "",
  };
}

function morphologyIndex(morphology = {}) {
  const normalized = normalizeMorphology(morphology);
  const groups = new Map();
  const tables = new Map();
  const cells = new Map();

  normalized.templateGroups.forEach((group, groupPosition) => {
    groups.set(group.id, { group, row: groupRow(group, groupPosition) });
    group.tables.forEach((table, tablePosition) => {
      tables.set(table.id, {
        table,
        row: tableRow(table, group.id, tablePosition),
      });
      Object.entries(table.cells || {}).forEach(([coordinate, cell]) => {
        cells.set(`${table.id}\u0000${coordinate}`, {
          tableId: table.id,
          coordinate,
          sourceText: morphologyCellSourceText(cell),
        });
      });
    });
  });

  return { normalized, groups, tables, cells };
}

function changedFunctionNames(previousFunctions = {}, nextFunctions = {}) {
  return new Set([...new Set([
    ...Object.keys(previousFunctions),
    ...Object.keys(nextFunctions),
  ])].filter((name) => !jsonEqual(
    exactStringSet(previousFunctions[name] || []),
    exactStringSet(nextFunctions[name] || []),
  )));
}

function groupUsesFunctions(group, functionNames) {
  if (!functionNames.size) {
    return false;
  }
  return group.tables.some((table) => Object.values(table.cells || {}).some((cell) => (
    extractMorphologyFunctionCalls(morphologyCellSourceText(cell))
      .some((call) => functionNames.has(call.name))
  )));
}

function tableGenerationKey(table) {
  return {
    rowCount: table.rowCount,
    columnCount: table.columnCount,
    cells: Object.fromEntries(Object.entries(table.cells || {}).map(([key, cell]) => [
      key,
      morphologyCellSourceText(cell).trim(),
    ])),
  };
}

function groupGenerationChanged(previousGroup, nextGroup, previousTables, nextTables) {
  if (!previousGroup || !nextGroup) {
    return true;
  }
  const previousTableIds = previousGroup.tables.map((table) => table.id);
  const nextTableIds = nextGroup.tables.map((table) => table.id);
  if (!jsonEqual(previousTableIds, nextTableIds)) {
    return true;
  }
  return nextTableIds.some((tableId) => !jsonEqual(
    tableGenerationKey(previousTables.get(tableId).table),
    tableGenerationKey(nextTables.get(tableId).table),
  ));
}

function planRowChanges(previousRows, nextRows) {
  return {
    upsert: [...nextRows.entries()]
      .filter(([id, next]) => !previousRows.has(id) || !jsonEqual(previousRows.get(id).row || previousRows.get(id), next.row || next))
      .map(([, value]) => value.row || value),
    deleteIds: [...previousRows.keys()].filter((id) => !nextRows.has(id)),
  };
}

function planCellChanges(previousCells, nextCells) {
  return {
    upsert: [...nextCells.entries()]
      .filter(([key, next]) => !previousCells.has(key) || previousCells.get(key).sourceText !== next.sourceText)
      .map(([, value]) => value),
    delete: [...previousCells.entries()]
      .filter(([key]) => !nextCells.has(key))
      .map(([, value]) => value),
  };
}

function assignmentChanged(previousIndex, nextIndex) {
  const previousIds = previousIndex.normalized.templateGroups.map((group) => group.id);
  const nextIds = nextIndex.normalized.templateGroups.map((group) => group.id);
  if (!jsonEqual(previousIds, nextIds)) {
    return true;
  }
  return nextIds.some((id) => !jsonEqual(
    structuralTagSet(previousIndex.groups.get(id).group.matchTags),
    structuralTagSet(nextIndex.groups.get(id).group.matchTags),
  ));
}

function planMorphologyWrite(previousMorphology = {}, nextMorphology = {}) {
  const previous = morphologyIndex(previousMorphology);
  const next = morphologyIndex(nextMorphology);
  const functionsChanged = changedFunctionNames(
    previous.normalized.functions,
    next.normalized.functions,
  );
  const generationGroupIds = new Set();

  [...new Set([...previous.groups.keys(), ...next.groups.keys()])].forEach((groupId) => {
    const previousGroup = previous.groups.get(groupId)?.group;
    const nextGroup = next.groups.get(groupId)?.group;
    if (groupGenerationChanged(previousGroup, nextGroup, previous.tables, next.tables)) {
      generationGroupIds.add(groupId);
    }
  });
  if (functionsChanged.size) {
    next.normalized.templateGroups.forEach((group) => {
      if (groupUsesFunctions(group, functionsChanged)) {
        generationGroupIds.add(group.id);
      }
    });
  }

  const groups = planRowChanges(previous.groups, next.groups);
  const tables = planRowChanges(previous.tables, next.tables);
  const cells = planCellChanges(previous.cells, next.cells);
  const blobChanged = !jsonEqual(
    previous.normalized.functions,
    next.normalized.functions,
  );
  const hasStorageChanges = blobChanged
    || groups.upsert.length > 0 || groups.deleteIds.length > 0
    || tables.upsert.length > 0 || tables.deleteIds.length > 0
    || cells.upsert.length > 0 || cells.delete.length > 0;
  const referenceValidationNeeded = groups.deleteIds.length > 0
    || tables.deleteIds.length > 0
    || tables.upsert.some((row) => {
      const previousTable = previous.tables.get(row.id)?.row;
      return previousTable && (
        previousTable.groupId !== row.groupId
        || row.rowCount < previousTable.rowCount
        || row.columnCount < previousTable.columnCount
      );
    });

  return {
    previous: previous.normalized,
    next: next.normalized,
    rows: { groups, tables, cells },
    projection: {
      assignmentChanged: assignmentChanged(previous, next),
      generationGroupIds,
      functionNames: functionsChanged,
    },
    blobChanged,
    hasStorageChanges,
    referenceValidationNeeded,
  };
}

module.exports = {
  planMorphologyWrite,
};
