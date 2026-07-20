const assert = require("node:assert/strict");
const { QueryPageCache } = require("../lib/query-page-cache");

async function checkLruAndCapacity() {
  const cache = new QueryPageCache({ maxEntries: 2, maxBytes: 100, estimateBytes: (value) => value.bytes });
  assert.equal(cache.set("a", { bytes: 20 }, { dictionaryId: "dict-a" }), true);
  assert.equal(cache.set("b", { bytes: 20 }, { dictionaryId: "dict-b" }), true);
  assert.equal(cache.get("a").bytes, 20, "reading an item should refresh its LRU position");
  cache.set("c", { bytes: 20 }, { dictionaryId: "dict-c" });
  assert.equal(cache.get("b"), undefined, "the least recently used item should be evicted");
  assert.equal(cache.set("oversized", { bytes: 101 }, { dictionaryId: "dict-a" }), false);
  assert.equal(cache.get("oversized"), undefined, "an oversized item must not enter the cache");
}

async function checkInFlightCoalescing() {
  const cache = new QueryPageCache();
  let loadCount = 0;
  let resolveLoad;
  const loader = () => {
    loadCount += 1;
    return new Promise((resolve) => {
      resolveLoad = resolve;
    });
  };
  const first = cache.load({ key: "entries-a", dictionaryId: "dict-a", load: loader });
  const second = cache.load({ key: "entries-a", dictionaryId: "dict-a", load: loader });
  await Promise.resolve();
  assert.equal(loadCount, 1, "identical in-flight queries should share one loader call");
  resolveLoad({ ids: ["entry-a"] });
  assert.deepEqual(await first, { ids: ["entry-a"] });
  assert.deepEqual(await second, { ids: ["entry-a"] });
  assert.deepEqual(cache.get("entries-a"), { ids: ["entry-a"] });
}

async function checkDictionaryInvalidation() {
  const cache = new QueryPageCache();
  cache.set("dict-a-page", { ids: ["entry-a"] }, { dictionaryId: "dict-a" });
  cache.set("dict-b-page", { ids: ["entry-b"] }, { dictionaryId: "dict-b" });
  cache.invalidateDictionary("dict-a");
  assert.equal(cache.get("dict-a-page"), undefined);
  assert.deepEqual(cache.get("dict-b-page"), { ids: ["entry-b"] });

  let resolveOldLoad;
  const oldLoad = cache.load({
    key: "dict-a-pending",
    dictionaryId: "dict-a",
    load: () => new Promise((resolve) => {
      resolveOldLoad = resolve;
    }),
  });
  await Promise.resolve();
  cache.invalidateDictionary("dict-a");
  const freshLoad = cache.load({
    key: "dict-a-pending",
    dictionaryId: "dict-a",
    load: () => Promise.resolve({ ids: ["fresh-entry"] }),
  });
  resolveOldLoad({ ids: ["stale-entry"] });
  assert.deepEqual(await oldLoad, { ids: ["stale-entry"] }, "the original caller still receives its response");
  assert.deepEqual(await freshLoad, { ids: ["fresh-entry"] });
  assert.deepEqual(
    cache.get("dict-a-pending"),
    { ids: ["fresh-entry"] },
    "an old response must not overwrite a newer generation",
  );
}

async function checkFailureIsNotCached() {
  const cache = new QueryPageCache();
  let attempts = 0;
  const load = () => {
    attempts += 1;
    return Promise.reject(new Error("expected failure"));
  };
  await assert.rejects(cache.load({ key: "failure", dictionaryId: "dict-a", load }));
  await assert.rejects(cache.load({ key: "failure", dictionaryId: "dict-a", load }));
  assert.equal(attempts, 2, "failed requests must not remain cached or in flight");
}

async function main() {
  await checkLruAndCapacity();
  await checkInFlightCoalescing();
  await checkDictionaryInvalidation();
  await checkFailureIsNotCached();
  console.log("Query page cache checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
