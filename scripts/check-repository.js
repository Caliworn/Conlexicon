const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
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
const { JsonDictionaryRepository } = require("../lib/json-dictionary-repository");
const { morphologySearchStrings } = require("../lib/morphology-model");
const ipaModel = require("../lib/ipa-model");
const tagModel = require("../lib/tag-model");

const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";
const ENTRY_SEARCH_FIELDS = new Set([
  "lemma",
  "pronunciation",
  "tags",
  "definitions",
  "examples",
  "notes",
  "etymology",
  "morphology",
]);

function createRepository(dataDir) {
  return new JsonDictionaryRepository({
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  });
}

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
    return true;
  }
  const fields = testSearchFields(query.fields || query.searchFields);
  const values = [];
  if (fields.has("lemma")) {
    values.push(entry.lemma);
  }
  if (fields.has("pronunciation")) {
    values.push(entry.pronunciation);
  }
  if (fields.has("tags")) {
    values.push(
      ...parts,
      ...parts.map((part) => testDisplayTag(part, dictionary)),
      ...(entry.tags || []),
      ...(entry.tags || []).map((tag) => testDisplayTag(tag, dictionary)),
    );
  }
  if (fields.has("definitions")) {
    values.push(...(entry.definitions || []).map((definition) => definition.meaning));
  }
  if (fields.has("examples")) {
    values.push(...(entry.definitions || []).map((definition) => definition.example));
  }
  if (fields.has("notes")) {
    values.push(entry.notes, ...(entry.definitions || []).map((definition) => definition.note));
  }
  if (fields.has("etymology")) {
    values.push(entry.etymology?.description, ...(entry.etymology?.sources || []));
  }
  if (fields.has("morphology")) {
    values.push(...morphologySearchStrings(entry, dictionary));
  }
  return values.map(testNormalize).join(" ").includes(normalizedQuery);
}

