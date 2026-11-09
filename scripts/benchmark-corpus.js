#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { CorpusQualityService } = require("../lib/corpus-quality-service");
const { ENTRY_SEARCH_FIELD_KEYS } = require("../lib/entry-search-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { DICTIONARY_ID, generateStressDictionary } = require("./generate-stress-dictionary");
const { requireSqliteRuntime, sqliteRepositoryOptions } = require("./sqlite-check-utils");

const PAGE_SIZE = 100;
const ITEMS_PER_GROUP = 250;
const BIG_GROUP = "Big text";
const BIG_GROUP_SHARE = 0.2;

function usage() {
  return [
    "Usage: node scripts/benchmark-corpus.js [--corpus <count>[,<count>...]] [--entries <count>] [--runs <count>]",
    "",
    "Server-side corpus timings: group overview, list windows, search, saves, and the entry and",
    "corpus quality queries rebuilt after a save. Each size is generated in a fresh temporary",
    "directory (the stress dictionary plus grouped, unlinked gloss items) and deleted afterwards.",
    "Defaults: --corpus 10000 --entries 10000 --runs 9.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { corpus: [10000], entries: 10000, runs: 9 };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!["--corpus", "--entries", "--runs"].includes(token)) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value`);
    }
    index += 1;
    const numbers = value.split(",").map((part) => Number.parseInt(part.trim(), 10));
    if (!numbers.every((number) => Number.isSafeInteger(number) && number > 0)) {
      throw new Error(`${token} needs positive integers`);
    }
    if (token === "--corpus") {
      options.corpus = numbers;
    } else {
      options[token.slice(2)] = numbers[0];
    }
  }
  return options;
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

// Three-level glosses of 4 to 11 words, one in seven with a name. The first
// fifth of the added items forms one big group; the rest fill groups of 250.
function addCorpusItems(repository, total) {
  const db = repository.openDictionaryDatabase(DICTIONARY_ID);
  const existing = db.prepare("SELECT COUNT(*) AS count FROM corpus_items").get().count;
  if (existing > total) {
    throw new Error(`The stress dictionary already has ${existing} corpus items; ask for at least that many`);
  }
  const random = seededRandom(12345);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const syllables = ["ka", "lo", "mi", "ten", "sur", "vas", "qe", "rau", "nim", "po", "šal", "tre", "ul", "zo"];
  const glosses = ["1SG", "2SG", "3SG", "PL", "NOM", "ACC", "GEN", "PST", "FUT", "NEG", "go", "see", "house", "water", "big", "and", "say", "give"];
  const word = () => Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(syllables)).join("");
  const content = () => {
    const words = Array.from({ length: 4 + Math.floor(random() * 8) }, word);
    const items = words.map(() => (random() < 0.4 ? `${pick(glosses)}-${pick(glosses)}` : pick(glosses)));
    return [
      `\\gla ${words.join(" ")} //`,
      `\\glb ${items.join(" ")} //`,
      `\\glft ‘${items.slice(0, 4).join(" ").toLowerCase()} …’ //`,
    ].join("\n");
  };
  const bigGroupSize = Math.round(total * BIG_GROUP_SHARE);
  const normalizeSearchText = repository.corpusSearchNormalizer(DICTIONARY_ID);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let added = 0; existing + added < total; added += 1) {
      const group = added < bigGroupSize
        ? BIG_GROUP
        : `Text ${String(Math.floor((added - bigGroupSize) / ITEMS_PER_GROUP) + 1).padStart(3, "0")}`;
      repository.insertCorpusItem(db, {
        id: `corpus-item-${crypto.randomUUID()}`,
        name: random() < 0.15 ? `Sentence ${added + 1}` : "",
        group,
        content: content(),
        createdAt: now,
        updatedAt: now,
      }, normalizeSearchText);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return existing;
}

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

function rounded(value) {
  return Number(value.toFixed(2));
}

// One warm-up call, then `runs` timed calls; the callback gets the run index
// so saves can write a different value each time.
async function timed(runs, callback) {
  await callback(-1);
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    await callback(run);
    samples.push(performance.now() - startedAt);
  }
  return { medianMs: rounded(median(samples)), maxMs: rounded(Math.max(...samples)) };
}

