const { apiError } = require("./api-error");
const { FeatureResultSessionCache } = require("./feature-result-session-cache");
const {
  CORPUS_QUALITY_CODES,
  buildCorpusQualityIssuesAsync,
  buildCorpusQualitySummary,
} = require("./quality-model");

const CORPUS_QUALITY_SOURCE = Object.freeze({ type: "corpusQuality", version: 1, options: {} });
const PAGE_LIMIT_DEFAULT = 100;
const PAGE_LIMIT_MAX = 200;

function nextEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function invalid(message, code, details) {
  return apiError(message, 400, code, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSource(source) {
  if (!isPlainObject(source) || source.type !== CORPUS_QUALITY_SOURCE.type) {
    throw invalid("Unsupported quality source", "unsupported_quality_source", { type: source?.type });
  }
  if (Number(source.version) !== CORPUS_QUALITY_SOURCE.version) {
    throw invalid("Unsupported quality source version", "invalid_quality_source_version", { type: source.type, version: source.version });
  }
  if (source.options !== undefined && (!isPlainObject(source.options) || Object.keys(source.options).length)) {
    throw invalid("Unsupported quality source options", "invalid_quality_source_options");
  }
  return CORPUS_QUALITY_SOURCE;
}

function normalizeSelector(selector = { group: "all" }) {
  if (!isPlainObject(selector)) {
    throw invalid("Invalid quality selector", "invalid_quality_selector");
  }
  if ((selector.group ?? "all") === "all" && selector.value === undefined) {
    return { group: "all" };
  }
  if (selector.group === "code" && CORPUS_QUALITY_CODES.includes(selector.value)) {
    return { group: "code", value: selector.value };
  }
  throw invalid("Unsupported quality selector", "invalid_quality_selector", { group: selector.group, value: selector.value });
}

function normalizePage(page = {}) {
  if (!isPlainObject(page)) {
    throw invalid("Invalid quality page", "invalid_entry_query_limit");
  }
  const limit = page.limit === undefined ? PAGE_LIMIT_DEFAULT : Number(page.limit);
  const offset = page.offset === undefined ? 0 : Number(page.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_LIMIT_MAX) {
    throw invalid("Quality page limit is out of range", "invalid_entry_query_limit", { limit: page.limit });
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw invalid("Quality page offset is invalid", "invalid_query_window_offset", { offset: page.offset });
  }
  return { limit, offset };
}

function normalizeQuery(body) {
  if (!isPlainObject(body)) {
    throw invalid("Invalid quality query payload", "invalid_quality_query_payload");
  }
  const source = normalizeSource(body.source);
  const responseMode = body.responseMode ?? "items";
  if (responseMode === "summary") {
    if (body.view !== undefined || body.page !== undefined) {
      throw invalid("Summary quality queries do not accept view or page", "invalid_quality_summary_request");
    }
    return { source, responseMode };
  }
  if (responseMode !== "items") {
    throw invalid("Unsupported quality response mode", "invalid_quality_response_mode", { responseMode });
  }
  const view = isPlainObject(body.view) ? body.view : {};
  if (view.itemKind !== "corpusItem") {
    throw invalid("Unsupported quality item kind", "invalid_quality_item_kind", { itemKind: view.itemKind });
  }
  return {
    source,
    responseMode,
    view: { itemKind: "corpusItem", selector: normalizeSelector(view.selector) },
    page: normalizePage(body.page),
  };
}

function selectorMatches(issue, selector) {
  return selector.group === "all" || issue.code === selector.value;
}

// Gloss checks over every corpus item, separate from the entry checks: one
// rule run per dictionary generation, windows of affected items in list order.
class CorpusQualityService {
  constructor(options = {}) {
    if (!options.repository) {
      throw new TypeError("CorpusQualityService requires a repository.");
    }
    this.repository = options.repository;
    this.sessionCache = options.sessionCache || new FeatureResultSessionCache(options.sessionCacheOptions);
  }

  async buildSession(id) {
    const items = this.repository.corpusQualityInput(id);
    const issues = await buildCorpusQualityIssuesAsync(items, nextEventLoopTurn);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const issuesByItemId = new Map();
    issues.forEach((issue) => {
      if (!issuesByItemId.has(issue.itemId)) {
        issuesByItemId.set(issue.itemId, []);
      }
      issuesByItemId.get(issue.itemId).push(issue);
    });
    return {
      summary: buildCorpusQualitySummary(issues, items.length),
      affectedItems: [...issuesByItemId.keys()].map((itemId) => ({ item: itemsById.get(itemId), issues: issuesByItemId.get(itemId) })),
    };
  }

  async currentSession(id) {
    while (true) {
      const generation = this.repository.querySessionGeneration(id);
      const descriptor = { dictionaryId: id, generation, source: CORPUS_QUALITY_SOURCE };
      const cached = await this.sessionCache.getOrCreate({
        descriptor,
        build: () => this.buildSession(id),
        isCurrent: () => this.repository.querySessionGeneration(id) === generation,
      });
      if (cached.session.generation === this.repository.querySessionGeneration(id)) {
        return cached;
      }
    }
  }

  async query(id, body = {}) {
    const query = normalizeQuery(body);
    await this.repository.requireDictionary(id);
    const { session, cacheStatus } = await this.currentSession(id);
    const base = {
      dictionaryId: id,
      generation: session.generation,
      source: query.source,
      summary: session.summary,
    };
    if (query.responseMode === "summary") {
      return { ...base, diagnostics: { cache: cacheStatus } };
    }
    const { selector } = query.view;
    const matching = session.affectedItems
      .map(({ item, issues }) => ({ item, issues: issues.filter((issue) => selectorMatches(issue, selector)) }))
      .filter(({ issues }) => issues.length);
    const { offset, limit } = query.page;
    const items = matching.slice(offset, offset + limit);
    return {
      ...base,
      view: query.view,
      items,
      pageInfo: {
        total: matching.length,
        limit,
        windowOffset: offset,
        hasMore: offset + items.length < matching.length,
      },
      diagnostics: { cache: cacheStatus },
    };
  }
}

module.exports = {
  CORPUS_QUALITY_SOURCE,
  CorpusQualityService,
};
