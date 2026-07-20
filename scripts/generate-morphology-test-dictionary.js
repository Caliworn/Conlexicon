#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");

const CREATED_AT = "2026-07-11T12:00:00.000Z";
const DICTIONARY_ID = "dict-7a4f7f2b-0000-4000-8000-000000000001";

function fixtureId(prefix, index) {
  return `${prefix}-7a4f7f2b-${String(index).padStart(4, "0")}-4000-8000-${String(index).padStart(12, "0")}`;
}

function definition(index, meaning, extras = {}) {
  return {
    id: fixtureId("def", index),
    meaning,
    example: extras.example || "",
    note: extras.note || "",
  };
}

function buildMorphologyTestDictionary() {
  const nounGroupId = fixtureId("morph", 1);
  const verbGroupId = fixtureId("morph", 2);
  const adjectiveGroupId = fixtureId("morph", 3);
  const nounCasesTableId = fixtureId("mtable", 1);
  const nounPluralTableId = fixtureId("mtable", 2);
  const verbFiniteTableId = fixtureId("mtable", 3);
  const adjectiveDegreeTableId = fixtureId("mtable", 4);

  return {
    id: DICTIONARY_ID,
    name: "Morphology Acceptance Fixture",
    language: "Synthetic",
    description: "Small current-schema dictionary for manually and automatically testing morphology groups, subtables, overrides, and empty cells.",
    settings: {
      manualPartOfSpeechTags: true,
      partOfSpeechTags: ["n", "v", "adj"],
      showEmptyEntrySections: false,
      allowEmptyPronunciation: true,
      allowEmptyTags: true,
      allowEmptyDefinitions: true,
    },
    docs: { markdown: "# Morphology Acceptance Fixture" },
    corpus: { blocks: [], units: [] },
    morphology: {
      functions: {
        leftV: ["a", "o", "u", "e", "i"],
        rightV: ["a", "o", "u", "e", "i"],
      },
      templateGroups: [
        {
          id: nounGroupId,
          name: "Noun declension",
          matchTags: ["n"],
          notes: "Template-level note: this must not appear on entry detail cards.",
          tables: [
            {
              id: nounCasesTableId,
              title: "Case forms",
              rowCount: 2,
              columnCount: 3,
              rowLabels: ["Singular", "Plural"],
              columnLabels: ["NOM", "ACC", "GEN"],
              cells: {
                "0,0": { sourceText: "{}" },
                "0,1": { sourceText: "{}-ta" },
                "0,2": { sourceText: "" },
                "1,0": { sourceText: "{}-mi" },
                "1,1": { sourceText: "{}-mita" },
                "1,2": { sourceText: "{}-min" },
              },
            },
            {
              id: nounPluralTableId,
              title: "Possessed plural",
              rowCount: 1,
              columnCount: 2,
              rowLabels: ["Plural"],
              columnLabels: ["1SG possessor", "3SG possessor"],
              cells: {
                "0,0": { sourceText: "{}-m-na" },
                "0,1": { sourceText: "{}-m-sa" },
              },
            },
          ],
        },
        {
          id: verbGroupId,
          name: "Verb agreement",
          matchTags: ["v"],
          notes: "",
          tables: [
            {
              id: verbFiniteTableId,
              title: "Finite forms",
              rowCount: 2,
              columnCount: 2,
              rowLabels: ["Non-past", "Past"],
              columnLabels: ["1SG", "3SG"],
              cells: {
                "0,0": { sourceText: "{}-na" },
                "0,1": { sourceText: "{}-n" },
                "1,0": { sourceText: "{}-ta-na" },
                "1,1": { sourceText: "{}-ta" },
              },
            },
          ],
        },
        {
          id: adjectiveGroupId,
          name: "Adjective degree",
          matchTags: ["adj"],
          notes: "",
          tables: [
            {
              id: adjectiveDegreeTableId,
              title: "Degree",
              rowCount: 1,
              columnCount: 3,
              rowLabels: ["Form"],
              columnLabels: ["Positive", "Comparative", "Superlative"],
              cells: {
                "0,0": { sourceText: "{}" },
                "0,1": { sourceText: "ma-{}" },
                "0,2": { sourceText: "sa-{}" },
              },
            },
          ],
        },
      ],
    },
    entries: [
      {
        id: fixtureId("entry", 1),
        lemma: "tala",
        pronunciation: "/ˈta.la/",
        tags: ["n", "root"],
        definitions: [definition(1, "tree")],
        etymology: { sources: [], description: "" },
        notes: "",
        morphologyMode: "auto",
        morphologyGroups: [],
      },
      {
        id: fixtureId("entry", 2),
        lemma: "mire",
        pronunciation: "/ˈmi.re/",
        tags: ["v"],
        definitions: [definition(2, "to see")],
        etymology: { sources: ["tala"], description: "Derived for source-link testing." },
        notes: "",
        morphologyMode: "auto",
        morphologyGroups: [],
      },
      {
        id: fixtureId("entry", 3),
        lemma: "soru",
        pronunciation: "/ˈso.ru/",
        tags: ["adj"],
        definitions: [definition(3, "bright")],
        etymology: { sources: [], description: "" },
        notes: "",
        morphologyMode: "auto",
        morphologyGroups: [],
      },
      {
        id: fixtureId("entry", 4),
        lemma: "kasa",
        pronunciation: "",
        tags: ["n", "irregular"],
        definitions: [definition(4, "house")],
        etymology: { sources: [], description: "" },
        notes: "",
        morphologyMode: "auto",
        morphologyGroups: [{
          templateGroupId: nounGroupId,
          title: "Irregular noun paradigm",
          notes: "The accusative is suppletive in this entry.",
          overrides: {
            [nounCasesTableId]: { "0,1": "kasi" },
          },
        }],
      },
      {
        id: fixtureId("entry", 5),
        lemma: "panu",
        pronunciation: "",
        tags: ["n"],
        definitions: [definition(5, "hand-configured lexical item")],
        etymology: { sources: [], description: "" },
        notes: "",
        morphologyMode: "manual",
        morphologyGroups: [
          {
            templateGroupId: adjectiveGroupId,
            title: "Borrowed degree forms",
            notes: "A manual group can ignore the entry's part of speech.",
            overrides: {},
          },
          {
            templateGroupId: nounGroupId,
            title: "",
            notes: "",
            overrides: {
              [nounPluralTableId]: { "0,1": "panusi" },
            },
          },
        ],
      },
      {
        id: fixtureId("entry", 6),
        lemma: "none",
        pronunciation: "",
        tags: ["n"],
        definitions: [definition(6, "manual morphology intentionally absent")],
        etymology: { sources: [], description: "" },
        notes: "",
        morphologyMode: "manual",
        morphologyGroups: [],
      },
      {
        id: fixtureId("entry", 7),
        lemma: "empty",
        pronunciation: "",
        tags: [],
        definitions: [definition(7, "")],
        etymology: { sources: [], description: "" },
        notes: "",
        morphologyMode: "auto",
        morphologyGroups: [],
      },
    ].map((entry) => ({ ...entry, createdAt: CREATED_AT, updatedAt: CREATED_AT })),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function usage() {
  return "Usage: node scripts/generate-morphology-test-dictionary.js --data-dir <empty-directory>";
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") {
      args.help = true;
    } else if (item === "--data-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--data-dir requires a path");
      }
      args.dataDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

async function assertEmptyDirectory(dataDir) {
  try {
    const entries = await fs.readdir(dataDir);
    if (entries.length) {
      throw new Error("Target data directory must be empty or not exist");
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function writeMorphologyTestData(dataDir) {
  const target = path.resolve(dataDir);
  await assertEmptyDirectory(target);
  const dictionary = buildMorphologyTestDictionary();
  await fs.mkdir(path.join(target, "dictionaries"), { recursive: true });
  await fs.writeFile(
    path.join(target, "index.json"),
    `${JSON.stringify({ activeDictionaryId: dictionary.id, dictionaryIds: [dictionary.id], uiLanguage: "zh", uiTheme: "light" }, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(target, "dictionaries", `${dictionary.id}.json`),
    `${JSON.stringify(dictionary, null, 2)}\n`,
    "utf8",
  );
  return { dataDir: target, dictionary };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.dataDir) {
    throw new Error(`${usage()}\n\nMissing --data-dir`);
  }
  const { dataDir, dictionary } = await writeMorphologyTestData(args.dataDir);
  console.log(`Created morphology test dictionary \"${dictionary.name}\" with ${dictionary.entries.length} entries in ${dataDir}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  DICTIONARY_ID,
  buildMorphologyTestDictionary,
  writeMorphologyTestData,
};
