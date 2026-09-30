#!/usr/bin/env node
const assert = require("node:assert/strict");

const { buildEtymologyGraph } = require("../lib/etymology-graph-model");

// spec: { entryId: [sourceId, ...] }; sources absent from the spec stand for unresolved text.
function graphFromSpec(spec, { entryOrder, sourceOrder } = {}) {
  const entryIds = entryOrder || Object.keys(spec);
  const sourceIds = new Map(entryIds.map((id) => [id, sourceOrder ? sourceOrder(spec[id]) : spec[id]]));
  return buildEtymologyGraph({ entryIds, sourceIds });
}

function groupsOf(graph) {
  return Object.fromEntries([...graph.derivedIdsByRootId.entries()]
    .map(([rootId, derivedIds]) => [rootId, [...derivedIds].sort()])
    .sort(([left], [right]) => left.localeCompare(right)));
}

function rootsOf(graph) {
  return Object.fromEntries([...graph.rootIdsByEntryId.entries()]
    .map(([entryId, rootIds]) => [entryId, [...rootIds].sort()])
    .sort(([left], [right]) => left.localeCompare(right)));
}

function cyclicMembersOf(graph) {
  return graph.components
    .filter((component) => component.cyclic)
    .map((component) => [...component.memberIds].sort().join(","))
    .sort();
}

