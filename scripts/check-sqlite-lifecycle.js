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
    }));
    const second = await repository.createDictionary(normalizeDictionary({
      id: "dict-sqlite-second",
      name: "Second",
      language: "two",
    }));

    let topologyBuilds = 0;
    const buildRootTopology = repository.rootTopologyFromDatabase.bind(repository);
    repository.rootTopologyFromDatabase = (...args) => {
      topologyBuilds += 1;
      return buildRootTopology(...args);
    };
    let state = await repository.readState();
    assert.equal(topologyBuilds, 1, "readState should build a topology only for the active dictionary");
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [first.id, second.id]);
    assert.equal(state.dictionaries.every((dictionary) => dictionary.entries === undefined), true);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.summary), [
      { entryCount: 0 },
      { entryCount: 0, rootCount: 0 },
    ]);

    await repository.activateDictionary(first.id);
    state = await repository.readState();
    assert.equal(topologyBuilds, 2, "activating another dictionary should build its topology on demand");
    assert.equal(state.activeDictionaryId, first.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.summary), [
      { entryCount: 0, rootCount: 0 },
      { entryCount: 0 },
    ]);
    assert.equal((await repository.exportDictionary()).id, first.id);
    assert.deepEqual(await repository.listDictionaries(), state.dictionaries);
    assert.equal(topologyBuilds, 2, "listing dictionaries should not build topologies for inactive dictionaries");
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
