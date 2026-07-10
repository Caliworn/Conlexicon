const { apiError } = require("./api-error");

function httpError(message, status, code, details) {
  return apiError(message, status, code, details);
}

function splitSourceText(value) {
  return String(value || "")
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLegacyEditSwitchAction(currentValue, legacyValue) {
  if (["save", "discard", "prompt"].includes(currentValue)) {
    return currentValue;
  }
  return legacyValue ? "save" : "discard";
}

function hasStressOutput(value) {
  return /[ˈˌ']/.test(String(value || ""));
}

function cloneDictionaryLikeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return {
    ...value,
    entries: Array.isArray(value.entries) ? value.entries.map((entry) => ({ ...entry })) : value.entries,
    settings: value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)
      ? { ...value.settings }
      : value.settings,
    corpus: value.corpus && typeof value.corpus === "object" && !Array.isArray(value.corpus)
      ? { ...value.corpus }
      : value.corpus,
  };
}

function dictionaryFromLegacyPayload(payload) {
  if (Array.isArray(payload?.dictionaries)) {
    const dictionary = payload.dictionaries.find((item) => item?.id === payload.activeDictionaryId) || payload.dictionaries[0];
    if (!dictionary) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return dictionary;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const hasDictionaryShape = payload.id
      || payload.name
      || Array.isArray(payload.entries)
      || payload.settings
      || payload.docs
      || payload.corpus
      || payload.morphology;
    if (!hasDictionaryShape) {
      throw httpError("Invalid import payload", 400, "invalid_import_payload");
    }
    return payload;
  }

  throw httpError("Invalid import payload", 400, "invalid_import_payload");
}

function migrateLegacyDictionaryPayload(payload) {
  const source = dictionaryFromLegacyPayload(payload);
  return migrateLegacyDictionary(source);
}

function migrateLegacyDictionary(dictionary = {}) {
  const report = { warnings: [], repairs: [] };
  const migrated = cloneDictionaryLikeObject(dictionary);
  if (!migrated) {
    throw httpError("Invalid import payload", 400, "invalid_import_payload");
  }

  migrated.entries = Array.isArray(migrated.entries)
    ? migrated.entries.map((entry) => migrateLegacyEntry(entry, report))
    : migrated.entries;
  migrated.settings = migrateLegacySettings(migrated.settings, report);
  migrated.corpus = migrateLegacyCorpus(migrated.corpus, report);

  return { dictionary: migrated, report };
}

function migrateLegacyEntry(entry = {}, report) {
  const migrated = {
    ...entry,
    etymology: entry.etymology && typeof entry.etymology === "object" && !Array.isArray(entry.etymology)
      ? { ...entry.etymology }
      : entry.etymology,
  };

  if (entry.partOfSpeech) {
    const tags = Array.isArray(entry.tags) ? [...entry.tags].filter(Boolean) : [];
    if (tags[0] !== entry.partOfSpeech) {
      tags.unshift(entry.partOfSpeech);
      migrated.tags = tags;
      report.repairs.push("entry.partOfSpeech migrated to tags");
    }
  }

  if ((!Array.isArray(entry.definitions) || !entry.definitions.length) && (entry.meaning || entry.example)) {
    migrated.definitions = [{ meaning: entry.meaning || "", example: entry.example || "", note: "" }];
    report.repairs.push("entry.meaning/example migrated to definitions");
  }

  const migratedEtymologyDescription = [entry.roots, entry.variant].filter(Boolean).join("\n");
  const sourceText = migrated.etymology?.sourceText || migrated.etymology?.source || "";
  const sourceEntryId = migrated.etymology?.sourceEntryId;
  if (migratedEtymologyDescription || sourceText || sourceEntryId) {
    const etymology = migrated.etymology && typeof migrated.etymology === "object" && !Array.isArray(migrated.etymology)
      ? { ...migrated.etymology }
      : {};
    if (!etymology.description && migratedEtymologyDescription) {
      etymology.description = migratedEtymologyDescription;
      report.repairs.push("entry.roots/variant migrated to etymology.description");
    }
    if (!Array.isArray(etymology.sources) || !etymology.sources.length) {
      etymology.sources = splitSourceText(sourceText);
      if (etymology.sources.length) {
        report.repairs.push("entry.etymology.source/sourceText migrated to etymology.sources");
      }
    } else {
      etymology.sources = etymology.sources.map(String).map((item) => item.trim()).filter(Boolean);
    }
    if (sourceEntryId && !etymology.sources.includes(sourceEntryId)) {
      etymology.sources.push(sourceEntryId);
      report.repairs.push("entry.etymology.sourceEntryId migrated to etymology.sources");
    }
    migrated.etymology = etymology;
  }

  return migrated;
}

