// Snapshot-based reference for /root-groups. The repository contract compares
// API windows, search and sorting against it; the app itself never loads it.
const etymologyGraph = require("../lib/etymology-graph-model");

function compareCodePoints(left, right) {
  const a = [...String(left || "")];
  const b = [...String(right || "")];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference) {
      return difference;
    }
  }
  return a.length - b.length;
}

// The order /entries and /root-groups list entries in (sqlOrderClause): the
// time for time sorts, then the lowercased trimmed lemma by code point, the
// lemma itself, and the ID. Position, which precedes the ID, is not modelled:
// reference dictionaries do not repeat a lemma.
function compareEntriesInListOrder(sort = "lemmaAsc") {
  const direction = sort.endsWith("Desc") ? -1 : 1;
  const time = sort.startsWith("updated") ? "updatedAt" : sort.startsWith("created") ? "createdAt" : "";
  const sortKey = (entry) => String(entry.lemma || "").trim().toLowerCase();
  return (a, b) => (time ? compareCodePoints(a[time], b[time]) * direction : 0)
    || compareCodePoints(sortKey(a), sortKey(b)) * direction
    || compareCodePoints(a.lemma, b.lemma) * direction
    || compareCodePoints(a.id, b.id);
}

function rootModeGroups(dictionary = {}, options = {}) {
  const query = String(options.query || "");
  const compareEntries = options.compareEntries || compareEntriesInListOrder();
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
  compareEntriesInListOrder,
  rootModeGroups,
};
