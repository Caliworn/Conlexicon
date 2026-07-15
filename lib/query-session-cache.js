function sortedUniqueStrings(values) {
  const source = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
  return [...new Set(source.map((value) => String(value || "")).filter(Boolean))].sort();
}

function createQueryDescriptor({
  kind,
  dictionaryId,
  dictionaryUpdatedAt = "",
  cacheGeneration = 0,
  query = {},
}) {
  const descriptor = {
    kind: String(kind || ""),
    dictionaryId: String(dictionaryId || ""),
    dictionaryUpdatedAt: String(dictionaryUpdatedAt || ""),
    cacheGeneration: Number(cacheGeneration) || 0,
    q: String(query.q || ""),
    sort: String(query.sort || "lemmaAsc"),
    fields: sortedUniqueStrings(query.searchFields || query.fields),
    fuzzyFields: sortedUniqueStrings(query.fuzzyFields),
  };
  if (descriptor.kind === "entries") {
    return {
      ...descriptor,
      part: String(query.part || ""),
      tags: sortedUniqueStrings(query.tags),
      tagMode: query.tagMode === "all" ? "all" : "any",
      source: String(query.source || ""),
      derivedFrom: String(query.derivedFrom || ""),
    };
  }
  if (!descriptor.q) {
    descriptor.fields = [];
    descriptor.fuzzyFields = [];
  }
  return descriptor;
}

function queryDescriptorKey(descriptor) {
  return JSON.stringify(descriptor);
}

function estimateValueBytes(value) {
  const seen = new WeakSet();
  const pending = [value];
  let bytes = 0;
  while (pending.length) {
    const current = pending.pop();
    if (current === null || current === undefined) {
      bytes += 4;
    } else if (typeof current === "string") {
      bytes += current.length * 2;
    } else if (typeof current === "number" || typeof current === "bigint") {
      bytes += 8;
    } else if (typeof current === "boolean") {
      bytes += 4;
    } else if (typeof current === "object" && !seen.has(current)) {
      seen.add(current);
      bytes += Array.isArray(current) ? current.length * 8 : 32;
      Object.entries(current).forEach(([key, child]) => {
        bytes += key.length * 2;
        pending.push(child);
      });
    }
  }
  return bytes;
}

class QuerySessionCache {
  constructor(options = {}) {
    this.maxSessionsPerDictionary = Math.max(1, Number(options.maxSessionsPerDictionary) || 8);
    this.maxBytes = Math.max(1, Number(options.maxBytes) || 64 * 1024 * 1024);
    this.idleTtlMs = Math.max(1, Number(options.idleTtlMs) || 2 * 60 * 1000);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.estimateBytes = typeof options.estimateBytes === "function" ? options.estimateBytes : estimateValueBytes;
    this.sessions = new Map();
    this.inFlight = new Map();
    this.generations = new Map();
    this.totalBytes = 0;
    this.nextSessionId = 1;
    this.metrics = {
      hits: 0,
      misses: 0,
      inFlightHits: 0,
      builds: 0,
      buildMs: 0,
      evictions: 0,
      invalidations: 0,
      oversized: 0,
    };
  }

  generation(dictionaryId) {
    return this.generations.get(String(dictionaryId || "")) || 0;
  }

  async getOrCreate({ kind, dictionaryId, dictionaryUpdatedAt = "", query = {}, build }) {
    if (typeof build !== "function") {
      throw new TypeError("QuerySessionCache.getOrCreate requires a build function.");
    }
    const normalizedDictionaryId = String(dictionaryId || "");
    const generation = this.generation(normalizedDictionaryId);
    const descriptor = createQueryDescriptor({
      kind,
      dictionaryId: normalizedDictionaryId,
      dictionaryUpdatedAt,
      cacheGeneration: generation,
      query,
    });
    const descriptorKey = queryDescriptorKey(descriptor);
    const cached = this.get(descriptorKey);
    if (cached) {
      this.metrics.hits += 1;
      return cached;
    }
    const pending = this.inFlight.get(descriptorKey);
    if (pending) {
      this.metrics.hits += 1;
      this.metrics.inFlightHits += 1;
      return pending.promise;
    }

    this.metrics.misses += 1;
    const startedAt = this.now();
    const promise = Promise.resolve()
      .then(() => build(descriptor))
      .then((value) => {
        const completedAt = this.now();
        this.metrics.builds += 1;
        this.metrics.buildMs += Math.max(0, completedAt - startedAt);
        const session = {
          sessionId: `query-session-${this.nextSessionId++}`,
          descriptor,
          descriptorKey,
          kind: descriptor.kind,
          dictionaryId: normalizedDictionaryId,
          dictionaryUpdatedAt: descriptor.dictionaryUpdatedAt,
          cacheGeneration: generation,
          createdAt: completedAt,
          lastAccessAt: completedAt,
          ...value,
        };
        session.estimatedBytes = Math.max(0, Number(this.estimateBytes(session)) || 0);
        if (this.generation(normalizedDictionaryId) === generation) {
          this.set(descriptorKey, session);
        }
        return session;
      })
      .finally(() => {
        if (this.inFlight.get(descriptorKey)?.promise === promise) {
          this.inFlight.delete(descriptorKey);
        }
      });
    this.inFlight.set(descriptorKey, {
      dictionaryId: normalizedDictionaryId,
      generation,
      promise,
    });
    return promise;
  }

