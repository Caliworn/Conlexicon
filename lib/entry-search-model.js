(function initEntrySearchModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./tag-model"), require("./morphology-model"));
    return;
  }
  root.ConlexiconEntrySearch = factory(root.ConlexiconTags, root.ConlexiconMorphology);
})(typeof globalThis !== "undefined" ? globalThis : this, function createEntrySearchModel(tagModel, morphologyModel) {
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

  function normalizeText(value, locale = "zh-CN") {
    return String(value || "").trim().toLocaleLowerCase(locale);
  }

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
    return { fields, fuzzyFields };
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

  function entrySearchFieldValues(entry = {}, dictionary = {}, options = {}) {
    const fields = options.fields instanceof Set
      ? options.fields
      : normalizeSearchFields(options.fields || options.searchFields);
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const values = Object.fromEntries(ENTRY_SEARCH_FIELD_KEYS.map((field) => [field, []]));

    if (fields.has("lemma")) {
      values.lemma.push(entry.lemma);
    }
    if (fields.has("pronunciation")) {
      values.pronunciation.push(entry.pronunciation);
    }
    if (fields.has("tags")) {
      const parts = tagModel.entryParts(entry, dictionary, options);
      values.tags.push(
        ...parts,
        ...parts.map((part) => tagModel.displayTag(part, dictionary)),
        ...tags,
        ...tags.map((tag) => tagModel.displayTag(tag, dictionary)),
      );
    }
    if (fields.has("definitions")) {
      values.definitions.push(...(entry.definitions || []).map((definition) => definition.meaning));
    }
    if (fields.has("examples")) {
      values.examples.push(...(entry.definitions || []).map((definition) => definition.example));
    }
    if (fields.has("notes")) {
      values.notes.push(entry.notes, ...(entry.definitions || []).map((definition) => definition.note));
    }
    if (fields.has("etymology")) {
      values.etymology.push(entry.etymology?.description, ...(entry.etymology?.sources || []));
    }
    if (fields.has("morphology")) {
      values.morphology.push(...morphologyModel.morphologySearchStrings(entry, dictionary));
    }

    return values;
  }

  function entrySearchValues(entry = {}, dictionary = {}, options = {}) {
    const fieldValues = entrySearchFieldValues(entry, dictionary, options);
    return ENTRY_SEARCH_FIELD_KEYS.flatMap((field) => fieldValues[field]);
  }

  function entrySearchText(entry = {}, dictionary = {}, options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    return entrySearchValues(entry, dictionary, options).map(normalize).join(" ");
  }

  function fuzzyScore(value, query, options = {}) {
    const normalize = options.normalizeText || ((text) => normalizeText(text, options.locale || "zh-CN"));
    const text = normalize(value);
    const needle = normalize(query);
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

  function textMatches(text, query, options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const normalizedText = normalize(text);
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return true;
    }
    if (normalizedText.includes(normalizedQuery)) {
      return true;
    }
    return optionEnabled(options.fuzzy) && fuzzyScore(text, query, { ...options, normalizeText: normalize }) > 0;
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
      return textMatches(values.join(" "), normalizedQuery, {
        normalizeText: normalize,
        fuzzy: fuzzyFields.has(field),
      });
    });
  }

  return {
    ENTRY_SEARCH_FIELD_KEYS,
    ENTRY_SEARCH_FIELDS,
    entryMatchesSearchText,
    entrySearchFieldValues,
    entrySearchText,
    entrySearchValues,
    fieldFuzzyEnabled,
    fuzzyScore,
    normalizeFuzzyFields,
    normalizeEntrySearchSettings,
    normalizeSearchFields,
    searchSettingsQueryOptions,
    searchSettingsHaveEnabledField,
    splitSearchFieldList,
    textMatches,
  };
});
