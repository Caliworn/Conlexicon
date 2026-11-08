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
    "tags",
    "morphology-functions",
    "morphology-tables",
    "settings",
    "manager",
  ]);
  const DEFAULT_ENTRY_SECTION_ORDER = Object.freeze(["definitions", "etymology", "derived", "morphology", "notes"]);
  const UI_SKIN_IDS = Object.freeze(["classic", "layered-glass", "liquid-glass"]);
  const GLOSS_FONT_FAMILIES = ["serif", "sans", "mono"];
  const GLOSS_FONT_SIZES = ["small", "medium", "large"];
  const EDIT_PAGE_SWITCH_ACTIONS = ["save", "discard", "prompt"];
  const NEW_ENTRY_BUTTON_ACTIONS = ["quick", "full"];

  function uid(prefix) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  // IDs are random UUIDs; global uniqueness is checked at import and by
  // database keys, never by scanning existing IDs here.
  function ensureEntityId(value, prefix) {
    return String(value || "").trim() || uid(prefix);
  }

  // Callers resolve sources first: the server validates them strictly, the
  // browser reads previously stored duplicates leniently.
  function normalizeEntryFields(entry, sources) {
    const definitions = Array.isArray(entry.definitions)
      ? entry.definitions.map(normalizeDefinition)
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

  function normalizeDefinition(definition = {}) {
    return {
      id: ensureEntityId(definition.id, "def"),
      meaning: definition.meaning || "",
      note: definition.note || "",
      tags: tagModel.normalizeTagList(definition.tags),
      examples: normalizeDefinitionExamples(definition.examples),
    };
  }

  // A saved example points at a corpus item; the entry DTO adds the item text
  // for display. A new example written in the entry editor has text but no
  // item yet, and the server creates the item when the entry is saved.
  function normalizeDefinitionExamples(examples) {
    const itemIds = new Set();
    return (Array.isArray(examples) ? examples : []).flatMap((example) => {
      const itemId = String(example?.itemId || "").trim();
      const content = String(example?.content || "");
      if (itemId) {
        if (itemIds.has(itemId)) {
          return [];
        }
        itemIds.add(itemId);
        return [{ itemId, content }];
      }
      return content.trim() ? [{ content: content.trim() }] : [];
    });
  }

  function normalizeDictionarySettings(settings = {}) {
    return {
      ...settings,
      glossStyles: normalizeGlossStyles(settings.glossStyles),
      corpusRenderPattern: String(settings.corpusRenderPattern ?? DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN),
      corpusGlossAlign: Boolean(settings.corpusGlossAlign ?? true),
      entryExampleRenderPattern: String(settings.entryExampleRenderPattern ?? DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN),
      entryExampleGlossAlign: Boolean(settings.entryExampleGlossAlign ?? true),
      corpusAutoSave: Boolean(settings.corpusAutoSave ?? true),
      docsAutoSave: Boolean(settings.docsAutoSave ?? true),
      entryListRawTagDisplay: Boolean(settings.entryListRawTagDisplay),
      entryListRawPartDisplay: Boolean(settings.entryListRawPartDisplay),
      filterMenuRawTagDisplay: Boolean(settings.filterMenuRawTagDisplay),
      entryHoverCardRawTagDisplay: Boolean(settings.entryHoverCardRawTagDisplay),
      entryListTagDisplayLimit: tagModel.normalizeEntryListTagDisplayLimit(settings.entryListTagDisplayLimit),
      entryListTagsIncludeParts: Boolean(settings.entryListTagsIncludeParts ?? true),
      tagListSeparatorStyle: tagModel.normalizeTagListSeparatorStyle(settings.tagListSeparatorStyle),
      entryListTagFiltering: Boolean(settings.entryListTagFiltering ?? true),
      showEmptyEntrySections: Boolean(settings.showEmptyEntrySections),
      entrySectionOrder: normalizeEntrySectionOrder(settings.entrySectionOrder),
      search: entrySearchModel.normalizeEntrySearchSettings(settings.search),
      searchHighlight: Boolean(settings.searchHighlight ?? true),
      partialEditPageSwitchAction: normalizeEditPageSwitchAction(settings.partialEditPageSwitchAction),
      fullEditPageSwitchAction: normalizeEditPageSwitchAction(settings.fullEditPageSwitchAction),
      newEntryButtonAction: normalizeNewEntryButtonAction(settings.newEntryButtonAction),
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

  function normalizeNewEntryButtonAction(value) {
    return NEW_ENTRY_BUTTON_ACTIONS.includes(value) ? value : "quick";
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

  function normalizeDocs(docs = {}) {
    return {
      markdown: String(docs.markdown || ""),
    };
  }

  function normalizeCorpus(corpus = {}) {
    return {
      items: Array.isArray(corpus.items) ? corpus.items.map(normalizeCorpusItem) : [],
    };
  }

  function normalizeCorpusItem(item = {}) {
    const now = new Date().toISOString();
    return {
      id: ensureEntityId(item.id, "corpus-item"),
      name: String(item.name || "").trim(),
      group: String(item.group || "").trim(),
      content: String(item.content || ""),
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
    };
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
    GLOSS_STYLE_KEYS,
    UI_SKIN_IDS,
    ensureEntityId,
    normalizeCorpus,
    normalizeCorpusItem,
    normalizeDefinition,
    normalizeDictionarySettings,
    normalizeDocs,
    normalizeEditPageSwitchAction,
    normalizeEntryFields,
    normalizeEntrySectionOrder,
    normalizeGlossFontFamily,
    normalizeGlossFontSize,
    normalizeGlossStyles,
    normalizeNewEntryButtonAction,
    normalizeToolNavOrder,
    normalizeUiLanguage,
    normalizeUiSkin,
    normalizeUiTheme,
    uid,
  };
});
