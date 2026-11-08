const assert = require("node:assert/strict");
const qualityModel = require("../lib/quality-model");

function completeRecord(id, options = {}) {
  return {
    id,
    lemma: options.lemma ?? id,
    pronunciation: options.pronunciation ?? "/a/",
    tags: options.tags ?? ["n"],
    definitions: options.definitions ?? [{ id: `def-${id}`, meaning: "meaning", tags: [] }],
    sources: options.sources ?? [],
  };
}

function qualityFixture() {
  return [
    {
      id: "entry-empty",
      lemma: "",
      pronunciation: "",
      tags: [],
      definitions: [],
      sources: [],
    },
    completeRecord("entry-duplicate-a", { lemma: "Same" }),
    completeRecord("entry-duplicate-b", { lemma: "same" }),
    completeRecord("entry-mixed", {
      lemma: "mixed",
      pronunciation: "/ˈaˈb/",
      tags: ["x".repeat(25)],
      definitions: [{
        id: "def-mixed",
        meaning: "meaning",
        tags: [],
      }],
      sources: [{ entryId: "", text: "missing-root" }],
    }),
    completeRecord("entry-near-tag-a", { tags: ["proper noun"] }),
    completeRecord("entry-near-tag-b", { tags: ["proper-noun"] }),
    // Definition tags count as the entry's tags and are checked like entry tags.
    completeRecord("entry-definition-tags", {
      tags: [],
      definitions: [{
        id: "def-tagged",
        meaning: "meaning",
        tags: ["y".repeat(25), "proper_noun"],
      }],
    }),
    completeRecord("cycle-a", { sources: [{ entryId: "cycle-b", text: "cycle-b" }] }),
    completeRecord("cycle-b", { sources: [{ entryId: "cycle-a", text: "cycle-a" }] }),
    completeRecord("cycle-upstream", { sources: [{ entryId: "cycle-a", text: "cycle-a" }] }),
    // Definition tags against the entry's own tags.
    completeRecord("entry-layer-duplicate", {
      tags: ["n", "rare"],
      definitions: [{ id: "def-layer-duplicate", meaning: "meaning", tags: ["rare", "n"] }],
    }),
    completeRecord("entry-layer-mixed", {
      tags: ["n"],
      definitions: [
        { id: "def-layer-mixed", meaning: "meaning", tags: ["v"] },
        { id: "def-layer-entry-part", meaning: "meaning", tags: [] },
      ],
    }),
    completeRecord("entry-layer-missing", {
      tags: ["rare"],
      definitions: [
        { id: "def-layer-own-part", meaning: "meaning", tags: ["adj"] },
        { id: "def-layer-no-part", meaning: "meaning", tags: [] },
      ],
    }),
  ];
}

const qualitySettings = {
  tagRegistry: ["n", "v", "adj"].map((tag) => ({ tag, partOfSpeech: true, displayLabel: "" }))
    .concat([
      { tag: "shown-a", partOfSpeech: false, displayLabel: "shared" },
      { tag: "shown-b", partOfSpeech: false, displayLabel: "shared" },
    ]),
};

const expectedDefinitions = {
  duplicate_lemma: { severity: "high", module: "lemma", scope: "entry" },
  near_duplicate_tags: { severity: "low", module: "tags", scope: "global" },
  display_label_conflict: { severity: "low", module: "tags", scope: "global" },
  missing_lemma: { severity: "high", module: "lemma", scope: "entry" },
  missing_tags: { severity: "high", module: "tags", scope: "entry" },
  missing_definition: { severity: "high", module: "other", scope: "entry" },
  missing_ipa: { severity: "low", module: "ipa", scope: "entry" },
  multiple_primary_stress: { severity: "medium", module: "ipa", scope: "entry" },
  tag_too_long: { severity: "low", module: "tags", scope: "global" },
  duplicate_definition_tag: { severity: "low", module: "tags", scope: "entry" },
  mixed_part_of_speech_levels: { severity: "medium", module: "tags", scope: "entry" },
  missing_definition_part_of_speech: { severity: "medium", module: "tags", scope: "entry" },
  source_unresolved: { severity: "medium", module: "network", scope: "entry" },
  source_cycle: { severity: "high", module: "network", scope: "entry" },
};

