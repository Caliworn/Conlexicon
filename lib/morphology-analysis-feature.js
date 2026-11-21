const { createMorphologyResolver } = require("./morphology-model");

const TOP_ENTRY_LIMIT = 12;

function emptyOverrideCounts() {
  return { entryCount: 0, activeEntryCount: 0, activeCellCount: 0, inactiveEntryCount: 0, inactiveCellCount: 0 };
}

function compareTopEntries(left, right) {
  return right.storedCellCount - left.storedCellCount
    || left.lemma.localeCompare(right.lemma, "zh-CN")
    || left.entryId.localeCompare(right.entryId, "zh-CN");
}

async function buildMorphologyAnalysisResult({ dictionary, entries }, { yieldControl } = {}) {
  const { morphology } = dictionary;
  const resolver = createMorphologyResolver(morphology);
  const tables = new Map();
  const overrideTables = new Map();
  morphology.slots.forEach((slot) => slot.tables.forEach((table) => {
    tables.set(table.id, { tableId: table.id, slotId: slot.id, title: table.title, assignedEntryCount: 0 });
    overrideTables.set(table.id, { tableId: table.id, title: table.title, ...emptyOverrideCounts() });
  }));

  const recordsById = new Map();
  const modes = {
    auto: { mode: "auto", entryCount: 0, assignedEntryCount: 0, unassignedEntryCount: 0 },
    manual: { mode: "manual", entryCount: 0, assignedEntryCount: 0, unassignedEntryCount: 0 },
  };
  const overrides = emptyOverrideCounts();
  const topEntries = [];
  let assignedEntryCount = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const mode = entry.morphologyMode;
    const assignedTableIds = resolver.entryTableIds(entry);
    const assigned = new Set(assignedTableIds);
    modes[mode].entryCount += 1;
    modes[mode][assigned.size ? "assignedEntryCount" : "unassignedEntryCount"] += 1;
    if (assigned.size) assignedEntryCount += 1;
    assigned.forEach((tableId) => { tables.get(tableId).assignedEntryCount += 1; });

    const overrideTableScopes = new Map();
    let activeOverrideCellCount = 0;
    let inactiveOverrideCellCount = 0;
    entry.morphologyTables.forEach(({ tableId, overrideCellCount }) => {
      if (!overrideCellCount) return;
      const active = assigned.has(tableId);
      overrideTableScopes.set(tableId, active ? "active" : "inactive");
      const table = overrideTables.get(tableId);
      table.entryCount += 1;
      if (active) {
        activeOverrideCellCount += overrideCellCount;
        table.activeEntryCount += 1;
        table.activeCellCount += overrideCellCount;
      } else {
        inactiveOverrideCellCount += overrideCellCount;
        table.inactiveEntryCount += 1;
        table.inactiveCellCount += overrideCellCount;
      }
    });
    const storedCellCount = activeOverrideCellCount + inactiveOverrideCellCount;
    if (storedCellCount) {
      overrides.entryCount += 1;
      topEntries.push({
        entryId: entry.id, lemma: entry.lemma, storedCellCount,
        activeCellCount: activeOverrideCellCount, inactiveCellCount: inactiveOverrideCellCount,
      });
    }
    if (activeOverrideCellCount) {
      overrides.activeEntryCount += 1;
      overrides.activeCellCount += activeOverrideCellCount;
    }
    if (inactiveOverrideCellCount) {
      overrides.inactiveEntryCount += 1;
      overrides.inactiveCellCount += inactiveOverrideCellCount;
    }
    recordsById.set(entry.id, { mode, assignedTableIds, activeOverrideCellCount, inactiveOverrideCellCount, overrideTableScopes });
    if (yieldControl && index > 0 && index % 128 === 0) await yieldControl();
  }

  return {
    recordsById,
    tableIds: new Set(tables.keys()),
    summary: {
      inputEntryCount: entries.length,
      assignment: { assignedEntryCount, unassignedEntryCount: entries.length - assignedEntryCount },
      modes: [modes.auto, modes.manual],
      tables: [...tables.values()],
      overrides: {
        ...overrides,
        storedCellCount: overrides.activeCellCount + overrides.inactiveCellCount,
        topEntries: topEntries.sort(compareTopEntries).slice(0, TOP_ENTRY_LIMIT),
      },
      overrideTables: [...overrideTables.values()],
    },
  };
}

function morphologyAnalysisRecordMatches(record, view) {
  if (!record) return false;
  if (view.category === "assignment") return (record.assignedTableIds.length > 0) === (view.value === "assigned");
  if (view.category === "mode") return record.mode === view.value;
  if (view.category === "table") return record.assignedTableIds.includes(view.value);
  if (view.category === "override") {
    if (view.value === "active") return record.activeOverrideCellCount > 0;
    if (view.value === "inactive") return record.inactiveOverrideCellCount > 0;
    return record.activeOverrideCellCount + record.inactiveOverrideCellCount > 0;
  }
  const scope = record.overrideTableScopes.get(view.value);
  return Boolean(scope && (view.scope === "any" || view.scope === scope));
}

function morphologyAnalysisItemFeature({ mode, assignedTableIds, activeOverrideCellCount, inactiveOverrideCellCount }) {
  return { mode, assignedTableIds, activeOverrideCellCount, inactiveOverrideCellCount };
}

module.exports = {
  buildMorphologyAnalysisResult,
  morphologyAnalysisItemFeature,
  morphologyAnalysisRecordMatches,
};
