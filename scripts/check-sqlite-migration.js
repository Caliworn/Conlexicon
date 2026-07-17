const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { migrateJsonDataDirectoryToSqlite } = require("./migrate-json-data-to-sqlite");

function repositoryOptions(dataDir) {
  return {
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  };
}

async function readSourceSnapshot(dataDir, dictionaryIds) {
  const snapshot = {
    index: await fs.readFile(path.join(dataDir, "index.json"), "utf8"),
    dictionaries: {},
  };
  for (const id of dictionaryIds) {
    snapshot.dictionaries[id] = await fs.readFile(path.join(dataDir, "dictionaries", `${id}.json`), "utf8");
  }
  return snapshot;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log("SQLite runtime unavailable; migration check skipped.");
    return;
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-migration-check-"));
  const sourceDataDir = path.join(tempRoot, "source-data");
  const targetDataDir = path.join(tempRoot, "target-data");
  const targetRepository = new SqliteDictionaryRepository(repositoryOptions(targetDataDir));

  try {
    const first = normalizeDictionary({
      id: "dict-migration-first",
      name: "Migration First",
      language: "one",
      entries: [{ lemma: "root", tags: ["n"], definitions: [{ meaning: "root meaning" }] }],
    });
    const second = normalizeDictionary({
      id: "dict-migration-second",
      name: "Migration Second",
      language: "two",
      entries: [{ lemma: "leaf", tags: ["v"], etymology: { sources: ["root"] } }],
    });
    await writeJson(path.join(sourceDataDir, "dictionaries", `${first.id}.json`), first);
    await writeJson(path.join(sourceDataDir, "dictionaries", `${second.id}.json`), second);
    await writeJson(path.join(sourceDataDir, "index.json"), {
      ...DEFAULT_INDEX,
      activeDictionaryId: first.id,
      dictionaryIds: [first.id, second.id],
      uiLanguage: "en",
      uiTheme: "dark",
    });

    const before = await readSourceSnapshot(sourceDataDir, [first.id, second.id]);
    const report = await migrateJsonDataDirectoryToSqlite({ sourceDataDir, targetDataDir });
    const after = await readSourceSnapshot(sourceDataDir, [first.id, second.id]);

    assert.deepEqual(after, before, "migration must not modify source JSON data");
    assert.equal(report.migratedCount, 2);
    assert.equal(report.failedCount, 0);
    assert.equal(report.targetActiveDictionaryId, first.id);
    assert.deepEqual(report.dictionaries.map((item) => item.status), ["migrated", "migrated"]);

    const state = await targetRepository.readState();
    assert.equal(state.activeDictionaryId, first.id);
    assert.equal(state.uiLanguage, "en");
    assert.equal(state.uiTheme, "dark");
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [first.id, second.id]);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.summary.entryCount), [1, 1]);

    const firstSnapshot = await targetRepository.getDictionarySnapshot(first.id);
    const secondSnapshot = await targetRepository.getDictionarySnapshot(second.id);
    assert.equal(firstSnapshot.name, "Migration First");
    assert.equal(firstSnapshot.entries[0].lemma, "root");
    assert.equal(secondSnapshot.name, "Migration Second");
    assert.deepEqual(secondSnapshot.entries[0].etymology.sources, ["root"]);

    console.log("SQLite migration check passed.");
  } finally {
    targetRepository.close?.();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
