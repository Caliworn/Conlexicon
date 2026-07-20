const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const morphologyModel = require("../lib/morphology-model");
const { SqliteDictionaryRepository } = require("../lib/sqlite-dictionary-repository");
const { migrateJsonDataDirectoryToSqlite } = require("./migrate-json-data-to-sqlite");
const { sqliteRepositoryOptions } = require("./sqlite-check-utils");
const {
  DICTIONARY_ID,
  writeMorphologyTestData,
} = require("./generate-morphology-test-dictionary");

function entryByLemma(dictionary, lemma) {
  const entry = dictionary.entries.find((item) => item.lemma === lemma);
  assert.ok(entry, `missing fixture entry: ${lemma}`);
  return entry;
}

function templateGroupByName(dictionary, name) {
  const group = dictionary.morphology.templateGroups.find((item) => item.name === name);
  assert.ok(group, `missing morphology template group: ${name}`);
  return group;
}

async function runMorphologyAcceptanceCheck() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    console.log("SQLite runtime unavailable; morphology acceptance check skipped.");
    return;
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-morphology-acceptance-"));
  const sourceDataDir = path.join(tempRoot, "legacy-json");
  const sqliteDataDir = path.join(tempRoot, "sqlite-data");
  let repository;
  try {
    await writeMorphologyTestData(sourceDataDir);
    const migration = await migrateJsonDataDirectoryToSqlite({ sourceDataDir, targetDataDir: sqliteDataDir });
    assert.equal(migration.migratedCount, 1);
    assert.equal(migration.failedCount, 0);
    assert.equal(migration.targetActiveDictionaryId, DICTIONARY_ID);

    repository = new SqliteDictionaryRepository(sqliteRepositoryOptions(sqliteDataDir));
    const dictionary = await repository.getDictionarySnapshot(DICTIONARY_ID);
    assert.equal(dictionary.name, "Morphology Acceptance Fixture");
    assert.equal(dictionary.settings.showEmptyEntrySections, false);
    assert.equal(dictionary.morphology.templateGroups.length, 3);
    assert.deepEqual(
      dictionary.morphology.templateGroups.map((group) => group.tables.length),
      [2, 1, 1],
    );

    const nounGroup = templateGroupByName(dictionary, "Noun declension");
    const nounCases = nounGroup.tables[0];
    const autoNoun = entryByLemma(dictionary, "tala");
    const autoNounGroups = morphologyModel.resolveEntryMorphologyGroups(autoNoun, dictionary);
    assert.equal(autoNounGroups.length, 1);
    assert.equal(autoNounGroups[0].templateGroup.id, nounGroup.id);
    assert.equal(morphologyModel.morphologyCellValue(autoNoun, autoNounGroups[0].entryGroup, nounCases, 0, 0, dictionary), "tala");
    assert.equal(morphologyModel.morphologyCellValue(autoNoun, autoNounGroups[0].entryGroup, nounCases, 0, 1, dictionary), "tala-ta");
    assert.equal(morphologyModel.morphologyCellValue(autoNoun, autoNounGroups[0].entryGroup, nounCases, 0, 2, dictionary), "");

    const autoOverlay = entryByLemma(dictionary, "kasa");
    const autoOverlayGroup = morphologyModel.resolveEntryMorphologyGroups(autoOverlay, dictionary)[0];
    assert.equal(autoOverlayGroup.entryGroup.title, "Irregular noun paradigm");
    assert.equal(autoOverlayGroup.entryGroup.notes, "The accusative is suppletive in this entry.");
    assert.equal(morphologyModel.morphologyCellValue(autoOverlay, autoOverlayGroup.entryGroup, nounCases, 0, 1, dictionary), "kasi");

    const manual = entryByLemma(dictionary, "panu");
    const manualGroups = morphologyModel.resolveEntryMorphologyGroups(manual, dictionary);
    assert.deepEqual(manualGroups.map(({ templateGroup }) => templateGroup.name), ["Adjective degree", "Noun declension"]);
    assert.equal(manualGroups[0].entryGroup.title, "Borrowed degree forms");
    assert.equal(manualGroups[0].entryGroup.notes, "A manual group can ignore the entry's part of speech.");

    const manualEmpty = entryByLemma(dictionary, "none");
    assert.deepEqual(morphologyModel.resolveEntryMorphologyGroups(manualEmpty, dictionary), []);

    const saved = await repository.updateSettings(DICTIONARY_ID, {
      ...dictionary.settings,
      showEmptyEntrySections: true,
    });
    assert.equal(saved.settings.showEmptyEntrySections, true);
    const reread = await repository.getDictionarySnapshot(DICTIONARY_ID);
    assert.equal(reread.settings.showEmptyEntrySections, true);
  } finally {
    repository?.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runMorphologyAcceptanceCheck().then(() => {
    console.log("Morphology acceptance check passed.");
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { runMorphologyAcceptanceCheck };
