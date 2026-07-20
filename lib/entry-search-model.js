(function initEntrySearchModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./tag-model"),
      require("./morphology-model"),
      require("./search-normalization-model"),
    );
    return;
  }
  root.ConlexiconEntrySearch = factory(
    root.ConlexiconTags,
    root.ConlexiconMorphology,
    root.ConlexiconSearchNormalization,
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function createEntrySearchModel(tagModel, morphologyModel, searchNormalization) {
  const ENTRY_SEARCH_FIELD_KEYS = [
    "lemma",
    "pronunciation",
    "tags",
    "definitions",
    "examples",
    "notes",
    "etymology",
    "morphology",
  ];
  const ENTRY_SEARCH_FIELDS = new Set(ENTRY_SEARCH_FIELD_KEYS);
  const STATIC_ENTRY_SEARCH_FIELD_KEYS = ENTRY_SEARCH_FIELD_KEYS.filter((field) => field !== "morphology");
  const STATIC_ENTRY_SEARCH_FIELDS = new Set(STATIC_ENTRY_SEARCH_FIELD_KEYS);

  const normalizeText = searchNormalization.normalizeText;

  function splitSearchFieldList(value) {
    return String(value || "")
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeSearchFields(value) {
    const source = Array.isArray(value) ? value : splitSearchFieldList(value);
    const fields = source
      .map((field) => String(field || "").trim().toLowerCase())
      .filter((field) => ENTRY_SEARCH_FIELDS.has(field));
    return fields.length ? new Set(fields) : new Set(ENTRY_SEARCH_FIELD_KEYS);
  }

  function normalizeEntrySearchSettings(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const sourceFields = source.fields && typeof source.fields === "object" && !Array.isArray(source.fields)
      ? source.fields
      : {};
    const fields = Object.fromEntries(ENTRY_SEARCH_FIELD_KEYS.map((field) => {
      const raw = sourceFields[field] && typeof sourceFields[field] === "object" && !Array.isArray(sourceFields[field])
        ? sourceFields[field]
        : {};
      return [field, {
        enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
        fuzzy: raw.fuzzy === undefined ? true : Boolean(raw.fuzzy),
      }];
    }));
    const sourceAutocomplete = source.etymologyAutocomplete
      && typeof source.etymologyAutocomplete === "object"
      && !Array.isArray(source.etymologyAutocomplete)
      ? source.etymologyAutocomplete
      : {};
    return {
      fields,
      etymologyAutocomplete: {
        fuzzy: sourceAutocomplete.fuzzy === undefined ? true : Boolean(sourceAutocomplete.fuzzy),
      },
      normalization: searchNormalization.normalizeConfiguredSearchOptions(source.normalization),
    };
  }

  function searchSettingsQueryOptions(value = {}) {
    const settings = normalizeEntrySearchSettings(value);
    const fields = new Set();
    const fuzzyFields = new Set();
    ENTRY_SEARCH_FIELD_KEYS.forEach((field) => {
      const config = settings.fields[field];
      if (!config.enabled) {
        return;
      }
      fields.add(field);
      if (config.fuzzy) {
        fuzzyFields.add(field);
      }
    });
    const normalizer = searchNormalization.createConfiguredSearchNormalizer(settings.normalization);
    return {
      fields,
      fuzzyFields,
      normalization: normalizer.config,
      normalizationErrors: normalizer.errors,
      normalizeText: normalizer.normalize,
      normalizeTextWithMap: normalizer.normalizeWithMap,
    };
  }

  function searchSettingsHaveEnabledField(value = {}) {
    return Object.values(normalizeEntrySearchSettings(value).fields)
      .some((field) => field.enabled);
  }

  function normalizeFuzzyFields(value) {
    const source = Array.isArray(value) ? value : splitSearchFieldList(value);
    const fields = source
      .map((field) => String(field || "").trim().toLowerCase())
      .filter((field) => ENTRY_SEARCH_FIELDS.has(field));
    return new Set(fields);
  }

  function optionEnabled(value) {
    return value === true || value === "true" || value === "1" || value === 1;
  }

  function fieldFuzzyEnabled(field, options = {}) {
    const fuzzyFields = options.fuzzyFields instanceof Set
      ? options.fuzzyFields
      : normalizeFuzzyFields(options.fuzzyFields);
    return fuzzyFields.has(field);
  }

  function entrySearchValueRecords(entry = {}, dictionary = {}, options = {}) {
    const fields = options.fields instanceof Set
      ? options.fields
      : normalizeSearchFields(options.fields || options.searchFields);
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const records = [];
    const addRecord = (field, value, locator = {}) => {
      const text = String(value || "");
      if (!fields.has(field) || !text) {
        return;
      }
      records.push({
        field,
        value: text,
        sourceType: String(locator.sourceType || "entry"),
        sourceId: String(locator.sourceId || ""),
        sourcePosition: Math.max(0, Number.parseInt(locator.sourcePosition, 10) || 0),
        valueType: String(locator.valueType || field),
      });
    };

    if (fields.has("lemma")) {
      addRecord("lemma", entry.lemma, { sourceId: entry.id, valueType: "lemma" });
    }
    if (fields.has("pronunciation")) {
      addRecord("pronunciation", entry.pronunciation, { sourceId: entry.id, valueType: "pronunciation" });
    }
    if (fields.has("tags")) {
      tags.forEach((tag, position) => {
        addRecord("tags", tag, { sourceType: "tag", sourcePosition: position, valueType: "raw" });
        const display = tagModel.displayTag(tag, dictionary);
        if (display !== tag) {
          addRecord("tags", display, { sourceType: "tag", sourcePosition: position, valueType: "display" });
        }
      });
    }
    (entry.definitions || []).forEach((definition, position) => {
      const locator = { sourceType: "definition", sourceId: definition.id, sourcePosition: position };
      addRecord("definitions", definition.meaning, { ...locator, valueType: "meaning" });
      addRecord("examples", definition.example, { ...locator, valueType: "example" });
      addRecord("notes", definition.note, { ...locator, valueType: "note" });
    });
    addRecord("notes", entry.notes, { sourceId: entry.id, valueType: "note" });
    (entry.morphologyGroups || []).forEach((group, position) => {
      addRecord("notes", group.notes, {
        sourceType: "morphologyGroup",
        sourceId: group.templateGroupId,
        sourcePosition: position,
        valueType: "note",
      });
    });
    addRecord("etymology", entry.etymology?.description, { sourceId: entry.id, valueType: "description" });
    (entry.etymology?.sources || []).forEach((source, position) => {
      addRecord("etymology", source, { sourceType: "etymologySource", sourcePosition: position, valueType: "source" });
    });
    if (fields.has("morphology")) {
      morphologyModel.morphologySearchValueRecords(entry, dictionary).forEach((record) => {
        addRecord("morphology", record.value, {
          sourceType: "morphology",
          sourceId: record.tableId,
          sourcePosition: record.sourcePosition,
          valueType: "generated",
        });
      });
    }

    return records;
  }

  function entrySearchFieldValues(entry = {}, dictionary = {}, options = {}) {
    const values = Object.fromEntries(ENTRY_SEARCH_FIELD_KEYS.map((field) => [field, []]));
    entrySearchValueRecords(entry, dictionary, options).forEach((record) => {
      values[record.field].push(record.value);
    });
    return values;
  }

  function fuzzyScoreNormalized(text, needle) {
    if (!needle) {
      return 0;
    }
    if (text.includes(needle)) {
      return 100 + needle.length;
    }

    let score = 0;
    let lastIndex = -1;
    for (const char of needle) {
      const index = text.indexOf(char, lastIndex + 1);
      if (index < 0) {
        return 0;
      }
      score += index === lastIndex + 1 ? 6 : 2;
      lastIndex = index;
    }
    return score - Math.max(0, text.length - needle.length) * 0.02;
  }

  function fuzzyScore(value, query, options = {}) {
    const normalize = options.normalizeText || ((text) => normalizeText(text, options.locale || "zh-CN"));
    return fuzzyScoreNormalized(normalize(value), normalize(query));
  }

  function normalizedTextMatches(normalizedText, normalizedQuery, fuzzy = false) {
    if (!normalizedQuery) {
      return true;
    }
    if (normalizedText.includes(normalizedQuery)) {
      return true;
    }
    return optionEnabled(fuzzy) && fuzzyScoreNormalized(normalizedText, normalizedQuery) > 0;
  }

  function textMatches(text, query, options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const normalizedText = normalize(text);
    const normalizedQuery = normalize(query);
    return normalizedTextMatches(normalizedText, normalizedQuery, options.fuzzy);
  }

  function entryMatchesSearchText(entry = {}, dictionary = {}, query = "", options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return true;
    }
    const fieldValues = entrySearchFieldValues(entry, dictionary, options);
    const fuzzyFields = options.fuzzyFields instanceof Set
      ? options.fuzzyFields
      : normalizeFuzzyFields(options.fuzzyFields);
    return ENTRY_SEARCH_FIELD_KEYS.some((field) => {
      const values = fieldValues[field];
      if (!values.length) {
        return false;
      }
      return values.some((value) => textMatches(value, query, {
        normalizeText: normalize,
        fuzzy: fuzzyFields.has(field),
      }));
    });
  }

  return {
    ENTRY_SEARCH_FIELD_KEYS,
    ENTRY_SEARCH_FIELDS,
    STATIC_ENTRY_SEARCH_FIELD_KEYS,
    STATIC_ENTRY_SEARCH_FIELDS,
    entryMatchesSearchText,
    entrySearchFieldValues,
    entrySearchValueRecords,
    fieldFuzzyEnabled,
    fuzzyScore,
    fuzzyScoreNormalized,
    normalizedTextMatches,
    normalizeFuzzyFields,
    normalizeEntrySearchSettings,
    normalizeSearchFields,
    searchSettingsQueryOptions,
    searchSettingsHaveEnabledField,
    splitSearchFieldList,
    textMatches,
  };
});
