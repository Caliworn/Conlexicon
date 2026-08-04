const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { apiError } = require("./api-error");
const {
  morphologyCellSourceText,
  morphologyOverrideRows,
  morphologySearchValueRecords,
  normalizeEntryMorphologyState,
  normalizeMorphology,
  validateCanonicalEntryMorphology,
  validateMorphologyFunctionUsage,
  validateMorphologyReferenceSyntax,
} = require("./morphology-model");
const { planMorphologyWrite } = require("./morphology-write-plan");
const { buildDisplayIdentityIndex, displayTag, entryParts } = require("./tag-model");
const {
  ENTRY_SEARCH_FIELD_KEYS,
  STATIC_ENTRY_SEARCH_FIELDS,
  entrySearchValueRecords,
  normalizedTextMatches,
  normalizeFuzzyFields,
  normalizeSearchFields,
  searchSettingsQueryOptions,
} = require("./entry-search-model");
const {
  normalizeSearchText,
  normalizeStructuralKey,
} = require("./search-normalization-model");
const {
  buildOrthographyDistribution,
  orthographyMatches,
} = require("./orthography-model");
const {
  EntryQueryValidationError,
  normalizeEntryFilterFactsRequest,
  normalizeEntryQuery,
} = require("./entry-query-model");
const {
  AnalysisQueryValidationError,
  buildAnalysisWidgets,
  normalizeAnalysisQuery,
  planAnalysisQuery,
} = require("./analysis-query-model");
const {
  QuerySessionCache,
  createQueryDescriptor,
  queryDescriptorKey,
} = require("./query-session-cache");
const { RootTopologyCache } = require("./root-topology-cache");

const ENTRY_PATCH_ALLOWED_FIELDS = new Set(["pronunciation", "tags"]);
const ROOT_GROUP_QUERY_LIMIT_DEFAULT = 100;
const ROOT_GROUP_QUERY_LIMIT_MAX = 100;
const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";
const SQLITE_FUZZY_MATCH_FUNCTION = "conlexicon_fuzzy_match";
const SQLITE_ORTHOGRAPHY_MATCH_FUNCTION = "conlexicon_orthography_match";
const ANALYSIS_FEATURE_ENTRY_RECORDS_SQL = `
  SELECT id, lemma, pronunciation
  FROM entries
  WHERE TRIM(COALESCE(pronunciation, '')) <> ''
  ORDER BY position ASC, id ASC
`;
const ENTRY_SEARCH_FIELD_BITS = new Map(
  ENTRY_SEARCH_FIELD_KEYS.map((field, index) => [field, 2 ** index]),
);

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
    // Keep the import lazy so unsupported runtimes receive a structured startup error.
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

function registerSqliteFunctions(db) {
  db.function(SQLITE_FUZZY_MATCH_FUNCTION, { deterministic: true }, (normalizedValue, normalizedQuery) => (
    normalizedTextMatches(
      String(normalizedValue || ""),
      String(normalizedQuery || ""),
      true,
    ) ? 1 : 0
  ));
  db.function(SQLITE_ORTHOGRAPHY_MATCH_FUNCTION, { deterministic: true }, (lemma, category, value) => (
    orthographyMatches(String(lemma || ""), {
      category: String(category || ""),
      value: String(value ?? ""),
    }) ? 1 : 0
  ));
}

const normalizeText = normalizeSearchText;

