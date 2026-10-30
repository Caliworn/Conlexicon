const assert = require("node:assert/strict");

const { normalizeDictionary } = require("../lib/dictionary-model");
const { createDictionaryConversionService } = require("../lib/dictionary-conversion-service");
const { buildQualityIssues } = require("../lib/quality-model");
const { arrangeTags, effectiveEntryTags, tagMoveStep, tagMoveToIndex } = require("../lib/tag-model");
const { callApi } = require("./repository-contract");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");

const part = (tag, displayLabel = "") => ({ tag, partOfSpeech: true, displayLabel, color: "" });
const general = (tag, displayLabel = "") => ({ tag, partOfSpeech: false, displayLabel, color: "" });

function registryDictionary(id) {
  return normalizeDictionary({
    id,
    name: id,
    tagRegistry: [part("n", "Noun"), part("v"), general("archaic"), general("unused")],
    entries: [
      {
        id: "entry-noun",
        lemma: "stone",
        tags: ["n", "archaic"],
        definitions: [{ id: "def-noun", meaning: "rock", tags: ["v"] }],
      },
      { id: "entry-verb", lemma: "walk", tags: ["v"] },
    ],
  });
}

async function withDictionary(repository, id, run) {
  await repository.importDictionarySnapshot(registryDictionary(id));
  try {
    await run({
      path: `/api/dictionaries/${encodeURIComponent(id)}`,
      rows: async () => (await repository.getTagRegistry(id)).tags,
      tags: async () => (await repository.getTagRegistry(id)).tags.map((row) => row.tag),
      change: (body) => callApi(repository, "POST", `/api/dictionaries/${encodeURIComponent(id)}/tag-registry/changes`, body),
    });
  } finally {
    await repository.deleteDictionary(id);
  }
}

function positions(repository, id) {
  return repository.openDictionaryDatabase(id).prepare(`
    SELECT part_of_speech AS zone, position, tag
    FROM tag_registry
    ORDER BY part_of_speech DESC, position ASC
  `).all().map((row) => [row.zone, row.position, row.tag]);
}

async function assertRejected(call, statusCode, code, message) {
  await assert.rejects(call, (error) => error.status === statusCode && error.code === code, message);
}

async function checkRegistrationOnWrite(repository) {
  await withDictionary(repository, "dict-registration", async ({ path: dictionaryPath, tags }) => {
    const entriesPath = `${dictionaryPath}/entries`;

    const unchanged = await callApi(repository, "POST", entriesPath, { lemma: "known", tags: ["v", "n"] });
    assert.equal(Object.hasOwn(unchanged.body, "tagRegistry"), false, "known tags change nothing");

    const created = await callApi(repository, "POST", entriesPath, {
      lemma: "created",
      tags: ["zeta", "n", "alpha"],
      definitions: [{ meaning: "one", tags: ["mid", "zeta"] }, { meaning: "two", tags: ["beta"] }],
    });
    assert.deepEqual(
      created.body.tagRegistry.slice(-4).map((row) => [row.tag, row.partOfSpeech]),
      [["zeta", false], ["alpha", false], ["mid", false], ["beta", false]],
      "new tags join the general zone: entry tags first, then definitions in order",
    );
    assert.equal(Object.hasOwn(created.body.tagRegistry[0], "entryCount"), false);
    assert.equal(Object.hasOwn(created.body.tagRegistry[0], "displayAmbiguous"), true);
    assert.deepEqual(await tags(), ["n", "v", "archaic", "unused", "zeta", "alpha", "mid", "beta"]);

    const saved = created.body.entry;
    assert.deepEqual(saved.tags, ["alpha", "n", "zeta"], "tag lists are in canonical order");
    assert.deepEqual(saved.definitions[0].tags, ["mid", "zeta"]);
    assert.deepEqual(
      (await callApi(repository, "GET", `${entriesPath}/${saved.id}`)).body,
      saved,
      "a save response matches what later reads return",
    );

    const patched = await callApi(repository, "PATCH", entriesPath, {
      updates: [{ id: saved.id, patch: { tags: ["patched-z", "patched-a"] } }],
    });
    assert.deepEqual(patched.body.entries[0].tags, ["patched-a", "patched-z"]);
    assert.deepEqual(patched.body.tagRegistry.slice(-2).map((row) => row.tag), ["patched-z", "patched-a"]);

    // A registered tag outlives its last use.
    await repository.deleteEntry("dict-registration", saved.id);
    assert.equal((await tags()).includes("zeta"), true);
  });

  await withDictionary(repository, "dict-registration-source", async ({ path: dictionaryPath, tags }) => {
    const owner = await repository.getEntry("dict-registration-source", "entry-verb");
    await repository.saveEntry("dict-registration-source", {
      ...owner,
      etymology: { ...owner.etymology, sources: [{ entryId: "", text: "missing" }] },
    });
    const current = await repository.getEntry("dict-registration-source", "entry-verb");
    const result = await callApi(repository, "POST", `${dictionaryPath}/entries/create-source`, {
      entry: { lemma: "missing", tags: ["from-source"] },
      sourceBinding: {
        ownerEntryId: current.id,
        sourcePosition: 0,
        expectedSources: current.etymology.sources,
        expectedUpdatedAt: current.updatedAt,
      },
    });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.tagRegistry.at(-1).tag, "from-source");
    assert.equal((await tags()).at(-1), "from-source");
  });
}

