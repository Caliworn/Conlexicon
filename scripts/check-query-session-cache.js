const assert = require("node:assert/strict");

const { normalizeDictionary } = require("../lib/dictionary-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const {
  QuerySessionCache,
  createQueryDescriptor,
  queryDescriptorKey,
} = require("../lib/query-session-cache");
const {
  createTempSqliteRepository,
  sampleSqliteDictionary,
  sqliteRepositoryOptions,
  sqliteRuntimeUnavailableMessage,
} = require("./sqlite-check-utils");

function checkDescriptorIdentity() {
  const first = createQueryDescriptor({
    kind: "entries",
    dictionaryId: "dict-a",
    dictionaryUpdatedAt: "2026-07-16T00:00:00.000Z",
    cacheGeneration: 3,
    query: {
      q: "root",
      part: "n",
      tags: ["root", "n", "root"],
      tagMode: "all",
      sort: "lemmaAsc",
      searchFields: new Set(["tags", "lemma"]),
      fuzzyFields: new Set(["lemma"]),
      limit: 10,
      offset: 0,
      include: "summary",
    },
  });
  const second = createQueryDescriptor({
    kind: "entries",
    dictionaryId: "dict-a",
    dictionaryUpdatedAt: "2026-07-16T00:00:00.000Z",
    cacheGeneration: 3,
    query: {
      q: "root",
      part: "n",
      tags: ["n", "root"],
      tagMode: "all",
      sort: "lemmaAsc",
      searchFields: new Set(["lemma", "tags"]),
      fuzzyFields: new Set(["lemma"]),
      limit: 500,
      offset: 100,
      include: "full",
    },
  });
  assert.equal(queryDescriptorKey(first), queryDescriptorKey(second));
  assert.notEqual(
    queryDescriptorKey(first),
    queryDescriptorKey(createQueryDescriptor({
      kind: "entries",
      dictionaryId: "dict-a",
      dictionaryUpdatedAt: "2026-07-16T00:00:00.000Z",
      cacheGeneration: 3,
      query: { ...second, fuzzyFields: new Set(["lemma", "tags"]) },
    })),
  );

  const noSearchRootA = createQueryDescriptor({
    kind: "rootGroups",
    dictionaryId: "dict-a",
    query: { searchFields: new Set(["lemma"]), fuzzyFields: new Set(["lemma"]) },
  });
  const noSearchRootB = createQueryDescriptor({
    kind: "rootGroups",
    dictionaryId: "dict-a",
    query: { searchFields: new Set(["morphology"]), fuzzyFields: new Set() },
  });
  assert.equal(queryDescriptorKey(noSearchRootA), queryDescriptorKey(noSearchRootB));
}

