const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
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

  async queryEntries(id) {
    const dictionary = await this.readDictionary(id);
    return dictionary.entries;
  }

  async getEntry(id, entryId) {
    const entries = await this.queryEntries(id);
    return entries.find((entry) => entry.id === entryId) || null;
  }

  async saveEntry(id, entry) {
    const dictionary = await this.readDictionary(id);
    const entries = Array.isArray(dictionary.entries) ? [...dictionary.entries] : [];
    const entryIndex = entries.findIndex((item) => item.id === entry.id);
    if (entryIndex === -1) {
      entries.push(entry);
    } else {
      entries[entryIndex] = entry;
    }
    return this.writeDictionary({ ...dictionary, entries });
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
    const dictionary = await this.readDictionary(id);
    return this.writeDictionary({
      ...dictionary,
      corpus: {
        ...dictionary.corpus,
        ...changes,
      },
    });
  }

  async exportDictionary(id) {
    const index = await this.readIndex();
    const dictionaryId = id || index.activeDictionaryId;
    if (!dictionaryId || !index.dictionaryIds.includes(dictionaryId)) {
      throw httpError("Dictionary not found", 404);
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
      throw httpError("Dictionary ID already exists; overwrite confirmation required", 409);
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
      throw httpError("Dictionary not found", 404);
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

  async writeDictionary(dictionary) {
    const normalized = this.normalizeDictionary(dictionary);
    this.validateDictionary(normalized);
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
      throw httpError("Invalid dictionary id", 400);
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