function testSearchFields(value) {
  const fields = String(value || "")
    .split(/[,，、\n]/)
    .map((field) => field.trim().toLowerCase())
    .filter((field) => ENTRY_SEARCH_FIELDS.has(field));
  return fields.length ? new Set(fields) : new Set(ENTRY_SEARCH_FIELDS);
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
  assert.equal(ipaModel.normalizeIpaSettings({ stressMappings: [{ from: "a", to: "a" }] }).mappings[0].to, "ˈa");
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

  const normalized = normalizeDictionary({
    name: "Legacy",
    entries: [
      {
        lemma: "acar",
        partOfSpeech: "n",
        meaning: "root",
        roots: "old source",
        etymology: { sourceEntryId: "entry-source" },
      },
    ],
    settings: {
      entryListTagDisplayLimit: 99,
      ipa: { stressMappings: [{ from: "a", to: "a" }] },
    },
  });

  assert.match(normalized.id, /^dict-/);
  assert.equal(normalized.entries[0].tags[0], "n");
  assert.equal(normalized.entries[0].definitions[0].meaning, "root");
  assert.deepEqual(normalized.entries[0].etymology.sources, ["entry-source"]);
  assert.equal(normalized.settings.entryListTagDisplayLimit, 10);
  assert.equal(normalized.settings.ipa.mappings[0].to, "ˈa");

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
        morphology: { tables: [{ id: "shared-cross-type-id", name: "A" }] },
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
        morphology: { tables: [{ id: "shared-config-id", name: "A" }] },
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
      morphology: { tables: [{ name: "A" }] },
    });
    assert.equal(normalized.morphology.tables[0].id, "morph-fresh");
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
      tables: [
        {
          id: "morph-n-table",
          name: "N table",
          rows: 1,
          cols: 2,
          matchTags: ["n"],
          cells: {
            "0,0": { value: "{lemma}-generated" },
            "0,1": { value: "{a=o}" },
          },
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
        morphology: { tableId: "auto", overrides: {} },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "entry-beta",
        lemma: "beta",
        pronunciation: "/beta/",
        tags: ["v", "n", "derived"],
        definitions: [{ id: "def-beta", meaning: "movement" }],
        morphology: { tableId: "morph-n-table", overrides: { "0,0": "manual-beta-form" } },
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
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated", fields: "morphology" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha-generated", fields: "definitions" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha example", fields: "examples" });
    await assertEntryQueryConsistency(repository, dictionary, { q: "alpha example", fields: "notes" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "n" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "v" });
    await assertEntryQueryConsistency(repository, dictionary, { part: "adj" });
    await assertEntryQueryConsistency(repository, dictionary, { part: NO_PART_FILTER_VALUE });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "lemmaDesc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "updatedAsc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "updatedDesc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "createdAsc" });
    await assertEntryQueryConsistency(repository, dictionary, { sort: "createdDesc" });

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

async function checkJsonRepository() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-repository-check-"));
  try {
    const repository = createRepository(dataDir);
    await repository.ensureDataStore();

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

    let apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/meta`, {
      name: "First Renamed",
      language: "renamed",
      description: "meta only",
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.name, "First Renamed");
    assert.equal(apiResult.body.language, "renamed");

    const updated = await repository.updateDictionary(first.id, {
      name: "First Updated",
      entries: [{ lemma: "root", partOfSpeech: "n", meaning: "root meaning" }],
    });
    assert.equal(updated.name, "First Updated");
    assert.equal(updated.entries[0].tags[0], "n");
    assert.equal(updated.entries[0].definitions[0].meaning, "root meaning");
    const rootEntryId = updated.entries[0].id;

    const savedWithNewEntry = await repository.saveEntry(first.id, { lemma: "new entry", definitions: [{ meaning: "new" }] });
    assert.equal(savedWithNewEntry.entries.length, 2);
    const repositoryEntryId = savedWithNewEntry.entries.at(-1).id;
    assert.equal((await repository.getEntry(first.id, repositoryEntryId)).lemma, "new entry");

    apiResult = await callApi(repository, "GET", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`);
    assert.equal(apiResult.handled, true);
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.length, 2);

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

    await checkReadApiConsistency(repository);

    apiResult = await callApi(repository, "DELETE", `/api/dictionaries/${encodeURIComponent(first.id)}/entries/${encodeURIComponent(apiEntryId)}`);
    assert.equal(apiResult.statusCode, 200);
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

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/morphology`, {
      tables: [{ name: "Nouns" }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.morphology.tables[0].name, "Nouns");
    assert.match(apiResult.body.morphology.tables[0].id, /^morph-/);

    apiResult = await callApi(repository, "PUT", `/api/dictionaries/${encodeURIComponent(first.id)}/settings/ipa`, {
      mappings: [{ from: "a", to: "ɑ" }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.equal(apiResult.body.settings.ipa.mappings[0].to, "ɑ");

    apiResult = await callApi(repository, "PATCH", `/api/dictionaries/${encodeURIComponent(first.id)}/entries`, {
      settings: { allowEmptyDefinitions: false },
      updates: [{ id: repositoryEntryId, patch: { tags: ["n", "root"] } }],
    });
    assert.equal(apiResult.statusCode, 200);
    assert.deepEqual(apiResult.body.entries.find((entry) => entry.id === repositoryEntryId).tags, ["n", "root"]);
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
    await repository.writeJson(path.join(dataDir, "dictionaries", `${legacyDuplicateId}.json`), legacyDuplicate);
    await repository.writeIndex({
      activeDictionaryId: legacyDuplicateId,
      dictionaryIds: [...(await repository.readIndex()).dictionaryIds, legacyDuplicateId],
    });
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
    assert.deepEqual(apiResult.body.entries.find((entry) => entry.id === "entry-legacy-ok").tags, ["checked"]);

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
        morphology: { tables: [{ id: "shared-import-id", name: "A" }] },
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
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  checkModelNormalization();
  await checkJsonRepository();
  console.log("Repository checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
