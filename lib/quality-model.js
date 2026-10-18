(function initQualityModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./ipa-model"),
      require("./etymology-graph-model"),
      require("./search-normalization-model"),
    );
    return;
  }
  root.ConlexiconQuality = factory(
    root.ConlexiconIpa,
    root.ConlexiconEtymologyGraph,
    root.ConlexiconSearchNormalization,
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function createQualityModel(ipaModel, etymologyGraph, searchNormalization) {
  const normalizeText = searchNormalization.normalizeText;
  const QUALITY_RULESET_VERSION = 1;
  const QUALITY_SEVERITY_KEYS = Object.freeze(["high", "medium", "low"]);
  const QUALITY_MODULE_KEYS = Object.freeze(["lemma", "tags", "ipa", "network", "gloss", "other"]);
  const QUALITY_ISSUE_DEFINITIONS = Object.freeze({
    gloss_incomplete: Object.freeze({ severity: "medium", module: "gloss", scope: "entry" }),
    gloss_alignment_mismatch: Object.freeze({ severity: "medium", module: "gloss", scope: "entry" }),
    duplicate_lemma: Object.freeze({ severity: "high", module: "lemma", scope: "entry" }),
    near_duplicate_tags: Object.freeze({ severity: "low", module: "tags", scope: "global" }),
    missing_lemma: Object.freeze({ severity: "high", module: "lemma", scope: "entry" }),
    missing_tags: Object.freeze({ severity: "high", module: "tags", scope: "entry" }),
    missing_definition: Object.freeze({ severity: "high", module: "other", scope: "entry" }),
    missing_ipa: Object.freeze({ severity: "low", module: "ipa", scope: "entry" }),
    multiple_primary_stress: Object.freeze({ severity: "medium", module: "ipa", scope: "entry" }),
    tag_too_long: Object.freeze({ severity: "low", module: "tags", scope: "entry" }),
    source_unresolved: Object.freeze({ severity: "medium", module: "network", scope: "entry" }),
    source_cycle: Object.freeze({ severity: "high", module: "network", scope: "entry" }),
  });
  const QUALITY_TAG_LENGTH_LIMIT = 24;
  const QUALITY_BUILD_BATCH_SIZE = 256;
  const NETWORK_ISSUE_CODES = new Set(["source_unresolved", "source_cycle"]);

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

  function qualityIssuesWithEntries(issues = []) {
    return (issues || []).filter((issue) => issue.entryId);
  }

  function qualityIssuesByModule(reportOrIssues = {}, module = "other") {
    const issues = Array.isArray(reportOrIssues) ? reportOrIssues : reportOrIssues.issues;
    return (issues || []).filter((issue) => (issue.module || "other") === module);
  }

  function entryIdsFrom(items = []) {
    return [...new Set((items || [])
      .map((item) => typeof item === "string" ? item : item?.id || item?.entryId)
      .filter(Boolean))];
  }

  function qualityIssueAffectedEntryIds(issue = {}) {
    return uniqueStrings([issue.entryId, ...(issue.relatedEntryIds || [])]);
  }

  function qualityIssueIdentity(issue = {}) {
    return JSON.stringify({
      rulesetVersion: QUALITY_RULESET_VERSION,
      code: issue.code || "",
      entryId: issue.entryId || "",
      params: issue.params || {},
    });
  }

  function buildQualitySummary(reportOrIssues = {}, inputEntryCount = 0) {
    const issues = Array.isArray(reportOrIssues) ? reportOrIssues : reportOrIssues.issues || [];
    const affectedEntryIds = entryIdsFrom(issues.flatMap(qualityIssueAffectedEntryIds));
    const summaryRows = (keys, field) => keys.map((key) => {
      const matchingIssues = issues.filter((issue) => (issue[field] || "other") === key);
      return {
        key,
        issueCount: matchingIssues.length,
        entryCount: entryIdsFrom(matchingIssues.flatMap(qualityIssueAffectedEntryIds)).length,
      };
    });
    return {
      inputEntryCount: Math.max(0, Number(inputEntryCount) || 0),
      issueCount: issues.length,
      affectedEntryCount: affectedEntryIds.length,
      globalIssueCount: issues.filter((issue) => !issue.entryId).length,
      severities: summaryRows(QUALITY_SEVERITY_KEYS, "severity"),
      modules: summaryRows(QUALITY_MODULE_KEYS, "module"),
    };
  }

  function qualityIssueEntryIdsByModule(reportOrIssues = {}, module = "other") {
    return entryIdsFrom(qualityIssuesByModule(reportOrIssues, module).flatMap(qualityIssueAffectedEntryIds));
  }

  function mapPush(map, key, value) {
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(value);
  }

  function parseGloss(example) {
    const gloss = { gla: [], glb: [], glc: [], ft: "" };
    let hasGloss = false;
    String(example || "")
      .replaceAll("\\n", "\n")
      .split(/\r?\n/)
      .forEach((line) => {
        const match = line.match(/^\\(gla|glb|glc|ft)\s*(.*)$/);
        if (!match) {
          return;
        }
        hasGloss = true;
        if (match[1] === "ft") {
          gloss.ft = match[2].trim();
        } else {
          gloss[match[1]] = match[2].trim().split(/\s+/).filter(Boolean);
        }
      });
    return hasGloss ? gloss : null;
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

  function qualityInputRecordFromEntry(entry) {
    return {
      id: entry.id,
      lemma: entry.lemma,
      pronunciation: entry.pronunciation,
      tags: entry.tags,
      definitions: entry.definitions,
      sources: entry.etymology.sources,
    };
  }

  // Records carry only id, lemma, pronunciation, ordered tags, definitions
  // (id, meaning, example) and ordered sources (entryId, text). Issue order
  // follows record order and is the stable server issue order.
  function* qualityIssueSteps(records, issues) {
    const duplicateLemmas = new Map();
    const normalizedTagForms = new Map();
    const indexById = new Map();

    for (let index = 0; index < records.length; index += 1) {
      const entry = records[index];
      indexById.set(entry.id, index);
      const lemmaKey = normalizeText(entry.lemma);
      if (lemmaKey) {
        mapPush(duplicateLemmas, lemmaKey, entry);
      }
      entry.tags.forEach((tag) => {
        const compact = normalizeText(tag).replace(/[^\p{L}\p{N}]+/gu, "");
        if (compact) {
          mapPush(normalizedTagForms, compact, { entryId: entry.id, tag });
        }
      });
      entry.definitions.forEach((definition, definitionPosition) => {
        const gloss = parseGloss(definition.example);
        if (!gloss) {
          return;
        }
        const missingFields = ["gla", "glb", "ft"].filter((key) => key === "ft" ? !gloss.ft : !gloss[key].length);
        if (missingFields.length) {
          issues.push(createQualityIssue("gloss_incomplete", entry.id, {
            definitionId: definition.id,
            definitionPosition,
            missingFields,
          }));
        } else if (gloss.gla.length !== gloss.glb.length) {
          issues.push(createQualityIssue("gloss_alignment_mismatch", entry.id, {
            definitionId: definition.id,
            definitionPosition,
            glaCount: gloss.gla.length,
            glbCount: gloss.glb.length,
          }));
        }
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
    yield;

    const cycleParams = sourceCycleParams(records, indexById);
    yield;

    for (let index = 0; index < records.length; index += 1) {
      const entry = records[index];
      if (!entry.lemma) {
        issues.push(createQualityIssue("missing_lemma", entry.id));
      }
      if (!entry.tags.length) {
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
      entry.tags.forEach((tag) => {
        const codePointLength = Array.from(tag).length;
        if (codePointLength > QUALITY_TAG_LENGTH_LIMIT) {
          issues.push(createQualityIssue("tag_too_long", entry.id, {
            tag,
            codePointLength,
            limit: QUALITY_TAG_LENGTH_LIMIT,
          }));
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

  function buildQualityIssues(records) {
    const issues = [];
    const steps = qualityIssueSteps(records, issues);
    while (!steps.next().done) {
      // Synchronous callers run every batch back to back.
    }
    return issues;
  }

  async function buildQualityIssuesAsync(records, yieldControl) {
    const issues = [];
    const steps = qualityIssueSteps(records, issues);
    while (!steps.next().done) {
      await yieldControl();
    }
    return issues;
  }

  function defaultText(zh, _en) {
    return zh;
  }

  function qualityIssueTitle(code, text) {
    const titles = {
      gloss_incomplete: ["Gloss 不完整", "Incomplete gloss"],
      gloss_alignment_mismatch: ["Gloss 对齐数量不一致", "Gloss alignment mismatch"],
      duplicate_lemma: ["重复词形", "Duplicate lemma"],
      near_duplicate_tags: ["近似标签可能不一致", "Near-duplicate tags"],
      missing_lemma: ["缺少词形", "Missing lemma"],
      missing_tags: ["缺少标签", "Missing tags"],
      missing_definition: ["缺少释义", "Missing definition"],
      missing_ipa: ["缺少 IPA", "Missing IPA"],
      multiple_primary_stress: ["多个主重音", "Multiple primary stresses"],
      tag_too_long: ["标签过长", "Long tag"],
      source_unresolved: ["未解析来源", "Unresolved source"],
      source_cycle: ["词源循环引用", "Etymology cycle"],
    };
    return text(...titles[code]);
  }

  function qualityIssueDetail(issue, text) {
    const params = issue.params;
    switch (issue.code) {
      case "gloss_incomplete":
        return `${text("缺少", "Missing")}: ${params.missingFields.map((key) => `\\${key}`).join(", ")}`;
      case "gloss_alignment_mismatch":
        return `\\gla ${params.glaCount} / \\glb ${params.glbCount}`;
      case "duplicate_lemma":
        return params.lemmas.join(", ");
      case "near_duplicate_tags":
        return params.forms.join(", ");
      case "multiple_primary_stress":
        return `${text("主重音数量", "Primary stress count")}: ${params.primaryStressCount}`;
      case "tag_too_long":
        return params.tag;
      case "source_unresolved":
        return params.sourceText;
      case "source_cycle":
        return params.cycleLemmas.join(" → ");
      default:
        return "";
    }
  }

  // Local display report for the current quality page; F5-2 replaces it with
  // the remote quality result and code-based localization.
  function buildQualityReport(dictionary = {}, options = {}) {
    const text = options.text || defaultText;
    const entries = dictionary.entries || [];
    const lemmaById = new Map(entries.map((entry) => [entry.id, entry.lemma]));
    const issues = buildQualityIssues(entries.map(qualityInputRecordFromEntry)).map((issue) => ({
      ...issue,
      entryLemma: lemmaById.get(issue.entryId) || "",
      title: qualityIssueTitle(issue.code, text),
      detail: qualityIssueDetail(issue, text),
    }));
    return {
      rulesetVersion: QUALITY_RULESET_VERSION,
      issues,
      networkIssues: issues.filter((issue) => NETWORK_ISSUE_CODES.has(issue.code)),
      summary: buildQualitySummary(issues, entries.length),
    };
  }

  return {
    QUALITY_ISSUE_DEFINITIONS,
    QUALITY_MODULE_KEYS,
    QUALITY_RULESET_VERSION,
    QUALITY_SEVERITY_KEYS,
    buildQualityIssues,
    buildQualityIssuesAsync,
    buildQualityReport,
    buildQualitySummary,
    createQualityIssue,
    parseGloss,
    qualityInputRecordFromEntry,
    qualityIssueAffectedEntryIds,
    qualityIssueEntryIdsByModule,
    qualityIssueIdentity,
    qualityIssuesByModule,
    qualityIssuesWithEntries,
  };
});
