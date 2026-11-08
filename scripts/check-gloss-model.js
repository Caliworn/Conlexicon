const assert = require("node:assert/strict");
const {
  glossInlinePlainText,
  glossSearchText,
  normalizeGlossLineBreaks,
  parseGloss,
  parseGlossInline,
  tokenizeGlossLevel,
} = require("../lib/gloss-model");

const lines = (...values) => values.join("\n");

function assertGloss(source, expected) {
  const parsed = parseGloss(source);
  assert.equal(parsed.kind, "gloss", source);
  assert.deepEqual(parsed.issues, [], source);
  assert.deepEqual(parsed.gloss, {
    preamble: "",
    gla: [],
    glaLayout: { breaks: [], joins: [], nogloss: [] },
    glb: [],
    glc: [],
    ft: "",
    ...expected,
  }, source);
  return parsed;
}

function issueCodes(source) {
  return parseGloss(source).issues.map((issue) => issue.code);
}

// Levels, aliases and the ExPex wrappers.
assertGloss(lines(String.raw`\gla a b`, String.raw`\glb A B`, String.raw`\glc x y`, String.raw`\ft test`), {
  gla: ["a", "b"],
  glb: ["A", "B"],
  glc: ["x", "y"],
  ft: "test",
});
assertGloss(lines(String.raw`\a a b`, String.raw`\b A B`, String.raw`\c x y`, String.raw`\glft test`), {
  gla: ["a", "b"],
  glb: ["A", "B"],
  glc: ["x", "y"],
  ft: "test",
});
assertGloss(lines(
  String.raw`\ex[everygla=]<tag>`,
  String.raw`\begingl[glstyle=wrap]`,
  String.raw`\gla x y //`,
  String.raw`\glb X Y //`,
  String.raw`\glft t//`,
  String.raw`\endgl`,
  String.raw`\xe`,
), { gla: ["x", "y"], glb: ["X", "Y"], ft: "t" });
assertGloss(lines(String.raw`\ex \begingl \gla x //`, String.raw`\glft t// \endgl \xe`), { gla: ["x"], ft: "t" });

// A // ends a level only at the end of the line or before the next marker.
assertGloss(String.raw`\a wapm -a // \b see \textsc{acc} // \ft saw them`, {
  gla: ["wapm", "-a"],
  glb: ["see", String.raw`\textsc{acc}`],
  ft: "saw them",
});
assertGloss(String.raw`\ft the form //kat// is old`, { ft: "the form //kat// is old" });
assertGloss(String.raw`\ft the form //kat//`, { ft: "the form //kat" });
assertGloss(String.raw`\ft the form {//kat//}`, { ft: "the form {//kat//}" });

// Levels run across lines up to the next marker or //, as in ExPex, and full
// markers also split a line without //.
assertGloss(String.raw`\gla vento-n sur \glb wind north \ft The wind.`, {
  gla: ["vento-n", "sur"],
  glb: ["wind", "north"],
  ft: "The wind.",
});
assertGloss(lines(
  String.raw`\gla Mary ist sicher, dass`,
  "es den Hans //",
  String.raw`\glb Mary is sure that`,
  "it the Hans //",
  String.raw`\glft Mary is sure`,
  "that it would not annoy John. //",
), {
  gla: ["Mary", "ist", "sicher,", "dass", "es", "den", "Hans"],
  glb: ["Mary", "is", "sure", "that", "it", "the", "Hans"],
  ft: "Mary is sure that it would not annoy John.",
});
assertGloss(lines(String.raw`\gla a b`, "c d", String.raw`\ft x`), { gla: ["a", "b", "c", "d"], ft: "x" });
// One-letter aliases only start a level at a line start or after //, since
// \b o and \c c are LaTeX accents.
assertGloss(String.raw`\gla fa\c c \b o`, { gla: [String.raw`fa\c`, "c", String.raw`\b`, "o"] });

