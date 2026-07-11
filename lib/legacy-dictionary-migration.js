const crypto = require("node:crypto");
const { apiError } = require("./api-error");

function httpError(message, status, code, details) {
  return apiError(message, status, code, details);
}

function splitSourceText(value) {
  return String(value || "")
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLegacyEditSwitchAction(currentValue, legacyValue) {
  if (["save", "discard", "prompt"].includes(currentValue)) {
    return currentValue;
  }
  return legacyValue ? "save" : "discard";
}

function hasStressOutput(value) {
  return /[ˈˌ']/.test(String(value || ""));
}

function splitQueryList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function deterministicUuid(value) {
  const hex = crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function entryMorphologyInstanceId(entryId, position) {
  return `emorph-${deterministicUuid(`${entryId}:${position}`)}`;
}

function morphologyTemplateGroupId(table = {}, position = 0) {
  return String(table.id || `morph-${deterministicUuid(`template-group:${position}`)}`);
}

function morphologyTemplateTableId(groupId, position = 0) {
  return `mtable-${deterministicUuid(`${groupId}:${position}`)}`;
}

function legacyMorphologyCellSourceText(cell = {}) {
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    return String(cell.sourceText ?? cell.value ?? "");
  }
  return String(cell || "");
}

function legacyMorphologyTemplateCellMap(table = {}, rows = 1, columns = 1) {
  const cells = {};
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${row},${column}`;
      cells[key] = { sourceText: legacyMorphologyCellSourceText(table.cells?.[key]) };
    }
  }
  return cells;
}

function legacyMorphologyTemplateTable(table = {}, groupId = "", position = 0, fallbackTitle = "") {
  const rowCount = Math.max(1, Number.parseInt(table.rowCount ?? table.rows, 10) || 2);
  const columnCount = Math.max(1, Number.parseInt(table.columnCount ?? table.cols, 10) || 2);
  return {
    id: String(table.id || morphologyTemplateTableId(groupId, position)),
    title: String(table.title || table.name || fallbackTitle || "Morphology Table"),
    rowCount,
    columnCount,
    rowLabels: Array.from({ length: rowCount }, (_, index) => String(table.rowLabels?.[index] || `${index + 1}`)),
    columnLabels: Array.from({ length: columnCount }, (_, index) => String(table.columnLabels?.[index] || table.colLabels?.[index] || `${index + 1}`)),
    cells: legacyMorphologyTemplateCellMap(table, rowCount, columnCount),
    createdAt: String(table.createdAt || table.created_at || ""),
    updatedAt: String(table.updatedAt || table.updated_at || ""),
  };
}

function legacyTablesToTemplateGroups(morphology = {}, report) {
  const legacyTables = Array.isArray(morphology.tables) ? morphology.tables : [];
  if (legacyTables.length && report) {
    report.repairs.push("legacy morphology.tables migrated to morphology.templateGroups");
  }
  return legacyTables.map((table, index) => {
    const id = morphologyTemplateGroupId(table, index);
    return {
      id,
      position: index,
      name: String(table.name || `Morphology Table ${index + 1}`),
      matchTags: splitQueryList(Array.isArray(table.matchTags) ? table.matchTags.join(",") : table.matchTags || ""),
      notes: String(table.notes || table.note || ""),
      tables: [legacyMorphologyTemplateTable({ ...table, id: morphologyTemplateTableId(id, 0), title: table.title || table.name }, id, 0, table.name)],
      createdAt: String(table.createdAt || table.created_at || ""),
      updatedAt: String(table.updatedAt || table.updated_at || ""),
    };
  });
}

function firstTemplateTableIdByGroup(groups = []) {
  return new Map(groups.map((group) => [group.id, group.tables?.[0]?.id]).filter(([, tableId]) => tableId));
}

function normalizeMorphologyOverrideRows(overrides = {}, templateGroupId = "", tableIdByGroup = new Map()) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return [];
  }
  const rows = [];
  const defaultTableId = tableIdByGroup.get(templateGroupId) || templateGroupId || "auto";
  Object.entries(overrides).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([cellKey, cellValue]) => {
        const match = String(cellKey).match(/^(\d+),(\d+)$/);
        const text = String(cellValue || "").trim();
        if (match && text) {
          rows.push({ tableId: key, rowIndex: Number(match[1]), columnIndex: Number(match[2]), value: text });
        }
      });
      return;
    }
    const match = String(key).match(/^(\d+),(\d+)$/);
    const text = String(value || "").trim();
    if (match && text) {
      rows.push({ tableId: defaultTableId, rowIndex: Number(match[1]), columnIndex: Number(match[2]), value: text });
    }
  });
  return rows;
}

function normalizeEntryMorphologyGroup(entry = {}, instance = {}, position = 0, tableIdByGroup = new Map()) {
  const fallbackMorphology = entry.morphology || {};
  const source = instance && typeof instance === "object" && !Array.isArray(instance)
    ? instance
    : {};
  const templateGroupId = String(source.templateGroupId || source.tableId || source.table_id || fallbackMorphology.templateGroupId || fallbackMorphology.tableId || "auto");
  const overrides = source.overrides && typeof source.overrides === "object" && !Array.isArray(source.overrides)
    ? source.overrides
    : fallbackMorphology.overrides || {};
  return {
    id: String(source.id || entryMorphologyInstanceId(entry.id, position)),
    templateGroupId,
    title: String(source.title || ""),
    notes: String(source.notes || source.note || ""),
    overrides: normalizeMorphologyOverrideRows(overrides, templateGroupId, tableIdByGroup),
    createdAt: String(source.createdAt || source.created_at || entry.createdAt || ""),
    updatedAt: String(source.updatedAt || source.updated_at || entry.updatedAt || ""),
  };
}

function legacyEntryMorphologyGroups(entry = {}, tableIdByGroup = new Map(), report) {
  const legacyMorphology = entry.morphology || {};
  if ((legacyMorphology.tableId || Object.keys(legacyMorphology.overrides || {}).length) && report) {
    report.repairs.push("legacy entry.morphology migrated to entry.morphologyGroups");
  }
  return [legacyMorphology]
    .map((instance, index) => normalizeEntryMorphologyGroup(entry, instance, index, tableIdByGroup))
    .filter((group) => group.templateGroupId !== "auto" || group.title || group.overrides.length);
}

function isCanonicalMorphologyMode(value) {
  return ["auto", "manual"].includes(value);
}

function isActualTemplateGroupId(value) {
  const id = String(value || "").trim();
  return Boolean(id) && id !== "auto" && id !== "none";
}

function templateGroupIdForLegacySelection(value, tableIdByGroup = new Map()) {
  const selection = String(value || "").trim();
  if (tableIdByGroup.has(selection)) {
    return selection;
  }
  return [...tableIdByGroup.entries()].find(([, tableId]) => tableId === selection)?.[0] || "";
}

function legacyOverridesToCanonicalMap(overrides = {}, templateGroupId = "", tableIdByGroup = new Map()) {
  const result = {};
  normalizeMorphologyOverrideRows(overrides, templateGroupId, tableIdByGroup).forEach((override) => {
    const tableId = ["auto", templateGroupId].includes(override.tableId)
      ? tableIdByGroup.get(templateGroupId)
      : override.tableId;
    if (!tableId) {
      return;
    }
    if (!result[tableId]) {
      result[tableId] = {};
    }
    result[tableId][`${override.rowIndex},${override.columnIndex}`] = override.value;
  });
  return result;
}

function findLegacyAutomaticTemplateGroupId(entry = {}, templateGroups = []) {
  const tags = new Set((entry.tags || []).map((tag) => String(tag || "").trim().toLocaleLowerCase("zh-CN")));
  return templateGroups.find((group) => (group.matchTags || []).some((tag) => tags.has(String(tag || "").trim().toLocaleLowerCase("zh-CN"))))?.id || "";
}

function canonicalizeLegacyEntryMorphology(entry = {}, templateGroups = [], tableIdByGroup = new Map(), report) {
  const sourceGroups = Array.isArray(entry.morphologyGroups) ? entry.morphologyGroups : [];
  const existingMode = isCanonicalMorphologyMode(entry.morphologyMode) ? entry.morphologyMode : "";
  const legacySelection = String(entry.morphology?.tableId || "").trim();
  const explicitGroups = sourceGroups.filter((group) => isActualTemplateGroupId(group?.templateGroupId));
  const legacyAutoGroup = sourceGroups.find((group) => group?.templateGroupId === "auto");
  const hasLegacyNone = sourceGroups.some((group) => group?.templateGroupId === "none") || legacySelection === "none";

  if (entry.morphologyMode === "none" || (!existingMode && hasLegacyNone)) {
    report.repairs.push("legacy morphology none migrated to empty manual morphology");
    return { morphologyMode: "manual", morphologyGroups: [] };
  }

  if (existingMode === "manual" || (!existingMode && explicitGroups.length)) {
    return {
      morphologyMode: "manual",
      morphologyGroups: explicitGroups.map((group, position) => ({
        id: String(group.id || entryMorphologyInstanceId(entry.id, position)),
        templateGroupId: String(group.templateGroupId),
        title: String(group.title || ""),
        notes: String(group.notes || group.note || ""),
        overrides: legacyOverridesToCanonicalMap(group.overrides, group.templateGroupId, tableIdByGroup),
        createdAt: String(group.createdAt || group.created_at || entry.createdAt || ""),
        updatedAt: String(group.updatedAt || group.updated_at || entry.updatedAt || ""),
      })),
    };
  }

  const explicitSelection = templateGroupIdForLegacySelection(legacySelection, tableIdByGroup);
  if (!existingMode && explicitSelection) {
    return {
      morphologyMode: "manual",
      morphologyGroups: [{
        id: String(entryMorphologyInstanceId(entry.id, 0)),
        templateGroupId: explicitSelection,
        title: "",
        notes: "",
        overrides: legacyOverridesToCanonicalMap(entry.morphology?.overrides, explicitSelection, tableIdByGroup),
        createdAt: String(entry.createdAt || ""),
        updatedAt: String(entry.updatedAt || ""),
      }],
    };
  }

  const automaticTemplateGroupId = findLegacyAutomaticTemplateGroupId(entry, templateGroups);
  const overlaySource = legacyAutoGroup || entry.morphology || {};
  const overrides = automaticTemplateGroupId
    ? legacyOverridesToCanonicalMap(overlaySource.overrides, automaticTemplateGroupId, tableIdByGroup)
    : {};
  const overlay = automaticTemplateGroupId && (
    String(overlaySource.title || "").trim()
    || String(overlaySource.notes || overlaySource.note || "").trim()
    || Object.keys(overrides).length
  ) ? [{
    id: String(overlaySource.id || entryMorphologyInstanceId(entry.id, 0)),
    templateGroupId: automaticTemplateGroupId,
    title: String(overlaySource.title || ""),
    notes: String(overlaySource.notes || overlaySource.note || ""),
    overrides,
    createdAt: String(overlaySource.createdAt || overlaySource.created_at || entry.createdAt || ""),
    updatedAt: String(overlaySource.updatedAt || overlaySource.updated_at || entry.updatedAt || ""),
  }] : [];
  if (!existingMode && (legacySelection === "auto" || legacyAutoGroup)) {
    report.repairs.push("legacy automatic morphology migrated to morphologyMode auto");
  }
  return { morphologyMode: "auto", morphologyGroups: overlay };
}

function cloneDictionaryLikeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return {
    ...value,
    entries: Array.isArray(value.entries) ? value.entries.map((entry) => ({ ...entry })) : value.entries,
    settings: value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)
      ? { ...value.settings }
      : value.settings,
    corpus: value.corpus && typeof value.corpus === "object" && !Array.isArray(value.corpus)
      ? { ...value.corpus }
      : value.corpus,
  };
}

function dictionaryFromLegacyPayload(payload) {
  if (Array.isArray(payload?.dictionaries)) {
    const dictionary = payload.dictionaries.find((item) => item?.id === payload.activeDictionaryId) || payload.dictionaries[0];
    if (!dictionary) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return dictionary;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const hasDictionaryShape = payload.id
      || payload.name
      || Array.isArray(payload.entries)
      || payload.settings
      || payload.docs
      || payload.corpus
      || payload.morphology;
    if (!hasDictionaryShape) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return payload;
  }

  throw httpError("Invalid import payload", 400, "invalid_import_payload");
}

function migrateLegacyDictionaryPayload(payload) {
  const source = dictionaryFromLegacyPayload(payload);
  return migrateLegacyDictionary(source);
}

function migrateLegacyDictionary(dictionary = {}) {
  const report = { warnings: [], repairs: [] };
  const migrated = cloneDictionaryLikeObject(dictionary);
  if (!migrated) {
    throw httpError("Invalid import payload", 400, "invalid_import_payload");
  }

  migrated.morphology = migrateLegacyMorphology(migrated.morphology, report);
  const tableIdByGroup = firstTemplateTableIdByGroup(migrated.morphology?.templateGroups || []);
  migrated.entries = Array.isArray(migrated.entries)
    ? migrated.entries.map((entry) => migrateLegacyEntry(entry, report, tableIdByGroup, migrated.morphology?.templateGroups || []))
    : migrated.entries;
  migrated.settings = migrateLegacySettings(migrated.settings, report);
  migrated.corpus = migrateLegacyCorpus(migrated.corpus, report);

  return { dictionary: migrated, report };
}

function migrateLegacyEntry(entry = {}, report, tableIdByGroup = new Map(), templateGroups = []) {
  const migrated = {
    ...entry,
    etymology: entry.etymology && typeof entry.etymology === "object" && !Array.isArray(entry.etymology)
      ? { ...entry.etymology }
      : entry.etymology,
  };

  if (entry.partOfSpeech) {
    const tags = Array.isArray(entry.tags) ? [...entry.tags].filter(Boolean) : [];
    if (tags[0] !== entry.partOfSpeech) {
      tags.unshift(entry.partOfSpeech);
      migrated.tags = tags;
      report.repairs.push("entry.partOfSpeech migrated to tags");
    }
  }

  if ((!Array.isArray(entry.definitions) || !entry.definitions.length) && (entry.meaning || entry.example)) {
    migrated.definitions = [{ meaning: entry.meaning || "", example: entry.example || "", note: "" }];
    report.repairs.push("entry.meaning/example migrated to definitions");
  }

  const migratedEtymologyDescription = [entry.roots, entry.variant].filter(Boolean).join("\n");
  const sourceText = migrated.etymology?.sourceText || migrated.etymology?.source || "";
  const sourceEntryId = migrated.etymology?.sourceEntryId;
  if (migratedEtymologyDescription || sourceText || sourceEntryId) {
    const etymology = migrated.etymology && typeof migrated.etymology === "object" && !Array.isArray(migrated.etymology)
      ? { ...migrated.etymology }
      : {};
    if (!etymology.description && migratedEtymologyDescription) {
      etymology.description = migratedEtymologyDescription;
      report.repairs.push("entry.roots/variant migrated to etymology.description");
    }
    if (!Array.isArray(etymology.sources) || !etymology.sources.length) {
      etymology.sources = splitSourceText(sourceText);
      if (etymology.sources.length) {
        report.repairs.push("entry.etymology.source/sourceText migrated to etymology.sources");
      }
    } else {
      etymology.sources = etymology.sources.map(String).map((item) => item.trim()).filter(Boolean);
    }
    if (sourceEntryId && !etymology.sources.includes(sourceEntryId)) {
      etymology.sources.push(sourceEntryId);
      report.repairs.push("entry.etymology.sourceEntryId migrated to etymology.sources");
    }
    migrated.etymology = etymology;
  }

  if (!Array.isArray(migrated.morphologyGroups) && migrated.morphology && typeof migrated.morphology === "object" && !Array.isArray(migrated.morphology)) {
    const groups = legacyEntryMorphologyGroups(migrated, tableIdByGroup, report);
    if (groups.length) {
      migrated.morphologyGroups = groups.map((group) => ({
        id: group.id,
        templateGroupId: group.templateGroupId,
        title: group.title,
        notes: group.notes,
        overrides: group.overrides.reduce((overrides, override) => {
          if (!overrides[override.tableId]) {
            overrides[override.tableId] = {};
          }
          overrides[override.tableId][`${override.rowIndex},${override.columnIndex}`] = override.value;
          return overrides;
        }, {}),
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      }));
    }
  }

  const morphologyState = canonicalizeLegacyEntryMorphology(migrated, templateGroups, tableIdByGroup, report);
  migrated.morphologyMode = morphologyState.morphologyMode;
  migrated.morphologyGroups = morphologyState.morphologyGroups;
  delete migrated.morphology;

  return migrated;
}

function migrateLegacyMorphology(morphology = {}, report) {
  if (!morphology || typeof morphology !== "object" || Array.isArray(morphology)) {
    return morphology;
  }
  if (Array.isArray(morphology.templateGroups)) {
    return morphology;
  }
  const templateGroups = legacyTablesToTemplateGroups(morphology, report);
  return {
    ...morphology,
    templateGroups,
  };
}

function migrateLegacySettings(settings = {}, report) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return settings;
  }
  const migrated = { ...settings };

  if (Array.isArray(settings.toolNavOrder) && settings.toolNavOrder.includes("morphology")) {
    migrated.toolNavOrder = settings.toolNavOrder.flatMap((item) => (
      item === "morphology"
        ? ["morphology-functions", "morphology-tables"]
        : item
    ));
    report.repairs.push("legacy toolNavOrder morphology migrated to morphology functions and tables");
  }

  if (!migrated.glossStyles && (settings.glossFontFamily || settings.glossFont || settings.glossSmallCaps !== undefined)) {
    const fontFamily = settings.glossFontFamily || settings.glossFont || "serif";
    migrated.glossStyles = {
      gla: { fontFamily },
      glb: { fontFamily, smallCaps: Boolean(settings.glossSmallCaps) },
      glc: { fontFamily },
      ft: { fontFamily, italic: true },
    };
    report.repairs.push("legacy gloss style settings migrated to glossStyles");
  }

  if (migrated.corpusUnitCardGlossAlign === undefined && settings.corpusGlossAlign !== undefined) {
    migrated.corpusUnitCardGlossAlign = Boolean(settings.corpusGlossAlign);
    report.repairs.push("legacy corpusGlossAlign migrated to corpusUnitCardGlossAlign");
  }
  if (migrated.corpusUnitGlossAlign === undefined && settings.corpusGlossAlign !== undefined) {
    migrated.corpusUnitGlossAlign = Boolean(settings.corpusGlossAlign);
    report.repairs.push("legacy corpusGlossAlign migrated to corpusUnitGlossAlign");
  }

  if (migrated.partialEditPageSwitchAction === undefined) {
    const legacy = settings.savePartialEditOnPageSwitch ?? settings.savePartialEditOnSwitch;
    if (legacy !== undefined) {
      migrated.partialEditPageSwitchAction = normalizeLegacyEditSwitchAction(undefined, legacy);
      report.repairs.push("legacy partial edit switch setting migrated");
    }
  }
  if (migrated.fullEditPageSwitchAction === undefined) {
    const legacy = settings.saveFullEditOnPageSwitch ?? settings.saveFullEditOnSwitch;
    if (legacy !== undefined) {
      migrated.fullEditPageSwitchAction = normalizeLegacyEditSwitchAction(undefined, legacy);
      report.repairs.push("legacy full edit switch setting migrated");
    }
  }

  if (settings.ipa && typeof settings.ipa === "object" && !Array.isArray(settings.ipa)) {
    const legacyStressMappings = Array.isArray(settings.ipa.stressMappings) ? settings.ipa.stressMappings : [];
    if (legacyStressMappings.length) {
      const currentMappings = Array.isArray(settings.ipa.mappings) ? settings.ipa.mappings : [];
      migrated.ipa = {
        ...settings.ipa,
        mappings: [
          ...currentMappings,
          ...legacyStressMappings.map((rule = {}) => ({
            ...rule,
            to: hasStressOutput(rule.to) ? rule.to : `ˈ${rule.to || rule.from || ""}`,
          })),
        ],
      };
      delete migrated.ipa.stressMappings;
      report.repairs.push("legacy IPA stressMappings migrated to ipa.mappings");
    }
  }

  return migrated;
}

function migrateLegacyCorpus(corpus = {}, report) {
  if (!corpus || typeof corpus !== "object" || Array.isArray(corpus)) {
    return corpus;
  }
  const migrated = { ...corpus };
  migrated.blocks = Array.isArray(corpus.blocks)
    ? corpus.blocks.map((block) => migrateLegacyCorpusBlock(block, report))
    : corpus.blocks;
  migrated.units = Array.isArray(corpus.units)
    ? corpus.units.map((unit) => migrateLegacyCorpusUnit(unit, report))
    : corpus.units;
  return migrated;
}

function migrateLegacyCorpusBlock(block = {}, report) {
  const migrated = { ...block };
  if (!migrated.title && block.name) {
    migrated.title = block.name;
    report.repairs.push("corpus block name migrated to title");
  }
  return migrated;
}

function migrateLegacyCorpusUnit(unit = {}, report) {
  const migrated = { ...unit };
  if (!migrated.content && unit.text) {
    migrated.content = unit.text;
    report.repairs.push("corpus unit text migrated to content");
  }
  return migrated;
}

module.exports = {
  migrateLegacyDictionary,
  migrateLegacyDictionaryPayload,
};
