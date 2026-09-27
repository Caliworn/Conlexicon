const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { normalizeDictionary } = require("../lib/dictionary-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { requireSqliteRuntime, sqliteRepositoryOptions } = require("./sqlite-check-utils");
const { buildDictionary, generateStressDictionary } = require("./generate-stress-dictionary");
const { buildMorphologyTestDictionary, writeMorphologyTestData } = require("./generate-morphology-test-dictionary");

function checkSources(dictionary) {
  // Current fixtures must be valid before any legacy JSON conversion can repair them.
  normalizeDictionary(dictionary);
  const byId = new Map(dictionary.entries.map((entry) => [entry.id, entry]));
  let linked = 0;
  let unbound = 0;
  for (const entry of dictionary.entries) {
    const seen = new Set();
    for (const source of entry.etymology.sources) {
      assert.equal(typeof source.entryId, "string");
      assert.equal(typeof source.text, "string");
      if (!source.entryId) { unbound += 1; continue; }
      assert.notEqual(source.entryId, entry.id);
      assert.ok(!seen.has(source.entryId), "generated targets are unique per entry");
      seen.add(source.entryId);
      assert.equal(byId.get(source.entryId)?.lemma, source.text, "generated reference resolves to its intended target");
      linked += 1;
    }
  }
  return { linked, unbound };
}

async function main() {
  requireSqliteRuntime("generated dictionary checks");
  const stress = buildDictionary(256);
  assert.deepEqual(buildDictionary(256), stress, "stress generation remains deterministic");
  const counts = checkSources(stress);
  assert.ok(counts.linked > 0 && counts.unbound > 0, "exercise linked and unrecorded sources");
  assert.ok(checkSources(buildMorphologyTestDictionary()).linked > 0);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-generated-"));
  let repository;
  try {
    const result = await generateStressDictionary({ dataDir: path.join(tempRoot, "stress"), entryCount: 256 });
    repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(result.dataDir));
    const stored = await repository.getDictionarySnapshot(result.dictionary.id);
    assert.equal(stored.entries.length, 256);
    for (const entry of stress.entries) {
      assert.deepEqual(stored.entries.find((item) => item.id === entry.id).etymology.sources, entry.etymology.sources);
    }
    const derived = stress.entries.find((entry) => entry.etymology.sources.some((source) => source.entryId));
    const relations = await repository.getEntryRelations(stress.id, derived.id);
    assert.deepEqual(relations.sources.map((source) => source.matchedEntryId), derived.etymology.sources.map((source) => source.entryId));

    const morphology = await writeMorphologyTestData(path.join(tempRoot, "morphology-json"));
    const json = JSON.parse(await fs.readFile(path.join(morphology.dataDir, "dictionaries", `${morphology.dictionary.id}.json`), "utf8"));
    checkSources(json);
    await repository.importDictionarySnapshot(json);
    const sourceEntry = json.entries.find((entry) => entry.etymology.sources.length);
    assert.deepEqual((await repository.getEntry(json.id, sourceEntry.id)).etymology.sources, sourceEntry.etymology.sources);
    console.log("Generated dictionary current-source format, deterministic output and SQLite round-trip checks passed.");
  } finally {
    repository?.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
