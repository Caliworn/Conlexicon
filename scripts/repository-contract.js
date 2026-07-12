const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  importDictionaryFromPayload,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const { createApiRouter } = require("../lib/api-routes");
const { createDictionaryConversionService } = require("../lib/dictionary-conversion-service");
const { migrateLegacyDictionary } = require("../lib/legacy-dictionary-migration");
const morphologyModel = require("../lib/morphology-model");
const ipaModel = require("../lib/ipa-model");
const tagModel = require("../lib/tag-model");
const entrySearchModel = require("../lib/entry-search-model");
const entryRelationsModel = require("../lib/entry-relations-model");
const qualityModel = require("../lib/quality-model");

const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";
const CONTRACT_STAGES = {
  lifecycle: 1,
  entryCrud: 2,
  readApi: 3,
  modules: 4,
  all: 99,
};

async function assertRejectStatus(promise, status, label) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.status, status, label);
    return;
  }
  assert.fail(`${label}: expected rejection with status ${status}`);
}

function withPatchedRandomUUID(values, callback) {
  const originalRandomUUID = crypto.randomUUID;
  const queue = [...values];
  crypto.randomUUID = () => {
    if (!queue.length) {
      throw new Error("randomUUID test queue exhausted");
    }
    return queue.shift();
  };
  const restore = () => {
    crypto.randomUUID = originalRandomUUID;
  };
  try {
    const result = callback();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

async function callApi(repository, method, urlPath, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(chunks);
  request.method = method;
  let statusCode = 0;
  let payload = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      payload = value || "";
    },
  };
  const handled = await createApiRouter({ repository })(
    request,
    response,
    new URL(urlPath, "http://localhost"),
  );
  return {
    handled,
    statusCode,
    body: payload ? JSON.parse(payload) : null,
  };
}

async function checkCorpusIdCollisionInvariants(repository) {
  const dictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-corpus-id-collision-contract",
    name: "Corpus ID Collision Contract",
    entries: [
      {
        id: "entry-corpus-contract",
        lemma: "corpus contract",
        definitions: [{ id: "def-corpus-contract", meaning: "contract" }],
      },
    ],
    corpus: {
      units: [{ id: "corpus-unit-contract", content: "corpus unit" }],
    },
  }));

  try {
    await assertRejectStatus(
      repository.saveEntry(dictionary.id, {
        id: "corpus-unit-contract",
        lemma: "entry collides with corpus",
        definitions: [{ meaning: "collision" }],
      }),
      409,
      "entry save rejects entry id colliding with corpus blob id",
    );
    await assertRejectStatus(
      repository.saveEntry(dictionary.id, {
        lemma: "definition collides with corpus",
        definitions: [{ id: "corpus-unit-contract", meaning: "collision" }],
      }),
      409,
      "entry save rejects definition id colliding with corpus blob id",
    );
    await assertRejectStatus(
      repository.saveCorpusChanges(dictionary.id, {
        units: [{ id: "entry-corpus-contract", content: "corpus collides with entry" }],
      }),
      409,
      "corpus save rejects corpus id colliding with existing entry id",
    );
    await assertRejectStatus(
      repository.saveCorpusChanges(dictionary.id, {
        units: [{ id: "def-corpus-contract", content: "corpus collides with definition" }],
      }),
      409,
      "corpus save rejects corpus id colliding with existing definition id",
    );
    await assertRejectStatus(
      repository.saveCorpusChanges(dictionary.id, {
        units: [
          { id: "corpus-duplicate-contract", content: "one" },
          { id: "corpus-duplicate-contract", content: "two" },
        ],
      }),
      409,
      "corpus save rejects duplicate ids inside corpus blob",
    );
  } finally {
    try {
      await repository.deleteDictionary(dictionary.id);
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }
}

