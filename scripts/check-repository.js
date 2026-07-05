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
const { JsonDictionaryRepository } = require("../lib/json-dictionary-repository");
const {
  checkModelNormalization,
  runRepositoryContractTests,
} = require("./repository-contract");

function createJsonRepository(dataDir) {
  return new JsonDictionaryRepository({
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  });
}

async function createJsonRepositoryContractContext() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-repository-check-"));
  const repository = createJsonRepository(dataDir);
  return {
    repository,
    async cleanup() {
      await fs.rm(dataDir, { recursive: true, force: true });
    },
    async installLegacyDuplicateDictionary(dictionary) {
      await repository.writeJson(path.join(dataDir, "dictionaries", `${dictionary.id}.json`), dictionary);
      await repository.writeIndex({
        activeDictionaryId: dictionary.id,
        dictionaryIds: [...(await repository.readIndex()).dictionaryIds, dictionary.id],
      });
    },
  };
}

async function main() {
  checkModelNormalization();
  await runRepositoryContractTests({
    name: "json",
    createRepository: createJsonRepositoryContractContext,
  });
  console.log("Repository checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
