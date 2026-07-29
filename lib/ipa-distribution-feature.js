const {
  cleanIpaText,
  normalizeIpaSettings,
  tokenizePhonemeUnits,
} = require("./ipa-model");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeIpaDistributionSettings(ipaSettings = {}) {
  const ipa = normalizeIpaSettings(ipaSettings);
  return {
    complexPhonemes: ipa.syllable.complexPhonemes,
    separator: ipa.syllable.separator,
  };
}

function distributionSyllables(pronunciation, settings) {
  const clean = cleanIpaText(pronunciation);
  if (!clean) {
    return [];
  }
  const separators = [...new Set([".", settings.separator].filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  const literals = separators.map(escapeRegExp);
  const separatorPattern = new RegExp(
    literals.length ? `(?:\\s+|${literals.join("|")})+` : "\\s+",
    "u",
  );
  return clean.split(separatorPattern).filter(Boolean);
}

function analyzeIpaDistributionRecord(pronunciation, settings) {
  const syllables = distributionSyllables(pronunciation, settings);
  const unitCounts = new Map();
  const tokens = tokenizePhonemeUnits(syllables.join(""), settings.complexPhonemes)
    .map((token) => token.value)
    .filter(Boolean);
  tokens.forEach((unit) => {
    unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
  });
  return {
    unitCounts,
    initial: tokens[0] || "",
    final: tokens[tokens.length - 1] || "",
    syllableCount: syllables.length,
  };
}

function incrementFacet(map, value, count = 1) {
  if (value === "" || value === null || value === undefined || count <= 0) {
    return;
  }
  const key = String(value);
  const current = map.get(key) || { count: 0, entryCount: 0 };
  current.count += count;
  current.entryCount += 1;
  map.set(key, current);
}

function frequencyRows(map) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || String(a[0]).localeCompare(String(b[0]), "zh-CN"))
    .map(([value, counts]) => ({ value, ...counts }));
}

function numericRows(map) {
  return [...map.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([value, counts]) => ({ value, ...counts }));
}

async function buildIpaDistributionResult(records, ipaSettings = {}, options = {}) {
  const settings = normalizeIpaDistributionSettings(ipaSettings);
  const yieldControl = typeof options.yieldControl === "function"
    ? options.yieldControl
    : null;
  const yieldEvery = Math.max(1, Number(options.yieldEvery) || 128);
  const requestedEntryTotal = Number(options.entryTotal);
  const entryTotal = Number.isSafeInteger(requestedEntryTotal) && requestedEntryTotal >= records.length
    ? requestedEntryTotal
    : records.length;
  const recordsById = new Map();
  const facets = {
    units: new Map(),
    initials: new Map(),
    finals: new Map(),
    syllableCounts: new Map(),
  };
  let unitTotal = 0;
  let syllableTotal = 0;
  let syllableEntryCount = 0;

  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    const record = analyzeIpaDistributionRecord(entry.pronunciation, settings);
    recordsById.set(entry.id, record);
    record.unitCounts.forEach((count, unit) => {
      incrementFacet(facets.units, unit, count);
      unitTotal += count;
    });
    incrementFacet(facets.initials, record.initial);
    incrementFacet(facets.finals, record.final);
    if (record.syllableCount > 0) {
      incrementFacet(facets.syllableCounts, record.syllableCount);
      syllableTotal += record.syllableCount;
      syllableEntryCount += 1;
    }
    if (yieldControl && index > 0 && index % yieldEvery === 0) {
      await yieldControl();
    }
  }

  return {
    recordsById,
    summary: {
      entryTotal,
      inputTotal: records.length,
      unitTotal,
      syllableEntryCount,
      syllableTotal,
      syllableAverage: syllableEntryCount
        ? Number((syllableTotal / syllableEntryCount).toFixed(2))
        : 0,
      distributions: {
        units: frequencyRows(facets.units),
        initials: frequencyRows(facets.initials),
        finals: frequencyRows(facets.finals),
        syllableCounts: numericRows(facets.syllableCounts),
      },
    },
  };
}

function ipaDistributionRecordMatches(record, category, value) {
  if (!record) {
    return false;
  }
  if (category === "unit") {
    return record.unitCounts.has(value);
  }
  if (category === "initial") {
    return record.initial === value;
  }
  if (category === "final") {
    return record.final === value;
  }
  if (category === "syllableCount") {
    return String(record.syllableCount) === value;
  }
  return false;
}

function ipaDistributionItemFeature(record, category, value) {
  const occurrenceCount = category === "unit"
    ? record?.unitCounts.get(value) || 0
    : ipaDistributionRecordMatches(record, category, value) ? 1 : 0;
  return {
    category,
    value,
    occurrenceCount,
  };
}

module.exports = {
  buildIpaDistributionResult,
  ipaDistributionItemFeature,
  ipaDistributionRecordMatches,
  normalizeIpaDistributionSettings,
};