function testNormalize(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function testDisplayTag(tag, dictionary = {}) {
  const value = String(tag || "");
  return dictionary.settings?.tagDisplayMap?.[value] || value;
}

function testEntryParts(entry = {}, dictionary = {}) {
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  if (!tags.length) {
    return [];
  }
  const settings = dictionary.settings || {};
  if (!settings.manualPartOfSpeechTags) {
    return tags[0] ? [tags[0]] : [];
  }
  const configuredParts = new Set((settings.partOfSpeechTags || []).map(testNormalize));
  if (!configuredParts.size) {
    return [];
  }
  return tags.filter((tag) => configuredParts.has(testNormalize(tag)));
}

function testEntryMatches(entry, dictionary, query = {}) {
  const parts = testEntryParts(entry, dictionary);
  const matchesPart = !query.part
    || (query.part === NO_PART_FILTER_VALUE
      ? !parts.length
      : parts.includes(query.part));
  if (!matchesPart) {
    return false;
  }
  const normalizedQuery = testNormalize(query.q);
  if (!normalizedQuery) {
    return testEntryMatchesDerivedFrom(entry, dictionary, query);
  }
  return entrySearchModel.entryMatchesSearchText(entry, dictionary, normalizedQuery, {
    fields: entrySearchModel.normalizeSearchFields(query.fields || query.searchFields),
    fuzzyFields: entrySearchModel.normalizeFuzzyFields(query.fuzzyFields),
    normalizeText: testNormalize,
  }) && testEntryMatchesDerivedFrom(entry, dictionary, query);
}

function testEntryMatchesDerivedFrom(entry, dictionary, query = {}) {
  const sourceName = testNormalize(query.derivedFrom);
  if (!sourceName) {
    return true;
  }
  const index = entryRelationsModel.buildEntryRelationIndex(dictionary, { normalizeText: testNormalize });
  const target = entryRelationsModel.resolveSourceEntry(sourceName, dictionary, { normalizeText: testNormalize, index });
  const derivedEntries = target
    ? entryRelationsModel.findDerivedEntries(target, dictionary, { normalizeText: testNormalize, index })
    : index.derivedBySourceKey.get(sourceName) || [];
  return derivedEntries.some((candidate) => candidate.id === entry.id);
}

function testCompareEntries(sort = "lemmaAsc") {
  return (a, b) => {
    const lemmaCompare = String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
    const dateCompare = (left, right) => {
      const diff = new Date(left || 0).getTime() - new Date(right || 0).getTime();
      return diff || lemmaCompare;
    };
    if (sort === "lemmaDesc") {
      return -lemmaCompare;
    }
    if (sort === "updatedAsc") {
      return dateCompare(a.updatedAt, b.updatedAt);
    }
    if (sort === "updatedDesc") {
      return -dateCompare(a.updatedAt, b.updatedAt);
    }
    if (sort === "createdAsc") {
      return dateCompare(a.createdAt, b.createdAt);
    }
    if (sort === "createdDesc") {
      return -dateCompare(a.createdAt, b.createdAt);
    }
    return lemmaCompare;
  };
}

function expectedEntryIds(dictionary, query = {}) {
  return [...(dictionary.entries || [])]
    .filter((entry) => testEntryMatches(entry, dictionary, query))
    .sort(testCompareEntries(query.sort || "lemmaAsc"))
    .map((entry) => entry.id);
}

function expectedParts(dictionary) {
  return [...new Set((dictionary.entries || []).flatMap((entry) => testEntryParts(entry, dictionary)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

async function apiEntryIds(repository, dictionaryId, params = {}) {
  const qs = queryString({ ...params, limit: 100, include: "summary" });
  const apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries?${qs}`);
  assert.equal(apiResult.statusCode, 200);
  assert.equal(apiResult.body.pageInfo.hasMore, false);
  return apiResult.body.items.map((entry) => entry.id);
}

async function assertEntryQueryConsistency(repository, dictionary, params = {}) {
  assert.deepEqual(
    await apiEntryIds(repository, dictionary.id, params),
    expectedEntryIds(dictionary, params),
    `entry query consistency: ${JSON.stringify(params)}`,
  );
}

function expectedRootGroupSnapshot(dictionary, query = {}) {
  return entryRelationsModel.rootModeGroups(dictionary, {
    query: testNormalize(query.q || query.query),
    normalizeText: testNormalize,
    compareEntries: testCompareEntries(query.sort || "lemmaAsc"),
    matchesEntry: (entry) => entrySearchModel.entryMatchesSearchText(entry, dictionary, query.q || query.query || "", {
      fields: entrySearchModel.normalizeSearchFields(query.fields || query.searchFields),
      fuzzyFields: entrySearchModel.normalizeFuzzyFields(query.fuzzyFields),
      normalizeText: testNormalize,
    }),
  }).map((group) => ({
    rootId: group.root.id,
    derivedIds: group.derived.map((entry) => entry.id),
    matchedDerivedIds: group.matchedDerived.map((entry) => entry.id),
    rootMatches: Boolean(group.rootMatches),
  }));
}

async function assertRootGroupQueryConsistency(repository, dictionary, params = {}) {
  const qs = queryString({ ...params, limit: 100, include: "summary" });
  const apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups?${qs}`);
  assert.equal(apiResult.statusCode, 200);
  assert.equal(apiResult.body.pageInfo.hasMore, false);
  assert.deepEqual(
    apiResult.body.items.map((group) => ({
      rootId: group.root.id,
      derivedIds: group.derivedEntries.map((entry) => entry.id),
      matchedDerivedIds: group.matchedDerivedIds,
      rootMatches: Boolean(group.rootMatches),
    })),
    expectedRootGroupSnapshot(dictionary, params),
    `root group query consistency: ${JSON.stringify(params)}`,
  );
}

function checkModelNormalization() {
  assert.deepEqual(tagModel.normalizeTagList("n，v,n\nadj"), ["n", "v", "adj"]);
  assert.deepEqual(tagModel.normalizeRedHighlightTags("rare, archaic rare"), ["rare", "archaic"]);
  assert.equal(tagModel.normalizeEntryListTagDisplayLimit(99), 10);
  assert.deepEqual(
    tagModel.entryParts(
      { tags: ["topic", "n", "v"] },
      { manualPartOfSpeechTags: true, partOfSpeechTags: ["n", "v"] },
    ),
    ["n", "v"],
  );
  assert.deepEqual(tagModel.entryParts({ tags: ["topic", "n"] }, { manualPartOfSpeechTags: false }), ["topic"]);
  assert.equal(tagModel.displayTag("n", { tagDisplayMap: { n: "noun" } }), "noun");
  assert.deepEqual([...entrySearchModel.normalizeSearchFields("lemma,unknown,tags")], ["lemma", "tags"]);
  assert.deepEqual([...entrySearchModel.normalizeFuzzyFields("")], []);
  assert.deepEqual([...entrySearchModel.normalizeFuzzyFields("definitions,tags,unknown")], ["definitions", "tags"]);
  assert.deepEqual(entrySearchModel.normalizeEntrySearchSettings({
    fields: { lemma: { enabled: false, fuzzy: false } },
    etymologyAutocomplete: { fuzzy: false },
  }), {
    fields: {
      lemma: { enabled: false, fuzzy: false },
      pronunciation: { enabled: true, fuzzy: true },
      tags: { enabled: true, fuzzy: true },
      definitions: { enabled: true, fuzzy: true },
      examples: { enabled: true, fuzzy: true },
      notes: { enabled: true, fuzzy: true },
      etymology: { enabled: true, fuzzy: true },
      morphology: { enabled: true, fuzzy: true },
    },
    etymologyAutocomplete: { fuzzy: false },
  });
  assert.equal(entrySearchModel.searchSettingsHaveEnabledField({
    fields: Object.fromEntries(entrySearchModel.ENTRY_SEARCH_FIELD_KEYS.map((field) => [field, { enabled: false }])),
  }), false);
  const configuredSearchOptions = entrySearchModel.searchSettingsQueryOptions({
    fields: {
      lemma: { enabled: true, fuzzy: false },
      definitions: { enabled: true, fuzzy: true },
      morphology: { enabled: false, fuzzy: true },
    },
  });
  assert.deepEqual([...configuredSearchOptions.fields], [
    "lemma",
    "pronunciation",
    "tags",
    "definitions",
    "examples",
    "notes",
    "etymology",
  ]);
  assert.deepEqual([...configuredSearchOptions.fuzzyFields], [
    "pronunciation",
    "tags",
    "definitions",
    "examples",
    "notes",
    "etymology",
  ]);
  assert.equal(entrySearchModel.textMatches("mirror meaning", "mrmeaning", { fuzzy: true }), true);
  assert.equal(entrySearchModel.textMatches("mirror meaning", "mrmeaning", { fuzzy: false }), false);
  assert.equal(entrySearchModel.fieldFuzzyEnabled("tags", { fuzzyFields: "tags" }), true);
  assert.equal(entrySearchModel.fieldFuzzyEnabled("tags", { fuzzyFields: "definitions" }), false);
  const relationDictionary = {
    entries: [
      { id: "entry-root", lemma: "root" },
      { id: "entry-derived-lemma", lemma: "derived lemma", etymology: { sources: ["root", "root"] } },
      { id: "entry-derived-id", lemma: "derived id", etymology: { sources: ["entry-root"] } },
    ],
  };
  const relationIndex = entryRelationsModel.buildEntryRelationIndex(relationDictionary, { normalizeText: testNormalize });
  assert.equal(relationIndex.derivedBySourceKey.get("root").length, 1);
  assert.deepEqual(
    entryRelationsModel.findDerivedEntries(relationDictionary.entries[0], relationDictionary, { index: relationIndex }).map((entry) => entry.id),
    ["entry-derived-id", "entry-derived-lemma"],
  );
  assert.deepEqual(
    entrySearchModel.entrySearchFieldValues(
      { lemma: "acar", pronunciation: "/a/", tags: ["n"], definitions: [{ meaning: "root", example: "example", note: "note" }] },
      { settings: { tagDisplayMap: { n: "noun" } } },
      { fields: "tags,definitions" },
    ),
    {
      lemma: [],
      pronunciation: [],
      tags: ["n", "noun", "n", "noun"],
      definitions: ["root"],
      examples: [],
      notes: [],
      etymology: [],
      morphology: [],
    },
  );
  assert.equal(
    entrySearchModel.entryMatchesSearchText(
      { lemma: "acar", definitions: [{ meaning: "root" }] },
      {},
      "root",
      { fields: "definitions" },
    ),
    true,
  );
  assert.equal(
    entrySearchModel.entryMatchesSearchText(
      { lemma: "acar", tags: ["n"], definitions: [{ meaning: "mirror meaning" }] },
      { settings: { tagDisplayMap: { n: "Noun Display" } } },
      "mrmeaning",
      { fuzzyFields: "definitions" },
    ),
    true,
  );
  assert.equal(
    entrySearchModel.entryMatchesSearchText(
      { lemma: "acar", tags: ["n"], definitions: [{ meaning: "mirror meaning" }] },
      { settings: { tagDisplayMap: { n: "Noun Display" } } },
      "nd",
      { fuzzyFields: "definitions" },
    ),
    false,
  );
  assert.deepEqual(qualityModel.parseGloss("\\gla a b\n\\glb A B\n\\ft test"), {
    gla: ["a", "b"],
    glb: ["A", "B"],
    glc: [],
    ft: "test",
  });
  const qualityReport = qualityModel.buildQualityReport({
    entries: [
      {
        id: "entry-quality-a",
        lemma: "same",
        pronunciation: "/ˈaˈb/",
        tags: ["proper noun", "tag-with-a-very-very-long-name"],
        definitions: [{ meaning: "a", example: "\\gla a b\n\\glb A\n\\ft test" }],
        etymology: { sources: ["missing-root"] },
      },
      {
        id: "entry-quality-b",
        lemma: "same",
        pronunciation: "",
        tags: ["proper-noun"],
        definitions: [],
      },
    ],
  }, { text: (_zh, en) => en, normalizeText: testNormalize });
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Duplicate lemma" && issue.entryId === "entry-quality-a"), true);
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Multiple primary stresses"), true);
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Gloss alignment mismatch"), true);
  assert.equal(qualityReport.issues.some((issue) => issue.title === "Near-duplicate tags"), true);
  assert.equal(qualityReport.networkIssues.some((issue) => issue.title === "Unresolved source"), true);
  assert.equal(ipaModel.normalizeIpaSettings({ mappings: [{ from: "a", to: "ˈa" }] }).mappings[0].to, "ˈa");
  assert.deepEqual(ipaModel.normalizeClusterList("t͡ʃ, t, t͡ʃ"), ["t͡ʃ", "t"]);
  assert.equal(
    ipaModel.generateIpaFromLemma("ata", {
      mappings: [
        { from: "a", to: "a" },
        { from: "t", to: "t" },
      ],
      syllable: { vowels: "a", separator: ".", onsetClusters: "t" },
      defaultStress: -2,
      unstressMonosyllables: true,
    }),
    "/ˈa.ta/",
  );
  assert.equal(
    ipaModel.generateIpaFromLemma("a", {
      mappings: [{ from: "a", to: "a" }],
      syllable: { vowels: "a", separator: "." },
      defaultStress: -1,
      unstressMonosyllables: true,
    }),
    "/a/",
  );
  assert.deepEqual(
    ipaModel.tokenizePhonemeUnits("t͡ʃa", ["t͡ʃ"]).map((token) => token.value),
    ["t͡ʃ", "a"],
  );
  assert.deepEqual(
    morphologyModel.extractMorphologyReferences("{lemma}-{a=o}"),
    [
      { body: "lemma", unterminated: false },
      { body: "a=o", unterminated: false },
    ],
  );
  assert.equal(
    morphologyModel.morphologyCellDefaultValue(
      { lemma: "root" },
      { rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "" } } },
      0,
      0,
      {},
    ),
    "",
  );
  assert.deepEqual(
    morphologyModel.extractMorphologyFunctionCalls("/rightV(a)(x)=x;else=y/").map((call) => ({
      name: call.name,
      invalidOffset: call.invalidOffset,
    })),
    [{ name: "rightV", invalidOffset: true }],
  );
  assert.deepEqual(
    morphologyModel.validateMorphologyReferenceSyntax({
      templateGroups: [{ name: "Bad", tables: [{ title: "Bad", rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "{a}" } } }] }],
    }),
    ["Bad: 1 / 1: {a} - missing ="],
  );
  assert.deepEqual(
    morphologyModel.validateMorphologyFunctionUsage({
      functions: { leftV: "a" },
      templateGroups: [{ name: "BadFn", tables: [{ title: "BadFn", rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "/rightV(a)=x/" } } }] }],
    }),
    ["BadFn: rightV not configured"],
  );
  const automaticMorphologyDictionary = {
    morphology: {
      templateGroups: [{
        id: "morph-auto",
        name: "Auto group",
        matchTags: ["n"],
        tables: [{
          id: "mtable-auto",
          title: "Auto table",
          rowCount: 1,
          columnCount: 1,
          cells: { "0,0": { sourceText: "{lemma}-generated" } },
        }],
      }],
    },
  };
  assert.deepEqual(
    morphologyModel.morphologySearchStrings({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "auto",
      morphologyGroups: [{ templateGroupId: "morph-auto", overrides: { "mtable-auto": { "0,0": "roots" } } }],
    }, automaticMorphologyDictionary),
    ["roots"],
  );
  assert.deepEqual(
    morphologyModel.morphologySearchStrings({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "manual",
      morphologyGroups: [],
    }, automaticMorphologyDictionary),
    [],
  );

  const canonicalMorphologyDictionary = {
    morphology: {
      templateGroups: [
        automaticMorphologyDictionary.morphology.templateGroups[0],
        {
          id: "morph-manual",
          name: "Manual group",
          matchTags: ["v"],
          tables: [{
            id: "mtable-manual",
            title: "Manual table",
            rowCount: 1,
            columnCount: 1,
            cells: { "0,0": { sourceText: "{lemma}-manual" } },
          }],
        },
      ],
    },
  };
  const autoOverlayEntry = {
    lemma: "root",
    tags: ["n"],
    morphologyMode: "auto",
    morphologyGroups: [{
      id: "emorph-auto-overlay",
      templateGroupId: "morph-auto",
      title: "Irregular auto group",
      notes: "Entry-specific note",
      overrides: { "mtable-auto": { "0,0": "roots" } },
    }],
  };
  const autoOverlayResolution = morphologyModel.resolveCanonicalEntryMorphologyGroups(
    autoOverlayEntry,
    canonicalMorphologyDictionary,
  );
  assert.equal(autoOverlayResolution.length, 1);
  assert.equal(autoOverlayResolution[0].templateGroup.id, "morph-auto");
  assert.equal(autoOverlayResolution[0].entryGroup.title, "Irregular auto group");
  assert.equal(
    morphologyModel.morphologyCellValue(
      autoOverlayEntry,
      autoOverlayResolution[0].entryGroup,
      autoOverlayResolution[0].templateGroup.tables[0],
      0,
      0,
      canonicalMorphologyDictionary,
    ),
    "roots",
  );
  assert.deepEqual(
    morphologyModel.materializeAutomaticMorphologyGroups({
      ...autoOverlayEntry,
      morphologyGroups: [
        ...autoOverlayEntry.morphologyGroups,
        { id: "emorph-dormant", templateGroupId: "morph-manual", notes: "keep dormant", overrides: {} },
      ],
    }, canonicalMorphologyDictionary).map((group) => group.templateGroupId),
    ["morph-auto", "morph-manual"],
  );
  assert.deepEqual(
    morphologyModel.resolveCanonicalEntryMorphologyGroups({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "manual",
      morphologyGroups: [{ id: "emorph-manual", templateGroupId: "morph-manual" }],
    }, canonicalMorphologyDictionary).map(({ templateGroup }) => templateGroup.id),
    ["morph-manual"],
  );
  assert.deepEqual(
    morphologyModel.resolveCanonicalEntryMorphologyGroups({
      lemma: "root",
      tags: ["n"],
      morphologyMode: "manual",
      morphologyGroups: [],
    }, canonicalMorphologyDictionary),
    [],
  );
  assert.deepEqual(
    morphologyModel.normalizeEntryMorphologyState({
      morphologyMode: "auto",
      morphologyGroups: [
        { id: "empty-overlay", templateGroupId: "morph-auto" },
        { id: "real-overlay", templateGroupId: "morph-manual", notes: "keep" },
      ],
    }).morphologyGroups.map((group) => group.templateGroupId),
    ["morph-manual"],
  );
  assert.deepEqual(
    morphologyModel.validateCanonicalEntryMorphology({
      morphologyMode: "auto",
      morphologyGroups: [{
        id: "invalid-override",
        templateGroupId: "morph-auto",
        overrides: { "mtable-auto": { "1,0": "out of range" } },
      }],
    }, canonicalMorphologyDictionary),
    ["invalid morphology override cell: mtable-auto:1,0"],
  );
  assert.deepEqual(
    morphologyModel.validateCanonicalEntryMorphology({
      morphologyMode: "manual",
      morphologyGroups: [{ id: "invalid-group", templateGroupId: "auto" }],
    }, canonicalMorphologyDictionary),
    ["invalid morphology template group: auto"],
  );
  const migratedLegacyMorphology = migrateLegacyDictionary({
    morphology: canonicalMorphologyDictionary.morphology,
    entries: [
      {
        id: "legacy-auto",
        lemma: "root",
        tags: ["n"],
        morphology: { tableId: "auto", overrides: { "0,0": "roots" } },
      },
      {
        id: "legacy-manual",
        lemma: "root",
        tags: ["n"],
        morphology: { tableId: "morph-manual", overrides: { "0,0": "root-manual" } },
      },
      {
        id: "legacy-none",
        lemma: "root",
        tags: ["n"],
        morphology: { tableId: "none" },
      },
    ],
  }).dictionary.entries;
  assert.deepEqual(
    migratedLegacyMorphology.map((entry) => entry.morphologyMode),
    ["auto", "manual", "manual"],
  );
  assert.deepEqual(
    migratedLegacyMorphology[0].morphologyGroups[0].overrides,
    { "mtable-auto": { "0,0": "roots" } },
  );
  assert.deepEqual(
    migratedLegacyMorphology[1].morphologyGroups[0].overrides,
    { "mtable-manual": { "0,0": "root-manual" } },
  );
  assert.equal(Object.hasOwn(migratedLegacyMorphology[0], "morphology"), false);

  const normalized = normalizeDictionary({
    name: "Current",
    entries: [
      {
        lemma: "acar",
        tags: ["n"],
        definitions: [{ meaning: "root" }],
        etymology: { sources: ["entry-source"], description: "source note" },
      },
    ],
    settings: {
      entryListTagDisplayLimit: 99,
      entryListPartDisplay: "chips",
      entrySectionOrder: ["notes", "derived", "notes", "unknown"],
      ipa: { mappings: [{ from: "a", to: "ˈa" }] },
    },
  });

  assert.match(normalized.id, /^dict-/);
  assert.equal(normalized.entries[0].tags[0], "n");
  assert.equal(normalized.entries[0].definitions[0].meaning, "root");
  assert.deepEqual(normalized.entries[0].etymology.sources, ["entry-source"]);
  assert.equal(normalized.entries[0].etymology.description, "source note");
  assert.equal(normalized.settings.entryListTagDisplayLimit, 10);
  assert.equal(normalized.settings.entryListPartDisplay, "chips");
  assert.equal(normalized.settings.showEmptyEntrySections, false);
  assert.deepEqual(normalized.settings.entrySectionOrder, ["notes", "derived", "definitions", "etymology", "morphology"]);
  assert.equal(normalized.settings.ipa.mappings[0].to, "ˈa");

  const normalizedWithoutDefinitions = normalizeDictionary({
    name: "Definitionless",
    entries: [{ lemma: "empty", definitions: [] }],
  });
  assert.deepEqual(normalizedWithoutDefinitions.entries[0].definitions, []);

  const imported = importDictionaryFromPayload({
    activeDictionaryId: "dict-11111111-1111-4111-8111-111111111111",
    dictionaries: [
      {
        id: "dict-11111111-1111-4111-8111-111111111111",
        name: "Imported",
        entries: [{ lemma: "item", definitions: [{ meaning: "ok" }] }],
      },
    ],
  });
  assert.equal(imported.id, "dict-11111111-1111-4111-8111-111111111111");
  assert.equal(imported.entries[0].lemma, "item");

  const conversionService = createDictionaryConversionService();
  const legacyConvertedImport = conversionService.importDictionaryFromJsonPayload({
    name: "Legacy",
    entries: [
      {
        lemma: "legacy",
        partOfSpeech: "n",
        meaning: "root",
        roots: "old source",
        etymology: { sourceEntryId: "entry-source" },
      },
      {
        lemma: "legacy-note",
        definitions: [{ meaning: "note", notes: "legacy definition note" }],
      },
    ],
    settings: {
      ipa: { stressMappings: [{ from: "a", to: "a" }] },
      toolNavOrder: ["editor", "morphology", "settings"],
      glossFontFamily: "sans",
      corpusGlossAlign: false,
      savePartialEditOnSwitch: true,
      fuzzySearch: false,
      tagFuzzySearch: false,
      sourceFuzzyCompletion: false,
    },
  });
  assert.equal(legacyConvertedImport.dictionary.entries[0].tags[0], "n");
  assert.equal(legacyConvertedImport.dictionary.entries[0].definitions[0].meaning, "root");
  assert.equal(legacyConvertedImport.dictionary.entries[0].etymology.description, "old source");
  assert.deepEqual(legacyConvertedImport.dictionary.entries[0].etymology.sources, ["entry-source"]);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0], "partOfSpeech"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0], "meaning"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0], "roots"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[0].etymology, "sourceEntryId"), false);
  assert.equal(legacyConvertedImport.dictionary.settings.ipa.mappings[0].to, "ˈa");
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings.ipa, "stressMappings"), false);
  assert.equal(legacyConvertedImport.dictionary.settings.glossStyles.gla.fontFamily, "sans");
  assert.equal(legacyConvertedImport.dictionary.settings.corpusUnitCardGlossAlign, false);
  assert.equal(legacyConvertedImport.dictionary.settings.partialEditPageSwitchAction, "save");
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "glossFontFamily"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "corpusGlossAlign"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "savePartialEditOnSwitch"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "fuzzySearch"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "tagFuzzySearch"), false);
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.settings, "sourceFuzzyCompletion"), false);
  assert.equal(legacyConvertedImport.dictionary.settings.search.fields.lemma.enabled, true);
  assert.equal(legacyConvertedImport.dictionary.settings.search.fields.lemma.fuzzy, true);
  assert.equal(legacyConvertedImport.dictionary.settings.search.etymologyAutocomplete.fuzzy, true);
  assert.equal(legacyConvertedImport.dictionary.entries[1].definitions[0].note, "legacy definition note");
  assert.equal(Object.hasOwn(legacyConvertedImport.dictionary.entries[1].definitions[0], "notes"), false);
  assert.deepEqual(legacyConvertedImport.dictionary.settings.toolNavOrder, [
    "editor",
    "morphology-functions",
    "morphology-tables",
    "settings",
  ]);
  assert.ok(legacyConvertedImport.report.repairs.length);

  const convertedImport = conversionService.importDictionaryFromJsonPayload({
    id: "dict-22222222-2222-4222-8222-222222222222",
    name: "Converted",
    entries: [{ lemma: "converted", definitions: [{ meaning: "ok" }] }],
  });
  assert.equal(convertedImport.dictionary.id, "dict-22222222-2222-4222-8222-222222222222");
  assert.equal(convertedImport.report.sourceProfile, "legacy-json");
  const convertedExport = conversionService.exportDictionarySnapshot(convertedImport.dictionary, {
    format: "json",
    profile: "portable-json",
  });
  assert.equal(convertedExport.format, "json");
  assert.equal(convertedExport.profile, "portable-json");
  assert.equal(convertedExport.extension, "json");
  assert.equal(convertedExport.payload.id, convertedImport.dictionary.id);

  assert.throws(
    () => importDictionaryFromPayload({ unrelated: true }),
    (error) => error.status === 400,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-id", lemma: "a" }],
        corpus: { units: [{ id: "shared-id", content: "x" }] },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [
          { id: "shared-entry-id", lemma: "a" },
          { id: "shared-entry-id", lemma: "b" },
        ],
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-cross-type-id", lemma: "a" }],
        settings: { ipa: { mappings: [{ id: "shared-cross-type-id", from: "a", to: "b" }] } },
        morphology: { templateGroups: [{ id: "shared-cross-type-id", name: "A", tables: [] }] },
        corpus: { units: [{ id: "shared-cross-type-id", content: "x" }] },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [
          {
            id: "entry-one",
            lemma: "a",
            definitions: [{ id: "shared-definition-id", meaning: "a" }],
          },
          {
            id: "entry-two",
            lemma: "b",
            definitions: [{ id: "shared-definition-id", meaning: "b" }],
          },
        ],
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-config-id", lemma: "a" }],
        morphology: { templateGroups: [{ id: "shared-config-id", name: "A", tables: [] }] },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-ipa-id", lemma: "a" }],
        settings: { ipa: { mappings: [{ id: "shared-ipa-id", from: "a", to: "b" }] } },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );

  withPatchedRandomUUID(["collision", "fresh"], () => {
    const normalized = normalizeDictionary({
      id: "dict-static",
      entries: [
        {
          id: "def-collision",
          lemma: "a",
          definitions: [{ meaning: "a" }],
        },
      ],
    });
    assert.equal(normalized.entries[0].definitions[0].id, "def-fresh");
  });

  withPatchedRandomUUID(["collision", "fresh"], () => {
    const normalized = normalizeDictionary({
      id: "dict-static",
      entries: [{ id: "morph-collision", lemma: "a" }],
      morphology: { templateGroups: [{ name: "A", tables: [] }] },
    });
    assert.equal(normalized.morphology.templateGroups[0].id, "morph-fresh");
  });

  withPatchedRandomUUID(["collision", "fresh"], () => {
    const normalized = normalizeDictionary({
      id: "dict-static",
      entries: [{ id: "ipa-collision", lemma: "a" }],
      settings: { ipa: { mappings: [{ from: "a", to: "b" }] } },
    });
    assert.equal(normalized.settings.ipa.mappings[0].id, "ipa-fresh");
  });
}

