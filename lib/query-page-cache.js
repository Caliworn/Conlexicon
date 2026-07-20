(function initQueryPageCache(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConlexiconQueryPageCache = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createQueryPageCache() {
  function estimateValueBytes(value) {
    const seen = new WeakSet();
    const pending = [value];
    let bytes = 0;

    while (pending.length) {
      const current = pending.pop();
      if (current === null || current === undefined) {
        bytes += 4;
        continue;
      }
      if (typeof current === "string") {
        bytes += current.length * 2;
        continue;
      }
      if (typeof current === "number" || typeof current === "bigint") {
        bytes += 8;
        continue;
      }
      if (typeof current === "boolean") {
        bytes += 4;
        continue;
      }
      if (typeof current !== "object" || seen.has(current)) {
        continue;
      }
      seen.add(current);
      bytes += Array.isArray(current) ? current.length * 8 : 32;
      Object.entries(current).forEach(([key, child]) => {
        bytes += key.length * 2;
        pending.push(child);
      });
    }

    return bytes;
  }

  class QueryPageCache {
    constructor(options = {}) {
      this.maxEntries = Math.max(1, Number(options.maxEntries) || 4);
      this.maxBytes = Math.max(1, Number(options.maxBytes) || 16 * 1024 * 1024);
      this.estimateBytes = typeof options.estimateBytes === "function"
        ? options.estimateBytes
        : estimateValueBytes;
      this.entries = new Map();
      this.inFlight = new Map();
      this.dictionaryGenerations = new Map();
      this.totalBytes = 0;
    }

    get(key) {
      const entry = this.entries.get(key);
      if (!entry) {
        return undefined;
      }
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.value;
    }

    set(key, value, options = {}) {
      const dictionaryId = String(options.dictionaryId || "");
      const bytes = Math.max(0, Number(this.estimateBytes(value)) || 0);
      const previous = this.entries.get(key);
      if (previous) {
        this.totalBytes -= previous.bytes;
        this.entries.delete(key);
      }
      if (bytes > this.maxBytes) {
        return false;
      }

      this.entries.set(key, { dictionaryId, value, bytes });
      this.totalBytes += bytes;
      this.evictOverflow();
      return this.entries.has(key);
    }

    load(options = {}) {
      const key = String(options.key || "");
      const dictionaryId = String(options.dictionaryId || "");
      const load = options.load;
      const transform = typeof options.transform === "function" ? options.transform : (value) => value;
      if (!key || typeof load !== "function") {
        return Promise.reject(new TypeError("QueryPageCache.load requires a key and load function."));
      }

      const cached = this.get(key);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }
      const pending = this.inFlight.get(key);
      if (pending) {
        return pending.promise;
      }

      const generation = this.dictionaryGeneration(dictionaryId);
      const promise = Promise.resolve()
        .then(load)
        .then(transform)
        .then((value) => {
          if (this.dictionaryGeneration(dictionaryId) === generation) {
            this.set(key, value, { dictionaryId });
          }
          return value;
        })
        .finally(() => {
          if (this.inFlight.get(key)?.promise === promise) {
            this.inFlight.delete(key);
          }
        });
      this.inFlight.set(key, { dictionaryId, promise });
      return promise;
    }

    invalidateDictionary(dictionaryId) {
      const normalizedId = String(dictionaryId || "");
      if (!normalizedId) {
        return;
      }
      this.dictionaryGenerations.set(normalizedId, this.dictionaryGeneration(normalizedId) + 1);
      [...this.entries.entries()].forEach(([key, entry]) => {
        if (entry.dictionaryId === normalizedId) {
          this.totalBytes -= entry.bytes;
          this.entries.delete(key);
        }
      });
      [...this.inFlight.entries()].forEach(([key, pending]) => {
        if (pending.dictionaryId === normalizedId) {
          this.inFlight.delete(key);
        }
      });
    }

    clear() {
      this.entries.clear();
      this.inFlight.clear();
      this.dictionaryGenerations.clear();
      this.totalBytes = 0;
    }

    dictionaryGeneration(dictionaryId) {
      return this.dictionaryGenerations.get(dictionaryId) || 0;
    }

    evictOverflow() {
      while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
        const oldestKey = this.entries.keys().next().value;
        const oldest = this.entries.get(oldestKey);
        this.totalBytes -= oldest?.bytes || 0;
        this.entries.delete(oldestKey);
      }
    }
  }

  return {
    QueryPageCache,
    estimateValueBytes,
  };
});
