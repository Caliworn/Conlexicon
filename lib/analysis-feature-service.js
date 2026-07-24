const crypto = require("node:crypto");
const { apiError } = require("./api-error");
const { searchSettingsQueryOptions } = require("./entry-search-model");
const {
  FeatureResultQueryValidationError,
  featureResultViewIdentity,
  normalizeFeatureResultLocationQuery,
  normalizeFeatureResultQuery,
} = require("./feature-result-query-model");
const { FeatureResultSessionCache } = require("./feature-result-session-cache");
const { normalizeIpaSettings } = require("./ipa-model");
const { createSimpleIpaEngine } = require("./phonology-engine");

const OUTCOME_KEYS = [
  "exactMatch",
  "normalizedOnlyMatch",
  "mismatch",
  "unavailable",
  "failed",
];
const VIEW_OUTCOMES = {
  match: new Set(["exactMatch"]),
  looseMismatch: new Set(["mismatch"]),
  strictMismatch: new Set(["normalizedOnlyMatch", "mismatch"]),
};
const VIEW_CACHE_LIMIT = 12;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("base64url");
}

function stableDiagnostic(code, details = undefined) {
  return {
    code,
    ...(details === undefined ? {} : { details }),
  };
}

function featureValidationApiError(error) {
  if (!(error instanceof FeatureResultQueryValidationError)) {
    throw error;
  }
  throw apiError(error.message, 400, error.code, error.details);
}

function normalizeFeatureRecordResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      outcome: "failed",
      generated: "",
      diagnostics: [stableDiagnostic("invalid_phonology_engine_result")],
    };
  }
  if (result.status === "unavailable") {
    return {
      outcome: "unavailable",
      generated: "",
      diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics : [],
    };
  }
  const generated = String(result.primary || "");
  if (result.status !== "generated" || !generated.trim()) {
    return {
      outcome: "failed",
      generated: "",
      diagnostics: [stableDiagnostic("invalid_phonology_engine_result")],
    };
  }
  return {
    outcome: "",
    generated,
    diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics : [],
  };
}

function nextEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

class AnalysisFeatureService {
  constructor(options = {}) {
    if (!options.repository) {
      throw new TypeError("AnalysisFeatureService requires a repository.");
    }
    this.repository = options.repository;
    this.engine = options.engine || createSimpleIpaEngine();
    this.sessionCache = options.sessionCache || new FeatureResultSessionCache(options.sessionCacheOptions);
    this.processEpoch = options.processEpoch || crypto.randomUUID();
  }

  normalizeQuery(source) {
    try {
      return normalizeFeatureResultQuery(source);
    } catch (error) {
      return featureValidationApiError(error);
    }
  }

  normalizeLocationQuery(source) {
    try {
      return normalizeFeatureResultLocationQuery(source);
    } catch (error) {
      return featureValidationApiError(error);
    }
  }

  sessionDescriptor(dictionary, generation, source) {
    const ipaSettings = normalizeIpaSettings(dictionary.settings?.ipa);
    return {
      dictionaryId: dictionary.id,
      generation,
      source,
      engine: {
        id: String(this.engine.id || "unknown"),
        version: String(this.engine.version || "unknown"),
      },
      settingsDigest: sha256(JSON.stringify(ipaSettings)),
    };
  }

