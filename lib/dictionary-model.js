const { normalizeSourceReferences } = require("./source-reference-model");
const { apiError } = require("./api-error");
const { normalizeMorphology } = require("./morphology-model");
const { searchSettingsQueryOptions } = require("./entry-search-model");
const {
  TAG_COLORS,
  appendTagsToRegistry,
  effectiveEntryTags,
  normalizeTagRegistry,
} = require("./tag-model");
const {
  UI_SKIN_IDS,
  ensureEntityId,
  normalizeCorpus,
  normalizeDictionarySettings,
  normalizeDocs,
  normalizeEntryFields,
  normalizeUiLanguage,
  normalizeUiSkin,
  normalizeUiTheme,
  uid,
} = require("./dictionary-data-model");

const DEFAULT_INDEX = {
  activeDictionaryId: "",
  dictionaryIds: [],
  uiLanguage: "zh",
  uiTheme: "light",
  uiSkin: "classic",
};

function httpError(message, status, code, details) {
  return apiError(message, status, code, details);
}

function normalizeEntry(entry = {}) {
  let sources;
  try {
    sources = normalizeSourceReferences(entry.etymology?.sources ?? []);
  } catch (error) {
    throw apiError(error.message, 400, error.code === "duplicate_source_target" ? error.code : "invalid_source_reference");
  }
  if (entry.id && sources.some((source) => source.entryId === entry.id)) {
    throw apiError("An entry cannot reference itself as a source", 400, "self_source_reference");
  }
  return normalizeEntryFields(entry, sources);
}

function normalizeDictionary(dictionary = {}) {
  const now = new Date().toISOString();
  const entries = Array.isArray(dictionary.entries)
    ? dictionary.entries.map((entry) => normalizeEntry({
      ...entry,
      id: ensureEntityId(entry.id, "entry"),
    }))
    : [];
  return {
    id: dictionary.id || uid("dict"),
    name: dictionary.name || "未命名词典",
    language: dictionary.language || "",
    description: dictionary.description || "",
    settings: normalizeDictionarySettings(dictionary.settings),
    tagRegistry: appendTagsToRegistry(
      normalizeTagRegistry(dictionary.tagRegistry),
      entries.flatMap((entry) => effectiveEntryTags(entry)),
    ),
    docs: normalizeDocs(dictionary.docs),
    corpus: normalizeCorpus(dictionary.corpus),
    morphology: normalizeMorphology(dictionary.morphology, { ensureEntityId }),
    createdAt: dictionary.createdAt || now,
    updatedAt: dictionary.updatedAt || now,
    entries,
  };
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
    records.push({ id: group.id, type: "morphologyTemplateGroup" });
    (group.tables || []).forEach((table) => {
      records.push({ id: table.id, type: "morphologyTemplateTable" });
    });
  });
  (dictionary.corpus?.blocks || []).forEach((block) => {
    records.push({ id: block.id, type: "corpusBlock" });
    (block.layers || []).forEach((layer) => {
      records.push({ id: layer.id, type: "corpusLayer" });
    });
  });
  (dictionary.corpus?.units || []).forEach((unit) => {
    records.push({ id: unit.id, type: "corpusUnit" });
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
    .map(([id, types]) => ({ id, types: [...new Set(types)] }));
  const message = details.map(({ id, types }) => `${id} (${types.join(", ")})`).join("; ");
  throw httpError(`Duplicate dictionary entity IDs: ${message}`, 409, "duplicate_entity_ids", { duplicates: details });
}

// Settings from HTTP requests and imports: one invalid rule would otherwise
// silently disable every custom search rule. Error codes match the browser
// form check so the frontend can reuse its messages.
function assertValidSearchNormalizationRules(settings) {
  const customRules = settings?.search?.normalization?.customRules;
  const errors = customRules === undefined || Array.isArray(customRules)
    ? searchSettingsQueryOptions(settings?.search).normalizationErrors
    : [{ code: "invalid_rules" }];
  if (errors.length) {
    throw httpError("Invalid search normalization rules", 400, "invalid_search_normalization_rule", { errors });
  }
}

// Separators are not checked: arrays are stored as given, so existing tags may
// contain them and an exported file must import again.
function assertValidTagRegistry(registry = []) {
  const tags = new Set();
  const valid = Array.isArray(registry) && registry.every((row) => {
    const tag = typeof row?.tag === "string" ? row.tag.trim() : "";
    if (!tag || tags.has(tag) || typeof row.partOfSpeech !== "boolean") {
      return false;
    }
    tags.add(tag);
    return (row.displayLabel === undefined || typeof row.displayLabel === "string")
      && (!row.color || TAG_COLORS.includes(row.color));
  });
  if (!valid) {
    throw httpError("Invalid tag registry", 400, "invalid_tag_registry");
  }
}

// Checks the raw values: normalization would turn a malformed rule list into an
// empty one, and drop invalid registry rows, before the checks could see them.
function importDictionaryFromPayload(payload) {
  const dictionary = dictionaryFromImportPayload(payload);
  assertValidSearchNormalizationRules(dictionary.settings);
  assertValidTagRegistry(dictionary.tagRegistry);
  return normalizeDictionary(dictionary);
}

function dictionaryFromImportPayload(payload) {
  if (Array.isArray(payload?.dictionaries)) {
    const dictionary = payload.dictionaries.find((item) => item?.id === payload.activeDictionaryId) || payload.dictionaries[0];
    if (!dictionary) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return dictionary;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const hasDictionaryShape = payload.id || payload.name || Array.isArray(payload.entries) || payload.settings || payload.docs || payload.corpus || payload.morphology;
    if (!hasDictionaryShape) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return payload;
  }

  throw httpError("Invalid import payload", 400, "invalid_import_payload");
}

module.exports = {
  DEFAULT_INDEX,
  UI_SKIN_IDS,
  assertUniqueDictionaryEntityIds,
  assertValidSearchNormalizationRules,
  importDictionaryFromPayload,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiSkin,
  normalizeUiTheme,
};
