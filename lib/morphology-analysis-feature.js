const {
  normalizeEntryMorphologyState,
  resolveEntryMorphologyGroups,
} = require("./morphology-model");

const TOP_ENTRY_LIMIT = 12;

function emptyOverrideScopeCounts() {
  return { any: 0, active: 0, inactive: 0 };
}

function incrementScopeCounts(target, scope, amount = 1) {
  target.any += amount;
  target[scope] += amount;
}

function entryOverrideFacts(entry, assignedGroupIds) {
  const groupScopes = new Map();
  const tableScopes = new Map();
  let activeOverrideCellCount = 0;
  let inactiveOverrideCellCount = 0;

  normalizeEntryMorphologyState(entry).morphologyGroups.forEach((group) => {
    const scope = assignedGroupIds.has(group.templateGroupId) ? "active" : "inactive";
    Object.entries(group.overrides || {}).forEach(([tableId, cells]) => {
      const cellCount = Object.keys(cells || {}).length;
      if (!cellCount) {
        return;
      }
      if (!groupScopes.has(group.templateGroupId)) {
        groupScopes.set(group.templateGroupId, emptyOverrideScopeCounts());
      }
      if (!tableScopes.has(tableId)) {
        tableScopes.set(tableId, emptyOverrideScopeCounts());
      }
      incrementScopeCounts(groupScopes.get(group.templateGroupId), scope, cellCount);
      incrementScopeCounts(tableScopes.get(tableId), scope, cellCount);
      if (scope === "active") {
        activeOverrideCellCount += cellCount;
      } else {
        inactiveOverrideCellCount += cellCount;
      }
    });
  });

  return {
    activeOverrideCellCount,
    inactiveOverrideCellCount,
    groupScopes,
    tableScopes,
  };
}

function summaryOverrideRow() {
  return {
    entryIds: new Set(),
    activeEntryIds: new Set(),
    activeCellCount: 0,
    inactiveEntryIds: new Set(),
    inactiveCellCount: 0,
  };
}

function collectOverrideSummary(row, entryId, counts) {
  if (!counts?.any) {
    return;
  }
  row.entryIds.add(entryId);
  if (counts.active) {
    row.activeEntryIds.add(entryId);
    row.activeCellCount += counts.active;
  }
  if (counts.inactive) {
    row.inactiveEntryIds.add(entryId);
    row.inactiveCellCount += counts.inactive;
  }
}

function serializeOverrideSummary(row) {
  return {
    entryCount: row.entryIds.size,
    activeEntryCount: row.activeEntryIds.size,
    activeCellCount: row.activeCellCount,
    inactiveEntryCount: row.inactiveEntryIds.size,
    inactiveCellCount: row.inactiveCellCount,
  };
}

function compareTopEntries(left, right) {
  return right.storedCellCount - left.storedCellCount
    || String(left.lemma || "").localeCompare(String(right.lemma || ""), "zh-CN")
    || String(left.entryId || "").localeCompare(String(right.entryId || ""), "zh-CN");
}

