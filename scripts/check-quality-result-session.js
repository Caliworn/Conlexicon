const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createApiRouter } = require("../lib/api-routes");
const { normalizeDictionary } = require("../lib/dictionary-model");
const qualityModel = require("../lib/quality-model");
const {
  QualityQueryValidationError,
  normalizeQualityLocationQuery,
  normalizeQualityQuery,
} = require("../lib/quality-query-model");
const { QualityResultService } = require("../lib/quality-result-service");
const {
  createTempSqliteRepository,
  requireSqliteRuntime,
} = require("./sqlite-check-utils");

const SOURCE = { type: "dictionaryQuality", version: 1, options: {} };
const DICTIONARY_ID = "dict-quality-result-session";

function completeEntry(id, options = {}) {
  return {
    id,
    lemma: options.lemma ?? id,
    pronunciation: options.pronunciation ?? "/a/",
    tags: options.tags ?? ["n"],
    definitions: options.definitions ?? [{ id: `def-${id}`, meaning: "meaning", example: "" }],
    etymology: { sources: options.sources ?? [] },
  };
}

function qualityDictionary() {
  return normalizeDictionary({
    id: DICTIONARY_ID,
    name: "Quality result session",
    entries: [
      {
        id: "entry-empty",
        lemma: "",
        pronunciation: "",
        tags: [],
        definitions: [],
      },
      completeEntry("entry-duplicate-a", { lemma: "Same" }),
      completeEntry("entry-duplicate-b", { lemma: "same" }),
      completeEntry("entry-mixed", {
        lemma: "mixed",
        pronunciation: "/ˈaˈb/",
        tags: ["x".repeat(25)],
        definitions: [{ id: "def-mixed", meaning: "meaning", example: "\\gla a b\n\\glb A B" }],
        sources: [{ entryId: "", text: "missing-root" }],
      }),
      completeEntry("entry-gloss-mismatch", {
        definitions: [{
          id: "def-gloss-mismatch",
          meaning: "meaning",
          example: "\\gla a b\n\\glb A\n\\ft test",
        }],
      }),
      completeEntry("entry-near-tag-a", { tags: ["proper noun"] }),
      completeEntry("entry-near-tag-b", { tags: ["proper-noun"] }),
      completeEntry("cycle-a", { sources: [{ entryId: "cycle-b", text: "cycle-b" }] }),
      completeEntry("cycle-b", { sources: [{ entryId: "cycle-a", text: "cycle-a" }] }),
      completeEntry("cycle-upstream", { sources: [{ entryId: "cycle-a", text: "cycle-a" }] }),
      completeEntry("entry-clean"),
    ],
  });
}

function stableProjection(issues) {
  return issues.map(({ code, severity, module, entryId, params }) => ({ code, severity, module, entryId, params }));
}

function issueRequest(selector = { group: "all" }, page = { limit: 200 }) {
  return { source: SOURCE, responseMode: "items", view: { itemKind: "issue", selector }, page };
}

function entryRequest(selector = { group: "all" }, options = {}) {
  return {
    source: SOURCE,
    responseMode: "items",
    view: {
      itemKind: "entry",
      selector,
      search: options.search || { text: "", fields: ["lemma"], fuzzyFields: [] },
      sort: options.sort || "lemmaAsc",
    },
    page: options.page || { limit: 200 },
  };
}

async function assertApiError(promise, status, code, label) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status, label);
    assert.equal(error.code, code, label);
    return true;
  });
}

function assertValidationCode(callback, code) {
  assert.throws(callback, (error) => error instanceof QualityQueryValidationError && error.code === code, code);
}

async function callApi(repository, service, urlPath, body) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  request.method = "POST";
  let statusCode = 0;
  let payload = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      payload = value || "";
    },
  };
  const handled = await createApiRouter({ repository, qualityResultService: service })(
    request,
    response,
    new URL(urlPath, "http://localhost"),
  );
  return { handled, statusCode, raw: payload, body: JSON.parse(payload) };
}