async function checkChanges(repository) {
  const id = "dict-changes";
  await withDictionary(repository, id, async ({ rows, tags, change }) => {
    const added = await change({ op: "add", tag: "  prep  ", partOfSpeech: true });
    assert.equal(added.statusCode, 200);
    assert.deepEqual(added.body.tagRegistry.map((row) => [row.tag, row.entryCount]), [
      ["n", 1], ["v", 2], ["prep", 0], ["archaic", 1], ["unused", 0],
    ], "add joins the end of its zone and the response carries counts");
    assert.equal(Object.hasOwn(added.body, "updatedAt"), true);

    await change({ op: "add", tag: "later", partOfSpeech: false });
    assert.deepEqual(await tags(), ["n", "v", "prep", "archaic", "unused", "later"]);

    await assertRejected(change({ op: "add", tag: "a,b", partOfSpeech: false }), 400, "tag_registry_invalid_tag");
    await assertRejected(change({ op: "add", tag: "   ", partOfSpeech: false }), 400, "tag_registry_invalid_tag");
    await assertRejected(change({ op: "add", tag: "n", partOfSpeech: false }), 409, "tag_registry_tag_exists");

    // Moves inside a zone, across zones and to the end of a zone.
    await change({ op: "move", tag: "prep", partOfSpeech: true, before: "n" });
    assert.deepEqual(await tags(), ["prep", "n", "v", "archaic", "unused", "later"]);
    await change({ op: "move", tag: "later", partOfSpeech: true, before: null });
    assert.deepEqual(await tags(), ["prep", "n", "v", "later", "archaic", "unused"]);
    assert.equal((await rows()).find((row) => row.tag === "later").partOfSpeech, true);
    await change({ op: "move", tag: "n", partOfSpeech: false, before: "unused" });
    assert.deepEqual(await tags(), ["prep", "v", "later", "archaic", "n", "unused"]);
    assert.deepEqual(positions(repository, id), [
      [1, 0, "prep"], [1, 1, "v"], [1, 2, "later"],
      [0, 0, "archaic"], [0, 1, "n"], [0, 2, "unused"],
    ], "positions stay continuous in each zone");
    await change({ op: "move", tag: "n", partOfSpeech: true, before: "v" });

    await assertRejected(change({ op: "move", tag: "ghost", partOfSpeech: true, before: null }), 404, "tag_registry_tag_not_found");
    await assertRejected(
      change({ op: "move", tag: "prep", partOfSpeech: true, before: "archaic" }),
      404,
      "tag_registry_anchor_not_found",
      "the anchor must be in the target zone",
    );

    const updated = await change({ op: "update", tag: "prep", displayLabel: "  Prep  ", color: "red" });
    assert.deepEqual(
      updated.body.tagRegistry.find((row) => row.tag === "prep"),
      { tag: "prep", partOfSpeech: true, displayLabel: "Prep", color: "red", displayAmbiguous: false, entryCount: 0 },
    );
    await change({ op: "update", tag: "prep", displayLabel: "prep" });
    const unlabeled = (await rows()).find((row) => row.tag === "prep");
    assert.equal(unlabeled.displayLabel, "", "a label equal to the tag is stored empty");
    assert.equal(unlabeled.color, "red", "fields not given stay as they were");

    for (const body of [
      { op: "update", tag: "prep" },
      { op: "update", tag: "prep", color: "blue" },
      { op: "update", tag: "prep", displayLabel: 1 },
      { op: "move", tag: "prep", partOfSpeech: "yes", before: null },
      { op: "move", tag: "prep", partOfSpeech: true },
      { op: "add", partOfSpeech: true },
      { op: "rename", tag: "prep" },
      [],
    ]) {
      await assertRejected(change(body), 400, "invalid_tag_registry_change", `invalid change ${JSON.stringify(body)}`);
    }

    // Unused tags delete; a tag in use counts its entries, definition tags included.
    await assertRejected(change({ op: "delete", tag: "ghost" }), 404, "tag_registry_tag_not_found");
    await assert.rejects(change({ op: "delete", tag: "v" }), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, "tag_registry_tag_in_use");
      assert.equal(error.details.entryCount, 2);
      return true;
    });
    await change({ op: "delete", tag: "prep" });
    assert.deepEqual(await tags(), ["n", "v", "later", "archaic", "unused"]);
    assert.deepEqual(
      positions(repository, id).map(([zone, position]) => [zone, position]),
      [[1, 0], [1, 1], [1, 2], [0, 0], [0, 1]],
    );
  });
}

