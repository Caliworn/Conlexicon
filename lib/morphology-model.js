(function initMorphologyModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./search-normalization-model"),
      require("./tag-model"),
    );
    return;
  }
  root.ConlexiconMorphology = factory(root.ConlexiconSearchNormalization, root.ConlexiconTags);
})(typeof globalThis !== "undefined" ? globalThis : this, function createMorphologyModel(searchNormalization, tagModel) {
  function splitList(value) {
    return String(value || "")
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const normalizeText = searchNormalization.normalizeStructuralKey;

  function uniqueList(value) {
    const items = Array.isArray(value) ? value.map(String) : splitList(value);
    const unique = [];
    items
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!unique.includes(item)) {
          unique.push(item);
        }
      });
    return unique;
  }

  function templateEntityId(value, prefix, options) {
    return options.ensureEntityId
      ? options.ensureEntityId(value, prefix)
      : String(value || "").trim();
  }

  function normalizeMorphology(morphology = {}, options = {}) {
    return {
      functions: normalizeMorphologyFunctions(morphology.functions),
      slots: (morphology.slots || []).map((slot) => ({
        id: templateEntityId(slot.id, "mslot", options),
        name: String(slot.name || ""),
        tables: slot.tables.map((table) => normalizeMorphologyTable(table, options)),
        createdAt: String(slot.createdAt || ""),
        updatedAt: String(slot.updatedAt || ""),
      })),
    };
  }

  function normalizeMorphologyFunctions(functions = {}) {
    return {
      leftV: uniqueList(functions.leftV),
      rightV: uniqueList(functions.rightV),
    };
  }

  function normalizeMorphologyMatchTags(value) {
    return Array.isArray(value) ? tagModel.normalizeTagList(value) : tagModel.parseTagListText(value);
  }

  function normalizeMorphologyTable(table, options) {
    const inheritsFrom = String(table.inheritsFrom || "").trim() || null;
    const axis = (items, prefix) => items.map((item) => ({
      id: templateEntityId(item.id, prefix, options),
      label: String(item.label || ""),
    }));
    return {
      id: templateEntityId(table.id, "mtable", options),
      title: String(table.title || ""),
      notes: String(table.notes || ""),
      matchRules: (table.matchRules || []).map((rule) => ({
        all: normalizeMorphologyMatchTags(rule.all),
        none: normalizeMorphologyMatchTags(rule.none),
      })),
      inheritsFrom,
      ...(inheritsFrom ? {} : {
        rows: axis(table.rows, "mrow"),
        columns: axis(table.columns, "mcol"),
      }),
      cells: (table.cells || []).map((cell) => ({
        rowId: cell.rowId.trim(),
        columnId: cell.columnId.trim(),
        kind: cell.kind,
        ...(cell.kind === "rule" ? { sourceText: cell.sourceText.trim() } : {}),
        ...(cell.kind === "refer" ? {
          targetRowId: cell.targetRowId.trim(),
          targetColumnId: cell.targetColumnId.trim(),
        } : {}),
      })).filter((cell) => options.keepBlankRules || cell.kind !== "rule" || cell.sourceText),
      createdAt: String(table.createdAt || ""),
      updatedAt: String(table.updatedAt || ""),
    };
  }

  function normalizeEntryMorphologyState(entry = {}) {
    const morphologyMode = entry.morphologyMode === "manual" ? "manual" : "auto";
    const tables = (entry.morphologyTables || []).map((table) => ({
      tableId: table.tableId.trim(),
      notes: String(table.notes || ""),
      overrides: (table.overrides || []).map((override) => ({
        rowId: override.rowId.trim(),
        columnId: override.columnId.trim(),
        kind: override.kind,
        ...(override.kind === "form" ? { value: override.value.trim() } : {}),
      })),
      createdAt: String(table.createdAt || ""),
      updatedAt: String(table.updatedAt || ""),
    }));
    return {
      morphologyMode,
      morphologyTables: morphologyMode === "manual"
        ? tables
        : tables.filter((table) => table.notes.trim() || table.overrides.length),
    };
  }

  function morphologyCellKey(rowId, columnId) {
    return JSON.stringify([rowId, columnId]);
  }

  function morphologyMatchContexts(entry) {
    const tags = entry.tags || [];
    const definitions = entry.definitions || [];
    if (!definitions.length) {
      return [{ definitionId: null, tags: [...new Set(tags)] }];
    }
    return definitions.map((definition) => ({
      definitionId: definition.id,
      tags: [...new Set([...tags, ...(definition.tags || [])])],
    }));
  }

  function structuralTagSet(tags) {
    return new Set(tags.map(normalizeText).filter(Boolean));
  }

  function compileSlot(slot) {
    return {
      slotId: slot.id,
      tables: slot.tables.map((table) => ({
        tableId: table.id,
        rules: table.matchRules.map((rule, row) => ({ tableId: table.id, row, ...compileRule(rule) })),
      })),
    };
  }

  function ruleMatches(rule, tags) {
    for (const tag of rule.all) {
      if (!tags.has(tag)) return false;
    }
    for (const tag of rule.none) {
      if (tags.has(tag)) return false;
    }
    return true;
  }

  function moreSpecific(left, right) {
    if (left.size <= right.size) return false;
    for (const tag of right.all) {
      if (!left.all.has(tag)) return false;
    }
    for (const tag of right.none) {
      if (!left.none.has(tag)) return false;
    }
    return true;
  }

  function compileRule(rule) {
    const all = structuralTagSet(rule.all);
    const none = structuralTagSet(rule.none);
    return { all, none, size: all.size + none.size };
  }

  // Reason a normalized rule row can never be used, or "".
  function morphologyMatchRuleError(rule) {
    const { all, none } = compileRule(rule);
    if (!all.size) return "empty_all";
    for (const tag of none) {
      if (all.has(tag)) return "conflicting_tags";
    }
    return "";
  }

  function morphologyRuleMoreSpecific(left, right) {
    return moreSpecific(compileRule(left), compileRule(right));
  }

  // Every reference loop in an inheritance-resolved cell map. A cell refers to at most one
  // target, so the loops are disjoint. `cell` is where the walk re-entered the loop and
  // `cells` lists the loop's members.
  function findMorphologyReferenceCycles(cells) {
    const checked = new Set();
    const cycles = [];
    for (const [key, cell] of cells) {
      if (cell.kind !== "refer") continue;
      const chain = [];
      const positions = new Map();
      let currentKey = key;
      let current = cell;
      while (current?.kind === "refer" && !checked.has(currentKey)) {
        if (positions.has(currentKey)) {
          cycles.push({ cell: current, cells: chain.slice(positions.get(currentKey)).map((visited) => cells.get(visited)) });
          break;
        }
        positions.set(currentKey, chain.length);
        chain.push(currentKey);
        currentKey = morphologyCellKey(current.targetRowId, current.targetColumnId);
        current = cells.get(currentKey);
      }
      chain.forEach((visited) => checked.add(visited));
    }
    return cycles;
  }

  // First reference cell that loops back on itself in an inheritance-resolved cell map, or null.
  function findMorphologyReferenceCycle(cells) {
    return findMorphologyReferenceCycles(cells)[0]?.cell || null;
  }

  function slotWinners(slot, tags) {
    if (slot.tables.length === 1) {
      const table = slot.tables[0];
      return table.rules.find((rule) => ruleMatches(rule, tags)) ? [table.tableId] : [];
    }
    const matched = slot.tables.flatMap((table) => table.rules.filter((rule) => ruleMatches(rule, tags)));
    const winningIds = new Set(matched
      .filter((rule) => !matched.some((other) => moreSpecific(other, rule)))
      .map((rule) => rule.tableId));
    return [...winningIds];
  }

  function explainSlot(slot, tags, tableIds) {
    const winningIds = new Set(tableIds);
    const winningRules = slot.tables.filter((table) => winningIds.has(table.tableId))
      .flatMap((table) => table.rules.filter((rule) => ruleMatches(rule, tags)));
    return {
      slotId: slot.slotId,
      tables: slot.tables.map((table) => {
        const tableId = table.tableId;
        if (winningIds.has(tableId)) {
          return { tableId, status: tableIds.length > 1 ? "coeffective" : "effective" };
        }
        if (!table.rules.length) return { tableId, status: "no_rules" };
        const rules = table.rules.map((rule) => ({
          row: rule.row + 1,
          missingTags: [...rule.all].filter((tag) => !tags.has(tag)),
          excludedTags: [...rule.none].filter((tag) => tags.has(tag)),
        }));
        const coveredBy = new Set();
        table.rules.forEach((rule) => {
          if (!ruleMatches(rule, tags)) return;
          winningRules.forEach((winner) => {
            if (moreSpecific(winner, rule)) coveredBy.add(winner.tableId);
          });
        });
        return coveredBy.size
          ? { tableId, status: "covered", coveredByTableIds: [...coveredBy] }
          : { tableId, status: "unmatched", rules };
      }),
    };
  }

  function createMorphologyResolver(morphology = {}) {
    const slots = morphology.slots || [];
    const tables = slots.flatMap((slot) => slot.tables);
    const tablesById = new Map(tables.map((table) => [table.id, table]));
    let compiledSlots;
    const shapes = new Map();
    const layouts = new Map();
    const effectiveCells = new Map();

    function evaluate(contexts, explain) {
      compiledSlots ??= slots.map(compileSlot);
      const selected = new Set();
      const results = contexts.map(({ definitionId, tags: sourceTags }) => {
        const tags = structuralTagSet(sourceTags);
        const tableIds = [];
        const explanations = [];
        compiledSlots.forEach((slot) => {
          const winners = slotWinners(slot, tags);
          winners.forEach((id) => {
            tableIds.push(id);
            selected.add(id);
          });
          if (explain) explanations.push(explainSlot(slot, tags, winners));
        });
        return explain ? { definitionId, tableIds, slots: explanations } : { definitionId, tableIds };
      });
      return {
        tableIds: tables.filter((table) => selected.has(table.id)).map((table) => table.id),
        contexts: results,
      };
    }

    function tableShape(tableId) {
      let table = tablesById.get(tableId);
      const chain = [];
      while (!shapes.has(table.id) && table.inheritsFrom) {
        chain.push(table.id);
        table = tablesById.get(table.inheritsFrom);
      }
      const shape = shapes.get(table.id) || table;
      shapes.set(table.id, shape);
      chain.forEach((id) => shapes.set(id, shape));
      return shape;
    }

    function tableLayout(tableId) {
      const { id, rows, columns } = tableShape(tableId);
      if (!layouts.has(id)) {
        layouts.set(id, {
          rows: new Map(rows.map(({ id }, position) => [id, position])),
          columns: new Map(columns.map(({ id }, position) => [id, position])),
        });
      }
      return layouts.get(id);
    }

    // Walk toward the nearest cached ancestor, then apply older records first.
    // Iteration keeps the inheritance depth independent of the JS call stack.
    function templateCells(tableId) {
      if (effectiveCells.has(tableId)) return effectiveCells.get(tableId);
      const chain = [];
      let current = tablesById.get(tableId);
      while (current && !effectiveCells.has(current.id)) {
        chain.push(current);
        current = tablesById.get(current.inheritsFrom);
      }
      const cells = new Map(current ? effectiveCells.get(current.id) : undefined);
      chain.reverse().forEach((table) => table.cells.forEach((cell) => {
        cells.set(morphologyCellKey(cell.rowId, cell.columnId), cell);
      }));
      effectiveCells.set(tableId, cells);
      return cells;
    }

    function entryTableIds(entry) {
      return entry.morphologyMode === "manual"
        ? entry.morphologyTables.map((table) => table.tableId)
        : evaluate(morphologyMatchContexts(entry), false).tableIds;
    }

    function cellResolver(tableId, lemma, overrides = []) {
      const templates = templateCells(tableId);
      const overridesByKey = new Map(overrides.map((cell) => [morphologyCellKey(cell.rowId, cell.columnId), cell]));
      const resolved = new Map();
      return function resolveCell(rowId, columnId) {
        const key = morphologyCellKey(rowId, columnId);
        if (resolved.has(key)) return resolved.get(key);
        let source = { rowId, columnId };
        let sourceKey = key;
        const referred = [];
        while (!resolved.has(sourceKey)) {
          const override = overridesByKey.get(sourceKey);
          const cell = override || templates.get(sourceKey);
          if (cell?.kind === "refer") {
            referred.push(sourceKey);
            source = { rowId: cell.targetRowId, columnId: cell.targetColumnId };
            sourceKey = morphologyCellKey(source.rowId, source.columnId);
            continue;
          }
          const value = cell?.kind === "form"
            ? cell.value
            : cell?.kind === "rule"
              ? applyMorphologyRuleSyntax(lemma, cell.sourceText, morphology.functions)
              : "";
          resolved.set(sourceKey, {
            kind: cell?.kind === "absent" ? "absent" : value ? "form" : "blank",
            value,
            referred: false,
            overridden: Boolean(override),
            source,
          });
        }
        const result = resolved.get(sourceKey);
        if (!referred.length) return result;
        const referredResult = { ...result, referred: true, overridden: false };
        referred.forEach((target) => resolved.set(target, referredResult));
        return referredResult;
      };
    }

    return {
      tableShape,
      tableLayout,
      templateCells,
      entryTableIds,
      cellResolver,
      resolveAutomaticTables: (contexts) => evaluate(contexts, false),
      explainAutomaticTables: (contexts) => evaluate(contexts, true),
    };
  }

  function resolveAutomaticTables(contexts, morphology) {
    return createMorphologyResolver(morphology).resolveAutomaticTables(contexts);
  }

  function explainAutomaticTables(contexts, morphology) {
    return createMorphologyResolver(morphology).explainAutomaticTables(contexts);
  }

  function materializeAutomaticMorphologyTables(entry, morphology) {
    const state = normalizeEntryMorphologyState(entry);
    if (state.morphologyMode === "manual") return state.morphologyTables;
    const overlays = new Map(state.morphologyTables.map((table) => [table.tableId, table]));
    const materialized = resolveAutomaticTables(morphologyMatchContexts(entry), morphology).tableIds.map((tableId) => {
      const table = overlays.get(tableId) || { tableId, notes: "", overrides: [] };
      overlays.delete(tableId);
      return table;
    });
    return [...materialized, ...overlays.values()];
  }

  function morphologyCellLabel(table, rowId, columnId) {
    const label = (axis, id) => {
      const index = axis.findIndex((item) => item.id === id);
      return axis[index].label || String(index + 1);
    };
    return `${label(table.rows, rowId)}·${label(table.columns, columnId)}`;
  }

  function morphologySearchValueRecords(entry, dictionary = {}, resolver = createMorphologyResolver(dictionary.morphology)) {
    const records = [];
    const overlays = new Map((entry.morphologyTables || []).map((table) => [table.tableId, table.overrides]));
    let offset = 0;
    resolver.entryTableIds(entry).forEach((tableId) => {
      const { rows, columns } = resolver.tableLayout(tableId);
      const overrides = overlays.get(tableId) || [];
      const templates = resolver.templateCells(tableId);
      const candidates = overrides.length ? new Map(templates) : templates;
      overrides.forEach((cell) => candidates.set(morphologyCellKey(cell.rowId, cell.columnId), cell));
      const resolve = resolver.cellResolver(tableId, entry.lemma, overrides);
      const forms = [];
      // Positions describe the full grid; only recorded coordinates can produce forms.
      candidates.forEach(({ rowId, columnId }) => {
        const result = resolve(rowId, columnId);
        if (result.kind === "form") {
          const sourcePosition = offset + rows.get(rowId) * columns.size + columns.get(columnId);
          forms.push({ value: result.value, tableId, rowId, columnId, sourcePosition });
        }
      });
      forms.sort((left, right) => left.sourcePosition - right.sourcePosition);
      forms.forEach((record) => records.push(record));
      offset += rows.size * columns.size;
    });
    return records;
  }

  function morphologySearchStrings(entry, dictionary) {
    return morphologySearchValueRecords(entry, dictionary).map((record) => record.value);
  }

  function mapMorphologyTables(morphology, transform) {
    return {
      ...morphology,
      slots: morphology.slots.map((slot) => ({
        ...slot,
        tables: slot.tables.map(transform),
      })),
    };
  }

  function remapMorphologyCells(cells, rowIdMap, columnIdMap) {
    return cells.map((cell) => ({
      ...cell,
      rowId: rowIdMap[cell.rowId],
      columnId: columnIdMap[cell.columnId],
      ...(cell.kind === "refer" ? {
        targetRowId: rowIdMap[cell.targetRowId],
        targetColumnId: columnIdMap[cell.targetColumnId],
      } : {}),
    }));
  }

  function detachMorphologyTable(morphology, tableId, createId) {
    const resolver = createMorphologyResolver(morphology);
    const shape = resolver.tableShape(tableId);
    const tables = morphology.slots.flatMap((slot) => slot.tables);
    const children = new Map();
    tables.forEach((table) => {
      if (!children.has(table.inheritsFrom)) children.set(table.inheritsFrom, []);
      children.get(table.inheritsFrom).push(table.id);
    });
    const descendants = new Set([tableId]);
    for (const id of descendants) {
      (children.get(id) || []).forEach((childId) => descendants.add(childId));
    }
    const rowIdMap = Object.fromEntries(shape.rows.map(({ id }) => [id, createId("mrow")]));
    const columnIdMap = Object.fromEntries(shape.columns.map(({ id }) => [id, createId("mcol")]));
    const remapCells = (cells) => remapMorphologyCells(cells, rowIdMap, columnIdMap);
    return {
      morphology: mapMorphologyTables(morphology, (table) => {
        if (table.id === tableId) {
          return {
            ...table,
            inheritsFrom: null,
            rows: shape.rows.map((row) => ({ ...row, id: rowIdMap[row.id] })),
            columns: shape.columns.map((column) => ({ ...column, id: columnIdMap[column.id] })),
            cells: remapCells([...resolver.templateCells(tableId).values()]),
          };
        }
        return descendants.has(table.id) ? { ...table, cells: remapCells(table.cells) } : table;
      }),
      detachment: { tableId, rowIdMap, columnIdMap },
    };
  }

  function removeMorphologyAxisItem(morphology, tableId, axis, itemId) {
    const resolver = createMorphologyResolver(morphology);
    const shape = resolver.tableShape(tableId);
    if (shape.id !== tableId || shape[axis].length === 1) {
      throw new RangeError("Morphology axes can only be removed from the root table and cannot be empty");
    }
    const coordinate = axis === "rows" ? "rowId" : "columnId";
    const target = axis === "rows" ? "targetRowId" : "targetColumnId";
    return mapMorphologyTables(morphology, (table) => {
      if (resolver.tableShape(table.id).id !== tableId) return table;
      return {
        ...table,
        ...(table.id === tableId ? { [axis]: table[axis].filter(({ id }) => id !== itemId) } : {}),
        cells: table.cells.filter((cell) => cell[coordinate] !== itemId && cell[target] !== itemId),
      };
    });
  }

  function morphologyDisplayGroups({ tableIds, contexts }) {
    const matchIndexesByTable = new Map(tableIds.map((tableId) => [tableId, []]));
    contexts.forEach(({ tableIds: matchedIds }, index) => {
      for (const tableId of matchedIds) matchIndexesByTable.get(tableId).push(index);
    });

    const groups = new Map();
    for (const [tableId, matchIndexes] of matchIndexesByTable) {
      const key = matchIndexes.join(",");
      if (!groups.has(key)) groups.set(key, { matchIndexes, tableIds: [] });
      groups.get(key).tableIds.push(tableId);
    }

    const isShared = (group) => group.matchIndexes.length === contexts.length;
    return [...groups.values()]
      .sort((left, right) => Number(isShared(right)) - Number(isShared(left))
        || left.matchIndexes[0] - right.matchIndexes[0])
      .map((group) => ({
        definitionIds: group.matchIndexes.map((index) => contexts[index].definitionId),
        tableIds: group.tableIds,
        shared: isShared(group),
      }));
  }

  function bestMorphologyMergeRectangle(region, grid) {
    const center = region.reduce((sum, { row, column }) => ({
      row: sum.row + row,
      column: sum.column + column,
    }), { row: 0, column: 0 });
    // A spanning cell has one background. Leave differently tinted coordinates as separate
    // cells inside the same borderless region so the tint marks the actual override.
    const overrides = new Map(region.map(({ row, column }) => [
      `${row},${column}`, Boolean(grid[row][column].overridden),
    ]));
    let best;
    for (const { row, column } of region) {
      const overridden = overrides.get(`${row},${column}`);
      let maxWidth = region.length;
      for (let bottom = row; overrides.get(`${bottom},${column}`) === overridden; bottom += 1) {
        let width = 1;
        while (width < maxWidth && overrides.get(`${bottom},${column + width}`) === overridden) width += 1;
        maxWidth = width;
        const rowSpan = bottom - row + 1;
        const area = rowSpan * width;
        if (area === region.length) return { row, column, rowSpan, colSpan: width };
        // Scale by 2N so tied centroid distances compare as integers.
        const distance = ((row + bottom) * region.length - 2 * center.row) ** 2
          + ((2 * column + width - 1) * region.length - 2 * center.column) ** 2;
        const candidate = { row, column, rowSpan, colSpan: width, area, distance };
        if (!best || area > best.area || (area === best.area && (
          distance - best.distance || best.colSpan - width || row - best.row || column - best.column
        ) < 0)) {
          best = candidate;
        }
      }
    }
    const { row, column, rowSpan, colSpan } = best;
    return { row, column, rowSpan, colSpan };
  }

  function morphologyMergeRegions(grid) {
    const absent = Symbol("absent");
    const groups = grid.map((row) => row.map((cell) => {
      if (cell.kind === "absent") return absent;
      return cell.kind === "form" ? morphologyCellKey(cell.source.rowId, cell.source.columnId) : null;
    }));
    const regions = [];
    groups.forEach((columns, row) => columns.forEach((source, column) => {
      if (!source) return;
      const cells = [{ row, column }];
      groups[row][column] = null;
      for (let index = 0; index < cells.length; index += 1) {
        const { row: r, column: c } = cells[index];
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nextRow, nextColumn]) => {
          if (groups[nextRow]?.[nextColumn] !== source) return;
          groups[nextRow][nextColumn] = null;
          cells.push({ row: nextRow, column: nextColumn });
        });
      }
      if (cells.length > 1) regions.push({ cells, rectangle: bestMorphologyMergeRectangle(cells, grid) });
    }));
    return regions;
  }

  function validateMorphologyFunctionUsage(morphology) {
    const errors = [];
    morphology.slots.forEach((slot) => slot.tables.forEach((table) => {
      table.cells.filter(({ kind }) => kind === "rule").forEach(({ sourceText }) => {
        extractMorphologyFunctionCalls(sourceText).forEach((call) => {
          if (call.invalidOffset) {
            errors.push(`${table.title}: ${call.name} offset must be a positive integer`);
            return;
          }
          if (call.name === "left" || call.name === "right") return;
          const configured = morphology.functions[call.name];
          if (!configured.length) {
            errors.push(`${table.title}: ${call.name} not configured`);
            return;
          }
          const invalid = call.options.filter((option) => !configured.includes(option));
          if (invalid.length) errors.push(`${table.title}: ${call.name}(${invalid.join(", ")})`);
        });
      });
    }));
    return errors;
  }

  function validateMorphologyReferenceSyntax(morphology) {
    const errors = [];
    const resolver = createMorphologyResolver(morphology);
    morphology.slots.forEach((slot) => slot.tables.forEach((table) => {
      table.cells.filter(({ kind }) => kind === "rule").forEach(({ rowId, columnId, sourceText }) => {
        const references = extractMorphologyReferences(sourceText);
        if (!references.length) return;
        const label = `${table.title}: ${morphologyCellLabel(resolver.tableShape(table.id), rowId, columnId)}`;
        references.forEach((reference) => {
          if (reference.unterminated) {
            errors.push(`${label}: missing }`);
            return;
          }
          const body = reference.body.trim();
          if (!body || body.toLowerCase() === "lemma") return;
          body.split(",").forEach((part) => {
            const parsed = parseMorphologyReplacement(part);
            if (!parsed.valid) errors.push(`${label}: {${body}} - ${parsed.reason}`);
          });
        });
      });
    }));
    return errors;
  }


  function extractMorphologyReferences(value) {
    const references = [];
    const text = String(value || "");
    let index = 0;
    while (index < text.length) {
      if (text[index] !== "{") {
        index += 1;
        continue;
      }
      const end = text.indexOf("}", index + 1);
      if (end < 0) {
        references.push({ body: text.slice(index + 1), unterminated: true });
        break;
      }
      references.push({ body: text.slice(index + 1, end), unterminated: false });
      index = end + 1;
    }
    return references;
  }

  function extractMorphologyFunctionCalls(rule) {
    const calls = [];
    const text = String(rule || "");
    let index = 0;
    while (index < text.length) {
      if (text[index] !== "/") {
        index += 1;
        continue;
      }
      const end = text.indexOf("/", index + 1);
      if (end < 0) {
        break;
      }
      String(text.slice(index + 1, end) || "")
        .split(/;/)
        .map(parseMorphologyConditionClause)
        .filter((clause) => clause?.type === "condition")
        .forEach((clause) => {
          const call = parseMorphologyFunctionCondition(clause.condition);
          if (call) {
            calls.push(call);
          }
        });
      index = end + 1;
    }
    return calls;
  }

  function applyMorphologyRuleSyntax(lemma, rule, functions = normalizeMorphologyFunctions()) {
    const text = expandMorphologyReferences(rule, lemma);
    let output = "";
    let index = 0;

    while (index < text.length) {
      if (text[index] === "/") {
        const end = text.indexOf("/", index + 1);
        if (end >= 0) {
          output += evaluateMorphologyConditionBlock(
            text.slice(index + 1, end),
            output,
            morphologyRightContext(text.slice(end + 1), lemma),
            lemma,
            functions,
          );
          index = end + 1;
          continue;
        }
      }

      output += text[index];
      index += 1;
    }

    return output;
  }

  function evaluateMorphologyConditionBlock(block, leftContext, rightContext, lemma, functions = normalizeMorphologyFunctions()) {
    const clauses = String(block || "").split(/;/);
    for (const clause of clauses) {
      const parsed = parseMorphologyConditionClause(clause);
      if (!parsed) {
        continue;
      }
      if (parsed.type === "else" || morphologyConditionMatches(parsed.condition, leftContext, rightContext, functions)) {
        return renderMorphologyConditionOutput(parsed.output, lemma);
      }
    }
    return "";
  }

  function parseMorphologyConditionClause(clause) {
    const text = String(clause || "").trim();
    if (!text) {
      return null;
    }
    const equalsIndex = text.indexOf("=");
    const left = equalsIndex >= 0 ? text.slice(0, equalsIndex).trim() : text.trim();
    const output = equalsIndex >= 0 ? text.slice(equalsIndex + 1).trim() : "";
    if (left.toLowerCase() === "else") {
      return { type: "else", output };
    }
    return { type: "condition", condition: left, output };
  }

  function morphologyConditionMatches(condition, leftContext, rightContext, functions = normalizeMorphologyFunctions()) {
    const call = parseMorphologyFunctionCondition(condition);
    if (!call || !call.options.length || call.invalidOffset) {
      return false;
    }
    if (call.name === "left" || call.name === "right") {
      const found = nthDirectionalCharacter(call.name === "left" ? leftContext : rightContext, call.name, call.offset);
      return Boolean(found && call.options.includes(found));
    }

    const recognized = functions[call.name] || [];
    if (!recognized.length) {
      return false;
    }
    const nearest = call.name === "rightV"
      ? nearestRightMatch(rightContext, recognized)
      : nearestLeftMatch(leftContext, recognized);
    return Boolean(nearest && call.options.includes(nearest));
  }

  function parseMorphologyFunctionCondition(condition) {
    const match = String(condition || "").match(/^(leftV|rightV|left|right)\(([^()]*)\)(?:\(([^()]*)\))?$/i);
    if (!match) {
      return null;
    }
    const name = morphologyFunctionName(match[1]);
    const rawOffset = match[3];
    const offset = rawOffset === undefined ? 1 : Number.parseInt(rawOffset, 10);
    const invalidOffset = rawOffset !== undefined && (!/^[1-9]\d*$/.test(rawOffset.trim()) || !Number.isInteger(offset));
    return {
      name,
      options: splitList(match[2]),
      offset: invalidOffset ? 1 : offset,
      invalidOffset,
    };
  }

  function morphologyFunctionName(name) {
    const normalized = String(name || "").toLowerCase();
    if (normalized === "rightv") {
      return "rightV";
    }
    if (normalized === "left") {
      return "left";
    }
    if (normalized === "right") {
      return "right";
    }
    return "leftV";
  }

  function nthDirectionalCharacter(context, direction, offset) {
    const chars = Array.from(String(context || ""));
    if (chars.length < offset) {
      return "";
    }
    return direction === "right" ? chars[offset - 1] : chars[chars.length - offset];
  }

  function nearestLeftMatch(context, options) {
    const text = String(context || "");
    const candidates = [...options].sort((a, b) => b.length - a.length);
    for (let index = text.length - 1; index >= 0; index -= 1) {
      const found = candidates.find((candidate) => text.startsWith(candidate, index));
      if (found) {
        return found;
      }
    }
    return "";
  }

  function nearestRightMatch(context, options) {
    const text = String(context || "");
    const candidates = [...options].sort((a, b) => b.length - a.length);
    for (let index = 0; index < text.length; index += 1) {
      const found = candidates.find((candidate) => text.startsWith(candidate, index));
      if (found) {
        return found;
      }
    }
    return "";
  }

  function morphologyRightContext(fragment, lemma) {
    const text = expandMorphologyReferences(fragment, lemma);
    let context = "";
    let index = 0;

    while (index < text.length) {
      if (text[index] === "/") {
        const end = text.indexOf("/", index + 1);
        if (end >= 0) {
          index = end + 1;
          continue;
        }
      }

      context += text[index];
      index += 1;
    }

    return context;
  }

  function renderMorphologyConditionOutput(output, lemma) {
    return expandMorphologyReferences(output, lemma);
  }

  function expandMorphologyReferences(value, lemma) {
    const text = String(value || "");
    let rendered = "";
    let index = 0;

    while (index < text.length) {
      const reference = consumeMorphologyReference(text, index, lemma);
      if (reference) {
        rendered += reference.value;
        index = reference.nextIndex;
        continue;
      }
      rendered += text[index];
      index += 1;
    }

    return rendered;
  }

  function consumeMorphologyReference(text, index, lemma) {
    if (text[index] !== "{") {
      return null;
    }
    const end = text.indexOf("}", index + 1);
    if (end < 0) {
      return null;
    }
    return {
      value: renderMorphologyReference(text.slice(index + 1, end), lemma),
      nextIndex: end + 1,
    };
  }

  function renderMorphologyReference(body, lemma) {
    const text = String(body || "").trim();
    if (!text || text.toLowerCase() === "lemma") {
      return lemma;
    }

    const replacements = text
      .split(",")
      .map(parseMorphologyReplacement)
      .filter((replacement) => replacement?.valid);

    if (!replacements.length) {
      return lemma;
    }

    return applyMorphologyReplacements(lemma, replacements);
  }

  function parseMorphologyReplacement(item) {
    const equalsIndex = String(item || "").indexOf("=");
    if (equalsIndex < 0) {
      return { valid: false, reason: "missing =" };
    }
    const rawTarget = item.slice(0, equalsIndex).trim();
    const to = item.slice(equalsIndex + 1).trim();
    const selectorMatch = rawTarget.match(/^(.*?)(?:\[([^\]]*)\])?$/);
    const from = selectorMatch?.[1]?.trim() || "";
    const rawSelector = selectorMatch?.[2]?.trim();
    if (!from) {
      return { valid: false, reason: "missing target" };
    }
    if (rawSelector === "*") {
      return { valid: true, from, to, selector: "*" };
    }
    if (rawSelector === undefined) {
      return { valid: true, from, to, selector: 1 };
    }
    if (rawSelector === "") {
      return { valid: false, reason: "invalid selector []" };
    }
    if (!/^-?[1-9]\d*$/.test(rawSelector)) {
      return { valid: false, reason: `invalid selector [${rawSelector}]` };
    }
    return { valid: true, from, to, selector: Number.parseInt(rawSelector, 10) };
  }

  function applyMorphologyReplacements(lemma, replacements) {
    const scheduled = [];
    replacements.forEach((replacement, order) => {
      morphologyReplacementTargets(lemma, replacement).forEach((target) => {
        for (let index = scheduled.length - 1; index >= 0; index -= 1) {
          if (rangesOverlap(scheduled[index], target)) {
            scheduled.splice(index, 1);
          }
        }
        scheduled.push({ ...target, to: replacement.to, order });
      });
    });

    if (!scheduled.length) {
      return lemma;
    }

    scheduled.sort((a, b) => a.start - b.start || a.order - b.order);
    let output = "";
    let cursor = 0;
    scheduled.forEach((item) => {
      if (item.start < cursor) {
        return;
      }
      output += lemma.slice(cursor, item.start);
      output += item.to;
      cursor = item.end;
    });
    return output + lemma.slice(cursor);
  }

  function morphologyReplacementTargets(lemma, replacement) {
    const matches = morphologyReplacementMatches(lemma, replacement.from);
    if (replacement.selector === "*") {
      return matches;
    }
    const index = replacement.selector > 0
      ? replacement.selector - 1
      : matches.length + replacement.selector;
    return matches[index] ? [matches[index]] : [];
  }

  function morphologyReplacementMatches(lemma, target) {
    const matches = [];
    let index = 0;
    while (index <= lemma.length - target.length) {
      const found = lemma.indexOf(target, index);
      if (found < 0) {
        break;
      }
      matches.push({ start: found, end: found + target.length });
      index = found + Math.max(1, target.length);
    }
    return matches;
  }

  function rangesOverlap(a, b) {
    return a.start < b.end && b.start < a.end;
  }

  return {
    applyMorphologyRuleSyntax,
    createMorphologyResolver,
    detachMorphologyTable,
    explainAutomaticTables,
    extractMorphologyFunctionCalls,
    extractMorphologyReferences,
    findMorphologyReferenceCycle,
    findMorphologyReferenceCycles,
    materializeAutomaticMorphologyTables,
    morphologyCellKey,
    morphologyCellLabel,
    morphologyMatchContexts,
    morphologyMatchRuleError,
    morphologyMergeRegions,
    morphologyRuleMoreSpecific,
    morphologySearchStrings,
    morphologySearchValueRecords,
    morphologyDisplayGroups,
    normalizeEntryMorphologyState,
    normalizeMorphology,
    normalizeMorphologyFunctions,
    normalizeMorphologyMatchTags,
    parseMorphologyConditionClause,
    parseMorphologyFunctionCondition,
    parseMorphologyReplacement,
    remapMorphologyCells,
    removeMorphologyAxisItem,
    resolveAutomaticTables,
    validateMorphologyFunctionUsage,
    validateMorphologyReferenceSyntax,
  };
});
