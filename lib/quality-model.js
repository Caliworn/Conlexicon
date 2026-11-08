const etymologyGraph = require("./etymology-graph-model");
const { parseGloss } = require("./gloss-model");
const ipaModel = require("./ipa-model");
const { normalizeText } = require("./search-normalization-model");
const { buildDisplayIdentityIndex, definitionTagLayerStates } = require("./tag-model");

const QUALITY_SEVERITY_KEYS = Object.freeze(["high", "medium", "low"]);
const QUALITY_MODULE_KEYS = Object.freeze(["lemma", "tags", "ipa", "network", "other"]);
const QUALITY_ISSUE_DEFINITIONS = Object.freeze({
  duplicate_lemma: Object.freeze({ severity: "high", module: "lemma", scope: "entry" }),
  near_duplicate_tags: Object.freeze({ severity: "low", module: "tags", scope: "global" }),
  display_label_conflict: Object.freeze({ severity: "low", module: "tags", scope: "global" }),
  missing_lemma: Object.freeze({ severity: "high", module: "lemma", scope: "entry" }),
  missing_tags: Object.freeze({ severity: "high", module: "tags", scope: "entry" }),
  missing_definition: Object.freeze({ severity: "high", module: "other", scope: "entry" }),
  missing_ipa: Object.freeze({ severity: "low", module: "ipa", scope: "entry" }),
  multiple_primary_stress: Object.freeze({ severity: "medium", module: "ipa", scope: "entry" }),
  tag_too_long: Object.freeze({ severity: "low", module: "tags", scope: "global" }),
  duplicate_definition_tag: Object.freeze({ severity: "low", module: "tags", scope: "entry" }),
  mixed_part_of_speech_levels: Object.freeze({ severity: "medium", module: "tags", scope: "entry" }),
  missing_definition_part_of_speech: Object.freeze({ severity: "medium", module: "tags", scope: "entry" }),
  source_unresolved: Object.freeze({ severity: "medium", module: "network", scope: "entry" }),
  source_cycle: Object.freeze({ severity: "high", module: "network", scope: "entry" }),
});
const QUALITY_TAG_LENGTH_LIMIT = 24;
const QUALITY_BUILD_BATCH_SIZE = 256;

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || "")).filter(Boolean))];
}

function createQualityIssue(code, entryId, params = {}, relatedEntryIds = null) {
  const definition = QUALITY_ISSUE_DEFINITIONS[code];
  if (!definition) {
    throw new TypeError(`Unknown quality issue code: ${code}`);
  }
  return {
    code,
    severity: definition.severity,
    module: definition.module,
    entryId: entryId || "",
    params,
    ...(relatedEntryIds ? { relatedEntryIds: uniqueStrings(relatedEntryIds) } : {}),
  };
}

function qualityIssueAffectedEntryIds(issue = {}) {
  return uniqueStrings([issue.entryId, ...(issue.relatedEntryIds || [])]);
}

function buildQualitySummary(issues, inputEntryCount) {
  const summaryRows = (keys, field) => keys.map((key) => {
    const matchingIssues = issues.filter((issue) => issue[field] === key);
    return {
      key,
      issueCount: matchingIssues.length,
      entryCount: uniqueStrings(matchingIssues.flatMap(qualityIssueAffectedEntryIds)).length,
    };
  });
  return {
    inputEntryCount,
    issueCount: issues.length,
    affectedEntryCount: uniqueStrings(issues.flatMap(qualityIssueAffectedEntryIds)).length,
    globalIssueCount: issues.filter((issue) => !issue.entryId).length,
    severities: summaryRows(QUALITY_SEVERITY_KEYS, "severity"),
    modules: summaryRows(QUALITY_MODULE_KEYS, "module"),
  };
}