assert.deepEqual(qualityModel.QUALITY_ISSUE_DEFINITIONS, expectedDefinitions);
assert.deepEqual(qualityModel.QUALITY_SEVERITY_KEYS, ["high", "medium", "low"]);
assert.deepEqual(qualityModel.QUALITY_MODULE_KEYS, ["lemma", "tags", "ipa", "network", "other"]);
assert.throws(
  () => qualityModel.createQualityIssue("unknown_quality_issue", ""),
  /Unknown quality issue code/,
);

const records = qualityFixture();
const issues = qualityModel.buildQualityIssues(records, qualitySettings);
assert.deepEqual(new Set(issues.map((issue) => issue.code)), new Set(Object.keys(expectedDefinitions)));
issues.forEach((issue) => {
  assert.equal(issue.severity, expectedDefinitions[issue.code].severity);
  assert.equal(issue.module, expectedDefinitions[issue.code].module);
});

const issueFor = (code, entryId = null) => issues.find((issue) => (
  issue.code === code && (entryId === null || issue.entryId === entryId)
));

// Gloss checks run per corpus item, once however many definitions link to it.
const corpusIssues = (content) => qualityModel.corpusItemQualityIssues({ id: "item", content });
assert.deepEqual(corpusIssues("\\gla a b\n\\glb A B"), [
  { code: "gloss_incomplete", severity: "medium", itemId: "item", params: { missingFields: ["ft"] } },
]);
assert.deepEqual(corpusIssues("\\gla a b\n\\glb A\n\\ft test"), [
  { code: "gloss_alignment_mismatch", severity: "medium", itemId: "item", params: { glaCount: 2, glbCount: 1 } },
]);
assert.deepEqual(corpusIssues("\\gla \\nogloss{[} a + b\n\\glb A B\n\\ft x"), [], "\\nogloss and + take no item below");
assert.deepEqual(corpusIssues("\\a out {to throw}\n\\b leave \\textsc{3 acc}\n\\ft x"), [], "braces and inline commands keep one item each");
assert.deepEqual(corpusIssues("plain sentence\n% a note"), [], "plain text has no levels to check");
// Skipped block commands are only a low notice; text after a closed level is
// an issue.
assert.deepEqual(corpusIssues("\\pex\n\\a one\n\\xe"), [
  { code: "gloss_incomplete", severity: "medium", itemId: "item", params: { missingFields: ["glb", "ft"] } },
  { code: "gloss_unknown_command", severity: "low", itemId: "item", params: { commands: ["\\pex"] } },
]);
assert.deepEqual(corpusIssues("\\gla a //\nstray\n\\glb A //\n\\ft x"), [
  { code: "gloss_unparsed", severity: "medium", itemId: "item", params: { problems: [{ code: "stray_line", line: 2 }] } },
]);
assert.deepEqual(qualityModel.CORPUS_QUALITY_CODES, ["gloss_unparsed", "gloss_incomplete", "gloss_alignment_mismatch", "gloss_unknown_command"]);
assert.deepEqual(qualityModel.buildCorpusQualitySummary([
  { code: "gloss_incomplete", itemId: "a" },
  { code: "gloss_unparsed", itemId: "a" },
  { code: "gloss_incomplete", itemId: "b" },
], 5), {
  inputItemCount: 5,
  issueCount: 3,
  itemCount: 2,
  codes: [
    { key: "gloss_unparsed", issueCount: 1, itemCount: 1 },
    { key: "gloss_incomplete", issueCount: 2, itemCount: 2 },
    { key: "gloss_alignment_mismatch", issueCount: 0, itemCount: 0 },
    { key: "gloss_unknown_command", issueCount: 0, itemCount: 0 },
  ],
});
assert.deepEqual(issueFor("duplicate_lemma", "entry-duplicate-a").params, {
  lemmas: ["Same", "same"],
  duplicateEntryCount: 2,
});
assert.deepEqual(issueFor("multiple_primary_stress").params, { primaryStressCount: 2 });
const longTagIssues = issues.filter((issue) => issue.code === "tag_too_long");
assert.deepEqual(longTagIssues.map((issue) => issue.params.tag), ["x".repeat(25), "y".repeat(25)], "one issue per tag");
assert.deepEqual(longTagIssues[1].params, { tag: "y".repeat(25), codePointLength: 25, limit: 24 });
assert.equal(longTagIssues[1].entryId, "", "a long tag is a property of the tag");
assert.deepEqual(longTagIssues[1].relatedEntryIds, ["entry-definition-tags"]);
{
  const repeatedLongTag = "z".repeat(25);
  const conflicts = qualityModel.buildQualityIssues([
    { id: "entry-a", lemma: "a", pronunciation: "a", tags: [repeatedLongTag, "n"], definitions: [], sources: [] },
    { id: "entry-b", lemma: "b", pronunciation: "b", tags: [repeatedLongTag, "noun"], definitions: [], sources: [] },
  ], {
    tagRegistry: [
      { tag: "n", partOfSpeech: false, displayLabel: "noun" },
      { tag: "noun", partOfSpeech: false, displayLabel: "" },
      { tag: "unused", partOfSpeech: false, displayLabel: "shared" },
      { tag: "unused-too", partOfSpeech: false, displayLabel: "shared" },
    ],
  });
  assert.equal(conflicts.filter((issue) => issue.code === "tag_too_long").length, 1, "a shared long tag reports once");
  assert.deepEqual(
    conflicts
      .filter((issue) => issue.code === "display_label_conflict")
      .map((issue) => [issue.params.displayLabel, issue.params.forms, issue.relatedEntryIds]),
    [
      ["noun", ["n", "noun"], ["entry-a", "entry-b"]],
      ["shared", ["unused", "unused-too"], []],
    ],
    "tags shown alike report whether or not entries use them",
  );
}
assert.equal(issueFor("missing_tags", "entry-definition-tags"), undefined, "definition tags satisfy missing_tags");
const layerIssues = (entryId) => issues
  .filter((issue) => issue.entryId === entryId && [
    "duplicate_definition_tag",
    "mixed_part_of_speech_levels",
    "missing_definition_part_of_speech",
  ].includes(issue.code))
  .map(({ code, params }) => ({ code, params }));