async function checkDownstreamEffects(repository) {
  const id = "dict-downstream";
  await withDictionary(repository, id, async ({ change }) => {
    const analysis = async () => (await repository.queryAnalysis(id, {
      widgets: [{ id: "parts", type: "partDistribution" }, { id: "sets", type: "tagSetDistribution" }],
    })).widgets;
    const entryUpdatedAt = () => repository.getEntry(id, "entry-noun").then((entry) => entry.updatedAt);
    const before = await entryUpdatedAt();

    await change({ op: "add", tag: "prep", partOfSpeech: true });
    assert.deepEqual(
      (await analysis()).parts.rows.map((row) => [row.part, row.entryCount]),
      [["v", 2], ["n", 1], ["prep", 0]],
      "parts of speech without entries still show",
    );

    // Combinations follow the registry, the same rank entries display with.
    const combination = async () => (await analysis()).sets.rows.find((row) => row.tags.length === 3).tags.map((tag) => tag.value);
    assert.deepEqual(await combination(), ["n", "v", "archaic"]);
    await change({ op: "move", tag: "v", partOfSpeech: true, before: "n" });
    assert.deepEqual(await combination(), ["v", "n", "archaic"]);
    const entry = await repository.getEntry(id, "entry-noun");
    assert.deepEqual(
      effectiveEntryTags(entry, (await repository.getDictionaryWorkspace(id)).tagRegistry),
      ["v", "n", "archaic"],
    );
    assert.equal(await entryUpdatedAt(), before, "moving a tag writes no entry");

    // A zone change reaches filters, statistics and quality rules.
    await change({ op: "move", tag: "archaic", partOfSpeech: true, before: null });
    const filtered = await repository.queryEntries(id, { filter: { part: "archaic" } });
    assert.deepEqual(filtered.items.map((item) => item.id), ["entry-noun"]);
    assert.equal((await analysis()).parts.rows.some((row) => row.part === "archaic"), true);
    const levels = () => buildQualityIssues(repository.qualityInputRecords(id), repository.qualityInputSettings(id))
      .filter((issue) => issue.code === "mixed_part_of_speech_levels")
      .map((issue) => issue.params.part);
    assert.deepEqual(levels(), ["v"]);
    await change({ op: "move", tag: "v", partOfSpeech: false, before: null });
    assert.deepEqual(levels(), [], "quality rules read the zone");

    // Display labels are search text; only the tag's own records change.
    const search = async (q) => (await repository.queryEntries(id, { q, searchFields: "tags" })).items.map((item) => item.id);
    assert.deepEqual(await search("Noun"), ["entry-noun"]);
    const db = repository.openDictionaryDatabase(id);
    const otherRows = () => db.prepare(`
      SELECT entry_id, field, source_type, source_position, value_type, raw_value
      FROM entry_search_values
      WHERE NOT (field = 'tags' AND value_type = 'display')
      ORDER BY 1, 2, 3, 4, 5
    `).all();
    const rowsBefore = otherRows();
    await change({ op: "update", tag: "n", displayLabel: "Substantive" });
    assert.deepEqual(await search("Noun"), []);
    assert.deepEqual(await search("Substantive"), ["entry-noun"]);
    assert.deepEqual(otherRows(), rowsBefore);
    await change({ op: "update", tag: "n", displayLabel: "" });
    assert.deepEqual(await search("Substantive"), []);

    // Colors never reach a query.
    const generation = (await repository.getTagRegistry(id)).generation;
    await change({ op: "update", tag: "n", color: "red" });
    assert.equal((await repository.getTagRegistry(id)).generation, generation);
    assert.equal(
      (await repository.getTagRegistry(id)).tags.find((row) => row.tag === "n").color,
      "red",
      "the read endpoint does not take colors from the cached snapshot",
    );
    await change({ op: "update", tag: "n", displayLabel: "Noun" });
    assert.equal((await repository.getTagRegistry(id)).generation, generation + 1);
  });
}

