(function initTagModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./search-normalization-model"));
    return;
  }
  root.ConlexiconTags = factory(root.ConlexiconSearchNormalization);
})(typeof globalThis !== "undefined" ? globalThis : this, function createTagModel(searchNormalization) {
  const DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT = 3;
  const MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT = 2;
  const MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT = 10;
  const DEFAULT_TAG_LIST_SEPARATOR_STYLE = "commaSpace";
  const TAG_LIST_SEPARATORS = {
    commaSpace: ", ",
    fullwidthComma: "，",
    ideographicComma: "、",
  };

  const normalizeText = searchNormalization.normalizeStructuralKey;

  function parseTagListText(value) {
    if (value === null || value === undefined) {
      return [];
    }
    return normalizeTagList(String(value).split(/[,，、]/));
  }

  function normalizeTagDisplayMap(map = {}) {
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(map)
        .map(([key, value]) => [String(key).trim(), String(value).trim()])
        .filter(([key, value]) => key && value),
    );
  }

  function normalizeTagList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const unique = [];
    value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item).trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!unique.includes(item)) {
          unique.push(item);
        }
      });
    return unique;
  }

  function normalizeTagListSeparatorStyle(value) {
    return Object.hasOwn(TAG_LIST_SEPARATORS, value)
      ? value
      : DEFAULT_TAG_LIST_SEPARATOR_STYLE;
  }

  function serializeTagList(value, style = DEFAULT_TAG_LIST_SEPARATOR_STYLE) {
    return normalizeTagList(value).join(TAG_LIST_SEPARATORS[normalizeTagListSeparatorStyle(style)]);
  }

  function normalizeEntryListTagDisplayLimit(value) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) {
      return DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT;
    }
    return Math.min(MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT, Math.max(MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT, number));
  }

  function displayTag(tag, dictionaryOrSettings = {}) {
    const value = String(tag || "");
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    return settings.tagDisplayMap?.[value] || value;
  }

  function buildDisplayIdentityIndex(items = []) {
    const rawValuesByLabel = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const value = String(item?.value ?? "");
      if (!value) {
        return;
      }
      const label = String(item?.displayLabel || value);
      if (!rawValuesByLabel.has(label)) {
        rawValuesByLabel.set(label, new Set());
      }
      rawValuesByLabel.get(label).add(value);
    });
    return rawValuesByLabel;
  }

  function resolveDisplayIdentity(value, displayLabel, index = new Map()) {
    const rawValue = String(value ?? "");
    const label = String(displayLabel || rawValue);
    const ambiguous = (index.get(label)?.size || 0) > 1;
    return {
      label,
      rawLabel: ambiguous && label !== rawValue ? rawValue : "",
      ambiguous,
    };
  }

  function entryParts(entry = {}, dictionaryOrSettings = {}, options = {}) {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    if (!tags.length) {
      return [];
    }
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    const normalize = options.normalizeText || normalizeText;
    const configuredParts = new Set((settings.partOfSpeechTags || []).map(normalize));
    if (!configuredParts.size) {
      return [];
    }
    return tags.filter((tag) => configuredParts.has(normalize(tag)));
  }

  function entryTagIsPart(entry = {}, tag = "", dictionaryOrSettings = {}, options = {}) {
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    const normalize = options.normalizeText || normalizeText;
    return entryParts(entry, settings, { normalizeText: normalize }).some((part) => normalize(part) === normalize(tag));
  }

  function entryListDisplayTag(tag, dictionaryOrSettings = {}) {
    const value = String(tag || "");
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    return settings.entryListRawTagDisplay ? value : displayTag(value, settings);
  }

  function tagIsRedHighlighted(tag, dictionaryOrSettings = {}, options = {}) {
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    const normalize = options.normalizeText || normalizeText;
    const candidates = new Set((settings.redHighlightTags || []).map(normalize));
    return candidates.has(normalize(tag)) || candidates.has(normalize(displayTag(tag, settings)));
  }

  return {
    DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    DEFAULT_TAG_LIST_SEPARATOR_STYLE,
    MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    buildDisplayIdentityIndex,
    displayTag,
    entryListDisplayTag,
    entryParts,
    entryTagIsPart,
    normalizeEntryListTagDisplayLimit,
    normalizeTagDisplayMap,
    normalizeTagList,
    normalizeTagListSeparatorStyle,
    parseTagListText,
    resolveDisplayIdentity,
    serializeTagList,
    tagIsRedHighlighted,
  };
});
