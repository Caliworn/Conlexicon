const crypto = require("node:crypto");
const { apiError } = require("./api-error");

const GLOSS_STYLE_KEYS = ["gla", "glb", "glc", "ft"];
const DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN = "(\\gla)\n(\\glb)\n(\\glc)\n(\\ft)";
const DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT = 3;
const MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT = 2;
const MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT = 10;
const DEFAULT_INDEX = { activeDictionaryId: "", dictionaryIds: [], uiLanguage: "zh", uiTheme: "light" };

function httpError(message, status, code, details) {
  return apiError(message, status, code, details);
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function reserveEntityId(value, prefix, usedIds) {
  const existing = String(value || "").trim();
  if (existing) {
    usedIds.add(existing);
    return existing;
  }
  let id = uid(prefix);
  while (usedIds.has(id)) {
    id = uid(prefix);
  }
  usedIds.add(id);
  return id;
}

function normalizeEntry(entry = {}, usedIds = new Set()) {
  const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
  if (entry.partOfSpeech && tags[0] !== entry.partOfSpeech) {
    tags.unshift(entry.partOfSpeech);
  }

  const definitions = Array.isArray(entry.definitions) && entry.definitions.length
    ? entry.definitions.map((definition) => normalizeDefinition(definition, usedIds))
    : [
        normalizeDefinition(
          {
            meaning: entry.meaning || "",
            example: entry.example || "",
            note: "",
          },
          usedIds,
        ),
      ];
  const migratedEtymology = [entry.roots, entry.variant].filter(Boolean).join("\n");
  const sourceText = entry.etymology?.sourceText || entry.etymology?.source || "";
  const sources = Array.isArray(entry.etymology?.sources)
    ? entry.etymology.sources.map(String).map((item) => item.trim()).filter(Boolean)
    : splitSourceText(sourceText);
  if (entry.etymology?.sourceEntryId && !sources.includes(entry.etymology.sourceEntryId)) {
    sources.push(entry.etymology.sourceEntryId);
  }

  return {
    id: entry.id || uid("entry"),
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags,
    definitions,
    etymology: {
      sources,
      description: entry.etymology?.description || migratedEtymology,
    },
    notes: entry.notes || "",
    morphology: normalizeEntryMorphology(entry.morphology),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function splitSourceText(value) {
  return String(value || "")
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDefinition(definition = {}, usedIds = new Set()) {
  return {
    id: reserveEntityId(definition.id, "def", usedIds),
    meaning: definition.meaning || "",
    example: definition.example || "",
    note: definition.note || "",
  };
}

function normalizeMorphology(morphology = {}, usedIds = new Set()) {
  return {
    functions: normalizeMorphologyFunctions(morphology.functions),
    tables: Array.isArray(morphology.tables) ? morphology.tables.map((table) => normalizeMorphologyTable(table, usedIds)) : [],
  };
}

function normalizeMorphologyFunctions(functions = {}) {
  return {
    leftV: uniqueList(functions.leftV),
    rightV: uniqueList(functions.rightV),
  };
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

function normalizeMorphologyTable(table = {}, usedIds = new Set()) {
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
    name: String(table.name || "Morphology Table"),
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

function normalizeDictionarySettings(settings = {}, usedIds = new Set()) {
  const {
    glossSmallCaps,
    glossFontFamily,
    glossFont,
    corpusGlossAlign,
    savePartialEditOnSwitch,
    saveFullEditOnSwitch,
    savePartialEditOnPageSwitch,
    saveFullEditOnPageSwitch,
    ...restSettings
  } = settings;

  return {
    ...restSettings,
    glossStyles: normalizeGlossStyles(settings.glossStyles, glossFontFamily || glossFont, glossSmallCaps),
    corpusUnitCardRenderPattern: String(settings.corpusUnitCardRenderPattern ?? settings.corpusUnitRenderPattern ?? ""),
    corpusUnitCardGlossAlign: Boolean(settings.corpusUnitCardGlossAlign ?? corpusGlossAlign ?? true),
    corpusUnitRenderPattern: String(settings.corpusUnitRenderPattern || ""),
    corpusUnitGlossAlign: Boolean(settings.corpusUnitGlossAlign ?? corpusGlossAlign ?? true),
    entryExampleRenderPattern: String(settings.entryExampleRenderPattern ?? DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN),
    entryExampleGlossAlign: Boolean(settings.entryExampleGlossAlign ?? true),
    corpusAutoSave: Boolean(settings.corpusAutoSave ?? true),
    docsAutoSave: Boolean(settings.docsAutoSave ?? true),
    tagDisplayMap: normalizeTagDisplayMap(settings.tagDisplayMap),
    entryListRawTagDisplay: Boolean(settings.entryListRawTagDisplay),
    entryListTagDisplayLimit: normalizeEntryListTagDisplayLimit(settings.entryListTagDisplayLimit),
    manualPartOfSpeechTags: Boolean(settings.manualPartOfSpeechTags),
    partOfSpeechTags: normalizeTagList(settings.partOfSpeechTags),
    tagSortOrder: normalizeTagList(settings.tagSortOrder),
    redHighlightTags: normalizeRedHighlightTags(settings.redHighlightTags),
    entryListTagFiltering: Boolean(settings.entryListTagFiltering ?? true),
    entryListPolysemyDisplay: Boolean(settings.entryListPolysemyDisplay),
    networkPolysemyDisplay: Boolean(settings.networkPolysemyDisplay),
    fuzzySearch: Boolean(settings.fuzzySearch),
    tagFuzzySearch: Boolean(settings.tagFuzzySearch),
    sourceFuzzyCompletion: Boolean(settings.sourceFuzzyCompletion),
    searchHighlight: Boolean(settings.searchHighlight ?? true),
    partialEditPageSwitchAction: normalizeEditPageSwitchAction(
      settings.partialEditPageSwitchAction,
      savePartialEditOnPageSwitch ?? savePartialEditOnSwitch,
    ),
    fullEditPageSwitchAction: normalizeEditPageSwitchAction(
      settings.fullEditPageSwitchAction,
      saveFullEditOnPageSwitch ?? saveFullEditOnSwitch,
    ),
    allowEmptyPronunciation: Boolean(settings.allowEmptyPronunciation ?? true),
    allowEmptyTags: Boolean(settings.allowEmptyTags ?? true),
    allowEmptyDefinitions: Boolean(settings.allowEmptyDefinitions ?? true),
    ipaKeyboard: normalizeIpaKeyboard(settings.ipaKeyboard),
    ipa: normalizeIpaSettings(settings.ipa, usedIds),
  };
}

function normalizeEditPageSwitchAction(value, legacySaveValue = false) {
  return ["save", "discard", "prompt"].includes(value)
    ? value
    : (legacySaveValue ? "save" : "discard");
}

function normalizeGlossFontFamily(value) {
  return ["serif", "sans", "mono"].includes(value) ? value : "serif";
}

function normalizeGlossFontSize(value) {
  return ["small", "medium", "large"].includes(value) ? value : "medium";
}

function normalizeGlossStyles(styles = {}, legacyFontFamily = "serif", legacySmallCaps = false) {
  const fallbackFont = normalizeGlossFontFamily(legacyFontFamily);
  return Object.fromEntries(GLOSS_STYLE_KEYS.map((key) => {
    const style = styles?.[key] && typeof styles[key] === "object" ? styles[key] : {};
    return [key, {
      fontFamily: normalizeGlossFontFamily(style.fontFamily || fallbackFont),
      fontSize: normalizeGlossFontSize(style.fontSize),
      bold: Boolean(style.bold),
      italic: Boolean(style.italic ?? (key === "ft")),
      ...(key === "glb" ? { smallCaps: Boolean(style.smallCaps ?? legacySmallCaps) } : {}),
    }];
  }));
}

function normalizeTagDisplayMap(map = {}) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(map)
      .map(([key, value]) => [String(key).trim(), String(value).trim()])
      .filter(([key, value]) => key && value),
  );
}

function normalizeDocs(docs = {}) {
  return {
    markdown: String(docs.markdown || ""),
  };
}

function normalizeCorpus(corpus = {}, usedIds = new Set()) {
  return {
    ...corpus,
    blocks: Array.isArray(corpus.blocks) ? corpus.blocks.map((block) => normalizeCorpusBlock(block, usedIds)) : [],
    units: Array.isArray(corpus.units) ? corpus.units.map((unit) => normalizeCorpusUnit(unit, usedIds)) : [],
  };
}

function normalizeCorpusBlock(block = {}, usedIds = new Set()) {
  const now = new Date().toISOString();
  return {
    ...block,
    id: reserveEntityId(block.id, "corpus-block", usedIds),
    title: String(block.title || block.name || ""),
    attributes: normalizeCorpusAttributes(block.attributes),
    tags: uniqueList(block.tags),
    notes: String(block.notes || ""),
    unitIds: normalizeCorpusUnitIds(block.unitIds),
    layers: Array.isArray(block.layers) ? block.layers.map((layer) => normalizeCorpusLayer(layer, usedIds)) : [],
    createdAt: block.createdAt || now,
    updatedAt: block.updatedAt || now,
  };
}

function normalizeCorpusLayer(layer = {}, usedIds = new Set()) {
  return {
    ...layer,
    id: reserveEntityId(layer.id, "corpus-layer", usedIds),
    name: String(layer.name || ""),
    speaker: String(layer.speaker || ""),
    modality: String(layer.modality || ""),
    attributes: normalizeCorpusAttributes(layer.attributes),
    tags: uniqueList(layer.tags),
    notes: String(layer.notes || ""),
    unitIds: normalizeCorpusUnitIds(layer.unitIds),
  };
}

function normalizeCorpusUnit(unit = {}, usedIds = new Set()) {
  const now = new Date().toISOString();
  return {
    ...unit,
    id: reserveEntityId(unit.id, "corpus-unit", usedIds),
    content: String(unit.content || unit.text || ""),
    attributes: normalizeCorpusAttributes(unit.attributes),
    tags: uniqueList(unit.tags),
    notes: String(unit.notes || ""),
    createdAt: unit.createdAt || now,
    updatedAt: unit.updatedAt || now,
  };
}

function normalizeCorpusAttributes(attributes = {}) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, value]) => [String(key).trim(), String(value ?? "")])
      .filter(([key]) => key),
  );
}

