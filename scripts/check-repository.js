const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  importDictionaryFromPayload,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("../lib/dictionary-model");
const { JsonDictionaryRepository } = require("../lib/json-dictionary-repository");

function createRepository(dataDir) {
  return new JsonDictionaryRepository({
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  });
}

async function assertRejectStatus(promise, status, label) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.status, status, label);
    return;
  }
  assert.fail(`${label}: expected rejection with status ${status}`);
}

function checkModelNormalization() {
  const normalized = normalizeDictionary({
    name: "Legacy",
    entries: [
      {
        lemma: "acar",
        partOfSpeech: "n",
        meaning: "root",
        roots: "old source",
        etymology: { sourceEntryId: "entry-source" },
      },
    ],
    settings: {
      entryListTagDisplayLimit: 99,
      ipa: { stressMappings: [{ from: "a", to: "a" }] },
    },
  });

  assert.match(normalized.id, /^dict-/);
  assert.equal(normalized.entries[0].tags[0], "n");
  assert.equal(normalized.entries[0].definitions[0].meaning, "root");
  assert.deepEqual(normalized.entries[0].etymology.sources, ["entry-source"]);
  assert.equal(normalized.settings.entryListTagDisplayLimit, 10);
  assert.equal(normalized.settings.ipa.mappings[0].to, "ˈa");

  const imported = importDictionaryFromPayload({
    activeDictionaryId: "dict-11111111-1111-4111-8111-111111111111",
    dictionaries: [
      {
        id: "dict-11111111-1111-4111-8111-111111111111",
        name: "Imported",
        entries: [{ lemma: "item", definitions: [{ meaning: "ok" }] }],
      },
    ],
  });
  assert.equal(imported.id, "dict-11111111-1111-4111-8111-111111111111");
  assert.equal(imported.entries[0].lemma, "item");

  assert.throws(
    () => importDictionaryFromPayload({ unrelated: true }),
    (error) => error.status === 400,
  );

  assert.throws(
    () => {
      const duplicate = normalizeDictionary({
        entries: [{ id: "shared-id", lemma: "a" }],
        corpus: { units: [{ id: "shared-id", content: "x" }] },
      });
      assertUniqueDictionaryEntityIds(duplicate);
    },
    (error) => error.status === 409,
  );
}

async function checkJsonRepository() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "conlexicon-repository-check-"));
  try {
    const repository = createRepository(dataDir);
    await repository.ensureDataStore();

    let state = await repository.readState();
    assert.equal(state.activeDictionaryId, "");
    assert.deepEqual(state.dictionaries, []);
    assert.equal(state.uiLanguage, "zh");
    assert.equal(state.uiTheme, "light");

    const first = await repository.createDictionary(normalizeDictionary({ name: "First", language: "one" }));
    const second = await repository.createDictionary(normalizeDictionary({ name: "Second", language: "two" }));

    state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [first.id, second.id]);

    await repository.activateDictionary(first.id);
    assert.equal((await repository.readState()).activeDictionaryId, first.id);

    const activeExport = await repository.exportDictionary();
    assert.equal(activeExport.id, first.id);

    const updated = await repository.updateDictionary(first.id, {
      name: "First Updated",
      entries: [{ lemma: "root", partOfSpeech: "n", meaning: "root meaning" }],
    });
    assert.equal(updated.name, "First Updated");
    assert.equal(updated.entries[0].tags[0], "n");
    assert.equal(updated.entries[0].definitions[0].meaning, "root meaning");

    const savedWithNewEntry = await repository.saveEntry(first.id, { lemma: "new entry", definitions: [{ meaning: "new" }] });
    assert.equal(savedWithNewEntry.entries.length, 2);
    assert.equal((await repository.getEntry(first.id, savedWithNewEntry.entries.at(-1).id)).lemma, "new entry");

    const preferences = await repository.updatePreferences({ uiLanguage: "en", uiTheme: "dark" });
    assert.deepEqual(preferences, { uiLanguage: "en", uiTheme: "dark" });
    state = await repository.readState();
    assert.equal(state.uiLanguage, "en");
    assert.equal(state.uiTheme, "dark");

    await assertRejectStatus(repository.importDictionary(first), 409, "duplicate import");
    await repository.importDictionary({ ...first, name: "First Overwritten" }, { overwrite: true });
    assert.equal((await repository.getDictionarySnapshot(first.id)).name, "First Overwritten");

    await repository.deleteDictionary(first.id);
    state = await repository.readState();
    assert.equal(state.activeDictionaryId, second.id);
    assert.deepEqual(state.dictionaries.map((dictionary) => dictionary.id), [second.id]);

    await assertRejectStatus(repository.activateDictionary(first.id), 404, "activate deleted dictionary");
    await assertRejectStatus(repository.exportDictionary(first.id), 404, "export deleted dictionary");
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  checkModelNormalization();
  await checkJsonRepository();
  console.log("Repository checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
