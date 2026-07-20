#!/usr/bin/env node
const assert = require("node:assert/strict");

const normalization = require("../lib/search-normalization-model");

function main() {
  assert.equal(
    normalization.normalizeSearchText(" Straße "),
    "straße",
    "S1 must not alter the active legacy trim + locale-lower baseline",
  );

  assert.equal(
    normalization.normalizeConfiguredSearchText(" Cafe\u0301 "),
    "Cafe\u0301",
    "configured strict mode preserves case and canonical decomposition after outer trimming",
  );
  assert.equal(
    normalization.normalizeConfiguredSearchText(" Cafe\u0301 ", { unicodeNormalization: "nfc" }),
    "Café",
    "NFC must compose canonically equivalent input",
  );
  assert.equal(
    normalization.normalizeConfiguredSearchText("Straße Σς \uE000", { caseFolding: true }),
    "strasse σσ \uE000",
    "Unicode default case folding must include full folds, final sigma, and preserve PUA values",
  );
  assert.equal(
    normalization.normalizeConfiguredSearchText("ǰ J\u030C", {
      unicodeNormalization: "nfc",
      caseFolding: true,
    }),
    "ǰ ǰ",
    "NFC followed by full case folding must yield the same result for composed and decomposed input",
  );

  const custom = normalization.createConfiguredSearchNormalizer({
    unicodeNormalization: "nfc",
    caseFolding: true,
    customRules: [
      { canonical: "t", variants: ["\uE000", "ṱ"] },
      { canonical: "x", variants: ["ab"] },
      { canonical: "y", variants: ["x"] },
      { canonical: "long", variants: ["abcd"] },
      { canonical: "short", variants: ["bcd"] },
    ],
  });
  assert.equal(custom.errors.length, 0, "valid custom rules must compile without errors");
  assert.equal(
    custom.normalize(" \uE000ṱT ab x abcd "),
    "ttt x y long",
    "custom rules must be literal, longest-first, and applied only once",
  );
  const mapped = custom.normalizeWithMap("Straße \uE000");
  assert.equal(mapped.text, "strasse t");
  const sharpSStart = mapped.text.indexOf("ss");
  assert.deepEqual(mapped.map.slice(sharpSStart, sharpSStart + 2), [
    { start: 4, end: 5 },
    { start: 4, end: 5 },
  ], "expanded case folds must map both normalized units back to the original character");
  assert.deepEqual(mapped.map.at(-1), { start: 7, end: 8 }, "custom replacements must map back to their source span");

  const conflict = normalization.compileCustomSearchRules([
    { canonical: "a", variants: ["x"] },
    { canonical: "b", variants: ["x"] },
  ]);
  assert.equal(conflict.valid, false);
  assert.equal(conflict.errors[0]?.code, "conflicting_variant");

  const invalid = normalization.createConfiguredSearchNormalizer({
    caseFolding: true,
    customRules: [
      { canonical: "", variants: ["x"] },
      { canonical: "z", variants: [] },
    ],
  });
  assert.equal(invalid.compiledRules.valid, false);
  assert.deepEqual(invalid.errors.map((error) => error.code), ["empty_canonical", "empty_variants"]);
  assert.equal(
    invalid.normalize("X"),
    "x",
    "invalid custom rules must not partially rewrite otherwise normalized search text",
  );

  console.log("Search-normalization S1 checks passed.");
}

main();