assert.deepEqual(layerIssues("entry-layer-duplicate"), [
  { code: "duplicate_definition_tag", params: { definitionId: "def-layer-duplicate", definitionPosition: 0, tag: "rare" } },
  { code: "duplicate_definition_tag", params: { definitionId: "def-layer-duplicate", definitionPosition: 0, tag: "n" } },
], "a duplicated part of speech is a duplicate, not a mixed level");
assert.deepEqual(layerIssues("entry-layer-mixed"), [
  { code: "mixed_part_of_speech_levels", params: { definitionId: "def-layer-mixed", definitionPosition: 0, part: "v" } },
], "a definition without parts takes the entry's parts");
assert.deepEqual(layerIssues("entry-layer-missing"), [
  { code: "missing_definition_part_of_speech", params: { definitionId: "def-layer-no-part", definitionPosition: 1 } },
]);
assert.deepEqual(
  qualityModel.buildQualityIssues(records)
    .filter((issue) => ["mixed_part_of_speech_levels", "missing_definition_part_of_speech"].includes(issue.code)),
  [],
  "part-of-speech level rules need configured parts of speech",
);
assert.deepEqual(issueFor("source_unresolved").params, {
  sourceText: "missing-root",
  sourcePosition: 0,
});

const nearDuplicateTags = issueFor("near_duplicate_tags");
assert.equal(nearDuplicateTags.entryId, "");
assert.deepEqual(nearDuplicateTags.params, { forms: ["proper noun", "proper-noun", "proper_noun"] });
assert.deepEqual(nearDuplicateTags.relatedEntryIds, ["entry-near-tag-a", "entry-near-tag-b", "entry-definition-tags"]);
assert.deepEqual(
  qualityModel.qualityIssueAffectedEntryIds(nearDuplicateTags),
  ["entry-near-tag-a", "entry-near-tag-b", "entry-definition-tags"],
);

assert.deepEqual(issueFor("source_cycle", "cycle-upstream").params, {
  cycleEntryIds: ["cycle-a", "cycle-b", "cycle-a"],
  cycleLemmas: ["cycle-a", "cycle-b", "cycle-a"],
});

