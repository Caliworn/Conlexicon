(function initTagModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconTags = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createTagModel() {
  const DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT = 3;
  const MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT = 2;
  const MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT = 10;

  function normalizeText(value, locale = "zh-CN") {
    return String(value || "").trim().toLocaleLowerCase(locale);
  }

  function splitTagList(value) {
    return String(value || "")
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
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
    const items = Array.isArray(value) ? value.map(String) : splitTagList(value);
    const unique = [];
    items
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!unique.includes(item)) {
          unique.push(item);
        }
      });
    return unique;
  }

  function normalizeRedHighlightTags(value) {
    const items = Array.isArray(value)
      ? value.map(String)
      : String(value || "").split(/[\s,，、]+/);
    const unique = [];
    items
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!unique.includes(item)) {
          unique.push(item);
        }
      });
    return unique;
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

  function entryParts(entry = {}, dictionaryOrSettings = {}, options = {}) {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    if (!tags.length) {
      return [];
    }
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    if (!settings.manualPartOfSpeechTags) {
      return tags[0] ? [tags[0]] : [];
    }
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const configuredParts = new Set((settings.partOfSpeechTags || []).map(normalize));
    if (!configuredParts.size) {
      return [];
    }
    return tags.filter((tag) => configuredParts.has(normalize(tag)));
  }

  function entryTagIsPart(entry = {}, tagIndex = -1, tag = "", dictionaryOrSettings = {}, options = {}) {
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    if (!settings.manualPartOfSpeechTags) {
      return tagIndex === 0;
    }
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    return entryParts(entry, settings, { normalizeText: normalize }).some((part) => normalize(part) === normalize(tag));
  }

  function entryListDisplayTag(tag, dictionaryOrSettings = {}) {
    const value = String(tag || "");
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    return settings.entryListRawTagDisplay ? value : displayTag(value, settings);
  }

  function tagIsRedHighlighted(tag, dictionaryOrSettings = {}, options = {}) {
    const settings = dictionaryOrSettings?.settings || dictionaryOrSettings || {};
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const candidates = new Set((settings.redHighlightTags || []).map(normalize));
    return candidates.has(normalize(tag)) || candidates.has(normalize(displayTag(tag, settings)));
  }

  return {
    DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    displayTag,
    entryListDisplayTag,
    entryParts,
    entryTagIsPart,
    normalizeEntryListTagDisplayLimit,
    normalizeRedHighlightTags,
    normalizeTagDisplayMap,
    normalizeTagList,
    tagIsRedHighlighted,
  };
});
