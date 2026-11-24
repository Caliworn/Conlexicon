const { apiError } = require("./api-error");
const { ensureEntityId } = require("./dictionary-data-model");
const {
  createMorphologyResolver,
  findMorphologyReferenceCycle,
  morphologyCellKey,
  morphologyMatchRuleError,
  normalizeMorphology,
  normalizeMorphologyMatchTags,
  validateMorphologyFunctionUsage,
  validateMorphologyReferenceSyntax,
} = require("./morphology-model");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function usableId(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function optionalStrings(record, names) {
  return names.every((name) => record[name] === undefined || typeof record[name] === "string");
}

function isTagList(value) {
  return value === undefined || typeof value === "string"
    || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function invalid(code, details) {
  throw apiError("Invalid morphology data", 400, code, details);
}

function assertRule(rule, tableId, row) {
  const fail = (reason) => invalid("invalid_morphology_match_rule", { tableId, row, reason });
  if (!isObject(rule) || !isTagList(rule.all) || !isTagList(rule.none)) fail("invalid_tag_list");
  const reason = morphologyMatchRuleError({
    all: normalizeMorphologyMatchTags(rule.all),
    none: normalizeMorphologyMatchTags(rule.none),
  });
  if (reason) fail(reason);
}

function assertSlotTables(slot) {
  if (!isObject(slot) || !Array.isArray(slot.tables) || !slot.tables.length) {
    invalid("invalid_morphology_slot", { slotId: slot?.id, reason: "empty_slot" });
  }
}

function assertTableRules(table) {
  const rules = table.matchRules === undefined ? [] : table.matchRules;
  if (!Array.isArray(rules)) invalid("invalid_morphology_match_rule", { tableId: table.id, reason: "invalid_rules" });
  rules.forEach((rule, row) => assertRule(rule, table.id, row + 1));
}

// Slots and tables share one ID space with each other (and with the rest of the dictionary).
function entityIdRecorder(duplicateIdCode) {
  const entityTypes = new Map();
  return (id, type) => {
    if (entityTypes.has(id)) {
      throw apiError("Duplicate morphology entity ID", 409, duplicateIdCode, {
        duplicates: [{ id, types: [...new Set([entityTypes.get(id), type])] }],
      });
    }
    entityTypes.set(id, type);
  };
}

function assertAxis(items, axis, tableId, axisIds) {
  const fail = (reason, id) => invalid("invalid_morphology_shape", { tableId, axis, reason, ...(id ? { id } : {}) });
  if (!Array.isArray(items) || !items.length) fail("empty_axis");
  items.forEach((item) => {
    if (!isObject(item) || !usableId(item.id)) fail("invalid_axis_id");
    if (!optionalStrings(item, ["label"])) fail("invalid_axis_label", item.id);
    const id = item.id.trim();
    if (axisIds.has(id)) fail("duplicate_axis_id", id);
    axisIds.set(id, { tableId, axis });
  });
}

function assertCellRecords(records, tableId, allowedFields, code, shape) {
  if (records === undefined) return;
  if (!Array.isArray(records)) invalid(code, { tableId, reason: "invalid_records" });
  const seen = new Set();
  records.forEach((record) => {
    const rowId = typeof record?.rowId === "string" ? record.rowId.trim() : "";
    const columnId = typeof record?.columnId === "string" ? record.columnId.trim() : "";
    const fail = (reason) => invalid(code, { tableId, rowId, columnId, reason });
    if (!isObject(record) || !rowId || !columnId) fail("invalid_coordinate");
    const fields = allowedFields.get(record.kind);
    if (!fields || Object.keys(record).some((key) => !["rowId", "columnId", "kind", ...fields].includes(key))
      || fields.some((key) => typeof record[key] !== "string")
      || (record.kind === "form" && !record.value.trim())) {
      fail("invalid_kind_fields");
    }
    const key = morphologyCellKey(rowId, columnId);
    if (seen.has(key)) fail("duplicate_coordinate");
    seen.add(key);
    if (shape && (!shape.rowIds.has(rowId) || !shape.columnIds.has(columnId))) {
      fail("coordinate_outside_shape");
    }
  });
}

const TEMPLATE_FIELDS = new Map([
  ["rule", ["sourceText"]],
  ["absent", []],
  ["refer", ["targetRowId", "targetColumnId"]],
]);
const OVERRIDE_FIELDS = new Map([
  ["form", ["value"]],
  ["absent", []],
]);

function assertTemplateInput(morphology) {
  if (!isObject(morphology) || Object.hasOwn(morphology, "templateGroups") || Object.hasOwn(morphology, "tables")
    || (morphology.functions !== undefined && (!isObject(morphology.functions)
      || !isTagList(morphology.functions.leftV) || !isTagList(morphology.functions.rightV)))) {
    invalid("invalid_morphology_payload", { reason: "invalid_module" });
  }
  const slots = morphology.slots === undefined ? [] : morphology.slots;
  if (!Array.isArray(slots)) invalid("invalid_morphology_slot", { reason: "invalid_slots" });
  const axisIds = new Map();
  const entityIds = new Set();
  slots.forEach((slot) => {
    assertSlotTables(slot);
    if (!optionalStrings(slot, ["id", "name", "createdAt", "updatedAt"])) {
      invalid("invalid_morphology_slot", { slotId: slot.id, reason: "invalid_slot_fields" });
    }
    if (usableId(slot.id)) entityIds.add(slot.id.trim());
    slot.tables.forEach((table) => {
      if (!isObject(table) || !optionalStrings(table, ["id", "title", "notes", "createdAt", "updatedAt"])) {
        invalid("invalid_morphology_payload", { slotId: slot.id, reason: "invalid_table" });
      }
      const tableId = table.id;
      if (usableId(tableId)) entityIds.add(tableId.trim());
      assertTableRules(table);
      if (table.inheritsFrom != null && !usableId(table.inheritsFrom)) {
        invalid("invalid_morphology_inheritance", { tableId, reason: "invalid_parent" });
      }
      if (table.inheritsFrom) {
        if (Object.hasOwn(table, "rows") || Object.hasOwn(table, "columns")) {
          invalid("invalid_morphology_inheritance", { tableId, reason: "child_has_shape" });
        }
      } else {
        assertAxis(table.rows, "rows", tableId, axisIds);
        assertAxis(table.columns, "columns", tableId, axisIds);
      }
      assertCellRecords(table.cells, tableId, TEMPLATE_FIELDS, "invalid_morphology_cell");
    });
  });
  axisIds.forEach(({ tableId, axis }, id) => {
    if (entityIds.has(id)) invalid("invalid_morphology_shape", { tableId, axis, id, reason: "duplicate_axis_id" });
  });
}

function assertInheritance(morphology, previous, duplicateIdCode) {
  const record = entityIdRecorder(duplicateIdCode);
  const tables = new Map();
  morphology.slots.forEach((slot) => {
    record(slot.id, "morphologySlot");
    slot.tables.forEach((table) => {
      record(table.id, "morphologyTemplateTable");
      tables.set(table.id, table);
    });
  });
  const previousIds = new Set(previous?.slots.flatMap((slot) => slot.tables.map(({ id }) => id)));
  const missingParents = new Map();
  for (const table of tables.values()) {
    if (!table.inheritsFrom || tables.has(table.inheritsFrom)) continue;
    if (!previousIds.has(table.inheritsFrom)) {
      invalid("invalid_morphology_inheritance", { tableId: table.id, reason: "unknown_parent" });
    }
    if (!missingParents.has(table.inheritsFrom)) missingParents.set(table.inheritsFrom, []);
    missingParents.get(table.inheritsFrom).push(table.id);
  }
  for (const [tableId, childTableIds] of missingParents) {
    throw apiError("Morphology table is still inherited", 409, "morphology_table_has_children", { tableId, childTableIds });
  }
  const checked = new Set();
  for (const table of tables.values()) {
    const chain = new Set();
    let current = table;
    while (current && !checked.has(current.id)) {
      if (chain.has(current.id)) invalid("invalid_morphology_inheritance", { tableId: table.id, reason: "inheritance_cycle" });
      chain.add(current.id);
      current = tables.get(current.inheritsFrom);
    }
    chain.forEach((id) => checked.add(id));
  }
  return tables;
}

function shapeLookup(resolver) {
  const byRoot = new Map();
  return (tableId) => {
    const shape = resolver.tableShape(tableId);
    if (!byRoot.has(shape.id)) {
      byRoot.set(shape.id, {
        rowIds: new Set(shape.rows.map(({ id }) => id)),
        columnIds: new Set(shape.columns.map(({ id }) => id)),
      });
    }
    return byRoot.get(shape.id);
  };
}

function assertCellCoordinates(table, shape) {
  table.cells.forEach((cell) => {
    const { rowId, columnId, targetRowId, targetColumnId } = cell;
    const fail = (reason) => invalid("invalid_morphology_cell", { tableId: table.id, rowId, columnId, reason });
    if (!shape.rowIds.has(rowId) || !shape.columnIds.has(columnId)) fail("coordinate_outside_shape");
    if (cell.kind === "refer") {
      if (!shape.rowIds.has(targetRowId) || !shape.columnIds.has(targetColumnId)) fail("target_outside_shape");
      if (rowId === targetRowId && columnId === targetColumnId) fail("self_reference");
    }
  });
}

function assertAcyclicReferences(tableId, cells) {
  const cycle = findMorphologyReferenceCycle(cells);
  if (cycle) {
    invalid("invalid_morphology_cell", { tableId, rowId: cycle.rowId, columnId: cycle.columnId, reason: "reference_cycle" });
  }
}

function normalizeMorphologyInput(morphology = {}, { previous, duplicateIdCode = "duplicate_entity_ids_scoped" } = {}) {
  assertTemplateInput(morphology);
  // Check coordinates before blank rules are dropped by normalization.
  const normalized = normalizeMorphology(morphology, { ensureEntityId, keepBlankRules: true });
  const tables = assertInheritance(normalized, previous, duplicateIdCode);
  const resolver = createMorphologyResolver(normalized);
  const shapeFor = shapeLookup(resolver);
  tables.forEach((table) => {
    assertCellCoordinates(table, shapeFor(table.id));
    table.cells = table.cells.filter((cell) => cell.kind !== "rule" || cell.sourceText);
  });
  tables.forEach((table) => assertAcyclicReferences(table.id, resolver.templateCells(table.id)));
  const syntaxErrors = validateMorphologyReferenceSyntax(normalized);
  const functionErrors = validateMorphologyFunctionUsage(normalized);
  if (syntaxErrors.length || functionErrors.length) {
    throw apiError("Invalid morphology payload", 400, "invalid_morphology_payload", { syntaxErrors, functionErrors });
  }
  return normalized;
}

// The part of a morphology module that decides automatic assignment: slots, table IDs and
// match rules, checked with the same codes as a save. Other fields are ignored. Unlike a save,
// every slot and table needs an ID, since the preview reports results by ID.
function normalizeMorphologyAssignmentInput(input) {
  if (!isObject(input)) invalid("invalid_morphology_payload", { reason: "invalid_module" });
  const slots = input.slots === undefined ? [] : input.slots;
  if (!Array.isArray(slots)) invalid("invalid_morphology_slot", { reason: "invalid_slots" });
  const record = entityIdRecorder("duplicate_entity_ids_scoped");
  return {
    slots: slots.map((slot) => {
      assertSlotTables(slot);
      if (!usableId(slot.id)) invalid("invalid_morphology_payload", { reason: "missing_slot_id" });
      const slotId = slot.id.trim();
      record(slotId, "morphologySlot");
      return {
        id: slotId,
        tables: slot.tables.map((table) => {
          if (!isObject(table)) invalid("invalid_morphology_payload", { slotId, reason: "invalid_table" });
          if (!usableId(table.id)) invalid("invalid_morphology_payload", { slotId, reason: "missing_table_id" });
          assertTableRules(table);
          const tableId = table.id.trim();
          record(tableId, "morphologyTemplateTable");
          return {
            id: tableId,
            matchRules: (table.matchRules || []).map((rule) => ({
              all: normalizeMorphologyMatchTags(rule.all),
              none: normalizeMorphologyMatchTags(rule.none),
            })),
          };
        }),
      };
    }),
  };
}

function createEntryMorphologyValidator(morphology) {
  const shapeFor = shapeLookup(createMorphologyResolver(morphology));
  const tableIds = new Set(morphology.slots.flatMap((slot) => slot.tables.map(({ id }) => id)));
  return (entry) => {
    const { morphologyMode, morphologyTables } = entry;
    if (Object.hasOwn(entry, "morphologyGroups") || Object.hasOwn(entry, "morphology")
      || (morphologyMode !== undefined && morphologyMode !== "auto" && morphologyMode !== "manual")
      || (morphologyTables !== undefined && !Array.isArray(morphologyTables))) {
      invalid("invalid_entry_morphology", { entryId: entry.id, reason: "invalid_entry_morphology" });
    }
    const seen = new Set();
    (morphologyTables || []).forEach((table) => {
      const tableId = usableId(table?.tableId) ? table.tableId.trim() : "";
      if (!tableIds.has(tableId) || seen.has(tableId)) {
        invalid("invalid_entry_morphology", {
          entryId: entry.id, tableId, reason: seen.has(tableId) ? "duplicate_table" : "unknown_table",
        });
      }
      if (!optionalStrings(table, ["notes", "createdAt", "updatedAt"])) {
        invalid("invalid_entry_morphology", { entryId: entry.id, tableId, reason: "invalid_table_fields" });
      }
      seen.add(tableId);
      assertCellRecords(table.overrides, tableId, OVERRIDE_FIELDS, "invalid_morphology_override", shapeFor(tableId));
    });
  };
}

module.exports = { createEntryMorphologyValidator, normalizeMorphologyAssignmentInput, normalizeMorphologyInput };