function mapPush(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

// A cyclic component's witness starts at its smallest member ID and follows
// sources in position order inside the component until an edge returns to
// the start. Strong connectivity guarantees that edge exists.
function componentCycleWitness(members, adjacency, componentOf, component, ids) {
  const start = members.reduce((best, member) => (ids[member] < ids[best] ? member : best), members[0]);
  const visited = new Set([start]);
  const path = [start];
  const nextEdge = [0];
  while (path.length) {
    const top = path.length - 1;
    const edges = adjacency[path[top]];
    if (nextEdge[top] >= edges.length) {
      path.pop();
      nextEdge.pop();
      continue;
    }
    const target = edges[nextEdge[top]++];
    if (componentOf[target] !== component) {
      continue;
    }
    if (target === start) {
      return [...path, start];
    }
    if (!visited.has(target)) {
      visited.add(target);
      path.push(target);
      nextEdge.push(0);
    }
  }
  throw new Error("Cyclic component has no closed path through its start member.");
}

// An entry whose source chain reaches a cycle reports the first cycle found
// by following its sources in position order. Components come out of the
// SCC pass with sources before dependents, so one forward pass memoizes it.
// Entries cannot cite themselves, so only multi-member components are cycles.
// Every entry reaching the same cycle shares one params object; callers must
// not mutate issue params.
function sourceCycleParams(records, indexById) {
  const ids = records.map((record) => record.id);
  const adjacency = records.map((record) => record.sources
    .map((source) => indexById.get(source.entryId))
    .filter((target) => target !== undefined));
  const { components, componentOf } = etymologyGraph.stronglyConnectedComponents(adjacency);
  const witnessByComponent = new Array(components.length).fill(null);
  components.forEach((members, component) => {
    if (members.length > 1) {
      const witness = componentCycleWitness(members, adjacency, componentOf, component, ids);
      witnessByComponent[component] = {
        cycleEntryIds: witness.map((member) => ids[member]),
        cycleLemmas: witness.map((member) => records[member].lemma),
      };
      return;
    }
    for (const target of adjacency[members[0]]) {
      const witness = witnessByComponent[componentOf[target]];
      if (witness) {
        witnessByComponent[component] = witness;
        return;
      }
    }
  });
  return ids.map((_, index) => witnessByComponent[componentOf[index]]);
}

// Records carry only id, lemma, pronunciation, ordered tags, definitions
// (id, meaning, example, tags) and ordered sources (entryId, text); settings
// carry only tagRegistry. Issue order follows record order and is the stable
// server issue order.
function* qualityIssueSteps(records, issues, settings) {
  const duplicateLemmas = new Map();
  const normalizedTagForms = new Map();
  const entryIdsByTag = new Map();
  const indexById = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    indexById.set(entry.id, index);
    const lemmaKey = normalizeText(entry.lemma);
    if (lemmaKey) {
      mapPush(duplicateLemmas, lemmaKey, entry);
    }
    [entry.tags, ...entry.definitions.map((definition) => definition.tags)].forEach((tags) => {
      tags.forEach((tag) => {
        mapPush(entryIdsByTag, tag, entry.id);
        const compact = normalizeText(tag).replace(/[^\p{L}\p{N}]+/gu, "");
        if (compact) {
          mapPush(normalizedTagForms, compact, { entryId: entry.id, tag });
        }
      });
    });
    if (index % QUALITY_BUILD_BATCH_SIZE === QUALITY_BUILD_BATCH_SIZE - 1) {
      yield;
    }
  }

  duplicateLemmas.forEach((items) => {
    if (items.length > 1) {
      const params = {
        lemmas: items.map((item) => item.lemma),
        duplicateEntryCount: items.length,
      };
      items.forEach((entry) => issues.push(createQualityIssue("duplicate_lemma", entry.id, params)));
    }
  });

  normalizedTagForms.forEach((tagRecords) => {
    const forms = uniqueStrings(tagRecords.map((record) => record.tag));
    if (forms.length > 1) {
      issues.push(createQualityIssue(
        "near_duplicate_tags",
        "",
        { forms },
        tagRecords.map((record) => record.entryId),
      ));
    }
  });
  entryIdsByTag.forEach((entryIds, tag) => {
    const codePointLength = Array.from(tag).length;
    if (codePointLength > QUALITY_TAG_LENGTH_LIMIT) {
      issues.push(createQualityIssue(
        "tag_too_long",
        "",
        { tag, codePointLength, limit: QUALITY_TAG_LENGTH_LIMIT },
        entryIds,
      ));
    }
  });
  const rawValuesByLabel = buildDisplayIdentityIndex(
    (settings.tagRegistry || []).map((row) => ({ value: row.tag, displayLabel: row.displayLabel })),
  );
  rawValuesByLabel.forEach((rawValues, displayLabel) => {
    if (rawValues.size > 1) {
      const forms = [...rawValues];
      issues.push(createQualityIssue(
        "display_label_conflict",
        "",
        { displayLabel, forms },
        forms.flatMap((tag) => entryIdsByTag.get(tag) || []),
      ));
    }
  });
  yield;

  const cycleParams = sourceCycleParams(records, indexById);
  yield;

  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    if (!entry.lemma) {
      issues.push(createQualityIssue("missing_lemma", entry.id));
    }
    if (!entry.tags.length && !entry.definitions.some((definition) => definition.tags.length)) {
      issues.push(createQualityIssue("missing_tags", entry.id));
    }
    if (!entry.definitions.some((definition) => definition.meaning)) {
      issues.push(createQualityIssue("missing_definition", entry.id));
    }
    if (!entry.pronunciation) {
      issues.push(createQualityIssue("missing_ipa", entry.id));
    } else {
      const primaryStressCount = ipaModel.countPrimaryStressMarks(entry.pronunciation);
      if (primaryStressCount > 1) {
        issues.push(createQualityIssue("multiple_primary_stress", entry.id, { primaryStressCount }));
      }
    }
    definitionTagLayerStates(entry, settings.tagRegistry).forEach((definitionState, definitionPosition) => {
      const location = { definitionId: entry.definitions[definitionPosition].id, definitionPosition };
      definitionState.tags.forEach(({ tag, state }) => {
        if (state === "duplicate") {
          issues.push(createQualityIssue("duplicate_definition_tag", entry.id, { ...location, tag }));
        } else if (state === "mixedPart") {
          issues.push(createQualityIssue("mixed_part_of_speech_levels", entry.id, { ...location, part: tag }));
        }
      });
      if (definitionState.missingPart) {
        issues.push(createQualityIssue("missing_definition_part_of_speech", entry.id, location));
      }
    });
    entry.sources.forEach((source, sourcePosition) => {
      if (!indexById.has(source.entryId)) {
        issues.push(createQualityIssue("source_unresolved", entry.id, {
          sourceText: source.text,
          sourcePosition,
        }));
      }
    });
    if (cycleParams[index]) {
      issues.push(createQualityIssue("source_cycle", entry.id, cycleParams[index]));
    }
    if (index % QUALITY_BUILD_BATCH_SIZE === QUALITY_BUILD_BATCH_SIZE - 1) {
      yield;
    }
  }
}

