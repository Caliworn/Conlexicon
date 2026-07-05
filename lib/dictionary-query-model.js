(function initDictionaryQueryModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./entry-relations-model"));
    return;
  }
  root.ConlexiconDictionaryQuery = factory(root.ConlexiconEntryRelations);
})(typeof globalThis !== "undefined" ? globalThis : this, function createDictionaryQueryModel(entryRelationsModel) {
  function normalizeText(value, locale = "zh-CN") {
    return String(value || "").trim().toLocaleLowerCase(locale);
  }

  function defaultCompareEntries(a = {}, b = {}) {
    return String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
  }

  function defaultEntryHasSources(entry) {
    return Boolean(entry?.etymology?.sources?.length);
  }

  function createDictionaryQueryContext(dictionary = {}, options = {}) {
    const entries = Array.isArray(dictionary.entries) ? dictionary.entries : [];
    const normalize = options.normalizeText || ((value) => normalizeText(value, options.locale || "zh-CN"));
    const compareEntries = options.compareEntries || defaultCompareEntries;
    const entryHasSources = options.entryHasSources
      || entryRelationsModel?.entryHasSources
      || defaultEntryHasSources;

    let entryByIdCache = null;
    let relationIndexCache = null;
    let relationMetricsCache = null;

    function entryById() {
      if (!entryByIdCache) {
        entryByIdCache = new Map();
        entries.forEach((entry) => {
          if (entry?.id) {
            entryByIdCache.set(entry.id, entry);
          }
        });
      }
      return entryByIdCache;
    }

    function getEntryById(id) {
      return entryById().get(id) || null;
    }

    function getEntriesByIds(ids = []) {
      const byId = entryById();
      return ids.map((id) => byId.get(id)).filter(Boolean);
    }

    function relationIndex() {
      if (!relationIndexCache) {
        if (!entryRelationsModel?.buildEntryRelationIndex) {
          relationIndexCache = {
            entries: [...entries].sort(compareEntries),
            normalize,
            compareEntries,
          };
        } else {
          relationIndexCache = entryRelationsModel.buildEntryRelationIndex(dictionary, {
            normalizeText: normalize,
            compareEntries,
          });
        }
      }
      return relationIndexCache;
    }

    function relationMetrics() {
      if (relationMetricsCache) {
        return relationMetricsCache;
      }

      const index = relationIndex();
      const indexedEntries = index.entries || [...entries].sort(compareEntries);
      const derivedEntries = indexedEntries.filter(entryHasSources);
      const multiSourceEntries = indexedEntries.filter((entry) => (entry.etymology?.sources || []).length > 1);
      const groups = new Map();

      const ensureGroup = (root) => {
        if (!root?.id) {
          return null;
        }
        if (!groups.has(root.id)) {
          groups.set(root.id, { root, derivedCount: 0, derivedIds: new Set() });
        }
        return groups.get(root.id);
      };

      indexedEntries.forEach((entry) => {
        if (!entryHasSources(entry)) {
          ensureGroup(entry);
        }
      });

      derivedEntries.forEach((entry) => {
        const roots = entryRelationsModel?.sourceRootEntries
          ? entryRelationsModel.sourceRootEntries(entry, dictionary, {
            normalizeText: normalize,
            compareEntries,
            index,
          })
          : [];

        if (!roots.length) {
          ensureGroup(entry);
          return;
        }

        const rootIds = new Set();
        roots.forEach((root) => {
          if (!root?.id || rootIds.has(root.id)) {
            return;
          }
          rootIds.add(root.id);
          const group = ensureGroup(root);
          if (group && !group.derivedIds.has(entry.id)) {
            group.derivedIds.add(entry.id);
            group.derivedCount += 1;
          }
        });
      });

      const rootGroups = [...groups.values()].sort((a, b) => compareEntries(a.root, b.root));
      relationMetricsCache = {
        rootGroups,
        derivedEntries,
        multiSourceEntries,
      };
      return relationMetricsCache;
    }

    function relationSummary() {
      const { rootGroups, derivedEntries, multiSourceEntries } = relationMetrics();
      const derivedIdSet = new Set(derivedEntries.map((entry) => entry.id));
      const isolatedRootCount = rootGroups
        .filter((group) => !group.derivedCount && !derivedIdSet.has(group.root.id))
        .length;
      return {
        rootCount: rootGroups.length,
        derivedCount: derivedEntries.length,
        derivedEntryIds: derivedEntries.map((entry) => entry.id),
        isolatedRootCount,
        multiSourceCount: multiSourceEntries.length,
        multiSourceEntryIds: multiSourceEntries.map((entry) => entry.id),
      };
    }

    function rootFamilies(options = {}) {
      const limit = Number.isFinite(options.limit)
        ? Math.max(0, Math.floor(options.limit))
        : 12;
      const rows = relationMetrics().rootGroups
        .filter((group) => group.derivedCount)
        .sort((a, b) => b.derivedCount - a.derivedCount || compareEntries(a.root, b.root))
        .map((group) => ({
          root: group.root,
          rootId: group.root.id || "",
          lemma: group.root.lemma || "",
          derivedCount: group.derivedCount,
          derivedEntryIds: [...group.derivedIds],
        }));
      return {
        rows: rows.slice(0, limit),
        allRows: options.includeAll === false ? [] : rows,
      };
    }

    return {
      dictionary,
      entries,
      getEntryById,
      getEntriesByIds,
      relationIndex,
      relationMetrics,
      relationSummary,
      rootFamilies,
    };
  }

  return {
    createDictionaryQueryContext,
  };
});
