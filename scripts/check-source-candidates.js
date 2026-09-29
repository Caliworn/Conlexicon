#!/usr/bin/env node
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const { createApiRouter } = require("../lib/api-routes");
const { normalizeDictionary } = require("../lib/dictionary-model");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");

const DICTIONARY_ID = "dict-source-candidates";

function candidateDictionary() {
  const entry = (id, lemma, tags = [], meanings = [], pronunciation = "") => ({
    id,
    lemma,
    pronunciation,
    tags,
    definitions: meanings.map((meaning, index) => ({ id: `${id}-def-${index}`, meaning })),
  });
  return normalizeDictionary({
    id: DICTIONARY_ID,
    name: "Source Candidates",
    settings: { partOfSpeechTags: ["n", "v"] },
    entries: [
      entry("tala-v", "tala", ["v"], ["to fell"]),
      entry("tala-n", "tala", ["n", "plant"], ["tree", "timber"], "ˈta.la"),
      entry("talan", "talan", ["n"], ["forest"]),
      entry("xtala", "xtala", ["n"], ["axe"]),
      entry("fuzzy-only", "txaxlxa", ["n"], ["scattered"]),
      entry("upper", "TALA", ["n"], ["shout"]),
      entry("owner", "talaowner", ["n"], ["owner"]),
      entry("miss", "kasa", ["n"], ["house"]),
      ...Array.from({ length: 60 }, (_, index) => entry(`bulk-${String(index).padStart(2, "0")}`, `bulk${index}`)),
    ],
  });
}

async function candidatesWithoutSnapshot(repository, body, dictionaryId = DICTIONARY_ID) {
  const original = repository.exportDictionarySnapshot;
  repository.exportDictionarySnapshot = () => {
    throw new Error("Source candidates must not read a full dictionary snapshot.");
  };
  try {
    return await repository.querySourceCandidates(dictionaryId, body);
  } finally {
    repository.exportDictionarySnapshot = original;
  }
}

async function lemmaSearchIds(repository, q, fuzzy) {
  const result = await repository.queryEntries(DICTIONARY_ID, {
    q,
    fields: "lemma",
    ...(fuzzy ? { fuzzyFields: "lemma" } : {}),
    limit: 200,
  });
  return result.items;
}

async function assertMatchesLemmaSearch(repository, q, fuzzy, exclude = []) {
  const candidates = await candidatesWithoutSnapshot(repository, { q, excludeEntryIds: exclude });
  const listed = (await lemmaSearchIds(repository, q, fuzzy)).filter((entry) => !exclude.includes(entry.id));
  assert.deepEqual(
    candidates.items.map((item) => item.id).sort(),
    listed.map((entry) => entry.id).sort().slice(0, candidates.limit),
    `candidates for "${q}" (fuzzy ${fuzzy}) must equal the lemma-only /entries result`,
  );
  assert.equal(candidates.total, listed.length, `total for "${q}" must count every lemma match`);
  const listedById = new Map(listed.map((entry) => [entry.id, entry]));
  candidates.items.forEach((item) => {
    const { searchHits: _searchHits, ...summary } = listedById.get(item.id);
    assert.deepEqual(item, summary, "candidate items reuse the entry summary DTO without extra fields");
  });
  return candidates;
}

async function assertApiError(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

async function callRoute(repository, pathname, body) {
  const raw = JSON.stringify(body);
  const request = Readable.from([Buffer.from(raw)]);
  request.headers = { "content-length": String(Buffer.byteLength(raw)) };
  request.method = "POST";
  let statusCode = 0;
  let responseBody = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      responseBody = value || "";
    },
  };
  const handled = await createApiRouter({ repository })(request, response, new URL(pathname, "http://localhost"));
  return { handled, statusCode, body: JSON.parse(responseBody) };
}

