(function initMorphologyModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconMorphology = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createMorphologyModel() {
  function splitList(value) {
    return String(value || "")
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeText(value) {
    return String(value || "").trim().toLocaleLowerCase("zh-CN");
  }

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
      tables: Array.isArray(morphology.tables)
        ? morphology.tables.map((table) => normalizeMorphologyTable(table, normalizedOptions))
        : [],
    };
  }

  function normalizeMorphologyFunctions(functions = {}) {
    return {
      leftV: uniqueList(functions.leftV),
      rightV: uniqueList(functions.rightV),
    };
  }

  function normalizeMorphologyTable(table = {}, options = {}) {
    const normalizedOptions = normalizeMorphologyOptions(options);
    const usedIds = normalizedOptions.usedIds || new Set();
    const reserveEntityId = normalizedOptions.reserveEntityId || fallbackReserveEntityId;
    const defaultName = normalizedOptions.defaultTableName || "Morphology Table";
    const rows = Math.max(1, Number.parseInt(table.rows, 10) || 2);
    const cols = Math.max(1, Number.parseInt(table.cols, 10) || 2);
    const rowLabels = Array.from({ length: rows }, (_, index) => String(table.rowLabels?.[index] || `${index + 1}`));
    const colLabels = Array.from({ length: cols }, (_, index) => String(table.colLabels?.[index] || `${index + 1}`));
    const cells = {};
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const key = morphologyCellKey(row, col);
        cells[key] = normalizeMorphologyCell(table.cells?.[key]);
      }
    }
    return {
      id: reserveEntityId(table.id, "morph", usedIds),
      name: String(table.name || defaultName),
      rows,
      cols,
      rowLabels,
      colLabels,
      matchTags: splitList(Array.isArray(table.matchTags) ? table.matchTags.join("，") : table.matchTags || ""),
      cells,
    };
  }

  function normalizeMorphologyCell(cell = {}) {
    return {
      mode: cell.mode === "replace" ? "replace" : "reference",
      value: String(cell.value || ""),
    };
  }

  function normalizeEntryMorphology(morphology = {}) {
    return {
      tableId: morphology.tableId || "auto",
      overrides: normalizeMorphologyOverrides(morphology.overrides),
    };
  }

  function normalizeMorphologyOverrides(overrides = {}) {
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(overrides)
        .map(([key, value]) => [key, String(value || "").trim()])
        .filter(([, value]) => value),
    );
  }

  function morphologyCellKey(row, col) {
    return `${row},${col}`;
  }

  function morphologyTables(dictionary = {}) {
    return normalizeMorphology(dictionary?.morphology).tables;
  }

  function resolveEntryMorphologyTable(entry = {}, dictionary = {}, options = {}) {
    const tables = morphologyTables(dictionary);
    const selected = entry.morphology?.tableId || "auto";
    if (selected === "none") {
      return null;
    }
    if (selected && selected !== "auto") {
      return tables.find((table) => table.id === selected) || null;
    }
    const normalize = options.normalizeText || normalizeText;
    const entryTags = new Set((entry.tags || []).map(normalize));
    return tables.find((table) => table.matchTags.some((tag) => entryTags.has(normalize(tag)))) || null;
  }

  function morphologyCellValue(entry = {}, table = {}, row = 0, col = 0, dictionary = {}) {
    const key = morphologyCellKey(row, col);
    const override = entry.morphology?.overrides?.[key];
    if (override) {
      return override;
    }
    return morphologyCellDefaultValue(entry, table, row, col, dictionary);
  }

  function morphologyCellDefaultValue(entry = {}, table = {}, row = 0, col = 0, dictionary = {}) {
    const key = morphologyCellKey(row, col);
    const cell = table.cells?.[key] || normalizeMorphologyCell();
    const rule = String(cell.value || "").trim();
    if (!rule) {
      return entry.lemma || "";
    }
    return applyMorphologyRuleSyntax(entry.lemma || "", rule, normalizeMorphology(dictionary?.morphology).functions);
  }

  function morphologySearchStrings(entry = {}, dictionary = {}) {
    const table = resolveEntryMorphologyTable(entry, dictionary);
    if (!table) {
      return [];
    }
    const values = [];
    for (let row = 0; row < table.rows; row += 1) {
      for (let col = 0; col < table.cols; col += 1) {
        values.push(morphologyCellValue(entry, table, row, col, dictionary));
      }
    }
    return values;
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
    morphologyCellDefaultValue,
    morphologyCellKey,
    morphologyCellValue,
    morphologySearchStrings,
    normalizeEntryMorphology,
    normalizeMorphology,
    normalizeMorphologyCell,
    normalizeMorphologyFunctions,
    normalizeMorphologyOverrides,
    normalizeMorphologyTable,
    resolveEntryMorphologyTable,
  };
});