function checkQueryModel() {
  assert.deepEqual(normalizeQualityQuery({ source: SOURCE, responseMode: "summary" }), {
    source: SOURCE,
    responseMode: "summary",
  });
  assertValidationCode(() => normalizeQualityQuery({ source: { type: "other", version: 1 } }), "unsupported_quality_source");
  assertValidationCode(() => normalizeQualityQuery({ source: { ...SOURCE, version: 2 } }), "invalid_quality_source_version");
  assertValidationCode(
    () => normalizeQualityQuery({ source: { ...SOURCE, options: { locale: "en" } } }),
    "invalid_quality_source_options",
  );
  assertValidationCode(
    () => normalizeQualityQuery({ source: SOURCE, responseMode: "summary", view: {} }),
    "invalid_quality_summary_request",
  );
  assertValidationCode(() => normalizeQualityQuery({ source: SOURCE, view: { itemKind: "tag" } }), "invalid_quality_item_kind");
  assertValidationCode(
    () => normalizeQualityQuery(issueRequest({ group: "all", value: "high" })),
    "invalid_quality_selector",
  );
  assertValidationCode(() => normalizeQualityQuery(issueRequest({ group: "severity", value: "urgent" })), "invalid_quality_selector");
  assertValidationCode(() => normalizeQualityQuery(issueRequest({ group: "module", value: "high" })), "invalid_quality_selector");
  assertValidationCode(
    () => normalizeQualityQuery({ ...issueRequest(), view: { itemKind: "issue", sort: "lemmaAsc" } }),
    "invalid_quality_issue_view",
  );
  assertValidationCode(
    () => normalizeQualityLocationQuery({ ...issueRequest(), entryId: "entry-empty" }),
    "invalid_quality_item_kind",
  );
  assertValidationCode(() => normalizeQualityLocationQuery(entryRequest()), "invalid_quality_location_entry_id");
  assert.deepEqual(normalizeQualityQuery(issueRequest()).view, { itemKind: "issue", selector: { group: "all" } });
}

