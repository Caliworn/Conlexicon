const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiSkin,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");

function sqliteRepositoryOptions(dataDir) {
  return {
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiSkin,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  };
}

async function createTempSqliteRepository(prefix = "conlexicon-sqlite-check-") {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(dataDir));
  return {
    dataDir,
    repository,
    async cleanup() {
      repository.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

function requireSqliteRuntime(scope = "SQLite check") {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    throw new Error(`SQLite runtime unavailable; ${scope} cannot run.`);
  }
}

function sampleSqliteDictionary() {
  return normalizeDictionary({
    id: "dict-sqlite-roundtrip",
    name: "SQLite Roundtrip",
    language: "test-lang",
    description: "roundtrip check",
    settings: {
      partOfSpeechTags: ["n", "v"],
      tagDisplayMap: { n: "noun" },
    },
    docs: { markdown: "# Notes" },
    corpus: { units: [{ id: "corpus-unit-roundtrip", content: "unit" }] },
    morphology: {
      templateGroups: [{
        id: "morph-roundtrip",
        name: "Nouns",
        matchTags: ["n"],
        tables: [{
          id: "mtable-roundtrip",
          title: "Nouns",
          rowCount: 2,
          columnCount: 2,
          cells: {},
        }],
      }],
    },
    entries: [
      {
        id: "entry-root",
        lemma: "root",
        pronunciation: "/root/",
        tags: ["n", "root-tag"],
        definitions: [{ id: "def-root", meaning: "root meaning", example: "root example", note: "root note" }],
        notes: "entry note",
        morphologyMode: "manual",
        morphologyGroups: [{
          templateGroupId: "morph-roundtrip",
          notes: "Irregular plural retained for this entry.",
          overrides: { "mtable-roundtrip": { "0,0": "root-form" } },
        }],
      },
      {
        id: "entry-derived",
        lemma: "derived",
        tags: ["v"],
        definitions: [{ id: "def-derived", meaning: "derived meaning" }],
        etymology: { sources: ["root"], description: "derived from root" },
      },
    ],
  });
}

module.exports = {
  createTempSqliteRepository,
  requireSqliteRuntime,
  sampleSqliteDictionary,
  sqliteRepositoryOptions,
};
