const assert = require("node:assert/strict");

const { normalizeDictionary } = require("../lib/dictionary-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const {
  createTempSqliteRepository,
  sqliteRuntimeUnavailableMessage,
} = require("./sqlite-check-utils");

async function runSqliteLifecycleCheck() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log(sqliteRuntimeUnavailableMessage("lifecycle check"));
    return;
  }

  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-sqlite-lifecycle-");
  try {
    await repository.ensureDataStore();
    assert.deepEqual(await repository.readIndex(), {
      activeDictionaryId: "",
      dictionaryIds: [],
      uiLanguage: "zh",
      uiTheme: "light",
    });

    const first = await repository.createDictionary(normalizeDictionary({
      id: "dict-sqlite-first",
      name: "First",
      language: "one",
      entries: [
        { id: "entry-first-root", lemma: "first-root" },
        {
          id: "entry-first-unresolved",
          lemma: "first-unresolved",
          etymology: { sources: ["missing-root"] },
        },
      ],
    }));
    const second = await repository.createDictionary(normalizeDictionary({
      id: "dict-sqlite-second",
      name: "Second",
      language: "two",
      entries: [
        { id: "entry-second-root-a", lemma: "second-root-a" },
        { id: "entry-second-root-b", lemma: "second-root-b" },
        {
          id: "entry-second-derived",
          lemma: "second-derived",
          etymology: { sources: ["entry-second-root-a"] },
        },
      ],
    }));

    let topologyBuilds = 0;
    const buildRootTopology = repository.rootTopologyFromDatabase.bind(repository);
    repository.rootTopologyFromDatabase = (...args) => {
      topologyBuilds += 1;
      return buildRootTopology(...args);
    };
    let state = await repository.readState();
    assert.equal(topologyBuilds, 0, "readState should not build root topologies for dictionary summaries");
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [first.id, second.id]);
    assert.equal(state.dictionaries.every((dictionary) => dictionary.entries === undefined), true);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.summary), [
      { entryCount: 2, rootCount: 1 },
      { entryCount: 3, rootCount: 2 },
    ]);

    await repository.activateDictionary(first.id);
    state = await repository.readState();
    assert.equal(topologyBuilds, 0, "activating another dictionary should not build its topology for summaries");
    assert.equal(state.activeDictionaryId, first.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.summary), [
      { entryCount: 2, rootCount: 1 },
      { entryCount: 3, rootCount: 2 },
    ]);
    assert.equal((await repository.exportDictionary()).id, first.id);
    const firstRootGroups = await repository.queryRootGroups(first.id, { limit: 10 });
    assert.equal(firstRootGroups.pageInfo.total, 2);
    assert.equal(
      state.dictionaries[0].summary.rootCount,
      1,
      "an unresolved derived fallback group must not count as a semantic root",
    );
    assert.deepEqual(await repository.listDictionaries(), state.dictionaries);
    assert.equal(topologyBuilds, 1, "listing dictionaries should not build additional root topologies");
    assert.equal((await repository.getDictionarySnapshot(second.id)).name, "Second");

    const preferences = await repository.updatePreferences({ uiLanguage: "en", uiTheme: "dark" });
    assert.deepEqual(preferences, { uiLanguage: "en", uiTheme: "dark" });
    state = await repository.readState();
    assert.equal(state.uiLanguage, "en");
    assert.equal(state.uiTheme, "dark");

    await repository.deleteDictionary(first.id);
    state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [second.id]);
    await assert.rejects(
      () => repository.activateDictionary(first.id),
      (error) => error.status === 404 && error.code === "dictionary_not_found",
    );
    await assert.rejects(
      () => repository.initializeDictionaryDatabase("bad id"),
      (error) => error.status === 400 && error.code === "invalid_dictionary_id",
    );
  } finally {
    await cleanup();
  }
}

async function main() {
  await runSqliteLifecycleCheck();
  console.log("SQLite lifecycle checks passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runSqliteLifecycleCheck,
};
