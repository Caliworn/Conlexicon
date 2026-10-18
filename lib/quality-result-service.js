const crypto = require("node:crypto");
const { apiError } = require("./api-error");
const { searchSettingsQueryOptions } = require("./entry-search-model");
const { FeatureResultSessionCache } = require("./feature-result-session-cache");
const {
  QUALITY_RULESET_VERSION,
  buildQualityIssuesAsync,
  buildQualitySummary,
  qualityIssueAffectedEntryIds,
} = require("./quality-model");
const {
  QualityQueryValidationError,
  normalizeQualityLocationQuery,
  normalizeQualityQuery,
  qualityViewIdentity,
} = require("./quality-query-model");
const { encodeResultWindowCursor, resultWindowOffset } = require("./result-window-cursor");

// Bump when the session builder changes results without a ruleset change.
const QUALITY_IMPLEMENTATION_VERSION = 1;
const VIEW_CACHE_LIMIT = 12;
const ISSUE_INDEX_BATCH_SIZE = 1024;
const EMPTY_SEARCH_QUERY = { filter: {}, search: { text: "", fields: [], fuzzyFields: [] } };

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("base64url");
}

function nextEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function qualityValidationApiError(error) {
  if (!(error instanceof QualityQueryValidationError)) {
    throw error;
  }
  throw apiError(error.message, 400, error.code, error.details);
}

function selectorMatches(issue, selector) {
  return selector.group === "all" || issue[selector.group] === selector.value;
}

class QualityResultService {
  constructor(options = {}) {
    if (!options.repository) {
      throw new TypeError("QualityResultService requires a repository.");
    }
    this.repository = options.repository;
    this.sessionCache = options.sessionCache || new FeatureResultSessionCache(options.sessionCacheOptions);
    this.processEpoch = options.processEpoch || crypto.randomUUID();
  }

  normalizeQuery(source) {
    try {
      return normalizeQualityQuery(source);
    } catch (error) {
      return qualityValidationApiError(error);
    }
  }

  normalizeLocationQuery(source) {
    try {
      return normalizeQualityLocationQuery(source);
    } catch (error) {
      return qualityValidationApiError(error);
    }
  }

  // UI language, selectors, search, sort and windows stay out of the base
  // identity, so every view of one generation shares one rule run.
  sessionDescriptor(id, generation, source) {
    return {
      dictionaryId: id,
      generation,
      source,
      rulesetVersion: QUALITY_RULESET_VERSION,
      implementationVersion: QUALITY_IMPLEMENTATION_VERSION,
    };
  }

  // The input read stays one synchronous block so it sees one consistent
  // database state; rule evaluation and indexing yield between batches.
  async buildSession(id, descriptor) {
    const records = this.repository.qualityInputRecords(id);
    const ruleIssues = await buildQualityIssuesAsync(records, nextEventLoopTurn);
    // Cycle issues share one params object per cycle; hash each object once.
    const paramsDigests = new Map();
    const paramsDigest = (params) => {
      if (!paramsDigests.has(params)) {
        paramsDigests.set(params, sha256(JSON.stringify(params)));
      }
      return paramsDigests.get(params);
    };
    const issues = [];
    const affectedEntryIds = [];
    const issueIndexesByEntryId = new Map();
    for (let index = 0; index < ruleIssues.length; index += 1) {
      const issue = ruleIssues[index];
      issues.push({
        id: sha256(JSON.stringify([
          QUALITY_RULESET_VERSION,
          issue.code,
          issue.entryId,
          paramsDigest(issue.params),
        ])),
        code: issue.code,
        severity: issue.severity,
        module: issue.module,
        entryId: issue.entryId,
        params: issue.params,
      });
      const entryIds = qualityIssueAffectedEntryIds(issue);
      affectedEntryIds.push(entryIds);
      entryIds.forEach((entryId) => {
        if (!issueIndexesByEntryId.has(entryId)) {
          issueIndexesByEntryId.set(entryId, []);
        }
        issueIndexesByEntryId.get(entryId).push(index);
      });
      if (index % ISSUE_INDEX_BATCH_SIZE === ISSUE_INDEX_BATCH_SIZE - 1) {
        await nextEventLoopTurn();
      }
    }
    return {
      resultKey: sha256(JSON.stringify(descriptor)),
      issues,
      affectedEntryIds,
      issueIndexesByEntryId,
      summary: buildQualitySummary(ruleIssues, records.length),
      viewCache: new Map(),
    };
  }

  async currentSession(id, source) {
    while (true) {
      const generation = this.repository.querySessionGeneration(id);
      const descriptor = this.sessionDescriptor(id, generation, source);
      const cached = await this.sessionCache.getOrCreate({
        descriptor,
        build: () => this.buildSession(id, descriptor),
        isCurrent: () => this.repository.querySessionGeneration(id) === generation,
      });
      if (cached.session.generation === this.repository.querySessionGeneration(id)) {
        return cached;
      }
    }
  }

  normalizeRuntimeSearch(query, dictionary) {
    const runtime = searchSettingsQueryOptions(dictionary.settings?.search);
    query.view.search.rawText = query.view.search.text;
    query.view.search.text = runtime.normalizeText(query.view.search.text);
  }

