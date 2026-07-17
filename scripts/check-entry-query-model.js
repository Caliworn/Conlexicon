const assert = require("node:assert/strict");

const {
  EntryQueryValidationError,
  entryQueryIdentity,
  normalizeEntryFilter,
  normalizeEntryQuery,
  serializeEntryFilter,
} = require("../lib/entry-query-model");

function checkLegacyTransportNormalization() {
  const query = normalizeEntryQuery({
    q: " root ",
    fields: "tags,lemma",
    fuzzyFields: "lemma",
    part: " N ",
    tags: "motion,n,motion",
    tagMode: "all",
    source: " Root ",
    derivedFrom: " Parent ",
    sort: "updatedDesc",
    include: "full",
    limit: "200",
    cursor: "cursor",
    windowOffset: "400",
  });
  assert.deepEqual(query, {
    filter: {
      part: "N",
      tags: { values: ["motion", "n"], mode: "all" },
      sourceText: "root",
      derivedFrom: { entryId: "", reference: "parent" },
      presence: [],
      sourceCount: null,
      activityDays: [],
    },
    search: {
      text: "root",
      fields: ["lemma", "tags"],
      fuzzyFields: ["lemma"],
    },
    sort: "updatedDesc",
    include: "full",
    page: {
      limit: 200,
      cursor: "cursor",
      windowOffset: 400,
      offset: 0,
    },
  });
  assert.doesNotThrow(() => JSON.stringify(query));
}

function checkCanonicalFilterNormalization() {
  const filter = normalizeEntryFilter({
    part: "v",
    tags: { values: ["motion", "derived", "motion"], mode: "any" },
    sourceText: "root",
    derivedFrom: { entryId: "entry-root", reference: "root" },
    presence: { definition: true, ipa: false },
    sourceCount: { min: 2, max: 4 },
    activityDays: [
      { field: "updated", day: "2026-07-17" },
      { field: "created", day: "2026-07-16" },
    ],
  });
  assert.deepEqual(filter, {
    part: "v",
    tags: { values: ["derived", "motion"], mode: "any" },
    sourceText: "root",
    derivedFrom: { entryId: "entry-root", reference: "root" },
    presence: [
      { field: "definition", present: true },
      { field: "ipa", present: false },
    ],
    sourceCount: { min: 2, max: 4 },
    activityDays: [
      { field: "created", day: "2026-07-16" },
      { field: "updated", day: "2026-07-17" },
    ],
  });
  assert.deepEqual(
    normalizeEntryQuery({ filter: serializeEntryFilter(filter) }).filter,
    filter,
  );
}

function checkStableIdentity() {
  const first = normalizeEntryQuery({
    q: "root",
    fields: "tags,lemma",
    fuzzyFields: "lemma",
    tags: "n,root",
    tagMode: "all",
    limit: 20,
    include: "summary",
  });
  const second = normalizeEntryQuery({
    filter: {
      tags: { values: ["root", "n", "root"], mode: "all" },
    },
    search: {
      text: "root",
      fields: ["lemma", "tags"],
      fuzzyFields: ["lemma"],
    },
    page: { limit: 500, offset: 100 },
    include: "full",
  });
  assert.deepEqual(entryQueryIdentity(first), entryQueryIdentity(second));

  const present = normalizeEntryQuery({ filter: { presence: { ipa: true } } });
  const absent = normalizeEntryQuery({ filter: { presence: { ipa: false } } });
  assert.notDeepEqual(entryQueryIdentity(present), entryQueryIdentity(absent));

  const noSearchA = normalizeEntryQuery({ fields: "lemma", fuzzyFields: "lemma" });
  const noSearchB = normalizeEntryQuery({ fields: "morphology", fuzzyFields: "" });
  assert.deepEqual(entryQueryIdentity(noSearchA), entryQueryIdentity(noSearchB));
}

function checkValidation() {
  assert.throws(
    () => normalizeEntryFilter({
      presence: [
        { field: "ipa", present: true },
        { field: "ipa", present: false },
      ],
    }),
    (error) => error instanceof EntryQueryValidationError && error.code === "conflicting_entry_filter_presence",
  );
  assert.throws(
    () => normalizeEntryFilter({ sourceCount: { min: 3, max: 2 } }),
    (error) => error instanceof EntryQueryValidationError && error.code === "invalid_entry_filter_source_count",
  );
  assert.throws(
    () => normalizeEntryQuery({ windowOffset: "not-a-number" }),
    (error) => error instanceof EntryQueryValidationError && error.code === "invalid_query_window_offset",
  );
  assert.throws(
    () => normalizeEntryFilter({ activityDay: { field: "created", day: "2026-02-31" } }),
    (error) => error instanceof EntryQueryValidationError && error.code === "invalid_entry_filter_activity_day",
  );
  assert.throws(
    () => normalizeEntryQuery({ filter: "{not-json" }),
    (error) => error instanceof EntryQueryValidationError && error.code === "invalid_entry_filter_json",
  );
  assert.throws(
    () => normalizeEntryQuery({ filter: "{}", part: "n" }),
    (error) => error instanceof EntryQueryValidationError && error.code === "conflicting_entry_filter_transport",
  );
}

function main() {
  checkLegacyTransportNormalization();
  checkCanonicalFilterNormalization();
  checkStableIdentity();
  checkValidation();
  console.log("Entry query model checks passed.");
}

main();
