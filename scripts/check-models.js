const assert = require("node:assert/strict");
const orthographyModel = require("../lib/orthography-model");
const { checkModelNormalization } = require("./repository-contract");

checkModelNormalization();
const spaced = orthographyModel.analyzeOrthography("ab cd");
assert.deepEqual([...spaced.characterCounts.entries()], [["a", 1], ["b", 1], ["c", 1], ["d", 1]]);
assert.deepEqual([...spaced.bigramCounts.entries()], [["ab", 1], ["cd", 1]]);
assert.equal(orthographyModel.orthographyMatches("ab cd", { category: "bigram", value: "bc" }), false);
assert.equal(orthographyModel.orthographyMatches("ab cd", { category: "bigram", value: "cd" }), true);
assert.equal(orthographyModel.analyzeOrthography("aaa").bigramCounts.get("aa"), 2);
assert.deepEqual(
  orthographyModel.buildOrthographyDistribution([
    { id: "one", lemma: "aaa" },
    { id: "two", lemma: "a a" },
  ]).characters.find((row) => row.value === "a"),
  { value: "a", occurrenceCount: 5, entryCount: 2 },
);
console.log("Model and legacy JSON conversion checks passed.");
