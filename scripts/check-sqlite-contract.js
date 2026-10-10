const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { serializeApiError } = require("../lib/api-error");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { runRepositoryContractTests } = require("./repository-contract");
const {
  requireSqliteRuntime,
  sampleSqliteDictionary,
  sqliteRepositoryOptions,
} = require("./sqlite-check-utils");

async function createSqliteRepositoryContractContext() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-sqlite-contract-"));
  const repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(dataDir));
  return {
    repository,
    async cleanup() {
      repository.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function checkSqliteJsonReads() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-sqlite-json-"));
  let repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(dataDir));
  const reopenRepository = () => {
    repository.close();
    repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(dataDir));
  };
  try {
    const dictionary = await repository.createDictionary(sampleSqliteDictionary());
    reopenRepository();
    const readModule = (module) => repository.openDictionaryDatabase(dictionary.id)
      .prepare("SELECT value_json AS valueJson FROM module_blobs WHERE module = ?")
      .get(module).valueJson;
    const writeModule = (module, value) => repository.openDictionaryDatabase(dictionary.id)
      .prepare("UPDATE module_blobs SET value_json = ? WHERE module = ?")
      .run(value, module);
    const isJsonParseError = (error) => serializeApiError(error).error.code === "system_json_parse";
    const originalSettings = readModule("settings");
    const expectedRelations = await repository.getEntryRelations(dictionary.id, "entry-derived");
    const expectedFacets = await repository.getEntryFacets(dictionary.id);
    const analysisQuery = {
      widgets: [
        { id: "parts", type: "partDistribution" },
        { id: "tags", type: "tagFrequency" },
        { id: "sets", type: "tagSetDistribution" },
      ],
    };
    const expectedAnalysis = await repository.queryAnalysis(dictionary.id, analysisQuery);

    // Reopen after direct SQL edits so cached query results cannot mask damaged data.
    for (const damagedSettings of ['{"partOfSpeechTags":', ""]) {
      writeModule("settings", damagedSettings);
      reopenRepository();
      await assert.rejects(
        () => repository.getEntryFacets(dictionary.id),
        isJsonParseError,
        "damaged settings must surface system_json_parse on reads",
      );
      await assert.rejects(
        () => repository.updateSettings(dictionary.id, { allowEmptyLemma: false }),
        isJsonParseError,
        "a save depending on damaged settings must surface system_json_parse",
      );
      assert.equal(readModule("settings"), damagedSettings, "failed reads/saves must preserve damaged settings");
    }

    for (const settingsValue of ["{}", null]) {
      if (settingsValue === null) {
        repository.openDictionaryDatabase(dictionary.id)
          .prepare("DELETE FROM module_blobs WHERE module = 'settings'").run();
      } else {
        writeModule("settings", settingsValue);
      }
      reopenRepository();
      assert.deepEqual(repository.dictionaryQueryContext(dictionary.id).settings, {});
      assert.deepEqual((await repository.getDictionarySnapshot(dictionary.id)).settings, {});
      const saved = await repository.updateSettings(dictionary.id, { allowEmptyLemma: false });
      assert.equal(saved.settings.allowEmptyLemma, false, "empty or missing settings must remain saveable");
    }

    writeModule("settings", originalSettings);
    writeModule("corpus", '{"units":');
    reopenRepository();
    assert.deepEqual(
      await repository.getEntryRelations(dictionary.id, "entry-derived"),
      expectedRelations,
      "relations must remain available with damaged corpus data",
    );
    assert.deepEqual(
      await repository.getEntryFacets(dictionary.id),
      expectedFacets,
      "facets must remain available with damaged corpus data",
    );
    assert.deepEqual(
      (await repository.queryAnalysis(dictionary.id, analysisQuery)).widgets,
      expectedAnalysis.widgets,
      "settings-based analysis must remain available with damaged corpus data",
    );
    await assert.rejects(
      () => repository.exportDictionary(dictionary.id),
      isJsonParseError,
      "export must surface system_json_parse when required corpus data is damaged",
    );
  } finally {
    repository.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  requireSqliteRuntime("repository contract check");

  await checkSqliteJsonReads();
  const result = await runRepositoryContractTests({
    name: "sqlite",
    createRepository: createSqliteRepositoryContractContext,
    stopAfter: "all",
  });
  console.log(`SQLite repository contract checks passed through ${result.completedStage}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
