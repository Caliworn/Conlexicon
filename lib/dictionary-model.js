const { normalizeSourceReferences } = require("./source-reference-model");
const { apiError } = require("./api-error");
const { normalizeMorphology } = require("./morphology-model");
const {
  UI_SKIN_IDS,
  normalizeCorpus,
  normalizeDictionarySettings,
  normalizeDocs,
  normalizeEntryFields,
  normalizeUiLanguage,
  normalizeUiSkin,
  normalizeUiTheme,
  reserveEntityId,
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

function normalizeEntry(entry = {}, usedIds = new Set()) {
  let sources;
  try {
    sources = normalizeSourceReferences(entry.etymology?.sources ?? []);
  } catch (error) {
    throw apiError(error.message, 400, error.code === "duplicate_source_target" ? error.code : "invalid_source_reference");
  }
  if (entry.id && sources.some((source) => source.entryId === entry.id)) {
    throw apiError("An entry cannot reference itself as a source", 400, "self_source_reference");
  }
  return normalizeEntryFields(entry, sources, usedIds);
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
    settings: normalizeDictionarySettings(dictionary.settings),
    docs: normalizeDocs(dictionary.docs),
    corpus: normalizeCorpus(dictionary.corpus, usedEntityIds),
    morphology: normalizeMorphology(dictionary.morphology, { usedIds: usedEntityIds, reserveEntityId }),
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
  UI_SKIN_IDS,
  assertUniqueDictionaryEntityIds,
  importDictionaryFromPayload,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiSkin,
  normalizeUiTheme,
};