  orderedView(id, session, query) {
    const key = JSON.stringify(qualityViewIdentity(query));
    const cached = session.viewCache.get(key);
    if (cached) {
      session.viewCache.delete(key);
      session.viewCache.set(key, cached);
      return { ...cached, cacheStatus: "hit" };
    }
    const { selector } = query.view;
    let view;
    if (query.view.itemKind === "issue") {
      const orderedIndexes = [];
      session.issues.forEach((issue, index) => {
        if (selectorMatches(issue, selector)) {
          orderedIndexes.push(index);
        }
      });
      view = { ordered: orderedIndexes, searchSummary: null };
    } else {
      const candidateIds = new Set();
      session.issues.forEach((issue, index) => {
        if (selectorMatches(issue, selector)) {
          session.affectedEntryIds[index].forEach((entryId) => candidateIds.add(entryId));
        }
      });
      const result = this.repository.orderedAnalysisFeatureEntryIds(id, candidateIds, {
        filter: {},
        search: query.view.search,
        sort: query.view.sort,
        page: query.page,
      });
      view = { ordered: result.orderedIds, searchSummary: result.searchSummary };
    }
    session.viewCache.set(key, view);
    while (session.viewCache.size > VIEW_CACHE_LIMIT) {
      session.viewCache.delete(session.viewCache.keys().next().value);
    }
    return { ...view, cacheStatus: "miss" };
  }

  prepareCursor(id, session, query) {
    query.cursorContext = {
      processEpoch: this.processEpoch,
      generation: session.generation,
      descriptorDigest: sha256(JSON.stringify({
        dictionaryId: id,
        generation: session.generation,
        resultKey: session.resultKey,
        view: qualityViewIdentity(query),
      })),
    };
    query.page.offset = resultWindowOffset(query.page, query.cursorContext);
  }

  responseItems(id, dictionary, session, ordered, query, offset) {
    const page = ordered.slice(offset, offset + query.page.limit);
    if (query.view.itemKind === "issue") {
      const pageIssues = page.map((index) => session.issues[index]);
      const summaries = this.repository.analysisFeatureEntrySummaries(
        id,
        pageIssues.map((issue) => issue.entryId),
        EMPTY_SEARCH_QUERY,
        dictionary,
      );
      const summaryById = new Map(summaries.map((entry) => [entry.id, entry]));
      return pageIssues.map((issue) => ({
        issue,
        entry: issue.entryId ? summaryById.get(issue.entryId) : null,
      }));
    }
    const summaries = this.repository.analysisFeatureEntrySummaries(
      id,
      page,
      { filter: {}, search: query.view.search, sort: query.view.sort, page: query.page },
      dictionary,
    );
    return summaries.map((entry) => ({
      entry,
      issues: session.issueIndexesByEntryId.get(entry.id)
        .map((index) => session.issues[index])
        .filter((issue) => selectorMatches(issue, query.view.selector)),
    }));
  }

  baseResponse(id, session, query) {
    return {
      dictionaryId: id,
      generation: session.generation,
      resultKey: session.resultKey,
      source: query.source,
      rulesetVersion: QUALITY_RULESET_VERSION,
      summary: session.summary,
    };
  }

  windowResponse(id, session, query, view, items, diagnostics) {
    const offset = query.page.offset;
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < view.ordered.length;
    return {
      ...this.baseResponse(id, session, query),
      view: {
        itemKind: query.view.itemKind,
        selector: query.view.selector,
      },
      searchSummary: view.searchSummary,
      items,
      pageInfo: {
        total: view.ordered.length,
        limit: query.page.limit,
        windowOffset: offset,
        nextCursor: hasMore ? encodeResultWindowCursor(query.cursorContext, nextOffset) : "",
        windowCursor: encodeResultWindowCursor(query.cursorContext, 0),
        hasMore,
      },
      diagnostics,
    };
  }

  async query(id, body = {}) {
    const startedAt = Date.now();
    const query = this.normalizeQuery(body);
    await this.repository.requireDictionary(id);
    const cached = await this.currentSession(id, query.source);
    if (query.responseMode === "summary") {
      return {
        ...this.baseResponse(id, cached.session, query),
        diagnostics: {
          cache: cached.cacheStatus,
          elapsedMs: Math.max(0, Date.now() - startedAt),
        },
      };
    }
    const dictionary = this.repository.dictionaryQueryContext(id);
    if (query.view.itemKind === "entry") {
      this.normalizeRuntimeSearch(query, dictionary);
    }
    this.prepareCursor(id, cached.session, query);
    const view = this.orderedView(id, cached.session, query);
    const items = this.responseItems(id, dictionary, cached.session, view.ordered, query, query.page.offset);
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.query(id, body);
    }
    return this.windowResponse(id, cached.session, query, view, items, {
      cache: cached.cacheStatus,
      viewCache: view.cacheStatus,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    });
  }

  async location(id, body = {}) {
    const startedAt = Date.now();
    const query = this.normalizeLocationQuery(body);
    await this.repository.requireDictionary(id);
    const cached = await this.currentSession(id, query.source);
    const dictionary = this.repository.dictionaryQueryContext(id);
    this.normalizeRuntimeSearch(query, dictionary);
    this.prepareCursor(id, cached.session, query);
    const view = this.orderedView(id, cached.session, query);
    const index = view.ordered.indexOf(query.entryId);
    const found = index >= 0;
    const windowOffset = found ? Math.floor(index / query.page.limit) * query.page.limit : 0;
    query.page.offset = windowOffset;
    const items = found
      ? this.responseItems(id, dictionary, cached.session, view.ordered, query, windowOffset)
      : [];
    if (cached.session.generation !== this.repository.querySessionGeneration(id)) {
      return this.location(id, body);
    }
    return {
      ...this.windowResponse(id, cached.session, query, view, items, {
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
  QUALITY_IMPLEMENTATION_VERSION,
  QualityResultService,
};
