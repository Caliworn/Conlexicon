const {
  EntryQueryValidationError,
  entryQueryIdentity,
  normalizeEntryQuery,
} = require("./entry-query-model");
const {
  QUALITY_MODULE_KEYS,
  QUALITY_SEVERITY_KEYS,
} = require("./quality-model");

const QUALITY_SOURCE_TYPE = "dictionaryQuality";
const QUALITY_SOURCE_VERSION = 1;
const QUALITY_RESPONSE_MODES = new Set(["items", "summary"]);
const QUALITY_ITEM_KINDS = new Set(["issue", "entry"]);
const QUALITY_SELECTOR_VALUES = new Map([
  ["severity", new Set(QUALITY_SEVERITY_KEYS)],
  ["module", new Set(QUALITY_MODULE_KEYS)],
]);
const QUALITY_PAGE_LIMIT_DEFAULT = 200;
const QUALITY_PAGE_LIMIT_MAX = 200;

class QualityQueryValidationError extends Error {
  constructor(message, code, details = undefined) {
    super(message);
    this.name = "QualityQueryValidationError";
    this.code = code;
    this.details = details;
  }
}

function assertObject(value, code, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QualityQueryValidationError(message, code);
  }
  return value;
}

function normalizeQualitySource(value) {
  const source = assertObject(value, "invalid_quality_source", "Quality source is required");
  const type = String(source.type || "").trim();
  if (type !== QUALITY_SOURCE_TYPE) {
    throw new QualityQueryValidationError("Unsupported quality source", "unsupported_quality_source", { type });
  }
  if (Number(source.version) !== QUALITY_SOURCE_VERSION) {
    throw new QualityQueryValidationError(
      "Unsupported quality source version",
      "invalid_quality_source_version",
      { type, version: source.version },
    );
  }
  const options = source.options === undefined
    ? {}
    : assertObject(source.options, "invalid_quality_source_options", "Invalid quality source options");
  const unsupportedOptions = Object.keys(options);
  if (unsupportedOptions.length) {
    throw new QualityQueryValidationError(
      "Unsupported quality source options",
      "invalid_quality_source_options",
      { unsupportedOptions },
    );
  }
  return { type, version: QUALITY_SOURCE_VERSION, options: {} };
}

function normalizeQualitySelector(value) {
  const selector = value === undefined
    ? {}
    : assertObject(value, "invalid_quality_selector", "Invalid quality selector");
  const group = String(selector.group ?? "all").trim();
  if (group === "all") {
    if (selector.value !== undefined) {
      throw new QualityQueryValidationError(
        "The all selector does not accept a value",
        "invalid_quality_selector",
        { group, value: selector.value },
      );
    }
    return { group };
  }
  const allowedValues = QUALITY_SELECTOR_VALUES.get(group);
  const selectorValue = String(selector.value ?? "").trim();
  if (!allowedValues || !allowedValues.has(selectorValue)) {
    throw new QualityQueryValidationError(
      "Unsupported quality selector",
      "invalid_quality_selector",
      { group, value: selector.value },
    );
  }
  return { group, value: selectorValue };
}

function normalizeEntryQueryParts(input) {
  try {
    return normalizeEntryQuery(input, {
      defaultLimit: QUALITY_PAGE_LIMIT_DEFAULT,
      maxLimit: QUALITY_PAGE_LIMIT_MAX,
    });
  } catch (error) {
    if (error instanceof EntryQueryValidationError) {
      throw new QualityQueryValidationError(error.message, error.code, error.details);
    }
    throw error;
  }
}

function normalizeQualityQuery(value = {}) {
  const request = assertObject(value, "invalid_quality_query_payload", "Invalid quality query payload");
  const source = normalizeQualitySource(request.source);
  const responseMode = String(request.responseMode || "items").trim();
  if (!QUALITY_RESPONSE_MODES.has(responseMode)) {
    throw new QualityQueryValidationError(
      "Unsupported quality response mode",
      "invalid_quality_response_mode",
      { responseMode },
    );
  }
  if (responseMode === "summary") {
    const unsupportedFields = ["view", "page"].filter((field) => request[field] !== undefined);
    if (unsupportedFields.length) {
      throw new QualityQueryValidationError(
        "Summary quality queries do not accept view or page",
        "invalid_quality_summary_request",
        { unsupportedFields },
      );
    }
    return { source, responseMode };
  }

  const view = assertObject(request.view, "invalid_quality_view", "Invalid quality query view");
  const itemKind = String(view.itemKind || "").trim();
  if (!QUALITY_ITEM_KINDS.has(itemKind)) {
    throw new QualityQueryValidationError("Unsupported quality item kind", "invalid_quality_item_kind", {
      itemKind: view.itemKind,
    });
  }
  const selector = normalizeQualitySelector(view.selector);
  if (itemKind === "issue") {
    const unsupportedFields = ["search", "sort"].filter((field) => view[field] !== undefined);
    if (unsupportedFields.length) {
      throw new QualityQueryValidationError(
        "Issue windows use the stable issue order and do not accept entry search or sort",
        "invalid_quality_issue_view",
        { unsupportedFields },
      );
    }
    return {
      source,
      responseMode,
      view: { itemKind, selector },
      page: normalizeEntryQueryParts({ page: request.page }).page,
    };
  }
  const entryQuery = normalizeEntryQueryParts({
    search: view.search,
    sort: view.sort,
    page: request.page,
  });
  return {
    source,
    responseMode,
    view: {
      itemKind,
      selector,
      search: entryQuery.search,
      sort: entryQuery.sort,
    },
    page: entryQuery.page,
  };
}

function normalizeQualityLocationQuery(value = {}) {
  const request = assertObject(value, "invalid_quality_location_payload", "Invalid quality location payload");
  const entryId = String(request.entryId || "").trim();
  if (!entryId) {
    throw new QualityQueryValidationError(
      "Quality location entry ID is required",
      "invalid_quality_location_entry_id",
    );
  }
  if (request.responseMode !== undefined && String(request.responseMode).trim() !== "items") {
    throw new QualityQueryValidationError(
      "Quality location only supports item responses",
      "invalid_quality_response_mode",
      { responseMode: request.responseMode },
    );
  }
  const query = normalizeQualityQuery({
    source: request.source,
    responseMode: "items",
    view: request.view,
    page: {
      ...(request.page && typeof request.page === "object" && !Array.isArray(request.page) ? request.page : {}),
      cursor: "",
      windowOffset: null,
      offset: 0,
    },
  });
  if (query.view.itemKind !== "entry") {
    throw new QualityQueryValidationError(
      "Quality location only supports entry windows",
      "invalid_quality_item_kind",
      { itemKind: query.view.itemKind },
    );
  }
  return { ...query, entryId };
}

function qualityViewIdentity(query) {
  return {
    source: query.source,
    itemKind: query.view.itemKind,
    selector: query.view.selector,
    ...(query.view.itemKind === "entry"
      ? entryQueryIdentity({
        filter: {},
        search: query.view.search,
        sort: query.view.sort,
        page: query.page,
      })
      : {}),
  };
}

module.exports = {
  QUALITY_ITEM_KINDS,
  QUALITY_PAGE_LIMIT_DEFAULT,
  QUALITY_PAGE_LIMIT_MAX,
  QUALITY_SOURCE_TYPE,
  QUALITY_SOURCE_VERSION,
  QualityQueryValidationError,
  normalizeQualityLocationQuery,
  normalizeQualityQuery,
  normalizeQualitySource,
  qualityViewIdentity,
};
