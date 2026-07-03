const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { apiError } = require("./api-error");

const ENTRY_PATCH_ALLOWED_FIELDS = new Set(["pronunciation", "tags"]);

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

  async queryEntries(id) {
    await this.requireDictionary(id);
    const dictionary = await this.readDictionary(id);
    return dictionary.entries;
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
