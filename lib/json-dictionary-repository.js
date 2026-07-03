const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { apiError } = require("./api-error");
const { morphologySearchStrings } = require("./morphology-model");
const { displayTag, entryParts } = require("./tag-model");

const ENTRY_PATCH_ALLOWED_FIELDS = new Set(["pronunciation", "tags"]);
const ENTRY_SEARCH_FIELDS = new Set([
  "lemma",
  "pronunciation",
  "tags",
  "definitions",
  "examples",
  "notes",
  "etymology",
  "morphology",
]);
const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";
const ENTRY_QUERY_LIMIT_DEFAULT = 100;
const ENTRY_QUERY_LIMIT_MAX = 500;

function httpError(message, status, code, details) {
  return apiError(message, status, code, details);
}

function reserveEntityId(value, prefix, usedIds) {
  const existing = String(value || "").trim();
  if (existing) {
    usedIds.add(existing);
    return existing;
  }
  let id = `${prefix}-${crypto.randomUUID()}`;
  while (usedIds.has(id)) {
    id = `${prefix}-${crypto.randomUUID()}`;
  }
  usedIds.add(id);
  return id;
}

function entityIdRecords(dictionary = {}) {
  const records = [];
  (dictionary.entries || []).forEach((entry) => {
    records.push({ id: entry.id, type: "entry", scope: "entry", ownerId: entry.id });
    (entry.definitions || []).forEach((definition) => {
      records.push({ id: definition.id, type: "definition", scope: "entry", ownerId: entry.id });
    });
  });
  (dictionary.morphology?.tables || []).forEach((table) => {
    records.push({ id: table.id, type: "morphology table", scope: "morphology" });
  });
  (dictionary.settings?.ipa?.mappings || []).forEach((rule) => {
    records.push({ id: rule.id, type: "IPA rule", scope: "ipa" });
  });
  (dictionary.settings?.ipa?.stressMappings || []).forEach((rule) => {
    records.push({ id: rule.id, type: "IPA stress rule", scope: "ipa" });
  });
  (dictionary.corpus?.blocks || []).forEach((block) => {
    records.push({ id: block.id, type: "corpus block", scope: "corpus" });
    (block.layers || []).forEach((layer) => {
      records.push({ id: layer.id, type: "corpus layer", scope: "corpus" });
    });
  });
  (dictionary.corpus?.units || []).forEach((unit) => {
    records.push({ id: unit.id, type: "corpus unit", scope: "corpus" });
  });
  return records.filter((record) => record.id);
}

function assertScopedEntityIds(dictionary, isRelevant) {
  const groups = new Map();
  entityIdRecords(dictionary).forEach((record) => {
    if (!groups.has(record.id)) {
      groups.set(record.id, []);
    }
    groups.get(record.id).push(record);
  });

  const duplicates = [...groups.entries()]
    .filter(([, records]) => records.length > 1 && records.some(isRelevant));
  if (!duplicates.length) {
    return;
  }

  const details = duplicates
    .slice(0, 20)
    .map(([id, records]) => `${id} (${records.map((record) => record.type).join(", ")})`)
    .join("; ");
  throw httpError(`Duplicate dictionary entity IDs in saved scope: ${details}`, 409, "duplicate_entity_ids_scoped", { duplicates: details });
}

function mergeOtherSettings(existingSettings = {}, settings = {}) {
  const { ipa: _ignoredIpa, ...otherSettings } = settings || {};
  return {
    ...(existingSettings || {}),
    ...otherSettings,
    ipa: existingSettings?.ipa,
  };
}

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function textIncludes(value, query) {
  return normalizeText(value).includes(query);
}

function splitQueryList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function definitionPreview(entry = {}) {
  return (entry.definitions || []).map((definition) => definition.meaning).find(Boolean) || "";
}

function entrySummary(entry = {}, dictionary = {}) {
  const parts = entryParts(entry, dictionary);
  return {
    id: entry.id,
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    definitionPreview: definitionPreview(entry),
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
    partOfSpeech: parts[0] || "",
    parts,
  };
}

function normalizeSearchFields(value) {
  const fields = splitQueryList(value)
    .map((field) => field.toLowerCase())
    .filter((field) => ENTRY_SEARCH_FIELDS.has(field));
  return fields.length ? new Set(fields) : new Set(ENTRY_SEARCH_FIELDS);
}

