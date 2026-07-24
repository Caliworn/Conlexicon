const { performance } = require("node:perf_hooks");
const { AnalysisFeatureService } = require("../lib/analysis-feature-service");
const { normalizeDictionary } = require("../lib/dictionary-model");
const ipaModel = require("../lib/ipa-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const {
  createTempSqliteRepository,
  sqliteRuntimeUnavailableMessage,
} = require("./sqlite-check-utils");

const SOURCE = {
  type: "ipaAutoCompare",
  version: 1,
  options: {},
};

function benchmarkSizes() {
  const source = process.env.CONLEXICON_FEATURE_BENCHMARK_SIZES || "10000,30000";
  return [...new Set(source.split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isSafeInteger(value) && value > 0))];
}

function request(category, searchText = "") {
  return {
    source: SOURCE,
    view: {
      category,
      search: {
        text: searchText,
        fields: ["lemma", "pronunciation"],
        fuzzyFields: [],
      },
      sort: "lemmaAsc",
    },
    page: { limit: 200 },
  };
}

function benchmarkDictionary(size) {
  return normalizeDictionary({
    id: `dict-feature-benchmark-${size}`,
    name: `Feature benchmark ${size}`,
    language: "Benchmark",
    entries: Array.from({ length: size }, (_, index) => {
      const lemma = `tata${String(index).padStart(6, "0")}`;
      const generated = ipaModel.generateIpaFromLemma(lemma);
      return {
        id: `entry-feature-benchmark-${index}`,
        lemma,
        pronunciation: index % 10 === 0 ? `${generated.slice(0, -1)}x/` : generated,
      };
    }),
  });
}

async function measure(label, callback) {
  const startedAt = performance.now();
  const result = await callback();
  return {
    label,
    elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    total: result.pageInfo.total,
    cache: result.diagnostics.cache,
    viewCache: result.diagnostics.viewCache,
  };
}

async function benchmarkSize(size) {
  const { repository, cleanup } = await createTempSqliteRepository(`conlexicon-feature-benchmark-${size}-`);
  try {
    const dictionary = benchmarkDictionary(size);
    const importStartedAt = performance.now();
    await repository.importDictionarySnapshot(dictionary);
    const importMs = performance.now() - importStartedAt;
    const service = new AnalysisFeatureService({ repository });
    const rows = [
      await measure("cold strict", () => service.query(dictionary.id, request("strictMismatch"))),
      await measure("warm strict", () => service.query(dictionary.id, request("strictMismatch"))),
      await measure("category switch", () => service.query(dictionary.id, request("looseMismatch"))),
      await measure("search view", () => service.query(dictionary.id, request("strictMismatch", "999"))),
    ];
    console.log(JSON.stringify({
      size,
      importMs: Number(importMs.toFixed(1)),
      rows,
      cache: service.sessionCache.stats(),
    }, null, 2));
  } finally {
    repository.close();
    await cleanup();
  }
}

async function main() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log(sqliteRuntimeUnavailableMessage("feature result session benchmark"));
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
