#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { ENTRY_SEARCH_FIELD_KEYS } = require("../lib/entry-search-model");
const { createTempSqliteRepository } = require("./sqlite-check-utils");

const STATIC_SEARCH_FIELDS = ENTRY_SEARCH_FIELD_KEYS.filter((field) => field !== "morphology");

function usage() {
  return [
    "Usage: node scripts/benchmark-entry-search.js --from <json-data-dir> --id <dictionary-id> [--query <text>] [--runs <count>]",
    "",
    "Imports the named JSON dictionary into a temporary SQLite repository, then measures entry-query search modes.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { runs: 5, query: "body" };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (["--from", "--id", "--query", "--runs"].includes(token)) {
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

function scenarioRequest(query, scenario) {
  return {
    q: query,
    fields: scenario.fields.join(","),
    fuzzyFields: scenario.fuzzyFields.join(","),
    include: "summary",
    limit: 10000,
  };
}

async function measureScenarios(repository, dictionaryId, query, scenarios, runs) {
  const state = new Map(scenarios.map((scenario) => [scenario.key, {
    scenario,
    request: scenarioRequest(query, scenario),
    samples: [],
    total: 0,
  }]));
  for (const item of state.values()) {
    const result = await repository.queryEntries(dictionaryId, item.request);
    item.total = result.pageInfo.total;
  }
  for (let run = 0; run < runs; run += 1) {
    const ordered = [...scenarios];
    const offset = run % ordered.length;
    ordered.push(...ordered.splice(0, offset));
    for (const scenario of ordered) {
      const item = state.get(scenario.key);
      const start = performance.now();
      const result = await repository.queryEntries(dictionaryId, item.request);
      item.samples.push(performance.now() - start);
      item.total = result.pageInfo.total;
    }
  }
  return [...state.values()].map(({ scenario, samples, total }) => ({
    key: scenario.key,
    fields: scenario.fields,
    fuzzyFields: scenario.fuzzyFields,
    total,
    minMs: Number(Math.min(...samples).toFixed(2)),
    medianMs: Number(percentile(samples, 0.5).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
  }));
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.from || !options.id) {
    throw new Error(usage());
  }
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    throw new Error("SQLite runtime is unavailable");
  }

  const sourcePath = path.join(path.resolve(options.from), "dictionaries", `${options.id}.json`);
  const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const context = await createTempSqliteRepository("conlexicon-search-benchmark-");
  try {
    await context.repository.importDictionarySnapshot(source, { overwrite: true });
    const scenarios = [
      { key: "all-fields-fuzzy", fields: ENTRY_SEARCH_FIELD_KEYS, fuzzyFields: ENTRY_SEARCH_FIELD_KEYS },
      { key: "static-fields-fuzzy", fields: STATIC_SEARCH_FIELDS, fuzzyFields: STATIC_SEARCH_FIELDS },
      { key: "static-fields-strict", fields: STATIC_SEARCH_FIELDS, fuzzyFields: [] },
      { key: "lemma-strict", fields: ["lemma"], fuzzyFields: [] },
    ];
    const results = await measureScenarios(context.repository, source.id, options.query, scenarios, options.runs);
    console.log(JSON.stringify({
      dictionaryId: source.id,
      entries: source.entries?.length || 0,
      query: options.query,
      runs: options.runs,
      results,
    }, null, 2));
  } finally {
    await context.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
