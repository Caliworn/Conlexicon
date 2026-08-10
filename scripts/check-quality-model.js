const assert = require("node:assert/strict");
const qualityModel = require("../lib/quality-model");

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

function qualityFixture() {
  return {
    entries: [
      {
        id: "entry-empty",
        lemma: "",
        pronunciation: "",
        tags: [],
        definitions: [],
        etymology: { sources: [] },
      },
      completeEntry("entry-duplicate-a", { lemma: "Same" }),
      completeEntry("entry-duplicate-b", { lemma: "same" }),
      completeEntry("entry-mixed", {
        lemma: "mixed",
        pronunciation: "/ˈaˈb/",
        tags: ["x".repeat(25)],
        definitions: [{
          id: "def-mixed",
          meaning: "meaning",
          example: "\\gla a b\n\\glb A B",
        }],
        sources: ["missing-root"],
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
      completeEntry("cycle-a", { sources: ["cycle-b"] }),
      completeEntry("cycle-b", { sources: ["cycle-a"] }),
      completeEntry("cycle-upstream", { sources: ["cycle-a"] }),
    ],
  };
}

function issueProjection(report) {
  return report.issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    module: issue.module,
    entryId: issue.entryId,
    relatedEntryIds: issue.relatedEntryIds || [],
    params: issue.params,
  }));
}

const expectedDefinitions = {
  gloss_incomplete: { severity: "medium", module: "gloss", scope: "entry" },
  gloss_alignment_mismatch: { severity: "medium", module: "gloss", scope: "entry" },
  duplicate_lemma: { severity: "high", module: "lemma", scope: "entry" },
  near_duplicate_tags: { severity: "low", module: "tags", scope: "global" },
  missing_lemma: { severity: "high", module: "lemma", scope: "entry" },
  missing_tags: { severity: "high", module: "tags", scope: "entry" },
  missing_definition: { severity: "high", module: "other", scope: "entry" },
  missing_ipa: { severity: "low", module: "ipa", scope: "entry" },
  multiple_primary_stress: { severity: "medium", module: "ipa", scope: "entry" },
  tag_too_long: { severity: "low", module: "tags", scope: "entry" },
  source_unresolved: { severity: "medium", module: "network", scope: "entry" },
  source_cycle: { severity: "high", module: "network", scope: "entry" },
};

assert.equal(qualityModel.QUALITY_RULESET_VERSION, 1);
assert.deepEqual(qualityModel.QUALITY_ISSUE_DEFINITIONS, expectedDefinitions);
assert.deepEqual(qualityModel.QUALITY_SEVERITY_KEYS, ["high", "medium", "low"]);
assert.deepEqual(qualityModel.QUALITY_MODULE_KEYS, ["lemma", "tags", "ipa", "network", "gloss", "other"]);
assert.throws(
  () => qualityModel.addQualityIssue([], "unknown_quality_issue", null, "Unknown"),
  /Unknown quality issue code/,
);

const dictionary = qualityFixture();
const englishReport = qualityModel.buildQualityReport(dictionary, { text: (_zh, en) => en });
const chineseReport = qualityModel.buildQualityReport(dictionary, { text: (zh) => zh });
const issueCodes = new Set(englishReport.issues.map((issue) => issue.code));

assert.deepEqual(issueCodes, new Set(Object.keys(expectedDefinitions)));
assert.equal(englishReport.rulesetVersion, 1);
assert.deepEqual(issueProjection(englishReport), issueProjection(chineseReport));
assert.deepEqual(englishReport.summary, chineseReport.summary);
assert.notEqual(
  englishReport.issues.find((issue) => issue.code === "missing_ipa").title,
  chineseReport.issues.find((issue) => issue.code === "missing_ipa").title,
  "localized display text may change without changing the quality result contract",
);

const issueFor = (code, entryId = null) => englishReport.issues.find((issue) => (
  issue.code === code && (entryId === null || issue.entryId === entryId)
));

assert.deepEqual(issueFor("gloss_incomplete").params, {
  definitionId: "def-mixed",
  definitionPosition: 0,
  missingFields: ["ft"],
});
assert.deepEqual(issueFor("gloss_alignment_mismatch").params, {
  definitionId: "def-gloss-mismatch",
  definitionPosition: 0,
  glaCount: 2,
  glbCount: 1,
});
assert.deepEqual(issueFor("duplicate_lemma", "entry-duplicate-a").params, {
  lemmas: ["Same", "same"],
  duplicateEntryCount: 2,
});
assert.deepEqual(issueFor("multiple_primary_stress").params, { primaryStressCount: 2 });
assert.deepEqual(issueFor("tag_too_long").params, {
  tag: "x".repeat(25),
  codePointLength: 25,
  limit: 24,
});
assert.deepEqual(issueFor("source_unresolved").params, {
  sourceText: "missing-root",
  sourcePosition: 0,
});

const nearDuplicateTags = issueFor("near_duplicate_tags");
assert.equal(nearDuplicateTags.entryId, "");
assert.deepEqual(nearDuplicateTags.params, { forms: ["proper noun", "proper-noun"] });
assert.deepEqual(nearDuplicateTags.relatedEntryIds, ["entry-near-tag-a", "entry-near-tag-b"]);
assert.deepEqual(
  qualityModel.qualityIssueAffectedEntryIds(nearDuplicateTags),
  ["entry-near-tag-a", "entry-near-tag-b"],
);
assert.equal(qualityModel.qualityIssuesWithEntries([nearDuplicateTags]).length, 0);
assert.deepEqual(
  qualityModel.qualityIssueEntryIdsByModule(englishReport, "tags"),
  ["entry-near-tag-a", "entry-near-tag-b", "entry-empty", "entry-mixed"],
);

const upstreamCycle = issueFor("source_cycle", "cycle-upstream");
assert.deepEqual(upstreamCycle.params, {
  cycleEntryIds: ["cycle-a", "cycle-b", "cycle-a"],
  cycleLemmas: ["cycle-a", "cycle-b", "cycle-a"],
});
assert.equal(
  englishReport.networkIssues.every((issue) => ["source_unresolved", "source_cycle"].includes(issue.code)),
  true,
);
assert.equal(englishReport.networkIssues.length, 4);

const summary = englishReport.summary;
assert.deepEqual(summary, qualityModel.buildQualitySummary(englishReport, dictionary.entries.length));
assert.equal(summary.inputEntryCount, 10);
assert.equal(summary.issueCount, englishReport.issues.length);
assert.equal(summary.affectedEntryCount, 10);
assert.equal(summary.globalIssueCount, 1);
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
  { key: "tags", issueCount: 3, entryCount: 4 },
);

assert.equal(
  qualityModel.qualityIssueIdentity(issueFor("gloss_incomplete")),
  qualityModel.qualityIssueIdentity(chineseReport.issues.find((issue) => issue.code === "gloss_incomplete")),
  "issue identity must exclude localized title and detail text",
);

console.log("Quality rule contract checks passed.");
