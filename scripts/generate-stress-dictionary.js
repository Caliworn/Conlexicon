#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");

const ROOT = path.resolve(__dirname, "..");
const REAL_DATA_DIR = path.join(ROOT, "data");
const DICTIONARY_ID = "dict-7a4f7f2b-71dd-4c9f-8d3f-7bb391000000";
const DEFAULT_ENTRY_COUNT = 10000;
const CREATED_AT = "2026-07-01T00:00:00.000Z";

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let random = mulberry32(0xC0DEC0DE);

function pick(items) {
  return items[Math.floor(random() * items.length)];
}

function chance(probability) {
  return random() < probability;
}

function deterministicId(prefix, group, index) {
  const groupHex = group.toString(16).padStart(4, "0").slice(-4);
  const indexHex = index.toString(16).padStart(12, "0").slice(-12);
  return `${prefix}-7a4f7f2b-${groupHex}-4c9f-8d3f-${indexHex}`;
}

const onsets = ["", "p", "t", "k", "m", "n", "s", "l", "r", "w", "y", "q", "f", "š", "č", "x"];
const clusters = ["", "pr", "tr", "kr", "pl", "kl", "st", "sk", "mn", "sl", "fr"];
const vowels = ["a", "e", "i", "o", "u", "ə", "ai", "au"];
const codas = ["", "n", "m", "r", "s", "t", "k", "l", "q"];
const partsOfSpeech = ["n", "v", "adj", "adv", "propn", "postp", "clf"];
const lexicalTags = [
  "0-slot nominal root",
  "1-slot nominal root",
  "2-slot nominal root",
  "0-slot verbal root",
  "3-slot verb",
  "derived",
  "compound",
  "name",
  "fieldwork",
  "loan",
  "archaic",
  "review",
];
const semanticDomains = [
  "body",
  "kinship",
  "landscape",
  "water",
  "weather",
  "food",
  "ritual",
  "motion",
  "speech",
  "craft",
  "plant",
  "animal",
  "number",
  "time",
];

function makeLemma(index, used) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const syllables = 1 + Math.floor(random() * 4);
    let lemma = "";
    for (let i = 0; i < syllables; i += 1) {
      lemma += pick(i === 0 ? onsets : clusters) + pick(vowels) + pick(codas);
    }
    if (chance(0.08)) {
      lemma += "-" + pick(["a", "na", "li", "tu", "qa"]);
    }
    if (!used.has(lemma)) {
      used.add(lemma);
      return lemma;
    }
  }

  const fallback = `stress-${index}`;
  used.add(fallback);
  return fallback;
}

function pronounce(lemma) {
  const normalized = lemma
    .replace(/š/g, "ʃ")
    .replace(/č/g, "t͡ʃ")
    .replace(/y/g, "j")
    .replace(/q/g, "ʔ")
    .replace(/-/g, ".");
  const syllables = normalized.match(/[ptkmnslrwqfʃt͡ʃxj]*[aeiouə]+[nmrsʔtkl]*/g) || [normalized];
  if (syllables.length <= 1) {
    return `/${normalized}/`;
  }
  const stressIndex = chance(0.08) ? 0 : Math.max(0, syllables.length - 2);
  const withStress = syllables.map((syllable, index) => `${index === stressIndex ? "ˈ" : ""}${syllable}`);
  return `/${withStress.join(".")}/`;
}

function makeDefinitions(index, lemma, partOfSpeech) {
  const domain = pick(semanticDomains);
  const definitions = [{
    id: deterministicId("def", 1, index),
    meaning: `${domain} ${partOfSpeech} sense for ${lemma}`,
    example: chance(0.36) ? `${lemma} ${pick(["mi", "ta", "lu", "ne"])} ${pick(["kari", "soma", "lentu"])}.` : "",
    note: chance(0.18) ? `Generated note ${index % 97}` : "",
  }];

  if (chance(0.22)) {
    definitions.push({
      id: deterministicId("def", 2, index),
      meaning: `secondary ${pick(semanticDomains)} sense`,
      example: chance(0.28) ? `${pick(["ha", "no", "se"])} ${lemma} ${pick(["var", "tuk", "min"])}.` : "",
      note: chance(0.15) ? "Needs semantic review" : "",
    });
  }

  return definitions;
}

function makeTags(partOfSpeech) {
  const tags = [partOfSpeech, pick(lexicalTags)];
  if (chance(0.32)) tags.push(pick(semanticDomains));
  if (chance(0.16)) tags.push(pick(lexicalTags));
  return Array.from(new Set(tags));
}

