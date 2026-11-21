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

function morphologyTableFixture(id, {
  title = "",
  matchRules = [],
  rowLabels = [""],
  columnLabels = [""],
  sources = [],
} = {}) {
  const rows = rowLabels.map((label, index) => ({ id: `mrow-${id}-${index + 1}`, label }));
  const columns = columnLabels.map((label, index) => ({ id: `mcol-${id}-${index + 1}`, label }));
  const cells = sources.flatMap((row, rowIndex) => row.flatMap((sourceText, columnIndex) => (
    sourceText ? [{ rowId: rows[rowIndex].id, columnId: columns[columnIndex].id, kind: "rule", sourceText }] : []
  )));
  return { id, title, matchRules, inheritsFrom: null, rows, columns, cells };
}

function morphologyFormOverride(table, row, column, value) {
  return { rowId: table.rows[row].id, columnId: table.columns[column].id, kind: "form", value };
}

function sampleSqliteDictionary() {
  const table = morphologyTableFixture("mtable-roundtrip", {
    title: "Nouns", matchRules: [{ all: ["n"], none: [] }], rowLabels: ["", ""], columnLabels: ["", ""],
  });
  return normalizeDictionary({
    id: "dict-sqlite-roundtrip",
    name: "SQLite Roundtrip",
    language: "test-lang",
    description: "roundtrip check",
    tagRegistry: [
      { tag: "n", partOfSpeech: true, displayLabel: "noun" },
      { tag: "v", partOfSpeech: true },
    ],
    docs: { markdown: "# Notes" },
    corpus: { items: [{ id: "corpus-item-roundtrip", content: "root example" }] },
    morphology: {
      slots: [{
        id: "mslot-roundtrip",
        name: "Nouns",
        tables: [table],
      }],
    },
    entries: [
      {
        id: "entry-root",
        lemma: "root",
        pronunciation: "/root/",
        tags: ["n", "root-tag"],
        definitions: [{ id: "def-root", meaning: "root meaning", examples: [{ itemId: "corpus-item-roundtrip" }], note: "root note" }],
        notes: "entry note",
        morphologyMode: "manual",
        morphologyTables: [{
          tableId: table.id,
          notes: "Irregular plural retained for this entry.",
          overrides: [morphologyFormOverride(table, 0, 0, "root-form")],
        }],
      },
      {
        id: "entry-derived",
        lemma: "derived",
        tags: ["v"],
        definitions: [{ id: "def-derived", meaning: "derived meaning" }],
        etymology: { sources: [{ entryId: "entry-root", text: "root" }], description: "derived from root" },
      },
    ],
  });
}

module.exports = {
  createTempSqliteRepository,
  morphologyFormOverride,
  morphologyTableFixture,
  requireSqliteRuntime,
  sampleSqliteDictionary,
  sqliteRepositoryOptions,
};
