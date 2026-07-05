const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { apiError } = require("./api-error");
const {
  validateMorphologyFunctionUsage,
  validateMorphologyReferenceSyntax,
} = require("./morphology-model");
const { displayTag, entryParts } = require("./tag-model");
const {
  entryMatchesSearchText,
  normalizeFuzzyFields,
  normalizeSearchFields,
} = require("./entry-search-model");
const {
  buildEntryRelationIndex,
  findDerivedEntries,
  relationForEntry,
  resolveSourceEntry,
  rootModeGroups,
} = require("./entry-relations-model");

const SQLITE_SCHEMA_VERSION = 1;
const ENTRY_QUERY_LIMIT_DEFAULT = 100;
const ENTRY_QUERY_LIMIT_MAX = 10000;
const ROOT_GROUP_QUERY_LIMIT_DEFAULT = 100;
const ROOT_GROUP_QUERY_LIMIT_MAX = 2000;
const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";

let cachedSqliteModule = null;
let sqliteLoadAttempted = false;

function sqliteUnavailableError(error) {
  return apiError("SQLite runtime is not available", 500, "sqlite_runtime_unavailable", {
    cause: error?.code || error?.message || "unknown",
  });
}

function loadSqliteModule() {
  if (cachedSqliteModule) {
    return cachedSqliteModule;
  }
  try {
    // node:sqlite is available in recent Node runtimes, but Electron packaging must
    // still be verified before the SQLite repository is wired into production.
    cachedSqliteModule = require("node:sqlite");
    return cachedSqliteModule;
  } catch (error) {
    sqliteLoadAttempted = true;
    throw sqliteUnavailableError(error);
  }
}

function sqliteRuntimeAvailable() {
  try {
    loadSqliteModule();
    return true;
  } catch {
    return false;
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function splitQueryList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function booleanQueryOption(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
  const fuzzy = booleanQueryOption(query.fuzzy);
  const tagFuzzy = booleanQueryOption(query.tagFuzzy);
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
    fuzzy,
    tagFuzzy,
    fuzzyFields: normalizeFuzzyFields(query.fuzzyFields, { fuzzy, tagFuzzy }),
    limit,
    offset: decodeCursor(query.cursor),
  };
}

function normalizeRootGroupQuery(query = {}) {
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || ROOT_GROUP_QUERY_LIMIT_DEFAULT, 1),
    ROOT_GROUP_QUERY_LIMIT_MAX,
  );
  const fuzzy = booleanQueryOption(query.fuzzy);
  const tagFuzzy = booleanQueryOption(query.tagFuzzy);
  return {
    q: normalizeText(query.q || query.query),
    sort: ["lemmaAsc", "lemmaDesc", "updatedAsc", "updatedDesc", "createdAsc", "createdDesc"].includes(query.sort)
      ? query.sort
      : "lemmaAsc",
    include: query.include === "full" ? "full" : "summary",
    searchFields: normalizeSearchFields(query.fields || query.searchFields),
    fuzzy,
    tagFuzzy,
    fuzzyFields: normalizeFuzzyFields(query.fuzzyFields, { fuzzy, tagFuzzy }),
    limit,
    offset: decodeCursor(query.cursor),
  };
}