function entrySearchText(entry = {}, dictionary = {}, fields = new Set(ENTRY_SEARCH_FIELDS)) {
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const values = [];
  if (fields.has("lemma")) {
    values.push(entry.lemma);
  }
  if (fields.has("pronunciation")) {
    values.push(entry.pronunciation);
  }
  if (fields.has("tags")) {
    values.push(
      ...tags,
      ...tags.map((tag) => displayTag(tag, dictionary)),
      ...entryParts(entry, dictionary),
      ...entryParts(entry, dictionary).map((part) => displayTag(part, dictionary)),
    );
  }
  if (fields.has("definitions")) {
    values.push(...(entry.definitions || []).map((definition) => definition.meaning));
  }
  if (fields.has("examples")) {
    values.push(...(entry.definitions || []).map((definition) => definition.example));
  }
  if (fields.has("notes")) {
    values.push(entry.notes, ...(entry.definitions || []).map((definition) => definition.note));
  }
  if (fields.has("etymology")) {
    values.push(entry.etymology?.description, ...(entry.etymology?.sources || []));
  }
  if (fields.has("morphology")) {
    values.push(...morphologySearchStrings(entry, dictionary));
  }
  return values.map(normalizeText).join(" ");
}

function compareEntryValues(a, b, sort = "lemmaAsc") {
  const lemmaCompare = String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
  const dateCompare = (left, right) => {
    const diff = new Date(left || 0).getTime() - new Date(right || 0).getTime();
    return diff || lemmaCompare;
  };
  if (sort === "lemmaDesc") {
    return -lemmaCompare;
  }
  if (sort === "updatedAsc") {
    return dateCompare(a.updatedAt, b.updatedAt);
  }
  if (sort === "updatedDesc") {
    return -dateCompare(a.updatedAt, b.updatedAt);
  }
  if (sort === "createdAsc") {
    return dateCompare(a.createdAt, b.createdAt);
  }
  if (sort === "createdDesc") {
    return -dateCompare(a.createdAt, b.createdAt);
  }
  return lemmaCompare;
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) {
    return 0;
  }
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    return Math.max(0, Number.parseInt(parsed.offset, 10) || 0);
  } catch {
    return 0;
  }
}

function normalizeEntryQuery(query = {}) {
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || ENTRY_QUERY_LIMIT_DEFAULT, 1),
    ENTRY_QUERY_LIMIT_MAX,
  );
  return {
    q: normalizeText(query.q || query.query),
    part: String(query.part || ""),
    tags: splitQueryList(query.tags),
    tagMode: query.tagMode === "all" ? "all" : "any",
    sort: ["lemmaAsc", "lemmaDesc", "updatedAsc", "updatedDesc", "createdAsc", "createdDesc"].includes(query.sort)
      ? query.sort
      : "lemmaAsc",
    source: normalizeText(query.source),
    derivedFrom: normalizeText(query.derivedFrom),
    include: query.include === "full" ? "full" : "summary",
    searchFields: normalizeSearchFields(query.fields || query.searchFields),
    limit,
    offset: decodeCursor(query.cursor),
  };
}

function entryMatchesQuery(entry, dictionary, query) {
  if (query.q && !entrySearchText(entry, dictionary, query.searchFields).includes(query.q)) {
    return false;
  }
  const parts = entryParts(entry, dictionary);
  if (query.part) {
    if (query.part === NO_PART_FILTER_VALUE) {
      if (parts.length) {
        return false;
      }
    } else if (!parts.some((part) => normalizeText(part) === normalizeText(query.part))) {
      return false;
    }
  }
  if (query.tags.length) {
    const entryTags = new Set((entry.tags || []).map(normalizeText));
    const matches = query.tags.map((tag) => entryTags.has(normalizeText(tag)));
    if (query.tagMode === "all" ? matches.some((match) => !match) : !matches.some(Boolean)) {
      return false;
    }
  }
  const sources = (entry.etymology?.sources || []).map(normalizeText);
  if (query.source && !sources.includes(query.source)) {
    return false;
  }
  if (query.derivedFrom) {
    const target = (dictionary.entries || []).find((candidate) =>
      normalizeText(candidate.id) === query.derivedFrom || normalizeText(candidate.lemma) === query.derivedFrom
    );
    const candidates = new Set([query.derivedFrom, normalizeText(target?.lemma), normalizeText(target?.id)].filter(Boolean));
    if (!sources.some((source) => candidates.has(source))) {
      return false;
    }
  }
  return true;
}