async function checkService(repository) {
  const dictionary = qualityDictionary();
  await repository.importDictionarySnapshot(dictionary);
  const report = qualityModel.buildQualityReport(await repository.getDictionarySnapshot(DICTIONARY_ID));

  // The service reads only the minimal quality input, never a full snapshot.
  const counts = { input: 0, context: 0 };
  const originalInput = repository.qualityInputRecords.bind(repository);
  const originalContext = repository.dictionaryQueryContext.bind(repository);
  repository.qualityInputRecords = (id) => {
    counts.input += 1;
    return originalInput(id);
  };
  repository.dictionaryQueryContext = (id) => {
    counts.context += 1;
    return originalContext(id);
  };
  repository.exportDictionarySnapshot = () => assert.fail("quality results must not read the dictionary snapshot");
  repository.getDictionarySnapshot = () => assert.fail("quality results must not read the dictionary snapshot");

  const service = new QualityResultService({ repository });
  const summary = await service.query(DICTIONARY_ID, { source: SOURCE, responseMode: "summary" });
  assert.equal(summary.diagnostics.cache, "miss");
  assert.equal(counts.context, 0, "summary requests must not load the dictionary query context");
  assert.deepEqual(summary.summary, report.summary);
  assert.equal(summary.rulesetVersion, 1);
  assert.equal(Object.hasOwn(summary, "items"), false);

  const allIssues = await service.query(DICTIONARY_ID, issueRequest());
  assert.equal(allIssues.diagnostics.cache, "hit");
  assert.deepEqual(stableProjection(allIssues.items.map((item) => item.issue)), stableProjection(report.issues));
  const issueIds = allIssues.items.map((item) => item.issue.id);
  assert.equal(new Set(issueIds).size, issueIds.length, "issue ids are unique within one result");
  assert.deepEqual(
    Object.keys(allIssues.items[0].issue).sort(),
    ["code", "entryId", "id", "module", "params", "severity"],
    "issue DTOs carry only stable fields",
  );
  const globalItem = allIssues.items.find((item) => item.issue.code === "near_duplicate_tags");
  assert.equal(globalItem.entry, null);
  assert.equal(allIssues.items.find((item) => item.issue.entryId === "entry-mixed").entry.lemma, "mixed");
  assert.deepEqual(
    allIssues.items.find((item) => item.issue.code === "source_cycle" && item.issue.entryId === "cycle-upstream").issue.params,
    { cycleEntryIds: ["cycle-a", "cycle-b", "cycle-a"], cycleLemmas: ["cycle-a", "cycle-b", "cycle-a"] },
  );

  const repeated = await new QualityResultService({ repository }).query(DICTIONARY_ID, issueRequest());
  assert.deepEqual(repeated.items.map((item) => item.issue.id), issueIds, "issue ids are deterministic");

  const highIssues = await service.query(DICTIONARY_ID, issueRequest({ group: "severity", value: "high" }));
  assert.equal(highIssues.pageInfo.total, report.summary.severities.find((row) => row.key === "high").issueCount);
  assert.equal(highIssues.items.every((item) => item.issue.severity === "high"), true);

  // Entry windows count unique affected entries, include members of global
  // issues and attach only issues matching the selector.
  const tagEntries = await service.query(DICTIONARY_ID, entryRequest({ group: "module", value: "tags" }));
  assert.equal(tagEntries.pageInfo.total, report.summary.modules.find((row) => row.key === "tags").entryCount);
  const nearTagEntry = tagEntries.items.find((item) => item.entry.id === "entry-near-tag-a");
  assert.deepEqual(nearTagEntry.issues.map((issue) => issue.code), ["near_duplicate_tags"]);
  assert.equal(tagEntries.items.every((item) => item.issues.every((issue) => issue.module === "tags")), true);
  const allEntries = await service.query(DICTIONARY_ID, entryRequest());
  assert.equal(allEntries.pageInfo.total, report.summary.affectedEntryCount);
  assert.equal(allEntries.items.some((item) => item.entry.id === "entry-clean"), false);
  const descendingEntries = await service.query(DICTIONARY_ID, entryRequest({ group: "all" }, { sort: "lemmaDesc" }));
  assert.equal(allEntries.items[0].entry.id, "entry-empty");
  assert.equal(descendingEntries.items.at(-1).entry.id, "entry-empty", "entry windows apply the requested sort");
  const searched = await service.query(DICTIONARY_ID, entryRequest({ group: "all" }, {
    search: { text: "cycle", fields: ["lemma"], fuzzyFields: [] },
  }));
  assert.deepEqual(searched.items.map((item) => item.entry.id).sort(), ["cycle-a", "cycle-b", "cycle-upstream"]);
  assert.ok(searched.searchSummary);

  const firstPage = await service.query(DICTIONARY_ID, issueRequest({ group: "all" }, { limit: 2 }));
  assert.equal(firstPage.items.length, 2);
  assert.equal(firstPage.pageInfo.hasMore, true);
  const secondPage = await service.query(DICTIONARY_ID, issueRequest({ group: "all" }, { limit: 2, cursor: firstPage.pageInfo.nextCursor }));
  assert.deepEqual(secondPage.items.map((item) => item.issue.id), issueIds.slice(2, 4));
  await assertApiError(
    service.query(DICTIONARY_ID, issueRequest({ group: "severity", value: "low" }, { limit: 2, cursor: firstPage.pageInfo.nextCursor })),
    409,
    "query_cursor_stale",
    "cursors are bound to their view",
  );

  const located = await service.location(DICTIONARY_ID, {
    ...entryRequest({ group: "all" }, { page: { limit: 2 } }),
    entryId: "cycle-upstream",
  });
  assert.equal(located.location.found, true);
  assert.equal(located.items.some((item) => item.entry.id === "cycle-upstream"), true);
  assert.equal(located.location.windowOffset % 2, 0);
  const missing = await service.location(DICTIONARY_ID, { ...entryRequest(), entryId: "entry-clean" });
  assert.equal(missing.location.found, false);
  assert.deepEqual(missing.items, []);

  assert.equal(counts.input, 2, "every view of one generation shares one rule run (the second build is the fresh service)");

  // Saves invalidate the session and its cursors; the next request rebuilds.
  await repository.patchEntries(DICTIONARY_ID, [{ id: "entry-mixed", patch: { pronunciation: "/ˈab/" } }]);
  await assertApiError(
    service.query(DICTIONARY_ID, issueRequest({ group: "all" }, { limit: 2, cursor: firstPage.pageInfo.nextCursor })),
    409,
    "query_cursor_stale",
    "cursors from an older generation are stale",
  );
  const rebuilt = await service.query(DICTIONARY_ID, { source: SOURCE, responseMode: "summary" });
  assert.equal(counts.input, 3, "the first request after a save rebuilds the session once");
  assert.notEqual(rebuilt.generation, summary.generation);
  assert.equal(rebuilt.summary.issueCount, report.summary.issueCount - 1);

  const api = await callApi(repository, service, `/api/dictionaries/${DICTIONARY_ID}/quality/query`, entryRequest({ group: "module", value: "tags" }));
  assert.equal(api.handled, true);
  assert.equal(api.statusCode, 200);
  assert.equal(api.raw.includes("relatedEntryIds"), false, "HTTP responses do not carry related entry ID arrays");
  const apiLocation = await callApi(repository, service, `/api/dictionaries/${DICTIONARY_ID}/quality/location`, {
    ...entryRequest(),
    entryId: "entry-empty",
  });
  assert.equal(apiLocation.body.location.found, true);
  await assertApiError(
    service.query(DICTIONARY_ID, issueRequest({ group: "module", value: "network" }, { limit: 0 })),
    400,
    "invalid_entry_query_limit",
    "page limits are validated at the boundary",
  );
  await assertApiError(
    service.query("dict-quality-missing", { source: SOURCE, responseMode: "summary" }),
    404,
    "dictionary_not_found",
    "unknown dictionaries are rejected before any database is opened",
  );
}

async function main() {
  requireSqliteRuntime("quality result session check");
  checkQueryModel();
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-quality-result-");
  try {
    await checkService(repository);
  } finally {
    await cleanup();
  }
  console.log("Quality result session checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