function orderedStringsEqual(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeQueryWindowOffset(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (!/^\d+$/.test(String(value))) {
    throw apiError("Invalid query window offset", 400, "invalid_query_window_offset");
  }
  const offset = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(offset)) {
    throw apiError("Invalid query window offset", 400, "invalid_query_window_offset");
  }
  return offset;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function morphologyModuleBlob(morphology = {}) {
  const { tables: _tables, templateGroups: _templateGroups, ...rest } = morphology || {};
  return rest;
}

function searchNormalizationSettings(settings = {}) {
  return searchSettingsQueryOptions(settings.search).normalization;
}

function searchNormalizationSettingsKey(settings = {}) {
  return JSON.stringify(searchNormalizationSettings(settings));
}

function staticSearchProjectionSettingsKey(settings = {}) {
  return JSON.stringify({
    normalization: searchNormalizationSettings(settings),
    tagDisplayMap: settings.tagDisplayMap || {},
  });
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
    ${prefix}morphology_mode AS morphologyMode,
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

function definitionPreviews(entry = {}) {
  return (entry.definitions || []).map((definition, index) => ({
    id: definition.id || "",
    position: Number.isInteger(definition.position) ? definition.position : index,
    meaning: definition.meaning || "",
  }));
}

function entrySummary(entry = {}, dictionary = {}) {
  const parts = entryParts(entry, dictionary);
  return {
    id: entry.id,
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    definitionPreviews: definitionPreviews(entry),
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
    partOfSpeech: parts[0] || "",
    parts,
  };
}

function compareEntryValues(a, b, sort = "lemmaAsc") {
  const lemmaCompare = String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
  const idCompare = String(a.id || "").localeCompare(String(b.id || ""));
  const dateCompare = (left, right, direction = 1) => {
    const diff = new Date(left || 0).getTime() - new Date(right || 0).getTime();
    return (diff * direction) || (lemmaCompare * direction) || idCompare;
  };
  if (sort === "lemmaDesc") {
    return -lemmaCompare || idCompare;
  }
  if (sort === "updatedAsc") {
    return dateCompare(a.updatedAt, b.updatedAt);
  }
  if (sort === "updatedDesc") {
    return dateCompare(a.updatedAt, b.updatedAt, -1);
  }
  if (sort === "createdAsc") {
    return dateCompare(a.createdAt, b.createdAt);
  }
  if (sort === "createdDesc") {
    return dateCompare(a.createdAt, b.createdAt, -1);
  }
  return lemmaCompare || idCompare;
}

function normalizeRepositoryEntryQuery(query = {}) {
  try {
    return normalizeEntryQuery(query);
  } catch (error) {
    if (error instanceof EntryQueryValidationError) {
      throw apiError(error.message, 400, error.code || "invalid_entry_query", error.details);
    }
    throw error;
  }
}

function normalizeRepositoryEntryFilterFactsRequest(request = {}) {
  try {
    return normalizeEntryFilterFactsRequest(request);
  } catch (error) {
    if (error instanceof EntryQueryValidationError) {
      throw apiError(error.message, 400, error.code || "invalid_entry_filter_facts_request", error.details);
    }
    throw error;
  }
}

function normalizeRepositoryAnalysisQuery(query = {}) {
  try {
    return normalizeAnalysisQuery(query);
  } catch (error) {
    if (error instanceof AnalysisQueryValidationError) {
      throw apiError(error.message, 400, error.code || "invalid_analysis_query", error.details);
    }
    throw error;
  }
}

function normalizeRootGroupQuery(query = {}) {
  const rawLimit = query.limit;
  const hasLimit = rawLimit !== undefined && rawLimit !== null && rawLimit !== "";
  const limit = !hasLimit
    ? ROOT_GROUP_QUERY_LIMIT_DEFAULT
    : Number(rawLimit);
  if (
    hasLimit
    && (
      !/^[1-9]\d*$/.test(String(rawLimit))
      || !Number.isSafeInteger(limit)
      || limit > ROOT_GROUP_QUERY_LIMIT_MAX
    )
  ) {
    throw apiError(
      `Root group query limit must be between 1 and ${ROOT_GROUP_QUERY_LIMIT_MAX}`,
      400,
      "invalid_root_group_query_limit",
      { value: rawLimit, maxLimit: ROOT_GROUP_QUERY_LIMIT_MAX },
    );
  }
  return {
    q: String(query.q || query.query || "").trim(),
    sort: ["lemmaAsc", "lemmaDesc", "updatedAsc", "updatedDesc", "createdAsc", "createdDesc"].includes(query.sort)
      ? query.sort
      : "lemmaAsc",
    searchFields: normalizeSearchFields(query.fields || query.searchFields),
    fuzzyFields: normalizeFuzzyFields(query.fuzzyFields),
    limit,
    cursor: String(query.cursor || ""),
    windowOffset: normalizeQueryWindowOffset(query.windowOffset),
    offset: 0,
  };
}

function normalizeRootGroupEntriesQuery(query = {}) {
  return {
    q: String(query.q || query.query || "").trim(),
    sort: ["lemmaAsc", "lemmaDesc", "updatedAsc", "updatedDesc", "createdAsc", "createdDesc"].includes(query.sort)
      ? query.sort
      : "lemmaAsc",
    searchFields: normalizeSearchFields(query.fields || query.searchFields),
    fuzzyFields: normalizeFuzzyFields(query.fuzzyFields),
  };
}

function sqlPlaceholders(values) {
  return values.map(() => "?").join(", ");
}

function sqlOrderClause(sort = "lemmaAsc", alias = "e") {
  if (sort === "lemmaDesc") {
    return `${alias}.sort_key DESC, ${alias}.lemma DESC, ${alias}.position ASC, ${alias}.id ASC`;
  }
  if (sort === "updatedAsc") {
    return `${alias}.updated_at ASC, ${alias}.sort_key ASC, ${alias}.lemma ASC, ${alias}.position ASC, ${alias}.id ASC`;
  }
  if (sort === "updatedDesc") {
    return `${alias}.updated_at DESC, ${alias}.sort_key DESC, ${alias}.lemma DESC, ${alias}.position ASC, ${alias}.id ASC`;
  }
  if (sort === "createdAsc") {
    return `${alias}.created_at ASC, ${alias}.sort_key ASC, ${alias}.lemma ASC, ${alias}.position ASC, ${alias}.id ASC`;
  }
  if (sort === "createdDesc") {
    return `${alias}.created_at DESC, ${alias}.sort_key DESC, ${alias}.lemma DESC, ${alias}.position ASC, ${alias}.id ASC`;
  }
  return `${alias}.sort_key ASC, ${alias}.lemma ASC, ${alias}.position ASC, ${alias}.id ASC`;
}

function canUseSqlEntryQuery(query) {
  return !query.search.text;
}

function querySearchText(query) {
  return query.search?.text ?? query.q ?? "";
}

function querySearchFields(query) {
  const fields = query.search?.fields ?? query.searchFields ?? query.fields ?? [];
  return fields instanceof Set ? [...fields] : Array.isArray(fields) ? fields : [];
}

function queryFuzzyFields(query) {
  const fields = query.search?.fuzzyFields ?? query.fuzzyFields ?? [];
  return fields instanceof Set ? [...fields] : Array.isArray(fields) ? fields : [];
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

function entityId(value) {
  return String(value || "").trim();
}

function generatedEntityId(value, prefix) {
  return entityId(value) || `${prefix}-${crypto.randomUUID()}`;
}

function entryEntityIdRecords(entry = {}) {
  const records = [];
  const entryId = entityId(entry.id);
  if (entryId) {
    records.push({ id: entryId, type: "entry", scope: "entry", ownerId: entryId });
  }
  (entry.definitions || []).forEach((definition) => {
    const definitionId = entityId(definition.id);
    if (definitionId) {
      records.push({ id: definitionId, type: "definition", scope: "entry", ownerId: entryId });
    }
  });
  return records;
}

function moduleEntityIdRecords(dictionary = {}) {
  const records = [];
  (dictionary.morphology?.templateGroups || []).forEach((group) => {
    records.push({ id: entityId(group.id), type: "morphologyTemplateGroup", scope: "morphology" });
    (group.tables || []).forEach((table) => {
      records.push({ id: entityId(table.id), type: "morphologyTemplateTable", scope: "morphology" });
    });
  });
  (dictionary.corpus?.blocks || []).forEach((block) => {
    records.push({ id: entityId(block.id), type: "corpusBlock", scope: "corpus" });
    (block.layers || []).forEach((layer) => {
      records.push({ id: entityId(layer.id), type: "corpusLayer", scope: "corpus" });
    });
  });
  (dictionary.corpus?.units || []).forEach((unit) => {
    records.push({ id: entityId(unit.id), type: "corpusUnit", scope: "corpus" });
  });
  return records.filter((record) => record.id);
}

function scopedDuplicateDetails(savedRecords, existingRecords = []) {
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
    .map(([id, records]) => ({
      id,
      types: [...new Set(records.map((record) => record.type))],
    }));
}

function duplicateDetailsMessage(duplicates) {
  return duplicates.map(({ id, types }) => `${id} (${types.join(", ")})`).join("; ");
}

function assertSavedEntryEntityIds(savedEntry, existingRecords) {
  const savedRecords = entryEntityIdRecords(savedEntry).map((record) => ({ ...record, saved: true }));
  const duplicates = scopedDuplicateDetails(savedRecords, existingRecords);
  if (duplicates.length) {
    throw apiError(`Duplicate dictionary entity IDs in saved scope: ${duplicateDetailsMessage(duplicates)}`, 409, "duplicate_entity_ids_scoped", {
      duplicates,
    });
  }
}

function assertSavedModuleEntityIds(moduleRecords, existingRecords) {
  const savedRecords = moduleRecords.map((record) => ({ ...record, saved: true }));
  const duplicates = scopedDuplicateDetails(savedRecords, existingRecords);
  if (duplicates.length) {
    throw apiError(`Duplicate dictionary entity IDs in saved scope: ${duplicateDetailsMessage(duplicates)}`, 409, "duplicate_entity_ids_scoped", {
      duplicates,
    });
  }
}

function prefillEntryEntityIds(entry = {}) {
  const nextEntry = {
    ...entry,
    id: generatedEntityId(entry.id, "entry"),
  };
  nextEntry.definitions = Array.isArray(entry.definitions)
    ? entry.definitions.map((definition) => ({
      ...definition,
      id: generatedEntityId(definition.id, "def"),
    }))
    : [];
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
    querySessionCache,
    querySessionCacheOptions,
    rootTopologyCache,
    rootTopologyCacheOptions,
    queryProcessEpoch,
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
    this.querySessionCache = querySessionCache || new QuerySessionCache(querySessionCacheOptions);
    this.rootTopologyCache = rootTopologyCache || new RootTopologyCache(rootTopologyCacheOptions);
    this.entryFilterFactsCache = new Map();
    this.tagIdentitySnapshotCache = new Map();
    this.queryProcessEpoch = String(queryProcessEpoch || crypto.randomUUID());
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
      INSERT INTO dictionary_meta(id, name, language, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        language = excluded.language,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(
      id,
      String(metadata.name || ""),
      String(metadata.language || ""),
      String(metadata.description || ""),
      metadata.createdAt || now,
      metadata.updatedAt || now,
    );
    this.invalidateQuerySessions(id);
    return {
      id,
      path: this.dictionaryPath(id),
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
    this.invalidateDictionaryCaches(normalized.id);
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
    await this.requireDictionary(id);
    return this.dictionaryMetadataFromDatabase(id);
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

  dictionaryQueryContext(id) {
    const db = this.openDictionaryDatabase(id);
    const meta = db.prepare(`
      SELECT id, name, language, description, created_at AS createdAt, updated_at AS updatedAt
      FROM dictionary_meta
      WHERE id = ?
    `).get(id);
    if (!meta) {
      throw apiError("Dictionary not found", 404, "dictionary_not_found");
    }
    const settingsRow = db.prepare(`
      SELECT value_json AS valueJson
      FROM module_blobs
      WHERE module = 'settings'
    `).get();
    return {
      id: meta.id,
      name: meta.name,
      language: meta.language || "",
      description: meta.description || "",
      settings: parseJson(settingsRow?.valueJson || "{}", {}),
      createdAt: meta.createdAt || "",
      updatedAt: meta.updatedAt || "",
      entries: [],
    };
  }

  invalidateQuerySessions(id) {
    this.querySessionCache.invalidateDictionary(id);
    this.entryFilterFactsCache.delete(String(id || ""));
    this.tagIdentitySnapshotCache.delete(String(id || ""));
  }

  invalidateRootTopology(id) {
    this.rootTopologyCache.invalidateDictionary(id);
  }

  invalidateDictionaryCaches(id) {
    this.invalidateQuerySessions(id);
    this.invalidateRootTopology(id);
  }

  refreshRootTopologyEntryRecords(id, db, entryIds = []) {
    const uniqueIds = [...new Set(entryIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return false;
    }
    const records = [];
    chunkArray(uniqueIds).forEach((entryIdChunk) => {
      records.push(...db.prepare(`
        SELECT id, lemma, sort_key AS sortKey, position,
          created_at AS createdAt, updated_at AS updatedAt
        FROM entries
        WHERE id IN (${sqlPlaceholders(entryIdChunk)})
      `).all(...entryIdChunk));
    });
    return this.rootTopologyCache.updateEntryRecords(id, records);
  }

  querySessionCacheStats() {
    return {
      ...this.querySessionCache.stats(),
      rootTopology: this.rootTopologyCache.stats(),
    };
  }

  querySessionGeneration(id) {
    return this.querySessionCache.generation(id);
  }

  analysisFeatureEntryRecords(id) {
    const db = this.openDictionaryDatabase(id);
    return db.prepare(ANALYSIS_FEATURE_ENTRY_RECORDS_SQL).all();
  }

  ipaDistributionFeatureInput(id) {
    const db = this.openDictionaryDatabase(id);
    return {
      dictionaryEntryCount: Number(
        db.prepare("SELECT COUNT(*) AS entryCount FROM entries").get()?.entryCount || 0,
      ),
      records: db.prepare(ANALYSIS_FEATURE_ENTRY_RECORDS_SQL).all(),
    };
  }

  morphologyAnalysisFeatureInput(id) {
    const db = this.openDictionaryDatabase(id);
    const templateGroups = this.morphologyTemplateGroupsFromDatabase(db, { includeCells: false });
    const entries = db.prepare(`
      SELECT id, lemma, morphology_mode AS morphologyMode
      FROM entries
      ORDER BY position ASC, id ASC
    `).all().map((row) => ({
      id: row.id,
      lemma: row.lemma || "",
      tags: [],
      morphologyMode: row.morphologyMode,
      morphologyGroups: [],
    }));
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const groupsByEntryAndTemplate = new Map();

    db.prepare(`
      SELECT entry_id AS entryId, tag
      FROM entry_tags
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      entriesById.get(row.entryId)?.tags.push(row.tag || "");
    });
    db.prepare(`
      SELECT entry_id AS entryId, template_group_id AS templateGroupId
      FROM entry_morphology_groups
      ORDER BY entry_id ASC, position ASC, template_group_id ASC
    `).all().forEach((row) => {
      const entry = entriesById.get(row.entryId);
      if (!entry) {
        return;
      }
      const group = {
        templateGroupId: row.templateGroupId,
        overrides: {},
      };
      entry.morphologyGroups.push(group);
      groupsByEntryAndTemplate.set(`${row.entryId}\u0000${row.templateGroupId}`, group);
    });
    db.prepare(`
      SELECT entry_id AS entryId, template_group_id AS templateGroupId, template_table_id AS tableId,
        row_index AS rowIndex, column_index AS columnIndex, value
      FROM entry_morphology_cell_overrides
      ORDER BY entry_id ASC, template_group_id ASC, template_table_id ASC, row_index ASC, column_index ASC
    `).all().forEach((row) => {
      const group = groupsByEntryAndTemplate.get(`${row.entryId}\u0000${row.templateGroupId}`);
      if (!group) {
        return;
      }
      if (!group.overrides[row.tableId]) {
        group.overrides[row.tableId] = {};
      }
      group.overrides[row.tableId][`${row.rowIndex},${row.columnIndex}`] = row.value || "";
    });

    return {
      dictionary: {
        id,
        morphology: { templateGroups },
      },
      entries,
    };
  }

  orderedAnalysisFeatureEntryIds(id, candidateIds, query) {
    const db = this.openDictionaryDatabase(id);
    const candidates = candidateIds instanceof Set ? candidateIds : new Set(candidateIds || []);
    if (!candidates.size) {
      return {
        orderedIds: [],
        searchSummary: querySearchText(query)
          ? this.entrySearchSummary(query, [], 0)
          : null,
      };
    }
    if (querySearchText(query)) {
      const matches = this.entrySearchProjectionMatches(db, query);
      const rows = matches.rows.filter((row) => candidates.has(row.id));
      const orderedIds = [...new Set(rows.map((row) => row.id))];
      return {
        orderedIds,
        searchSummary: this.entrySearchSummary(query, rows, orderedIds.length),
      };
    }
    const orderedIds = db.prepare(`
          SELECT e.id
          FROM entries e
          ORDER BY ${sqlOrderClause(query.sort, "e")}
        `).all().map((row) => row.id).filter((entryId) => candidates.has(entryId));
    return { orderedIds, searchSummary: null };
  }

  analysisFeatureEntrySummaries(id, entryIds, query, dictionary = this.dictionaryQueryContext(id)) {
    const db = this.openDictionaryDatabase(id);
    const rows = this.entryRowsByIds(db, entryIds);
    const summaries = this.entrySummariesFromRows(db, rows, dictionary);
    if (!querySearchText(query)) {
      return summaries;
    }
    const hitsByEntry = this.entrySearchHitsFromDatabase(db, rows.map((row) => row.id), query);
    return summaries.map((entry) => ({
      ...entry,
      searchHits: hitsByEntry.get(entry.id) || [],
    }));
  }

  async currentQuerySession(options) {
    while (true) {
      const session = await this.querySessionCache.getOrCreate(options);
      if (session.cacheGeneration === this.querySessionCache.generation(options.dictionaryId)) {
        return session;
      }
    }
  }

  queryCursorDescriptor(kind, dictionaryId, dictionaryUpdatedAt, query) {
    return createQueryDescriptor({
      kind,
      dictionaryId,
      dictionaryUpdatedAt,
      cacheGeneration: this.querySessionCache.generation(dictionaryId),
      query,
    });
  }

  queryCursorDigest(kind, dictionaryId, dictionaryUpdatedAt, query) {
    return crypto
      .createHash("sha256")
      .update(queryDescriptorKey(this.queryCursorDescriptor(kind, dictionaryId, dictionaryUpdatedAt, query)))
      .digest("base64url");
  }

  prepareQueryCursor(kind, dictionaryId, dictionaryUpdatedAt, query) {
    const cacheGeneration = this.querySessionCache.generation(dictionaryId);
    const descriptorDigest = this.queryCursorDigest(kind, dictionaryId, dictionaryUpdatedAt, query);
    const page = kind === "entries" ? query.page : query;
    query.cursorContext = {
      processEpoch: this.queryProcessEpoch,
      cacheGeneration,
      descriptorDigest,
    };
    if (!page.cursor) {
      if ((page.windowOffset || 0) > 0) {
        throw apiError("A versioned cursor is required for a non-zero query window", 400, "query_cursor_required");
      }
      page.offset = 0;
      return query;
    }

    let payload = null;
    try {
      payload = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8"));
    } catch {
      payload = null;
    }
    const offset = Number.parseInt(payload?.offset, 10);
    const staleReason = !payload || payload.version !== 1 || !Number.isSafeInteger(offset) || offset < 0
      ? "invalid"
      : payload.processEpoch !== this.queryProcessEpoch
        ? "process_epoch"
        : Number(payload.cacheGeneration) !== cacheGeneration
          ? "cache_generation"
          : payload.descriptorDigest !== descriptorDigest
            ? "descriptor"
            : "";
    if (staleReason) {
      throw apiError("Query cursor is stale", 409, "query_cursor_stale", { reason: staleReason });
    }
    page.offset = page.windowOffset === null ? offset : page.windowOffset;
    return query;
  }

  encodeQueryCursor(query, offset) {
    if (!query.cursorContext || !(offset >= 0)) {
      return "";
    }
    return Buffer.from(JSON.stringify({
      version: 1,
      processEpoch: query.cursorContext.processEpoch,
      cacheGeneration: query.cursorContext.cacheGeneration,
      descriptorDigest: query.cursorContext.descriptorDigest,
      offset,
    }), "utf8").toString("base64url");
  }

  dictionarySummaryFromDatabase(db) {
    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM entries) AS entryCount,
        (SELECT COUNT(DISTINCT entry_id) FROM entry_sources) AS derivedCount
    `).get() || {};
    const entryCount = Number(row.entryCount || 0);
    const derivedCount = Number(row.derivedCount || 0);
    return {
      entryCount,
      rootCount: Math.max(0, entryCount - derivedCount),
    };
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
    this.invalidateQuerySessions(id);
    return {
      id,
      name: normalized.name,
      language: normalized.language,
      description: normalized.description,
      createdAt: baseDictionary.createdAt || "",
      updatedAt: now,
    };
  }

  async updateSettings(id, settings) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryForRuntimeSave({
      ...baseDictionary,
      settings: mergeOtherSettings(baseDictionary.settings, settings),
      updatedAt: now,
    });
    const rebuildStaticSearchProjection = staticSearchProjectionSettingsKey(baseDictionary.settings)
      !== staticSearchProjectionSettingsKey(normalized.settings);
    const rebuildMorphologySearchProjection = searchNormalizationSettingsKey(baseDictionary.settings)
      !== searchNormalizationSettingsKey(normalized.settings);
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "settings", normalized.settings, now);
      if (rebuildStaticSearchProjection) {
        this.rebuildEntrySearchProjection(db, { ...baseDictionary, settings: normalized.settings });
      }
      if (rebuildMorphologySearchProjection) {
        this.rebuildEntryMorphologySearchProjection(db, { ...baseDictionary, settings: normalized.settings });
      }
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
      this.invalidateQuerySessions(id);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      id,
      updatedAt: now,
      settings: normalized.settings,
    };
  }

  async updateIpaSettings(id, ipa) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryForRuntimeSave({
      ...baseDictionary,
      settings: {
        ...(baseDictionary.settings || {}),
        ipa,
      },
      updatedAt: now,
    });
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "settings", normalized.settings, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
      this.invalidateQuerySessions(id);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      id,
      updatedAt: now,
      settings: normalized.settings,
    };
  }

  async saveDocs(id, docs) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryForRuntimeSave({
      ...baseDictionary,
      docs,
      updatedAt: now,
    });
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "docs", normalized.docs, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
      this.invalidateQuerySessions(id);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      id,
      updatedAt: now,
      docs: normalized.docs,
    };
  }

  async saveMorphology(id, morphology) {
    await this.requireDictionary(id);
    assertValidMorphology(morphology);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryForRuntimeSave({
      ...baseDictionary,
      morphology,
      updatedAt: now,
    }, { includeMorphology: true });
    const plan = planMorphologyWrite(baseDictionary.morphology, normalized.morphology);
    assertSavedModuleEntityIds(
      moduleEntityIdRecords({ morphology: normalized.morphology }).filter((record) => record.scope === "morphology"),
      this.conflictingEntityIdRecords(db, baseDictionary, moduleEntityIdRecords({ morphology: normalized.morphology }), {
        excludeScope: "morphology",
      }),
    );
    if (plan.referenceValidationNeeded) {
      this.assertMorphologyReferencesRemainValid(db, plan.next);
    }
    if (!plan.hasStorageChanges) {
      return {
        id,
        updatedAt: baseDictionary.updatedAt,
        morphology: this.morphologyFromDatabase(db, morphologyModuleBlob(plan.next)),
      };
    }
    const projectionEntryIds = this.morphologyProjectionEntryIds(db, plan);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (plan.blobChanged) {
        this.writeModuleBlob(db, "morphology", morphologyModuleBlob(plan.next), now);
      }
      this.writeMorphologyPlan(db, plan, now);
      this.writeEntryMorphologySearchProjections(db, projectionEntryIds, {
        ...baseDictionary,
        morphology: plan.next,
      });
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
      this.invalidateQuerySessions(id);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      id,
      updatedAt: now,
      morphology: this.morphologyFromDatabase(db, morphologyModuleBlob(plan.next)),
    };
  }

  async saveCorpusChanges(id, changes) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const normalized = this.normalizeDictionaryForRuntimeSave({
      ...baseDictionary,
      updatedAt: now,
      corpus: {
        ...baseDictionary.corpus,
        ...changes,
      },
    }, { includeCorpus: true });
    assertSavedModuleEntityIds(
      moduleEntityIdRecords({ corpus: normalized.corpus }).filter((record) => record.scope === "corpus"),
      this.conflictingEntityIdRecords(db, baseDictionary, moduleEntityIdRecords({ corpus: normalized.corpus }), {
        excludeScope: "corpus",
      }),
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeModuleBlob(db, "corpus", normalized.corpus, now);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
      this.invalidateQuerySessions(id);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      id,
      updatedAt: now,
      corpus: normalized.corpus,
    };
  }

  async createDictionary(dictionary) {
    const generatedId = !entityId(dictionary.id);
    const source = {
      ...dictionary,
      id: reserveDictionaryId(dictionary.id),
    };
    try {
      return await this.importDictionarySnapshot(source, { overwrite: false });
    } catch (error) {
      if (generatedId && error?.code === "dictionary_id_exists") {
        throw new Error("Server-generated dictionary ID collided with an existing dictionary", { cause: error });
      }
      throw error;
    }
  }

  async importDictionary(dictionary, { overwrite = false, regenerateId = false } = {}) {
    const index = await this.readIndex();
    const source = {
      ...dictionary,
      id: reserveDictionaryId(regenerateId ? "" : dictionary.id),
    };
    if (index.dictionaryIds.includes(source.id) && (regenerateId || !overwrite)) {
      if (regenerateId) {
        throw new Error("Server-regenerated dictionary ID collided with an existing dictionary");
      }
      throw apiError("Dictionary ID already exists; overwrite confirmation required", 409, "dictionary_id_exists");
    }
    try {
      return await this.importDictionarySnapshot(source, { overwrite: !regenerateId && overwrite });
    } catch (error) {
      if (regenerateId && error?.code === "dictionary_id_exists") {
        throw new Error("Server-regenerated dictionary ID collided with an existing dictionary", { cause: error });
      }
      throw error;
    }
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
    const filter = query.filter;

    if (filter.part) {
      const configuredParts = new Set((settings.partOfSpeechTags || []).map(normalizeStructuralKey).filter(Boolean));
      if (filter.part === NO_PART_FILTER_VALUE) {
        if (configuredParts.size) {
          clauses.push(`e.id NOT IN (
            SELECT part_tags.entry_id
            FROM entry_tags part_tags
            WHERE part_tags.tag IN (${sqlPlaceholders([...configuredParts])})
          )`);
          params.push(...configuredParts);
        }
      } else {
        if (!configuredParts.has(filter.part)) {
          clauses.push("0 = 1");
        } else {
          clauses.push(`e.id IN (
            SELECT part_tags.entry_id
            FROM entry_tags part_tags
            WHERE part_tags.tag = ?
          )`);
          params.push(filter.part);
        }
      }
    }

    if (filter.tags.values.length) {
      const tags = filter.tags.values.map(normalizeStructuralKey).filter(Boolean);
      if (filter.tags.mode === "all" || filter.tags.mode === "exact") {
        clauses.push(`e.id IN (
          SELECT filter_tags.entry_id
          FROM entry_tags filter_tags
          WHERE filter_tags.tag IN (${sqlPlaceholders(tags)})
          GROUP BY filter_tags.entry_id
          HAVING COUNT(DISTINCT filter_tags.tag) = ?
        )`);
        params.push(...tags, tags.length);
        if (filter.tags.mode === "exact") {
          clauses.push(`NOT EXISTS (
            SELECT 1
            FROM entry_tags extra_tags
            WHERE extra_tags.entry_id = e.id
              AND extra_tags.tag NOT IN (${sqlPlaceholders(tags)})
          )`);
          params.push(...tags);
        }
      } else if (tags.length) {
        clauses.push(`e.id IN (
          SELECT filter_tags.entry_id
          FROM entry_tags filter_tags
          WHERE filter_tags.tag IN (${sqlPlaceholders(tags)})
        )`);
        params.push(...tags);
      }
    }

    const presenceSql = {
      definition: `EXISTS (
        SELECT 1 FROM definitions presence_definitions
        WHERE presence_definitions.entry_id = e.id
          AND COALESCE(presence_definitions.meaning, '') <> ''
      )`,
      example: `EXISTS (
        SELECT 1 FROM definitions presence_examples
        WHERE presence_examples.entry_id = e.id
          AND COALESCE(presence_examples.example, '') <> ''
      )`,
      entryNote: "COALESCE(e.notes, '') <> ''",
      source: `EXISTS (
        SELECT 1 FROM entry_sources presence_sources
        WHERE presence_sources.entry_id = e.id
      )`,
      ipa: "COALESCE(e.pronunciation, '') <> ''",
      tag: `EXISTS (
        SELECT 1 FROM entry_tags presence_tags
        WHERE presence_tags.entry_id = e.id
      )`,
    };
    filter.presence.forEach(({ field, present }) => {
      const condition = presenceSql[field];
      clauses.push(present ? condition : `NOT (${condition})`);
    });

    if (filter.sourceCount) {
      const countSql = `(SELECT COUNT(*) FROM entry_sources source_count WHERE source_count.entry_id = e.id)`;
      if (filter.sourceCount.max !== null) {
        clauses.push(`${countSql} BETWEEN ? AND ?`);
        params.push(filter.sourceCount.min, filter.sourceCount.max);
      } else {
        clauses.push(`${countSql} >= ?`);
        params.push(filter.sourceCount.min);
      }
    }

    if (filter.tagCount) {
      const countSql = `(SELECT COUNT(*) FROM entry_tags tag_count WHERE tag_count.entry_id = e.id)`;
      if (filter.tagCount.max !== null) {
        clauses.push(`${countSql} BETWEEN ? AND ?`);
        params.push(filter.tagCount.min, filter.tagCount.max);
      } else {
        clauses.push(`${countSql} >= ?`);
        params.push(filter.tagCount.min);
      }
    }

    filter.activityDays.forEach(({ field, day }) => {
      const column = field === "created" ? "e.created_at" : "e.updated_at";
      const dayStart = `${day}T00:00:00.000Z`;
      const nextDayStart = new Date(Date.parse(dayStart) + 24 * 60 * 60 * 1000).toISOString();
      clauses.push(`${column} >= ? AND ${column} < ?`);
      params.push(dayStart, nextDayStart);
    });

    if (filter.orthography) {
      clauses.push(`${SQLITE_ORTHOGRAPHY_MATCH_FUNCTION}(e.lemma, ?, ?) = 1`);
      params.push(filter.orthography.category, filter.orthography.value);
    }

    return { clauses, params };
  }

  entrySummariesFromRows(db, rows = [], dictionary = {}) {
    if (!rows.length) {
      return [];
    }
    const ids = rows.map((row) => row.id).filter(Boolean);
    const definitionsByEntry = new Map();
    const tagsByEntry = new Map();
    const collectRows = (sql, handleRow) => {
      chunkArray(ids).forEach((chunk) => {
        db.prepare(sql(sqlPlaceholders(chunk))).all(...chunk).forEach(handleRow);
      });
    };

    collectRows((placeholders) => `
      SELECT id, entry_id AS entryId, position, meaning
      FROM definitions
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, position ASC
    `, (row) => {
      if (!definitionsByEntry.has(row.entryId)) {
        definitionsByEntry.set(row.entryId, []);
      }
      definitionsByEntry.get(row.entryId).push({
        id: row.id || "",
        position: Number(row.position) || 0,
        meaning: row.meaning || "",
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
      if (row.tag) {
        tagsByEntry.get(row.entryId).push(row.tag);
      }
    });

    return rows.map((row) => entrySummary({
      ...row,
      tags: tagsByEntry.get(row.id) || [],
      definitions: definitionsByEntry.get(row.id) || [],
    }, dictionary));
  }

  entryRowsByIds(db, entryIds = []) {
    const uniqueIds = [...new Set(entryIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return [];
    }
    const rowsById = new Map();
    chunkArray(uniqueIds).forEach((entryIdChunk) => {
      db.prepare(`
        SELECT ${entrySelectColumns("e")}
        FROM entries e
        WHERE e.id IN (${sqlPlaceholders(entryIdChunk)})
      `).all(...entryIdChunk).forEach((row) => rowsById.set(row.id, row));
    });
    return entryIds.map((entryId) => rowsById.get(entryId)).filter(Boolean);
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
    const morphologyGroupsByKey = new Map();

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
      SELECT entry_id AS entryId, position, template_group_id AS templateGroupId, title, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM entry_morphology_groups
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, position ASC
    `, (row) => {
      if (!morphologyByEntry.has(row.entryId)) {
        morphologyByEntry.set(row.entryId, []);
      }
      const group = { ...row, overrides: {} };
      morphologyByEntry.get(row.entryId).push(group);
      morphologyGroupsByKey.set(`${row.entryId}\u0000${row.templateGroupId}`, group);
    });

    collectRows((placeholders) => `
      SELECT entry_id AS entryId, template_group_id AS templateGroupId, template_table_id AS tableId,
        row_index AS rowIndex, column_index AS columnIndex, value
      FROM entry_morphology_cell_overrides
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, template_group_id ASC, template_table_id ASC, row_index ASC, column_index ASC
    `, (row) => {
      const group = morphologyGroupsByKey.get(`${row.entryId}\u0000${row.templateGroupId}`);
      if (!group) {
        return;
      }
      if (!group.overrides[row.tableId]) {
        group.overrides[row.tableId] = {};
      }
      group.overrides[row.tableId][`${row.rowIndex},${row.columnIndex}`] = row.value || "";
    });

    return rows.map((row) => {
      const morphologyInstances = morphologyByEntry.get(row.id) || [];
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
        morphologyMode: row.morphologyMode,
        morphologyGroups: morphologyInstances.map((group) => ({
          templateGroupId: group.templateGroupId,
          title: group.title || "",
          notes: group.notes || "",
          overrides: group.overrides || {},
          createdAt: group.createdAt || "",
          updatedAt: group.updatedAt || "",
        })),
        createdAt: row.createdAt || "",
        updatedAt: row.updatedAt || "",
      };
    });
  }

  entryFromRow(db, row) {
    return row ? this.entriesFromRows(db, [row])[0] || null : null;
  }

  queryEntriesSql(id, query, dictionary = this.dictionaryQueryContext(id), options = {}) {
    const db = this.openDictionaryDatabase(id);
    const { clauses, params } = this.entryQueryWhereClauses(db, dictionary, query);
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = Number.isSafeInteger(options.total) && options.total >= 0
      ? options.total
      : Number(db.prepare(`SELECT COUNT(*) AS total FROM entries e ${whereSql}`).get(...params)?.total || 0);
    const rows = db.prepare(`
      SELECT ${entrySelectColumns("e")}
      FROM entries e
      ${whereSql}
      ORDER BY ${sqlOrderClause(query.sort, "e")}
      LIMIT ? OFFSET ?
    `).all(...params, query.page.limit, query.page.offset);
    const page = this.entrySummariesFromRows(db, rows, dictionary);
    const nextOffset = query.page.offset + page.length;
    const hasMore = nextOffset < total;
    return {
      items: page,
      searchSummary: null,
      pageInfo: {
        nextCursor: hasMore ? this.encodeQueryCursor(query, nextOffset) : "",
        windowCursor: this.encodeQueryCursor(query, 0),
        hasMore,
        total,
      },
    };
  }

  forEachEntrySearchProjectionRecord(db, entryIds, query, callback) {
    const searchFields = querySearchFields(query);
    const fields = searchFields.filter((field) => STATIC_ENTRY_SEARCH_FIELDS.has(field));
    chunkArray(entryIds, 5000).forEach((entryIdChunk) => {
      if (fields.length) {
        db.prepare(`
          SELECT entry_id AS entryId, field, source_type AS sourceType, source_id AS sourceId,
            source_position AS sourcePosition, value_type AS valueType,
            raw_value AS value, normalized_value AS normalizedValue
          FROM entry_search_values
          WHERE entry_id IN (${sqlPlaceholders(entryIdChunk)})
            AND field IN (${sqlPlaceholders(fields)})
          ORDER BY entry_id ASC, field ASC, source_position ASC, value_type ASC
        `).all(...entryIdChunk, ...fields).forEach(callback);
      }
      if (searchFields.includes("morphology")) {
        db.prepare(`
          SELECT entry_id AS entryId, position AS sourcePosition,
            template_table_id AS sourceId, raw_value AS value,
            normalized_value AS normalizedValue
          FROM entry_morphology_search_values
          WHERE entry_id IN (${sqlPlaceholders(entryIdChunk)})
          ORDER BY entry_id ASC, position ASC
        `).all(...entryIdChunk).forEach((row) => callback({
          ...row,
          field: "morphology",
          sourceType: "morphology",
          valueType: "generated",
        }));
      }
    });
  }

  entrySearchProjectionMatchSql(query, structural = { clauses: [], params: [] }, options = {}) {
    const searchText = querySearchText(query);
    const searchFields = querySearchFields(query);
    const fuzzyFields = queryFuzzyFields(query);
    const staticFields = searchFields.filter((field) => STATIC_ENTRY_SEARCH_FIELDS.has(field));
    const fuzzyStaticFields = staticFields.filter((field) => fuzzyFields.includes(field));
    const strictStaticFields = staticFields.filter((field) => !fuzzyFields.includes(field));
    const hasStructuralFilter = structural.clauses.length > 0;
    const matchQueries = [];
    const matchParams = [];
    const select = options.distinct === false ? "SELECT" : "SELECT DISTINCT";

    const staticClauses = [];
    if (fuzzyStaticFields.length) {
      staticClauses.push(`(
        search_value.field IN (${sqlPlaceholders(fuzzyStaticFields)})
        AND ${SQLITE_FUZZY_MATCH_FUNCTION}(search_value.normalized_value, ?) = 1
      )`);
      matchParams.push(...fuzzyStaticFields, searchText);
    }
    if (strictStaticFields.length) {
      staticClauses.push(`(
        search_value.field IN (${sqlPlaceholders(strictStaticFields)})
        AND instr(search_value.normalized_value, ?) > 0
      )`);
      matchParams.push(...strictStaticFields, searchText);
    }
    if (staticClauses.length) {
      matchQueries.push(`
        ${select} search_value.entry_id AS entry_id, search_value.field AS field
        FROM ${hasStructuralFilter ? "candidates CROSS JOIN " : ""}entry_search_values search_value
        WHERE ${hasStructuralFilter ? "search_value.entry_id = candidates.id AND " : ""}(${staticClauses.join(" OR ")})
      `);
    }

    if (searchFields.includes("morphology")) {
      const morphologyMatch = fuzzyFields.includes("morphology")
        ? `${SQLITE_FUZZY_MATCH_FUNCTION}(morphology_search_value.normalized_value, ?) = 1`
        : "instr(morphology_search_value.normalized_value, ?) > 0";
      matchQueries.push(`
        ${select} morphology_search_value.entry_id AS entry_id, 'morphology' AS field
        FROM ${hasStructuralFilter ? "candidates CROSS JOIN " : ""}entry_morphology_search_values morphology_search_value
        WHERE ${hasStructuralFilter ? "morphology_search_value.entry_id = candidates.id AND " : ""}${morphologyMatch}
      `);
      matchParams.push(searchText);
    }

    const candidateCte = hasStructuralFilter
      ? `candidates AS MATERIALIZED (
        SELECT e.id
        FROM entries e
        WHERE ${structural.clauses.join(" AND ")}
      ),`
      : "";
    return {
      candidateCte,
      matchQueries,
      params: [...(hasStructuralFilter ? structural.params : []), ...matchParams],
    };
  }

  entrySearchSummary(query, rows, matchedEntryCount) {
    const counts = new Map();
    querySearchFields(query).forEach((field) => {
      const bit = ENTRY_SEARCH_FIELD_BITS.get(field) || 0;
      counts.set(field, rows.reduce((
        matchingEntryCount,
        row,
      ) => matchingEntryCount + ((row.fieldMask & bit) ? 1 : 0), 0));
    });
    const fuzzyFields = new Set(queryFuzzyFields(query));
    return {
      matchedEntryCount,
      fields: querySearchFields(query).map((field) => ({
        field,
        matching: fuzzyFields.has(field) ? "fuzzy" : "strict",
        entryCount: counts.get(field) || 0,
      })),
    };
  }

  entrySearchProjectionMatches(db, query, options = {}) {
    const structural = options.structural || { clauses: [], params: [] };
    const match = this.entrySearchProjectionMatchSql(query, structural);
    if (!match.matchQueries.length) {
      return {
        rows: [],
        orderedIds: [],
        searchSummary: this.entrySearchSummary(query, [], 0),
      };
    }
    const fieldMaskSql = ENTRY_SEARCH_FIELD_KEYS
      .map((field) => `WHEN '${field}' THEN ${ENTRY_SEARCH_FIELD_BITS.get(field)}`)
      .join(" ");
    const resultSql = options.ordered === false
      ? "SELECT entry_id AS id, field_mask AS fieldMask FROM matched_entries ORDER BY entry_id ASC"
      : `SELECT matched_entries.entry_id AS id, matched_entries.field_mask AS fieldMask
        FROM matched_entries
        JOIN entries e ON e.id = matched_entries.entry_id
        ORDER BY ${sqlOrderClause(query.sort, "e")}`;
    const rows = db.prepare(`
      WITH ${match.candidateCte} matched_values AS (
        ${match.matchQueries.join(" UNION ")}
      ), matched_entries AS (
        SELECT entry_id,
          SUM(CASE field ${fieldMaskSql} ELSE 0 END) AS field_mask
        FROM matched_values
        GROUP BY entry_id
      )
      ${resultSql}
    `).all(...match.params);
    const orderedIds = [...new Set(rows.map((row) => row.id))];
    return {
      rows,
      orderedIds,
      searchSummary: this.entrySearchSummary(query, rows, orderedIds.length),
    };
  }

  entrySearchHitsFromDatabase(db, entryIds, query) {
    const searchText = querySearchText(query);
    const fuzzyFields = queryFuzzyFields(query);
    const hitsByEntry = new Map();
    this.forEachEntrySearchProjectionRecord(db, entryIds, query, (record) => {
      if (!normalizedTextMatches(
        record.normalizedValue || "",
        searchText,
        fuzzyFields.includes(record.field),
      )) {
        return;
      }
      if (!hitsByEntry.has(record.entryId)) {
        hitsByEntry.set(record.entryId, []);
      }
      hitsByEntry.get(record.entryId).push({
        field: record.field,
        value: record.value || "",
        sourceType: record.sourceType,
        sourceId: record.sourceId || "",
        sourcePosition: record.sourcePosition,
        valueType: record.valueType,
      });
    });
    return hitsByEntry;
  }

  buildEntrySearchQuerySession(id, query, dictionary) {
    const db = this.openDictionaryDatabase(id);
    const structural = this.entryQueryWhereClauses(db, dictionary, query);
    const matches = this.entrySearchProjectionMatches(db, query, { structural });
    const orderedIds = matches.orderedIds;
    return {
      orderedIds,
      entryIndexById: new Map(orderedIds.map((entryId, index) => [entryId, index])),
      searchSummary: matches.searchSummary,
    };
  }

  entrySearchQuerySession(id, query, dictionary) {
    return this.currentQuerySession({
      kind: "entries",
      dictionaryId: id,
      dictionaryUpdatedAt: dictionary.updatedAt,
      query,
      build: () => this.buildEntrySearchQuerySession(id, query, dictionary),
    });
  }

  async queryEntriesSearchSession(id, query, dictionary = this.dictionaryQueryContext(id)) {
    const db = this.openDictionaryDatabase(id);
    const session = await this.entrySearchQuerySession(id, query, dictionary);
    const pageIds = session.orderedIds.slice(query.page.offset, query.page.offset + query.page.limit);
    const pageRows = this.entryRowsByIds(db, pageIds);
    const page = this.entrySummariesFromRows(db, pageRows, dictionary);
    const hitsByEntry = this.entrySearchHitsFromDatabase(db, pageRows.map((row) => row.id), query);
    const items = page.map((entry) => ({
      ...entry,
      searchHits: hitsByEntry.get(entry.id) || [],
    }));
    const nextOffset = query.page.offset + pageRows.length;
    const hasMore = nextOffset < session.orderedIds.length;
    return {
      items,
      searchSummary: session.searchSummary,
      pageInfo: {
        nextCursor: hasMore ? this.encodeQueryCursor(query, nextOffset) : "",
        windowCursor: this.encodeQueryCursor(query, 0),
        hasMore,
        total: session.orderedIds.length,
      },
    };
  }

  async queryEntries(id, query = {}) {
    await this.requireDictionary(id);
    const normalizedQuery = normalizeRepositoryEntryQuery(query);
    const dictionary = this.dictionaryQueryContext(id);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    normalizedQuery.search.rawText = normalizedQuery.search.text;
    normalizedQuery.search.text = searchRuntime.normalizeText(normalizedQuery.search.text);
    this.prepareQueryCursor("entries", id, dictionary.updatedAt, normalizedQuery);
    if (canUseSqlEntryQuery(normalizedQuery)) {
      return this.queryEntriesSql(id, normalizedQuery, dictionary);
    }
    return this.queryEntriesSearchSession(id, normalizedQuery, dictionary);
  }

  async getEntryFilterFacts(id, source = {}) {
    const request = normalizeRepositoryEntryFilterFactsRequest(source);
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const dictionary = this.dictionaryQueryContext(id);
    const generation = this.querySessionCache.generation(id);
    const normalizedId = String(id || "");
    const existingCache = this.entryFilterFactsCache.get(normalizedId);
    const factsCache = existingCache?.generation === generation
      ? existingCache.facts
      : new Map();
    if (factsCache !== existingCache?.facts) {
      this.entryFilterFactsCache.set(normalizedId, { generation, facts: factsCache });
    }
    const factEntries = [];

    request.filters.forEach((item) => {
      const identity = JSON.stringify(item.filter);
      let available = factsCache.get(identity);
      if (available === undefined) {
        const structural = this.entryQueryWhereClauses(db, dictionary, {
          filter: item.filter,
          search: { text: "", fields: [], fuzzyFields: [] },
        });
        const whereSql = structural.clauses.length ? `WHERE ${structural.clauses.join(" AND ")}` : "";
        available = Boolean(db.prepare(`
          SELECT EXISTS(
            SELECT 1 FROM entries e ${whereSql} LIMIT 1
          ) AS available
        `).get(...structural.params)?.available);
        factsCache.set(identity, available);
        if (factsCache.size > 128) {
          factsCache.delete(factsCache.keys().next().value);
        }
      }
      factEntries.push([item.id, { available }]);
    });

    return {
      dictionaryId: id,
      generation,
      facts: Object.fromEntries(factEntries),
    };
  }

  entrySqlQueryLocation(db, dictionary, query, entryId) {
    const { clauses, params } = this.entryQueryWhereClauses(db, dictionary, query);
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const row = db.prepare(`
      WITH ranked AS (
        SELECT e.id,
          ROW_NUMBER() OVER (ORDER BY ${sqlOrderClause(query.sort, "e")}) - 1 AS result_index
        FROM entries e
        ${whereSql}
      )
      SELECT COUNT(*) AS total,
        MAX(CASE WHEN id = ? THEN result_index END) AS resultIndex
      FROM ranked
    `).get(...params, entryId);
    return {
      total: Number(row?.total || 0),
      resultIndex: Number.isInteger(row?.resultIndex) ? row.resultIndex : -1,
    };
  }

  emptyEntryLocationResult(query, entryId, total, reason = "not_in_results", searchSummary = null) {
    return {
      location: {
        found: false,
        reason,
        entryId,
      },
      items: [],
      searchSummary,
      pageInfo: {
        nextCursor: "",
        windowCursor: this.encodeQueryCursor(query, 0),
        hasMore: false,
        total,
      },
    };
  }

  async locateEntryQueryWindow(id, entryId, query = {}) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    if (!db.prepare("SELECT 1 FROM entries WHERE id = ?").get(entryId)) {
      throw apiError("Entry not found", 404, "entry_not_found");
    }
    const normalizedQuery = normalizeRepositoryEntryQuery({
      ...query,
      cursor: "",
      windowOffset: "",
    });
    const dictionary = this.dictionaryQueryContext(id);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    normalizedQuery.search.rawText = normalizedQuery.search.text;
    normalizedQuery.search.text = searchRuntime.normalizeText(normalizedQuery.search.text);
    this.prepareQueryCursor("entries", id, dictionary.updatedAt, normalizedQuery);

    let resultIndex = -1;
    let total = 0;
    let pageResult = null;
    let searchSummary = null;
    if (canUseSqlEntryQuery(normalizedQuery)) {
      const location = this.entrySqlQueryLocation(db, dictionary, normalizedQuery, entryId);
      resultIndex = location.resultIndex;
      total = location.total;
      if (resultIndex >= 0) {
        normalizedQuery.page.offset = Math.floor(resultIndex / normalizedQuery.page.limit) * normalizedQuery.page.limit;
        pageResult = this.queryEntriesSql(id, normalizedQuery, dictionary, { total });
      }
    } else {
      const session = await this.entrySearchQuerySession(id, normalizedQuery, dictionary);
      resultIndex = session.entryIndexById.get(entryId) ?? -1;
      total = session.orderedIds.length;
      searchSummary = session.searchSummary;
      if (resultIndex >= 0) {
        normalizedQuery.page.offset = Math.floor(resultIndex / normalizedQuery.page.limit) * normalizedQuery.page.limit;
        pageResult = await this.queryEntriesSearchSession(id, normalizedQuery, dictionary);
      }
    }

    if (resultIndex < 0 || !pageResult) {
      return this.emptyEntryLocationResult(
        normalizedQuery,
        entryId,
        total,
        "not_in_results",
        searchSummary,
      );
    }
    return {
      location: {
        found: true,
        entryId,
        resultIndex,
        windowIndex: Math.floor(resultIndex / normalizedQuery.page.limit),
        windowOffset: normalizedQuery.page.offset,
      },
      ...pageResult,
    };
  }

  entryTagIdentitySnapshotFromDatabase(db, dictionary) {
    const dictionaryId = String(dictionary?.id || "");
    const generation = this.querySessionCache.generation(dictionaryId);
    const cached = this.tagIdentitySnapshotCache.get(dictionaryId);
    if (cached?.generation === generation) {
      return cached.snapshot;
    }
    const settings = dictionary.settings || {};
    const configuredParts = new Set(
      (settings.partOfSpeechTags || []).map(normalizeStructuralKey).filter(Boolean),
    );
    const baseIdentities = db.prepare(`
      SELECT tag AS value, COUNT(DISTINCT entry_id) AS entryCount
      FROM entry_tags
      GROUP BY tag
      ORDER BY tag COLLATE BINARY ASC
    `).all().map((row) => ({
      value: row.value,
      displayLabel: displayTag(row.value, dictionary),
      entryCount: Number(row.entryCount || 0),
      isPartOfSpeech: configuredParts.has(normalizeStructuralKey(row.value)),
    }));
    const displayIdentityIndex = buildDisplayIdentityIndex(baseIdentities);
    const identities = baseIdentities.map((identity) => ({
      ...identity,
      displayAmbiguous: (displayIdentityIndex.get(identity.displayLabel)?.size || 0) > 1,
    }));
    const collisionGroups = [...displayIdentityIndex.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([displayLabel, values]) => ({ displayLabel, values: [...values] }));
    let noPartOfSpeechCount = 0;
    if (configuredParts.size) {
      const partValues = [...configuredParts];
      noPartOfSpeechCount = Number(db.prepare(`
        SELECT COUNT(*) AS entryCount
        FROM entries e
        WHERE NOT EXISTS (
          SELECT 1 FROM entry_tags part_tags
          WHERE part_tags.entry_id = e.id
            AND part_tags.tag IN (${sqlPlaceholders(partValues)})
        )
      `).get(...partValues)?.entryCount || 0);
    } else {
      noPartOfSpeechCount = Number(
        db.prepare("SELECT COUNT(*) AS entryCount FROM entries").get()?.entryCount || 0,
      );
    }

    const snapshot = {
      generation,
      identities,
      collisionGroups,
      noPartOfSpeechCount,
    };
    this.tagIdentitySnapshotCache.set(dictionaryId, { generation, snapshot });
    return snapshot;
  }

  entryPartStatsFromDatabase(db, dictionary) {
    const snapshot = this.entryTagIdentitySnapshotFromDatabase(db, dictionary);
    return {
      parts: snapshot.identities
        .filter((identity) => identity.isPartOfSpeech)
        .map((identity) => ({
          part: identity.value,
          displayLabel: identity.displayLabel,
          displayAmbiguous: identity.displayAmbiguous,
          entryCount: identity.entryCount,
        })),
      noPartOfSpeechCount: snapshot.noPartOfSpeechCount,
    };
  }

  entryTagStatsFromDatabase(db, dictionary) {
    const snapshot = this.entryTagIdentitySnapshotFromDatabase(db, dictionary);
    return {
      tags: snapshot.identities
        .filter((identity) => !identity.isPartOfSpeech)
        .map((identity) => ({
          tag: identity.value,
          displayLabel: identity.displayLabel,
          displayAmbiguous: identity.displayAmbiguous,
          entryCount: identity.entryCount,
        })),
    };
  }

  entryTagSetStatsFromDatabase(db, dictionary) {
    const identitySnapshot = this.entryTagIdentitySnapshotFromDatabase(db, dictionary);
    const identityByValue = new Map(identitySnapshot.identities.map((identity) => [identity.value, identity]));
    const tagSets = new Map();
    let currentEntryId = null;
    let currentTags = [];
    let taggedEntryCount = 0;
    let multiTagEntryCount = 0;
    const collectCurrent = () => {
      const tags = [...new Set(currentTags)].sort((left, right) => (
        left < right ? -1 : (left > right ? 1 : 0)
      ));
      if (!tags.length) {
        return;
      }
      taggedEntryCount += 1;
      if (tags.length >= 2) {
        multiTagEntryCount += 1;
      }
      const key = JSON.stringify(tags);
      const existing = tagSets.get(key);
      if (existing) {
        existing.entryCount += 1;
      } else {
        tagSets.set(key, { tags, entryCount: 1 });
      }
    };
    const tagRows = db.prepare(`
      SELECT entry_id AS entryId, tag
      FROM entry_tags
      ORDER BY entry_id ASC, tag ASC
    `).iterate();
    for (const row of tagRows) {
      if (currentEntryId !== row.entryId) {
        collectCurrent();
        currentEntryId = row.entryId;
        currentTags = [];
      }
      currentTags.push(row.tag);
    }
    collectCurrent();

    const displayOrder = new Map(
      (dictionary.settings?.tagSortOrder || [])
        .map(normalizeStructuralKey)
        .filter(Boolean)
        .map((tag, index) => [tag, index]),
    );
    const displayRank = (tag) => displayOrder.get(tag) ?? Number.MAX_SAFE_INTEGER;
    const rows = [...tagSets.values()]
      .map((row) => ({
        entryCount: row.entryCount,
        tags: row.tags
          .map((tag) => {
            const identity = identityByValue.get(tag);
            return identity ? {
              value: identity.value,
              displayLabel: identity.displayLabel,
              displayAmbiguous: identity.displayAmbiguous,
              isPartOfSpeech: identity.isPartOfSpeech,
            } : {
              value: tag,
              displayLabel: displayTag(tag, dictionary),
              displayAmbiguous: false,
              isPartOfSpeech: false,
            };
          })
          .sort((left, right) => (
            displayRank(left.value) - displayRank(right.value)
            || left.value.localeCompare(right.value, "zh-CN")
          )),
      }))
      .sort((left, right) => (
        right.entryCount - left.entryCount
        || JSON.stringify(left.tags.map((tag) => tag.value))
          .localeCompare(JSON.stringify(right.tags.map((tag) => tag.value)), "zh-CN")
      ));
    const entryCount = Number(db.prepare("SELECT COUNT(*) AS entryCount FROM entries").get()?.entryCount || 0);
    return {
      tagSetCount: rows.length,
      taggedEntryCount,
      untaggedEntryCount: Math.max(0, entryCount - taggedEntryCount),
      multiTagEntryCount,
      rows,
    };
  }

  analysisEntryStatsFromDatabase(db) {
    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM entries) AS entryCount,
        (SELECT COUNT(*) FROM definitions WHERE TRIM(COALESCE(meaning, '')) <> '') AS definitionCount,
        (SELECT COUNT(DISTINCT entry_id) FROM definitions WHERE TRIM(COALESCE(meaning, '')) <> '') AS definitionEntryCount,
        (SELECT COUNT(*) FROM definitions WHERE TRIM(COALESCE(example, '')) <> '') AS exampleCount,
        (SELECT COUNT(DISTINCT entry_id) FROM definitions WHERE TRIM(COALESCE(example, '')) <> '') AS exampleEntryCount,
        (SELECT COUNT(*) FROM entries WHERE TRIM(COALESCE(notes, '')) <> '') AS noteEntryCount,
        (SELECT COUNT(DISTINCT entry_id) FROM entry_sources) AS sourceEntryCount,
        (SELECT COUNT(*) FROM (
          SELECT entry_id
          FROM entry_sources
          GROUP BY entry_id
          HAVING COUNT(*) >= 2
        )) AS multiSourceEntryCount,
        (SELECT COUNT(*) FROM entries WHERE TRIM(COALESCE(pronunciation, '')) <> '') AS ipaEntryCount
    `).get() || {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
  }

  analysisActivityStatsFromDatabase(db, limit) {
    const dateBuckets = (column) => {
      const limitClause = Number.isSafeInteger(limit) && limit > 0 ? "LIMIT ?" : "";
      const statement = db.prepare(`
        SELECT STRFTIME('%Y-%m-%d', ${column}) AS day, COUNT(*) AS entryCount
        FROM entries
        WHERE STRFTIME('%Y-%m-%d', ${column}) IS NOT NULL
        GROUP BY day
        ORDER BY day DESC
        ${limitClause}
      `);
      const rows = limitClause ? statement.all(limit) : statement.all();
      return rows.reverse().map((row) => ({
        day: row.day,
        entryCount: Number(row.entryCount || 0),
      }));
    };
    return {
      created: dateBuckets("created_at"),
      updated: dateBuckets("updated_at"),
    };
  }

  analysisOrthographyStatsFromDatabase(db) {
    return buildOrthographyDistribution(db.prepare(`
      SELECT id, lemma
      FROM entries
      WHERE COALESCE(lemma, '') <> ''
      ORDER BY position ASC, id ASC
    `).all());
  }

  analysisRootFamiliesFromTopology(id, db) {
    const topology = this.currentRootTopology(id, db);
    const families = topology.groups
      .filter((group) => group.derivedIds.length > 0)
      .sort((left, right) => (
        right.derivedIds.length - left.derivedIds.length
        || compareEntryValues(
          topology.entriesById.get(left.rootId) || { id: left.rootId },
          topology.entriesById.get(right.rootId) || { id: right.rootId },
          "lemmaAsc",
        )
      ));
    return {
      familyCount: families.length,
      rows: families.map((group) => ({
        rootId: group.rootId,
        lemma: topology.entriesById.get(group.rootId)?.lemma || "",
        derivedEntryCount: group.derivedIds.length,
      })),
    };
  }

  async queryAnalysis(id, source = {}) {
    const query = normalizeRepositoryAnalysisQuery(source);
    await this.requireDictionary(id);
    const startedAt = Date.now();
    const db = this.openDictionaryDatabase(id);
    const plan = planAnalysisQuery(query);
    const dictionary = plan.tasks.some((task) => (
      task === "partStats" || task === "tagStats" || task === "tagSetStats"
    ))
      ? this.baseDictionarySnapshot(id)
      : null;
    const taskResults = {};
    plan.tasks.forEach((task) => {
      if (task === "entryStats") {
        taskResults.entryStats = this.analysisEntryStatsFromDatabase(db);
      } else if (task === "partStats") {
        taskResults.partStats = this.entryPartStatsFromDatabase(db, dictionary);
      } else if (task === "tagStats") {
        taskResults.tagStats = this.entryTagStatsFromDatabase(db, dictionary);
      } else if (task === "tagSetStats") {
        taskResults.tagSetStats = this.entryTagSetStatsFromDatabase(db, dictionary);
      } else if (task === "orthographyStats") {
        taskResults.orthographyStats = this.analysisOrthographyStatsFromDatabase(db);
      } else if (task === "activityStats") {
        taskResults.activityStats = this.analysisActivityStatsFromDatabase(db, plan.activityLimit);
      } else if (task === "rootTopology") {
        taskResults.rootTopology = this.analysisRootFamiliesFromTopology(id, db);
      }
    });
    const generation = this.querySessionCache.generation(id);
    const cacheKey = crypto.createHash("sha256").update(JSON.stringify({
      version: 1,
      dictionaryId: id,
      generation,
      query,
    })).digest("base64url");
    return {
      dictionaryId: id,
      generation,
      cacheKey,
      widgets: buildAnalysisWidgets(query, taskResults),
      diagnostics: {
        computedTasks: plan.tasks,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  async getEntryFacets(id) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const dictionary = this.baseDictionarySnapshot(id);
    const snapshot = this.entryTagIdentitySnapshotFromDatabase(db, dictionary);
    const parts = snapshot.identities
      .filter((identity) => identity.isPartOfSpeech)
      .sort((left, right) => left.value.localeCompare(right.value, "zh-CN"))
      .map((identity) => ({
        tag: identity.value,
        displayLabel: identity.displayLabel,
        displayAmbiguous: identity.displayAmbiguous,
        entryCount: identity.entryCount,
      }));
    const tags = [...snapshot.identities]
      .sort((left, right) => (
        right.entryCount - left.entryCount
        || left.displayLabel.localeCompare(right.displayLabel, "zh-CN")
        || left.value.localeCompare(right.value, "zh-CN")
      ))
      .map((identity) => ({
        tag: identity.value,
        displayLabel: identity.displayLabel,
        displayAmbiguous: identity.displayAmbiguous,
        entryCount: identity.entryCount,
        isPartOfSpeech: identity.isPartOfSpeech,
      }));
    return {
      generation: snapshot.generation,
      identities: snapshot.identities,
      collisionGroups: snapshot.collisionGroups,
      parts,
      tags,
      noPartOfSpeechCount: snapshot.noPartOfSpeechCount,
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

  rootTopologyFromDatabase(db) {
    const entries = db.prepare(`
      SELECT id, lemma, sort_key AS sortKey, position,
        created_at AS createdAt, updated_at AS updatedAt
      FROM entries
      ORDER BY sort_key ASC, lemma ASC, id ASC
    `).all();
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
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

    const sourceKeysByEntry = new Map();
    db.prepare(`
      SELECT entry_id AS entryId, source_key AS sourceKey
      FROM entry_sources
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      if (!sourceKeysByEntry.has(row.entryId)) {
        sourceKeysByEntry.set(row.entryId, []);
      }
      sourceKeysByEntry.get(row.entryId).push(row.sourceKey);
    });

    const resolvedSourceIdsByEntry = new Map();
    sourceKeysByEntry.forEach((sourceKeys, entryId) => {
      const resolvedIds = [];
      const seenIds = new Set();
      sourceKeys.forEach((sourceKey) => {
        const key = normalizeText(sourceKey);
        const source = byLemma.get(key) || byId.get(key) || null;
        if (!source?.id || seenIds.has(source.id)) {
          return;
        }
        seenIds.add(source.id);
        resolvedIds.push(source.id);
      });
      resolvedSourceIdsByEntry.set(entryId, resolvedIds);
    });

    const sourceRootIds = (entryId, seen = new Set()) => {
      const rootIds = [];
      (resolvedSourceIdsByEntry.get(entryId) || []).forEach((sourceId) => {
        if (seen.has(sourceId)) {
          return;
        }
        seen.add(sourceId);
        const sourceIds = resolvedSourceIdsByEntry.get(sourceId) || [];
        if (!sourceIds.length) {
          rootIds.push(sourceId);
          return;
        }
        const ancestors = sourceRootIds(sourceId, seen);
        if (ancestors.length) {
          rootIds.push(...ancestors);
        } else {
          rootIds.push(sourceId);
        }
      });
      return [...new Set(rootIds)];
    };

    const groups = new Map();
    const ensureGroup = (rootId) => {
      if (!groups.has(rootId)) {
        groups.set(rootId, { rootId, derivedIds: new Set() });
      }
      return groups.get(rootId);
    };
    entries.forEach((entry) => {
      if (!sourceKeysByEntry.has(entry.id)) {
        ensureGroup(entry.id);
      }
    });
    entries.forEach((entry) => {
      if (!sourceKeysByEntry.has(entry.id)) {
        return;
      }
      const rootIds = sourceRootIds(entry.id);
      if (!rootIds.length) {
        ensureGroup(entry.id);
        return;
      }
      rootIds.forEach((rootId) => ensureGroup(rootId).derivedIds.add(entry.id));
    });

    const compareLemmaAscIds = (leftId, rightId) => compareEntryValues(
      entriesById.get(leftId) || { id: leftId },
      entriesById.get(rightId) || { id: rightId },
      "lemmaAsc",
    );
    const groupRecords = [...groups.values()].map((group) => ({
      rootId: group.rootId,
      derivedIds: [...group.derivedIds].sort(compareLemmaAscIds),
    }));
    const groupsByRootId = new Map(groupRecords.map((group) => [group.rootId, group]));
    const rootIdsByEntryId = new Map(entries.map((entry) => [entry.id, []]));
    groupRecords.forEach((group) => {
      const memberIds = [group.rootId, ...group.derivedIds];
      memberIds.forEach((entryId) => {
        if (!rootIdsByEntryId.has(entryId)) {
          rootIdsByEntryId.set(entryId, []);
        }
        rootIdsByEntryId.get(entryId).push(group.rootId);
      });
    });

    return {
      entriesById,
      groups: groupRecords,
      groupsByRootId,
      rootIdsByEntryId,
      groupsBySort: new Map(),
    };
  }

  currentRootTopology(id, db = this.openDictionaryDatabase(id)) {
    return this.rootTopologyCache.getOrCreate({
      dictionaryId: id,
      build: () => this.rootTopologyFromDatabase(db),
    });
  }

  rootTopologyGroupsForSort(topology, sort = "lemmaAsc") {
    const cached = topology.groupsBySort.get(sort);
    if (cached) {
      return cached;
    }
    const compareIds = (leftId, rightId) => compareEntryValues(
      topology.entriesById.get(leftId) || { id: leftId },
      topology.entriesById.get(rightId) || { id: rightId },
      sort,
    );
    const groups = topology.groups
      .map((group) => ({
        rootId: group.rootId,
        derivedIds: [...group.derivedIds].sort(compareIds),
      }))
      .sort((left, right) => compareIds(left.rootId, right.rootId));
    topology.groupsBySort.set(sort, groups);
    return groups;
  }

  rootGroupSessionRecordsFromTopology(db, topology, query) {
    const groups = this.rootTopologyGroupsForSort(topology, query.sort);
    if (!query.q) {
      return {
        groups: groups.map((group) => ({
          rootId: group.rootId,
          derivedIds: group.derivedIds,
          matchedDerivedIds: group.derivedIds,
          rootMatches: true,
        })),
        searchSummary: null,
      };
    }
    const matches = this.entrySearchProjectionMatches(db, query, { ordered: false });
    const matchedIds = new Set(matches.orderedIds);
    return {
      groups: groups.map((group) => {
        const rootMatches = matchedIds.has(group.rootId);
        const matchedDerivedIds = group.derivedIds.filter((entryId) => matchedIds.has(entryId));
        return {
          rootId: group.rootId,
          derivedIds: rootMatches ? group.derivedIds : matchedDerivedIds,
          matchedDerivedIds,
          rootMatches,
        };
      }).filter((group) => group.rootMatches || group.matchedDerivedIds.length),
      searchSummary: matches.searchSummary,
    };
  }

  serializeRootGroupSessionPage(id, query, dictionary, session, options = {}) {
    const db = this.openDictionaryDatabase(id);
    const page = session.groups.slice(query.offset, query.offset + query.limit);
    const entryIds = page.map((group) => group.rootId).filter(Boolean);
    const rows = this.entryRowsByIds(db, entryIds);
    const entries = this.entrySummariesFromRows(db, rows, dictionary);
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const nextOffset = query.offset + page.length;
    const hasMore = nextOffset < session.groups.length;
    const windowMetrics = [];
    if (query.offset === 0 || options.includeWindowMetrics) {
      for (let offset = 0; offset < session.groups.length; offset += query.limit) {
        const groups = session.groups.slice(offset, offset + query.limit);
        windowMetrics.push({
          groupCount: groups.length,
          derivedCount: groups.reduce((total, group) => total + group.derivedIds.length, 0),
        });
      }
    }
    return {
      items: page.map((group) => ({
        root: entriesById.get(group.rootId),
        derivedCount: group.derivedIds.length,
        matchedDerivedCount: group.matchedDerivedIds.length,
        rootMatches: Boolean(group.rootMatches),
      })).filter((group) => group.root),
      searchSummary: session.searchSummary,
      pageInfo: {
        nextCursor: hasMore ? this.encodeQueryCursor(query, nextOffset) : "",
        windowCursor: this.encodeQueryCursor(query, 0),
        hasMore,
        total: session.groups.length,
        windowMetrics,
      },
    };
  }

  serializeRootGroupEntries(id, rootId, query, dictionary, session) {
    const groupIndex = session.groupIndexByRootId.get(rootId);
    const group = groupIndex === undefined ? null : session.groups[groupIndex];
    if (!group) {
      throw apiError("Root group not found", 404, "root_group_not_found");
    }
    const db = this.openDictionaryDatabase(id);
    const rows = this.entryRowsByIds(db, group.derivedIds);
    const entries = this.entrySummariesFromRows(db, rows, dictionary);
    const matchedIds = new Set(group.matchedDerivedIds);
    return {
      items: entries.map((entry) => ({
        ...entry,
        rootGroupMatch: matchedIds.has(entry.id),
      })),
    };
  }

  async rootGroupQuerySession(id, query, dictionary) {
    const db = this.openDictionaryDatabase(id);
    return this.currentQuerySession({
      kind: "rootGroups",
      dictionaryId: id,
      dictionaryUpdatedAt: dictionary.updatedAt,
      query,
      build: () => {
        const result = this.rootGroupSessionRecordsFromTopology(
          db,
          this.currentRootTopology(id, db),
          query,
        );
        return {
          groups: result.groups,
          groupIndexByRootId: new Map(result.groups.map((group, index) => [group.rootId, index])),
          searchSummary: result.searchSummary,
        };
      },
    });
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
        matchedEntry: matchedEntry ? entrySummary(matchedEntry, dictionary) : null,
      };
    });
    const derivedEntries = this.directDerivedEntries(db, entry, { sort: "lemmaAsc" });
    const topology = this.currentRootTopology(id, db);
    const rootIds = topology.rootIdsByEntryId.get(entryId) || [];
    const rootId = [...rootIds].sort((leftId, rightId) => compareEntryValues(
      topology.entriesById.get(leftId) || { id: leftId },
      topology.entriesById.get(rightId) || { id: rightId },
      "lemmaAsc",
    ))[0] || entryId;
    const rootGroup = topology.groupsByRootId.get(rootId);
    const rootEntryIds = rootGroup
      ? [rootGroup.rootId, ...rootGroup.derivedIds]
      : [entryId];
    const rootEntries = this.entrySummariesFromRows(
      db,
      this.entryRowsByIds(db, rootEntryIds),
      dictionary,
    );
    const root = rootEntries.find((candidate) => candidate.id === rootId) || entrySummary(entry, dictionary);
    return {
      entryId,
      sources,
      derivedEntries: derivedEntries.map((candidate) => entrySummary(candidate, dictionary)),
      rootGroup: {
        rootKey: root.lemma || root.id || "",
        entries: rootEntries,
      },
    };
  }

  async queryRootGroups(id, query = {}) {
    await this.requireDictionary(id);
    const normalizedQuery = normalizeRootGroupQuery(query);
    const dictionaryContext = this.dictionaryQueryContext(id);
    const searchRuntime = searchSettingsQueryOptions(dictionaryContext.settings?.search);
    normalizedQuery.rawQ = normalizedQuery.q;
    normalizedQuery.q = searchRuntime.normalizeText(normalizedQuery.q);
    this.prepareQueryCursor("rootGroups", id, dictionaryContext.updatedAt, normalizedQuery);
    const session = await this.rootGroupQuerySession(id, normalizedQuery, dictionaryContext);
    return this.serializeRootGroupSessionPage(id, normalizedQuery, dictionaryContext, session);
  }

  async queryRootGroupEntries(id, rootId, query = {}) {
    await this.requireDictionary(id);
    const normalizedQuery = normalizeRootGroupEntriesQuery(query);
    const dictionaryContext = this.dictionaryQueryContext(id);
    const searchRuntime = searchSettingsQueryOptions(dictionaryContext.settings?.search);
    normalizedQuery.rawQ = normalizedQuery.q;
    normalizedQuery.q = searchRuntime.normalizeText(normalizedQuery.q);
    const session = await this.rootGroupQuerySession(id, normalizedQuery, dictionaryContext);
    return this.serializeRootGroupEntries(id, rootId, normalizedQuery, dictionaryContext, session);
  }

  emptyRootGroupLocationResult(query, entryId, total, reason = "not_in_results", searchSummary = null) {
    return {
      location: {
        found: false,
        reason,
        entryId,
      },
      items: [],
      searchSummary,
      pageInfo: {
        nextCursor: "",
        windowCursor: this.encodeQueryCursor(query, 0),
        hasMore: false,
        total,
        windowMetrics: [],
      },
    };
  }

  async locateRootGroupQueryWindow(id, entryId, query = {}) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    if (!db.prepare("SELECT 1 FROM entries WHERE id = ?").get(entryId)) {
      throw apiError("Entry not found", 404, "entry_not_found");
    }
    const preferredRootId = String(query.preferredRootId || "").trim();
    const normalizedQuery = normalizeRootGroupQuery({
      ...query,
      cursor: "",
      windowOffset: "",
    });
    const dictionary = this.dictionaryQueryContext(id);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    normalizedQuery.rawQ = normalizedQuery.q;
    normalizedQuery.q = searchRuntime.normalizeText(normalizedQuery.q);
    this.prepareQueryCursor("rootGroups", id, dictionary.updatedAt, normalizedQuery);
    const session = await this.rootGroupQuerySession(id, normalizedQuery, dictionary);
    const topology = this.currentRootTopology(id, db);
    const candidateRootIds = topology.rootIdsByEntryId.get(entryId) || [];
    if (preferredRootId && !candidateRootIds.includes(preferredRootId)) {
      throw apiError("Preferred root is not a root of the target entry", 400, "invalid_root_context");
    }

    const rootIds = preferredRootId ? [preferredRootId] : candidateRootIds;
    const candidates = rootIds.map((rootId) => {
      const groupIndex = session.groupIndexByRootId.get(rootId);
      const group = groupIndex === undefined ? null : session.groups[groupIndex];
      const targetVisible = Boolean(
        group
        && (rootId === entryId || group.derivedIds.includes(entryId))
      );
      return targetVisible ? { rootId, groupIndex } : null;
    }).filter(Boolean).sort((left, right) => left.groupIndex - right.groupIndex);
    const target = candidates[0] || null;
    if (!target) {
      return this.emptyRootGroupLocationResult(
        normalizedQuery,
        entryId,
        session.groups.length,
        preferredRootId ? "root_context_not_in_results" : "not_in_results",
        session.searchSummary,
      );
    }

    normalizedQuery.offset = Math.floor(target.groupIndex / normalizedQuery.limit) * normalizedQuery.limit;
    const pageResult = this.serializeRootGroupSessionPage(
      id,
      normalizedQuery,
      dictionary,
      session,
      { includeWindowMetrics: true },
    );
    return {
      location: {
        found: true,
        entryId,
        rootId: target.rootId,
        groupIndex: target.groupIndex,
        windowIndex: Math.floor(target.groupIndex / normalizedQuery.limit),
        windowOffset: normalizedQuery.offset,
      },
      ...pageResult,
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

  morphologyTemplateGroupsFromDatabase(db, options = {}) {
    const includeCells = options.includeCells !== false;
    const groups = db.prepare(`
      SELECT id, position, name, match_tags_json AS matchTagsJson, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM morphology_template_groups
      ORDER BY position ASC, name ASC, id ASC
    `).all().map((row) => ({
      id: row.id,
      position: row.position,
      name: row.name || "",
      matchTags: parseJson(row.matchTagsJson || "[]", []),
      notes: row.notes || "",
      tables: [],
      createdAt: row.createdAt || "",
      updatedAt: row.updatedAt || "",
    }));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    db.prepare(`
      SELECT id, group_id AS groupId, position, title, row_count AS rowCount, column_count AS columnCount,
        row_labels_json AS rowLabelsJson, column_labels_json AS columnLabelsJson, created_at AS createdAt, updated_at AS updatedAt
      FROM morphology_template_tables
      ORDER BY group_id ASC, position ASC, title ASC, id ASC
    `).all().forEach((row) => {
      const group = groupById.get(row.groupId);
      if (!group) {
        return;
      }
      group.tables.push({
        id: row.id,
        position: row.position,
        title: row.title || "",
        rowCount: row.rowCount || 1,
        columnCount: row.columnCount || 1,
        rowLabels: parseJson(row.rowLabelsJson || "[]", []),
        columnLabels: parseJson(row.columnLabelsJson || "[]", []),
        cells: {},
        createdAt: row.createdAt || "",
        updatedAt: row.updatedAt || "",
      });
    });
    if (!includeCells) {
      return groups;
    }
    const tableById = new Map(groups.flatMap((group) => group.tables.map((table) => [table.id, table])));
    db.prepare(`
      SELECT table_id AS tableId, row_index AS rowIndex, column_index AS columnIndex, source_text AS sourceText
      FROM morphology_template_cells
      ORDER BY table_id ASC, row_index ASC, column_index ASC
    `).all().forEach((row) => {
      const table = tableById.get(row.tableId);
      if (table) {
        table.cells[`${row.rowIndex},${row.columnIndex}`] = { sourceText: row.sourceText || "" };
      }
    });
    return groups;
  }

  morphologyFromDatabase(db, blob = {}) {
    const templateGroups = this.morphologyTemplateGroupsFromDatabase(db);
    return {
      ...(blob || {}),
      templateGroups,
    };
  }

  async saveEntry(id, entry, options = {}) {
    await this.requireDictionary(id);
    const db = this.openDictionaryDatabase(id);
    const baseDictionary = this.baseDictionarySnapshot(id);
    const now = new Date().toISOString();
    const savedEntry = this.normalizeEntryForSave(baseDictionary, entry);
    const nextEntry = {
      ...savedEntry,
      updatedAt: now,
    };
    const existingRow = db.prepare("SELECT position, lemma FROM entries WHERE id = ?").get(nextEntry.id);
    if (options.createOnly && existingRow) {
      throw apiError("Entry ID already exists", 409, "duplicate_entity_ids_scoped", {
        duplicates: [{ id: nextEntry.id, types: ["entry"] }],
      });
    }
    const existingSourceKeys = existingRow
      ? this.entrySourcesFromDatabase(db, nextEntry.id).map((source) => source.sourceKey).filter(Boolean)
      : [];
    const nextSourceKeys = (nextEntry.etymology?.sources || []).map(normalizeText).filter(Boolean);
    const topologyChanged = !existingRow
      || existingRow.lemma !== nextEntry.lemma
      || !orderedStringsEqual(existingSourceKeys, nextSourceKeys);
    assertSavedEntryEntityIds(
      nextEntry,
      this.conflictingEntityIdRecords(db, baseDictionary, entryEntityIdRecords(nextEntry), {
        excludeEntryId: existingRow ? nextEntry.id : "",
      }),
    );
    const position = existingRow
      ? existingRow.position
      : Number(db.prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM entries").get()?.position || 0);

    db.exec("BEGIN IMMEDIATE");
    try {
      this.writeEntryProjection(db, nextEntry, position, baseDictionary);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    this.invalidateQuerySessions(id);
    if (topologyChanged) {
      this.invalidateRootTopology(id);
    } else {
      this.refreshRootTopologyEntryRecords(id, db, [nextEntry.id]);
    }
    return {
      id,
      updatedAt: now,
      entry: this.getEntryFromDatabase(db, nextEntry.id),
      summary: this.dictionarySummaryFromDatabase(db),
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
      db.prepare("DELETE FROM entry_morphology_cell_overrides WHERE entry_id = ?").run(entryId);
      db.prepare("DELETE FROM entry_morphology_groups WHERE entry_id = ?").run(entryId);
      db.prepare("DELETE FROM entries WHERE id = ?").run(entryId);
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    this.invalidateDictionaryCaches(id);
    return {
      id,
      updatedAt: now,
      summary: this.dictionarySummaryFromDatabase(db),
    };
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
      });
      changedEntries.set(entryId, {
        ...patchedEntry,
        updatedAt: now,
      });
    });

    const hasSettings = Object.hasOwn(options, "settings");
    const nextSettings = hasSettings
      ? mergeOtherSettings(baseDictionary.settings, options.settings)
      : null;
    const projectionDictionary = {
      ...baseDictionary,
      settings: nextSettings || baseDictionary.settings,
    };
    const rebuildStaticSearchProjection = hasSettings
      && staticSearchProjectionSettingsKey(baseDictionary.settings) !== staticSearchProjectionSettingsKey(nextSettings);
    const rebuildMorphologySearchProjection = hasSettings
      && searchNormalizationSettingsKey(baseDictionary.settings) !== searchNormalizationSettingsKey(nextSettings);
    if (!updates.length && !hasSettings) {
      return {
        id,
        updatedAt: baseDictionary.updatedAt || "",
        entries: [],
      };
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      if (hasSettings) {
        this.writeModuleBlob(db, "settings", nextSettings, now);
      }
      changedEntries.forEach((patchedEntry) => {
        const row = db.prepare("SELECT position FROM entries WHERE id = ?").get(patchedEntry.id);
        this.writeEntryProjection(db, patchedEntry, row?.position ?? 0, projectionDictionary);
      });
      if (rebuildStaticSearchProjection) {
        this.rebuildEntrySearchProjection(db, projectionDictionary);
      }
      if (rebuildMorphologySearchProjection) {
        this.rebuildEntryMorphologySearchProjection(db, projectionDictionary);
      }
      this.touchDictionary(db, id, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    this.invalidateQuerySessions(id);
    this.refreshRootTopologyEntryRecords(id, db, [...changedEntries.keys()]);
    return {
      id,
      updatedAt: now,
      entries: [...changedEntries.values()],
      ...(hasSettings ? { settings: nextSettings } : {}),
    };
  }

  async activateDictionary(id) {
    const index = await this.requireDictionary(id);
    await this.writeIndex({ ...index, activeDictionaryId: id });
  }

  async deleteDictionary(id) {
    const index = await this.requireDictionary(id);
    this.closeDictionary(id);
    await fs.rm(this.dictionaryPath(id), { force: true });
    this.invalidateDictionaryCaches(id);
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
    const morphologyBlob = blobs.get("morphology") || {};
    return {
      id: meta.id,
      name: meta.name,
      language: meta.language || "",
      description: meta.description || "",
      settings: blobs.get("settings") || {},
      docs: blobs.get("docs") || {},
      corpus: blobs.get("corpus") || {},
      morphology: this.morphologyFromDatabase(db, morphologyBlob),
      createdAt: meta.createdAt || "",
      updatedAt: meta.updatedAt || "",
      entries: [],
    };
  }

  normalizeDictionaryForRuntimeSave(dictionary, options = {}) {
    return this.normalizeDictionary({
      ...dictionary,
      entries: [],
      corpus: options.includeCorpus ? dictionary.corpus : {},
      morphology: options.includeMorphology ? dictionary.morphology : {},
    });
  }

  entityRowsByIds(db, table, ids, columns = "id") {
    const rows = [];
    for (let offset = 0; offset < ids.length; offset += 400) {
      const chunk = ids.slice(offset, offset + 400);
      rows.push(...db.prepare(`SELECT ${columns} FROM ${table} WHERE id IN (${sqlPlaceholders(chunk)})`).all(...chunk));
    }
    return rows;
  }

  conflictingEntityIdRecords(db, baseDictionary, candidateRecords, { excludeEntryId = "", excludeScope = "" } = {}) {
    const ids = [...new Set(candidateRecords.map((record) => entityId(record.id)).filter(Boolean))];
    if (!ids.length) {
      return [];
    }
    const records = [];
    this.entityRowsByIds(db, "entries", ids).forEach((row) => {
      if (row.id !== excludeEntryId) {
        records.push({ id: row.id, type: "entry", scope: "entry", ownerId: row.id });
      }
    });
    this.entityRowsByIds(db, "definitions", ids, "id, entry_id AS entryId").forEach((row) => {
      if (row.entryId !== excludeEntryId) {
        records.push({ id: row.id, type: "definition", scope: "entry", ownerId: row.entryId });
      }
    });
    if (excludeScope !== "morphology") {
      this.entityRowsByIds(db, "morphology_template_groups", ids).forEach((row) => {
        records.push({ id: row.id, type: "morphologyTemplateGroup", scope: "morphology" });
      });
      this.entityRowsByIds(db, "morphology_template_tables", ids).forEach((row) => {
        records.push({ id: row.id, type: "morphologyTemplateTable", scope: "morphology" });
      });
    }
    if (excludeScope !== "corpus") {
      const candidateIds = new Set(ids);
      moduleEntityIdRecords({ corpus: baseDictionary.corpus })
        .filter((record) => candidateIds.has(record.id))
        .forEach((record) => records.push(record));
    }
    return records;
  }

  normalizeEntryForSave(baseDictionary, entry) {
    const prefilledEntry = prefillEntryEntityIds(entry);
    const normalized = this.normalizeDictionary({
      ...baseDictionary,
      corpus: {},
      morphology: {},
      entries: [prefilledEntry],
    }).entries[0];
    const morphologyErrors = validateCanonicalEntryMorphology(normalized, baseDictionary);
    if (morphologyErrors.length) {
      throw apiError("Invalid entry morphology payload", 400, "invalid_entry_morphology", { morphologyErrors });
    }
    return normalized;
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

  assertMorphologyReferencesRemainValid(db, morphology = {}) {
    const groupsById = new Map((morphology.templateGroups || []).map((group) => [group.id, group]));
    const tablesById = new Map((morphology.templateGroups || []).flatMap((group) => (
      (group.tables || []).map((table) => [table.id, { ...table, groupId: group.id }])
    )));
    const references = [];

    db.prepare(`
      SELECT entry_id AS entryId, template_group_id AS templateGroupId
      FROM entry_morphology_groups
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      if (!groupsById.has(row.templateGroupId)) {
        references.push({ ...row, reason: "missing_group" });
      }
    });
    db.prepare(`
      SELECT entry_id AS entryId, template_group_id AS templateGroupId,
        template_table_id AS tableId, row_index AS rowIndex, column_index AS columnIndex
      FROM entry_morphology_cell_overrides
      ORDER BY entry_id ASC, template_group_id ASC, template_table_id ASC, row_index ASC, column_index ASC
    `).all().forEach((row) => {
      const table = tablesById.get(row.tableId);
      let reason = "";
      if (!table) {
        reason = "missing_table";
      } else if (table.groupId !== row.templateGroupId) {
        reason = "table_moved";
      } else if (row.rowIndex >= table.rowCount || row.columnIndex >= table.columnCount) {
        reason = "cell_out_of_bounds";
      }
      if (reason) {
        references.push({ ...row, reason });
      }
    });

    if (references.length) {
      throw apiError("Morphology templates are still referenced by entries", 409, "morphology_references_in_use", {
        referenceCount: references.length,
        references: references.slice(0, 50),
      });
    }
  }

  automaticMorphologyEntryInputs(db) {
    const entries = db.prepare(`
      SELECT id
      FROM entries
      WHERE morphology_mode = 'auto'
      ORDER BY position ASC, id ASC
    `).all().map((row) => ({ id: row.id, tags: [] }));
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    db.prepare(`
      SELECT tags.entry_id AS entryId, tags.tag
      FROM entry_tags tags
      JOIN entries entry ON entry.id = tags.entry_id
      WHERE entry.morphology_mode = 'auto'
      ORDER BY tags.entry_id ASC, tags.position ASC
    `).all().forEach((row) => {
      byId.get(row.entryId)?.tags.push(row.tag || "");
    });
    return entries;
  }

  automaticMorphologyGroupId(tags = [], groups = []) {
    const entryTags = new Set(tags.map(normalizeStructuralKey).filter(Boolean));
    return groups.find((group) => (
      (group.matchTags || []).some((tag) => entryTags.has(normalizeStructuralKey(tag)))
    ))?.id || "";
  }

  morphologyProjectionEntryIds(db, plan) {
    const affected = new Set();
    const generationGroupIds = plan.projection.generationGroupIds;
    if (generationGroupIds.size) {
      chunkArray([...generationGroupIds]).forEach((groupIds) => {
        db.prepare(`
          SELECT DISTINCT groups.entry_id AS entryId
          FROM entry_morphology_groups groups
          JOIN entries entry ON entry.id = groups.entry_id
          WHERE entry.morphology_mode = 'manual'
            AND groups.template_group_id IN (${sqlPlaceholders(groupIds)})
        `).all(...groupIds).forEach((row) => affected.add(row.entryId));
      });
    }

    if (plan.projection.assignmentChanged || generationGroupIds.size) {
      this.automaticMorphologyEntryInputs(db).forEach((entry) => {
        const previousGroupId = this.automaticMorphologyGroupId(entry.tags, plan.previous.templateGroups);
        const nextGroupId = this.automaticMorphologyGroupId(entry.tags, plan.next.templateGroups);
        if (
          previousGroupId !== nextGroupId
          || generationGroupIds.has(previousGroupId)
          || generationGroupIds.has(nextGroupId)
        ) {
          affected.add(entry.id);
        }
      });
    }
    return [...affected];
  }

  writeMorphologyPlan(db, plan, updatedAt = "") {
    const deleteCell = db.prepare(`
      DELETE FROM morphology_template_cells
      WHERE table_id = ? AND row_index = ? AND column_index = ?
    `);
    plan.rows.cells.delete.forEach((cell) => {
      const match = cell.coordinate.match(/^(\d+),(\d+)$/);
      if (match) {
        deleteCell.run(cell.tableId, Number(match[1]), Number(match[2]));
      }
    });
    const deleteTable = db.prepare("DELETE FROM morphology_template_tables WHERE id = ?");
    plan.rows.tables.deleteIds.forEach((tableId) => deleteTable.run(tableId));
    const deleteGroup = db.prepare("DELETE FROM morphology_template_groups WHERE id = ?");
    plan.rows.groups.deleteIds.forEach((groupId) => deleteGroup.run(groupId));

    const upsertGroup = db.prepare(`
      INSERT INTO morphology_template_groups(id, position, name, match_tags_json, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        position = excluded.position,
        name = excluded.name,
        match_tags_json = excluded.match_tags_json,
        notes = excluded.notes,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `);
    plan.rows.groups.upsert.forEach((group) => {
      upsertGroup.run(
        group.id,
        group.position,
        group.name,
        JSON.stringify(group.matchTags),
        group.notes,
        group.createdAt,
        group.updatedAt || updatedAt,
      );
    });

    const upsertTable = db.prepare(`
      INSERT INTO morphology_template_tables(
        id, group_id, position, title, row_count, column_count,
        row_labels_json, column_labels_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        group_id = excluded.group_id,
        position = excluded.position,
        title = excluded.title,
        row_count = excluded.row_count,
        column_count = excluded.column_count,
        row_labels_json = excluded.row_labels_json,
        column_labels_json = excluded.column_labels_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `);
    plan.rows.tables.upsert.forEach((table) => {
      upsertTable.run(
        table.id,
        table.groupId,
        table.position,
        table.title,
        table.rowCount,
        table.columnCount,
        JSON.stringify(table.rowLabels),
        JSON.stringify(table.columnLabels),
        table.createdAt,
        table.updatedAt || updatedAt,
      );
    });

    const upsertCell = db.prepare(`
      INSERT INTO morphology_template_cells(table_id, row_index, column_index, source_text)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(table_id, row_index, column_index) DO UPDATE SET
        source_text = excluded.source_text
    `);
    plan.rows.cells.upsert.forEach((cell) => {
      const match = cell.coordinate.match(/^(\d+),(\d+)$/);
      if (match) {
        upsertCell.run(cell.tableId, Number(match[1]), Number(match[2]), cell.sourceText);
      }
    });
  }

  writeMorphologyProjection(db, morphology = {}, updatedAt = "") {
    db.exec(`
      DELETE FROM morphology_template_cells;
      DELETE FROM morphology_template_tables;
      DELETE FROM morphology_template_groups;
    `);

    const insertGroup = db.prepare(`
      INSERT INTO morphology_template_groups(id, position, name, match_tags_json, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTable = db.prepare(`
      INSERT INTO morphology_template_tables(id, group_id, position, title, row_count, column_count, row_labels_json, column_labels_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCell = db.prepare(`
      INSERT INTO morphology_template_cells(table_id, row_index, column_index, source_text)
      VALUES (?, ?, ?, ?)
    `);

    normalizeMorphology(morphology).templateGroups.forEach((group, groupIndex) => {
      insertGroup.run(
        group.id,
        groupIndex,
        group.name || "",
        JSON.stringify(group.matchTags || []),
        group.notes || "",
        group.createdAt || "",
        group.updatedAt || updatedAt || "",
      );
      (group.tables || []).forEach((table, tableIndex) => {
        insertTable.run(
          table.id,
          group.id,
          tableIndex,
          table.title || "",
          table.rowCount || 1,
          table.columnCount || 1,
          JSON.stringify(table.rowLabels || []),
          JSON.stringify(table.columnLabels || []),
          table.createdAt || "",
          table.updatedAt || updatedAt || "",
        );
        Object.entries(table.cells || {}).forEach(([key, cell]) => {
          const match = String(key).match(/^(\d+),(\d+)$/);
          if (match) {
            insertCell.run(table.id, Number(match[1]), Number(match[2]), morphologyCellSourceText(cell));
          }
        });
      });
    });
  }

  staticSearchEntriesFromDatabase(db) {
    const rows = db.prepare(`SELECT ${entrySelectColumns("e")} FROM entries e ORDER BY e.position ASC`).all();
    const byId = new Map(rows.map((row) => [row.id, {
      id: row.id,
      lemma: row.lemma || "",
      pronunciation: row.pronunciation || "",
      tags: [],
      definitions: [],
      morphologyGroups: [],
      etymology: { sources: [], description: row.etymologyDescription || "" },
      notes: row.notes || "",
    }]));
    db.prepare(`
      SELECT id, entry_id AS entryId, position, meaning, example, notes
      FROM definitions
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      byId.get(row.entryId)?.definitions.push({
        id: row.id,
        meaning: row.meaning || "",
        example: row.example || "",
        note: row.notes || "",
      });
    });
    db.prepare(`
      SELECT entry_id AS entryId, position, tag
      FROM entry_tags
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      byId.get(row.entryId)?.tags.push(row.tag || "");
    });
    db.prepare(`
      SELECT entry_id AS entryId, position, source_text AS sourceText
      FROM entry_sources
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      byId.get(row.entryId)?.etymology.sources.push(row.sourceText || "");
    });
    db.prepare(`
      SELECT entry_id AS entryId, template_group_id AS templateGroupId, position, notes
      FROM entry_morphology_groups
      ORDER BY entry_id ASC, position ASC
    `).all().forEach((row) => {
      byId.get(row.entryId)?.morphologyGroups.push({
        templateGroupId: row.templateGroupId,
        notes: row.notes || "",
      });
    });
    return rows.map((row) => byId.get(row.id));
  }

  insertEntrySearchRecords(entry, dictionary, insert, normalizeSearchValue) {
    entrySearchValueRecords(entry, dictionary, { fields: STATIC_ENTRY_SEARCH_FIELDS }).forEach((record) => {
      insert.run(
        entry.id,
        record.field,
        record.sourceType,
        record.sourceId,
        record.sourcePosition,
        record.valueType,
        record.value,
        normalizeSearchValue(record.value),
      );
    });
  }

  writeEntrySearchProjection(db, entry, dictionary) {
    db.prepare("DELETE FROM entry_search_values WHERE entry_id = ?").run(entry.id);
    const insert = db.prepare(`
      INSERT INTO entry_search_values(
        entry_id, field, source_type, source_id, source_position, value_type, raw_value, normalized_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    this.insertEntrySearchRecords(entry, dictionary, insert, searchRuntime.normalizeText);
  }

  rebuildEntrySearchProjection(db, dictionary) {
    db.prepare("DELETE FROM entry_search_values").run();
    const insert = db.prepare(`
      INSERT INTO entry_search_values(
        entry_id, field, source_type, source_id, source_position, value_type, raw_value, normalized_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    this.staticSearchEntriesFromDatabase(db).forEach((entry) => {
      this.insertEntrySearchRecords(entry, dictionary, insert, searchRuntime.normalizeText);
    });
  }

  insertEntryMorphologySearchRecords(entry, dictionary, insert, normalizeSearchValue) {
    morphologySearchValueRecords(entry, dictionary).forEach((record) => {
      const value = String(record.value || "");
      if (!value) {
        return;
      }
      insert.run(
        entry.id,
        record.sourcePosition,
        record.templateGroupId,
        record.tableId,
        record.rowIndex,
        record.columnIndex,
        value,
        normalizeSearchValue(value),
      );
    });
  }

  writeEntryMorphologySearchProjection(db, entry, dictionary) {
    db.prepare("DELETE FROM entry_morphology_search_values WHERE entry_id = ?").run(entry.id);
    const insert = db.prepare(`
      INSERT INTO entry_morphology_search_values(
        entry_id, position, template_group_id, template_table_id,
        row_index, column_index, raw_value, normalized_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    this.insertEntryMorphologySearchRecords(entry, dictionary, insert, searchRuntime.normalizeText);
  }

  writeEntryMorphologySearchProjections(db, entryIds = [], dictionary = {}) {
    const uniqueIds = [...new Set(entryIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return;
    }
    chunkArray(uniqueIds).forEach((entryIdChunk) => {
      db.prepare(`
        DELETE FROM entry_morphology_search_values
        WHERE entry_id IN (${sqlPlaceholders(entryIdChunk)})
      `).run(...entryIdChunk);
    });
    const insert = db.prepare(`
      INSERT INTO entry_morphology_search_values(
        entry_id, position, template_group_id, template_table_id,
        row_index, column_index, raw_value, normalized_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    chunkArray(uniqueIds).forEach((entryIdChunk) => {
      const rows = db.prepare(`
        SELECT ${entrySelectColumns("e")}
        FROM entries e
        WHERE e.id IN (${sqlPlaceholders(entryIdChunk)})
        ORDER BY e.position ASC, e.id ASC
      `).all(...entryIdChunk);
      this.entriesFromRows(db, rows).forEach((entry) => {
        this.insertEntryMorphologySearchRecords(entry, dictionary, insert, searchRuntime.normalizeText);
      });
    });
  }

  rebuildEntryMorphologySearchProjection(db, dictionary) {
    db.prepare("DELETE FROM entry_morphology_search_values").run();
    const insert = db.prepare(`
      INSERT INTO entry_morphology_search_values(
        entry_id, position, template_group_id, template_table_id,
        row_index, column_index, raw_value, normalized_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const searchRuntime = searchSettingsQueryOptions(dictionary.settings?.search);
    const rows = db.prepare(`SELECT ${entrySelectColumns("e")} FROM entries e ORDER BY e.position ASC`).all();
    this.entriesFromRows(db, rows).forEach((entry) => {
      this.insertEntryMorphologySearchRecords(entry, dictionary, insert, searchRuntime.normalizeText);
    });
  }

  writeEntryProjection(db, entry, position, dictionary) {
    db.prepare("DELETE FROM definitions WHERE entry_id = ?").run(entry.id);
    db.prepare("DELETE FROM entry_tags WHERE entry_id = ?").run(entry.id);
    db.prepare("DELETE FROM entry_sources WHERE entry_id = ?").run(entry.id);
    db.prepare("DELETE FROM entry_morphology_cell_overrides WHERE entry_id = ?").run(entry.id);
    db.prepare("DELETE FROM entry_morphology_groups WHERE entry_id = ?").run(entry.id);
    db.prepare(`
      INSERT INTO entries(id, position, lemma, pronunciation, notes, etymology_description, morphology_mode, created_at, updated_at, sort_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        lemma = excluded.lemma,
        pronunciation = excluded.pronunciation,
        notes = excluded.notes,
        etymology_description = excluded.etymology_description,
        morphology_mode = excluded.morphology_mode,
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
      entry.morphologyMode,
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
        definition.note || "",
        entry.updatedAt || "",
      );
    });

    const insertTag = db.prepare(`
      INSERT INTO entry_tags(entry_id, position, tag)
      VALUES (?, ?, ?)
    `);
    (entry.tags || []).forEach((tag, tagIndex) => {
      insertTag.run(entry.id, tagIndex, tag);
    });

    const insertSource = db.prepare(`
      INSERT INTO entry_sources(entry_id, position, source_text, source_key)
      VALUES (?, ?, ?, ?)
    `);
    (entry.etymology?.sources || []).forEach((source, sourceIndex) => {
      insertSource.run(entry.id, sourceIndex, source, normalizeText(source));
    });

    const insertMorphologyGroup = db.prepare(`
      INSERT INTO entry_morphology_groups(entry_id, template_group_id, position, title, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMorphologyOverride = db.prepare(`
      INSERT INTO entry_morphology_cell_overrides(entry_id, template_group_id, template_table_id, row_index, column_index, value)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    normalizeEntryMorphologyState(entry).morphologyGroups.forEach((group, groupIndex) => {
      insertMorphologyGroup.run(
        entry.id,
        group.templateGroupId,
        entry.morphologyMode === "manual" ? groupIndex : 0,
        group.title || "",
        group.notes || "",
        group.createdAt || entry.createdAt || "",
        group.updatedAt || entry.updatedAt || "",
      );
      morphologyOverrideRows(group.overrides).forEach((override) => {
        insertMorphologyOverride.run(entry.id, group.templateGroupId, override.tableId, override.rowIndex, override.columnIndex, override.value);
      });
    });
    this.writeEntrySearchProjection(db, entry, dictionary);
    this.writeEntryMorphologySearchProjection(db, entry, dictionary);
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
    const morphologyBlob = blobs.get("morphology") || {};
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
      morphology: this.morphologyFromDatabase(db, morphologyBlob),
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
        DELETE FROM entry_morphology_search_values;
        DELETE FROM entry_search_values;
        DELETE FROM definitions;
        DELETE FROM entry_tags;
        DELETE FROM entry_sources;
        DELETE FROM entry_morphology_cell_overrides;
        DELETE FROM entry_morphology_groups;
        DELETE FROM morphology_template_cells;
        DELETE FROM morphology_template_tables;
        DELETE FROM morphology_template_groups;
        DELETE FROM entries;
        DELETE FROM module_blobs;
        DELETE FROM dictionary_meta;
      `);
      db.prepare(`
        INSERT INTO dictionary_meta(id, name, language, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        dictionary.id,
        dictionary.name || "",
        dictionary.language || "",
        dictionary.description || "",
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
        ["morphology", morphologyModuleBlob(dictionary.morphology || {})],
      ].forEach(([module, value]) => {
        insertBlob.run(module, JSON.stringify(value), dictionary.updatedAt || now);
      });
      this.writeMorphologyProjection(db, dictionary.morphology || {}, dictionary.updatedAt || now);

      const insertEntry = db.prepare(`
        INSERT INTO entries(id, position, lemma, pronunciation, notes, etymology_description, morphology_mode, created_at, updated_at, sort_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertDefinition = db.prepare(`
        INSERT INTO definitions(id, entry_id, position, meaning, example, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertTag = db.prepare(`
        INSERT INTO entry_tags(entry_id, position, tag)
        VALUES (?, ?, ?)
      `);
      const insertSource = db.prepare(`
        INSERT INTO entry_sources(entry_id, position, source_text, source_key)
        VALUES (?, ?, ?, ?)
      `);
      const insertMorphologyGroup = db.prepare(`
        INSERT INTO entry_morphology_groups(entry_id, template_group_id, position, title, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMorphologyOverride = db.prepare(`
        INSERT INTO entry_morphology_cell_overrides(entry_id, template_group_id, template_table_id, row_index, column_index, value)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      (dictionary.entries || []).forEach((entry, entryIndex) => {
        insertEntry.run(
          entry.id,
          entryIndex,
          entry.lemma || "",
          entry.pronunciation || "",
          entry.notes || "",
          entry.etymology?.description || "",
          entry.morphologyMode,
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
            definition.note || "",
            entry.updatedAt || dictionary.updatedAt || now,
          );
        });
        (entry.tags || []).forEach((tag, tagIndex) => {
          insertTag.run(entry.id, tagIndex, tag);
        });
        (entry.etymology?.sources || []).forEach((source, sourceIndex) => {
          insertSource.run(entry.id, sourceIndex, source, normalizeText(source));
        });
        normalizeEntryMorphologyState(entry).morphologyGroups.forEach((group, groupIndex) => {
          insertMorphologyGroup.run(
            entry.id,
            group.templateGroupId,
            entry.morphologyMode === "manual" ? groupIndex : 0,
            group.title || "",
            group.notes || "",
            group.createdAt || entry.createdAt || "",
            group.updatedAt || entry.updatedAt || dictionary.updatedAt || now,
          );
          morphologyOverrideRows(group.overrides).forEach((override) => {
            insertMorphologyOverride.run(entry.id, group.templateGroupId, override.tableId, override.rowIndex, override.columnIndex, override.value);
          });
        });
      });

      this.rebuildEntrySearchProjection(db, dictionary);
      this.rebuildEntryMorphologySearchProjection(db, dictionary);

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
    registerSqliteFunctions(db);
    db.exec("PRAGMA foreign_keys = ON;");
    this.applySchema(db);
    this.connections.set(id, db);
    return db;
  }

  applySchema(db) {
    db.exec(SQLITE_SCHEMA);
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
    this.querySessionCache.clear();
    this.rootTopologyCache.clear();
  }

  closeDictionary(id) {
    const db = this.connections.get(id);
    if (db) {
      db.close();
      this.connections.delete(id);
    }
  }
}

function reserveDictionaryId(value) {
  const existing = String(value || "").trim();
  return existing || `dict-${crypto.randomUUID()}`;
}

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS dictionary_meta (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT,
  description TEXT,
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
  morphology_mode TEXT NOT NULL DEFAULT 'auto' CHECK(morphology_mode IN ('auto', 'manual')),
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
  PRIMARY KEY(entry_id, position)
);

CREATE TABLE IF NOT EXISTS entry_sources (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_key TEXT NOT NULL,
  PRIMARY KEY(entry_id, position)
);

CREATE TABLE IF NOT EXISTS entry_search_values (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '',
  source_position INTEGER NOT NULL,
  value_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  PRIMARY KEY(entry_id, field, source_type, source_position, value_type)
);

CREATE TABLE IF NOT EXISTS entry_morphology_search_values (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  template_group_id TEXT NOT NULL,
  template_table_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  PRIMARY KEY(entry_id, template_group_id, template_table_id, row_index, column_index)
);

CREATE TABLE IF NOT EXISTS morphology_template_groups (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  match_tags_json TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS morphology_template_tables (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  column_count INTEGER NOT NULL,
  row_labels_json TEXT NOT NULL,
  column_labels_json TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS morphology_template_cells (
  table_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  PRIMARY KEY(table_id, row_index, column_index)
);

CREATE TABLE IF NOT EXISTS entry_morphology_groups (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  template_group_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY(entry_id, template_group_id)
);

CREATE TABLE IF NOT EXISTS entry_morphology_cell_overrides (
  entry_id TEXT NOT NULL,
  template_group_id TEXT NOT NULL,
  template_table_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY(entry_id, template_group_id, template_table_id, row_index, column_index),
  FOREIGN KEY(entry_id, template_group_id)
    REFERENCES entry_morphology_groups(entry_id, template_group_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entries_lemma ON entries(lemma);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag_entry ON entry_tags(tag, entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_sources_source_key ON entry_sources(source_key);
CREATE INDEX IF NOT EXISTS idx_entry_search_values_field ON entry_search_values(field, entry_id);
CREATE INDEX IF NOT EXISTS idx_definitions_entry_id ON definitions(entry_id);
CREATE INDEX IF NOT EXISTS idx_morphology_template_tables_group_id ON morphology_template_tables(group_id);
CREATE INDEX IF NOT EXISTS idx_morphology_template_cells_table_id ON morphology_template_cells(table_id);
CREATE INDEX IF NOT EXISTS idx_entry_morphology_groups_entry_id ON entry_morphology_groups(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_morphology_overrides_group ON entry_morphology_cell_overrides(entry_id, template_group_id);
`;

module.exports = {
  SQLITE_SCHEMA,
  SqliteDictionaryRepository,
};