  async buildSession(dictionary, descriptor) {
    const records = this.repository.analysisFeatureEntryRecords(dictionary.id);
    const recordsById = new Map();
    const outcomeCounts = Object.fromEntries(OUTCOME_KEYS.map((key) => [key, 0]));
    const profile = {
      ipaSettings: normalizeIpaSettings(dictionary.settings?.ipa),
    };

    for (let index = 0; index < records.length; index += 1) {
      const entry = records[index];
      let feature;
      try {
        const generated = normalizeFeatureRecordResult(await this.engine.generate({
          input: {
            orthography: entry.lemma || "",
          },
          profile,
        }));
        feature = generated;
        if (!feature.outcome) {
          const comparison = await this.engine.compare({
            generated: feature.generated,
            observed: entry.pronunciation || "",
            profile,
          });
          if (!comparison || typeof comparison.exact !== "boolean" || typeof comparison.equivalent !== "boolean") {
            feature = {
              outcome: "failed",
              generated: feature.generated,
              diagnostics: [stableDiagnostic("invalid_phonology_engine_comparison")],
            };
          } else {
            feature.outcome = comparison.exact
              ? "exactMatch"
              : comparison.equivalent
                ? "normalizedOnlyMatch"
                : "mismatch";
          }
        }
      } catch (error) {
        feature = {
          outcome: "failed",
          generated: "",
          diagnostics: [stableDiagnostic("phonology_engine_failed", {
            cause: String(error?.code || error?.name || "unknown"),
          })],
        };
      }
      outcomeCounts[feature.outcome] += 1;
      recordsById.set(entry.id, feature);
      if (index > 0 && index % 128 === 0) {
        await nextEventLoopTurn();
      }
    }

    const summary = {
      inputTotal: records.length,
      outcomes: OUTCOME_KEYS.map((key) => ({ key, count: outcomeCounts[key] })),
      views: Object.entries(VIEW_OUTCOMES).map(([key, outcomes]) => ({
        key,
        count: [...outcomes].reduce((total, outcome) => total + outcomeCounts[outcome], 0),
      })),
    };
    return {
      resultKey: sha256(JSON.stringify(descriptor)),
      recordsById,
      summary,
      viewCache: new Map(),
    };
  }

  async currentSession(id, source) {
    while (true) {
      const generation = this.repository.querySessionGeneration(id);
      const dictionary = this.repository.dictionaryQueryContext(id);
      if (generation !== this.repository.querySessionGeneration(id)) {
        continue;
      }
      const descriptor = this.sessionDescriptor(dictionary, generation, source);
      const cached = await this.sessionCache.getOrCreate({
        descriptor,
        build: () => this.buildSession(dictionary, descriptor),
        isCurrent: () => this.repository.querySessionGeneration(id) === generation,
      });
      if (cached.session.generation === this.repository.querySessionGeneration(id)) {
        return {
          ...cached,
          dictionary,
        };
      }
    }
  }

  normalizeRuntimeSearch(query, dictionary) {
    const runtime = searchSettingsQueryOptions(dictionary.settings?.search);
    query.view.search.rawText = query.view.search.text;
    query.view.search.text = runtime.normalizeText(query.view.search.text);
    return query;
  }

  viewCacheKey(query) {
    return JSON.stringify(featureResultViewIdentity(query));
  }

  orderedViewIds(dictionary, session, query) {
    const key = this.viewCacheKey(query);
    const cached = session.viewCache.get(key);
    if (cached) {
      session.viewCache.delete(key);
      session.viewCache.set(key, cached);
      return { orderedIds: cached, cacheStatus: "hit" };
    }
    const outcomes = VIEW_OUTCOMES[query.view.category];
    const candidateIds = new Set();
    session.recordsById.forEach((feature, entryId) => {
      if (outcomes.has(feature.outcome)) {
        candidateIds.add(entryId);
      }
    });
    const orderedIds = this.repository.orderedAnalysisFeatureEntryIds(
      dictionary.id,
      candidateIds,
      {
        filter: {},
        search: query.view.search,
        sort: query.view.sort,
        page: query.page,
      },
    );
    session.viewCache.set(key, orderedIds);
    while (session.viewCache.size > VIEW_CACHE_LIMIT) {
      session.viewCache.delete(session.viewCache.keys().next().value);
    }
    return { orderedIds, cacheStatus: "miss" };
  }

  cursorDigest(dictionary, generation, session, query) {
    return sha256(JSON.stringify({
      dictionaryId: dictionary.id,
      generation,
      resultKey: session.resultKey,
      view: featureResultViewIdentity(query),
    }));
  }