async function benchmarkSize(total, options) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), `conlexicon-corpus-benchmark-${total}-`));
  let repository = null;
  try {
    await generateStressDictionary({ dataDir, entryCount: options.entries });
    repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(dataDir));
    const linkedItems = addCorpusItems(repository, total);
    const id = DICTIONARY_ID;
    const db = repository.openDictionaryDatabase(id);
    const countIn = (group) => db.prepare("SELECT COUNT(*) AS count FROM corpus_items WHERE group_name = ?").get(group).count;
    const bigGroupCount = countIn(BIG_GROUP);
    const ungroupedCount = countIn("");
    const unlinked = db.prepare("SELECT id, content FROM corpus_items WHERE group_name = 'Text 001' LIMIT 1").get();
    const linked = db.prepare("SELECT ci.id, ci.content FROM corpus_items ci JOIN definition_examples de ON de.item_id = ci.id LIMIT 1").get();
    const run = (callback) => timed(options.runs, callback);
    const page = (query) => () => repository.queryCorpusItems(id, { limit: PAGE_SIZE, ...query });
    const search = async (q) => ({
      matches: (await repository.queryCorpusItems(id, { q, limit: 1 })).pageInfo.total,
      ...(await run(page({ q, offset: 0 }))),
    });

    const read = {
      groups: await run(() => repository.getCorpusGroups(id)),
      firstPageOfGroup: await run(page({ group: "Text 001", offset: 0 })),
      firstPageOfBigGroup: await run(page({ group: BIG_GROUP, offset: 0 })),
      lastPageOfBigGroup: await run(page({ group: BIG_GROUP, offset: Math.max(0, bigGroupCount - PAGE_SIZE) })),
      lastPageOfUngrouped: await run(page({ group: "", offset: Math.max(0, ungroupedCount - PAGE_SIZE) })),
      itemLocation: await run(() => repository.getCorpusItem(id, unlinked.id)),
    };
    const searches = {
      common: await search("house"),
      rare: await search("Sentence 777"),
      none: await search("zzzzq"),
    };
    const writes = {
      unlinkedName: await run((index) => repository.saveCorpusItem(id, unlinked.id, { name: `n${index}`, group: "Text 001", content: unlinked.content })),
      unlinkedContent: await run((index) => repository.saveCorpusItem(id, unlinked.id, { name: "", group: "Text 001", content: `${unlinked.content} x${index}` })),
      linkedContent: await run((index) => repository.saveCorpusItem(id, linked.id, { name: "", group: "", content: `${linked.content} x${index}` })),
      create: await run(() => repository.createCorpusItem(id, { name: "", group: "Text 001", content: "" })),
    };

    // Every corpus save drops the dictionary's query sessions, so the next
    // entry query or corpus quality read rebuilds them ("afterSave"); "kept"
    // is the same call while the session is still cached.
    const quality = new CorpusQualityService({ repository });
    const fields = ENTRY_SEARCH_FIELD_KEYS.join(",");
    const afterSave = async (callback) => ({
      afterSaveMs: (await run(async () => {
        repository.invalidateQuerySessions(id);
        await callback();
      })).medianMs,
      keptMs: (await run(callback)).medianMs,
    });
    const rebuiltAfterSave = {
      entryList: await afterSave(() => repository.queryEntries(id, { fields, limit: 200 })),
      entrySearch: await afterSave(() => repository.queryEntries(id, { q: "ka", fields, fuzzyFields: fields, limit: 200 })),
      rootGroups: await afterSave(() => repository.queryRootGroups(id, { limit: 100 })),
      corpusQuality: await afterSave(() => quality.query(id, { source: { type: "corpusQuality", version: 1 }, responseMode: "summary" })),
    };
    return {
      corpusItems: total,
      linkedItems,
      bigGroup: bigGroupCount,
      ungrouped: ungroupedCount,
      groups: db.prepare("SELECT COUNT(DISTINCT group_name) AS count FROM corpus_items").get().count,
      read,
      searches,
      writes,
      rebuiltAfterSave,
    };
  } finally {
    repository?.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  requireSqliteRuntime("the corpus benchmark");
  const results = [];
  for (const total of options.corpus) {
    results.push(await benchmarkSize(total, options));
  }
  console.log(JSON.stringify({ entries: options.entries, runs: options.runs, pageSize: PAGE_SIZE, results }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
