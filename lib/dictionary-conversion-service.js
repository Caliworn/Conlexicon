const { apiError } = require("./api-error");
const { importDictionaryFromPayload } = require("./dictionary-model");
const { migrateLegacyDictionaryPayload } = require("./legacy-dictionary-migration");

const JSON_EXPORT_PROFILES = new Set(["legacy-json", "portable-json"]);

function httpError(message, status, code, details) {
  return apiError(message, status, code, details);
}

function normalizeExportFormat(value) {
  return String(value || "json").trim().toLowerCase();
}

function normalizeJsonExportProfile(value) {
  return String(value || "legacy-json").trim().toLowerCase();
}

function parseLegacyJsonDictionary(payload, options = {}) {
  const profile = normalizeJsonExportProfile(options.profile || options.sourceProfile);
  if (!JSON_EXPORT_PROFILES.has(profile)) {
    throw httpError("Unsupported import profile", 400, "unsupported_import_profile", { profile });
  }
  const migration = migrateLegacyDictionaryPayload(payload);
  return {
    dictionary: importDictionaryFromPayload(migration.dictionary),
    report: {
      sourceProfile: profile,
      warnings: migration.report.warnings,
      repairs: migration.report.repairs,
    },
  };
}

function importDictionaryFromJsonPayload(payload, options = {}) {
  return parseLegacyJsonDictionary(payload, options);
}

function exportDictionarySnapshot(dictionary, options = {}) {
  const format = normalizeExportFormat(options.format);
  if (format !== "json") {
    throw httpError("Unsupported export format", 400, "unsupported_export_format", { format });
  }

  const profile = normalizeJsonExportProfile(options.profile);
  if (!JSON_EXPORT_PROFILES.has(profile)) {
    throw httpError("Unsupported export profile", 400, "unsupported_export_profile", { profile });
  }

  return {
    format,
    profile,
    extension: "json",
    mediaType: "application/json",
    payload: dictionary,
  };
}

function createDictionaryConversionService() {
  return {
    parseLegacyJsonDictionary,
    importDictionaryFromJsonPayload,
    exportDictionarySnapshot,
  };
}

module.exports = {
  createDictionaryConversionService,
  exportDictionarySnapshot,
  importDictionaryFromJsonPayload,
  parseLegacyJsonDictionary,
};