  get(descriptorKey) {
    this.evictExpired();
    const session = this.sessions.get(descriptorKey);
    if (!session) {
      return null;
    }
    session.lastAccessAt = this.now();
    this.sessions.delete(descriptorKey);
    this.sessions.set(descriptorKey, session);
    return session;
  }

  set(descriptorKey, session) {
    const previous = this.sessions.get(descriptorKey);
    if (previous) {
      this.totalBytes -= previous.estimatedBytes || 0;
      this.sessions.delete(descriptorKey);
    }
    if (session.estimatedBytes > this.maxBytes) {
      this.metrics.oversized += 1;
      return false;
    }
    this.sessions.set(descriptorKey, session);
    this.totalBytes += session.estimatedBytes;
    this.evictOverflow(session.dictionaryId);
    return this.sessions.has(descriptorKey);
  }

  invalidateDictionary(dictionaryId) {
    const normalizedDictionaryId = String(dictionaryId || "");
    if (!normalizedDictionaryId) {
      return;
    }
    this.generations.set(normalizedDictionaryId, this.generation(normalizedDictionaryId) + 1);
    this.metrics.invalidations += 1;
    [...this.sessions.entries()].forEach(([key, session]) => {
      if (session.dictionaryId === normalizedDictionaryId) {
        this.remove(key, "invalidation");
      }
    });
    [...this.inFlight.entries()].forEach(([key, pending]) => {
      if (pending.dictionaryId === normalizedDictionaryId) {
        this.inFlight.delete(key);
      }
    });
  }

  evictExpired() {
    const cutoff = this.now() - this.idleTtlMs;
    [...this.sessions.entries()].forEach(([key, session]) => {
      if (session.lastAccessAt < cutoff) {
        this.remove(key, "ttl");
      }
    });
  }

  evictOverflow(dictionaryId) {
    const dictionaryKeys = () => [...this.sessions.entries()]
      .filter(([, session]) => session.dictionaryId === dictionaryId)
      .map(([key]) => key);
    let keys = dictionaryKeys();
    while (keys.length > this.maxSessionsPerDictionary) {
      this.remove(keys[0], "dictionary-limit");
      keys = dictionaryKeys();
    }
    while (this.totalBytes > this.maxBytes && this.sessions.size) {
      this.remove(this.sessions.keys().next().value, "byte-limit");
    }
  }

  remove(key, reason = "eviction") {
    const session = this.sessions.get(key);
    if (!session) {
      return;
    }
    this.sessions.delete(key);
    this.totalBytes -= session.estimatedBytes || 0;
    if (reason !== "invalidation") {
      this.metrics.evictions += 1;
    }
  }

  clear() {
    this.sessions.clear();
    this.inFlight.clear();
    this.generations.clear();
    this.totalBytes = 0;
  }

  stats() {
    this.evictExpired();
    const sessionsByKind = {};
    this.sessions.forEach((session) => {
      sessionsByKind[session.kind] = (sessionsByKind[session.kind] || 0) + 1;
    });
    return {
      ...this.metrics,
      sessionCount: this.sessions.size,
      inFlightCount: this.inFlight.size,
      estimatedBytes: this.totalBytes,
      sessionsByKind,
    };
  }
}

module.exports = {
  QuerySessionCache,
  createQueryDescriptor,
  estimateValueBytes,
  queryDescriptorKey,
};
