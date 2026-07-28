const {
  EntryQueryValidationError,
  entryQueryIdentity,
  normalizeEntryQuery,
} = require("./entry-query-model");

const FEATURE_RESULT_SOURCE_TYPE = "ipaAutoCompare";
const FEATURE_RESULT_SOURCE_VERSION = 1;
const IPA_DISTRIBUTION_SOURCE_TYPE = "ipaDistribution";
const IPA_DISTRIBUTION_SOURCE_VERSION = 1;
const MORPHOLOGY_ANALYSIS_SOURCE_TYPE = "morphologyAnalysis";
const MORPHOLOGY_ANALYSIS_SOURCE_VERSION = 1;
const FEATURE_RESULT_CATEGORIES = new Set([
  "match",
  "looseMismatch",
  "strictMismatch",
]);
const IPA_DISTRIBUTION_CATEGORIES = new Set([
  "unit",
  "initial",
  "final",
  "syllableCount",
]);
const MORPHOLOGY_ANALYSIS_CATEGORIES = new Set([
  "assignment",
  "mode",
  "group",
  "override",
  "overrideGroup",
  "overrideTable",
]);
const MORPHOLOGY_OVERRIDE_SCOPES = new Set(["any", "active", "inactive"]);
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

function normalizeIpaAutoCompareView(view) {
  const category = String(view.category || "match").trim();
  if (!FEATURE_RESULT_CATEGORIES.has(category)) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result category",
      "invalid_feature_result_category",
      { category },
    );
  }
  return { category };
}

function normalizeIpaDistributionView(view) {
  const category = String(view.category || "").trim();
  if (!IPA_DISTRIBUTION_CATEGORIES.has(category)) {
    throw new FeatureResultQueryValidationError(
      "Unsupported IPA distribution category",
      "invalid_feature_result_category",
      { category },
    );
  }
  const rawValue = String(view.value ?? "").trim();
  if (!rawValue) {
    throw new FeatureResultQueryValidationError(
      "IPA distribution value is required",
      "invalid_feature_result_value",
      { category },
    );
  }
  if (category === "syllableCount") {
    const syllableCount = Number(rawValue);
    if (!Number.isSafeInteger(syllableCount) || syllableCount < 1) {
      throw new FeatureResultQueryValidationError(
        "Invalid IPA distribution syllable count",
        "invalid_feature_result_value",
        { category, value: view.value },
      );
    }
    return { category, value: String(syllableCount) };
  }
  return { category, value: rawValue };
}

function normalizeMorphologyAnalysisView(view) {
  const category = String(view.category || "").trim();
  if (!MORPHOLOGY_ANALYSIS_CATEGORIES.has(category)) {
    throw new FeatureResultQueryValidationError(
      "Unsupported morphology analysis category",
      "invalid_feature_result_category",
      { category },
    );
  }
  const value = String(view.value ?? "").trim();
  const allowedValues = {
    assignment: new Set(["assigned", "unassigned"]),
    mode: new Set(["auto", "manual"]),
    override: MORPHOLOGY_OVERRIDE_SCOPES,
  };
  if (
    (allowedValues[category] && !allowedValues[category].has(value))
    || (!allowedValues[category] && !value)
  ) {
    throw new FeatureResultQueryValidationError(
      "Invalid morphology analysis value",
      "invalid_feature_result_value",
      { category, value: view.value },
    );
  }

  const acceptsScope = category === "overrideGroup" || category === "overrideTable";
  if (!acceptsScope && Object.hasOwn(view, "scope")) {
    throw new FeatureResultQueryValidationError(
      "Morphology analysis scope is not valid for this category",
      "invalid_feature_result_value",
      { category, scope: view.scope },
    );
  }
  if (!acceptsScope) {
    return { category, value };
  }
  const scope = view.scope === undefined ? "any" : String(view.scope).trim();
  if (!MORPHOLOGY_OVERRIDE_SCOPES.has(scope)) {
    throw new FeatureResultQueryValidationError(
      "Invalid morphology analysis scope",
      "invalid_feature_result_value",
      { category, scope: view.scope },
    );
  }
  return { category, value, scope };
}

const FEATURE_RESULT_SOURCE_DEFINITIONS = new Map([
  [FEATURE_RESULT_SOURCE_TYPE, {
    version: FEATURE_RESULT_SOURCE_VERSION,
    normalizeView: normalizeIpaAutoCompareView,
  }],
  [IPA_DISTRIBUTION_SOURCE_TYPE, {
    version: IPA_DISTRIBUTION_SOURCE_VERSION,
    normalizeView: normalizeIpaDistributionView,
  }],
  [MORPHOLOGY_ANALYSIS_SOURCE_TYPE, {
    version: MORPHOLOGY_ANALYSIS_SOURCE_VERSION,
    normalizeView: normalizeMorphologyAnalysisView,
  }],
]);

function normalizeFeatureResultSource(value) {
  const source = assertObject(
    value,
    "invalid_feature_result_source",
    "Feature result source is required",
  );
  const type = String(source.type || "").trim();
  const definition = FEATURE_RESULT_SOURCE_DEFINITIONS.get(type);
  if (!definition) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result source",
      "unsupported_feature_result_source",
      { type },
    );
  }
  const version = Number(source.version);
  if (version !== definition.version) {
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

function normalizeFeatureResultView(source, view) {
  const definition = FEATURE_RESULT_SOURCE_DEFINITIONS.get(source.type);
  if (!definition) {
    throw new FeatureResultQueryValidationError(
      "Unsupported feature result source",
      "unsupported_feature_result_source",
      { type: source.type },
    );
  }
  return definition.normalizeView(view);
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
  const normalizedView = normalizeFeatureResultView(source, view);

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
      ...normalizedView,
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
    ...(normalized.view.value === undefined ? {} : { value: normalized.view.value }),
    ...(normalized.view.scope === undefined ? {} : { scope: normalized.view.scope }),
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
  IPA_DISTRIBUTION_CATEGORIES,
  IPA_DISTRIBUTION_SOURCE_TYPE,
  IPA_DISTRIBUTION_SOURCE_VERSION,
  MORPHOLOGY_ANALYSIS_CATEGORIES,
  MORPHOLOGY_ANALYSIS_SOURCE_TYPE,
  MORPHOLOGY_ANALYSIS_SOURCE_VERSION,
  MORPHOLOGY_OVERRIDE_SCOPES,
  FeatureResultQueryValidationError,
  featureResultSourceIdentity,
  featureResultViewIdentity,
  normalizeFeatureResultLocationQuery,
  normalizeFeatureResultQuery,
  normalizeFeatureResultSource,
};
