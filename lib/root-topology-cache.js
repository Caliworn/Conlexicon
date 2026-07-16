class RootTopologyCache {
  constructor(options = {}) {
    this.maxDictionaries = Math.max(1, Number(options.maxDictionaries) || 8);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.entries = new Map();
    this.generations = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      builds: 0,
      buildMs: 0,
      entryUpdates: 0,
      invalidations: 0,
      evictions: 0,
    };
  }

  generation(dictionaryId) {
    return this.generations.get(String(dictionaryId || "")) || 0;
  }

  getOrCreate({ dictionaryId, build }) {
    if (typeof build !== "function") {
      throw new TypeError("RootTopologyCache.getOrCreate requires a build function.");
    }
    const normalizedDictionaryId = String(dictionaryId || "");
    const generation = this.generation(normalizedDictionaryId);
    const cached = this.entries.get(normalizedDictionaryId);
    if (cached?.generation === generation) {
      this.metrics.hits += 1;
      cached.lastAccessAt = this.now();
      this.entries.delete(normalizedDictionaryId);
      this.entries.set(normalizedDictionaryId, cached);
      return cached.value;
    }

    if (cached) {
      this.entries.delete(normalizedDictionaryId);
    }
    this.metrics.misses += 1;
    const startedAt = this.now();
    const value = build();
    const completedAt = this.now();
    this.metrics.builds += 1;
    this.metrics.buildMs += Math.max(0, completedAt - startedAt);
    this.entries.set(normalizedDictionaryId, {
      dictionaryId: normalizedDictionaryId,
      generation,
      createdAt: completedAt,
      lastAccessAt: completedAt,
      value,
    });
    while (this.entries.size > this.maxDictionaries) {
      this.entries.delete(this.entries.keys().next().value);
      this.metrics.evictions += 1;
    }
    return value;
  }

  updateEntryRecords(dictionaryId, records = []) {
    const normalizedDictionaryId = String(dictionaryId || "");
    const cached = this.entries.get(normalizedDictionaryId);
    if (!cached || cached.generation !== this.generation(normalizedDictionaryId) || !records.length) {
      return false;
    }
    const topology = cached.value;
    if (
      !(topology?.entriesById instanceof Map)
      || !(topology?.groupsByRootId instanceof Map)
      || !(topology?.rootIdsByEntryId instanceof Map)
      || !(topology?.groupsBySort instanceof Map)
    ) {
      return false;
    }
    for (const record of records) {
      if (!record?.id || !topology.entriesById.has(record.id)) {
        this.invalidateDictionary(normalizedDictionaryId);
        return false;
      }
    }
    records.forEach((record) => {
      topology.entriesById.set(record.id, {
        ...topology.entriesById.get(record.id),
        ...record,
      });
    });
    topology.groupsBySort.clear();
    cached.lastAccessAt = this.now();
    this.entries.delete(normalizedDictionaryId);
    this.entries.set(normalizedDictionaryId, cached);
    this.metrics.entryUpdates += records.length;
    return true;
  }

  invalidateDictionary(dictionaryId) {
    const normalizedDictionaryId = String(dictionaryId || "");
    if (!normalizedDictionaryId) {
      return;
    }
    this.generations.set(normalizedDictionaryId, this.generation(normalizedDictionaryId) + 1);
    this.entries.delete(normalizedDictionaryId);
    this.metrics.invalidations += 1;
  }

  clear() {
    this.entries.clear();
    this.generations.clear();
  }

  stats() {
    return {
      ...this.metrics,
      dictionaryCount: this.entries.size,
    };
  }
}

module.exports = {
  RootTopologyCache,
};