// Text before the first level is the preamble, like \glpreamble.
assertGloss(lines("Mary ist sicher.", String.raw`\gla Mary ist sicher.`), {
  preamble: "Mary ist sicher.",
  gla: ["Mary", "ist", "sicher."],
});
assertGloss(lines(String.raw`\ex \begingl \glpreamble Mary ist`, "sicher.//", String.raw`\gla Mary //`, String.raw`\endgl \xe`), {
  preamble: "Mary ist sicher.",
  gla: ["Mary"],
});

// Exceptional \gla items: + breaks the line, @ joins two items and \nogloss
// has nothing below it. None of them takes an item on the lower levels.
assertGloss(lines(
  String.raw`\gla Mary ist sicher, + dass es @ den \nogloss{[[} Hans`,
  String.raw`\glb Mary is sure that it the Hans`,
), {
  gla: ["Mary", "ist", "sicher,", "dass", "es", "den", "[[", "Hans"],
  glaLayout: { breaks: [3], joins: [5], nogloss: [6] },
  glb: ["Mary", "is", "sure", "that", "it", "the", "Hans"],
});
assertGloss(String.raw`\gla + a @ + b @`, { gla: ["a", "b"], glaLayout: { breaks: [1], joins: [], nogloss: [] } });
assertGloss(String.raw`\glb A + B`, { glb: ["A", "+", "B"] });
assertGloss(String.raw`\gla \nogloss{{\textit{t}}]} x`, { gla: [String.raw`{\textit{t}}]`, "x"], glaLayout: { breaks: [], joins: [], nogloss: [0] } });

// Items split on spaces outside braces; empty braces keep an empty column.
assert.deepEqual(tokenizeGlossLevel("a {out to throw} {} the-\\textsc{3 acc}"), ["a", "{out to throw}", "{}", "the-\\textsc{3 acc}"]);
assert.deepEqual(tokenizeGlossLevel(String.raw`a\ b c`), [String.raw`a\ b`, "c"]);
assert.deepEqual(tokenizeGlossLevel("a } b"), ["a", "}", "b"]);
assert.deepEqual(tokenizeGlossLevel(""), []);

// Plain text, comments and empty content.
const plain = parseGloss(lines("% source: field notes", String.raw`ama \textit{sola}!`, "", "second line"));
assert.equal(plain.kind, "plain");
assert.deepEqual(plain.plainLines, [String.raw`ama \textit{sola}!`, "second line"]);
assert.deepEqual(plain.comments, ["source: field notes"]);
assert.deepEqual(plain.issues, []);
assert.deepEqual(parseGloss(String.raw`\ex plain sentence \xe`).plainLines, ["plain sentence"]);
assert.equal(parseGloss(" \n % only a comment").kind, "empty");
assert.equal(parseGloss("").kind, "empty");
assert.deepEqual(issueCodes(String.raw`\c{c}a and more`), [], "an inline command with braces starts plain text");
const commented = assertGloss(lines(String.raw`\gla a`, "% check this", String.raw`\ft x`), { gla: ["a"], ft: "x" });
assert.deepEqual(commented.comments, ["check this"]);

// Text after a closed level and repeated levels are reported, never dropped
// silently.
assert.deepEqual(parseGloss(lines(String.raw`\gla a //`, "stray words", String.raw`\glb A`)).issues, [{ code: "stray_line", line: 2 }]);
const strayThenLevel = parseGloss(lines(String.raw`\gla a //`, String.raw`stray \glb A`));
assert.deepEqual(strayThenLevel.issues, [{ code: "stray_line", line: 2 }]);
assert.deepEqual(strayThenLevel.gloss.glb, ["A"], "a level after stray text on the same line is still read");
assert.deepEqual(issueCodes(lines(String.raw`\gla a`, String.raw`\endgl stray`)), ["stray_line"]);
assert.deepEqual(issueCodes(lines(String.raw`\glb a`, String.raw`\glb b`)), ["duplicate_level"]);
assert.deepEqual(parseGloss(lines(String.raw`\glb a`, String.raw`\glb b`)).gloss.glb, ["a"], "the first repeated level is kept");
assert.deepEqual(parseGloss(lines("Mary.", String.raw`\glpreamble Mary //`, String.raw`\gla a`)).issues, [
  { code: "duplicate_level", line: 1, level: "preamble" },
]);

