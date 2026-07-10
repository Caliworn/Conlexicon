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
  resolveSourceEntry,
  rootModeGroups,
} = require("./entry-relations-model");

const SQLITE_SCHEMA_VERSION = 1;
const ENTRY_PATCH_ALLOWED_FIELDS = new Set(["pronunciation", "tags"]);
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

function normalizeEntryMorphologyInstance(entry = {}, instance = {}, position = 0) {
  const fallbackMorphology = entry.morphology || {};
  const source = instance && typeof instance === "object" && !Array.isArray(instance)
    ? instance
    : {};
  const overrides = source.overrides && typeof source.overrides === "object" && !Array.isArray(source.overrides)
    ? source.overrides
    : fallbackMorphology.overrides || {};
  return {
    id: String(source.id || entryMorphologyInstanceId(entry.id, position)),
    tableId: String(source.tableId || source.table_id || fallbackMorphology.tableId || "auto"),
    title: String(source.title || ""),
    notes: String(source.notes || source.note || ""),
    overrides: overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {},
    createdAt: String(source.createdAt || source.created_at || entry.createdAt || ""),
    updatedAt: String(source.updatedAt || source.updated_at || entry.updatedAt || ""),
  };
}

function entryMorphologyInstances(entry = {}) {
  const explicitInstances = Array.isArray(entry.morphologyTables) ? entry.morphologyTables : [];
  const sources = explicitInstances.length ? explicitInstances : [entry.morphology || {}];
  return sources.map((instance, index) => normalizeEntryMorphologyInstance(entry, instance, index));
}

function entrySelectColumns(alias = "e") {
  const prefix = alias ? `${alias}.` : "";
  return `
    ${prefix}id AS id,
    ${prefix}position AS position,
    ${prefix}lemma AS lemma,
    ${prefix}pronunciation AS pronunciation,
    ${prefix}notes AS notes,
    ${prefix}etymology_description AS etymologyDescription,
    ${prefix}created_at AS createdAt,
    ${prefix}updated_at AS updatedAt
  `;
}

function chunkArray(items, size = 500) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

function sqlPlaceholders(values) {
  return values.map(() => "?").join(", ");
}

function sqlOrderClause(sort = "lemmaAsc", alias = "e") {
  if (sort === "lemmaDesc") {
    return `${alias}.sort_key DESC, ${alias}.lemma DESC, ${alias}.position ASC`;
  }
  if (sort === "updatedAsc") {
    return `${alias}.updated_at ASC, ${alias}.sort_key ASC, ${alias}.lemma ASC, ${alias}.position ASC`;
  }
  if (sort === "updatedDesc") {
    return `${alias}.updated_at DESC, ${alias}.sort_key DESC, ${alias}.lemma DESC, ${alias}.position ASC`;
  }
  if (sort === "createdAsc") {
    return `${alias}.created_at ASC, ${alias}.sort_key ASC, ${alias}.lemma ASC, ${alias}.position ASC`;
  }
  if (sort === "createdDesc") {
    return `${alias}.created_at DESC, ${alias}.sort_key DESC, ${alias}.lemma DESC, ${alias}.position ASC`;
  }
  return `${alias}.sort_key ASC, ${alias}.lemma ASC, ${alias}.position ASC`;
}

function canUseSqlEntryQuery(query) {
  return !query.q && !query.fuzzy && !query.tagFuzzy && !query.fuzzyFields.size;
}

