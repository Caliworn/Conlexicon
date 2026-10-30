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

  // Color names a tag may carry; an empty color is the default tag style.
  const TAG_COLORS = Object.freeze(["red"]);
  const TAG_SEPARATOR_PATTERN = /[,，、]/;
  const EMPTY_TAG_REGISTRY = Object.freeze([]);
  const tagRegistryIndexes = new WeakMap();

  const normalizeText = searchNormalization.normalizeStructuralKey;

  function parseTagListText(value) {
    if (value === null || value === undefined) {
      return [];
    }
    return normalizeTagList(String(value).split(TAG_SEPARATOR_PATTERN));
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

  function tagHasSeparator(tag) {
    return TAG_SEPARATOR_PATTERN.test(tag);
  }

  function normalizeTagColor(value) {
    return TAG_COLORS.includes(value) ? value : "";
  }

  // A display label equal to the tag itself changes nothing, so it is not kept.
  function normalizeTagDisplayLabel(tag, value) {
    const label = String(value ?? "").trim();
    return label === tag ? "" : label;
  }

  // Registry rows in rank order: array order is the order, and the part-of-speech
  // zone always comes first. Each tag keeps its first row.
  function normalizeTagRegistry(value) {
    const rows = new Map();
    (Array.isArray(value) ? value : []).forEach((row) => {
      const tag = normalizeText(row?.tag);
      if (tag && !rows.has(tag)) {
        rows.set(tag, {
          tag,
          partOfSpeech: Boolean(row.partOfSpeech),
          displayLabel: normalizeTagDisplayLabel(tag, row.displayLabel),
          color: normalizeTagColor(row.color),
        });
      }
    });
    const registry = [...rows.values()];
    return [
      ...registry.filter((row) => row.partOfSpeech),
      ...registry.filter((row) => !row.partOfSpeech),
    ];
  }

  // New tags join the end of the general zone, in the order given.
  function appendTagsToRegistry(registry, tags) {
    const known = new Set(registry.map((row) => row.tag));
    const additions = [];
    tags.forEach((tag) => {
      if (!known.has(tag)) {
        known.add(tag);
        additions.push({ tag, partOfSpeech: false, displayLabel: "", color: "" });
      }
    });
    return additions.length ? [...registry, ...additions] : registry;
  }

  // Rows as the API sends them: a tag is ambiguous while another row shows the
  // same text, whether as its display label or as its raw value.
  function tagRegistryWithAmbiguity(registry) {
    const rawValuesByLabel = buildDisplayIdentityIndex(
      registry.map((row) => ({ value: row.tag, displayLabel: row.displayLabel })),
    );
    return registry.map((row) => ({
      ...row,
      displayAmbiguous: rawValuesByLabel.get(row.displayLabel || row.tag).size > 1,
    }));
  }

  // Lookup by raw value for one registry array, built once per array: registry
  // arrays are replaced, never changed in place.
  function tagRegistryIndex(registry = EMPTY_TAG_REGISTRY) {
    let index = tagRegistryIndexes.get(registry);
    if (!index) {
      index = new Map(registry.map((row, rank) => [row.tag, { ...row, rank }]));
      tagRegistryIndexes.set(registry, index);
    }
    return index;
  }

  function displayTag(tag, registry) {
    const value = String(tag || "");
    return tagRegistryIndex(registry).get(value)?.displayLabel || value;
  }

  function tagIsPart(tag, registry) {
    return Boolean(tagRegistryIndex(registry).get(tag)?.partOfSpeech);
  }

  function tagColor(tag, registry) {
    return tagRegistryIndex(registry).get(tag)?.color || "";
  }

  // Tags not yet registered exist only in unsaved drafts. They rank last, as
  // saving will place them, and keep their input order.
  function tagRank(tag, registry) {
    return tagRegistryIndex(registry).get(tag)?.rank ?? Number.POSITIVE_INFINITY;
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

  // The move that puts `tag` at `index` of a zone, counted without the tag
  // itself; an index past the end means the end of the zone.
  function tagMoveToIndex(registry, tag, partOfSpeech, index) {
    const zone = registry
      .filter((row) => row.partOfSpeech === partOfSpeech && row.tag !== tag)
      .map((row) => row.tag);
    return { tag, partOfSpeech, before: zone[index] ?? null };
  }

  // One step in rank order, up (-1) or down (1). Past the end of a zone the tag
  // enters the other zone at the side next to it. Null at either end of the registry.
  function tagMoveStep(registry, tag, direction) {
    const { partOfSpeech } = tagRegistryIndex(registry).get(tag);
    const zone = registry.filter((row) => row.partOfSpeech === partOfSpeech).map((row) => row.tag);
    const index = zone.indexOf(tag) + direction;
    if (index >= 0 && index < zone.length) {
      return tagMoveToIndex(registry, tag, partOfSpeech, index);
    }
    if (direction > 0 && partOfSpeech) {
      return tagMoveToIndex(registry, tag, false, 0);
    }
    if (direction < 0 && !partOfSpeech) {
      return tagMoveToIndex(registry, tag, true, Number.POSITIVE_INFINITY);
    }
    return null;
  }

  function entryParts(entry = {}, registry) {
    return (Array.isArray(entry.tags) ? entry.tags : []).filter((tag) => tagIsPart(tag, registry));
  }

  function arrangeTags(tags = [], registry) {
    return tags
      .filter(Boolean)
      .map((tag, index) => ({ tag, index, rank: tagRank(tag, registry) }))
      .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
      .map(({ tag }) => tag);
  }

  // An entry as a whole carries its own tags plus every definition's tags. With
  // a registry the result is in rank order; without one, entry tags come first,
  // then definitions in order, each tag at its first occurrence.
  function effectiveEntryTags(entry = {}, registry = null) {
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
    return registry ? arrangeTags(tags, registry) : tags;
  }

  // How each definition's tags relate to the entry's own tags. A definition tag
  // the entry also has is a "duplicate"; while the entry has parts of speech of
  // its own, a definition part of speech the entry lacks is "mixedPart". While
  // the registry has parts of speech, a definition without one on either layer
  // is `missingPart`.
  function definitionTagLayerStates(entry = {}, registry) {
    const isPart = (tag) => tagIsPart(tag, registry);
    const partsConfigured = [...tagRegistryIndex(registry).values()].some((row) => row.partOfSpeech);
    const entryTags = new Set(entry.tags || []);
    const entryHasParts = (entry.tags || []).some(isPart);
    return (entry.definitions || []).map((definition) => {
      const tags = definition.tags || [];
      return {
        tags: tags.map((tag) => ({
          tag,
          state: entryTags.has(tag) ? "duplicate" : (entryHasParts && isPart(tag) ? "mixedPart" : ""),
        })),
        missingPart: partsConfigured && !entryHasParts && !tags.some(isPart),
      };
    });
  }

  return {
    DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    DEFAULT_TAG_LIST_SEPARATOR_STYLE,
    MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT,
    TAG_COLORS,
    appendTagsToRegistry,
    arrangeTags,
    buildDisplayIdentityIndex,
    definitionTagLayerStates,
    displayIdentity,
    displayTag,
    effectiveEntryTags,
    entryParts,
    normalizeEntryListTagDisplayLimit,
    normalizeTagColor,
    normalizeTagDisplayLabel,
    normalizeTagList,
    normalizeTagListSeparatorStyle,
    normalizeTagRegistry,
    parseTagListText,
    serializeTagList,
    tagColor,
    tagHasSeparator,
    tagIsPart,
    tagMoveStep,
    tagMoveToIndex,
    tagRank,
    tagRegistryIndex,
    tagRegistryWithAmbiguity,
  };
});
