#!/usr/bin/env node
const assert = require("node:assert/strict");

const { normalizedTextMatches, rankLemmaCandidates } = require("../lib/entry-search-model");

function row(entryId, lemma, normalizedLemma = lemma) {
  return { entryId, lemma, normalizedLemma };
}

function ids(rows) {
  return rows.map((candidate) => candidate.entryId);
}

function main() {
  const rows = [
    row("fuzzy", "txaxlxa"),
    row("contains-late", "xxtala"),
    row("contains-early", "xtala"),
    row("prefix-long", "talaxxxx"),
    row("prefix-short", "talax"),
    row("exact", "tala"),
    row("miss", "kasa"),
  ];

  assert.deepEqual(
    ids(rankLemmaCandidates(rows, "tala", { fuzzy: true })),
    ["exact", "prefix-short", "prefix-long", "contains-early", "contains-late", "fuzzy"],
    "tiers order as exact, prefix, contains, fuzzy; prefixes by length gap and contains by position",
  );
  assert.deepEqual(
    ids(rankLemmaCandidates(rows, "tala", { fuzzy: false })),
    ["exact", "prefix-short", "prefix-long", "contains-early", "contains-late"],
    "strict mode keeps the shared matcher's contains semantics but drops subsequence-only matches",
  );

  const sameIndex = [row("gap-2", "xtalaxx"), row("gap-1", "xtalax")];
  assert.deepEqual(
    ids(rankLemmaCandidates(sameIndex, "tala")),
    ["gap-1", "gap-2"],
    "contains matches at the same position prefer the smaller length gap",
  );

  const fuzzyOnly = [row("scattered", "txxaxxlxxa"), row("tight", "talxa")];
  assert.deepEqual(
    ids(rankLemmaCandidates(fuzzyOnly, "tala", { fuzzy: true })),
    ["tight", "scattered"],
    "fuzzy-tier matches sort by descending shared fuzzy score",
  );

  const homographs = [row("tala-c", "tala"), row("tala-a", "tala"), row("tala-b", "tala")];
  assert.deepEqual(
    ids(rankLemmaCandidates(homographs, "tala")),
    ["tala-a", "tala-b", "tala-c"],
    "homographs stay separate and order by exact entry ID",
  );
  const folded = [row("upper", "Tala", "tala"), row("lower", "tala", "tala")];
  assert.deepEqual(
    ids(rankLemmaCandidates(folded, "tala")),
    ids(rankLemmaCandidates([...folded].reverse(), "tala")),
    "ties on the normalized key resolve by the original lemma, independent of input order",
  );

  const shuffled = [rows[3], rows[0], rows[6], rows[5], rows[1], rows[4], rows[2]];
  assert.deepEqual(
    ids(rankLemmaCandidates(shuffled, "tala", { fuzzy: true })),
    ids(rankLemmaCandidates(rows, "tala", { fuzzy: true })),
    "ranking does not depend on the order rows arrive from SQL",
  );

  const matcherSample = [
    ...rows,
    row("single", "t"),
    row("reordered", "atla"),
    row("unicode", "tála", "tála"),
    row("digits", "ta1la"),
  ];
  for (const query of ["tala", "ta", "la", "tl", "x"]) {
    for (const fuzzy of [false, true]) {
      const expected = matcherSample
        .filter((candidate) => normalizedTextMatches(candidate.normalizedLemma, query, fuzzy))
        .map((candidate) => candidate.entryId)
        .sort();
      assert.deepEqual(
        ids(rankLemmaCandidates(matcherSample, query, { fuzzy })).sort(),
        expected,
        `ranked set must equal the shared matcher's set for "${query}" with fuzzy ${fuzzy}`,
      );
    }
  }

  assert.deepEqual(rankLemmaCandidates(rows, ""), [], "an empty query ranks no candidates");

  const before = structuredClone(rows);
  const ranked = rankLemmaCandidates(rows, "tala", { fuzzy: true });
  assert.deepEqual(rows, before, "ranking must not reorder or mutate the input rows");
  assert.equal(ranked[0], rows[5], "ranked results are the original row objects");

  console.log("Source candidate ranking checks passed.");
}

main();
