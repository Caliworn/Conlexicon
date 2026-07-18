#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { ENTRY_SEARCH_FIELD_KEYS } = require("../lib/entry-search-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { sqliteRepositoryOptions } = require("./sqlite-check-utils");

function usage() {
  return [
    "Usage: node scripts/benchmark-query-session-cache.js --data <sqlite-data-dir> [--id <dictionary-id>] [--query <text>] [--runs <count>]",
    "",
    "Measures cold and repeated hot fuzzy-entry/root-group queries without modifying dictionary data.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { query: "bdy", runs: 5 };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (["--data", "--id", "--query", "--runs"].includes(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`);
      }
      options[token.slice(2)] = value;
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
    const allFields = ENTRY_SEARCH_FIELD_KEYS.join(",");
    const scenarios = [
      {
        key: "entries-fuzzy-limit-10000",
        run: () => repository.queryEntries(dictionaryId, {
          q: options.query,
          fields: allFields,
          fuzzyFields: allFields,
          limit: 10000,
        }),
      },
      {
        key: "entries-fuzzy-limit-100",
        run: () => repository.queryEntries(dictionaryId, {
          q: options.query,
          fields: allFields,
          fuzzyFields: allFields,
          limit: 100,
        }),
      },
      {
        key: "root-groups-no-search",
        run: () => repository.queryRootGroups(dictionaryId, {
          limit: 2000,
        }),
      },
      {
        key: "root-groups-fuzzy-search",
        run: () => repository.queryRootGroups(dictionaryId, {
          q: options.query,
          fields: allFields,
          fuzzyFields: allFields,
          limit: 2000,
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
      query: options.query,
      hotRuns: options.runs,
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
