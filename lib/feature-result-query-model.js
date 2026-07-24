const {
  EntryQueryValidationError,
  entryQueryIdentity,
  normalizeEntryQuery,
} = require("./entry-query-model");

const FEATURE_RESULT_SOURCE_TYPE = "ipaAutoCompare";
const FEATURE_RESULT_SOURCE_VERSION = 1;
const FEATURE_RESULT_CATEGORIES = new Set([
  "match",
  "looseMismatch",
  "strictMismatch",
]);
const FEATURE_RESULT_PAGE_LIMIT_DEFAULT = 200;
const FEATURE_RESULT_PAGE_LIMIT_MAX = 200;
const FEATURE_RESULT_RESPONSE_MODES = new Set(["items", "summary"]);

class FeatureResultQueryValidationError extends Error {
  constructor(message, code, details = undefined) {
    super(message);
    this.name = "FeatureResultQueryValidationError";
    this.code = code;
    this.details = details;
  }
}

function assertObject(value, code, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FeatureResultQueryValidationError(message, code);
  }
  return value;
}

function normalizeFeatureResultSource(value) {
  const source = assertObject(
    value,
    "invalid_feature_result_source",
    "Feature result source is required",
  );
  const type = String(source.type || "").trim();
  if (type !== FEATURE_RESULT_SOURCE_TYPE) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result source",
      "unsupported_feature_result_source",
      { type },
    );
  }
  const version = Number(source.version);
  if (version !== FEATURE_RESULT_SOURCE_VERSION) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result source version",
      "invalid_feature_result_source_version",
      { type, version: source.version },
    );
  }
  const options = source.options === undefined
    ? {}
    : assertObject(
      source.options,
      "invalid_feature_result_source_options",
      "Invalid feature result source options",
    );
  const unsupportedOptions = Object.keys(options);
  if (unsupportedOptions.length) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result source options",
      "invalid_feature_result_source_options",
      { unsupportedOptions },
    );
  }
  return {
    type,
    version,
    options: {},
  };
}

function normalizeFeatureResultQuery(value = {}) {
  const request = assertObject(
    value,
    "invalid_feature_result_query_payload",
    "Invalid feature result query payload",
  );
  const source = normalizeFeatureResultSource(request.source);
  const responseMode = String(request.responseMode || "items").trim();
  if (!FEATURE_RESULT_RESPONSE_MODES.has(responseMode)) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result response mode",
      "invalid_feature_result_response_mode",
      { responseMode },
    );
  }
  if (responseMode === "summary") {
    const unsupportedFields = ["view", "page"].filter((field) => request[field] !== undefined);
    if (unsupportedFields.length) {
      throw new FeatureResultQueryValidationError(
        "Summary feature result queries do not accept view or page",
        "invalid_feature_result_summary_request",
        { unsupportedFields },
      );
    }
    return {
      source,
      responseMode,
    };
  }
  const view = request.view === undefined
    ? {}
    : assertObject(
      request.view,
      "invalid_feature_result_view",
      "Invalid feature result query view",
    );
  const category = String(view.category || "match").trim();
  if (!FEATURE_RESULT_CATEGORIES.has(category)) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result category",
      "invalid_feature_result_category",
      { category },
    );
  }

  let entryQuery;
  try {
    entryQuery = normalizeEntryQuery({
      search: view.search,
      sort: view.sort,
      page: request.page,
    }, {
      defaultLimit: FEATURE_RESULT_PAGE_LIMIT_DEFAULT,
      maxLimit: FEATURE_RESULT_PAGE_LIMIT_MAX,
    });
  } catch (error) {
    if (error instanceof EntryQueryValidationError) {
      throw new FeatureResultQueryValidationError(error.message, error.code, error.details);
    }
    throw error;
  }

  return {
    source,
    responseMode,
    view: {
      category,
      search: entryQuery.search,
      sort: entryQuery.sort,
    },
    page: entryQuery.page,
  };
}

function normalizeFeatureResultLocationQuery(value = {}) {
  const request = assertObject(
    value,
    "invalid_feature_result_location_payload",
    "Invalid feature result location payload",
  );
  const entryId = String(request.entryId || "").trim();
  if (!entryId) {
    throw new FeatureResultQueryValidationError(
      "Feature result location entry ID is required",
      "invalid_feature_result_location_entry_id",
    );
  }
  if (request.responseMode !== undefined && String(request.responseMode).trim() !== "items") {
    throw new FeatureResultQueryValidationError(
      "Feature result location only supports item responses",
      "invalid_feature_result_response_mode",
      { responseMode: request.responseMode },
    );
  }
  return {
    ...normalizeFeatureResultQuery({
      source: request.source,
      responseMode: "items",
      view: request.view,
      page: {
        ...(request.page && typeof request.page === "object" && !Array.isArray(request.page)
          ? request.page
          : {}),
        cursor: "",
        windowOffset: null,
        offset: 0,
      },
    }),
    entryId,
  };
}

function featureResultSourceIdentity(source) {
  return normalizeFeatureResultSource(source);
}

function featureResultViewIdentity(query) {
  const normalized = query.source && query.view && query.page
    ? query
    : normalizeFeatureResultQuery(query);
  if (normalized.responseMode === "summary") {
    throw new TypeError("Summary feature result queries do not have a view identity.");
  }
  return {
    source: featureResultSourceIdentity(normalized.source),
    category: normalized.view.category,
    ...entryQueryIdentity({
      filter: {},
      search: normalized.view.search,
      sort: normalized.view.sort,
      page: normalized.page,
    }),
  };
}

module.exports = {
  FEATURE_RESULT_CATEGORIES,
  FEATURE_RESULT_PAGE_LIMIT_DEFAULT,
  FEATURE_RESULT_PAGE_LIMIT_MAX,
  FEATURE_RESULT_RESPONSE_MODES,
  FEATURE_RESULT_SOURCE_TYPE,
  FEATURE_RESULT_SOURCE_VERSION,
  FeatureResultQueryValidationError,
  featureResultSourceIdentity,
  featureResultViewIdentity,
  normalizeFeatureResultLocationQuery,
  normalizeFeatureResultQuery,
  normalizeFeatureResultSource,
};
