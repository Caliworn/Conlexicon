(function initQualityModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./ipa-model"),
      require("./entry-relations-model"),
      require("./search-normalization-model"),
    );
    return;
  }
  root.ConlexiconQuality = factory(
    root.ConlexiconIpa,
    root.ConlexiconEntryRelations,
    root.ConlexiconSearchNormalization,
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function createQualityModel(ipaModel, entryRelationsModel, searchNormalization) {
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

  function defaultText(zh, _en) {
    return zh;
  }

  function uniqueStrings(values = []) {
    return [...new Set((values || []).map((value) => String(value || "")).filter(Boolean))];
  }

  function addQualityIssue(list, code, entry, title, detail = "", params = {}, extra = {}) {
    const definition = QUALITY_ISSUE_DEFINITIONS[code];
    if (!definition) {
      throw new TypeError(`Unknown quality issue code: ${code}`);
    }
    const issue = {
      code,
      severity: definition.severity,
      entryId: entry?.id || "",
      entryLemma: entry?.lemma || "",
      title,
      detail,
      module: definition.module,
      params: params && typeof params === "object" && !Array.isArray(params) ? params : {},
      ...extra,
    };
    if (issue.relatedEntryIds) {
      issue.relatedEntryIds = uniqueStrings(issue.relatedEntryIds);
    }
    list.push(issue);
    return issue;
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

  function resolveSourceEntry(sourceName, dictionary = {}, options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    if (entryRelationsModel?.resolveSourceEntry) {
      const index = options.relationIndex || options.index || entryRelationsModel.buildEntryRelationIndex?.(dictionary, {
        ...options,
        normalizeText: normalize,
      });
      return entryRelationsModel.resolveSourceEntry(sourceName, dictionary, {
        ...options,
        normalizeText: normalize,
        index,
      });
    }
    const normalized = normalize(sourceName);
    return (dictionary.entries || []).find((entry) =>
      normalize(entry.lemma) === normalized || normalize(entry.id) === normalized
    ) || null;
  }

  function sourceCycleForEntry(entry, dictionary = {}, options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const relationIndex = options.relationIndex || options.index || entryRelationsModel?.buildEntryRelationIndex?.(dictionary, {
      ...options,
      normalizeText: normalize,
    });
    const path = [];
    const seen = new Set();
    const visit = (current) => {
      if (!current) {
        return [];
      }
      if (seen.has(current.id)) {
        const index = path.findIndex((item) => item.id === current.id);
        return index >= 0 ? [...path.slice(index), current] : [current];
      }
      seen.add(current.id);
      path.push(current);
      for (const sourceName of current.etymology?.sources || []) {
        const source = resolveSourceEntry(sourceName, dictionary, {
          ...options,
          normalizeText: normalize,
          relationIndex,
          index: relationIndex,
        });
        const cycle = visit(source);
        if (cycle.length) {
          return cycle;
        }
      }
      path.pop();
      seen.delete(current.id);
      return [];
    };
    return visit(entry);
  }

  function buildQualityReport(dictionary = {}, options = {}) {
    const text = options.text || defaultText;
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const entries = dictionary.entries || [];
    const issues = [];
    const networkIssues = [];
    const duplicateLemmas = new Map();
    const normalizedTagForms = new Map();
    const relationIndex = entryRelationsModel?.buildEntryRelationIndex?.(dictionary, {
      ...options,
      normalizeText: normalize,
    });

    entries.forEach((entry) => {
      const lemmaKey = normalize(entry.lemma);
      if (lemmaKey) {
        mapPush(duplicateLemmas, lemmaKey, entry);
      }
      (entry.tags || []).forEach((tag) => {
        const compact = normalize(tag).replace(/[^\p{L}\p{N}]+/gu, "");
        if (compact) {
          mapPush(normalizedTagForms, compact, { entryId: entry.id || "", tag });
        }
      });
      (entry.definitions || []).forEach((definition, definitionPosition) => {
        const gloss = parseGloss(definition.example);
        if (!gloss) {
          return;
        }
        const missing = ["gla", "glb", "ft"].filter((key) => key === "ft" ? !gloss.ft : !gloss[key]?.length);
        if (missing.length) {
          addQualityIssue(
            issues,
            "gloss_incomplete",
            entry,
            text("Gloss 不完整", "Incomplete gloss"),
            `${text("缺少", "Missing")}: ${missing.map((key) => `\\${key}`).join(", ")}`,
            {
              definitionId: definition.id || "",
              definitionPosition,
              missingFields: missing,
            },
          );
        } else if (gloss.gla.length !== gloss.glb.length) {
          addQualityIssue(
            issues,
            "gloss_alignment_mismatch",
            entry,
            text("Gloss 对齐数量不一致", "Gloss alignment mismatch"),
            `\\gla ${gloss.gla.length} / \\glb ${gloss.glb.length}`,
            {
              definitionId: definition.id || "",
              definitionPosition,
              glaCount: gloss.gla.length,
              glbCount: gloss.glb.length,
            },
          );
        }
      });
    });

    duplicateLemmas.forEach((items) => {
      if (items.length > 1) {
        items.forEach((entry) => addQualityIssue(
          issues,
          "duplicate_lemma",
          entry,
          text("重复词形", "Duplicate lemma"),
          items.map((item) => item.lemma).join(", "),
          {
            lemmas: items.map((item) => item.lemma || ""),
            duplicateEntryCount: items.length,
          },
        ));
      }
    });

    normalizedTagForms.forEach((records) => {
      const forms = uniqueStrings(records.map((record) => record.tag));
      if (forms.length > 1) {
        addQualityIssue(
          issues,
          "near_duplicate_tags",
          null,
          text("近似标签可能不一致", "Near-duplicate tags"),
          forms.join(", "),
          { forms },
          { relatedEntryIds: records.map((record) => record.entryId) },
        );
      }
    });

    entries.forEach((entry) => {
      if (!entry.lemma) {
        addQualityIssue(issues, "missing_lemma", entry, text("缺少词形", "Missing lemma"));
      }
      if (!(entry.tags || []).length) {
        addQualityIssue(issues, "missing_tags", entry, text("缺少标签", "Missing tags"));
      }
      if (!(entry.definitions || []).some((definition) => definition.meaning)) {
        addQualityIssue(issues, "missing_definition", entry, text("缺少释义", "Missing definition"));
      }
      if (!entry.pronunciation) {
        addQualityIssue(issues, "missing_ipa", entry, text("缺少 IPA", "Missing IPA"));
      } else {
        const primaryStressCount = ipaModel.countPrimaryStressMarks(entry.pronunciation);
        if (primaryStressCount > 1) {
          addQualityIssue(
            issues,
            "multiple_primary_stress",
            entry,
            text("多个主重音", "Multiple primary stresses"),
            `${text("主重音数量", "Primary stress count")}: ${primaryStressCount}`,
            { primaryStressCount },
          );
        }
      }
      (entry.tags || [])
        .filter((tag) => Array.from(tag).length > 24)
        .forEach((tag) => addQualityIssue(
          issues,
          "tag_too_long",
          entry,
          text("标签过长", "Long tag"),
          tag,
          { tag, codePointLength: Array.from(tag).length, limit: 24 },
        ));
      (entry.etymology?.sources || []).forEach((sourceName, sourcePosition) => {
        if (!resolveSourceEntry(sourceName, dictionary, { normalizeText: normalize, relationIndex })) {
          const issueOptions = [
            "source_unresolved",
            entry,
            text("未解析来源", "Unresolved source"),
            sourceName,
            { sourceText: sourceName, sourcePosition },
          ];
          addQualityIssue(networkIssues, ...issueOptions);
          addQualityIssue(issues, ...issueOptions);
        }
      });
      const cycle = sourceCycleForEntry(entry, dictionary, { normalizeText: normalize, relationIndex });
      if (cycle.length) {
        const detail = cycle.map((item) => item.lemma).join(" → ");
        const issueOptions = [
          "source_cycle",
          entry,
          text("词源循环引用", "Etymology cycle"),
          detail,
          {
            cycleEntryIds: cycle.map((item) => item.id || ""),
            cycleLemmas: cycle.map((item) => item.lemma || ""),
          },
        ];
        addQualityIssue(networkIssues, ...issueOptions);
        addQualityIssue(issues, ...issueOptions);
      }
    });

    return {
      rulesetVersion: QUALITY_RULESET_VERSION,
      issues,
      networkIssues,
      summary: buildQualitySummary(issues, entries.length),
    };
  }

  return {
    QUALITY_ISSUE_DEFINITIONS,
    QUALITY_MODULE_KEYS,
    QUALITY_RULESET_VERSION,
    QUALITY_SEVERITY_KEYS,
    addQualityIssue,
    buildQualitySummary,
    buildQualityReport,
    parseGloss,
    qualityIssueAffectedEntryIds,
    qualityIssueEntryIdsByModule,
    qualityIssueIdentity,
    qualityIssuesByModule,
    qualityIssuesWithEntries,
    resolveSourceEntry,
    sourceCycleForEntry,
  };
});
