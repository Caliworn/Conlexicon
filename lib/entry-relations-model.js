(function initEntryRelationsModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./search-normalization-model"), require("./etymology-graph-model"));
    return;
  }
  root.ConlexiconEntryRelations = factory(root.ConlexiconSearchNormalization, root.ConlexiconEtymologyGraph);
})(typeof globalThis !== "undefined" ? globalThis : this, function createEntryRelationsModel(searchNormalization, etymologyGraph) {
  const normalizeText = searchNormalization.normalizeText;

  function defaultCompareEntries(a = {}, b = {}) {
    return String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
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
      const sourceKeys = new Set((entry.etymology?.sources || []).map((source) => source.entryId).filter(Boolean));
      sourceKeys.forEach((sourceKey) => {
        if (!derivedBySourceKey.has(sourceKey)) {
          derivedBySourceKey.set(sourceKey, []);
        }
        derivedBySourceKey.get(sourceKey).push(entry);
      });
    });
    return { entries, byId, byLemma, entriesById: new Map(entries.map((entry) => [entry.id, entry])), derivedBySourceKey, normalize, compareEntries };
  }

  function resolveSourceEntry(sourceName, dictionary = {}, options = {}) {
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    return sourceName?.entryId ? index.entriesById.get(sourceName.entryId) || null : null;
  }

  function findDerivedEntries(entry, dictionary = {}, options = {}) {
    if (!entry) {
      return [];
    }
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const derivedById = new Map();
    [entry.id].forEach((sourceKey) => {
      (index.derivedBySourceKey.get(sourceKey) || []).forEach((candidate) => {
        if (candidate.id !== entry.id) {
          derivedById.set(candidate.id, candidate);
        }
      });
    });
    return [...derivedById.values()].sort(index.compareEntries);
  }

  function rootModeGroups(dictionary = {}, options = {}) {
    const query = String(options.query || "");
    const index = options.index || buildEntryRelationIndex(dictionary, options);
    const matchesEntry = options.matchesEntry || (() => true);
    const graph = etymologyGraph.buildEtymologyGraph({
      entryIds: index.entries.map((entry) => entry.id),
      sourceIds: new Map(index.entries.map((entry) => [
        entry.id,
        (entry.etymology?.sources || []).map((source) => source.entryId),
      ])),
    });

    return [...graph.derivedIdsByRootId]
      .map(([rootId, derivedIds]) => {
        const root = index.entriesById.get(rootId);
        const derived = derivedIds.map((entryId) => index.entriesById.get(entryId)).sort(index.compareEntries);
        const rootMatches = matchesEntry(root);
        const matchedDerived = derived.filter(matchesEntry);
        return {
          root,
          derived: query && !rootMatches ? matchedDerived : derived,
          matchedDerived,
          rootMatches,
        };
      })
      .filter((group) => !query || group.rootMatches || group.matchedDerived.length)
      .sort((a, b) => index.compareEntries(a.root, b.root));
  }

  return {
    buildEntryRelationIndex,
    findDerivedEntries,
    resolveSourceEntry,
    rootModeGroups,
  };
});