async function checkCacheLifecycle() {
  let now = 1000;
  const cache = new QuerySessionCache({
    maxSessionsPerDictionary: 2,
    maxBytes: 2000,
    idleTtlMs: 100,
    now: () => now,
    estimateBytes: (session) => session.bytes || 100,
  });
  let builds = 0;
  let resolveFirst;
  const first = cache.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-a",
    query: { q: "a" },
    build: () => {
      builds += 1;
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    },
  });
  const duplicate = cache.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-a",
    query: { q: "a" },
    build: () => {
      builds += 1;
      return { orderedIds: [] };
    },
  });
  await Promise.resolve();
  assert.equal(builds, 1);
  resolveFirst({ orderedIds: ["entry-a"] });
  assert.deepEqual((await first).orderedIds, ["entry-a"]);
  assert.deepEqual((await duplicate).orderedIds, ["entry-a"]);
  assert.equal(cache.stats().inFlightHits, 1);

  await cache.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-a",
    query: { q: "b" },
    build: () => ({ orderedIds: ["entry-b"] }),
  });
  await cache.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-a",
    query: { q: "c" },
    build: () => ({ orderedIds: ["entry-c"] }),
  });
  assert.equal(cache.stats().sessionCount, 2);
  assert.equal(cache.stats().evictions, 1);

  now += 101;
  assert.equal(cache.stats().sessionCount, 0, "idle sessions should expire without affecting correctness");

  const beforeInvalidation = cache.generation("dict-a");
  cache.invalidateDictionary("dict-a");
  assert.equal(cache.generation("dict-a"), beforeInvalidation + 1);

  let resolveStale;
  const stale = cache.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-a",
    query: { q: "generation" },
    build: () => new Promise((resolve) => {
      resolveStale = resolve;
    }),
  });
  await Promise.resolve();
  cache.invalidateDictionary("dict-a");
  const fresh = cache.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-a",
    query: { q: "generation" },
    build: () => ({ orderedIds: ["fresh"] }),
  });
  resolveStale({ orderedIds: ["stale"] });
  await stale;
  await fresh;
  const repeatedFresh = await cache.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-a",
    query: { q: "generation" },
    build: () => ({ orderedIds: ["unexpected"] }),
  });
  assert.deepEqual(repeatedFresh.orderedIds, ["fresh"], "an invalidated build must not overwrite a newer generation");

  let attempts = 0;
  const failingLoad = () => {
    attempts += 1;
    return Promise.reject(new Error("expected failure"));
  };
  await assert.rejects(cache.getOrCreate({ kind: "entries", dictionaryId: "dict-b", query: { q: "x" }, build: failingLoad }));
  await assert.rejects(cache.getOrCreate({ kind: "entries", dictionaryId: "dict-b", query: { q: "x" }, build: failingLoad }));
  assert.equal(attempts, 2, "failed builds must not remain cached or in flight");

  const oversized = new QuerySessionCache({ maxBytes: 50, estimateBytes: () => 51 });
  await oversized.getOrCreate({
    kind: "entries",
    dictionaryId: "dict-large",
    query: { q: "large" },
    build: () => ({ orderedIds: ["entry-large"] }),
  });
  assert.equal(oversized.stats().sessionCount, 0);
  assert.equal(oversized.stats().oversized, 1);
}

