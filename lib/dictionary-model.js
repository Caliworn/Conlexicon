const crypto = require("node:crypto");
const { apiError } = require("./api-error");
const {
  normalizeEntryMorphologyState,
  normalizeMorphology,
} = require("./morphology-model");
const {
  normalizeEntryListTagDisplayLimit,
  normalizeRedHighlightTags,
  normalizeTagDisplayMap,
  normalizeTagList,
} = require("./tag-model");
const {
  normalizeIpaKeyboard,
  normalizeIpaSettings,
} = require("./ipa-model");

const GLOSS_STYLE_KEYS = ["gla", "glb", "glc", "ft"];
const DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN = "(\\gla)\n(\\glb)\n(\\glc)\n(\\ft)";
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

  const definitions = Array.isArray(entry.definitions) && entry.definitions.length
    ? entry.definitions.map((definition) => normalizeDefinition(definition, usedIds))
    : [
        normalizeDefinition(
          {
            meaning: "",
            example: "",
            note: "",
          },
          usedIds,
        ),
      ];
  const sources = Array.isArray(entry.etymology?.sources)
    ? entry.etymology.sources.map(String).map((item) => item.trim()).filter(Boolean)
    : [];

  const morphologyState = normalizeEntryMorphologyState(entry, { usedIds, reserveEntityId });

  return {
    id: entry.id || uid("entry"),
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags,
    definitions,
    etymology: {
      sources,
      description: entry.etymology?.description || "",
    },
    notes: entry.notes || "",
    morphologyMode: morphologyState.morphologyMode,
    morphologyGroups: morphologyState.morphologyGroups,
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(value) {
  const unique = [];
  splitList(Array.isArray(value) ? value.join("，") : value)
    .forEach((item) => {
      if (!unique.includes(item)) {
        unique.push(item);
      }
    });
  return unique;
}

function normalizeDefinition(definition = {}, usedIds = new Set()) {
  return {
    id: reserveEntityId(definition.id, "def", usedIds),
    meaning: definition.meaning || "",
    example: definition.example || "",
    note: definition.note || "",
  };
}

function normalizeDictionarySettings(settings = {}, usedIds = new Set()) {
  const {
    glossSmallCaps: _glossSmallCaps,
    glossFontFamily: _glossFontFamily,
    glossFont: _glossFont,
    corpusGlossAlign: _corpusGlossAlign,
    savePartialEditOnSwitch: _savePartialEditOnSwitch,
    saveFullEditOnSwitch: _saveFullEditOnSwitch,
    savePartialEditOnPageSwitch: _savePartialEditOnPageSwitch,
    saveFullEditOnPageSwitch: _saveFullEditOnPageSwitch,
    ...currentSettings
  } = settings;

  return {
    ...currentSettings,
    glossStyles: normalizeGlossStyles(settings.glossStyles),
    corpusUnitCardRenderPattern: String(settings.corpusUnitCardRenderPattern ?? settings.corpusUnitRenderPattern ?? ""),
    corpusUnitCardGlossAlign: Boolean(settings.corpusUnitCardGlossAlign ?? true),
    corpusUnitRenderPattern: String(settings.corpusUnitRenderPattern || ""),
    corpusUnitGlossAlign: Boolean(settings.corpusUnitGlossAlign ?? true),
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
    showEmptyEntrySections: Boolean(settings.showEmptyEntrySections),
    fuzzySearch: Boolean(settings.fuzzySearch),
    tagFuzzySearch: Boolean(settings.tagFuzzySearch),
    sourceFuzzyCompletion: Boolean(settings.sourceFuzzyCompletion),
    searchHighlight: Boolean(settings.searchHighlight ?? true),
    partialEditPageSwitchAction: normalizeEditPageSwitchAction(settings.partialEditPageSwitchAction),
    fullEditPageSwitchAction: normalizeEditPageSwitchAction(settings.fullEditPageSwitchAction),
    allowEmptyPronunciation: Boolean(settings.allowEmptyPronunciation ?? true),
    allowEmptyTags: Boolean(settings.allowEmptyTags ?? true),
    allowEmptyDefinitions: Boolean(settings.allowEmptyDefinitions ?? true),
    ipaKeyboard: normalizeIpaKeyboard(settings.ipaKeyboard),
    ipa: normalizeIpaSettings(settings.ipa, { usedIds, reserveEntityId }),
  };
}

function normalizeEditPageSwitchAction(value) {
  return ["save", "discard", "prompt"].includes(value)
    ? value
    : "discard";
}

function normalizeGlossFontFamily(value) {
  return ["serif", "sans", "mono"].includes(value) ? value : "serif";
}

function normalizeGlossFontSize(value) {
  return ["small", "medium", "large"].includes(value) ? value : "medium";
}

function normalizeGlossStyles(styles = {}) {
  const fallbackFont = normalizeGlossFontFamily("serif");
  return Object.fromEntries(GLOSS_STYLE_KEYS.map((key) => {
    const style = styles?.[key] && typeof styles[key] === "object" ? styles[key] : {};
    return [key, {
      fontFamily: normalizeGlossFontFamily(style.fontFamily || fallbackFont),
      fontSize: normalizeGlossFontSize(style.fontSize),
      bold: Boolean(style.bold),
      italic: Boolean(style.italic ?? (key === "ft")),
      ...(key === "glb" ? { smallCaps: Boolean(style.smallCaps) } : {}),
    }];
  }));
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
  const { name: _legacyName, ...currentBlock } = block;
  return {
    ...currentBlock,
    id: reserveEntityId(block.id, "corpus-block", usedIds),
    title: String(block.title || ""),
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
  const { text: _legacyText, ...currentUnit } = unit;
  return {
    ...currentUnit,
    id: reserveEntityId(unit.id, "corpus-unit", usedIds),
    content: String(unit.content || ""),
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
    morphology: normalizeMorphology(dictionary.morphology, { usedIds: usedEntityIds, reserveEntityId }),
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
  (dictionary.morphology?.templateGroups || []).forEach((group) => {
    records.push({ id: group.id, type: "morphology template group" });
    (group.tables || []).forEach((table) => {
      records.push({ id: table.id, type: "morphology template table" });
    });
  });
  (dictionary.entries || []).forEach((entry) => {
    (entry.morphologyGroups || []).forEach((group) => {
      records.push({ id: group.id, type: "entry morphology group" });
    });
  });
  (dictionary.settings?.ipa?.mappings || []).forEach((rule) => {
    records.push({ id: rule.id, type: "IPA rule" });
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