async function main() {
  requireSqliteRuntime("source candidate query");
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-source-candidates-");
  try {
    const dictionary = candidateDictionary();
    await repository.importDictionarySnapshot(dictionary);

    const ranked = await assertMatchesLemmaSearch(repository, "tala", true);
    assert.deepEqual(
      ranked.items.map((item) => item.id),
      ["tala-n", "tala-v", "talan", "owner", "xtala", "fuzzy-only"],
      "candidates follow the shared ranking tiers, with homographs kept apart",
    );
    assert.deepEqual(ranked.items[0].parts, ["n"]);
    assert.equal(ranked.items[0].pronunciation, "ˈta.la");
    assert.deepEqual(ranked.items[0].definitionPreviews.map((definition) => definition.meaning), ["tree", "timber"]);

    await assertMatchesLemmaSearch(repository, "ta", true);
    await assertMatchesLemmaSearch(repository, "la", true, ["tala-n", "unknown-id"]);

    const owned = await candidatesWithoutSnapshot(repository, {
      q: "tala",
      ownerEntryId: "owner",
      excludeEntryIds: ["tala-v", "unknown-id"],
    });
    assert.deepEqual(
      owned.items.map((item) => item.id),
      ["tala-n", "talan", "xtala", "fuzzy-only"],
      "the owner and draft-selected targets are excluded; unknown excluded IDs are ignored",
    );
    assert.equal(owned.total, 4);

    const bulk = await candidatesWithoutSnapshot(repository, { q: "bulk" });
    assert.equal(bulk.items.length, 50, "the default limit caps returned candidates");
    assert.equal(bulk.total, 60, "total still counts every match beyond the limit");
    assert.equal(bulk.limit, 50);
    assert.equal((await candidatesWithoutSnapshot(repository, { q: "bulk", limit: 5 })).items.length, 5);

    assert.deepEqual(
      await candidatesWithoutSnapshot(repository, { q: "   " }),
      { items: [], total: 0, limit: 50 },
      "blank queries never enumerate the dictionary",
    );

    await repository.updateSettings(DICTIONARY_ID, {
      ...dictionary.settings,
      search: { ...dictionary.settings.search, etymologyAutocomplete: { fuzzy: false } },
    });
    const strict = await assertMatchesLemmaSearch(repository, "tala", false);
    assert.equal(strict.items.some((item) => item.id === "fuzzy-only"), false,
      "turning off autocomplete fuzzy drops subsequence-only matches");
    assert.equal(strict.items.some((item) => item.id === "xtala"), true,
      "strict autocomplete keeps the shared contains semantics");

    await repository.updateSettings(DICTIONARY_ID, {
      ...dictionary.settings,
      search: {
        ...dictionary.settings.search,
        etymologyAutocomplete: { fuzzy: true },
        normalization: { caseFolding: true },
      },
    });
    const folded = await assertMatchesLemmaSearch(repository, "TALA", true);
    assert.equal(folded.items.some((item) => item.id === "upper"), true,
      "the dictionary's saved normalization applies to candidates and the projection alike");

    await assertApiError(candidatesWithoutSnapshot(repository, { q: "tala", ownerEntryId: "missing" }),
      404, "entry_not_found");
    await assertApiError(repository.querySourceCandidates("dict-missing", { q: "tala" }), 404, "dictionary_not_found");
    for (const body of [
      null,
      [],
      {},
      { q: 3 },
      { q: "tala", ownerEntryId: 3 },
      { q: "tala", excludeEntryIds: "tala-n" },
      { q: "tala", excludeEntryIds: [3] },
      { q: "tala", limit: 0 },
      { q: "tala", limit: 51 },
      { q: "tala", limit: "5" },
    ]) {
      await assertApiError(repository.querySourceCandidates(DICTIONARY_ID, body), 400, "invalid_source_candidate_query");
    }

    const routed = await callRoute(repository, `/api/dictionaries/${DICTIONARY_ID}/source-candidates/query`, {
      q: "tala",
      limit: 2,
    });
    assert.equal(routed.handled, true);
    assert.equal(routed.statusCode, 200);
    assert.deepEqual(routed.body.items.map((item) => item.id), ["tala-n", "tala-v"]);
    assert.equal(routed.body.limit, 2);

    console.log("Source candidate query checks passed.");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