function canUseSqlRootGroupsQuery(query) {
  return !query.q && !query.fuzzy && !query.tagFuzzy && !query.fuzzyFields.size;
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

function entryEntityIdRecords(entry = {}) {
  const records = [];
  if (entry.id) {
    records.push({ id: entry.id, type: "entry", scope: "entry", ownerId: entry.id });
  }
  (entry.definitions || []).forEach((definition) => {
    if (definition.id) {
      records.push({ id: definition.id, type: "definition", scope: "entry", ownerId: entry.id });
    }
  });
  return records;
}

function moduleEntityIdRecords(dictionary = {}) {
  const records = [];
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

function scopedDuplicateDetails(savedRecords, existingRecords) {
  const groups = new Map();
  [...savedRecords, ...existingRecords].forEach((record) => {
    if (!record.id) {
      return;
    }
    if (!groups.has(record.id)) {
      groups.set(record.id, []);
    }
    groups.get(record.id).push(record);
  });
  return [...groups.entries()]
    .filter(([, records]) => records.length > 1 && records.some((record) => record.saved))
    .slice(0, 20)
    .map(([id, records]) => `${id} (${records.map((record) => record.type).join(", ")})`)
    .join("; ");
}

function assertSavedEntryEntityIds(savedEntry, existingRecords) {
  const savedRecords = entryEntityIdRecords(savedEntry).map((record) => ({ ...record, saved: true }));
  const details = scopedDuplicateDetails(savedRecords, existingRecords);
  if (details) {
    throw apiError(`Duplicate dictionary entity IDs in saved scope: ${details}`, 409, "duplicate_entity_ids_scoped", {
      duplicates: details,
    });
  }
}

function assertSavedModuleEntityIds(moduleRecords, existingRecords) {
  const savedRecords = moduleRecords.map((record) => ({ ...record, saved: true }));
  const details = scopedDuplicateDetails(savedRecords, existingRecords);
  if (details) {
    throw apiError(`Duplicate dictionary entity IDs in saved scope: ${details}`, 409, "duplicate_entity_ids_scoped", {
      duplicates: details,
    });
  }
}

function prefillEntryEntityIds(entry = {}, usedIds) {
  const nextEntry = {
    ...entry,
    id: reserveEntityId(entry.id, "entry", usedIds),
  };
  if (Array.isArray(entry.definitions) && entry.definitions.length) {
    nextEntry.definitions = entry.definitions.map((definition) => ({
      ...definition,
      id: reserveEntityId(definition.id, "def", usedIds),
    }));
  } else {
    nextEntry.definitions = [{
      id: reserveEntityId("", "def", usedIds),
      meaning: entry.meaning || "",
      example: entry.example || "",
      note: "",
    }];
  }
  return nextEntry;
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

  dictionaryMetadataFromDatabase(id) {
    const db = this.openDictionaryDatabase(id);
    const meta = db.prepare(`
      SELECT id, name, language, description, created_at AS createdAt, updated_at AS updatedAt
      FROM dictionary_meta
      WHERE id = ?
    `).get(id);
    if (!meta) {
      throw apiError("Dictionary not found", 404, "dictionary_not_found");
    }
    return {
      id: meta.id,
      name: meta.name,
      language: meta.language || "",
      description: meta.description || "",
      createdAt: meta.createdAt || "",
      updatedAt: meta.updatedAt || "",
      summary: this.dictionarySummaryFromDatabase(db),
    };
  }

  dictionarySummaryFromDatabase(db) {
    return {
      entryCount: Number(db.prepare("SELECT COUNT(*) AS count FROM entries").get()?.count || 0),
      rootCount: this.rootCountFromProjection(db),
    };
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
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionary({
      ...baseDictionary,
      name: metadata.name,
      language: metadata.language,
      description: metadata.description,
      updatedAt: now,
    });
    db.prepare(`
      UPDATE dictionary_meta
      SET name = ?, language = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(normalized.name, normalized.language, normalized.description, now, id);
    return this.exportDictionarySnapshot(id);
  }

  async updateSettings(id, settings) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryWithEntityPlaceholders(db, {
      ...baseDictionary,
      settings: mergeOtherSettings(baseDictionary.settings, settings),
      updatedAt: now,
    });
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "settings", normalized.settings, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.exportDictionarySnapshot(id);
  }

  async updateIpaSettings(id, ipa) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryWithEntityPlaceholders(db, {
      ...baseDictionary,
      settings: {
        ...(baseDictionary.settings || {}),
        ipa,
      },
      updatedAt: now,
    });
    assertSavedModuleEntityIds(
      moduleEntityIdRecords({ settings: normalized.settings }).filter((record) => record.scope === "ipa"),
      this.existingEntityIdRecords(db, baseDictionary, { excludeScope: "ipa" }),
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "settings", normalized.settings, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.exportDictionarySnapshot(id);
  }

  async saveDocs(id, docs) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryWithEntityPlaceholders(db, {
      ...baseDictionary,
      docs,
      updatedAt: now,
    });
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "docs", normalized.docs, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.exportDictionarySnapshot(id);
  }

  async saveMorphology(id, morphology) {
    await this.requireDictionary(id);
    assertValidMorphology(morphology);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryWithEntityPlaceholders(db, {
      ...baseDictionary,
      morphology,
      updatedAt: now,
    });
    assertSavedModuleEntityIds(
      moduleEntityIdRecords({ morphology: normalized.morphology }).filter((record) => record.scope === "morphology"),
      this.existingEntityIdRecords(db, baseDictionary, { excludeScope: "morphology" }),
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "morphology", normalized.morphology, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.exportDictionarySnapshot(id);
  }

  async saveCorpusChanges(id, changes) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryWithEntityPlaceholders(db, {
      ...baseDictionary,
      updatedAt: now,
      corpus: {
        ...baseDictionary.corpus,
        ...changes,
      },
    });
    assertSavedModuleEntityIds(
      moduleEntityIdRecords({ corpus: normalized.corpus }).filter((record) => record.scope === "corpus"),
      this.existingEntityIdRecords(db, baseDictionary, { excludeScope: "corpus" }),
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "corpus", normalized.corpus, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.exportDictionarySnapshot(id);
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

  entryQueryWhereClauses(db, dictionary, query) {
    const clauses = [];
    const params = [];
    const settings = dictionary.settings || {};

    if (query.part) {
      if (query.part === NO_PART_FILTER_VALUE) {
        if (settings.manualPartOfSpeechTags) {
          const configuredParts = (settings.partOfSpeechTags || []).map(normalizeText).filter(Boolean);
          if (configuredParts.length) {
            clauses.push(`NOT EXISTS (
              SELECT 1 FROM entry_tags part_tags
              WHERE part_tags.entry_id = e.id
                AND part_tags.normalized_tag IN (${sqlPlaceholders(configuredParts)})
            )`);
            params.push(...configuredParts);
          }
        } else {
          clauses.push(`NOT EXISTS (
            SELECT 1 FROM entry_tags first_tag
            WHERE first_tag.entry_id = e.id AND first_tag.position = 0
          )`);
        }
      } else if (settings.manualPartOfSpeechTags) {
        const normalizedPart = normalizeText(query.part);
        const configuredParts = new Set((settings.partOfSpeechTags || []).map(normalizeText).filter(Boolean));
        if (!configuredParts.has(normalizedPart)) {
          clauses.push("0 = 1");
        } else {
          clauses.push(`EXISTS (
            SELECT 1 FROM entry_tags part_tags
            WHERE part_tags.entry_id = e.id AND part_tags.normalized_tag = ?
          )`);
          params.push(normalizedPart);
        }
      } else {
        clauses.push(`EXISTS (
          SELECT 1 FROM entry_tags first_tag
          WHERE first_tag.entry_id = e.id
            AND first_tag.position = 0
            AND first_tag.normalized_tag = ?
        )`);
        params.push(normalizeText(query.part));
      }
    }

    if (query.tags.length) {
      const tags = query.tags.map(normalizeText).filter(Boolean);
      if (query.tagMode === "all") {
        tags.forEach((tag) => {
          clauses.push(`EXISTS (
            SELECT 1 FROM entry_tags filter_tags
            WHERE filter_tags.entry_id = e.id AND filter_tags.normalized_tag = ?
          )`);
          params.push(tag);
        });
      } else if (tags.length) {
        clauses.push(`EXISTS (
          SELECT 1 FROM entry_tags filter_tags
          WHERE filter_tags.entry_id = e.id
            AND filter_tags.normalized_tag IN (${sqlPlaceholders(tags)})
        )`);
        params.push(...tags);
      }
    }

    if (query.source) {
      clauses.push(`EXISTS (
        SELECT 1 FROM entry_sources source_filter
        WHERE source_filter.entry_id = e.id AND source_filter.source_key = ?
      )`);
      params.push(query.source);
    }

    if (query.derivedFrom) {
      const source = this.resolveEntryBySourceKey(db, query.derivedFrom);
      const sourceKeys = source
        ? [source.id, source.lemma].map(normalizeText).filter(Boolean)
        : [query.derivedFrom];
      clauses.push(`EXISTS (
        SELECT 1 FROM entry_sources derived_filter
        WHERE derived_filter.entry_id = e.id
          AND derived_filter.source_key IN (${sqlPlaceholders(sourceKeys)})
      )`);
      params.push(...sourceKeys);
      if (source?.id) {
        clauses.push("e.id <> ?");
        params.push(source.id);
      }
    }

    return { clauses, params };
  }

  entriesFromRows(db, rows = []) {
    if (!rows.length) {
      return [];
    }
    const ids = rows.map((row) => row.id).filter(Boolean);
    const definitionsByEntry = new Map();
    const tagsByEntry = new Map();
    const sourcesByEntry = new Map();
    const morphologyByEntry = new Map();

    const collectRows = (sql, handleRow) => {
      chunkArray(ids).forEach((chunk) => {
        db.prepare(sql(sqlPlaceholders(chunk))).all(...chunk).forEach(handleRow);
      });
    };

    collectRows((placeholders) => `
      SELECT id, entry_id AS entryId, position, meaning, example, notes
      FROM definitions
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, position ASC
    `, (row) => {
      if (!definitionsByEntry.has(row.entryId)) {
        definitionsByEntry.set(row.entryId, []);
      }
      definitionsByEntry.get(row.entryId).push({
        id: row.id,
        meaning: row.meaning || "",
        example: row.example || "",
        note: row.notes || "",
      });
    });

    collectRows((placeholders) => `
      SELECT entry_id AS entryId, tag
      FROM entry_tags
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, position ASC
    `, (row) => {
      if (!tagsByEntry.has(row.entryId)) {
        tagsByEntry.set(row.entryId, []);
      }
      tagsByEntry.get(row.entryId).push(row.tag || "");
    });

    collectRows((placeholders) => `
      SELECT entry_id AS entryId, source_text AS sourceText
      FROM entry_sources
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, position ASC
    `, (row) => {
      if (!sourcesByEntry.has(row.entryId)) {
        sourcesByEntry.set(row.entryId, []);
      }
      sourcesByEntry.get(row.entryId).push(row.sourceText || "");
    });

    collectRows((placeholders) => `
      SELECT id, entry_id AS entryId, position, table_id AS tableId, title, notes, overrides_json AS overridesJson, created_at AS createdAt, updated_at AS updatedAt
      FROM entry_morphology_tables
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, position ASC
    `, (row) => {
      if (!morphologyByEntry.has(row.entryId)) {
        morphologyByEntry.set(row.entryId, []);
      }
      morphologyByEntry.get(row.entryId).push(row);
    });

    return rows.map((row) => {
      const morphologyInstances = morphologyByEntry.get(row.id) || [];
      const firstMorphology = morphologyInstances[0] || {};
      return {
        id: row.id,
        lemma: row.lemma || "",
        pronunciation: row.pronunciation || "",
        tags: (tagsByEntry.get(row.id) || []).filter(Boolean),
        definitions: definitionsByEntry.get(row.id) || [],
        etymology: {
          sources: (sourcesByEntry.get(row.id) || []).filter(Boolean),
          description: row.etymologyDescription || "",
        },
        notes: row.notes || "",
        morphology: {
          tableId: firstMorphology.tableId || "auto",
          overrides: parseJson(firstMorphology.overridesJson || "{}", {}),
        },
        createdAt: row.createdAt || "",
        updatedAt: row.updatedAt || "",
      };
    });
  }

  entryFromRow(db, row) {
    return row ? this.entriesFromRows(db, [row])[0] || null : null;
  }

  queryEntriesSql(id, query) {
    const db = this.openDictionaryDatabase(id);
    const dictionary = this.baseDictionarySnapshot(id);
    const { clauses, params } = this.entryQueryWhereClauses(db, dictionary, query);
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM entries e ${whereSql}`).get(...params)?.total || 0);
    const rows = db.prepare(`
      SELECT ${entrySelectColumns("e")}
      FROM entries e
      ${whereSql}
      ORDER BY ${sqlOrderClause(query.sort, "e")}
      LIMIT ? OFFSET ?
    `).all(...params, query.limit, query.offset);
    const page = this.entriesFromRows(db, rows);
    const nextOffset = query.offset + page.length;
    const hasMore = nextOffset < total;
    return {
      items: query.include === "full" ? page : page.map((entry) => entrySummary(entry, dictionary)),
      pageInfo: {
        nextCursor: hasMore ? encodeCursor(nextOffset) : "",
        hasMore,
        total,
      },
    };
  }

  async queryEntries(id, query = null) {
    await this.requireDictionary(id);
    if (!query || !Object.keys(query).length) {
      return this.rawEntries(id);
    }
    const normalizedQuery = normalizeEntryQuery(query);
    if (canUseSqlEntryQuery(normalizedQuery)) {
      return this.queryEntriesSql(id, normalizedQuery);
    }
    const dictionary = this.exportDictionarySnapshot(id);
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
    const db = this.openDictionaryDatabase(id);
    const dictionary = this.baseDictionarySnapshot(id);
    const partMap = new Map();
    const tagMap = new Map();
    const settings = dictionary.settings || {};

    let partRows = [];
    let noPartOfSpeechCount = 0;
    if (settings.manualPartOfSpeechTags) {
      const configuredParts = (settings.partOfSpeechTags || []).map(normalizeText).filter(Boolean);
      if (configuredParts.length) {
        partRows = db.prepare(`
          SELECT tag, COUNT(*) AS count
          FROM entry_tags
          WHERE normalized_tag IN (${sqlPlaceholders(configuredParts)})
          GROUP BY tag
        `).all(...configuredParts);
        noPartOfSpeechCount = Number(db.prepare(`
          SELECT COUNT(*) AS count
          FROM entries e
          WHERE NOT EXISTS (
            SELECT 1 FROM entry_tags part_tags
            WHERE part_tags.entry_id = e.id
              AND part_tags.normalized_tag IN (${sqlPlaceholders(configuredParts)})
          )
        `).get(...configuredParts)?.count || 0);
      } else {
        noPartOfSpeechCount = Number(db.prepare("SELECT COUNT(*) AS count FROM entries").get()?.count || 0);
      }
    } else {
      partRows = db.prepare(`
        SELECT tag, COUNT(*) AS count
        FROM entry_tags
        WHERE position = 0
        GROUP BY tag
      `).all();
      noPartOfSpeechCount = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM entries e
        WHERE NOT EXISTS (
          SELECT 1 FROM entry_tags first_tag
          WHERE first_tag.entry_id = e.id AND first_tag.position = 0
        )
      `).get()?.count || 0);
    }

    partRows.forEach((row) => {
      partMap.set(row.tag, Number(row.count || 0));
    });
    db.prepare(`
      SELECT tag, COUNT(*) AS count
      FROM entry_tags
      GROUP BY tag
    `).all().forEach((row) => {
      tagMap.set(row.tag, Number(row.count || 0));
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

  resolveEntryBySourceKey(db, sourceKey) {
    const key = normalizeText(sourceKey);
    if (!key) {
      return null;
    }
    const row = db.prepare(`
      SELECT ${entrySelectColumns("e")}
      FROM entries
      AS e
      WHERE sort_key = ? OR lower(id) = ?
      ORDER BY sort_key ASC, lemma ASC, id ASC
      LIMIT 1
    `).get(key, key);
    return this.entryFromRow(db, row);
  }

  directDerivedEntries(db, sourceEntry, { sort = "lemmaAsc" } = {}) {
    if (!sourceEntry) {
      return [];
    }
    const sourceKeys = [sourceEntry.id, sourceEntry.lemma].map(normalizeText).filter(Boolean);
    if (!sourceKeys.length) {
      return [];
    }
    return db.prepare(`
      SELECT DISTINCT ${entrySelectColumns("e")}
      FROM entries e
      JOIN entry_sources s ON s.entry_id = e.id
      WHERE s.source_key IN (${sqlPlaceholders(sourceKeys)})
        AND e.id <> ?
      ORDER BY ${sqlOrderClause(sort, "e")}
    `).all(...sourceKeys, sourceEntry.id)
      .map((row) => this.entryFromRow(db, row))
      .filter(Boolean);
  }

  entrySourcesFromDatabase(db, entryId) {
    return db.prepare(`
      SELECT source_text AS sourceText, source_key AS sourceKey
      FROM entry_sources
      WHERE entry_id = ?
      ORDER BY position ASC
    `).all(entryId);
  }

  sourceRootEntriesFromDatabase(db, entry, seen = new Set()) {
    if (!entry) {
      return [];
    }
    const roots = [];
    this.entrySourcesFromDatabase(db, entry.id).forEach((source) => {
      const sourceEntry = this.resolveEntryBySourceKey(db, source.sourceKey || source.sourceText);
      if (!sourceEntry || seen.has(sourceEntry.id)) {
        return;
      }
      seen.add(sourceEntry.id);
      const sourceSources = this.entrySourcesFromDatabase(db, sourceEntry.id);
      if (!sourceSources.length) {
        roots.push(sourceEntry);
        return;
      }
      const ancestors = this.sourceRootEntriesFromDatabase(db, sourceEntry, seen);
      if (ancestors.length) {
        roots.push(...ancestors);
      } else {
        roots.push(sourceEntry);
      }
    });
    return roots;
  }

  descendantEntriesFromDatabase(db, rootEntry) {
    const descendants = new Map();
    const queue = [rootEntry];
    const visitedSourceKeys = new Set();
    while (queue.length) {
      const source = queue.shift();
      const sourceKeys = [source.id, source.lemma].map(normalizeText).filter(Boolean);
      sourceKeys
        .filter((sourceKey) => !visitedSourceKeys.has(sourceKey))
        .forEach((sourceKey) => {
          visitedSourceKeys.add(sourceKey);
          db.prepare(`
            SELECT DISTINCT ${entrySelectColumns("e")}
            FROM entries e
            JOIN entry_sources s ON s.entry_id = e.id
            WHERE s.source_key = ? AND e.id <> ?
            ORDER BY ${sqlOrderClause("lemmaAsc", "e")}
          `).all(sourceKey, rootEntry.id)
            .map((row) => this.entryFromRow(db, row))
            .filter(Boolean)
            .forEach((entry) => {
              if (!descendants.has(entry.id)) {
                descendants.set(entry.id, entry);
                queue.push(entry);
              }
            });
        });
    }
    return [...descendants.values()].sort((a, b) => compareEntryValues(a, b, "lemmaAsc"));
  }

  rootGroupsFromDatabase(db, { sort = "lemmaAsc" } = {}) {
    const rows = db.prepare(`
      SELECT ${entrySelectColumns("e")},
        EXISTS (
          SELECT 1 FROM entry_sources s
          WHERE s.entry_id = e.id
        ) AS hasSources
      FROM entries e
      ORDER BY ${sqlOrderClause(sort, "e")}
    `).all();
    const entries = this.entriesFromRows(db, rows);
    const groups = new Map();
    const ensureGroup = (root) => {
      if (!groups.has(root.id)) {
        groups.set(root.id, { root, derived: [], matchedDerived: [], rootMatches: true });
      }
      return groups.get(root.id);
    };

    entries.forEach((entry, index) => {
      const hasSources = Boolean(rows[index]?.hasSources);
      if (!hasSources) {
        ensureGroup(entry);
        return;
      }
      const roots = this.sourceRootEntriesFromDatabase(db, entry);
      if (!roots.length) {
        ensureGroup(entry);
        return;
      }
      roots.forEach((root) => {
        const group = ensureGroup(root);
        if (!group.derived.some((candidate) => candidate.id === entry.id)) {
          group.derived.push(entry);
        }
      });
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        derived: group.derived.sort((a, b) => compareEntryValues(a, b, sort)),
        matchedDerived: group.derived,
        rootMatches: true,
      }))
      .sort((a, b) => compareEntryValues(a.root, b.root, sort));
  }

  rootCountFromProjection(db) {
    const entries = db.prepare(`
      SELECT id, lemma, sort_key AS sortKey
      FROM entries
      ORDER BY sort_key ASC, lemma ASC, id ASC
    `).all();
    if (!entries.length) {
      return 0;
    }

    const byId = new Map();
    const byLemma = new Map();
    entries.forEach((entry) => {
      const idKey = normalizeText(entry.id);
      const lemmaKey = normalizeText(entry.lemma);
      if (idKey && !byId.has(idKey)) {
        byId.set(idKey, entry);
      }
      if (lemmaKey && !byLemma.has(lemmaKey)) {
        byLemma.set(lemmaKey, entry);
      }
    });

    const sourcesByEntry = new Map();
    db.prepare(`
      SELECT entry_id AS entryId, source_key AS sourceKey
      FROM entry_sources
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      if (!sourcesByEntry.has(row.entryId)) {
        sourcesByEntry.set(row.entryId, []);
      }
      sourcesByEntry.get(row.entryId).push(row.sourceKey);
    });

    const sourceRootEntries = (entry, seen = new Set()) => {
      const roots = [];
      (sourcesByEntry.get(entry.id) || []).forEach((sourceKey) => {
        const source = byLemma.get(sourceKey) || byId.get(sourceKey) || null;
        if (!source || seen.has(source.id)) {
          return;
        }
        seen.add(source.id);
        const sourceSources = sourcesByEntry.get(source.id) || [];
        if (!sourceSources.length) {
          roots.push(source);
          return;
        }
        const ancestors = sourceRootEntries(source, seen);
        if (ancestors.length) {
          roots.push(...ancestors);
        } else {
          roots.push(source);
        }
      });
      return roots;
    };

    const rootIds = new Set();
    entries.forEach((entry) => {
      const sources = sourcesByEntry.get(entry.id) || [];
      if (!sources.length) {
        rootIds.add(entry.id);
        return;
      }
      const roots = sourceRootEntries(entry);
      if (!roots.length) {
        rootIds.add(entry.id);
        return;
      }
      roots.forEach((root) => rootIds.add(root.id));
    });
    return rootIds.size;
  }

  queryRootGroupsSql(id, query) {
    const db = this.openDictionaryDatabase(id);
    const dictionary = this.baseDictionarySnapshot(id);
    const groups = this.rootGroupsFromDatabase(db, { sort: query.sort });
    const page = groups.slice(query.offset, query.offset + query.limit);
    const nextOffset = query.offset + page.length;
    const hasMore = nextOffset < groups.length;
    const serializeEntry = query.include === "full"
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

  async getEntryRelations(id, entryId) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const dictionary = this.baseDictionarySnapshot(id);
    const entry = this.getEntryFromDatabase(db, entryId);
    if (!entry) {
      throw apiError("Entry not found", 404, "entry_not_found");
    }
    const sources = this.entrySourcesFromDatabase(db, entryId).map((source) => {
      const matchedEntry = this.resolveEntryBySourceKey(db, source.sourceKey || source.sourceText);
      return {
        sourceText: source.sourceText,
        matchedEntryId: matchedEntry?.id || "",
        matchedLemma: matchedEntry?.lemma || "",
      };
    });
    const derivedEntries = this.directDerivedEntries(db, entry, { sort: "lemmaAsc" });
    const roots = this.entrySourcesFromDatabase(db, entry.id).length
      ? this.sourceRootEntriesFromDatabase(db, entry)
      : [entry];
    const root = roots.sort((a, b) => compareEntryValues(a, b, "lemmaAsc"))[0] || entry;
    const rootEntries = [root, ...this.descendantEntriesFromDatabase(db, root)];
    return {
      entryId,
      sources,
      derivedEntries: derivedEntries.map((candidate) => entrySummary(candidate, dictionary)),
      rootGroup: {
        rootKey: root.lemma || root.id || "",
        entries: rootEntries.map((candidate) => entrySummary(candidate, dictionary)),
      },
    };
  }

  async queryRootGroups(id, query = {}) {
    await this.requireDictionary(id);
    const normalizedQuery = normalizeRootGroupQuery(query);
    if (canUseSqlRootGroupsQuery(normalizedQuery)) {
      return this.queryRootGroupsSql(id, normalizedQuery);
    }
    const dictionary = this.exportDictionarySnapshot(id);
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
    return this.getEntryFromDatabase(db, entryId);
  }

  getEntryFromDatabase(db, entryId) {
    const row = db.prepare(`SELECT ${entrySelectColumns("e")} FROM entries e WHERE e.id = ?`).get(entryId);
    return this.entryFromRow(db, row);
  }

  rawEntries(id) {
    const db = this.openDictionaryDatabase(id);
    return this.entriesFromRows(
      db,
      db.prepare(`SELECT ${entrySelectColumns("e")} FROM entries e ORDER BY e.position ASC, e.lemma ASC, e.id ASC`).all(),
    );
  }

  async saveEntry(id, entry) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const savedEntry = this.normalizeEntryForSave(baseDictionary, entry, this.usedEntityIds(db, baseDictionary));
    const nextEntry = {
      ...savedEntry,
      updatedAt: now,
    };
    const existingRow = db.prepare("SELECT position FROM entries WHERE id = ?").get(nextEntry.id);
    assertSavedEntryEntityIds(
      nextEntry,
      this.existingEntityIdRecords(db, baseDictionary, { excludeEntryId: existingRow ? nextEntry.id : "" }),
    );
    const position = existingRow
      ? existingRow.position
      : Number(db.prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM entries").get()?.position || 0);

    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeEntryProjection(db, nextEntry, position);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      id,
      updatedAt: now,
      entry: this.getEntryFromDatabase(db, nextEntry.id),
    };
  }

  async deleteEntry(id, entryId) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const existingRow = db.prepare("SELECT id FROM entries WHERE id = ?").get(entryId);
    if (!existingRow) {
      throw apiError("Entry not found", 404, "entry_not_found");
    }
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM definitions WHERE entry_id = ?").run(entryId);
      db.prepare("DELETE FROM entry_tags WHERE entry_id = ?").run(entryId);
      db.prepare("DELETE FROM entry_sources WHERE entry_id = ?").run(entryId);
      db.prepare("DELETE FROM entry_morphology_tables WHERE entry_id = ?").run(entryId);
      db.prepare("DELETE FROM entries WHERE id = ?").run(entryId);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { id, updatedAt: now };
  }

  async patchEntries(id, updates = [], options = {}) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const changedEntries = new Map();

    updates.forEach((update) => {
      const entryId = String(update?.id || "").trim();
      const patch = update?.patch && typeof update.patch === "object" && !Array.isArray(update.patch)
        ? update.patch
        : {};
      const invalidFields = Object.keys(patch).filter((field) => !ENTRY_PATCH_ALLOWED_FIELDS.has(field));
      if (invalidFields.length) {
        throw apiError("Unsupported entry patch fields", 400, "unsupported_entry_patch_fields", {
          fields: invalidFields,
        });
      }
      if (Object.hasOwn(patch, "tags") && !Array.isArray(patch.tags)) {
        throw apiError("Entry patch tags must be an array", 400, "entry_patch_tags_invalid");
      }
      if (Object.hasOwn(patch, "pronunciation") && typeof patch.pronunciation !== "string") {
        throw apiError("Entry patch pronunciation must be a string", 400, "entry_patch_pronunciation_invalid");
      }
      const existingEntry = changedEntries.get(entryId) || this.getEntryFromDatabase(db, entryId);
      if (!existingEntry) {
        throw apiError("Entry not found", 404, "entry_not_found");
      }
      const patchedEntry = this.normalizeEntryForSave(baseDictionary, {
        ...existingEntry,
        ...patch,
        id: entryId,
        updatedAt: now,
      }, this.usedEntityIds(db, baseDictionary));
      changedEntries.set(entryId, {
        ...patchedEntry,
        updatedAt: now,
      });
    });

    const hasSettings = Object.hasOwn(options, "settings");
    if (!updates.length && !hasSettings) {
      return this.exportDictionarySnapshot(id);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      if (hasSettings) {
        this.writeModuleBlob(db, "settings", mergeOtherSettings(baseDictionary.settings, options.settings), now);
      }
      changedEntries.forEach((patchedEntry) => {
        const row = db.prepare("SELECT position FROM entries WHERE id = ?").get(patchedEntry.id);
        this.writeEntryProjection(db, patchedEntry, row?.position ?? 0);
      });
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.exportDictionarySnapshot(id);
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

  baseDictionarySnapshot(id) {
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
      entries: [],
    };
  }

  entityPlaceholderEntries(db) {
    const entries = db.prepare("SELECT id FROM entries ORDER BY position ASC").all()
      .map((row) => ({ id: row.id, definitions: [] }));
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    db.prepare("SELECT id, entry_id AS entryId FROM definitions ORDER BY entry_id ASC, position ASC")
      .all()
      .forEach((row) => {
        const entry = byId.get(row.entryId);
        if (entry) {
          entry.definitions.push({ id: row.id });
        }
      });
    return entries;
  }

  normalizeDictionaryWithEntityPlaceholders(db, dictionary) {
    return this.normalizeDictionary({
      ...dictionary,
      entries: this.entityPlaceholderEntries(db),
    });
  }

  existingEntityIdRecords(db, baseDictionary, { excludeEntryId = "", excludeScope = "" } = {}) {
    const records = [...moduleEntityIdRecords(baseDictionary).filter((record) => record.scope !== excludeScope)];
    db.prepare("SELECT id FROM entries WHERE id <> ?")
      .all(excludeEntryId)
      .forEach((row) => records.push({ id: row.id, type: "entry", scope: "entry", ownerId: row.id }));
    db.prepare("SELECT id, entry_id AS entryId FROM definitions WHERE entry_id <> ?")
      .all(excludeEntryId)
      .forEach((row) => records.push({ id: row.id, type: "definition", scope: "entry", ownerId: row.entryId }));
    return records.filter((record) => record.id);
  }

  usedEntityIds(db, baseDictionary) {
    return new Set([
      ...this.existingEntityIdRecords(db, baseDictionary).map((record) => String(record.id).trim()).filter(Boolean),
    ]);
  }

  normalizeEntryForSave(baseDictionary, entry, usedIds) {
    const prefilledEntry = prefillEntryEntityIds(entry, usedIds);
    return this.normalizeDictionary({
      ...baseDictionary,
      entries: [prefilledEntry],
    }).entries[0];
  }

  touchDictionary(db, id, updatedAt) {
    db.prepare("UPDATE dictionary_meta SET updated_at = ? WHERE id = ?").run(updatedAt, id);
  }

  writeModuleBlob(db, module, value, updatedAt) {
    db.prepare(`
      INSERT INTO module_blobs(module, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(module) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(module, JSON.stringify(value || {}), updatedAt);
  }

  writeEntryProjection(db, entry, position) {
    db.prepare("DELETE FROM definitions WHERE entry_id = ?").run(entry.id);
    db.prepare("DELETE FROM entry_tags WHERE entry_id = ?").run(entry.id);
    db.prepare("DELETE FROM entry_sources WHERE entry_id = ?").run(entry.id);
    db.prepare("DELETE FROM entry_morphology_tables WHERE entry_id = ?").run(entry.id);
    db.prepare(`
      INSERT INTO entries(id, position, lemma, pronunciation, notes, etymology_description, created_at, updated_at, sort_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        lemma = excluded.lemma,
        pronunciation = excluded.pronunciation,
        notes = excluded.notes,
        etymology_description = excluded.etymology_description,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        sort_key = excluded.sort_key
    `).run(
      entry.id,
      position,
      entry.lemma || "",
      entry.pronunciation || "",
      entry.notes || "",
      entry.etymology?.description || "",
      entry.createdAt || "",
      entry.updatedAt || "",
      normalizeText(entry.lemma),
    );

    const insertDefinition = db.prepare(`
      INSERT INTO definitions(id, entry_id, position, meaning, example, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    (entry.definitions || []).forEach((definition, definitionIndex) => {
      insertDefinition.run(
        definition.id,
        entry.id,
        definitionIndex,
        definition.meaning || "",
        definition.example || "",
        definition.note || definition.notes || "",
        entry.updatedAt || "",
      );
    });

    const insertTag = db.prepare(`
      INSERT INTO entry_tags(entry_id, position, tag, normalized_tag)
      VALUES (?, ?, ?, ?)
    `);
    (entry.tags || []).forEach((tag, tagIndex) => {
      insertTag.run(entry.id, tagIndex, tag, normalizeText(tag));
    });

    const insertSource = db.prepare(`
      INSERT INTO entry_sources(entry_id, position, source_text, source_key)
      VALUES (?, ?, ?, ?)
    `);
    (entry.etymology?.sources || []).forEach((source, sourceIndex) => {
      insertSource.run(entry.id, sourceIndex, source, normalizeText(source));
    });

    const insertMorphologyTable = db.prepare(`
      INSERT INTO entry_morphology_tables(id, entry_id, position, table_id, title, notes, overrides_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    entryMorphologyInstances(entry).forEach((instance, instanceIndex) => {
      insertMorphologyTable.run(
        instance.id,
        entry.id,
        instanceIndex,
        instance.tableId || "auto",
        instance.title || "",
        instance.notes || "",
        JSON.stringify(instance.overrides || {}),
        instance.createdAt || entry.createdAt || "",
        instance.updatedAt || entry.updatedAt || "",
      );
    });
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
    const entries = this.entriesFromRows(
      db,
      db.prepare(`SELECT ${entrySelectColumns("e")} FROM entries e ORDER BY e.position ASC, e.lemma ASC, e.id ASC`).all(),
    );
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
        DELETE FROM entry_morphology_tables;
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
        INSERT INTO entries(id, position, lemma, pronunciation, notes, etymology_description, created_at, updated_at, sort_key)
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
      const insertMorphologyTable = db.prepare(`
        INSERT INTO entry_morphology_tables(id, entry_id, position, table_id, title, notes, overrides_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      (dictionary.entries || []).forEach((entry, entryIndex) => {
        insertEntry.run(
          entry.id,
          entryIndex,
          entry.lemma || "",
          entry.pronunciation || "",
          entry.notes || "",
          entry.etymology?.description || "",
          entry.createdAt || "",
          entry.updatedAt || "",
          normalizeText(entry.lemma),
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
        entryMorphologyInstances(entry).forEach((instance, instanceIndex) => {
          insertMorphologyTable.run(
            instance.id,
            entry.id,
            instanceIndex,
            instance.tableId || "auto",
            instance.title || "",
            instance.notes || "",
            JSON.stringify(instance.overrides || {}),
            instance.createdAt || entry.createdAt || "",
            instance.updatedAt || entry.updatedAt || dictionary.updatedAt || now,
          );
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
        dictionaries.push(this.dictionaryMetadataFromDatabase(id));
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
  etymology_description TEXT,
  created_at TEXT,
  updated_at TEXT,
  sort_key TEXT
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

CREATE TABLE IF NOT EXISTS entry_morphology_tables (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  table_id TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  overrides_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_lemma ON entries(lemma);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);
CREATE INDEX IF NOT EXISTS idx_entry_tags_normalized_tag ON entry_tags(normalized_tag);
CREATE INDEX IF NOT EXISTS idx_entry_sources_source_key ON entry_sources(source_key);
CREATE INDEX IF NOT EXISTS idx_definitions_entry_id ON definitions(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_morphology_tables_entry_id ON entry_morphology_tables(entry_id);
`;

module.exports = {
  SQLITE_SCHEMA_VERSION,
  SQLITE_SCHEMA,
  SqliteDictionaryRepository,
};
