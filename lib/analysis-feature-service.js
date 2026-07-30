const crypto = require("node:crypto");
const { apiError } = require("./api-error");
const { searchSettingsQueryOptions } = require("./entry-search-model");
const {
  FeatureResultQueryValidationError,
  FEATURE_RESULT_SOURCE_TYPE,
  featureResultViewIdentity,
  IPA_DISTRIBUTION_SOURCE_TYPE,
  MORPHOLOGY_ANALYSIS_SOURCE_TYPE,
  normalizeFeatureResultLocationQuery,
  normalizeFeatureResultQuery,
} = require("./feature-result-query-model");
const { FeatureResultSessionCache } = require("./feature-result-session-cache");
const {
  buildIpaDistributionResult,
  ipaDistributionItemFeature,
  ipaDistributionRecordMatches,
  normalizeIpaDistributionSettings,
} = require("./ipa-distribution-feature");
const { normalizeIpaSettings } = require("./ipa-model");
const {
  buildMorphologyAnalysisResult,
  morphologyAnalysisItemFeature,
  morphologyAnalysisRecordMatches,
} = require("./morphology-analysis-feature");
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
    this.sourceAdapters = this.createSourceAdapters();
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

  createSourceAdapters() {
    return new Map([
      [FEATURE_RESULT_SOURCE_TYPE, {
        descriptor: (dictionary) => ({
          engine: {
            id: String(this.engine.id || "unknown"),
            version: String(this.engine.version || "unknown"),
          },
          settingsDigest: sha256(JSON.stringify(normalizeIpaSettings(dictionary.settings?.ipa))),
        }),
        build: (dictionary, descriptor) => this.buildIpaAutoCompareSession(dictionary, descriptor),
        recordMatches: (record, view) => VIEW_OUTCOMES[view.category].has(record.outcome),
        itemFeature: (record) => record,
      }],
      [IPA_DISTRIBUTION_SOURCE_TYPE, {
        descriptor: (dictionary) => ({
          settingsDigest: sha256(JSON.stringify(normalizeIpaDistributionSettings(dictionary.settings?.ipa))),
        }),
        build: (dictionary, descriptor) => this.buildIpaDistributionSession(dictionary, descriptor),
        recordMatches: (record, view) => ipaDistributionRecordMatches(record, view.category, view.value),
        itemFeature: (record, view) => ipaDistributionItemFeature(record, view.category, view.value),
      }],
      [MORPHOLOGY_ANALYSIS_SOURCE_TYPE, {
        descriptor: () => ({}),
        build: (dictionary, descriptor) => this.buildMorphologyAnalysisSession(dictionary, descriptor),
        validateView: (session, view) => {
          const ids = view.category === "group" || view.category === "overrideGroup"
            ? session.groupIds
            : view.category === "overrideTable"
              ? session.tableIds
              : null;
          if (ids && !ids.has(view.value)) {
            throw apiError("Unknown morphology analysis target", 400, "invalid_feature_result_value", {
              category: view.category,
              value: view.value,
            });
          }
        },
        recordMatches: morphologyAnalysisRecordMatches,
        itemFeature: morphologyAnalysisItemFeature,
      }],
    ]);
  }

  sourceAdapter(source) {
    const adapter = this.sourceAdapters.get(source.type);
    if (!adapter) {
      throw apiError("Unsupported feature result source", 400, "unsupported_feature_result_source", {
        type: source.type,
      });
    }
    return adapter;
  }

  sessionDescriptor(dictionary, generation, source) {
    return {
      dictionaryId: dictionary.id,
      generation,
      source,
      ...this.sourceAdapter(source).descriptor(dictionary),
    };
  }

  async buildIpaAutoCompareSession(dictionary, descriptor) {
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
      inputEntryCount: records.length,
      outcomes: OUTCOME_KEYS.map((key) => ({ key, entryCount: outcomeCounts[key] })),
      views: Object.entries(VIEW_OUTCOMES).map(([key, outcomes]) => ({
        key,
        entryCount: [...outcomes].reduce((total, outcome) => total + outcomeCounts[outcome], 0),
      })),
    };
    return {
      resultKey: sha256(JSON.stringify(descriptor)),
      recordsById,
      summary,
      viewCache: new Map(),
    };
  }

  async buildIpaDistributionSession(dictionary, descriptor) {
    const input = this.repository.ipaDistributionFeatureInput(dictionary.id);
    const result = await buildIpaDistributionResult(
      input.records,
      dictionary.settings?.ipa,
      {
        dictionaryEntryCount: input.dictionaryEntryCount,
        yieldControl: nextEventLoopTurn,
      },
    );
    return {
      resultKey: sha256(JSON.stringify(descriptor)),
      ...result,
      viewCache: new Map(),
    };
  }

  async buildMorphologyAnalysisSession(dictionary, descriptor) {
    const result = await buildMorphologyAnalysisResult(
      this.repository.morphologyAnalysisFeatureInput(dictionary.id),
      { yieldControl: nextEventLoopTurn },
    );
    return {
      resultKey: sha256(JSON.stringify(descriptor)),
      ...result,
      viewCache: new Map(),
    };
  }

  async buildSession(dictionary, descriptor) {
    return this.sourceAdapter(descriptor.source).build(dictionary, descriptor);
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
    const adapter = this.sourceAdapter(query.source);
    adapter.validateView?.(session, query.view);
    const key = this.viewCacheKey(query);
    const cached = session.viewCache.get(key);
    if (cached) {
      session.viewCache.delete(key);
      session.viewCache.set(key, cached);
      return { ...cached, cacheStatus: "hit" };
    }
    const candidateIds = new Set();
    session.recordsById.forEach((record, entryId) => {
      if (adapter.recordMatches(record, query.view)) {
        candidateIds.add(entryId);
      }
    });
    const result = this.repository.orderedAnalysisFeatureEntryIds(
      dictionary.id,
      candidateIds,
      {
        filter: {},
        search: query.view.search,
        sort: query.view.sort,
        page: query.page,
      },
    );
    session.viewCache.set(key, result);
    while (session.viewCache.size > VIEW_CACHE_LIMIT) {
      session.viewCache.delete(session.viewCache.keys().next().value);
    }
    return { ...result, cacheStatus: "miss" };
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
    const adapter = this.sourceAdapter(query.source);
    return entries.map((entry) => {
      const record = session.recordsById.get(entry.id);
      return {
        entry,
        feature: adapter.itemFeature(record, query.view),
      };
    });
  }

  baseResponse(dictionary, session, query, view, items, diagnostics) {
    const offset = query.page.offset;
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < view.orderedIds.length;
    return {
      dictionaryId: dictionary.id,
      generation: session.generation,
      resultKey: session.resultKey,
      source: query.source,
      summary: session.summary,
      searchSummary: view.searchSummary,
      items,
      pageInfo: {
        total: view.orderedIds.length,
        limit: query.page.limit,
        windowOffset: offset,
        nextCursor: hasMore ? this.encodeCursor(query, nextOffset) : "",
        windowCursor: this.encodeCursor(query, 0),
        hasMore,
      },
      diagnostics,
    };
  }

  summaryResponse(dictionary, session, query, diagnostics) {
    return {
      dictionaryId: dictionary.id,
      generation: session.generation,
      resultKey: session.resultKey,
      source: query.source,
      summary: session.summary,
      diagnostics,
    };
  }

  async query(id, source = {}) {
    const startedAt = Date.now();
    const query = this.normalizeQuery(source);
    const cached = await this.currentSession(id, query.source);
    const dictionary = cached.dictionary;
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.query(id, source);
    }
    if (query.responseMode === "summary") {
      return this.summaryResponse(dictionary, cached.session, query, {
        cache: cached.cacheStatus,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      });
    }
    this.normalizeRuntimeSearch(query, dictionary);
    this.prepareCursor(dictionary, cached.session, query);
    const view = this.orderedViewIds(dictionary, cached.session, query);
    const items = this.responseItems(dictionary, cached.session, view.orderedIds, query, query.page.offset);
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.query(id, source);
    }
    return this.baseResponse(dictionary, cached.session, query, view, items, {
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
      ...this.baseResponse(dictionary, cached.session, query, view, items, {
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