function migrateLegacySettings(settings = {}, report) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return settings;
  }
  const migrated = { ...settings };

  if (!migrated.glossStyles && (settings.glossFontFamily || settings.glossFont || settings.glossSmallCaps !== undefined)) {
    const fontFamily = settings.glossFontFamily || settings.glossFont || "serif";
    migrated.glossStyles = {
      gla: { fontFamily },
      glb: { fontFamily, smallCaps: Boolean(settings.glossSmallCaps) },
      glc: { fontFamily },
      ft: { fontFamily, italic: true },
    };
    report.repairs.push("legacy gloss style settings migrated to glossStyles");
  }

  if (migrated.corpusUnitCardGlossAlign === undefined && settings.corpusGlossAlign !== undefined) {
    migrated.corpusUnitCardGlossAlign = Boolean(settings.corpusGlossAlign);
    report.repairs.push("legacy corpusGlossAlign migrated to corpusUnitCardGlossAlign");
  }
  if (migrated.corpusUnitGlossAlign === undefined && settings.corpusGlossAlign !== undefined) {
    migrated.corpusUnitGlossAlign = Boolean(settings.corpusGlossAlign);
    report.repairs.push("legacy corpusGlossAlign migrated to corpusUnitGlossAlign");
  }

  if (migrated.partialEditPageSwitchAction === undefined) {
    const legacy = settings.savePartialEditOnPageSwitch ?? settings.savePartialEditOnSwitch;
    if (legacy !== undefined) {
      migrated.partialEditPageSwitchAction = normalizeLegacyEditSwitchAction(undefined, legacy);
      report.repairs.push("legacy partial edit switch setting migrated");
    }
  }
  if (migrated.fullEditPageSwitchAction === undefined) {
    const legacy = settings.saveFullEditOnPageSwitch ?? settings.saveFullEditOnSwitch;
    if (legacy !== undefined) {
      migrated.fullEditPageSwitchAction = normalizeLegacyEditSwitchAction(undefined, legacy);
      report.repairs.push("legacy full edit switch setting migrated");
    }
  }

  if (settings.ipa && typeof settings.ipa === "object" && !Array.isArray(settings.ipa)) {
    const legacyStressMappings = Array.isArray(settings.ipa.stressMappings) ? settings.ipa.stressMappings : [];
    if (legacyStressMappings.length) {
      const currentMappings = Array.isArray(settings.ipa.mappings) ? settings.ipa.mappings : [];
      migrated.ipa = {
        ...settings.ipa,
        mappings: [
          ...currentMappings,
          ...legacyStressMappings.map((rule = {}) => ({
            ...rule,
            to: hasStressOutput(rule.to) ? rule.to : `ˈ${rule.to || rule.from || ""}`,
          })),
        ],
      };
      delete migrated.ipa.stressMappings;
      report.repairs.push("legacy IPA stressMappings migrated to ipa.mappings");
    }
  }

  return migrated;
}

function migrateLegacyCorpus(corpus = {}, report) {
  if (!corpus || typeof corpus !== "object" || Array.isArray(corpus)) {
    return corpus;
  }
  const migrated = { ...corpus };
  migrated.blocks = Array.isArray(corpus.blocks)
    ? corpus.blocks.map((block) => migrateLegacyCorpusBlock(block, report))
    : corpus.blocks;
  migrated.units = Array.isArray(corpus.units)
    ? corpus.units.map((unit) => migrateLegacyCorpusUnit(unit, report))
    : corpus.units;
  return migrated;
}

function migrateLegacyCorpusBlock(block = {}, report) {
  const migrated = { ...block };
  if (!migrated.title && block.name) {
    migrated.title = block.name;
    report.repairs.push("corpus block name migrated to title");
  }
  return migrated;
}

function migrateLegacyCorpusUnit(unit = {}, report) {
  const migrated = { ...unit };
  if (!migrated.content && unit.text) {
    migrated.content = unit.text;
    report.repairs.push("corpus unit text migrated to content");
  }
  return migrated;
}

module.exports = {
  migrateLegacyDictionary,
  migrateLegacyDictionaryPayload,
};
