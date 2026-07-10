const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DICTIONARY_DIR = path.join(DATA_DIR, "dictionaries");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

const DICTIONARY_ID = "dict-7a4f7f2b-71dd-4c9f-8d3f-7bb391000000";
const LEGACY_DICTIONARY_IDS = ["stress-test-10k"];
const ENTRY_COUNT = 10000;
const CREATED_AT = "2026-07-01T00:00:00.000Z";

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(0xC0DEC0DE);

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

function buildDictionary() {
  const usedLemmas = new Set();
  const lemmas = [];
  const entries = [];

  for (let index = 1; index <= ENTRY_COUNT; index += 1) {
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
      morphologyGroups: [],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    entries.push(entry);
  }

  return {
    id: DICTIONARY_ID,
    name: "Stress Test 10k",
    language: "Synthetic",
    description: "Deterministic 10,000-entry dictionary for UI stress testing.",
    settings: {
      manualPartOfSpeechTags: true,
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
      sourceFuzzyCompletion: true,
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
      content: "",
      updatedAt: CREATED_AT,
    },
    corpus: {
      texts: [],
    },
    morphology: {
      functions: {},
      templateGroups: [],
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    entries,
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function updateIndex() {
  const index = readJson(INDEX_PATH, { activeDictionaryId: DICTIONARY_ID, dictionaryIds: [] });
  const dictionaryIds = Array.isArray(index.dictionaryIds)
    ? index.dictionaryIds.filter((id) => !LEGACY_DICTIONARY_IDS.includes(id))
    : [];
  if (!dictionaryIds.includes(DICTIONARY_ID)) {
    dictionaryIds.push(DICTIONARY_ID);
  }
  if (!index.activeDictionaryId || LEGACY_DICTIONARY_IDS.includes(index.activeDictionaryId)) {
    index.activeDictionaryId = DICTIONARY_ID;
  }
  index.dictionaryIds = dictionaryIds;
  writeJson(INDEX_PATH, index);
  return index;
}

function removeLegacyGeneratedFiles() {
  LEGACY_DICTIONARY_IDS.forEach((id) => {
    const filePath = path.join(DICTIONARY_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  });
}

function main() {
  const dictionary = buildDictionary();
  const dictionaryPath = path.join(DICTIONARY_DIR, `${DICTIONARY_ID}.json`);
  removeLegacyGeneratedFiles();
  writeJson(dictionaryPath, dictionary);
  const index = updateIndex();

  console.log(`Created ${dictionary.entries.length} entries in ${path.relative(ROOT, dictionaryPath)}`);
  console.log(`Registered dictionary id "${DICTIONARY_ID}" in ${path.relative(ROOT, INDEX_PATH)}`);
  console.log(`Active dictionary remains "${index.activeDictionaryId}"`);
}

main();
