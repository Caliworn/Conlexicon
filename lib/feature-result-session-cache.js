const { estimateValueBytes } = require("./query-session-cache");

class FeatureResultSessionCache {
  constructor(options = {}) {
    this.maxSessionsPerDictionary = Math.max(1, Number(options.maxSessionsPerDictionary) || 4);
    this.maxBytes = Math.max(1, Number(options.maxBytes) || 32 * 1024 * 1024);
    this.idleTtlMs = Math.max(1, Number(options.idleTtlMs) || 2 * 60 * 1000);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.estimateBytes = typeof options.estimateBytes === "function" ? options.estimateBytes : estimateValueBytes;
    this.sessions = new Map();
    this.inFlight = new Map();
    this.totalBytes = 0;
    this.nextSessionId = 1;
    this.metrics = {
      hits: 0,
      misses: 0,
      inFlightHits: 0,
      builds: 0,
      buildMs: 0,
      evictions: 0,
      oversized: 0,
    };
  }

  descriptorKey(descriptor) {
    return JSON.stringify(descriptor);
  }

  async getOrCreate({ descriptor, build, isCurrent = () => true }) {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      throw new TypeError("FeatureResultSessionCache requires a descriptor.");
    }
    if (typeof build !== "function") {
      throw new TypeError("FeatureResultSessionCache requires a build function.");
    }
    const descriptorKey = this.descriptorKey(descriptor);
    const cached = this.get(descriptorKey);
    if (cached) {
      this.metrics.hits += 1;
      return { session: cached, cacheStatus: "hit" };
    }
    const pending = this.inFlight.get(descriptorKey);
    if (pending) {
      this.metrics.hits += 1;
      this.metrics.inFlightHits += 1;
      return { session: await pending, cacheStatus: "in_flight" };
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
          sessionId: `feature-session-${this.nextSessionId++}`,
          descriptor,
          descriptorKey,
          dictionaryId: String(descriptor.dictionaryId || ""),
          generation: Number(descriptor.generation) || 0,
          createdAt: completedAt,
          lastAccessAt: completedAt,
          ...value,
        };
        session.estimatedBytes = Math.max(0, Number(this.estimateBytes(session)) || 0);
        if (isCurrent()) {
          this.set(descriptorKey, session);
        }
        return session;
      })
      .finally(() => {
        if (this.inFlight.get(descriptorKey) === promise) {
          this.inFlight.delete(descriptorKey);
        }
      });
    this.inFlight.set(descriptorKey, promise);
    return { session: await promise, cacheStatus: "miss" };
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

  evictExpired() {
    const cutoff = this.now() - this.idleTtlMs;
    [...this.sessions.entries()].forEach(([key, session]) => {
      if (session.lastAccessAt < cutoff) {
        this.remove(key);
      }
    });
  }

  evictOverflow(dictionaryId) {
    const dictionaryKeys = () => [...this.sessions.entries()]
      .filter(([, session]) => session.dictionaryId === dictionaryId)
      .map(([key]) => key);
    let keys = dictionaryKeys();
    while (keys.length > this.maxSessionsPerDictionary) {
      this.remove(keys[0]);
      keys = dictionaryKeys();
    }
    while (this.totalBytes > this.maxBytes && this.sessions.size) {
      this.remove(this.sessions.keys().next().value);
    }
  }

  remove(key) {
    const session = this.sessions.get(key);
    if (!session) {
      return;
    }
    this.sessions.delete(key);
    this.totalBytes -= session.estimatedBytes || 0;
    this.metrics.evictions += 1;
  }

  clear() {
    this.sessions.clear();
    this.inFlight.clear();
    this.totalBytes = 0;
  }

  stats() {
    this.evictExpired();
    return {
      ...this.metrics,
      sessionCount: this.sessions.size,
      inFlightCount: this.inFlight.size,
      estimatedBytes: this.totalBytes,
    };
  }
}

module.exports = {
  FeatureResultSessionCache,
};