function buildQualityIssues(records, settings = {}) {
  const issues = [];
  const steps = qualityIssueSteps(records, issues, settings);
  while (!steps.next().done) {
    // Synchronous callers run every batch back to back.
  }
  return issues;
}

async function buildQualityIssuesAsync(records, settings, yieldControl) {
  const issues = [];
  const steps = qualityIssueSteps(records, issues, settings);
  while (!steps.next().done) {
    await yieldControl();
  }
  return issues;
}

// Gloss checks run on corpus items, one issue per item however many
// definitions link to it. Plain text has no levels to check. Commands the
// reader skips are only a low notice: rendering is unaffected, but a
// misspelled marker such as \gbl shows up here.
const CORPUS_QUALITY_CODES = Object.freeze([
  "gloss_unparsed",
  "gloss_incomplete",
  "gloss_alignment_mismatch",
  "gloss_unknown_command",
]);
const CORPUS_QUALITY_SEVERITY = Object.freeze({
  gloss_unparsed: "medium",
  gloss_incomplete: "medium",
  gloss_alignment_mismatch: "medium",
  gloss_unknown_command: "low",
});

function corpusIssue(code, itemId, params) {
  return { code, severity: CORPUS_QUALITY_SEVERITY[code], itemId, params };
}

function corpusItemQualityIssues(item) {
  const parsed = parseGloss(item.content);
  const issues = [];
  if (parsed.issues.length) {
    issues.push(corpusIssue("gloss_unparsed", item.id, { problems: parsed.issues }));
  }
  if (parsed.kind === "gloss") {
    const { gloss } = parsed;
    const missingFields = ["gla", "glb", "ft"].filter((key) => (key === "ft" ? !gloss.ft : !gloss[key].length));
    // \nogloss items on \gla have nothing below them, as in ExPex.
    const glaCount = gloss.gla.length - gloss.glaLayout.nogloss.length;
    if (missingFields.length) {
      issues.push(corpusIssue("gloss_incomplete", item.id, { missingFields }));
    } else if (glaCount !== gloss.glb.length) {
      issues.push(corpusIssue("gloss_alignment_mismatch", item.id, { glaCount, glbCount: gloss.glb.length }));
    }
  }
  if (parsed.notices.length) {
    issues.push(corpusIssue("gloss_unknown_command", item.id, {
      commands: [...new Set(parsed.notices.map((notice) => notice.command))],
    }));
  }
  return issues;
}

async function buildCorpusQualityIssuesAsync(items, yieldControl) {
  const issues = [];
  for (let index = 0; index < items.length; index += 1) {
    issues.push(...corpusItemQualityIssues(items[index]));
    if (index % QUALITY_BUILD_BATCH_SIZE === QUALITY_BUILD_BATCH_SIZE - 1) {
      await yieldControl();
    }
  }
  return issues;
}

function buildCorpusQualitySummary(issues, inputItemCount) {
  return {
    inputItemCount,
    issueCount: issues.length,
    itemCount: uniqueStrings(issues.map((issue) => issue.itemId)).length,
    codes: CORPUS_QUALITY_CODES.map((key) => {
      const matching = issues.filter((issue) => issue.code === key);
      return { key, issueCount: matching.length, itemCount: uniqueStrings(matching.map((issue) => issue.itemId)).length };
    }),
  };
}

module.exports = {
  CORPUS_QUALITY_CODES,
  QUALITY_ISSUE_DEFINITIONS,
  QUALITY_MODULE_KEYS,
  QUALITY_SEVERITY_KEYS,
  buildCorpusQualityIssuesAsync,
  buildCorpusQualitySummary,
  buildQualityIssues,
  buildQualityIssuesAsync,
  buildQualitySummary,
  corpusItemQualityIssues,
  createQualityIssue,
  qualityIssueAffectedEntryIds,
};