async function checkReadApiConsistency(repository) {
  const previousState = await repository.readState();
  const dictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-read-api-consistency",
    name: "Read API Consistency",
    settings: {
      manualPartOfSpeechTags: true,
      partOfSpeechTags: ["n", "v", "adj"],
      tagDisplayMap: {
        n: "Noun Display",
        v: "Verb Display",
        motion: "Motion Display",
      },
    },
    morphology: {
      functions: { leftV: "a,e,i,o,u", rightV: "a,e,i,o,u" },
      templateGroups: [
        {
          id: "morph-n-group",
          name: "N table",
          matchTags: ["n"],
          tables: [{
            id: "mtable-n-main",
            title: "N table",
            rowCount: 1,
            columnCount: 2,
            cells: {
              "0,0": { sourceText: "{lemma}-generated" },
              "0,1": { sourceText: "{a=o}" },
            },
          }],
        },
      ],
    },
    entries: [
      {
        id: "entry-alpha",
        lemma: "alpha",
        pronunciation: "/alpha/",
        tags: ["n", "motion"],
        definitions: [{ id: "def-alpha", meaning: "mirror meaning", example: "alpha example", note: "alpha note" }],
        etymology: { sources: ["root"], description: "source note" },
        notes: "entry note",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "entry-beta",
        lemma: "beta",
        pronunciation: "/beta/",
        tags: ["v", "n", "derived"],
        definitions: [{ id: "def-beta", meaning: "movement" }],
        etymology: { sources: ["alpha"], description: "" },
        morphologyGroups: [{
          id: "emorph-beta",
          templateGroupId: "morph-n-group",
          overrides: { "mtable-n-main": { "0,0": "manual-beta-form" } },
        }],
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "entry-gamma",
        lemma: "gamma",
        pronunciation: "/gamma/",
        tags: ["topic"],
        definitions: [{ id: "def-gamma", meaning: "topic only" }],
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "entry-delta",
        lemma: "delta",
        pronunciation: "",
        tags: [],
        definitions: [{ id: "def-delta", meaning: "untagged" }],
        createdAt: "2026-01-04T00:00:00.000Z",
        updatedAt: "2026-01-04T00:00:00.000Z",
      },
      {
        id: "entry-same-a",
        lemma: "same",
        tags: ["adj"],
        definitions: [{ id: "def-same-a", meaning: "first same lemma" }],
        createdAt: "2026-01-05T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
      },
      {
        id: "entry-same-b",
        lemma: "same",
        tags: ["adj"],
        definitions: [{ id: "def-same-b", meaning: "second same lemma" }],
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z",
      },
    ],
  }));

  try {
    await assertEntryQueryConsistency(repository, dictionary, {});
    await assertEntryQueryConsistency(repository, dictionary, { q: "mirror" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "Noun Display" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "source note" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "/beta/" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "manual-beta-form" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "olpha" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "mrmeaning", fuzzyFields: "definitions" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "nd", fuzzyFields: "tags" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "mrmeaning", fuzzyFields: "definitions" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "mrmeaning", fuzzyFields: "tags" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated", fields: "morphology" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated", fields: "definitions" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha example", fields: "examples" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha example", fields: "notes" });
    await assertEntryQueryConsistency(repository, dictionary, { derivedFrom: "alpha" });
    await assertEntryQueryConsistency(repository, dictionary, { derivedFrom: "root" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "n" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "v" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "adj" });
    await assertEntryQueryConsistency(repository, dictionary, { part: NO_PART_FILTER_VALUE });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "lemmaDesc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "updatedAsc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "updatedDesc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "createdAsc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "createdDesc" });
    await assertRootGroupQueryConsistency(repository, dictionary, {});
    await assertRootGroupQueryConsistency(repository, dictionary, { q: "movement" });
    await assertRootGroupQueryConsistency(repository, dictionary, { q: "manual-beta-form" });
    await assertRootGroupQueryConsistency(repository, dictionary, { q: "mrmeaning", fuzzyFields: "definitions" });
    await assertRootGroupQueryConsistency(repository, dictionary, { sort: "lemmaDesc" });

    let apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/facets`);
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(apiResult.body.parts.map((part) => part.tag), expectedParts(dictionary));
    assert.equal(apiResult.body.parts.find((part) => part.tag === "n")?.displayLabel, "Noun Display");
    assert.equal(apiResult.body.noPartOfSpeechCount, 2);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries?sort=lemmaAsc&limit=3`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 3);
    assert.equal(apiResult.body.pageInfo.hasMore, true);
    assert.ok(apiResult.body.pageInfo.nextCursor);
    const nextPage = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries?sort=lemmaAsc&limit=100&cursor=${encodeURIComponent(apiResult.body.pageInfo.nextCursor)}`,
    );
    assert.equal(nextPage.statusCode, 200);
    assert.deepEqual(
      [...apiResult.body.items, ...nextPage.body.items].map((entry) => entry.id),
      expectedEntryIds(dictionary, { sort: "lemmaAsc" }),
    );

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups?sort=lemmaAsc&limit=2`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 2);
    assert.equal(apiResult.body.pageInfo.hasMore, true);
    assert.ok(apiResult.body.pageInfo.nextCursor);
    const nextRootGroupPage = await callApi(
      repository,
      "GET",
      `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups?sort=lemmaAsc&limit=100&cursor=${encodeURIComponent(apiResult.body.pageInfo.nextCursor)}`,
    );
    assert.equal(nextRootGroupPage.statusCode, 200);
    assert.deepEqual(
      [...apiResult.body.items, ...nextRootGroupPage.body.items].map((group) => group.root.id),
      expectedRootGroupSnapshot(dictionary, { sort: "lemmaAsc" }).map((group) => group.rootId),
    );
  } finally {
    await repository.deleteDictionary(dictionary.id);
    if (previousState.activeDictionaryId) {
      await repository.activateDictionary(previousState.activeDictionaryId);
    }
  }

  const defaultPartDictionary = await repository.createDictionary(normalizeDictionary({
    id: "dict-read-api-default-part",
    name: "Read API Default Part",
    settings: {
      manualPartOfSpeechTags: false,
      tagDisplayMap: { topic: "Topic Display" },
    },
    entries: [
      { id: "entry-topic-first", lemma: "topic first", tags: ["topic", "n"], definitions: [{ id: "def-topic", meaning: "topic" }] },
      { id: "entry-n-first", lemma: "noun first", tags: ["n", "topic"], definitions: [{ id: "def-n", meaning: "noun" }] },
    ],
  }));

  try {
    await assertEntryQueryConsistency(repository, defaultPartDictionary, { part: "topic" });
    let apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(defaultPartDictionary.id)}/facets`);
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(apiResult.body.parts.map((part) => part.tag), expectedParts(defaultPartDictionary));
    assert.equal(apiResult.body.parts.find((part) => part.tag === "topic")?.displayLabel, "Topic Display");
  } finally {
    await repository.deleteDictionary(defaultPartDictionary.id);
    if (previousState.activeDictionaryId) {
      await repository.activateDictionary(previousState.activeDictionaryId);
    }
  }
}

async function runRepositoryContractTests(options = {}) {
  assert.equal(typeof options.createRepository, "function", "createRepository option is required");
  const stopAfter = options.stopAfter || "all";
  assert.ok(
    Object.hasOwn(CONTRACT_STAGES, stopAfter),
    `Unknown repository contract stopAfter stage: ${stopAfter}`,
  );
  const shouldStopAfter = (stage) => CONTRACT_STAGES[stage] >= CONTRACT_STAGES[stopAfter];
  const context = await options.createRepository({
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  });
  const repository = context.repository || context;
  const cleanup = context.cleanup || (async () => {});
  try {
    await repository.ensureDataStore?.();

    let state = await repository.readState();
    assert.equal(state.activeDictionaryId, "");
    assert.deepEqual(state.dictionaries, []);
    assert.equal(state.uiLanguage, "zh");
    assert.equal(state.uiTheme, "light");

    const first = await repository.createDictionary(normalizeDictionary({ name: "First", language: "one" }));
    const second = await repository.createDictionary(normalizeDictionary({ name: "Second", language: "two" }));

    state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [first.id, second.id]);

    await repository.activateDictionary(first.id);
    assert.equal((await repository.readState()).activeDictionaryId, first.id);

    const activeExport = await repository.exportDictionary();
    assert.equal(activeExport.id, first.id);
    let apiResult = await callApi(repository, "GET", `/api/export?dictionaryId=${encodeURIComponent(first.id)}&profile=portable-json`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.id, first.id);
    await assertRejectStatus(
      callApi(repository, "GET", `/api/export?dictionaryId=${encodeURIComponent(first.id)}&format=xlsx`),
      400,
      "unsupported export format",
    );
    if (shouldStopAfter("lifecycle")) {
      return { completedStage: "lifecycle" };
    }

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/meta`, {
      name: "First Renamed",
      language: "renamed",
      description: "meta only",
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.name, "First Renamed");
    assert.equal(apiResult.body.language, "renamed");

    const updated = await repository.updateDictionary(first.id, {
      name: "First Updated",
      entries: [{ lemma: "root", tags: ["n"], definitions: [{ meaning: "root meaning" }] }],
    });
    assert.equal(updated.name, "First Updated");
    assert.equal(updated.entries[0].tags[0], "n");
    assert.equal(updated.entries[0].definitions[0].meaning, "root meaning");
    const rootEntryId = updated.entries[0].id;

    const savedWithNewEntry = await repository.saveEntry(first.id, { lemma: "new entry", definitions: [{ meaning: "new" }] });
    assert.equal(savedWithNewEntry.id, first.id);
    assert.equal(savedWithNewEntry.entry.lemma, "new entry");
    const repositoryEntryId = savedWithNewEntry.entry.id;
    assert.equal((await repository.getEntry(first.id, repositoryEntryId)).lemma, "new entry");

    const savedWithoutDefinitions = await repository.saveEntry(first.id, { lemma: "definitionless", definitions: [] });
    assert.deepEqual(savedWithoutDefinitions.entry.definitions, []);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`);
    assert.equal(apiResult.handled, true);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.length, 3);

    apiResult = await callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
      lemma: "api entry",
      definitions: [{ meaning: "created through API" }],
    });
    assert.equal(apiResult.statusCode, 201);
    assert.match(apiResult.body.id, /^entry-/);
    assert.equal(apiResult.body.lemma, "api entry");
    const apiEntryId = apiResult.body.id;

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.definitions[0].meaning, "created through API");

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`, {
      ...apiResult.body,
      lemma: "api entry updated",
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.lemma, "api entry updated");

    apiResult = await callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
      lemma: "derived smoke",
      pronunciation: "/derived/",
      tags: ["v", "derived"],
      definitions: [{ meaning: "derived from root" }],
      etymology: { sources: ["root"], description: "" },
    });
    assert.equal(apiResult.statusCode, 201);
    const derivedEntryId = apiResult.body.id;
    if (shouldStopAfter("entryCrud")) {
      return { completedStage: "entryCrud" };
    }

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries?q=derived&include=summary`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 1);
    assert.equal(apiResult.body.items[0].lemma, "derived smoke");
    assert.equal(apiResult.body.items[0].definitionPreview, "derived from root");

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries?part=v&tags=derived&tagMode=all&limit=1`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 1);
    assert.equal(apiResult.body.pageInfo.total, 1);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries?limit=2&sort=lemmaAsc`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 2);
    assert.equal(apiResult.body.pageInfo.hasMore, true);
    assert.ok(apiResult.body.pageInfo.nextCursor);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/facets`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.parts.some((part) => part.tag === "n"), true);
    assert.equal(apiResult.body.parts.some((part) => part.tag === "v"), true);
    assert.equal(apiResult.body.tags.some((tag) => tag.tag === "derived" && tag.count === 1), true);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entry-relations/${encodeURIComponent(rootEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.derivedEntries.some((entry) => entry.id === derivedEntryId), true);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entry-relations/${encodeURIComponent(derivedEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.sources[0].matchedEntryId, rootEntryId);

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/root-groups?q=derived&limit=100`);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.items.length, 1);
    assert.equal(apiResult.body.items[0].root.id, rootEntryId);
    assert.deepEqual(apiResult.body.items[0].derivedEntries.map((entry) => entry.id), [derivedEntryId]);
    assert.deepEqual(apiResult.body.items[0].matchedDerivedIds, [derivedEntryId]);

    await checkReadApiConsistency(repository);
    if (shouldStopAfter("readApi")) {
      return { completedStage: "readApi" };
    }

    apiResult = await callApi(repository, "DELETE", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(Object.keys(apiResult.body), ["updatedAt"]);
    assert.ok(apiResult.body.updatedAt);
    await assertRejectStatus(
      callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`),
      404,
      "deleted entry lookup",
    );

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/settings`, {
      allowEmptyTags: false,
      docsAutoSave: true,
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.settings.allowEmptyTags, false);
    assert.equal(apiResult.body.settings.docsAutoSave, true);

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/docs`, {
      markdown: "# Notes",
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.docs.markdown, "# Notes");

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/corpus`, {
      units: [{ content: "corpus unit" }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.corpus.units[0].content, "corpus unit");
    assert.match(apiResult.body.corpus.units[0].id, /^corpus-unit-/);

    apiResult = await callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/autosave`, {
      docs: { markdown: "# Autosaved notes" },
      corpus: { units: [{ content: "autosaved corpus unit" }] },
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.docs.markdown, "# Autosaved notes");
    assert.equal(apiResult.body.corpus.units[0].content, "autosaved corpus unit");

    await assertRejectStatus(
      callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(first.id)}/autosave`, {}),
      400,
      "empty autosave payload",
    );

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/morphology`, {
      templateGroups: [{ name: "Nouns", tables: [{ title: "Nouns", rowCount: 2, columnCount: 2 }] }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.morphology.templateGroups[0].name, "Nouns");
    assert.match(apiResult.body.morphology.templateGroups[0].id, /^morph-/);
    await assertRejectStatus(
      callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/morphology`, {
        templateGroups: [{ name: "Broken", tables: [{ title: "Broken", rowCount: 1, columnCount: 1, cells: { "0,0": { sourceText: "{a}" } } }] }],
      }),
      400,
      "invalid morphology syntax save",
    );

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/settings/ipa`, {
      mappings: [{ from: "a", to: "ɑ" }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.settings.ipa.mappings[0].to, "ɑ");
    if (shouldStopAfter("modules")) {
      return { completedStage: "modules" };
    }

    apiResult = await callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
      settings: { allowEmptyDefinitions: false },
      updates: [{ id: repositoryEntryId, patch: { tags: ["n", "root"] } }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.entries.length, 1);
    assert.equal(apiResult.body.entries[0].id, repositoryEntryId);
    assert.deepEqual(apiResult.body.entries[0].tags, ["n", "root"]);
    assert.equal(apiResult.body.settings.allowEmptyDefinitions, false);
    await assertRejectStatus(
      callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
        updates: [{ id: repositoryEntryId, patch: { definitions: [] } }],
      }),
      400,
      "unsupported entry patch field",
    );
    await assertRejectStatus(
      callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
        updates: [{ id: repositoryEntryId, patch: { tags: "n" } }],
      }),
      400,
      "invalid entry patch tags",
    );
    await assertRejectStatus(
      callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
        updates: [{ id: repositoryEntryId, patch: { pronunciation: ["/n/"] } }],
      }),
      400,
      "invalid entry patch pronunciation",
    );

    await checkCorpusIdCollisionInvariants(repository);

    const legacyDuplicateId = "dict-legacy-duplicates";
    const legacyDuplicate = normalizeDictionary({
      id: legacyDuplicateId,
      name: "Legacy Duplicates",
      entries: [
        {
          id: "entry-legacy-a",
          lemma: "legacy a",
          definitions: [{ id: "def-shared-legacy", meaning: "a" }],
        },
        {
          id: "entry-legacy-b",
          lemma: "legacy b",
          definitions: [{ id: "def-shared-legacy", meaning: "b" }],
        },
        {
          id: "entry-legacy-ok",
          lemma: "legacy ok",
          definitions: [{ id: "def-legacy-ok", meaning: "ok" }],
        },
      ],
    });
    if (context.installLegacyDuplicateDictionary) {
      await context.installLegacyDuplicateDictionary(legacyDuplicate);
      await assertRejectStatus(
        repository.updateDictionary(legacyDuplicateId, { name: "Full Save Blocked" }),
        409,
        "full snapshot still rejects duplicate ids",
      );

      apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(legacyDuplicateId)}/settings`, {
        allowEmptyTags: false,
      });
      assert.equal(apiResult.statusCode, 200);
      assert.equal(apiResult.body.settings.allowEmptyTags, false);

      apiResult = await callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(legacyDuplicateId)}/entries`, {
        updates: [{ id: "entry-legacy-ok", patch: { tags: ["checked"] } }],
      });
      assert.equal(apiResult.statusCode, 200);
      assert.equal(apiResult.body.entries.length, 1);
      assert.equal(apiResult.body.entries[0].id, "entry-legacy-ok");
      assert.deepEqual(apiResult.body.entries[0].tags, ["checked"]);

      apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(legacyDuplicateId)}/docs`, {
        markdown: "legacy docs",
      });
      assert.equal(apiResult.statusCode, 200);
      assert.equal(apiResult.body.docs.markdown, "legacy docs");

      apiResult = await callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(legacyDuplicateId)}/autosave`, {
        docs: { markdown: "autosaved docs" },
        corpus: { units: [{ content: "autosaved corpus" }] },
      });
      assert.equal(apiResult.statusCode, 200);
      assert.equal(apiResult.body.docs.markdown, "autosaved docs");
      assert.equal(apiResult.body.corpus.units[0].content, "autosaved corpus");

      await assertRejectStatus(
        callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(legacyDuplicateId)}/entries/entry-legacy-a`, {
          id: "entry-legacy-a",
          lemma: "legacy a edited",
          definitions: [{ id: "def-shared-legacy", meaning: "a" }],
        }),
        409,
        "entry save rejects conflicts in saved scope",
      );
      await assertRejectStatus(
        callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(legacyDuplicateId)}/settings/ipa`, {
          mappings: [{ id: "entry-legacy-ok", from: "a", to: "b" }],
        }),
        409,
        "IPA save rejects conflicts in saved scope",
      );
      await repository.deleteDictionary(legacyDuplicateId);
    }

    const preferences = await repository.updatePreferences({ uiLanguage: "en", uiTheme: "dark" });
    assert.deepEqual(preferences, { uiLanguage: "en", uiTheme: "dark" });
    state = await repository.readState();
    assert.equal(state.uiLanguage, "en");
    assert.equal(state.uiTheme, "dark");

    await assertRejectStatus(repository.importDictionary(first), 409, "duplicate import");
    await repository.importDictionary({ ...first, name: "First Overwritten" }, { overwrite: true });
    assert.equal((await repository.getDictionarySnapshot(first.id)).name, "First Overwritten");

    await repository.deleteDictionary(first.id);
    state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [second.id]);

    await assertRejectStatus(repository.activateDictionary(first.id), 404, "activate deleted dictionary");
    await assertRejectStatus(repository.exportDictionary(first.id), 404, "export deleted dictionary");

    await repository.createDictionary({ id: "dict-collision", name: "Collision" });
    const generated = withPatchedRandomUUID(["collision", "fresh"], () => repository.createDictionary({ name: "Generated" }));
    assert.equal((await generated).id, "dict-fresh");

    await assertRejectStatus(
      repository.importDictionary(normalizeDictionary({
        id: "dict-duplicate-entry-import",
        name: "Duplicate Entry Import",
        entries: [
          { id: "entry-import-duplicate", lemma: "a" },
          { id: "entry-import-duplicate", lemma: "b" },
        ],
      })),
      409,
      "duplicate entry id import",
    );
    await assertRejectStatus(
      repository.importDictionary(normalizeDictionary({
        id: "dict-cross-type-import",
        name: "Cross Type Import",
        entries: [{ id: "shared-import-id", lemma: "a" }],
        settings: { ipa: { mappings: [{ id: "shared-import-id", from: "a", to: "b" }] } },
        morphology: { templateGroups: [{ id: "shared-import-id", name: "A", tables: [] }] },
        corpus: { units: [{ id: "shared-import-id", content: "x" }] },
      })),
      409,
      "cross type duplicate id import",
    );

    await assertRejectStatus(repository.importDictionary({ id: "bad id", name: "Bad" }), 400, "invalid dictionary id import");
    const regeneratedImport = withPatchedRandomUUID(
      ["collision", "imported"],
      () => repository.importDictionary({ id: "bad id", name: "Regenerated" }, { regenerateId: true }),
    );
    assert.equal((await regeneratedImport).id, "dict-imported");
    return { completedStage: "all" };
  } finally {
    await cleanup();
  }
}

module.exports = {
  callApi,
  checkModelNormalization,
  runRepositoryContractTests,
};