  prepareCursor(dictionary, session, query) {
    const generation = session.generation;
    const descriptorDigest = this.cursorDigest(dictionary, generation, session, query);
    query.cursorContext = {
      processEpoch: this.processEpoch,
      generation,
      descriptorDigest,
    };
    if (!query.page.cursor) {
      if ((query.page.windowOffset || 0) > 0) {
        throw apiError("A versioned cursor is required for a non-zero query window", 400, "query_cursor_required");
      }
      query.page.offset = 0;
      return;
    }
    let payload = null;
    try {
      payload = JSON.parse(Buffer.from(query.page.cursor, "base64url").toString("utf8"));
    } catch {
      payload = null;
    }
    const offset = Number.parseInt(payload?.offset, 10);
    const staleReason = !payload || payload.version !== 1 || !Number.isSafeInteger(offset) || offset < 0
      ? "invalid"
      : payload.processEpoch !== this.processEpoch
        ? "process_epoch"
        : Number(payload.generation) !== generation
          ? "cache_generation"
          : payload.descriptorDigest !== descriptorDigest
            ? "descriptor"
            : "";
    if (staleReason) {
      throw apiError("Query cursor is stale", 409, "query_cursor_stale", { reason: staleReason });
    }
    query.page.offset = query.page.windowOffset === null ? offset : query.page.windowOffset;
  }

  encodeCursor(query, offset) {
    return Buffer.from(JSON.stringify({
      version: 1,
      ...query.cursorContext,
      offset,
    }), "utf8").toString("base64url");
  }

  responseItems(dictionary, session, orderedIds, query, offset) {
    const pageIds = orderedIds.slice(offset, offset + query.page.limit);
    const entries = this.repository.analysisFeatureEntrySummaries(
      dictionary.id,
      pageIds,
      {
        filter: {},
        search: query.view.search,
        sort: query.view.sort,
        page: query.page,
      },
      dictionary,
    );
    return entries.map((entry) => ({
      entry,
      feature: session.recordsById.get(entry.id),
    }));
  }

  baseResponse(dictionary, session, query, orderedIds, items, diagnostics) {
    const offset = query.page.offset;
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < orderedIds.length;
    return {
      dictionaryId: dictionary.id,
      generation: session.generation,
      resultKey: session.resultKey,
      source: query.source,
      summary: session.summary,
      items,
      pageInfo: {
        total: orderedIds.length,
        limit: query.page.limit,
        windowOffset: offset,
        nextCursor: hasMore ? this.encodeCursor(query, nextOffset) : "",
        windowCursor: this.encodeCursor(query, 0),
        hasMore,
      },
      diagnostics,
    };
  }

  async query(id, source = {}) {
    const startedAt = Date.now();
    const query = this.normalizeQuery(source);
    const cached = await this.currentSession(id, query.source);
    const dictionary = cached.dictionary;
    this.normalizeRuntimeSearch(query, dictionary);
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.query(id, source);
    }
    this.prepareCursor(dictionary, cached.session, query);
    const view = this.orderedViewIds(dictionary, cached.session, query);
    const items = this.responseItems(dictionary, cached.session, view.orderedIds, query, query.page.offset);
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.query(id, source);
    }
    return this.baseResponse(dictionary, cached.session, query, view.orderedIds, items, {
      cache: cached.cacheStatus,
      viewCache: view.cacheStatus,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    });
  }

  async location(id, source = {}) {
    const startedAt = Date.now();
    const query = this.normalizeLocationQuery(source);
    const cached = await this.currentSession(id, query.source);
    const dictionary = cached.dictionary;
    this.normalizeRuntimeSearch(query, dictionary);
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.location(id, source);
    }
    this.prepareCursor(dictionary, cached.session, query);
    const view = this.orderedViewIds(dictionary, cached.session, query);
    const index = view.orderedIds.indexOf(query.entryId);
    const found = index >= 0;
    const windowOffset = found
      ? Math.floor(index / query.page.limit) * query.page.limit
      : 0;
    query.page.offset = windowOffset;
    const items = found
      ? this.responseItems(dictionary, cached.session, view.orderedIds, query, windowOffset)
      : [];
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.location(id, source);
    }
    return {
      ...this.baseResponse(dictionary, cached.session, query, view.orderedIds, items, {
        cache: cached.cacheStatus,
        viewCache: view.cacheStatus,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      }),
      location: {
        found,
        index: found ? index : -1,
        windowIndex: found ? Math.floor(index / query.page.limit) : -1,
        windowOffset,
      },
    };
  }
}

module.exports = {
  AnalysisFeatureService,
  OUTCOME_KEYS,
  VIEW_OUTCOMES,
};