function normalizeCorpusUnitIds(unitIds = []) {
  return Array.isArray(unitIds)
    ? unitIds.map((unitId) => String(unitId || "").trim()).filter(Boolean)
    : [];
}

function normalizeIpaKeyboard(symbols) {
  const parsed = Array.isArray(symbols)
    ? symbols.map(String)
    : splitKeyboardSymbols(symbols || "ˈ ˌ");
  const unique = [];
  parsed
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .forEach((symbol) => {
      if (!unique.includes(symbol)) {
        unique.push(symbol);
      }
    });
  return unique.length ? unique : ["ˈ", "ˌ"];
}

function splitKeyboardSymbols(value) {
  return String(value || "")
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIpaSettings(ipa = {}, usedIds = new Set()) {
  const defaultStress = Number.parseInt(ipa.defaultStress, 10);
  const mappings = [
    ...normalizeIpaRuleList(ipa.mappings, usedIds),
    ...normalizeIpaRuleList(ipa.stressMappings, usedIds).map((rule) => ({
      ...rule,
      to: hasStressOutput(rule.to) ? rule.to : `ˈ${rule.to || rule.from}`,
    })),
  ];
  return {
    mappings,
    syllable: {
      vowels: ipa.syllable?.vowels || "aeiouAEIOU",
      separator: ipa.syllable?.separator || ".",
      onsetClusters: normalizeClusterList(ipa.syllable?.onsetClusters),
      codaClusters: normalizeClusterList(ipa.syllable?.codaClusters),
      complexPhonemes: normalizeClusterList(ipa.syllable?.complexPhonemes),
    },
    defaultStress: Number.isInteger(defaultStress) ? defaultStress : -2,
    unstressMonosyllables: ipa.unstressMonosyllables !== false,
  };
}

function normalizeRedHighlightTags(value) {
  const items = Array.isArray(value)
    ? value.map(String)
    : String(value || "").split(/[\s,，、]+/);
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

function normalizeTagList(value) {
  const items = Array.isArray(value)
    ? value.map(String)
    : String(value || "").split(/[,，、\n]/);
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

function normalizeEntryListTagDisplayLimit(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT;
  }
  return Math.min(MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT, Math.max(MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT, number));
}

function normalizeClusterList(value) {
  const clusters = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
  return [...new Set(clusters.map((cluster) => String(cluster).trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
}

function hasStressOutput(value) {
  const output = String(value || "");
  return output.startsWith("'") || output.includes("ˈ");
}

function normalizeIpaRuleList(rules, usedIds = new Set()) {
  return Array.isArray(rules)
    ? rules.map((rule) => normalizeIpaRule(rule, usedIds)).filter((rule) => rule.from || rule.to || rule.before || rule.after)
    : [];
}

function normalizeIpaRule(rule = {}, usedIds = new Set()) {
  return {
    id: reserveEntityId(rule.id, "ipa", usedIds),
    from: String(rule.from || ""),
    to: String(rule.to || ""),
    before: String(rule.before || ""),
    after: String(rule.after || ""),
  };
}

function normalizeDictionary(dictionary = {}) {
  const now = new Date().toISOString();
  const usedEntityIds = new Set(
    dictionaryEntityIdRecords(dictionary).map(({ id }) => String(id).trim()).filter(Boolean),
  );
  const entries = Array.isArray(dictionary.entries)
    ? dictionary.entries.map((entry) => normalizeEntry({
      ...entry,
      id: reserveEntityId(entry.id, "entry", usedEntityIds),
    }, usedEntityIds))
    : [];
  return {
    id: dictionary.id || uid("dict"),
    name: dictionary.name || "未命名词典",
    language: dictionary.language || "",
    description: dictionary.description || "",
    settings: normalizeDictionarySettings(dictionary.settings, usedEntityIds),
    docs: normalizeDocs(dictionary.docs),
    corpus: normalizeCorpus(dictionary.corpus, usedEntityIds),
    morphology: normalizeMorphology(dictionary.morphology, usedEntityIds),
    createdAt: dictionary.createdAt || now,
    updatedAt: dictionary.updatedAt || now,
    entries,
  };
}

function normalizeUiLanguage(value) {
  return value === "en" ? "en" : "zh";
}

function normalizeUiTheme(value) {
  return value === "dark" ? "dark" : "light";
}

function dictionaryEntityIdRecords(dictionary = {}) {
  const records = [];
  (dictionary.entries || []).forEach((entry) => {
    records.push({ id: entry.id, type: "entry" });
    (entry.definitions || []).forEach((definition) => {
      records.push({ id: definition.id, type: "definition" });
    });
  });
  (dictionary.morphology?.tables || []).forEach((table) => {
    records.push({ id: table.id, type: "morphology table" });
  });
  (dictionary.settings?.ipa?.mappings || []).forEach((rule) => {
    records.push({ id: rule.id, type: "IPA rule" });
  });
  (dictionary.settings?.ipa?.stressMappings || []).forEach((rule) => {
    records.push({ id: rule.id, type: "IPA stress rule" });
  });
  (dictionary.corpus?.blocks || []).forEach((block) => {
    records.push({ id: block.id, type: "corpus block" });
    (block.layers || []).forEach((layer) => {
      records.push({ id: layer.id, type: "corpus layer" });
    });
  });
  (dictionary.corpus?.units || []).forEach((unit) => {
    records.push({ id: unit.id, type: "corpus unit" });
  });
  return records.filter(({ id }) => id);
}

function assertUniqueDictionaryEntityIds(dictionary) {
  const recordsById = new Map();
  dictionaryEntityIdRecords(dictionary).forEach((record) => {
    if (!recordsById.has(record.id)) {
      recordsById.set(record.id, []);
    }
    recordsById.get(record.id).push(record.type);
  });
  const duplicates = [...recordsById.entries()].filter(([, types]) => types.length > 1);
  if (!duplicates.length) {
    return;
  }
  const details = duplicates
    .slice(0, 20)
    .map(([id, types]) => `${id} (${types.join(", ")})`)
    .join("; ");
  throw httpError(`Duplicate dictionary entity IDs: ${details}`, 409, "duplicate_entity_ids", { duplicates: details });
}

function importDictionaryFromPayload(payload) {
  if (Array.isArray(payload?.dictionaries)) {
    const dictionary = payload.dictionaries.find((item) => item?.id === payload.activeDictionaryId) || payload.dictionaries[0];
    if (!dictionary) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return normalizeDictionary(dictionary);
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const hasDictionaryShape = payload.id || payload.name || Array.isArray(payload.entries) || payload.settings || payload.docs || payload.corpus || payload.morphology;
    if (!hasDictionaryShape) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return normalizeDictionary(payload);
  }

  throw httpError("Invalid import payload", 400, "invalid_import_payload");
}

module.exports = {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  importDictionaryFromPayload,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
};