function tagFacetItems(map, dictionary, partSet) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || displayTag(a[0], dictionary).localeCompare(displayTag(b[0], dictionary), "zh-CN"))
    .map(([tag, count]) => ({
      tag,
      displayLabel: displayTag(tag, dictionary),
      count,
      isPartOfSpeech: partSet.has(normalizeText(tag)),
    }));
}

class JsonDictionaryRepository {
  constructor({
    dataDir,
    defaultIndex,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary,
  }) {
    this.dataDir = dataDir;
    this.dictionariesDir = path.join(dataDir, "dictionaries");
    this.indexPath = path.join(dataDir, "index.json");
    this.defaultIndex = defaultIndex;
    this.normalizeDictionary = normalizeDictionary;
    this.normalizeUiLanguage = normalizeUiLanguage;
    this.normalizeUiTheme = normalizeUiTheme;
    this.validateDictionary = validateDictionary;
  }

  async ensureDataStore() {
    await fs.mkdir(this.dictionariesDir, { recursive: true });
    try {
      await fs.access(this.indexPath);
    } catch {
      await this.writeJson(this.indexPath, this.defaultIndex);
    }
  }

  async listDictionaries() {
    const state = await this.readState();
    return state.dictionaries;
  }

  async getDictionaryMeta(id) {
    return this.getDictionarySnapshot(id);
  }

  async getDictionarySnapshot(id) {
    return this.readDictionary(id);
  }

  async saveDictionarySnapshot(id, snapshot) {
    const source = id ? { ...snapshot, id } : snapshot;
    return this.writeDictionary(source);
  }

  async updateDictionary(id, patch) {
    await this.requireDictionary(id);
    const existing = await this.readDictionary(id);
    return this.writeDictionary({ ...existing, ...patch, id });
  }

