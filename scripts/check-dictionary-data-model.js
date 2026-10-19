const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const dataModel = require("../lib/dictionary-data-model");
const { normalizeDictionary } = require("../lib/dictionary-model");

const {
  DEFAULT_TOOL_NAV_ORDER,
  normalizeDictionarySettings,
  normalizeToolNavOrder,
} = dataModel;

function checkToolNavOrder() {
  const custom = ["manager", "editor", "docs"];
  const normalized = normalizeToolNavOrder(custom);
  assert.deepEqual(normalized.slice(0, 3), custom, "valid items keep their saved order");
  assert.deepEqual([...normalized].sort(), [...DEFAULT_TOOL_NAV_ORDER].sort(), "missing views are appended");

  assert.deepEqual(
    normalizeToolNavOrder(["docs", "unknown", " docs ", "", null, "editor"]).slice(0, 2),
    ["docs", "editor"],
    "repeated, blank and unknown items are dropped",
  );
  assert.deepEqual(normalizeToolNavOrder("editor"), [...DEFAULT_TOOL_NAV_ORDER], "a non-array falls back to the default order");

  // The server used to pass toolNavOrder through untouched.
  const dictionary = normalizeDictionary({ settings: { toolNavOrder: ["quality", "quality", "bogus"] } });
  assert.equal(dictionary.settings.toolNavOrder[0], "quality");
  assert.equal(dictionary.settings.toolNavOrder.length, DEFAULT_TOOL_NAV_ORDER.length);
}

function checkSettingsPreservation() {
  const settings = normalizeDictionarySettings({
    futureOption: { nested: true },
    corpusAutoSave: false,
    docsAutoSave: false,
    entryListTagFiltering: false,
    allowEmptyTags: false,
    entryExampleRenderPattern: "",
    corpusUnitCardRenderPattern: "",
    partOfSpeechTags: [],
    tagDisplayMap: {},
  });
  assert.deepEqual(settings.futureOption, { nested: true }, "unknown settings fields pass through");
  assert.equal(settings.corpusAutoSave, false);
  assert.equal(settings.docsAutoSave, false);
  assert.equal(settings.entryListTagFiltering, false);
  assert.equal(settings.allowEmptyTags, false);
  assert.equal(settings.entryExampleRenderPattern, "", "an explicit empty pattern is not replaced by the default");
  assert.equal(settings.corpusUnitCardRenderPattern, "");
  assert.deepEqual(settings.partOfSpeechTags, []);
  assert.deepEqual(settings.tagDisplayMap, {});

  const defaults = normalizeDictionarySettings();
  assert.equal(defaults.corpusAutoSave, true);
  assert.equal(defaults.entryExampleRenderPattern, "(\\gla)\n(\\glb)\n(\\glc)\n(\\ft)");
  assert.equal(defaults.glossStyles.ft.italic, true);
  assert.equal(defaults.glossStyles.glb.smallCaps, false);
}

function checkStability() {
  const raw = {
    toolNavOrder: ["ipa", "ipa", "x"],
    entrySectionOrder: ["notes"],
    glossStyles: { gla: { fontFamily: "mono", fontSize: "huge" } },
    partOfSpeechTags: [" n ", "n"],
    search: { fields: { lemma: { enabled: true, fuzzy: true } } },
  };
  const once = normalizeDictionarySettings(raw);
  assert.deepEqual(normalizeDictionarySettings(once), once, "normalizing twice changes nothing");

  // Results must be fresh objects; callers may sort or edit them.
  once.toolNavOrder.reverse();
  once.entrySectionOrder.reverse();
  assert.deepEqual(normalizeDictionarySettings().toolNavOrder, [...DEFAULT_TOOL_NAV_ORDER]);
  assert.equal(normalizeDictionarySettings().entrySectionOrder[0], "definitions");
  assert.ok(Object.isFrozen(DEFAULT_TOOL_NAV_ORDER), "shared defaults cannot be edited in place");
}

function checkIdGeneration() {
  const usedIds = new Set();
  assert.equal(dataModel.reserveEntityId(" kept ", "def", usedIds), "kept");
  const generated = dataModel.reserveEntityId("", "def", usedIds);
  assert.match(generated, /^def-[0-9a-f-]{36}$/);
  assert.ok(usedIds.has("kept") && usedIds.has(generated));
}

// Loads every script index.html includes before app.js, in page order, so a
// wrong order or a missing browser global fails here instead of at startup.
function checkBrowserLoadOrder() {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  const appIndex = scripts.indexOf("app.js");
  assert.ok(appIndex > 0, "index.html loads app.js");
  assert.ok(scripts.indexOf("lib/dictionary-data-model.js") >= 0 && scripts.indexOf("lib/dictionary-data-model.js") < appIndex);

  const context = vm.createContext({ crypto: globalThis.crypto });
  context.window = context;
  scripts.slice(0, appIndex).forEach((script) => {
    vm.runInContext(fs.readFileSync(path.join(root, script), "utf8"), context, { filename: script });
  });
  const browserModel = context.ConlexiconDictionaryData;
  assert.ok(browserModel, "the shared model registers its browser global");
  const settings = browserModel.normalizeDictionarySettings({ toolNavOrder: ["docs"], search: {} });
  assert.equal(settings.toolNavOrder[0], "docs");
  assert.ok(settings.search.fields.lemma, "dependencies resolve in the browser load order");
  assert.match(browserModel.uid("entry"), /^entry-[0-9a-f-]{36}$/);
}

checkToolNavOrder();
checkSettingsPreservation();
checkStability();
checkIdGeneration();
checkBrowserLoadOrder();
console.log("Dictionary data model checks passed.");