// Independent definition: r is a root of e when r is reachable from e (or is
// e) and everything reachable from r can reach r back.
function bruteForceGroups(spec) {
  const ids = Object.keys(spec);
  const known = new Set(ids);
  const reach = new Map(ids.map((id) => {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      (spec[queue.shift()] || []).filter((next) => known.has(next)).forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
    return [id, seen];
  }));
  const isRoot = (id) => [...reach.get(id)].every((other) => reach.get(other).has(id));
  const groups = {};
  ids.filter(isRoot).sort().forEach((rootId) => {
    groups[rootId] = ids.filter((id) => id !== rootId && reach.get(id).has(rootId)).sort();
  });
  return groups;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

const CASES = [
  {
    name: "diamond",
    spec: { T: [], L: ["T"], R: ["T"], D: ["L", "R"] },
    groups: { T: ["D", "L", "R"] },
  },
  {
    name: "diamond with reversed sources",
    spec: { T: [], L: ["T"], R: ["T"], D: ["R", "L"] },
    groups: { T: ["D", "L", "R"] },
  },
  {
    name: "long diamond",
    spec: { T: [], A: ["T"], B: ["A"], C: ["A"], D: ["B", "C"] },
    groups: { T: ["A", "B", "C", "D"] },
  },
  {
    name: "two-member cycle",
    spec: { A: ["B"], B: ["A"] },
    groups: { A: ["B"], B: ["A"] },
    cyclic: ["A,B"],
  },
  {
    name: "cycle with an outside root",
    spec: { T: [], A: ["T", "B"], B: ["A"] },
    groups: { T: ["A", "B"] },
    cyclic: ["A,B"],
  },
  {
    name: "chain into a rootless cycle",
    spec: { A: ["B"], B: ["A"], X: ["A"] },
    groups: { A: ["B", "X"], B: ["A", "X"] },
    cyclic: ["A,B"],
  },
  {
    name: "multiple roots",
    spec: { T: [], U: [], A: ["T", "U"] },
    groups: { T: ["A"], U: ["A"] },
  },
  {
    name: "unresolved source",
    spec: { A: ["missing"], B: ["A"] },
    groups: { A: ["B"] },
  },
  {
    name: "duplicate source edges",
    spec: { T: [], A: ["T", "T"] },
    groups: { T: ["A"] },
  },
  {
    name: "self edge",
    spec: { A: ["A"], B: ["A"] },
    groups: { A: ["B"] },
    cyclic: ["A"],
  },
];

function checkFixedCases() {
  CASES.forEach(({ name, spec, groups, cyclic = [] }) => {
    const graph = graphFromSpec(spec);
    assert.deepEqual(groupsOf(graph), groups, `${name}: groups`);
    assert.deepEqual(groupsOf(graph), bruteForceGroups(spec), `${name}: matches the brute-force definition`);
    assert.deepEqual(cyclicMembersOf(graph), cyclic, `${name}: cyclic components`);
  });

  const multiRoot = graphFromSpec({ T: [], U: [], A: ["T", "U"], B: ["A"] });
  assert.deepEqual(rootsOf(multiRoot), { A: ["T", "U"], B: ["T", "U"], T: ["T"], U: ["U"] },
    "a root maps to itself and a derived entry to every root it reaches");
  const cycle = graphFromSpec({ A: ["B"], B: ["A"] });
  assert.deepEqual(rootsOf(cycle), { A: ["A", "B"], B: ["A", "B"] },
    "a rootless cycle member is both a root and derived from the other members");
}

function checkComponentOrder() {
  const graph = graphFromSpec({ D: ["L", "R"], L: ["T"], R: ["T"], T: [], X: ["Y"], Y: ["X", "D"] });
  graph.components.forEach((component, index) => {
    component.parentComponents.forEach((parent) => {
      assert.ok(parent < index, "every parent component precedes its descendants");
    });
    component.memberIds.forEach((id) => assert.equal(graph.componentByEntryId.get(id), index));
  });
  const cycle = graph.components[graph.componentByEntryId.get("X")];
  assert.deepEqual([...cycle.memberIds].sort(), ["X", "Y"]);
  assert.deepEqual(cycle.parentComponents, [graph.componentByEntryId.get("D")]);
}

function randomSpec(random) {
  const size = 1 + Math.floor(random() * 12);
  const ids = Array.from({ length: size }, (_, index) => `e${index}`);
  const density = random() * 0.35;
  return Object.fromEntries(ids.map((id) => {
    const sources = ids.filter(() => random() < density);
    if (random() < 0.1) sources.push("missing");
    if (sources.length && random() < 0.1) sources.push(sources[0]);
    return [id, sources];
  }));
}

function checkRandomGraphs() {
  const random = mulberry32(20260930);
  for (let round = 0; round < 800; round += 1) {
    const spec = randomSpec(random);
    const expected = bruteForceGroups(spec);
    const graph = graphFromSpec(spec);
    assert.deepEqual(groupsOf(graph), expected, `random graph ${round}: ${JSON.stringify(spec)}`);
    const permuted = graphFromSpec(spec, {
      entryOrder: shuffled(Object.keys(spec), random),
      sourceOrder: (sources) => shuffled(sources, random),
    });
    assert.deepEqual(groupsOf(permuted), expected, `random graph ${round}: independent of entry and source order`);
    assert.deepEqual(rootsOf(permuted), rootsOf(graph), `random graph ${round}: root sets are order independent`);
  }
}

function checkLargeGraphs() {
  const chainLength = 50000;
  const chain = new Map();
  const chainIds = Array.from({ length: chainLength }, (_, index) => `c${index}`);
  chainIds.forEach((id, index) => chain.set(id, index ? [chainIds[index - 1]] : []));
  const chainGraph = buildEtymologyGraph({ entryIds: chainIds, sourceIds: chain });
  assert.deepEqual([...chainGraph.derivedIdsByRootId.keys()], ["c0"], "a long chain has a single root");
  assert.equal(chainGraph.derivedIdsByRootId.get("c0").length, chainLength - 1);
  assert.equal(chainGraph.components.length, chainLength);

  const cycleLength = 50000;
  const cycleIds = Array.from({ length: cycleLength }, (_, index) => `k${index}`);
  const cycleEdges = new Map(cycleIds.map((id, index) => [id, [cycleIds[(index + 1) % cycleLength]]]));
  cycleIds.push("anchor");
  cycleEdges.set("anchor", []);
  cycleEdges.get("k0").push("anchor");
  const cycleGraph = buildEtymologyGraph({ entryIds: cycleIds, sourceIds: cycleEdges });
  const cycleComponent = cycleGraph.components[cycleGraph.componentByEntryId.get("k0")];
  assert.equal(cycleComponent.memberIds.length, cycleLength, "a long cycle forms one component without overflowing");
  assert.equal(cycleComponent.cyclic, true);
  assert.deepEqual([...cycleGraph.derivedIdsByRootId.keys()], ["anchor"], "a cycle with an outside root adds no groups");
}

function main() {
  checkFixedCases();
  checkComponentOrder();
  checkRandomGraphs();
  checkLargeGraphs();
  console.log("Etymology graph checks passed.");
}

main();
