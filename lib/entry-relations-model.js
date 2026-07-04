(function initEntryRelationsModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconEntryRelations = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createEntryRelationsModel() {
  function normalizeText(value, locale = "zh-CN") {
    return String(value || "").trim().toLocaleLowerCase(locale);
  }

  function defaultCompareEntries(a = {}, b = {}) {
    return String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
  }

  function entryHasSources(entry) {
    return Boolean(entry?.etymology?.sources?.length);
  }

  function buildEntryRelationIndex(dictionary = {}, options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const compareEntries = options.compareEntries || defaultCompareEntries;
    const entries = [...(dictionary.entries || [])].sort(compareEntries);
    const byId = new Map();
    const byLemma = new Map();
    const derivedBySourceKey = new Map();
    entries.forEach((entry) => {
      const idKey = normalize(entry.id);
      const lemmaKey = normalize(entry.lemma);
      if (idKey && !byId.has(idKey)) {
        byId.set(idKey, entry);
      }
      if (lemmaKey && !byLemma.has(lemmaKey)) {
        byLemma.set(lemmaKey, entry);
      }
      const sourceKeys = new Set((entry.etymology?.sources || []).map(normalize).filter(Boolean));
      sourceKeys.forEach((sourceKey) => {
        if (!derivedBySourceKey.has(sourceKey)) {
          derivedBySourceKey.set(sourceKey, []);
        }
        derivedBySourceKey.get(sourceKey).push(entry);
      });
    });
    return { entries, byId, byLemma, derivedBySourceKey, normalize, compareEntries };
  }

  function resolveSourceEntry(sourceName, dictionary = {}, options = {}) {
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const key = index.normalize(sourceName);
    return index.byLemma.get(key) || index.byId.get(key) || null;
  }

  function entrySourceKeys(entry = {}, normalize = normalizeText) {
    return new Set([normalize(entry.id), normalize(entry.lemma)].filter(Boolean));
  }

  function entryIsDirectlyDerivedFrom(entry = {}, sourceEntry = {}, options = {}) {
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const keys = entrySourceKeys(sourceEntry, normalize);
    return (entry.etymology?.sources || []).some((source) => keys.has(normalize(source)));
  }

  function findDerivedEntries(entry, dictionary = {}, options = {}) {
    if (!entry) {
      return [];
    }
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const derivedById = new Map();
    entrySourceKeys(entry, index.normalize).forEach((sourceKey) => {
      (index.derivedBySourceKey.get(sourceKey) || []).forEach((candidate) => {
        if (candidate.id !== entry.id) {
          derivedById.set(candidate.id, candidate);
        }
      });
    });
    return [...derivedById.values()].sort(index.compareEntries);
  }

  function sourceRootEntries(entry, dictionary = {}, options = {}, seen = new Set()) {
    if (!entry) {
      return [];
    }
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const roots = [];
    (entry.etymology?.sources || []).forEach((sourceName) => {
      const source = resolveSourceEntry(sourceName, dictionary, { ...options, index });
      if (!source || seen.has(source.id)) {
        return;
      }
      seen.add(source.id);
      if (!entryHasSources(source)) {
        roots.push(source);
        return;
      }
      const ancestors = sourceRootEntries(source, dictionary, { ...options, index }, seen);
      if (ancestors.length) {
        roots.push(...ancestors);
      } else {
        roots.push(source);
      }
    });
    return roots;
  }

  function ensureRootGroup(groups, entry) {
    if (!groups.has(entry.id)) {
      groups.set(entry.id, { root: entry, derived: [], matchedDerived: [], rootMatches: false });
    }
    return groups.get(entry.id);
  }

  function rootModeGroups(dictionary = {}, options = {}) {
    const query = String(options.query || "");
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const groups = new Map();
    const matchesEntry = options.matchesEntry || (() => true);

    index.entries.forEach((entry) => {
      if (!entryHasSources(entry)) {
        ensureRootGroup(groups, entry);
      }
    });

    index.entries.forEach((entry) => {
      if (!entryHasSources(entry)) {
        return;
      }
      const roots = sourceRootEntries(entry, dictionary, { ...options, index });
      if (!roots.length) {
        ensureRootGroup(groups, entry);
        return;
      }
      roots.forEach((root) => {
        const group = ensureRootGroup(groups, root);
        if (!group.derived.some((item) => item.id === entry.id)) {
          group.derived.push(entry);
        }
      });
    });

    return [...groups.values()]
      .map((group) => {
        const rootMatches = matchesEntry(group.root);
        const matchedDerived = group.derived.filter(matchesEntry);
        return {
          ...group,
          derived: (query && !rootMatches ? matchedDerived : group.derived).sort(index.compareEntries),
          matchedDerived,
          rootMatches,
        };
      })
      .filter((group) => !query || group.rootMatches || group.matchedDerived.length)
      .sort((a, b) => index.compareEntries(a.root, b.root));
  }

  function rootCount(dictionary = {}, options = {}) {
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const rootIds = new Set();
    index.entries.forEach((entry) => {
      if (!entryHasSources(entry)) {
        rootIds.add(entry.id);
      }
    });
    index.entries.forEach((entry) => {
      if (!entryHasSources(entry)) {
        return;
      }
      const roots = sourceRootEntries(entry, dictionary, { ...options, index });
      if (!roots.length) {
        rootIds.add(entry.id);
        return;
      }
      roots.forEach((root) => rootIds.add(root.id));
    });
    return rootIds.size;
  }

  function relationForEntry(entry, dictionary = {}, options = {}) {
    if (!entry) {
      return { entryId: "", sources: [], derivedEntries: [], rootGroup: null };
    }
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const sourceTexts = entry.etymology?.sources || [];
    const sources = sourceTexts.map((sourceText) => {
      const matchedEntry = resolveSourceEntry(sourceText, dictionary, { ...options, index });
      return {
        sourceText,
        matchedEntry,
        matchedEntryId: matchedEntry?.id || "",
        matchedLemma: matchedEntry?.lemma || "",
      };
    });
    const derivedEntries = findDerivedEntries(entry, dictionary, { ...options, index });
    const containingGroup = rootModeGroups(dictionary, { ...options, query: "", index })
      .find((group) => group.root.id === entry.id || group.derived.some((candidate) => candidate.id === entry.id));
    return {
      entryId: entry.id || "",
      sources,
      derivedEntries,
      rootGroup: containingGroup
        ? {
          root: containingGroup.root,
          rootKey: containingGroup.root.lemma || containingGroup.root.id || "",
          entries: [containingGroup.root, ...containingGroup.derived],
        }
        : null,
    };
  }

  return {
    buildEntryRelationIndex,
    entryHasSources,
    entryIsDirectlyDerivedFrom,
    findDerivedEntries,
    relationForEntry,
    resolveSourceEntry,
    rootCount,
    rootModeGroups,
    sourceRootEntries,
  };
});
