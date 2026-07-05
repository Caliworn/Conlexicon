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
const { runRepositoryContractTests } = require("./repository-contract");

async function createSqliteRepositoryContractContext() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-sqlite-contract-"));
  const repository = new SqliteDictionaryRepository({
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  });
  return {
    repository,
    async cleanup() {
      repository.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function main() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log("SQLite runtime unavailable; contract check skipped.");
    return;
  }

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
