(function initQualityModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ipa-model"), require("./entry-relations-model"));
    return;
  }
  root.ConlexiconQuality = factory(root.ConlexiconIpa, root.ConlexiconEntryRelations);
})(typeof globalThis !== "undefined" ? globalThis : this, function createQualityModel(ipaModel, entryRelationsModel) {
  function normalizeText(value, locale = "zh-CN") {
    return String(value || "").trim().toLocaleLowerCase(locale);
  }

  function defaultText(zh, _en) {
    return zh;
  }

  function addQualityIssue(list, severity, entry, title, detail = "", module = "other", extra = {}) {
    list.push({
      severity,
      entryId: entry?.id || "",
      entryLemma: entry?.lemma || "",
      title,
      detail,
      module,
      ...extra,
    });
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

  function qualityIssueEntryIdsByModule(reportOrIssues = {}, module = "other") {
    return entryIdsFrom(qualityIssuesByModule(reportOrIssues, module).map((issue) => issue.entryId));
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
          mapPush(normalizedTagForms, compact, tag);
        }
      });
      (entry.definitions || []).forEach((definition) => {
        const gloss = parseGloss(definition.example);
        if (!gloss) {
          return;
        }
        const missing = ["gla", "glb", "ft"].filter((key) => key === "ft" ? !gloss.ft : !gloss[key]?.length);
        if (missing.length) {
          addQualityIssue(
            issues,
            "medium",
            entry,
            text("Gloss 不完整", "Incomplete gloss"),
            `${text("缺少", "Missing")}: ${missing.map((key) => `\\${key}`).join(", ")}`,
            "gloss",
          );
        } else if (gloss.gla.length !== gloss.glb.length) {
          addQualityIssue(
            issues,
            "medium",
            entry,
            text("Gloss 对齐数量不一致", "Gloss alignment mismatch"),
            `\\gla ${gloss.gla.length} / \\glb ${gloss.glb.length}`,
            "gloss",
          );
        }
      });
    });

    duplicateLemmas.forEach((items) => {
      if (items.length > 1) {
        items.forEach((entry) => addQualityIssue(
          issues,
          "high",
          entry,
          text("重复词形", "Duplicate lemma"),
          items.map((item) => item.lemma).join(", "),
          "lemma",
        ));
      }
    });

    normalizedTagForms.forEach((forms) => {
      const unique = [...new Set(forms)];
      if (unique.length > 1) {
        issues.push({
          severity: "low",
          title: text("近似标签可能不一致", "Near-duplicate tags"),
          detail: unique.join(", "),
          module: "tags",
        });
      }
    });

    entries.forEach((entry) => {
      if (!entry.lemma) {
        addQualityIssue(issues, "high", entry, text("缺少词形", "Missing lemma"), "", "lemma");
      }
      if (!(entry.tags || []).length) {
        addQualityIssue(issues, "high", entry, text("缺少标签", "Missing tags"), "", "tags");
      }
      if (!(entry.definitions || []).some((definition) => definition.meaning)) {
        addQualityIssue(issues, "high", entry, text("缺少释义", "Missing definition"));
      }
      if (!entry.pronunciation) {
        addQualityIssue(issues, "low", entry, text("缺少 IPA", "Missing IPA"), "", "ipa");
      } else {
        const primaryStressCount = ipaModel.countPrimaryStressMarks(entry.pronunciation);
        if (primaryStressCount > 1) {
          addQualityIssue(
            issues,
            "medium",
            entry,
            text("多个主重音", "Multiple primary stresses"),
            `${text("主重音数量", "Primary stress count")}: ${primaryStressCount}`,
            "ipa",
          );
        }
      }
      (entry.tags || [])
        .filter((tag) => Array.from(tag).length > 24)
        .forEach((tag) => addQualityIssue(issues, "low", entry, text("标签过长", "Long tag"), tag, "tags"));
      (entry.etymology?.sources || []).forEach((sourceName) => {
        if (!resolveSourceEntry(sourceName, dictionary, { normalizeText: normalize, relationIndex })) {
          addQualityIssue(networkIssues, "medium", entry, text("未解析来源", "Unresolved source"), sourceName, "network");
          addQualityIssue(issues, "medium", entry, text("未解析来源", "Unresolved source"), sourceName, "network");
        }
      });
      const cycle = sourceCycleForEntry(entry, dictionary, { normalizeText: normalize, relationIndex });
      if (cycle.length) {
        const detail = cycle.map((item) => item.lemma).join(" → ");
        addQualityIssue(networkIssues, "high", entry, text("词源循环引用", "Etymology cycle"), detail, "network");
        addQualityIssue(issues, "high", entry, text("词源循环引用", "Etymology cycle"), detail, "network");
      }
    });

    return { issues, networkIssues };
  }

  return {
    addQualityIssue,
    buildQualityReport,
    parseGloss,
    qualityIssueEntryIdsByModule,
    qualityIssuesByModule,
    qualityIssuesWithEntries,
    resolveSourceEntry,
    sourceCycleForEntry,
  };
});
