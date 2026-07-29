#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { ENTRY_SEARCH_FIELD_KEYS } = require("../lib/entry-search-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { sqliteRepositoryOptions } = require("./sqlite-check-utils");

const ENTRY_PAGE_SIZE = 200;
const ROOT_GROUP_PAGE_SIZE = 100;
const STATIC_SEARCH_FIELDS = ENTRY_SEARCH_FIELD_KEYS.filter((field) => field !== "morphology");

function usage() {
  return [
    "Usage: node scripts/benchmark-query-session-cache.js --data <sqlite-data-dir> [--id <dictionary-id>] [--query <text>] [--strict-query <text>] [--morphology-query <text>] [--lemma-query <text>] [--runs <count>]",
    "",
    "Measures cold session builds and repeated product-sized entry/root-group windows without modifying dictionary data.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    query: "bdy",
    strictQuery: "body",
    morphologyQuery: "qna",
    lemmaQuery: "ta",
    runs: 5,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (["--data", "--id", "--query", "--strict-query", "--morphology-query", "--lemma-query", "--runs"].includes(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`);
      }
      const optionKey = token.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      options[optionKey] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  options.runs = Math.max(1, Number.parseInt(options.runs, 10) || 5);
  return options;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function rounded(value) {
  return Number(value.toFixed(2));
}

function metricDelta(after, before, key) {
  return Number(after[key] || 0) - Number(before[key] || 0);
}

async function measureScenario(repository, dictionaryId, scenario, runs) {
  repository.invalidateQuerySessions(dictionaryId);
  const before = repository.querySessionCacheStats();
  const coldStart = performance.now();
  const coldResult = await scenario.run();
  const coldMs = performance.now() - coldStart;
  const hotSamples = [];
  let lastResult = coldResult;
  for (let run = 0; run < runs; run += 1) {
    const hotStart = performance.now();
    lastResult = await scenario.run();
    hotSamples.push(performance.now() - hotStart);
  }
  const after = repository.querySessionCacheStats();
  return {
    key: scenario.key,
    ...(scenario.fields ? {
      query: scenario.query,
      fields: scenario.fields,
      fuzzyFields: scenario.fuzzyFields,
    } : {}),
    coldMs: rounded(coldMs),
    hotMinMs: rounded(Math.min(...hotSamples)),
    hotMedianMs: rounded(percentile(hotSamples, 0.5)),
    hotMaxMs: rounded(Math.max(...hotSamples)),
    total: Number(lastResult.pageInfo?.total || 0),
    returned: Array.isArray(lastResult.items) ? lastResult.items.length : 0,
    cache: {
      hits: metricDelta(after, before, "hits"),
      misses: metricDelta(after, before, "misses"),
      builds: metricDelta(after, before, "builds"),
      buildMs: rounded(metricDelta(after, before, "buildMs")),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.data) {
    throw new Error(usage());
  }
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    throw new Error("SQLite runtime is unavailable");
  }

  const dataDir = path.resolve(options.data);
  const index = JSON.parse(await fs.readFile(path.join(dataDir, "index.json"), "utf8"));
  const dictionaryId = options.id || index.activeDictionaryId;
  if (!dictionaryId) {
    throw new Error("No dictionary ID was supplied and the data index has no active dictionary.");
  }
  const repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(dataDir));
  try {
    const entryScenario = (key, query, fields, fuzzyFields) => ({
      key,
      query,
      fields,
      fuzzyFields,
      run: () => repository.queryEntries(dictionaryId, {
        q: query,
        fields: fields.join(","),
        fuzzyFields: fuzzyFields.join(","),
        limit: ENTRY_PAGE_SIZE,
      }),
    });
    const scenarios = [
      entryScenario("entries-all-fields-fuzzy", options.query, ENTRY_SEARCH_FIELD_KEYS, ENTRY_SEARCH_FIELD_KEYS),
      entryScenario("entries-static-fields-fuzzy", options.query, STATIC_SEARCH_FIELDS, STATIC_SEARCH_FIELDS),
      entryScenario("entries-morphology-fuzzy", options.morphologyQuery, ["morphology"], ["morphology"]),
      entryScenario("entries-static-fields-strict", options.strictQuery, STATIC_SEARCH_FIELDS, []),
      entryScenario("entries-lemma-strict", options.lemmaQuery, ["lemma"], []),
      {
        key: "root-groups-no-search",
        run: () => repository.queryRootGroups(dictionaryId, {
          limit: ROOT_GROUP_PAGE_SIZE,
        }),
      },
      {
        key: "root-groups-fuzzy-search",
        run: () => repository.queryRootGroups(dictionaryId, {
          q: options.query,
          fields: ENTRY_SEARCH_FIELD_KEYS.join(","),
          fuzzyFields: ENTRY_SEARCH_FIELD_KEYS.join(","),
          limit: ROOT_GROUP_PAGE_SIZE,
        }),
      },
    ];
    const results = [];
    for (const scenario of scenarios) {
      results.push(await measureScenario(repository, dictionaryId, scenario, options.runs));
    }
    console.log(JSON.stringify({
      dictionaryId,
      entryCount: (await repository.getDictionaryMeta(dictionaryId)).summary.entryCount,
      queries: {
        fuzzy: options.query,
        strict: options.strictQuery,
        morphology: options.morphologyQuery,
        lemma: options.lemmaQuery,
      },
      hotRuns: options.runs,
      windows: {
        entries: ENTRY_PAGE_SIZE,
        rootGroups: ROOT_GROUP_PAGE_SIZE,
      },
      results,
    }, null, 2));
  } finally {
    repository.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