  async updateMetadata(id, metadata) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    return this.writeDictionary({
      ...dictionary,
      name: metadata.name,
      language: metadata.language,
      description: metadata.description,
      updatedAt: new Date().toISOString(),
    }, { validate: false });
  }

  async updateSettings(id, settings) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    return this.writeDictionary({
      ...dictionary,
      settings: mergeOtherSettings(dictionary.settings, settings),
      updatedAt: new Date().toISOString(),
    }, { validate: false });
  }

  async updateIpaSettings(id, ipa) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    return this.writeDictionary({
      ...dictionary,
      settings: {
        ...(dictionary.settings || {}),
        ipa,
      },
      updatedAt: new Date().toISOString(),
    }, {
      validate: false,
      validateEntityIds: (normalized) => assertScopedEntityIds(normalized, (record) => record.scope === "ipa"),
    });
  }

  async saveDocs(id, docs) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    return this.writeDictionary({ ...dictionary, docs, updatedAt: new Date().toISOString() }, { validate: false });
  }

  async saveMorphology(id, morphology) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    return this.writeDictionary({ ...dictionary, morphology, updatedAt: new Date().toISOString() }, {
      validate: false,
      validateEntityIds: (normalized) => assertScopedEntityIds(normalized, (record) => record.scope === "morphology"),
    });
  }

  async queryEntries(id, query = null) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    if (!query || !Object.keys(query).length) {
      return dictionary.entries;
    }
    const normalizedQuery = normalizeEntryQuery(query);
    const filtered = [...dictionary.entries]
      .filter((entry) => entryMatchesQuery(entry, dictionary, normalizedQuery))
      .sort((a, b) => compareEntryValues(a, b, normalizedQuery.sort));
    const page = filtered.slice(normalizedQuery.offset, normalizedQuery.offset + normalizedQuery.limit);
    const nextOffset = normalizedQuery.offset + page.length;
    const hasMore = nextOffset < filtered.length;
    return {
      items: normalizedQuery.include === "full" ? page : page.map((entry) => entrySummary(entry, dictionary)),
      pageInfo: {
        nextCursor: hasMore ? encodeCursor(nextOffset) : "",
        hasMore,
        total: filtered.length,
      },
    };
  }

  async getEntryFacets(id) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    const partMap = new Map();
    const tagMap = new Map();
    let noPartOfSpeechCount = 0;

    (dictionary.entries || []).forEach((entry) => {
      const parts = entryParts(entry, dictionary);
      if (!parts.length) {
        noPartOfSpeechCount += 1;
      }
      parts.forEach((part) => {
        partMap.set(part, (partMap.get(part) || 0) + 1);
      });
      (entry.tags || []).forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });

    const partSet = new Set([...partMap.keys()].map(normalizeText));
    const parts = [...partMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))
      .map(([tag, count]) => ({ tag, displayLabel: displayTag(tag, dictionary), count }));
    return {
      parts,
      tags: tagFacetItems(tagMap, dictionary, partSet),
      noPartOfSpeechCount,
    };
  }

  async getEntryRelations(id, entryId) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    const entry = (dictionary.entries || []).find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw httpError("Entry not found", 404, "entry_not_found");
    }
    const sortedEntries = [...dictionary.entries].sort((a, b) => compareEntryValues(a, b, "lemmaAsc"));
    const byLemma = new Map();
    sortedEntries.forEach((candidate) => {
      const key = normalizeText(candidate.lemma);
      if (key && !byLemma.has(key)) {
        byLemma.set(key, candidate);
      }
    });
    const sourceTexts = entry.etymology?.sources || [];
    const sourceKeys = new Set([
      normalizeText(entry.id),
      normalizeText(entry.lemma),
    ].filter(Boolean));
    const sources = sourceTexts.map((sourceText) => {
      const matchedEntry = byLemma.get(normalizeText(sourceText)) || sortedEntries.find((candidate) => normalizeText(candidate.id) === normalizeText(sourceText));
      return {
        sourceText,
        matchedEntryId: matchedEntry?.id || "",
        matchedLemma: matchedEntry?.lemma || "",
      };
    });
    const derivedEntries = sortedEntries
      .filter((candidate) => candidate.id !== entry.id && (candidate.etymology?.sources || []).some((source) => sourceKeys.has(normalizeText(source))))
      .map((candidate) => entrySummary(candidate, dictionary));
    const rootKey = sourceTexts[0] || entry.lemma || entry.id;
    const rootKeys = new Set([normalizeText(rootKey), ...sourceKeys]);
    const rootEntries = sortedEntries
      .filter((candidate) =>
        candidate.id === entry.id
        || rootKeys.has(normalizeText(candidate.lemma))
        || (candidate.etymology?.sources || []).some((source) => rootKeys.has(normalizeText(source)))
      )
      .map((candidate) => entrySummary(candidate, dictionary));
    return {
      entryId,
      sources,
      derivedEntries,
      rootGroup: {
        rootKey,
        entries: rootEntries,
      },
    };
  }

  async queryEntrySummaries(id, query = {}) {
    const result = await this.queryEntries(id, query);
    return Array.isArray(result) ? result.map((entry) => entrySummary(entry)) : result;
  }

  async getEntry(id, entryId) {
    const entries = await this.queryEntries(id);
    return entries.find((entry) => entry.id === entryId) || null;
  }

  async saveEntry(id, entry) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    const now = new Date().toISOString();
    const usedIds = new Set(entityIdRecords(dictionary).map((record) => record.id));
    const savedEntry = {
      ...entry,
      id: reserveEntityId(entry.id, "entry", usedIds),
      updatedAt: now,
    };
    const entries = Array.isArray(dictionary.entries) ? [...dictionary.entries] : [];
    const entryIndex = entries.findIndex((item) => item.id === savedEntry.id);
    if (entryIndex === -1) {
      entries.push(savedEntry);
    } else {
      entries[entryIndex] = savedEntry;
    }
    return this.writeDictionary({ ...dictionary, updatedAt: now, entries }, {
      validate: false,
      validateEntityIds: (normalized) => assertScopedEntityIds(
        normalized,
        (record) => record.scope === "entry" && record.ownerId === savedEntry.id,
      ),
    });
  }

  async deleteEntry(id, entryId) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    const entries = Array.isArray(dictionary.entries) ? [...dictionary.entries] : [];
    const entryIndex = entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex === -1) {
      throw httpError("Entry not found", 404, "entry_not_found");
    }
    entries.splice(entryIndex, 1);
    return this.writeDictionary({ ...dictionary, updatedAt: new Date().toISOString(), entries }, { validate: false });
  }

  async patchEntries(id, updates = [], options = {}) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    const entries = Array.isArray(dictionary.entries) ? [...dictionary.entries] : [];
    const now = new Date().toISOString();

    updates.forEach((update) => {
      const entryId = String(update?.id || "").trim();
      const patch = update?.patch && typeof update.patch === "object" && !Array.isArray(update.patch)
        ? update.patch
        : {};
      const invalidFields = Object.keys(patch).filter((field) => !ENTRY_PATCH_ALLOWED_FIELDS.has(field));
      if (invalidFields.length) {
        throw httpError(`Unsupported entry patch fields: ${invalidFields.join(", ")}`, 400, "unsupported_entry_patch_fields", { fields: invalidFields });
      }
      if (Object.hasOwn(patch, "tags") && !Array.isArray(patch.tags)) {
        throw httpError("Entry patch tags must be an array", 400, "entry_patch_tags_invalid");
      }
      if (Object.hasOwn(patch, "pronunciation") && typeof patch.pronunciation !== "string") {
        throw httpError("Entry patch pronunciation must be a string", 400, "entry_patch_pronunciation_invalid");
      }
      const entryIndex = entries.findIndex((entry) => entry.id === entryId);
      if (entryIndex === -1) {
        throw httpError("Entry not found", 404, "entry_not_found");
      }
      entries[entryIndex] = {
        ...entries[entryIndex],
        ...patch,
        id: entryId,
        updatedAt: now,
      };
    });

    const hasSettings = Object.hasOwn(options, "settings");
    if (!updates.length && !hasSettings) {
      return dictionary;
    }
    return this.writeDictionary({
      ...dictionary,
      ...(hasSettings ? { settings: mergeOtherSettings(dictionary.settings, options.settings) } : {}),
      updatedAt: now,
      entries,
    }, { validate: false });
  }

  async queryCorpusUnits(id) {
    const dictionary = await this.readDictionary(id);
    return dictionary.corpus?.units || [];
  }

  async getCorpusBlock(id, blockId) {
    const dictionary = await this.readDictionary(id);
    return (dictionary.corpus?.blocks || []).find((block) => block.id === blockId) || null;
  }

  async saveCorpusChanges(id, changes) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    return this.writeDictionary({
      ...dictionary,
      updatedAt: new Date().toISOString(),
      corpus: {
        ...dictionary.corpus,
        ...changes,
      },
    }, {
      validate: false,
      validateEntityIds: (normalized) => assertScopedEntityIds(normalized, (record) => record.scope === "corpus"),
    });
  }

  async exportDictionary(id) {
    const index = await this.readIndex();
    const dictionaryId = id || index.activeDictionaryId;
    if (!dictionaryId || !index.dictionaryIds.includes(dictionaryId)) {
      throw httpError("Dictionary not found", 404, "dictionary_not_found");
    }
    return this.readDictionary(dictionaryId);
  }

  async importDictionary(dictionary, { overwrite = false, regenerateId = false } = {}) {
    const existing = await this.readIndex();
    const source = {
      ...dictionary,
      id: reserveDictionaryId(regenerateId ? "" : dictionary.id, existing.dictionaryIds),
    };
    if (existing.dictionaryIds.includes(source.id) && !overwrite) {
      throw httpError("Dictionary ID already exists; overwrite confirmation required", 409, "dictionary_id_exists");
    }

    const savedDictionary = await this.writeDictionary(source);
    const dictionaryIds = existing.dictionaryIds.includes(savedDictionary.id)
      ? existing.dictionaryIds
      : [...existing.dictionaryIds, savedDictionary.id];
    await this.writeIndex({ activeDictionaryId: savedDictionary.id, dictionaryIds });
    return savedDictionary;
  }

  async createDictionary(dictionary) {
    const index = await this.readIndex();
    const savedDictionary = await this.writeDictionary({
      ...dictionary,
      id: reserveDictionaryId(dictionary.id, index.dictionaryIds),
    });
    const dictionaryIds = index.dictionaryIds.includes(savedDictionary.id)
      ? index.dictionaryIds
      : [...index.dictionaryIds, savedDictionary.id];
    await this.writeIndex({ activeDictionaryId: savedDictionary.id, dictionaryIds });
    return savedDictionary;
  }

  async activateDictionary(id) {
    const index = await this.requireDictionary(id);
    await this.writeIndex({ ...index, activeDictionaryId: id });
  }

  async deleteDictionary(id) {
    const index = await this.requireDictionary(id);
    await fs.rm(this.dictionaryPath(id), { force: true });
    const dictionaryIds = index.dictionaryIds.filter((dictionaryId) => dictionaryId !== id);
    const activeDictionaryId = index.activeDictionaryId === id ? dictionaryIds[0] || "" : index.activeDictionaryId;
    await this.writeIndex({ activeDictionaryId, dictionaryIds });
  }

  async updatePreferences(preferences) {
    const index = await this.readIndex();
    const nextIndex = {
      ...index,
      ...(Object.hasOwn(preferences, "uiLanguage") ? { uiLanguage: preferences.uiLanguage } : {}),
      ...(Object.hasOwn(preferences, "uiTheme") ? { uiTheme: preferences.uiTheme } : {}),
    };
    await this.writeIndex(nextIndex);
    return { uiLanguage: nextIndex.uiLanguage, uiTheme: nextIndex.uiTheme };
  }

  async hasDictionary(id) {
    const index = await this.readIndex();
    return index.dictionaryIds.includes(id);
  }

  async requireDictionary(id) {
    const index = await this.readIndex();
    if (!index.dictionaryIds.includes(id)) {
      throw httpError("Dictionary not found", 404, "dictionary_not_found");
    }
    return index;
  }

  async readState() {
    const index = await this.readIndex();
    const dictionaries = [];

    for (const id of index.dictionaryIds) {
      try {
        dictionaries.push(await this.readDictionary(id));
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    const dictionaryIds = dictionaries.map((dictionary) => dictionary.id);
    const activeDictionaryId = dictionaryIds.includes(index.activeDictionaryId) ? index.activeDictionaryId : dictionaryIds[0] || "";

    if (dictionaryIds.length !== index.dictionaryIds.length || activeDictionaryId !== index.activeDictionaryId) {
      await this.writeIndex({ activeDictionaryId, dictionaryIds });
    }

    return { activeDictionaryId, dictionaries, uiLanguage: index.uiLanguage, uiTheme: index.uiTheme };
  }

  async readIndex() {
    const index = await this.readJson(this.indexPath, this.defaultIndex);
    return {
      activeDictionaryId: index.activeDictionaryId || "",
      dictionaryIds: Array.isArray(index.dictionaryIds) ? index.dictionaryIds : [],
      uiLanguage: this.normalizeUiLanguage(index.uiLanguage),
      uiTheme: this.normalizeUiTheme(index.uiTheme),
    };
  }

  async writeIndex(index) {
    const existing = await this.readJson(this.indexPath, this.defaultIndex);
    await this.writeJson(this.indexPath, {
      activeDictionaryId: index.activeDictionaryId || "",
      dictionaryIds: Array.isArray(index.dictionaryIds) ? index.dictionaryIds : [],
      uiLanguage: this.normalizeUiLanguage(index.uiLanguage ?? existing.uiLanguage),
      uiTheme: this.normalizeUiTheme(index.uiTheme ?? existing.uiTheme),
    });
  }

  async readDictionary(id) {
    return this.normalizeDictionary(await this.readJson(this.dictionaryPath(id)));
  }

  async writeDictionary(dictionary, options = {}) {
    const normalized = this.normalizeDictionary(dictionary);
    if (options.validate !== false) {
      this.validateDictionary(normalized);
    }
    await options.validateEntityIds?.(normalized);
    await this.writeJson(this.dictionaryPath(normalized.id), normalized);
    return normalized;
  }

  async readJson(filePath, fallback) {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" && fallback !== undefined) {
        return fallback;
      }
      throw error;
    }
  }

  async writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  dictionaryPath(id) {
    if (!/^dict-[a-z0-9-]+$/i.test(id)) {
      throw httpError("Invalid dictionary id", 400, "invalid_dictionary_id");
    }
    return path.join(this.dictionariesDir, `${id}.json`);
  }
}

function reserveDictionaryId(value, usedIds = []) {
  const existing = String(value || "").trim();
  if (existing) {
    return existing;
  }
  const used = new Set(usedIds);
  let id = `dict-${crypto.randomUUID()}`;
  while (used.has(id)) {
    id = `dict-${crypto.randomUUID()}`;
  }
  return id;
}

module.exports = {
  JsonDictionaryRepository,
};
