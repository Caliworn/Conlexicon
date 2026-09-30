(function initEtymologyGraphModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconEtymologyGraph = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createEtymologyGraphModel() {
  // Edges point from an entry to its sources. Tarjan completes a component
  // only after every component it can reach, so components come out with
  // ancestors before descendants.
  function stronglyConnectedComponents(adjacency) {
    const count = adjacency.length;
    const order = new Int32Array(count).fill(-1);
    const low = new Int32Array(count);
    const onStack = new Uint8Array(count);
    const componentOf = new Int32Array(count).fill(-1);
    const components = [];
    const stack = [];
    let counter = 0;

    for (let start = 0; start < count; start += 1) {
      if (order[start] !== -1) {
        continue;
      }
      const nodes = [start];
      const nextEdge = [0];
      order[start] = low[start] = counter++;
      stack.push(start);
      onStack[start] = 1;
      while (nodes.length) {
        const top = nodes.length - 1;
        const node = nodes[top];
        const edges = adjacency[node];
        if (nextEdge[top] < edges.length) {
          const target = edges[nextEdge[top]++];
          if (order[target] === -1) {
            order[target] = low[target] = counter++;
            stack.push(target);
            onStack[target] = 1;
            nodes.push(target);
            nextEdge.push(0);
          } else if (onStack[target] && order[target] < low[node]) {
            low[node] = order[target];
          }
          continue;
        }
        nodes.pop();
        nextEdge.pop();
        if (nodes.length && low[node] < low[nodes[nodes.length - 1]]) {
          low[nodes[nodes.length - 1]] = low[node];
        }
        if (low[node] === order[node]) {
          const members = [];
          let member;
          do {
            member = stack.pop();
            onStack[member] = 0;
            componentOf[member] = components.length;
            members.push(member);
          } while (member !== node);
          components.push(members);
        }
      }
    }
    return { components, componentOf };
  }

  // Roots are the members of components with no source outside themselves:
  // an entry without resolved sources, or every member of a cycle that has no
  // outside ancestor. Other components inherit the union of their parents'
  // roots. The result depends only on the entry set and the edge set.
  function buildEtymologyGraph({ entryIds = [], sourceIds = new Map() } = {}) {
    const ids = [...entryIds];
    const indexById = new Map(ids.map((id, index) => [id, index]));
    const adjacency = ids.map((id) => {
      const targets = new Set();
      (sourceIds.get(id) || []).forEach((sourceId) => {
        const target = indexById.get(sourceId);
        if (target !== undefined) {
          targets.add(target);
        }
      });
      return [...targets];
    });
    const { components: memberLists, componentOf } = stronglyConnectedComponents(adjacency);

    const components = memberLists.map((members, component) => {
      const parents = new Set();
      let selfEdge = false;
      members.forEach((member) => {
        adjacency[member].forEach((target) => {
          if (componentOf[target] !== component) {
            parents.add(componentOf[target]);
          } else if (target === member) {
            selfEdge = true;
          }
        });
      });
      return {
        memberIds: members.map((member) => ids[member]),
        parentComponents: [...parents],
        cyclic: members.length > 1 || selfEdge,
      };
    });

    // Arrays are shared between entries and components; callers must not mutate them.
    const rootsByComponent = new Array(components.length);
    components.forEach((component, index) => {
      const parents = component.parentComponents;
      if (!parents.length) {
        rootsByComponent[index] = component.memberIds;
      } else if (parents.length === 1) {
        rootsByComponent[index] = rootsByComponent[parents[0]];
      } else {
        const roots = new Set();
        parents.forEach((parent) => rootsByComponent[parent].forEach((rootId) => roots.add(rootId)));
        rootsByComponent[index] = [...roots];
      }
    });

    const rootIdsByEntryId = new Map();
    const derivedIdsByRootId = new Map();
    const componentByEntryId = new Map();
    components.forEach((component) => {
      if (!component.parentComponents.length) {
        component.memberIds.forEach((rootId) => derivedIdsByRootId.set(rootId, []));
      }
    });
    ids.forEach((id, entryIndex) => {
      const component = componentOf[entryIndex];
      const roots = rootsByComponent[component];
      componentByEntryId.set(id, component);
      rootIdsByEntryId.set(id, roots);
      roots.forEach((rootId) => {
        if (rootId !== id) {
          derivedIdsByRootId.get(rootId).push(id);
        }
      });
    });

    return {
      rootIdsByEntryId,
      derivedIdsByRootId,
      componentByEntryId,
      components,
    };
  }

  return {
    buildEtymologyGraph,
  };
});
