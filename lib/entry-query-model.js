(function initEntryQueryModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./entry-search-model"),
      require("./search-normalization-model"),
    );
    return;
  }
  root.ConlexiconEntryQuery = factory(
    root.ConlexiconEntrySearch,
    root.ConlexiconSearchNormalization,
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function createEntryQueryModel(
  entrySearchModel,
  searchNormalization,
) {
  const ENTRY_QUERY_SORTS = new Set([
    "lemmaAsc",
    "lemmaDesc",
    "updatedAsc",
    "updatedDesc",
    "createdAsc",
    "createdDesc",
  ]);
  const ENTRY_FILTER_PRESENCE_FIELDS = new Set([
    "definition",
    "example",
    "entryNote",
    "source",
    "ipa",
  ]);
  const ENTRY_FILTER_ACTIVITY_FIELDS = new Set(["created", "updated"]);
  const ENTRY_QUERY_LIMIT_DEFAULT = 100;
  const ENTRY_QUERY_LIMIT_MAX = 10000;

  class EntryQueryValidationError extends Error {
    constructor(message, code, details = undefined) {
      super(message);
      this.name = "EntryQueryValidationError";
      this.code = code;
      this.details = details;
    }
  }

  function splitList(value) {
    if (Array.isArray(value) || value instanceof Set) {
      return [...value];
    }
    return String(value || "").split(/[,，、\n]/);
  }

  function sortedUnique(values, normalizeValue = String) {
    return [...new Set(splitList(values)
      .map((value) => normalizeValue(value))
      .filter(Boolean))].sort();
  }

  function normalizeNonNegativeInteger(value, fallback, code) {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    if (!/^\d+$/.test(String(value))) {
      throw new EntryQueryValidationError("Entry query value must be a non-negative integer", code, { value });
    }
    const normalized = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(normalized)) {
      throw new EntryQueryValidationError("Entry query value exceeds the safe integer range", code, { value });
    }
    return normalized;
  }

  function normalizeLimit(value, options = {}) {
    const defaultLimit = Math.max(1, Number(options.defaultLimit) || ENTRY_QUERY_LIMIT_DEFAULT);
    const maxLimit = Math.max(defaultLimit, Number(options.maxLimit) || ENTRY_QUERY_LIMIT_MAX);
    if (value === undefined || value === null || value === "") {
      return defaultLimit;
    }
    const normalized = normalizeNonNegativeInteger(value, defaultLimit, "invalid_entry_query_limit");
    if (normalized < 1) {
      throw new EntryQueryValidationError("Entry query limit must be at least one", "invalid_entry_query_limit", { value });
    }
    return Math.min(normalized, maxLimit);
  }

  function normalizePresence(value) {
    const source = Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.entries(value).map(([field, present]) => ({ field, present }))
        : [];
    const byField = new Map();
    source.forEach((condition) => {
      const field = String(condition?.field || "").trim();
      if (!ENTRY_FILTER_PRESENCE_FIELDS.has(field)) {
        throw new EntryQueryValidationError("Unsupported entry presence filter", "invalid_entry_filter_presence", { field });
      }
      const present = condition.present !== false;
      if (byField.has(field) && byField.get(field) !== present) {
        throw new EntryQueryValidationError("Conflicting entry presence filters", "conflicting_entry_filter_presence", { field });
      }
      byField.set(field, present);
    });
    return [...byField.entries()]
      .map(([field, present]) => ({ field, present }))
      .sort((left, right) => left.field.localeCompare(right.field));
  }

  function normalizeSourceCount(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const source = typeof value === "number" || typeof value === "string" ? { min: value } : value;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new EntryQueryValidationError("Invalid source count filter", "invalid_entry_filter_source_count");
    }
    if ((source.min === undefined || source.min === null || source.min === "")
      && (source.max === undefined || source.max === null || source.max === "")) {
      return null;
    }
    const min = normalizeNonNegativeInteger(source.min, 0, "invalid_entry_filter_source_count");
    const max = normalizeNonNegativeInteger(source.max, null, "invalid_entry_filter_source_count");
    if (max !== null && max < min) {
      throw new EntryQueryValidationError("Source count maximum is smaller than its minimum", "invalid_entry_filter_source_count", { min, max });
    }
    return { min, max };
  }

  function normalizeActivityDays(value) {
    const source = Array.isArray(value) ? value : value ? [value] : [];
    const byField = new Map();
    source.forEach((condition) => {
      const field = String(condition?.field || "").trim();
      const day = String(condition?.day || "").trim();
      const dayMatch = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const dayIsValid = dayMatch && (() => {
        const year = Number(dayMatch[1]);
        const month = Number(dayMatch[2]);
        const date = Number(dayMatch[3]);
        const parsed = new Date(Date.UTC(year, month - 1, date));
        return parsed.getUTCFullYear() === year
          && parsed.getUTCMonth() === month - 1
          && parsed.getUTCDate() === date;
      })();
      if (!ENTRY_FILTER_ACTIVITY_FIELDS.has(field) || !dayIsValid) {
        throw new EntryQueryValidationError("Invalid entry activity day filter", "invalid_entry_filter_activity_day", { field, day });
      }
      if (byField.has(field) && byField.get(field) !== day) {
        throw new EntryQueryValidationError("Conflicting entry activity day filters", "conflicting_entry_filter_activity_day", { field });
      }
      byField.set(field, day);
    });
    return [...byField.entries()]
      .map(([field, day]) => ({ field, day }))
      .sort((left, right) => left.field.localeCompare(right.field));
  }

  function normalizeDerivedFrom(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return {
        entryId: String(value.entryId || "").trim(),
        reference: searchNormalization.normalizeSearchText(value.reference),
      };
    }
    return {
      entryId: "",
      reference: searchNormalization.normalizeSearchText(value),
    };
  }

  function normalizeEntryFilter(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const tagSource = source.tags && typeof source.tags === "object" && !Array.isArray(source.tags)
      ? source.tags
      : { values: source.tags, mode: source.tagMode };
    return {
      part: searchNormalization.normalizeStructuralKey(source.part),
      tags: {
        values: sortedUnique(tagSource.values, searchNormalization.normalizeStructuralKey),
        mode: tagSource.mode === "all" ? "all" : "any",
      },
      sourceText: searchNormalization.normalizeSearchText(source.sourceText ?? source.source),
      derivedFrom: normalizeDerivedFrom(source.derivedFrom),
      presence: normalizePresence(source.presence),
      sourceCount: normalizeSourceCount(source.sourceCount),
      activityDays: normalizeActivityDays(source.activityDays ?? source.activityDay),
    };
  }

  function parseEntryFilterTransport(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    if (typeof value === "string") {
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new EntryQueryValidationError("Entry filter is not valid JSON", "invalid_entry_filter_json");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new EntryQueryValidationError("Entry filter must be an object", "invalid_entry_filter_payload");
      }
      return parsed;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new EntryQueryValidationError("Entry filter must be an object", "invalid_entry_filter_payload");
    }
    return value;
  }

  function hasFlatFilterTransport(source = {}) {
    return ["part", "tags", "tagMode", "source", "derivedFrom"]
      .some((key) => Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null && source[key] !== "");
  }

  function normalizeEntrySearch(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const fields = source.fields || source.searchFields;
    const fuzzyFields = source.fuzzyFields;
    const normalizedFields = [...entrySearchModel.normalizeSearchFields(fields instanceof Set ? [...fields] : fields)].sort();
    const normalizedFuzzyFields = [...entrySearchModel.normalizeFuzzyFields(fuzzyFields instanceof Set ? [...fuzzyFields] : fuzzyFields)]
      .filter((field) => normalizedFields.includes(field))
      .sort();
    return {
      text: String(source.text ?? source.q ?? source.query ?? "").trim(),
      fields: normalizedFields,
      fuzzyFields: normalizedFuzzyFields,
    };
  }

  function transportFilterInput(query) {
    return {
      part: query.part,
      tags: query.tags,
      tagMode: query.tagMode,
      source: query.source,
      derivedFrom: query.derivedFrom,
    };
  }

  function normalizeEntryQuery(value = {}, options = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const structuredFilter = parseEntryFilterTransport(source.filter);
    if (structuredFilter && hasFlatFilterTransport(source)) {
      throw new EntryQueryValidationError(
        "Structured and flat entry filters cannot be combined",
        "conflicting_entry_filter_transport",
      );
    }
    const filter = structuredFilter || transportFilterInput(source);
    const search = source.search && typeof source.search === "object" && !Array.isArray(source.search)
      ? source.search
      : {
        text: source.q ?? source.query,
        fields: source.fields ?? source.searchFields,
        fuzzyFields: source.fuzzyFields,
      };
    const page = source.page && typeof source.page === "object" && !Array.isArray(source.page)
      ? source.page
      : source;
    return {
      filter: normalizeEntryFilter(filter),
      search: normalizeEntrySearch(search),
      sort: ENTRY_QUERY_SORTS.has(source.sort) ? source.sort : "lemmaAsc",
      page: {
        limit: normalizeLimit(page.limit, options),
        cursor: String(page.cursor || ""),
        windowOffset: normalizeNonNegativeInteger(page.windowOffset, null, "invalid_query_window_offset"),
        offset: normalizeNonNegativeInteger(page.offset, 0, "invalid_query_offset"),
      },
    };
  }

  function entryQueryIdentity(value = {}) {
    const query = value.filter && value.search && value.page ? value : normalizeEntryQuery(value);
    const hasSearch = Boolean(query.search.text);
    return {
      filter: normalizeEntryFilter(query.filter),
      search: {
        text: query.search.text,
        fields: hasSearch ? sortedUnique(query.search.fields) : [],
        fuzzyFields: hasSearch ? sortedUnique(query.search.fuzzyFields) : [],
      },
      sort: query.sort,
    };
  }

  function serializeEntryFilter(value = {}) {
    return JSON.stringify(normalizeEntryFilter(value));
  }

  return {
    ENTRY_FILTER_ACTIVITY_FIELDS,
    ENTRY_FILTER_PRESENCE_FIELDS,
    ENTRY_QUERY_LIMIT_DEFAULT,
    ENTRY_QUERY_LIMIT_MAX,
    ENTRY_QUERY_SORTS,
    EntryQueryValidationError,
    entryQueryIdentity,
    normalizeEntryFilter,
    normalizeEntryQuery,
    normalizeEntrySearch,
    parseEntryFilterTransport,
    serializeEntryFilter,
  };
});
