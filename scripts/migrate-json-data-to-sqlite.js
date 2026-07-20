#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const { createDictionaryConversionService } = require("../lib/dictionary-conversion-service");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");

function repositoryOptions(dataDir) {
  return {
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  };
}

function usage() {
  return [
    "Usage: node scripts/migrate-json-data-to-sqlite.js --from <json-data-dir> --to <sqlite-data-dir>",
    "",
    "Migrates a legacy JSON data directory into a new SQLite data directory.",
    "The source directory is read-only; the target directory must be empty or not exist.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") {
      args.help = true;
      continue;
    }
    if (item === "--from" || item === "--to") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${item} requires a path`);
      }
      args[item.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

async function directoryExists(directoryPath) {
  try {
    const stat = await fs.stat(directoryPath);
    return stat.isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertTargetDirectoryIsSafe(sourceDataDir, targetDataDir) {
  const sourceResolved = path.resolve(sourceDataDir);
  const targetResolved = path.resolve(targetDataDir);
  const sourceLower = sourceResolved.toLowerCase();
  const targetLower = targetResolved.toLowerCase();

  if (sourceLower === targetLower) {
    throw new Error("Target data directory must be different from source data directory");
  }
  if (targetLower.startsWith(`${sourceLower}${path.sep}`) || sourceLower.startsWith(`${targetLower}${path.sep}`)) {
    throw new Error("Source and target data directories must not be nested inside each other");
  }

  if (await directoryExists(targetResolved)) {
    const entries = await fs.readdir(targetResolved);
    if (entries.length) {
      throw new Error("Target data directory must be empty or not exist");
    }
  }
}

function dictionaryReportBase(id) {
  return {
    id,
    name: "",
    status: "pending",
    entryCount: 0,
    warnings: [],
    repairs: [],
  };
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

async function readLegacyDataIndex(sourceDataDir) {
  const source = await readJsonFile(path.join(sourceDataDir, "index.json"), DEFAULT_INDEX);
  return {
    activeDictionaryId: String(source.activeDictionaryId || ""),
    dictionaryIds: Array.isArray(source.dictionaryIds)
      ? source.dictionaryIds.map(String).filter(Boolean)
      : [],
    uiLanguage: normalizeUiLanguage(source.uiLanguage),
    uiTheme: normalizeUiTheme(source.uiTheme),
  };
}

function legacyDictionaryPath(sourceDataDir, dictionaryId) {
  if (!/^dict-[a-z0-9-]+$/i.test(dictionaryId)) {
    throw new Error(`Invalid legacy dictionary id: ${dictionaryId}`);
  }
  return path.join(sourceDataDir, "dictionaries", `${dictionaryId}.json`);
}

async function migrateJsonDataDirectoryToSqlite({
  sourceDataDir,
  targetDataDir,
  conversionService = createDictionaryConversionService(),
} = {}) {
  if (!sourceDataDir || !targetDataDir) {
    throw new Error("Both sourceDataDir and targetDataDir are required");
  }
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    throw new Error("SQLite runtime is unavailable in this Node.js version");
  }

  const sourceResolved = path.resolve(sourceDataDir);
  const targetResolved = path.resolve(targetDataDir);
  if (!(await directoryExists(sourceResolved))) {
    throw new Error(`Source data directory does not exist: ${sourceResolved}`);
  }
  await assertTargetDirectoryIsSafe(sourceResolved, targetResolved);

  const targetRepository = new SqliteDictionaryRepository(repositoryOptions(targetResolved));
  const startedAt = new Date().toISOString();
  const report = {
    kind: "conlexicon-json-to-sqlite-migration",
    startedAt,
    finishedAt: "",
    sourceDataDir: sourceResolved,
    targetDataDir: targetResolved,
    sourceActiveDictionaryId: "",
    targetActiveDictionaryId: "",
    migratedCount: 0,
    failedCount: 0,
    dictionaries: [],
  };

  try {
    const sourceIndex = await readLegacyDataIndex(sourceResolved);
    report.sourceActiveDictionaryId = sourceIndex.activeDictionaryId;
    await targetRepository.ensureDataStore();

    const migratedIds = [];
    for (const dictionaryId of sourceIndex.dictionaryIds) {
      const itemReport = dictionaryReportBase(dictionaryId);
      report.dictionaries.push(itemReport);
      try {
        const rawPayload = await readJsonFile(legacyDictionaryPath(sourceResolved, dictionaryId));
        const { dictionary, report: importReport } = conversionService.importDictionaryFromJsonPayload(rawPayload, {
          profile: "legacy-json",
        });
        itemReport.id = dictionary.id;
        itemReport.name = dictionary.name || "";
        itemReport.entryCount = Array.isArray(dictionary.entries) ? dictionary.entries.length : 0;
        itemReport.warnings = importReport?.warnings || [];
        itemReport.repairs = importReport?.repairs || [];
        await targetRepository.importDictionary(dictionary, { overwrite: true });
        itemReport.status = "migrated";
        migratedIds.push(dictionary.id);
        report.migratedCount += 1;
      } catch (error) {
        itemReport.status = "failed";
        itemReport.error = {
          code: error.code || "migration_error",
          message: error.message || String(error),
        };
        report.failedCount += 1;
      }
    }

    const activeDictionaryId = migratedIds.includes(sourceIndex.activeDictionaryId)
      ? sourceIndex.activeDictionaryId
      : migratedIds[0] || "";
    await targetRepository.writeIndex({
      activeDictionaryId,
      dictionaryIds: migratedIds,
      uiLanguage: sourceIndex.uiLanguage,
      uiTheme: sourceIndex.uiTheme,
    });
    report.targetActiveDictionaryId = activeDictionaryId;
    report.finishedAt = new Date().toISOString();
    return report;
  } finally {
    targetRepository.close?.();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.from || !args.to) {
    throw new Error(`${usage()}\n\nMissing --from or --to`);
  }
  const report = await migrateJsonDataDirectoryToSqlite({
    sourceDataDir: args.from,
    targetDataDir: args.to,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.failedCount) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  migrateJsonDataDirectoryToSqlite,
  parseArgs,
};