function stressMorphologyTemplateGroups() {
  return partsOfSpeech.map((partOfSpeech, index) => {
    const groupId = deterministicId("morph", 8, index + 1);
    const tableId = deterministicId("mtable", 8, index + 1);
    return {
      id: groupId,
      name: `${partOfSpeech} stress paradigm`,
      matchTags: [partOfSpeech],
      notes: "",
      tables: [{
        id: tableId,
        title: "Generated forms",
        rowCount: 3,
        columnCount: 4,
        rowLabels: ["base", "derived", "extended"],
        columnLabels: ["A", "B", "C", "D"],
        cells: {
          "0,0": { sourceText: "{}" },
          "0,1": { sourceText: "{}-na" },
          "0,2": { sourceText: "{}-ta" },
          "0,3": { sourceText: "{}-sa" },
          "1,0": { sourceText: "ma-{}" },
          "1,1": { sourceText: "{}-mi" },
          "1,2": { sourceText: "{}-nu" },
          "1,3": { sourceText: "{}-ka" },
          "2,0": { sourceText: "sa-{}" },
          "2,1": { sourceText: "{}-li" },
          "2,2": { sourceText: "{}-ra" },
          "2,3": { sourceText: "{}-tu" },
        },
      }],
    };
  });
}

function stressMorphologyGroups(index, partOfSpeech) {
  if (index % 29 !== 0) {
    return [];
  }
  const partIndex = partsOfSpeech.indexOf(partOfSpeech) + 1;
  const groupId = deterministicId("morph", 8, partIndex);
  const tableId = deterministicId("mtable", 8, partIndex);
  return [{
    templateGroupId: groupId,
    title: "",
    notes: "",
    overrides: {
      [tableId]: {
        "0,0": `override-${index}`,
      },
    },
  }];
}

function makeSources(index, lemmas) {
  if (index < 8 || !chance(0.2)) {
    return [];
  }
  if (chance(0.08)) {
    return [`unrecorded-source-${Math.floor(index / 37)}`];
  }
  const sources = [lemmas[Math.floor(random() * Math.max(1, index - 1))]];
  if (chance(0.18)) {
    sources.push(lemmas[Math.floor(random() * Math.max(1, index - 1))]);
  }
  return Array.from(new Set(sources.filter(Boolean)));
}

function formatEntryCount(entryCount) {
  return entryCount.toLocaleString("en-US");
}