async function checkRepositoryIntegration() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log(sqliteRuntimeUnavailableMessage("query-session cache integration check"));
    return;
  }
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-query-session-");
  try {
    const dictionary = normalizeDictionary({
      ...sampleSqliteDictionary(),
      id: "dict-query-session",
      entries: [
        ...sampleSqliteDictionary().entries,
        {
          id: "entry-route",
          lemma: "route",
          tags: ["n"],
          definitions: [{ id: "def-route", meaning: "a way" }],
        },
        ...Array.from({ length: 205 }, (_, index) => ({
          id: `entry-derived-window-${index}`,
          lemma: `derived-window-${String(index).padStart(3, "0")}`,
          tags: ["v"],
          definitions: [{ id: `def-derived-window-${index}`, meaning: `derived window ${index}` }],
          etymology: { sources: ["root"], description: "cursor window fixture" },
        })),
      ],
    });
    await repository.importDictionarySnapshot(dictionary);

    let fuzzyBuilds = 0;
    const originalFuzzyBuilder = repository.buildFuzzyEntryQuerySession.bind(repository);
    repository.buildFuzzyEntryQuerySession = (...args) => {
      fuzzyBuilds += 1;
      return originalFuzzyBuilder(...args);
    };
    const fuzzyQuery = {
      q: "rt",
      fields: "lemma",
      fuzzyFields: "lemma",
      sort: "lemmaAsc",
      include: "summary",
      limit: 1,
    };
    const fuzzyFirst = await repository.queryEntries(dictionary.id, fuzzyQuery);
    const fuzzySecond = await repository.queryEntries(dictionary.id, { ...fuzzyQuery, limit: 10, include: "full" });
    assert.equal(fuzzyBuilds, 1, "repeated fuzzy queries should reuse one ordered ID session");
    assert.deepEqual(
      fuzzyFirst.items.map((entry) => entry.id),
      fuzzySecond.items.slice(0, fuzzyFirst.items.length).map((entry) => entry.id),
    );
    assert.ok(fuzzyFirst.pageInfo.nextCursor, "the first fuzzy page should expose a versioned cursor");
    const fuzzyNext = await repository.queryEntries(dictionary.id, {
      ...fuzzyQuery,
      cursor: fuzzyFirst.pageInfo.nextCursor,
    });
    assert.notDeepEqual(
      fuzzyNext.items.map((entry) => entry.id),
      fuzzyFirst.items.map((entry) => entry.id),
      "a valid cursor should continue from its bound offset",
    );
    const fuzzyFirstWindow = await repository.queryEntries(dictionary.id, {
      ...fuzzyQuery,
      cursor: fuzzyFirst.pageInfo.nextCursor,
      windowOffset: 0,
    });
    assert.deepEqual(
      fuzzyFirstWindow.items.map((entry) => entry.id),
      fuzzyFirst.items.map((entry) => entry.id),
      "a validated cursor should permit direct access to another result window",
    );
    await assert.rejects(
      () => repository.queryEntries(dictionary.id, {
        ...fuzzyQuery,
        windowOffset: 1,
      }),
      (error) => error?.code === "query_cursor_required",
      "a non-zero window offset must be bound to a versioned cursor",
    );
    await assert.rejects(
      () => repository.queryEntries(dictionary.id, {
        ...fuzzyQuery,
        cursor: fuzzyFirst.pageInfo.nextCursor,
        windowOffset: "not-an-offset",
      }),
      (error) => error?.code === "invalid_query_window_offset",
      "window offsets must be non-negative safe integers",
    );
    await assert.rejects(
      () => repository.queryEntries(dictionary.id, {
        ...fuzzyQuery,
        fields: "definitions",
        cursor: fuzzyFirst.pageInfo.nextCursor,
      }),
      (error) => error?.code === "query_cursor_stale" && error?.details?.reason === "descriptor",
      "a cursor must not be reused with a different query descriptor",
    );
    const otherProcessRepository = new SqliteDictionaryRepository({
      ...sqliteRepositoryOptions(repository.dataDir),
      queryProcessEpoch: "other-process-epoch",
    });
    try {
      await assert.rejects(
        () => otherProcessRepository.queryEntries(dictionary.id, {
          ...fuzzyQuery,
          cursor: fuzzyFirst.pageInfo.nextCursor,
        }),
        (error) => error?.code === "query_cursor_stale" && error?.details?.reason === "process_epoch",
        "a cursor must not survive a repository process epoch change",
      );
    } finally {
      otherProcessRepository.close();
    }

    let rootBuilds = 0;
    const originalRootBuilder = repository.rootGroupsFromDatabase.bind(repository);
    repository.rootGroupsFromDatabase = (...args) => {
      rootBuilds += 1;
      return originalRootBuilder(...args);
    };
    const rootFirst = await repository.queryRootGroups(dictionary.id, {
      fields: "lemma,tags",
      fuzzyFields: "lemma,tags",
      limit: 1,
      include: "summary",
    });
    const rootSecond = await repository.queryRootGroups(dictionary.id, {
      fields: "morphology",
      limit: 10,
      include: "full",
    });
    assert.equal(rootBuilds, 1, "no-search root groups should ignore inactive search options and reuse the session");
    assert.deepEqual(
      rootFirst.items.map((group) => group.root.id),
      rootSecond.items.slice(0, rootFirst.items.length).map((group) => group.root.id),
    );
    assert.equal(
      rootFirst.pageInfo.windowMetrics.reduce((total, metric) => total + metric.groupCount, 0),
      rootFirst.pageInfo.total,
      "the first root-group window should describe every parent window",
    );
    assert.ok(
      rootFirst.pageInfo.windowMetrics.reduce((total, metric) => total + metric.derivedCount, 0) >= 206,
      "root-group window metrics should include derived-entry counts",
    );
    assert.ok(rootFirst.pageInfo.nextCursor, "the first root-group page should expose a versioned cursor");
    const rootFirstWindow = await repository.queryRootGroups(dictionary.id, {
      cursor: rootFirst.pageInfo.nextCursor,
      windowOffset: 0,
      limit: 1,
    });
    assert.deepEqual(
      rootFirstWindow.items.map((group) => group.root.id),
      rootFirst.items.map((group) => group.root.id),
      "root-group windows should support direct access after cursor validation",
    );
    assert.ok(rootFirstWindow.pageInfo.windowMetrics.length > 0, "offset zero should retain root-group window metrics");
    const derivedWholeGroup = await repository.queryRootGroupEntries(dictionary.id, "entry-root");
    assert.equal(derivedWholeGroup.items.length, 206, "the product UI should be able to read a realistic root group at once");
    assert.equal("pageInfo" in derivedWholeGroup, false, "derived groups should not expose a pagination contract");
    [...repository.querySessionCache.sessions.entries()]
      .filter(([, session]) => session.kind === "rootGroups")
      .forEach(([key]) => repository.querySessionCache.remove(key));
    const rebuiltRootNext = await repository.queryRootGroups(dictionary.id, {
      cursor: rootFirst.pageInfo.nextCursor,
      limit: 1,
    });
    assert.deepEqual(
      rebuiltRootNext.items.map((group) => group.root.id),
      rootSecond.items.slice(1, 2).map((group) => group.root.id),
      "an evicted query session should rebuild behind a still-valid cursor",
    );

    const beforeSearchRoot = repository.querySessionCacheStats();
    await repository.queryRootGroups(dictionary.id, {
      q: "rt",
      fields: "lemma",
      fuzzyFields: "lemma",
      limit: 10,
    });
    await repository.queryRootGroups(dictionary.id, {
      q: "rt",
      fields: "lemma",
      fuzzyFields: "lemma",
      limit: 1,
    });
    const afterSearchRoot = repository.querySessionCacheStats();
    assert.equal(afterSearchRoot.builds, beforeSearchRoot.builds + 1);
    assert.equal(afterSearchRoot.hits, beforeSearchRoot.hits + 1);

    const generationBeforeNoOp = repository.querySessionCache.generation(dictionary.id);
    await repository.patchEntries(dictionary.id, [], {});
    assert.equal(repository.querySessionCache.generation(dictionary.id), generationBeforeNoOp);
    await repository.queryEntries(dictionary.id, fuzzyQuery);
    assert.equal(fuzzyBuilds, 1, "a no-op patch must not invalidate sessions");

    await assert.rejects(() => repository.deleteEntry(dictionary.id, "entry-missing"));
    assert.equal(repository.querySessionCache.generation(dictionary.id), generationBeforeNoOp);

    const rootEntry = await repository.getEntry(dictionary.id, "entry-root");
    await repository.saveEntry(dictionary.id, { ...rootEntry, notes: "updated" });
    assert.equal(repository.querySessionCache.generation(dictionary.id), generationBeforeNoOp + 1);
    await assert.rejects(
      () => repository.queryEntries(dictionary.id, {
        ...fuzzyQuery,
        cursor: fuzzyFirst.pageInfo.nextCursor,
      }),
      (error) => error?.code === "query_cursor_stale" && error?.details?.reason === "cache_generation",
      "a successful write must invalidate cursors from the previous generation",
    );
    await repository.queryEntries(dictionary.id, fuzzyQuery);
    assert.equal(fuzzyBuilds, 2, "a successful write must rebuild the fuzzy session");

    repository.invalidateQuerySessions(dictionary.id);
    const rebuilt = await repository.queryEntries(dictionary.id, fuzzyQuery);
    assert.deepEqual(
      rebuilt.items.map((entry) => entry.id),
      fuzzyFirst.items.map((entry) => entry.id),
      "cache eviction and rebuild must preserve result order",
    );
  } finally {
    await cleanup();
  }
}

async function main() {
  checkDescriptorIdentity();
  await checkCacheLifecycle();
  await checkRepositoryIntegration();
  console.log("Query session cache checks passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