const summary = qualityModel.buildQualitySummary(issues, records.length);
assert.equal(summary.inputEntryCount, 13);
assert.equal(summary.issueCount, issues.length);
assert.equal(summary.affectedEntryCount, 13);
assert.equal(summary.globalIssueCount, 4);
assert.equal(
  summary.severities.reduce((total, row) => total + row.issueCount, 0),
  summary.issueCount,
);
assert.equal(
  summary.modules.reduce((total, row) => total + row.issueCount, 0),
  summary.issueCount,
);
assert.deepEqual(
  summary.modules.find((row) => row.key === "tags"),
  { key: "tags", issueCount: 13, entryCount: 8 },
  "global issues count their related entries in the module entry count",
);

function sourceRecord(id, sourceIds = []) {
  return completeRecord(id, {
    sources: sourceIds.map((sourceId) => ({ entryId: sourceId, text: sourceId })),
  });
}

function cycleParamsByEntry(cycleIssues) {
  return Object.fromEntries(cycleIssues
    .filter((issue) => issue.code === "source_cycle")
    .map((issue) => [issue.entryId, issue.params]));
}

function seededShuffle(values, seed) {
  const result = [...values];
  let state = seed;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

// Each cyclic component reports one witness that starts at its smallest member
// ID and follows sources in position order; dependents inherit the first cycle
// reached through their own source order, independent of record order.
const witnessRecords = [
  sourceRecord("ring-c", ["ring-a"]),
  sourceRecord("ring-a", ["ring-b"]),
  sourceRecord("ring-b", ["ring-c"]),
  sourceRecord("pair-y", ["pair-x"]),
  sourceRecord("pair-x", ["pair-y"]),
  sourceRecord("fan-in", ["plain", "pair-y", "ring-b"]),
  sourceRecord("plain"),
  sourceRecord("downstream", ["fan-in"]),
];
const ringWitness = {
  cycleEntryIds: ["ring-a", "ring-b", "ring-c", "ring-a"],
  cycleLemmas: ["ring-a", "ring-b", "ring-c", "ring-a"],
};
const pairWitness = {
  cycleEntryIds: ["pair-x", "pair-y", "pair-x"],
  cycleLemmas: ["pair-x", "pair-y", "pair-x"],
};
const expectedCycles = {
  "ring-c": ringWitness,
  "ring-a": ringWitness,
  "ring-b": ringWitness,
  "pair-y": pairWitness,
  "pair-x": pairWitness,
  "fan-in": pairWitness,
  downstream: pairWitness,
};
assert.deepEqual(cycleParamsByEntry(qualityModel.buildQualityIssues(witnessRecords)), expectedCycles);
for (let seed = 1; seed <= 8; seed += 1) {
  assert.deepEqual(
    cycleParamsByEntry(qualityModel.buildQualityIssues(seededShuffle(witnessRecords, seed))),
    expectedCycles,
    `cycle witnesses must not depend on record order (seed ${seed})`,
  );
}

// A11: shared acyclic ancestry must be visited once. Every entry citing its two
// predecessors made the old per-entry path search grow with Fibonacci numbers.
const ladder = Array.from({ length: 2000 }, (_, index) => sourceRecord(
  `ladder-${index}`,
  [index - 1, index - 2].filter((source) => source >= 0).map((source) => `ladder-${source}`),
));
assert.equal(
  qualityModel.buildQualityIssues(ladder).some((issue) => issue.code === "source_cycle"),
  false,
);

const longCycleLength = 50000;
const longCycle = Array.from({ length: longCycleLength }, (_, index) => sourceRecord(
  `long-${String(index).padStart(5, "0")}`,
  [`long-${String((index + 1) % longCycleLength).padStart(5, "0")}`],
));
const longCycleIssues = qualityModel.buildQualityIssues(longCycle).filter((issue) => issue.code === "source_cycle");
assert.equal(longCycleIssues.length, longCycleLength);
assert.equal(longCycleIssues[0].params.cycleEntryIds.length, longCycleLength + 1);
assert.equal(longCycleIssues[0].params.cycleEntryIds[0], "long-00000");
assert.equal(longCycleIssues[0].params, longCycleIssues[longCycleLength - 1].params);

(async () => {
  let yields = 0;
  const asyncIssues = await qualityModel.buildQualityIssuesAsync(
    [...records, ...ladder],
    qualitySettings,
    async () => {
      yields += 1;
    },
  );
  assert.deepEqual(asyncIssues, qualityModel.buildQualityIssues([...records, ...ladder], qualitySettings));
  assert.ok(yields >= 2, "the async builder must yield between record batches");
  console.log("Quality rule contract checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