function entryMatchesQuery(entry, dictionary, query) {
  if (query.q && !entryMatchesSearchText(entry, dictionary, query.q, {
    fields: query.searchFields,
    fuzzyFields: query.fuzzyFields,
    normalizeText,
  })) {
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
  if (query.derivedFromIds && !query.derivedFromIds.has(entry.id)) {
    return false;
  }
  return true;
}

function derivedFromIds(dictionary, query) {
  if (!query.derivedFrom) {
    return null;
  }
  const relationIndex = buildEntryRelationIndex(dictionary, { normalizeText });
  const target = resolveSourceEntry(query.derivedFrom, dictionary, { normalizeText, index: relationIndex });
  const entries = target
    ? findDerivedEntries(target, dictionary, { normalizeText, index: relationIndex })
    : relationIndex.derivedBySourceKey.get(query.derivedFrom) || [];
  return new Set(entries.map((entry) => entry.id).filter(Boolean));
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

function assertValidMorphology(morphology) {
  const syntaxErrors = validateMorphologyReferenceSyntax(morphology);
  const functionErrors = validateMorphologyFunctionUsage(morphology);
  if (syntaxErrors.length || functionErrors.length) {
    throw apiError("Invalid morphology payload", 400, "invalid_morphology_payload", {
      syntaxErrors,
      functionErrors,
    });
  }
}

function mergeOtherSettings(existingSettings = {}, settings = {}) {
  const { ipa: _ignoredIpa, ...otherSettings } = settings || {};
  return {
    ...(existingSettings || {}),
    ...otherSettings,
    ipa: existingSettings?.ipa,
  };
}

class SqliteDictionaryRepository {
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
    this.normalizeDictionary = normalizeDictionary || ((dictionary) => dictionary);
    this.normalizeUiLanguage = normalizeUiLanguage || ((value) => value || "zh");
    this.normalizeUiTheme = normalizeUiTheme || ((value) => value || "light");
    this.validateDictionary = validateDictionary || (() => {});
    this.connections = new Map();
  }

  static isRuntimeAvailable() {
    return sqliteRuntimeAvailable();
  }

  static runtimeLoadAttempted() {
    return sqliteLoadAttempted;
  }

  async ensureDataStore() {
    await fs.mkdir(this.dictionariesDir, { recursive: true });
    try {
      await fs.access(this.indexPath);
    } catch {
      await this.writeJson(this.indexPath, this.defaultIndex);
    }
  }

  async initializeDictionaryDatabase(id, metadata = {}) {
    await this.ensureDataStore();
    const db = this.openDictionaryDatabase(id);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO dictionary_meta(id, name, language, description, schema_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        language = excluded.language,
        description = excluded.description,
        schema_version = excluded.schema_version,
        updated_at = excluded.updated_at
    `).run(
      id,
      String(metadata.name || ""),
      String(metadata.language || ""),
      String(metadata.description || ""),
      SQLITE_SCHEMA_VERSION,
      metadata.createdAt || now,
      metadata.updatedAt || now,
    );
    return {
      id,
      path: this.dictionaryPath(id),
      schemaVersion: this.schemaVersion(id),
    };
  }

  async importDictionarySnapshot(dictionary, { overwrite = true } = {}) {
    const normalized = this.normalizeDictionary(dictionary);
    this.validateDictionary(normalized);
    if (!overwrite) {
      try {
        await fs.access(this.dictionaryPath(normalized.id));
        throw apiError("Dictionary ID already exists; overwrite confirmation required", 409, "dictionary_id_exists");
      } catch (error) {
        if (error.status === 409) {
          throw error;
        }
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    await this.ensureDataStore();
    const db = this.openDictionaryDatabase(normalized.id);
    this.writeDictionaryToDatabase(db, normalized);
    const index = await this.readIndex();
    const dictionaryIds = index.dictionaryIds.includes(normalized.id)
      ? index.dictionaryIds
      : [...index.dictionaryIds, normalized.id];
    await this.writeIndex({ ...index, activeDictionaryId: normalized.id, dictionaryIds });
    return normalized;
  }

  async listDictionaries() {
    return (await this.readState()).dictionaries;
  }

  async getDictionaryMeta(id) {
    return this.getDictionarySnapshot(id);
  }

  async getDictionarySnapshot(id) {
    await this.requireDictionary(id);
    return this.exportDictionarySnapshot(id);
  }

  async saveDictionarySnapshot(id, snapshot) {
    const source = id ? { ...snapshot, id } : snapshot;
    return this.importDictionarySnapshot(source, { overwrite: true });
  }

  async updateDictionary(id, patch) {
    await this.requireDictionary(id);
    const existing = this.exportDictionarySnapshot(id);
    return this.importDictionarySnapshot({ ...existing, ...patch, id }, { overwrite: true });
  }

  async updateMetadata(id, metadata) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    return this.importDictionarySnapshot({
      ...dictionary,
      name: metadata.name,
      language: metadata.language,
      description: metadata.description,
      updatedAt: new Date().toISOString(),
    }, { overwrite: true });
  }

  async updateSettings(id, settings) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    return this.importDictionarySnapshot({
      ...dictionary,
      settings: mergeOtherSettings(dictionary.settings, settings),
      updatedAt: new Date().toISOString(),
    }, { overwrite: true });
  }

  async updateIpaSettings(id, ipa) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    return this.importDictionarySnapshot({
      ...dictionary,
      settings: {
        ...(dictionary.settings || {}),
        ipa,
      },
      updatedAt: new Date().toISOString(),
    }, { overwrite: true });
  }

  async saveDocs(id, docs) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    return this.importDictionarySnapshot({ ...dictionary, docs, updatedAt: new Date().toISOString() }, { overwrite: true });
  }

  async saveMorphology(id, morphology) {
    await this.requireDictionary(id);
    assertValidMorphology(morphology);
    const dictionary = this.exportDictionarySnapshot(id);
    return this.importDictionarySnapshot({ ...dictionary, morphology, updatedAt: new Date().toISOString() }, { overwrite: true });
  }

  async saveCorpusChanges(id, changes) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    return this.importDictionarySnapshot({
      ...dictionary,
      updatedAt: new Date().toISOString(),
      corpus: {
        ...dictionary.corpus,
        ...changes,
      },
    }, { overwrite: true });
  }

  async queryCorpusUnits(id) {
    const dictionary = await this.getDictionarySnapshot(id);
    return dictionary.corpus?.units || [];
  }

  async getCorpusBlock(id, blockId) {
    const dictionary = await this.getDictionarySnapshot(id);
    return (dictionary.corpus?.blocks || []).find((block) => block.id === blockId) || null;
  }

  async createDictionary(dictionary) {
    const index = await this.readIndex();
    const source = {
      ...dictionary,
      id: reserveDictionaryId(dictionary.id, index.dictionaryIds),
    };
    return this.importDictionarySnapshot(source, { overwrite: true });
  }

  async importDictionary(dictionary, { overwrite = false, regenerateId = false } = {}) {
    const index = await this.readIndex();
    const source = {
      ...dictionary,
      id: reserveDictionaryId(regenerateId ? "" : dictionary.id, index.dictionaryIds),
    };
    if (index.dictionaryIds.includes(source.id) && !overwrite) {
      throw apiError("Dictionary ID already exists; overwrite confirmation required", 409, "dictionary_id_exists");
    }
    return this.importDictionarySnapshot(source, { overwrite: true });
  }

  async exportDictionary(id) {
    const index = await this.readIndex();
    const dictionaryId = id || index.activeDictionaryId;
    if (!dictionaryId || !index.dictionaryIds.includes(dictionaryId)) {
      throw apiError("Dictionary not found", 404, "dictionary_not_found");
    }
    return this.exportDictionarySnapshot(dictionaryId);
  }

  async queryEntries(id, query = null) {
    await this.requireDictionary(id);
    if (!query || !Object.keys(query).length) {
      return this.rawEntries(id);
    }
    const dictionary = this.exportDictionarySnapshot(id);
    const normalizedQuery = normalizeEntryQuery(query);
    normalizedQuery.derivedFromIds = derivedFromIds(dictionary, normalizedQuery);
    const filtered = [...(dictionary.entries || [])]
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

  async queryEntrySummaries(id, query = {}) {
    const result = await this.queryEntries(id, query);
    return Array.isArray(result) ? result.map((entry) => entrySummary(entry)) : result;
  }

  async getEntryFacets(id) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
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
    const dictionary = this.exportDictionarySnapshot(id);
    const entry = (dictionary.entries || []).find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw apiError("Entry not found", 404, "entry_not_found");
    }
    const relation = relationForEntry(entry, dictionary, {
      normalizeText,
      compareEntries: (a, b) => compareEntryValues(a, b, "lemmaAsc"),
    });
    return {
      entryId,
      sources: relation.sources.map((source) => ({
        sourceText: source.sourceText,
        matchedEntryId: source.matchedEntryId,
        matchedLemma: source.matchedLemma,
      })),
      derivedEntries: relation.derivedEntries.map((candidate) => entrySummary(candidate, dictionary)),
      rootGroup: relation.rootGroup ? {
        rootKey: relation.rootGroup.rootKey,
        entries: relation.rootGroup.entries.map((candidate) => entrySummary(candidate, dictionary)),
      } : null,
    };
  }

  async queryRootGroups(id, query = {}) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    const normalizedQuery = normalizeRootGroupQuery(query);
    const compareEntries = (a, b) => compareEntryValues(a, b, normalizedQuery.sort);
    const groups = rootModeGroups(dictionary, {
      query: normalizedQuery.q,
      normalizeText,
      compareEntries,
      matchesEntry: (entry) => entryMatchesSearchText(entry, dictionary, normalizedQuery.q, {
        fields: normalizedQuery.searchFields,
        fuzzyFields: normalizedQuery.fuzzyFields,
        normalizeText,
      }),
    });
    const page = groups.slice(normalizedQuery.offset, normalizedQuery.offset + normalizedQuery.limit);
    const nextOffset = normalizedQuery.offset + page.length;
    const hasMore = nextOffset < groups.length;
    const serializeEntry = normalizedQuery.include === "full"
      ? (entry) => entry
      : (entry) => entrySummary(entry, dictionary);
    return {
      items: page.map((group) => ({
        root: serializeEntry(group.root),
        derivedEntries: group.derived.map(serializeEntry),
        matchedDerivedIds: group.matchedDerived.map((entry) => entry.id).filter(Boolean),
        rootMatches: Boolean(group.rootMatches),
      })),
      pageInfo: {
        nextCursor: hasMore ? encodeCursor(nextOffset) : "",
        hasMore,
        total: groups.length,
      },
    };
  }

  async getEntry(id, entryId) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const row = db.prepare("SELECT entry_json AS entryJson FROM entries WHERE id = ?").get(entryId);
    return row ? parseJson(row.entryJson, null) : null;
  }

  rawEntries(id) {
    const db = this.openDictionaryDatabase(id);
    return db.prepare("SELECT entry_json AS entryJson FROM entries ORDER BY position ASC, lemma ASC, id ASC")
      .all()
      .map((row) => parseJson(row.entryJson, null))
      .filter(Boolean);
  }

  async saveEntry(id, entry) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    const now = new Date().toISOString();
    const savedEntry = this.normalizeDictionary({
      ...dictionary,
      entries: [entry],
    }).entries[0];
    const entries = [...(dictionary.entries || [])];
    const entryIndex = entries.findIndex((item) => item.id === savedEntry.id);
    const nextEntry = {
      ...savedEntry,
      updatedAt: now,
    };
    if (entryIndex === -1) {
      entries.push(nextEntry);
    } else {
      entries[entryIndex] = nextEntry;
    }
    const nextDictionary = this.normalizeDictionary({
      ...dictionary,
      updatedAt: now,
      entries,
    });
    this.validateDictionary(nextDictionary);
    this.writeDictionaryToDatabase(this.openDictionaryDatabase(id), nextDictionary);
    return nextDictionary;
  }

  async deleteEntry(id, entryId) {
    await this.requireDictionary(id);
    const dictionary = this.exportDictionarySnapshot(id);
    const entries = [...(dictionary.entries || [])];
    const entryIndex = entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex === -1) {
      throw apiError("Entry not found", 404, "entry_not_found");
    }
    entries.splice(entryIndex, 1);
    const nextDictionary = this.normalizeDictionary({
      ...dictionary,
      updatedAt: new Date().toISOString(),
      entries,
    });
    this.validateDictionary(nextDictionary);
    this.writeDictionaryToDatabase(this.openDictionaryDatabase(id), nextDictionary);
    return nextDictionary;
  }

  async activateDictionary(id) {
    const index = await this.requireDictionary(id);
    await this.writeIndex({ ...index, activeDictionaryId: id });
  }

  async deleteDictionary(id) {
    const index = await this.requireDictionary(id);
    this.closeDictionary(id);
    await fs.rm(this.dictionaryPath(id), { force: true });
    const dictionaryIds = index.dictionaryIds.filter((dictionaryId) => dictionaryId !== id);
    const activeDictionaryId = index.activeDictionaryId === id ? dictionaryIds[0] || "" : index.activeDictionaryId;
    await this.writeIndex({ ...index, activeDictionaryId, dictionaryIds });
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
    if (!index.dictionaryIds.includes(id)) {
      return false;
    }
    try {
      await fs.access(this.dictionaryPath(id));
      return true;
    } catch {
      return false;
    }
  }

  async requireDictionary(id) {
    const index = await this.readIndex();
    if (!index.dictionaryIds.includes(id)) {
      throw apiError("Dictionary not found", 404, "dictionary_not_found");
    }
    try {
      await fs.access(this.dictionaryPath(id));
    } catch {
      throw apiError("Dictionary not found", 404, "dictionary_not_found");
    }
    return index;
  }

  exportDictionarySnapshot(id) {
    const db = this.openDictionaryDatabase(id);
    const meta = db.prepare(`
      SELECT id, name, language, description, created_at AS createdAt, updated_at AS updatedAt
      FROM dictionary_meta
      WHERE id = ?
    `).get(id);
    if (!meta) {
      throw apiError("Dictionary not found", 404, "dictionary_not_found");
    }
    const blobs = new Map(db.prepare("SELECT module, value_json AS valueJson FROM module_blobs").all()
      .map((row) => [row.module, parseJson(row.valueJson, null)]));
    const entries = db.prepare("SELECT entry_json AS entryJson FROM entries ORDER BY position ASC, lemma ASC, id ASC")
      .all()
      .map((row) => parseJson(row.entryJson, null))
      .filter(Boolean);
    return {
      id: meta.id,
      name: meta.name,
      language: meta.language || "",
      description: meta.description || "",
      settings: blobs.get("settings") || {},
      docs: blobs.get("docs") || {},
      corpus: blobs.get("corpus") || {},
      morphology: blobs.get("morphology") || {},
      createdAt: meta.createdAt || "",
      updatedAt: meta.updatedAt || "",
      entries,
    };
  }

  writeDictionaryToDatabase(db, dictionary) {
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        DELETE FROM definitions;
        DELETE FROM entry_tags;
        DELETE FROM entry_sources;
        DELETE FROM entries;
        DELETE FROM module_blobs;
        DELETE FROM dictionary_meta;
      `);
      db.prepare(`
        INSERT INTO dictionary_meta(id, name, language, description, schema_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        dictionary.id,
        dictionary.name || "",
        dictionary.language || "",
        dictionary.description || "",
        SQLITE_SCHEMA_VERSION,
        dictionary.createdAt || now,
        dictionary.updatedAt || now,
      );

      const insertBlob = db.prepare(`
        INSERT INTO module_blobs(module, value_json, updated_at)
        VALUES (?, ?, ?)
      `);
      [
        ["settings", dictionary.settings || {}],
        ["docs", dictionary.docs || {}],
        ["corpus", dictionary.corpus || {}],
        ["morphology", dictionary.morphology || {}],
      ].forEach(([module, value]) => {
        insertBlob.run(module, JSON.stringify(value), dictionary.updatedAt || now);
      });

      const insertEntry = db.prepare(`
        INSERT INTO entries(id, position, lemma, pronunciation, notes, created_at, updated_at, sort_key, entry_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertDefinition = db.prepare(`
        INSERT INTO definitions(id, entry_id, position, meaning, example, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertTag = db.prepare(`
        INSERT INTO entry_tags(entry_id, position, tag, normalized_tag)
        VALUES (?, ?, ?, ?)
      `);
      const insertSource = db.prepare(`
        INSERT INTO entry_sources(entry_id, position, source_text, source_key)
        VALUES (?, ?, ?, ?)
      `);

      (dictionary.entries || []).forEach((entry, entryIndex) => {
        insertEntry.run(
          entry.id,
          entryIndex,
          entry.lemma || "",
          entry.pronunciation || "",
          entry.notes || "",
          entry.createdAt || "",
          entry.updatedAt || "",
          normalizeText(entry.lemma),
          JSON.stringify(entry),
        );
        (entry.definitions || []).forEach((definition, definitionIndex) => {
          insertDefinition.run(
            definition.id,
            entry.id,
            definitionIndex,
            definition.meaning || "",
            definition.example || "",
            definition.note || definition.notes || "",
            entry.updatedAt || dictionary.updatedAt || now,
          );
        });
        (entry.tags || []).forEach((tag, tagIndex) => {
          insertTag.run(entry.id, tagIndex, tag, normalizeText(tag));
        });
        (entry.etymology?.sources || []).forEach((source, sourceIndex) => {
          insertSource.run(entry.id, sourceIndex, source, normalizeText(source));
        });
      });

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  openDictionaryDatabase(id) {
    if (this.connections.has(id)) {
      return this.connections.get(id);
    }
    const { DatabaseSync } = loadSqliteModule();
    const db = new DatabaseSync(this.dictionaryPath(id));
    db.exec("PRAGMA foreign_keys = ON;");
    this.applySchema(db);
    this.connections.set(id, db);
    return db;
  }

  applySchema(db) {
    db.exec(SQLITE_SCHEMA);
    const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
    if (!row?.version || row.version < SQLITE_SCHEMA_VERSION) {
      db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(SQLITE_SCHEMA_VERSION, new Date().toISOString());
    }
  }

  schemaVersion(id) {
    const db = this.openDictionaryDatabase(id);
    const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
    return Number(row?.version || 0);
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

  async readState() {
    const index = await this.readIndex();
    const dictionaries = [];
    for (const id of index.dictionaryIds) {
      try {
        await fs.access(this.dictionaryPath(id));
        dictionaries.push(this.exportDictionarySnapshot(id));
      } catch (error) {
        if (error.status && error.status !== 404) {
          throw error;
        }
        if (error.code && error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    const dictionaryIds = dictionaries.map((dictionary) => dictionary.id);
    const activeDictionaryId = dictionaryIds.includes(index.activeDictionaryId) ? index.activeDictionaryId : dictionaryIds[0] || "";
    if (dictionaryIds.length !== index.dictionaryIds.length || activeDictionaryId !== index.activeDictionaryId) {
      await this.writeIndex({ ...index, activeDictionaryId, dictionaryIds });
    }
    return { activeDictionaryId, dictionaries, uiLanguage: index.uiLanguage, uiTheme: index.uiTheme };
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
      throw apiError("Invalid dictionary id", 400, "invalid_dictionary_id");
    }
    return path.join(this.dictionariesDir, `${id}.sqlite`);
  }

  close() {
    this.connections.forEach((db) => db.close());
    this.connections.clear();
  }

  closeDictionary(id) {
    const db = this.connections.get(id);
    if (db) {
      db.close();
      this.connections.delete(id);
    }
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

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dictionary_meta (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT,
  description TEXT,
  schema_version INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS module_blobs (
  module TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 0,
  lemma TEXT NOT NULL,
  pronunciation TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  sort_key TEXT,
  entry_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS definitions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  meaning TEXT,
  example TEXT,
  notes TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  tag TEXT NOT NULL,
  normalized_tag TEXT NOT NULL,
  PRIMARY KEY(entry_id, position)
);

CREATE TABLE IF NOT EXISTS entry_sources (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_key TEXT NOT NULL,
  PRIMARY KEY(entry_id, position)
);

CREATE INDEX IF NOT EXISTS idx_entries_lemma ON entries(lemma);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);
CREATE INDEX IF NOT EXISTS idx_entry_tags_normalized_tag ON entry_tags(normalized_tag);
CREATE INDEX IF NOT EXISTS idx_entry_sources_source_key ON entry_sources(source_key);
CREATE INDEX IF NOT EXISTS idx_definitions_entry_id ON definitions(entry_id);
`;

module.exports = {
  SQLITE_SCHEMA_VERSION,
  SQLITE_SCHEMA,
  SqliteDictionaryRepository,
};
