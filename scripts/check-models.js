const assert = require("node:assert/strict");
const orthographyModel = require("../lib/orthography-model");
const { checkModelNormalization } = require("./repository-contract");

checkModelNormalization();
const spaced = orthographyModel.analyzeOrthography("ab cd");
assert.deepEqual([...spaced.characterCounts.entries()], [["a", 1], ["b", 1], ["c", 1], ["d", 1]]);
assert.deepEqual([...spaced.bigramCounts.entries()], [["ab", 1], ["cd", 1]]);
assert.equal(orthographyModel.normalizedOrthographyMatches("ab cd", orthographyModel.normalizedOrthographyFilter({ category: "bigram", value: "bc" })), false);
assert.equal(orthographyModel.normalizedOrthographyMatches("ab cd", orthographyModel.normalizedOrthographyFilter({ category: "bigram", value: "cd" })), true);
for (const [filter, lemma, expected] of [
  [{ category: "length", value: 2 }, "𐐀a", true],
  [{ category: "initial", value: "𐐀" }, " 𐐀a", true],
  [{ category: "initial", value: "" }, " \t", true],
  [{ category: "character", value: "a" }, "b\ta", true],
  [{ category: "character", value: "a" }, "b", false],
  [{ category: "bigram", value: "ab" }, "a b", false],
  [{ category: "bigram", value: "𐐀a" }, "𐐀a b", true],
  [null, "anything", true],
]) {
  const normalized = orthographyModel.normalizedOrthographyFilter(filter);
  assert.equal(orthographyModel.normalizedOrthographyMatches(lemma, normalized), expected);
}
assert.throws(() => orthographyModel.normalizedOrthographyFilter({ category: "unknown", value: "a" }), TypeError);
assert.equal(orthographyModel.analyzeOrthography("aaa").bigramCounts.get("aa"), 2);
assert.deepEqual(
  orthographyModel.buildOrthographyDistribution([
    { id: "one", lemma: "aaa" },
    { id: "two", lemma: "a a" },
  ]).characters.find((row) => row.value === "a"),
  { value: "a", occurrenceCount: 5, entryCount: 2 },
);
console.log("Model and legacy JSON conversion checks passed.");
