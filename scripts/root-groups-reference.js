// Snapshot-based reference for /root-groups. The repository contract compares
// API windows, search and sorting against it; the app itself never loads it.
const etymologyGraph = require("../lib/etymology-graph-model");

function defaultCompareEntries(a = {}, b = {}) {
  return String(a.lemma || "").localeCompare(String(b.lemma || ""), "zh-CN");
}

function rootModeGroups(dictionary = {}, options = {}) {
  const query = String(options.query || "");
  const compareEntries = options.compareEntries || defaultCompareEntries;
  const matchesEntry = options.matchesEntry || (() => true);
  const entries = [...(dictionary.entries || [])].sort(compareEntries);
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const graph = etymologyGraph.buildEtymologyGraph({
    entryIds: entries.map((entry) => entry.id),
    sourceIds: new Map(entries.map((entry) => [
      entry.id,
      (entry.etymology?.sources || []).map((source) => source.entryId),
    ])),
  });

  return [...graph.derivedIdsByRootId]
    .map(([rootId, derivedIds]) => {
      const root = entriesById.get(rootId);
      const derived = derivedIds.map((entryId) => entriesById.get(entryId)).sort(compareEntries);
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
    .sort((a, b) => compareEntries(a.root, b.root));
}

module.exports = {
  rootModeGroups,
};