async function checkSchemaConstraints(repository) {
  await withDictionary(repository, "dict-constraints", async () => {
    const db = repository.openDictionaryDatabase("dict-constraints");
    assert.throws(
      () => db.prepare("INSERT INTO entry_tags(entry_id, tag) VALUES ('entry-verb', 'unregistered')").run(),
      /FOREIGN KEY/,
      "every tag row references the registry",
    );
    assert.throws(
      () => db.prepare("INSERT INTO entry_tags(entry_id, tag) VALUES ('entry-verb', 'v')").run(),
      /UNIQUE|PRIMARY KEY/,
      "a tag appears once per entry",
    );
    assert.throws(
      () => db.prepare("INSERT INTO definition_tags(definition_id, entry_id, tag) VALUES ('def-noun', 'entry-noun', 'v')").run(),
      /UNIQUE|PRIMARY KEY/,
      "a tag appears once per definition",
    );
    assert.throws(() => db.prepare("DELETE FROM tag_registry WHERE tag = 'v'").run(), /FOREIGN KEY/);
  });
}

async function checkExportAndImport(repository) {
  const service = createDictionaryConversionService();
  await withDictionary(repository, "dict-roundtrip", async ({ path: dictionaryPath, change }) => {
    await change({ op: "move", tag: "archaic", partOfSpeech: false, before: "unused" });
    await change({ op: "move", tag: "v", partOfSpeech: true, before: "n" });
    await change({ op: "update", tag: "unused", color: "red" });
    const entriesPath = `${dictionaryPath}/entries`;
    await callApi(repository, "POST", entriesPath, { lemma: "spaced", tags: ["with,comma"] });

    const exported = await repository.exportDictionary("dict-roundtrip");
    assert.deepEqual(exported.entries[0].tags, ["n", "archaic"], "exported tag lists follow the registry");
    assert.deepEqual(
      exported.tagRegistry.find((row) => row.tag === "unused"),
      { tag: "unused", partOfSpeech: false, displayLabel: "", color: "red" },
      "unused rows export with their settings",
    );
    assert.equal(Object.hasOwn(exported.tagRegistry[0], "displayAmbiguous"), false);

    const { dictionary, report } = service.importDictionaryFromJsonPayload(exported);
    assert.deepEqual(report.repairs, [], "a current export needs no repairs");
    const imported = await repository.importDictionary({ ...dictionary, id: "dict-roundtrip-copy" });
    try {
      const reexported = await repository.exportDictionary("dict-roundtrip-copy");
      assert.deepEqual(reexported.tagRegistry, exported.tagRegistry, "tags with separators survive a roundtrip");
      assert.deepEqual(reexported.entries.map((entry) => entry.tags), exported.entries.map((entry) => entry.tags));
    } finally {
      await repository.deleteDictionary(imported.id);
    }
  });

  const appended = service.importDictionaryFromJsonPayload({
    name: "Partial registry",
    tagRegistry: [general("known")],
    entries: [{ lemma: "x", tags: ["second", "known"], definitions: [{ tags: ["third"] }] }],
  }).dictionary;
  assert.deepEqual(appended.tagRegistry.map((row) => row.tag), ["known", "second", "third"]);

  for (const tagRegistry of [
    "n",
    [{ tag: "", partOfSpeech: false }],
    [{ tag: "n", partOfSpeech: "yes" }],
    [{ tag: "n", partOfSpeech: false }, { tag: " n ", partOfSpeech: true }],
    [{ tag: "n", partOfSpeech: false, displayLabel: 1 }],
    [{ tag: "n", partOfSpeech: false, color: "blue" }],
  ]) {
    assert.throws(
      () => service.importDictionaryFromJsonPayload({ name: "Invalid", tagRegistry, entries: [] }),
      (error) => error.code === "invalid_tag_registry",
      `invalid registry ${JSON.stringify(tagRegistry)}`,
    );
  }
}

