(function initMorphologyModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./search-normalization-model"));
    return;
  }
  root.ConlexiconMorphology = factory(root.ConlexiconSearchNormalization);
})(typeof globalThis !== "undefined" ? globalThis : this, function createMorphologyModel(searchNormalization) {
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

  function fallbackReserveEntityId(value, prefix, usedIds = new Set()) {
    const existing = String(value || "").trim();
    if (existing) {
      usedIds.add(existing);
      return existing;
    }
    let index = 1;
    let id = `${prefix}-${index}`;
    while (usedIds.has(id)) {
      index += 1;
      id = `${prefix}-${index}`;
    }
    usedIds.add(id);
    return id;
  }

  function normalizeMorphologyOptions(options = {}) {
    if (options instanceof Set) {
      return { usedIds: options };
    }
    return options || {};
  }

  function normalizeMorphology(morphology = {}, options = {}) {
    const normalizedOptions = normalizeMorphologyOptions(options);
    return {
      functions: normalizeMorphologyFunctions(morphology.functions),
      templateGroups: Array.isArray(morphology.templateGroups)
        ? morphology.templateGroups.map((group, index) => normalizeMorphologyTemplateGroup(group, index, normalizedOptions))
        : [],
    };
  }

  function normalizeMorphologyFunctions(functions = {}) {
    return {
      leftV: uniqueList(functions.leftV),
      rightV: uniqueList(functions.rightV),
    };
  }

  function normalizeMorphologyTemplateGroup(group = {}, position = 0, options = {}) {
    const normalizedOptions = normalizeMorphologyOptions(options);
    const usedIds = normalizedOptions.usedIds || new Set();
    const reserveEntityId = normalizedOptions.reserveEntityId || fallbackReserveEntityId;
    const id = reserveEntityId(group.id, "morph", usedIds);
    const defaultName = normalizedOptions.defaultGroupName || "Morphology Group";
    return {
      id,
      name: String(group.name || defaultName),
      matchTags: splitList(Array.isArray(group.matchTags) ? group.matchTags.join("，") : group.matchTags || ""),
      notes: String(group.notes || ""),
      tables: Array.isArray(group.tables)
        ? group.tables.map((table, tableIndex) => normalizeMorphologyTemplateTable(table, tableIndex, {
          ...normalizedOptions,
          groupId: id,
        }))
        : [],
      createdAt: String(group.createdAt || ""),
      updatedAt: String(group.updatedAt || ""),
    };
  }

  function normalizeMorphologyTemplateTable(table = {}, position = 0, options = {}) {
    const normalizedOptions = normalizeMorphologyOptions(options);
    const usedIds = normalizedOptions.usedIds || new Set();
    const reserveEntityId = normalizedOptions.reserveEntityId || fallbackReserveEntityId;
    const defaultTitle = normalizedOptions.defaultTableTitle || "Morphology Table";
    const rowCount = Math.max(1, Number.parseInt(table.rowCount, 10) || 2);
    const columnCount = Math.max(1, Number.parseInt(table.columnCount, 10) || 2);
    const rowLabels = Array.from({ length: rowCount }, (_, index) => String(table.rowLabels?.[index] || `${index + 1}`));
    const columnLabels = Array.from({ length: columnCount }, (_, index) => String(table.columnLabels?.[index] || `${index + 1}`));
    const cells = {};
    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < columnCount; col += 1) {
        const key = morphologyCellKey(row, col);
        cells[key] = normalizeMorphologyCell(table.cells?.[key]);
      }
    }
    return {
      id: reserveEntityId(table.id, "mtable", usedIds),
      title: String(table.title || defaultTitle),
      rowCount,
      columnCount,
      rowLabels,
      columnLabels,
      cells,
      createdAt: String(table.createdAt || ""),
      updatedAt: String(table.updatedAt || ""),
    };
  }

  function normalizeMorphologyCell(cell = {}) {
    return {
      sourceText: morphologyCellSourceText(cell),
    };
  }

  function morphologyCellSourceText(cell = {}) {
    if (cell && typeof cell === "object" && !Array.isArray(cell)) {
      return String(cell.sourceText || "");
    }
    return String(cell || "");
  }

  function normalizeEntryMorphologyGroups(groups = []) {
    if (!Array.isArray(groups)) {
      return [];
    }
    return groups
      .map((group) => normalizeEntryMorphologyGroup(group))
      .filter((group) => group.templateGroupId);
  }

  function normalizeMorphologyMode(value) {
    return value === "manual" ? "manual" : "auto";
  }

  function isActualTemplateGroupId(value) {
    const id = String(value || "").trim();
    return Boolean(id) && id !== "auto" && id !== "none";
  }

  function entryMorphologyGroupHasOverlayContent(group = {}) {
    return Boolean(
      String(group.title || "").trim()
      || String(group.notes || "").trim()
      || Object.keys(normalizeMorphologyOverrides(group.overrides)).length,
    );
  }

  // This is the canonical entry-side morphology shape used by the new
  // auto/manual model. It intentionally does not interpret the old
  // "auto" and "none" pseudo group IDs; legacy import owns that conversion.
  function normalizeEntryMorphologyState(entry = {}) {
    const morphologyMode = normalizeMorphologyMode(entry.morphologyMode);
    const groups = normalizeEntryMorphologyGroups(entry.morphologyGroups)
      .filter((group) => isActualTemplateGroupId(group.templateGroupId));

    if (morphologyMode === "auto") {
      return {
        morphologyMode,
        // In automatic mode, stored groups are only overlays for real
        // template groups. Empty groups would not affect the rendered result.
        morphologyGroups: groups.filter(entryMorphologyGroupHasOverlayContent),
      };
    }
    return { morphologyMode, morphologyGroups: groups };
  }

  function normalizeEntryMorphologyGroup(group = {}) {
    return {
      templateGroupId: String(group.templateGroupId || "").trim(),
      title: String(group.title || ""),
      notes: String(group.notes || ""),
      overrides: normalizeMorphologyOverrides(group.overrides),
      createdAt: String(group.createdAt || ""),
      updatedAt: String(group.updatedAt || ""),
    };
  }

  function normalizeMorphologyOverrides(overrides = {}) {
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      return {};
    }
    return Object.fromEntries(Object.entries(overrides)
      .filter(([, cells]) => cells && typeof cells === "object" && !Array.isArray(cells))
      .map(([tableId, cells]) => [String(tableId).trim(), Object.fromEntries(Object.entries(cells)
        .map(([key, value]) => [key, String(value || "").trim()])
        .filter(([key, value]) => /^(\d+),(\d+)$/.test(key) && value))])
      .filter(([tableId, cells]) => tableId && Object.keys(cells).length));
  }

  function morphologyCellKey(row, col) {
    return `${row},${col}`;
  }

  function morphologyOverrideRows(overrides = {}) {
    return Object.entries(normalizeMorphologyOverrides(overrides)).flatMap(([tableId, cells]) => Object.entries(cells).map(([key, value]) => {
      const match = key.match(/^(\d+),(\d+)$/);
      return {
        tableId,
        rowIndex: Number(match[1]),
        columnIndex: Number(match[2]),
        value,
      };
    }));
  }

  function morphologyTemplateGroups(dictionary = {}) {
    return normalizeMorphology(dictionary?.morphology).templateGroups;
  }

  // This currently preserves the existing first-match tag behavior while
  // returning an ordered list. A later assignment-rule engine can replace the
  // implementation without changing entry overlays or their rendering.
  function resolveAutomaticTemplateGroups(entry = {}, dictionary = {}, options = {}) {
    const normalize = options.normalizeText || normalizeText;
    const entryTags = new Set((entry.tags || []).map(normalize));
    const templateGroup = morphologyTemplateGroups(dictionary)
      .find((group) => group.matchTags.some((tag) => entryTags.has(normalize(tag))));
    return templateGroup ? [templateGroup] : [];
  }

  function resolveCanonicalEntryMorphologyGroups(entry = {}, dictionary = {}, options = {}) {
    const state = normalizeEntryMorphologyState(entry);
    const templateGroups = morphologyTemplateGroups(dictionary);
    const byId = new Map(templateGroups.map((group) => [group.id, group]));

    if (state.morphologyMode === "manual") {
      return state.morphologyGroups
        .map((entryGroup) => ({ templateGroup: byId.get(entryGroup.templateGroupId), entryGroup }))
        .filter(({ templateGroup }) => Boolean(templateGroup));
    }

    const overlaysByTemplateGroupId = new Map(
      state.morphologyGroups.map((entryGroup) => [entryGroup.templateGroupId, entryGroup]),
    );
    return resolveAutomaticTemplateGroups(entry, dictionary, options)
      .map((templateGroup) => ({
        templateGroup,
        entryGroup: overlaysByTemplateGroupId.get(templateGroup.id) || null,
      }));
  }

  function materializeAutomaticMorphologyGroups(entry = {}, dictionary = {}, options = {}) {
    const state = normalizeEntryMorphologyState(entry);
    if (state.morphologyMode !== "auto") {
      return state.morphologyGroups;
    }
    const resolvedGroups = resolveAutomaticTemplateGroups(entry, dictionary, options);
    const overlaysByGroupId = new Map(state.morphologyGroups.map((group) => [group.templateGroupId, group]));
    const resolvedIds = new Set(resolvedGroups.map((group) => group.id));
    const materialized = resolvedGroups.map((templateGroup) => overlaysByGroupId.get(templateGroup.id) || {
      templateGroupId: templateGroup.id,
      title: "",
      notes: "",
      overrides: {},
    });
    const dormantOverlays = state.morphologyGroups.filter((group) => !resolvedIds.has(group.templateGroupId));
    return normalizeEntryMorphologyState({
      morphologyMode: "manual",
      morphologyGroups: [...materialized, ...dormantOverlays],
    }).morphologyGroups;
  }

  function validateCanonicalEntryMorphology(entry = {}, dictionary = {}) {
    const errors = [];
    const mode = normalizeMorphologyMode(entry.morphologyMode);
    const sourceGroups = Array.isArray(entry.morphologyGroups) ? entry.morphologyGroups : [];
    const state = normalizeEntryMorphologyState(entry);
    const templateGroups = morphologyTemplateGroups(dictionary);
    const groupsById = new Map(templateGroups.map((group) => [group.id, group]));

    if (entry.morphologyMode !== undefined && mode !== entry.morphologyMode) {
      errors.push("invalid morphology mode");
    }
    sourceGroups.forEach((group) => {
      if (!isActualTemplateGroupId(group?.templateGroupId)) {
        errors.push(`invalid morphology template group: ${String(group?.templateGroupId || "")}`);
      }
    });

    const seenTemplateGroupIds = new Set();
    state.morphologyGroups.forEach((entryGroup) => {
      const templateGroup = groupsById.get(entryGroup.templateGroupId);
      if (!templateGroup) {
        errors.push(`unknown morphology template group: ${entryGroup.templateGroupId}`);
        return;
      }
      if (seenTemplateGroupIds.has(entryGroup.templateGroupId)) {
        errors.push(`duplicate entry morphology group: ${entryGroup.templateGroupId}`);
      }
      seenTemplateGroupIds.add(entryGroup.templateGroupId);

      const tablesById = new Map((templateGroup.tables || []).map((table) => [table.id, table]));
      Object.entries(entryGroup.overrides || {}).forEach(([tableId, cells]) => {
        const table = tablesById.get(tableId);
        if (!table) {
          errors.push(`unknown morphology template table: ${tableId}`);
          return;
        }
        Object.keys(cells || {}).forEach((key) => {
          const match = String(key).match(/^(\d+),(\d+)$/);
          const row = match ? Number(match[1]) : -1;
          const column = match ? Number(match[2]) : -1;
          if (!match || row >= table.rowCount || column >= table.columnCount) {
            errors.push(`invalid morphology override cell: ${tableId}:${key}`);
          }
        });
      });
    });
    return errors;
  }

  function resolveEntryMorphologyGroups(entry = {}, dictionary = {}, options = {}) {
    return resolveCanonicalEntryMorphologyGroups(entry, dictionary, options);
  }

  function morphologyCellValue(entry = {}, entryGroup = null, table = {}, row = 0, col = 0, dictionary = {}) {
    const key = morphologyCellKey(row, col);
    const override = entryGroup?.overrides?.[table.id]?.[key];
    if (override) {
      return override;
    }
    return morphologyCellDefaultValue(entry, table, row, col, dictionary);
  }

  function morphologyCellDefaultValue(entry = {}, table = {}, row = 0, col = 0, dictionary = {}) {
    const key = morphologyCellKey(row, col);
    const cell = table.cells?.[key] || normalizeMorphologyCell();
    const rule = String(cell.sourceText || "").trim();
    if (!rule) {
      return "";
    }
    return applyMorphologyRuleSyntax(entry.lemma || "", rule, normalizeMorphology(dictionary?.morphology).functions);
  }

  function morphologySearchValueRecords(entry = {}, dictionary = {}) {
    const records = [];
    let sourcePosition = 0;
    resolveEntryMorphologyGroups(entry, dictionary).forEach(({ templateGroup, entryGroup }) => {
      templateGroup.tables.forEach((table) => {
        for (let row = 0; row < table.rowCount; row += 1) {
          for (let col = 0; col < table.columnCount; col += 1) {
            records.push({
              value: morphologyCellValue(entry, entryGroup, table, row, col, dictionary),
              templateGroupId: templateGroup.id,
              tableId: table.id,
              rowIndex: row,
              columnIndex: col,
              sourcePosition,
            });
            sourcePosition += 1;
          }
        }
      });
    });
    return records;
  }

  function morphologySearchStrings(entry = {}, dictionary = {}) {
    return morphologySearchValueRecords(entry, dictionary).map((record) => record.value);
  }

  function validateMorphologyFunctionUsage(morphology = {}) {
    const normalized = normalizeMorphology(morphology);
    const errors = [];
    normalized.templateGroups.forEach((group) => group.tables.forEach((table) => {
      Object.values(table.cells).forEach((cell) => {
        const sourceText = cell.sourceText;
        extractMorphologyFunctionCalls(sourceText).forEach((call) => {
          if (call.invalidOffset) {
            errors.push(`${table.title}: ${call.name} offset must be a positive integer`);
            return;
          }
          if (call.name === "left" || call.name === "right") {
            return;
          }
          const configured = normalized.functions[call.name] || [];
          if (!configured.length) {
            errors.push(`${table.title}: ${call.name} not configured`);
            return;
          }
          const invalid = call.options.filter((option) => !configured.includes(option));
          if (invalid.length) {
            errors.push(`${table.title}: ${call.name}(${invalid.join(", ")})`);
          }
        });
      });
    }));
    return errors;
  }

  function validateMorphologyReferenceSyntax(morphology = {}, options = {}) {
    const normalized = normalizeMorphology(morphology);
    const errors = [];
    normalized.templateGroups.forEach((group) => group.tables.forEach((table) => {
      Object.entries(table.cells).forEach(([key, cell]) => {
        const label = typeof options.labelForCell === "function"
          ? options.labelForCell(table, key)
          : morphologyCellErrorLabel(table, key);
        extractMorphologyReferences(cell.sourceText).forEach((reference) => {
          if (reference.unterminated) {
            errors.push(`${label}: missing }`);
            return;
          }
          const body = reference.body.trim();
          if (!body || body.toLowerCase() === "lemma") {
            return;
          }
          body.split(",").forEach((part) => {
            const parsed = parseMorphologyReplacement(part);
            if (!parsed.valid) {
              errors.push(`${label}: {${body}} - ${parsed.reason}`);
            }
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

  function morphologyCellErrorLabel(table = {}, key = "") {
    const match = String(key || "").match(/^(\d+),(\d+)$/);
    if (!match) {
      return table.title || "Morphology Table";
    }
    const row = Number.parseInt(match[1], 10);
    const col = Number.parseInt(match[2], 10);
    const rowLabel = table.rowLabels?.[row] || `${row + 1}`;
    const colLabel = table.columnLabels?.[col] || `${col + 1}`;
    return `${table.title || "Morphology Table"}: ${rowLabel} / ${colLabel}`;
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
    extractMorphologyFunctionCalls,
    extractMorphologyReferences,
    morphologyCellErrorLabel,
    morphologyCellDefaultValue,
    morphologyCellKey,
    morphologyCellSourceText,
    morphologyCellValue,
    morphologyOverrideRows,
    morphologySearchStrings,
    morphologySearchValueRecords,
    morphologyTemplateGroups,
    materializeAutomaticMorphologyGroups,
    normalizeEntryMorphologyState,
    normalizeEntryMorphologyGroup,
    normalizeEntryMorphologyGroups,
    normalizeMorphologyMode,
    normalizeMorphology,
    normalizeMorphologyCell,
    normalizeMorphologyFunctions,
    normalizeMorphologyOverrides,
    normalizeMorphologyTemplateGroup,
    normalizeMorphologyTemplateTable,
    parseMorphologyConditionClause,
    parseMorphologyFunctionCondition,
    parseMorphologyReplacement,
    resolveAutomaticTemplateGroups,
    resolveCanonicalEntryMorphologyGroups,
    resolveEntryMorphologyGroups,
    validateCanonicalEntryMorphology,
    validateMorphologyFunctionUsage,
    validateMorphologyReferenceSyntax,
  };
});
