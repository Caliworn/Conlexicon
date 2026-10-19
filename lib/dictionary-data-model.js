(function initDictionaryDataModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./tag-model"),
      require("./ipa-model"),
      require("./entry-search-model"),
      require("./morphology-model"),
    );
    return;
  }
  root.ConlexiconDictionaryData = factory(
    root.ConlexiconTags,
    root.ConlexiconIpa,
    root.ConlexiconEntrySearch,
    root.ConlexiconMorphology,
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function createDictionaryDataModel(
  tagModel,
  ipaModel,
  entrySearchModel,
  morphologyModel,
) {
  // Pure data rules shared by the server and the browser. Server-only concerns
  // (API errors, strict source validation, entity ID uniqueness, import) stay in
  // dictionary-model.js; localized defaults and display views stay in app.js.
  const GLOSS_STYLE_KEYS = Object.freeze(["gla", "glb", "glc", "ft"]);
  const DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN = "(\\gla)\n(\\glb)\n(\\glc)\n(\\ft)";
  const DEFAULT_TOOL_NAV_ORDER = Object.freeze([
    "editor",
    "docs",
    "corpus",
    "analysis",
    "quality",
    "ipa",
    "morphology-functions",
    "morphology-tables",
    "settings",
    "manager",
  ]);
  const DEFAULT_ENTRY_SECTION_ORDER = Object.freeze(["definitions", "etymology", "derived", "morphology", "notes"]);
  const ENTRY_LIST_PART_DISPLAY_OPTIONS = Object.freeze(["subtitle", "chips", "both"]);
  const UI_SKIN_IDS = Object.freeze(["classic", "layered-glass", "liquid-glass"]);
  const GLOSS_FONT_FAMILIES = ["serif", "sans", "mono"];
  const GLOSS_FONT_SIZES = ["small", "medium", "large"];
  const EDIT_PAGE_SWITCH_ACTIONS = ["save", "discard", "prompt"];

  function uid(prefix) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  function reserveEntityId(value, prefix, usedIds) {
    const existing = String(value || "").trim();
    const id = existing || uid(prefix);
    usedIds.add(id);
    return id;
  }

  // Callers resolve sources first: the server validates them strictly, the
  // browser reads previously stored duplicates leniently.
  function normalizeEntryFields(entry, sources, usedIds = new Set()) {
    const definitions = Array.isArray(entry.definitions)
      ? entry.definitions.map((definition) => normalizeDefinition(definition, usedIds))
      : [];
    const morphologyState = morphologyModel.normalizeEntryMorphologyState(entry);
    return {
      id: entry.id || uid("entry"),
      lemma: entry.lemma || "",
      pronunciation: entry.pronunciation || "",
      tags: tagModel.normalizeTagList(entry.tags),
      definitions,
      etymology: {
        sources,
        description: entry.etymology?.description || "",
      },
      notes: entry.notes || "",
      morphologyMode: morphologyState.morphologyMode,
      morphologyGroups: morphologyState.morphologyGroups,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeDefinition(definition = {}, usedIds = new Set()) {
    return {
      id: reserveEntityId(definition.id, "def", usedIds),
      meaning: definition.meaning || "",
      example: definition.example || "",
      note: definition.note || "",
    };
  }

  function normalizeDictionarySettings(settings = {}) {
    return {
      ...settings,
      glossStyles: normalizeGlossStyles(settings.glossStyles),
      corpusUnitCardRenderPattern: String(settings.corpusUnitCardRenderPattern ?? settings.corpusUnitRenderPattern ?? ""),
      corpusUnitCardGlossAlign: Boolean(settings.corpusUnitCardGlossAlign ?? true),
      corpusUnitRenderPattern: String(settings.corpusUnitRenderPattern || ""),
      corpusUnitGlossAlign: Boolean(settings.corpusUnitGlossAlign ?? true),
      entryExampleRenderPattern: String(settings.entryExampleRenderPattern ?? DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN),
      entryExampleGlossAlign: Boolean(settings.entryExampleGlossAlign ?? true),
      corpusAutoSave: Boolean(settings.corpusAutoSave ?? true),
      docsAutoSave: Boolean(settings.docsAutoSave ?? true),
      tagDisplayMap: tagModel.normalizeTagDisplayMap(settings.tagDisplayMap),
      entryListRawTagDisplay: Boolean(settings.entryListRawTagDisplay),
      filterMenuRawTagDisplay: Boolean(settings.filterMenuRawTagDisplay),
      entryListTagDisplayLimit: tagModel.normalizeEntryListTagDisplayLimit(settings.entryListTagDisplayLimit),
      entryListPartDisplay: normalizeEntryListPartDisplay(settings.entryListPartDisplay),
      partOfSpeechTags: tagModel.normalizeTagList(settings.partOfSpeechTags),
      tagSortOrder: tagModel.normalizeTagList(settings.tagSortOrder),
      redHighlightTags: tagModel.normalizeTagList(settings.redHighlightTags),
      tagListSeparatorStyle: tagModel.normalizeTagListSeparatorStyle(settings.tagListSeparatorStyle),
      entryListTagFiltering: Boolean(settings.entryListTagFiltering ?? true),
      entryListPolysemyDisplay: Boolean(settings.entryListPolysemyDisplay),
      networkPolysemyDisplay: Boolean(settings.networkPolysemyDisplay),
      showEmptyEntrySections: Boolean(settings.showEmptyEntrySections),
      entrySectionOrder: normalizeEntrySectionOrder(settings.entrySectionOrder),
      search: entrySearchModel.normalizeEntrySearchSettings(settings.search),
      searchHighlight: Boolean(settings.searchHighlight ?? true),
      partialEditPageSwitchAction: normalizeEditPageSwitchAction(settings.partialEditPageSwitchAction),
      fullEditPageSwitchAction: normalizeEditPageSwitchAction(settings.fullEditPageSwitchAction),
      allowEmptyPronunciation: Boolean(settings.allowEmptyPronunciation ?? true),
      allowEmptyTags: Boolean(settings.allowEmptyTags ?? true),
      allowEmptyDefinitions: Boolean(settings.allowEmptyDefinitions ?? true),
      ipaKeyboard: ipaModel.normalizeIpaKeyboard(settings.ipaKeyboard),
      ipa: ipaModel.normalizeIpaSettings(settings.ipa),
      toolNavOrder: normalizeToolNavOrder(settings.toolNavOrder),
    };
  }

  function normalizeEditPageSwitchAction(value) {
    return EDIT_PAGE_SWITCH_ACTIONS.includes(value) ? value : "discard";
  }

  function normalizeGlossFontFamily(value) {
    return GLOSS_FONT_FAMILIES.includes(value) ? value : "serif";
  }

  function normalizeGlossFontSize(value) {
    return GLOSS_FONT_SIZES.includes(value) ? value : "medium";
  }

  function normalizeGlossStyles(styles = {}) {
    return Object.fromEntries(GLOSS_STYLE_KEYS.map((key) => {
      const style = styles?.[key] && typeof styles[key] === "object" ? styles[key] : {};
      return [key, {
        fontFamily: normalizeGlossFontFamily(style.fontFamily || "serif"),
        fontSize: normalizeGlossFontSize(style.fontSize),
        bold: Boolean(style.bold),
        italic: Boolean(style.italic ?? (key === "ft")),
        ...(key === "glb" ? { smallCaps: Boolean(style.smallCaps) } : {}),
      }];
    }));
  }

  // Keeps valid items in their saved order, drops unknown and repeated ones,
  // and appends any missing defaults.
  function normalizeOrderedSubset(value, defaults) {
    const source = Array.isArray(value) ? value : [];
    const result = [];
    source.forEach((item) => {
      const key = String(item || "").trim();
      if (defaults.includes(key) && !result.includes(key)) {
        result.push(key);
      }
    });
    defaults.forEach((key) => {
      if (!result.includes(key)) {
        result.push(key);
      }
    });
    return result;
  }

  function normalizeToolNavOrder(value) {
    return normalizeOrderedSubset(value, DEFAULT_TOOL_NAV_ORDER);
  }

  function normalizeEntrySectionOrder(value) {
    return normalizeOrderedSubset(value, DEFAULT_ENTRY_SECTION_ORDER);
  }

  function normalizeEntryListPartDisplay(value) {
    return ENTRY_LIST_PART_DISPLAY_OPTIONS.includes(value) ? value : "subtitle";
  }

  function normalizeDocs(docs = {}) {
    return {
      markdown: String(docs.markdown || ""),
    };
  }

  function normalizeCorpus(corpus = {}, usedIds = new Set()) {
    return {
      ...corpus,
      blocks: Array.isArray(corpus.blocks) ? corpus.blocks.map((block) => normalizeCorpusBlock(block, usedIds)) : [],
      units: Array.isArray(corpus.units) ? corpus.units.map((unit) => normalizeCorpusUnit(unit, usedIds)) : [],
    };
  }

  function normalizeCorpusBlock(block = {}, usedIds = new Set()) {
    const now = new Date().toISOString();
    return {
      ...block,
      id: reserveEntityId(block.id, "corpus-block", usedIds),
      title: String(block.title || ""),
      attributes: normalizeCorpusAttributes(block.attributes),
      tags: tagModel.normalizeTagList(block.tags),
      notes: String(block.notes || ""),
      unitIds: normalizeCorpusUnitIds(block.unitIds),
      layers: Array.isArray(block.layers) ? block.layers.map((layer) => normalizeCorpusLayer(layer, usedIds)) : [],
      createdAt: block.createdAt || now,
      updatedAt: block.updatedAt || now,
    };
  }

  function normalizeCorpusLayer(layer = {}, usedIds = new Set()) {
    return {
      ...layer,
      id: reserveEntityId(layer.id, "corpus-layer", usedIds),
      name: String(layer.name || ""),
      speaker: String(layer.speaker || ""),
      modality: String(layer.modality || ""),
      attributes: normalizeCorpusAttributes(layer.attributes),
      tags: tagModel.normalizeTagList(layer.tags),
      notes: String(layer.notes || ""),
      unitIds: normalizeCorpusUnitIds(layer.unitIds),
    };
  }

  function normalizeCorpusUnit(unit = {}, usedIds = new Set()) {
    const now = new Date().toISOString();
    return {
      ...unit,
      id: reserveEntityId(unit.id, "corpus-unit", usedIds),
      content: String(unit.content || ""),
      attributes: normalizeCorpusAttributes(unit.attributes),
      tags: tagModel.normalizeTagList(unit.tags),
      notes: String(unit.notes || ""),
      createdAt: unit.createdAt || now,
      updatedAt: unit.updatedAt || now,
    };
  }

  function normalizeCorpusAttributes(attributes = {}) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(attributes)
        .map(([key, value]) => [String(key).trim(), String(value ?? "")])
        .filter(([key]) => key),
    );
  }

  function normalizeCorpusUnitIds(unitIds = []) {
    return Array.isArray(unitIds)
      ? unitIds.map((unitId) => String(unitId || "").trim()).filter(Boolean)
      : [];
  }

  function normalizeUiLanguage(value) {
    return value === "en" ? "en" : "zh";
  }

  function normalizeUiTheme(value) {
    return value === "dark" ? "dark" : "light";
  }

  function normalizeUiSkin(value) {
    return UI_SKIN_IDS.includes(value) ? value : "classic";
  }

  return {
    DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN,
    DEFAULT_ENTRY_SECTION_ORDER,
    DEFAULT_TOOL_NAV_ORDER,
    ENTRY_LIST_PART_DISPLAY_OPTIONS,
    GLOSS_STYLE_KEYS,
    UI_SKIN_IDS,
    normalizeCorpus,
    normalizeCorpusAttributes,
    normalizeCorpusBlock,
    normalizeCorpusLayer,
    normalizeCorpusUnit,
    normalizeCorpusUnitIds,
    normalizeDefinition,
    normalizeDictionarySettings,
    normalizeDocs,
    normalizeEditPageSwitchAction,
    normalizeEntryFields,
    normalizeEntryListPartDisplay,
    normalizeEntrySectionOrder,
    normalizeGlossFontFamily,
    normalizeGlossFontSize,
    normalizeGlossStyles,
    normalizeToolNavOrder,
    normalizeUiLanguage,
    normalizeUiSkin,
    normalizeUiTheme,
    reserveEntityId,
    uid,
  };
});