function buildDictionary(entryCount = DEFAULT_ENTRY_COUNT) {
  entryCount = parseEntryCount(entryCount);
  random = mulberry32(0xC0DEC0DE);
  const usedLemmas = new Set();
  const lemmas = [];
  const entries = [];

  for (let index = 1; index <= entryCount; index += 1) {
    const lemma = makeLemma(index, usedLemmas);
    lemmas.push(lemma);
    const partOfSpeech = pick(partsOfSpeech);
    const entry = {
      id: deterministicId("entry", 1, index),
      lemma,
      pronunciation: chance(0.06) ? "" : pronounce(lemma),
      tags: chance(0.035) ? [] : makeTags(partOfSpeech),
      definitions: chance(0.045) ? [{ id: deterministicId("def", 1, index), meaning: "", example: "", note: "" }] : makeDefinitions(index, lemma, partOfSpeech),
      etymology: {
        sources: makeSources(index, lemmas),
        description: chance(0.12) ? `Synthetic derivation note ${index}` : "",
      },
      notes: chance(0.12) ? `Stress-test entry ${index}; generated with deterministic seed.` : "",
      morphologyMode: "auto",
      morphologyGroups: stressMorphologyGroups(index, partOfSpeech),
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    entries.push(entry);
  }

  return {
    id: DICTIONARY_ID,
    name: `Morphology Stress Test ${formatEntryCount(entryCount)}`,
    language: "Synthetic",
    description: `Deterministic ${formatEntryCount(entryCount)}-entry dictionary with morphology data for UI stress testing.`,
    settings: {
      partOfSpeechTags: partsOfSpeech,
      tagSortOrder: [...partsOfSpeech, ...lexicalTags, ...semanticDomains],
      tagDisplayMap: {
        n: "noun",
        v: "verb",
        adj: "adjective",
        adv: "adverb",
        propn: "proper noun",
        postp: "postposition",
        clf: "classifier",
      },
      redHighlightTags: ["review"],
      search: {
        etymologyAutocomplete: { fuzzy: true },
      },
      searchHighlight: true,
      entryListTagFiltering: true,
      allowEmptyPronunciation: true,
      allowEmptyTags: true,
      allowEmptyDefinitions: true,
      ipa: {
        mappings: [
          { id: deterministicId("ipa", 1, 1), from: "š", to: "ʃ", before: "", after: "" },
          { id: deterministicId("ipa", 1, 2), from: "č", to: "t͡ʃ", before: "", after: "" },
          { id: deterministicId("ipa", 1, 3), from: "y", to: "j", before: "", after: "" },
          { id: deterministicId("ipa", 1, 4), from: "q", to: "ʔ", before: "", after: "" },
        ],
        syllable: {
          vowels: "aeiouə",
          separator: ".",
          onsetClusters: [],
          codaClusters: [],
          complexPhonemes: ["t͡ʃ"],
        },
        defaultStress: -2,
        unstressMonosyllables: true,
      },
      ipaKeyboard: ["ˈ", "ˌ", "ə", "ʃ", "t͡ʃ", "ʔ"],
    },
    docs: {
      markdown: "",
    },
    corpus: {
      blocks: [],
      units: [],
    },
    morphology: {
      functions: {},
      templateGroups: stressMorphologyTemplateGroups(),
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    entries,
  };
}

function usage() {
  return [
    "Usage: node scripts/generate-stress-dictionary.js --data <empty-temp-dir> [--entries <count>]",
    "",
    `Generates a deterministic SQLite stress dictionary with morphology data (${DEFAULT_ENTRY_COUNT} entries by default).`,
    "The explicit target must be empty, initialized without dictionaries, or not exist.",
    "The project's real data directory is never accepted.",
  ].join("\n");
}

function parseEntryCount(value) {
  if (!/^[1-9]\d*$/.test(String(value || ""))) {
    throw new Error("--entries must be a positive integer");
  }
  const entryCount = Number(value);
  if (!Number.isSafeInteger(entryCount)) {
    throw new Error("--entries must be a safe integer");
  }
  return entryCount;
}

function parseArgs(argv) {
  const options = { entries: DEFAULT_ENTRY_COUNT };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--data" || token === "--entries") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`);
      }
      if (token === "--data") {
        options.data = value;
      } else {
        options.entries = parseEntryCount(value);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function isWithinDirectory(parentDirectory, candidatePath) {
  const relative = path.relative(parentDirectory, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertSafeTargetDirectory(dataDir) {
  const target = path.resolve(dataDir);
  if (isWithinDirectory(REAL_DATA_DIR, target)) {
    throw new Error("Target data directory cannot be the project's real data directory");
  }
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const unexpected = entries.filter((entry) => !["index.json", "dictionaries"].includes(entry.name));
    if (unexpected.length) {
      throw new Error("Target data directory must not contain files other than an empty data index");
    }
    const indexEntry = entries.find((entry) => entry.name === "index.json");
    if (indexEntry) {
      if (!indexEntry.isFile()) {
        throw new Error("Target data index must be a regular file");
      }
      const index = JSON.parse(await fs.readFile(path.join(target, "index.json"), "utf8"));
      if (index.activeDictionaryId || (Array.isArray(index.dictionaryIds) && index.dictionaryIds.length)) {
        throw new Error("Target data directory already contains registered dictionaries");
      }
    }
    const dictionariesEntry = entries.find((entry) => entry.name === "dictionaries");
    if (dictionariesEntry) {
      if (!dictionariesEntry.isDirectory()) {
        throw new Error("Target dictionaries path must be a directory");
      }
      if ((await fs.readdir(path.join(target, "dictionaries"))).length) {
        throw new Error("Target data directory already contains dictionary files");
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  return target;
}

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

async function generateStressDictionary({ dataDir, entryCount = DEFAULT_ENTRY_COUNT }) {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    throw new Error("SQLite runtime is unavailable");
  }
  const target = await assertSafeTargetDirectory(dataDir);
  const dictionary = buildDictionary(entryCount);
  const repository = new SqliteDictionaryRepository(repositoryOptions(target));
  try {
    await repository.importDictionary(dictionary);
    return {
      dataDir: target,
      dictionary,
      databasePath: path.join(target, "dictionaries", `${DICTIONARY_ID}.sqlite`),
    };
  } finally {
    repository.close();
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.data) {
    throw new Error(`${usage()}\n\nMissing --data`);
  }
  const result = await generateStressDictionary({
    dataDir: options.data,
    entryCount: options.entries,
  });
  console.log(
    `Created "${result.dictionary.name}" with ${formatEntryCount(result.dictionary.entries.length)} entries in ${result.databasePath}`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ENTRY_COUNT,
  DICTIONARY_ID,
  buildDictionary,
  generateStressDictionary,
  parseArgs,
};
