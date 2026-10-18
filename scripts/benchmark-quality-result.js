const { monitorEventLoopDelay, performance } = require("node:perf_hooks");
const { normalizeDictionary } = require("../lib/dictionary-model");
const { QualityResultService } = require("../lib/quality-result-service");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const {
  createTempSqliteRepository,
  sqliteRuntimeUnavailableMessage,
} = require("./sqlite-check-utils");

const SOURCE = { type: "dictionaryQuality", version: 1, options: {} };
const COLD_RUNS = 5;

function benchmarkSizes() {
  const source = process.env.CONLEXICON_QUALITY_BENCHMARK_SIZES || "10000,30000";
  return [...new Set(source.split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isSafeInteger(value) && value > 0))];
}

// Every entry cites up to two earlier entries (shared acyclic ancestry, the
// shape that made the old per-entry cycle search exponential); a small ring
// and a fraction of empty fields, glosses and unresolved sources give every
// rule some work.
function benchmarkDictionary(size) {
  const id = (index) => `entry-quality-benchmark-${index}`;
  return normalizeDictionary({
    id: `dict-quality-benchmark-${size}`,
    name: `Quality benchmark ${size}`,
    entries: Array.from({ length: size }, (_, index) => {
      const sources = [index - 1, index - 7]
        .filter((source) => source >= 0)
        .map((source) => ({ entryId: id(source), text: `lemma${source}` }));
      if (index < 3) {
        sources.push({ entryId: id((index + 1) % 3), text: `lemma${(index + 1) % 3}` });
      }
      if (index % 50 === 0) {
        sources.push({ entryId: "", text: `missing${index}` });
      }
      return {
        id: id(index),
        lemma: index % 400 === 0 ? `lemma${index - 1}` : `lemma${index}`,
        pronunciation: index % 9 === 0 ? "" : index % 31 === 0 ? "/ˈaˈta/" : "/ˈata/",
        tags: index % 13 === 0 ? [] : [index % 2 ? "noun" : "proper-noun", index % 3 ? "common" : "proper noun"],
        definitions: [{
          id: `def-quality-benchmark-${index}`,
          meaning: index % 17 === 0 ? "" : `meaning ${index}`,
          example: index % 11 === 0 ? "\\gla a b\n\\glb A" : "",
        }],
        etymology: { sources: index < 3 ? sources.slice(-1) : sources },
      };
    }),
  });
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function timed(callback) {
  const startedAt = performance.now();
  const result = await callback();
  return { elapsedMs: performance.now() - startedAt, result };
}

async function benchmarkSize(size) {
  const { repository, cleanup } = await createTempSqliteRepository(`conlexicon-quality-benchmark-${size}-`);
  try {
    const dictionary = benchmarkDictionary(size);
    await repository.importDictionarySnapshot(dictionary);
    const coldMs = [];
    const delay = monitorEventLoopDelay({ resolution: 10 });
    let summary = null;
    delay.enable();
    for (let run = 0; run < COLD_RUNS; run += 1) {
      const service = new QualityResultService({ repository });
      const cold = await timed(() => service.query(dictionary.id, { source: SOURCE, responseMode: "summary" }));
      coldMs.push(cold.elapsedMs);
      summary = cold.result.summary;
    }
    delay.disable();
    const service = new QualityResultService({ repository });
    await service.query(dictionary.id, { source: SOURCE, responseMode: "summary" });
    const views = [
      ["issue window all", { itemKind: "issue", selector: { group: "all" } }],
      ["issue window network", { itemKind: "issue", selector: { group: "module", value: "network" } }],
      ["entry window high", { itemKind: "entry", selector: { group: "severity", value: "high" }, sort: "lemmaAsc" }],
      ["entry window search", {
        itemKind: "entry",
        selector: { group: "all" },
        search: { text: "lemma99", fields: ["lemma"], fuzzyFields: [] },
        sort: "lemmaAsc",
      }],
    ];
    const rows = [];
    for (const [label, view] of views) {
      const { elapsedMs, result } = await timed(() => service.query(dictionary.id, {
        source: SOURCE,
        responseMode: "items",
        view,
        page: { limit: 200 },
      }));
      rows.push({ label, elapsedMs: Number(elapsedMs.toFixed(1)), total: result.pageInfo.total, cache: result.diagnostics.cache });
    }
    console.log(JSON.stringify({
      size,
      issueCount: summary.issueCount,
      affectedEntryCount: summary.affectedEntryCount,
      coldSummaryMs: {
        p50: Number(percentile(coldMs, 0.5).toFixed(1)),
        p95: Number(percentile(coldMs, 0.95).toFixed(1)),
      },
      coldEventLoopDelayMs: {
        p99: Number((delay.percentile(99) / 1e6).toFixed(1)),
        max: Number((delay.max / 1e6).toFixed(1)),
      },
      rows,
      cache: service.sessionCache.stats(),
    }, null, 2));
  } finally {
    await cleanup();
  }
}

async function main() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log(sqliteRuntimeUnavailableMessage("quality result benchmark"));
    return;
  }
  for (const size of benchmarkSizes()) {
    await benchmarkSize(size);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
