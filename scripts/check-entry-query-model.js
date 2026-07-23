const assert = require("node:assert/strict");

const {
  EntryQueryValidationError,
  entryQueryIdentity,
  normalizeEntryFilter,
  normalizeEntryFilterFactsRequest,
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
    sort: "updatedDesc",
    limit: "200",
    cursor: "cursor",
    windowOffset: "400",
  });
  assert.deepEqual(query, {
    filter: {
      part: "N",
      tags: { values: ["motion", "n"], mode: "all" },
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

function checkFilterFactsNormalization() {
  assert.deepEqual(
    normalizeEntryFilterFactsRequest({
      filters: [{
        id: "missing-ipa",
        filter: { presence: { ipa: false } },
      }],
    }),
    {
      filters: [{
        id: "missing-ipa",
        filter: {
          part: "",
          tags: { values: [], mode: "any" },
          presence: [{ field: "ipa", present: false }],
          sourceCount: null,
          activityDays: [],
        },
      }],
    },
  );
  assert.throws(
    () => normalizeEntryFilterFactsRequest({
      filters: [{ id: "searched", filter: {}, search: { text: "root" } }],
    }),
    (error) => error instanceof EntryQueryValidationError && error.code === "invalid_entry_filter_fact",
  );
  assert.throws(
    () => normalizeEntryFilterFactsRequest({
      filters: [
        { id: "duplicate", filter: {} },
        { id: "duplicate", filter: { part: "n" } },
      ],
    }),
    (error) => error instanceof EntryQueryValidationError && error.code === "duplicate_entry_filter_fact_id",
  );
}

function main() {
  checkLegacyTransportNormalization();
  checkCanonicalFilterNormalization();
  checkStableIdentity();
  checkValidation();
  checkFilterFactsNormalization();
  console.log("Entry query model checks passed.");
}

main();