// Block commands outside a level are skipped and noted; inside a level they
// are text.
const pex = parseGloss(lines(String.raw`\pex`, String.raw`\a one`, String.raw`\a two`, String.raw`\xe`));
assert.deepEqual(pex.issues, [{ code: "duplicate_level", line: 3, level: "gla" }]);
assert.deepEqual(pex.notices, [{ code: "unknown_command", line: 1, command: String.raw`\pex` }]);
const skipped = assertGloss(lines(String.raw`\gla a //`, String.raw`\lingset{glspace=1em}`, String.raw`\glb A //`), { gla: ["a"], glb: ["A"] });
assert.deepEqual(skipped.notices, [{ code: "unknown_command", line: 2, command: String.raw`\lingset` }]);
assertGloss(lines(String.raw`\gla a`, String.raw`\gbl A`), { gla: ["a", String.raw`\gbl`, "A"] });
assert.deepEqual(parseGloss(String.raw`\pex plain`).plainLines, [String.raw`\pex plain`], "without levels every line is plain text");

// Old data stored line breaks as backslash-n; import converts them, and
// commands such as \nogloss stay. At runtime a backslash-n is text.
assert.equal(normalizeGlossLineBreaks(String.raw`\gla a\n\glb b\nogloss`), lines(String.raw`\gla a`, String.raw`\glb b\nogloss`));
assertGloss(String.raw`\gla a b\n`, { gla: ["a", String.raw`b\n`] });

// Search text keeps every level, plain line and comment without markup.
assert.equal(
  glossSearchText(lines("Pre", String.raw`\gla the-\textsc{acc} {out to}`, String.raw`\ft saw`, "% note")),
  lines("Pre", "the-acc out to", "saw", "note"),
);

// Inline formatting.
assert.deepEqual(parseGlossInline(String.raw`the-\textsc{acc}`), [
  { type: "text", value: "the-" },
  { type: "style", style: "smallCaps", children: [{ type: "text", value: "acc" }] },
]);
assert.deepEqual(parseGlossInline(String.raw`\textbf{a \textit{b}} \textnormal{c}`), [
  {
    type: "style",
    style: "bold",
    children: [
      { type: "text", value: "a " },
      { type: "style", style: "italic", children: [{ type: "text", value: "b" }] },
    ],
  },
  { type: "text", value: " " },
  { type: "style", style: "normal", children: [{ type: "text", value: "c" }] },
]);
assert.deepEqual(parseGlossInline(String.raw`{\sc pl} {\scshape du}`), [
  { type: "style", style: "smallCaps", children: [{ type: "text", value: "pl" }] },
  { type: "text", value: " " },
  { type: "style", style: "smallCaps", children: [{ type: "text", value: "du" }] },
]);
assert.deepEqual(parseGlossInline("{out to throw}"), [{ type: "text", value: "out to throw" }]);
assert.deepEqual(parseGlossInline("{}"), []);
assert.deepEqual(parseGlossInline(String.raw`\nogloss{x} $_i$ \textbf no-brace`), [
  { type: "text", value: String.raw`\nogloss{x} $_i$ \textbf no-brace` },
]);
assert.deepEqual(parseGlossInline(String.raw`50\% \& \"u`), [{ type: "text", value: String.raw`50% & \"u` }]);
assert.deepEqual(parseGlossInline(String.raw`\textsc{open`), [{ type: "text", value: String.raw`\textsc{open` }]);
assert.equal(glossInlinePlainText(String.raw`the-\textsc{acc} \textsc{a\textnormal{b}c} {x y}`), "the-acc abc x y");

console.log("Gloss model checks passed.");