async function buildMorphologyAnalysisResult(input = {}, options = {}) {
  const dictionary = input.dictionary || {};
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const templateGroups = dictionary.morphology?.templateGroups || [];
  const assignmentDictionary = {
    ...dictionary,
    morphology: {
      templateGroups: templateGroups.map((group) => ({
        ...group,
        tables: [],
      })),
    },
  };
  const groupRows = new Map(templateGroups.map((group) => [group.id, {
    groupId: group.id,
    name: group.name || "",
    tableCount: group.tables?.length || 0,
    assignedEntryIds: new Set(),
    override: summaryOverrideRow(),
  }]));
  const tableRows = new Map();
  templateGroups.forEach((group) => {
    (group.tables || []).forEach((table) => {
      tableRows.set(table.id, {
        groupId: group.id,
        tableId: table.id,
        groupName: group.name || "",
        title: table.title || "",
        override: summaryOverrideRow(),
      });
    });
  });

  const recordsById = new Map();
  const modes = {
    auto: { mode: "auto", entryCount: 0, assignedEntryCount: 0, unassignedEntryCount: 0 },
    manual: { mode: "manual", entryCount: 0, assignedEntryCount: 0, unassignedEntryCount: 0 },
  };
  const overrideEntries = new Set();
  const activeOverrideEntries = new Set();
  const inactiveOverrideEntries = new Set();
  let assignedEntryCount = 0;
  let activeCellCount = 0;
  let inactiveCellCount = 0;
  const topEntries = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const state = normalizeEntryMorphologyState(entry);
    const assignedGroupIds = new Set(
      resolveEntryMorphologyGroups(entry, assignmentDictionary).map(({ templateGroup }) => templateGroup.id),
    );
    const assigned = assignedGroupIds.size > 0;
    const mode = state.morphologyMode;
    modes[mode].entryCount += 1;
    modes[mode][assigned ? "assignedEntryCount" : "unassignedEntryCount"] += 1;
    if (assigned) {
      assignedEntryCount += 1;
    }
    assignedGroupIds.forEach((groupId) => groupRows.get(groupId)?.assignedEntryIds.add(entry.id));

    const overrideFacts = entryOverrideFacts(entry, assignedGroupIds);
    const storedCellCount = overrideFacts.activeOverrideCellCount + overrideFacts.inactiveOverrideCellCount;
    if (storedCellCount) {
      overrideEntries.add(entry.id);
      topEntries.push({
        entryId: entry.id,
        lemma: entry.lemma || "",
        storedCellCount,
        activeCellCount: overrideFacts.activeOverrideCellCount,
        inactiveCellCount: overrideFacts.inactiveOverrideCellCount,
      });
    }
    if (overrideFacts.activeOverrideCellCount) {
      activeOverrideEntries.add(entry.id);
      activeCellCount += overrideFacts.activeOverrideCellCount;
    }
    if (overrideFacts.inactiveOverrideCellCount) {
      inactiveOverrideEntries.add(entry.id);
      inactiveCellCount += overrideFacts.inactiveOverrideCellCount;
    }
    overrideFacts.groupScopes.forEach((counts, groupId) => {
      const row = groupRows.get(groupId);
      if (row) {
        collectOverrideSummary(row.override, entry.id, counts);
      }
    });
    overrideFacts.tableScopes.forEach((counts, tableId) => {
      const row = tableRows.get(tableId);
      if (row) {
        collectOverrideSummary(row.override, entry.id, counts);
      }
    });

    recordsById.set(entry.id, {
      mode,
      assignedGroupIds: [...assignedGroupIds],
      activeOverrideCellCount: overrideFacts.activeOverrideCellCount,
      inactiveOverrideCellCount: overrideFacts.inactiveOverrideCellCount,
      overrideGroupScopes: overrideFacts.groupScopes,
      overrideTableScopes: overrideFacts.tableScopes,
    });
    if (index > 0 && index % 128 === 0 && typeof options.yieldControl === "function") {
      await options.yieldControl();
    }
  }

  const summary = {
    inputEntryCount: entries.length,
    assignment: {
      assignedEntryCount,
      unassignedEntryCount: entries.length - assignedEntryCount,
    },
    modes: [modes.auto, modes.manual],
    groups: [...groupRows.values()].map((row) => ({
      groupId: row.groupId,
      name: row.name,
      assignedEntryCount: row.assignedEntryIds.size,
      tableCount: row.tableCount,
    })),
    overrides: {
      entryCount: overrideEntries.size,
      storedCellCount: activeCellCount + inactiveCellCount,
      activeEntryCount: activeOverrideEntries.size,
      activeCellCount,
      inactiveEntryCount: inactiveOverrideEntries.size,
      inactiveCellCount,
      topEntries: topEntries.sort(compareTopEntries).slice(0, TOP_ENTRY_LIMIT),
    },
    overrideGroups: [...groupRows.values()].map((row) => ({
      groupId: row.groupId,
      name: row.name,
      ...serializeOverrideSummary(row.override),
    })),
    overrideTables: [...tableRows.values()].map((row) => ({
      groupId: row.groupId,
      tableId: row.tableId,
      groupName: row.groupName,
      title: row.title,
      ...serializeOverrideSummary(row.override),
    })),
  };

  return {
    recordsById,
    summary,
    groupIds: new Set(groupRows.keys()),
    tableIds: new Set(tableRows.keys()),
  };
}

function morphologyAnalysisRecordMatches(record, view) {
  if (!record) {
    return false;
  }
  if (view.category === "assignment") {
    return view.value === "assigned"
      ? record.assignedGroupIds.length > 0
      : record.assignedGroupIds.length === 0;
  }
  if (view.category === "mode") {
    return record.mode === view.value;
  }
  if (view.category === "group") {
    return record.assignedGroupIds.includes(view.value);
  }
  if (view.category === "override") {
    if (view.value === "active") {
      return record.activeOverrideCellCount > 0;
    }
    if (view.value === "inactive") {
      return record.inactiveOverrideCellCount > 0;
    }
    return record.activeOverrideCellCount + record.inactiveOverrideCellCount > 0;
  }
  const scopes = view.category === "overrideGroup"
    ? record.overrideGroupScopes.get(view.value)
    : record.overrideTableScopes.get(view.value);
  return Boolean(scopes?.[view.scope]);
}

function morphologyAnalysisItemFeature(record) {
  return {
    mode: record?.mode || "auto",
    assignedGroupIds: [...(record?.assignedGroupIds || [])],
    activeOverrideCellCount: Number(record?.activeOverrideCellCount || 0),
    inactiveOverrideCellCount: Number(record?.inactiveOverrideCellCount || 0),
  };
}

module.exports = {
  buildMorphologyAnalysisResult,
  morphologyAnalysisItemFeature,
  morphologyAnalysisRecordMatches,
};
