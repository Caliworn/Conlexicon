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

  function displayIdentity(value, displayLabel, ambiguous = false) {
    const rawValue = String(value ?? "");
    const label = String(displayLabel || rawValue);
    return {
      label,
      rawLabel: ambiguous && label !== rawValue ? rawValue : "",
      ambiguous: Boolean(ambiguous),
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

  function tagIsRedHighlighted(tag, dictionaryOrSettings = {}, options = {}) {
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    const normalize = options.normalizeText || normalizeText;
    const candidates = new Set((settings.redHighlightTags || []).map(normalize));
    return candidates.has(normalize(tag)) || candidates.has(normalize(displayTag(tag, settings)));
  }

  // Puts tags listed in `order` first, by their position there, and keeps the
  // rest in their original order. Matching ignores case, as the settings form does.
  function arrangeTagsByOrder(tags = [], order = []) {
    const ranks = new Map();
    normalizeTagList(order).forEach((tag, index) => {
      const key = searchNormalization.normalizeText(tag);
      if (key && !ranks.has(key)) {
        ranks.set(key, index);
      }
    });
    const items = tags.filter(Boolean);
    if (!ranks.size || items.length < 2) {
      return items;
    }
    const rankOf = (tag) => ranks.get(searchNormalization.normalizeText(tag)) ?? Number.POSITIVE_INFINITY;
    return items
      .map((tag, index) => ({ tag, index, rank: rankOf(tag) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ tag }) => tag);
  }

  // An entry as a whole carries its own tags plus every definition's tags:
  // entry tags first, then definitions in order, each tag at its first
  // occurrence. With `order` the result is arranged like arrangeTagsByOrder.
  function effectiveEntryTags(entry = {}, order = []) {
    const tags = [...(entry.tags || [])];
    const seen = new Set(tags);
    (entry.definitions || []).forEach((definition) => {
      (definition.tags || []).forEach((tag) => {
        if (!seen.has(tag)) {
          seen.add(tag);
          tags.push(tag);
        }
      });
    });
    return arrangeTagsByOrder(tags, order);
  }

  return {
    DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    DEFAULT_TAG_LIST_SEPARATOR_STYLE,
    MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    arrangeTagsByOrder,
    buildDisplayIdentityIndex,
    displayIdentity,
    displayTag,
    effectiveEntryTags,
    entryParts,
    entryTagIsPart,
    normalizeEntryListTagDisplayLimit,
    normalizeTagDisplayMap,
    normalizeTagList,
    normalizeTagListSeparatorStyle,
    parseTagListText,
    serializeTagList,
    tagIsRedHighlighted,
  };
});