function checkLegacyConversion() {
  const service = createDictionaryConversionService();
  const convert = (settings, entries) => service.importDictionaryFromJsonPayload({ name: "Legacy", settings, entries });
  const compact = (dictionary) => dictionary.tagRegistry
    .map((row) => [row.tag, row.partOfSpeech, row.displayLabel, row.color]);

  const { dictionary, report } = convert({
    partOfSpeechTags: ["adj", "v", "n"],
    tagSortOrder: ["n", "root", "ADJ", "gone"],
    tagDisplayMap: { n: "Noun", "only-labeled": "Label" },
    redHighlightTags: ["Noun", "root", "only-red"],
  }, [
    { lemma: "a", tags: ["root", "zeta"], definitions: [{ tags: ["inner", "n"] }] },
    { lemma: "b", tags: ["alpha"] },
  ]);
  assert.deepEqual(compact(dictionary), [
    ["n", true, "Noun", "red"], // red through its display text
    ["adj", true, "", ""], // the old order ignored case
    ["v", true, "", ""], // unlisted parts keep their order behind listed ones
    ["root", false, "", "red"],
    ["gone", false, "", ""], // only in the old order, kept as an unused row
    ["zeta", false, "", ""],
    ["inner", false, "", ""],
    ["alpha", false, "", ""],
    ["only-labeled", false, "Label", ""],
    ["only-red", false, "", "red"],
  ]);
  ["partOfSpeechTags", "tagSortOrder", "tagDisplayMap", "redHighlightTags"]
    .forEach((key) => assert.equal(Object.hasOwn(dictionary.settings, key), false, `${key} is removed`));
  assert.equal(report.repairs.includes("legacy tag settings migrated to tagRegistry"), true);

  // One old order item covers every spelling in use, which share its place.
  assert.deepEqual(
    convert({ tagSortOrder: ["noun", "z"] }, [
      { lemma: "a", tags: ["z", "NOUN"] },
      { lemma: "b", tags: ["Noun"] },
    ]).dictionary.tagRegistry.map((row) => row.tag),
    ["NOUN", "Noun", "z"],
  );

  // A legacy part of speech becomes a tag before the registry is built.
  assert.deepEqual(
    convert({ partOfSpeechTags: ["n"] }, [{ lemma: "a", partOfSpeech: "n" }]).dictionary.tagRegistry,
    [part("n")],
  );

  // A file with a registry keeps it and only loses the old fields.
  const current = service.importDictionaryFromJsonPayload({
    name: "Current",
    tagRegistry: [general("a")],
    settings: { partOfSpeechTags: ["a"] },
  });
  assert.deepEqual(current.dictionary.tagRegistry, [general("a")]);
  assert.equal(Object.hasOwn(current.dictionary.settings, "partOfSpeechTags"), false);
}

function checkMoveRequests() {
  const registry = [part("n"), part("v"), general("archaic"), general("root")];
  const tags = (change) => [change.partOfSpeech, change.before];
  assert.deepEqual(tags(tagMoveToIndex(registry, "v", true, 0)), [true, "n"]);
  assert.deepEqual(tags(tagMoveToIndex(registry, "n", true, Number.POSITIVE_INFINITY)), [true, null]);
  assert.deepEqual(tags(tagMoveToIndex(registry, "n", false, 1)), [false, "root"], "the index ignores the moved tag");
  assert.deepEqual(tags(tagMoveStep(registry, "n", 1)), [true, null]);
  assert.deepEqual(tags(tagMoveStep(registry, "v", -1)), [true, "n"]);
  assert.deepEqual(tags(tagMoveStep(registry, "v", 1)), [false, "archaic"], "down from the last part enters the general zone");
  assert.deepEqual(tags(tagMoveStep(registry, "archaic", -1)), [true, null], "up from the first general tag enters the parts");
  assert.equal(tagMoveStep(registry, "n", -1), null);
  assert.equal(tagMoveStep(registry, "root", 1), null);
}

function checkDraftOrdering() {
  const registry = [part("n"), part("v"), general("archaic")];
  assert.deepEqual(
    effectiveEntryTags({ tags: ["draft", "archaic"], definitions: [{ tags: ["v", "draft"] }] }, registry),
    ["v", "archaic", "draft"],
  );
  assert.deepEqual(
    arrangeTags(["Noun", "n"], [general("n"), general("Noun")]),
    ["n", "Noun"],
    "spellings are separate tags",
  );
}

async function main() {
  requireSqliteRuntime("Tag registry check");
  checkLegacyConversion();
  checkDraftOrdering();
  checkMoveRequests();
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-tag-registry-");
  try {
    await checkRegistrationOnWrite(repository);
    await checkChanges(repository);
    await checkDownstreamEffects(repository);
    await checkSchemaConstraints(repository);
    await checkExportAndImport(repository);
  } finally {
    await cleanup();
  }
  console.log("tag registry check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
