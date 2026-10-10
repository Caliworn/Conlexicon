const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");

function dictionary(id, name = id) {
  return { id, name, entries: [{ id: `entry-${id}`, lemma: name }] };
}

async function assertMissing(filePath) {
  await assert.rejects(fs.access(filePath), { code: "ENOENT" });
}

async function checkConcurrentChanges(repository) {
  // Start without an index to exercise concurrent default-index initialization too.
  const created = await Promise.all(Array.from({ length: 20 }, (_, i) => (
    repository.createDictionary(dictionary(`dict-concurrent-${i}`))
  )));
  const ids = created.map((item) => item.id);
  assert.deepEqual(new Set((await repository.readIndex()).dictionaryIds), new Set(ids));

  await Promise.all([
    repository.createDictionary(dictionary("dict-interleaved-new")),
    repository.deleteDictionary(ids[0]),
    repository.activateDictionary(ids[1]),
    repository.updatePreferences({ uiLanguage: "en" }),
    repository.updatePreferences({ uiTheme: "dark" }),
    repository.updatePreferences({ uiSkin: "layered-glass" }),
  ]);
  const index = await repository.readIndex();
  assert.deepEqual(new Set(index.dictionaryIds), new Set([...ids.slice(1), "dict-interleaved-new"]));
  assert.ok([ids[1], "dict-interleaved-new"].includes(index.activeDictionaryId), "The last concurrent create or activation selects the active dictionary");
  assert.equal(index.uiLanguage, "en");
  assert.equal(index.uiTheme, "dark");
  assert.equal(index.uiSkin, "layered-glass");
  await assertMissing(repository.dictionaryPath(ids[0]));
  await repository.activateDictionary(ids[1]);
  assert.equal((await repository.readIndex()).activeDictionaryId, ids[1]);

  const competing = await Promise.allSettled([
    repository.createDictionary(dictionary("dict-same-id", "winner one")),
    repository.createDictionary(dictionary("dict-same-id", "winner two")),
  ]);
  const successful = competing.filter((result) => result.status === "fulfilled");
  const rejected = competing.filter((result) => result.status === "rejected");
  assert.equal(successful.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.status, 409);
  assert.equal(rejected[0].reason.code, "dictionary_id_exists");
  assert.equal((await repository.readIndex()).dictionaryIds.filter((id) => id === "dict-same-id").length, 1);
  assert.equal((await repository.getDictionarySnapshot("dict-same-id")).name, successful[0].value.name);

  const competingImports = await Promise.allSettled([
    repository.importDictionary(dictionary("dict-same-import", "import one")),
    repository.importDictionary(dictionary("dict-same-import", "import two")),
  ]);
  assert.equal(competingImports.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competingImports.find((result) => result.status === "rejected").reason.code, "dictionary_id_exists");
}

async function checkPruningWithConcurrentChanges(repository) {
  await repository.updateIndex((index) => ({ ...index, dictionaryIds: [...index.dictionaryIds, "dict-missing"] }));
  const results = await Promise.allSettled([
    repository.readState(),
    repository.createDictionary(dictionary("dict-added-during-pruning")),
    repository.updatePreferences({ uiTheme: "light" }),
  ]);
  results.forEach((result) => assert.equal(result.status, "fulfilled", result.reason?.stack));
  const state = await repository.readState();
  assert.ok(state.dictionaries.some((item) => item.id === "dict-added-during-pruning"));
  assert.equal(state.activeDictionaryId, "dict-added-during-pruning");
  assert.equal(state.uiTheme, "light");
  const index = await repository.readIndex();
  assert.ok(index.dictionaryIds.includes("dict-added-during-pruning"));
  assert.equal(index.dictionaryIds.includes("dict-missing"), false, "Listing must prune missing dictionaries without losing concurrent additions");
}

async function checkAtomicWriteFailure(repository) {
  const writeIndexFile = repository.writeIndexFile;
  const before = await fs.readFile(repository.indexPath, "utf8");
  const existingId = (await repository.readIndex()).activeDictionaryId;
  const original = await repository.getDictionarySnapshot(existingId);
  const failure = new Error("injected failure before index rename");
  repository.writeIndexFile = async function failBeforeRename(index) {
    const handle = await fs.open(`${this.indexPath}.tmp`, "w");
    try {
      await handle.writeFile(JSON.stringify(index));
      await handle.sync();
    } finally {
      await handle.close();
    }
    throw failure;
  };
  try {
    await assert.rejects(repository.updatePreferences({ uiLanguage: "zh" }), (error) => error === failure);
    assert.deepEqual(JSON.parse(await fs.readFile(repository.indexPath, "utf8")), JSON.parse(before));
    await assert.rejects(repository.createDictionary(dictionary("dict-index-failed")), (error) => error === failure);
    await assertMissing(repository.dictionaryPath("dict-index-failed"));
    await assert.rejects(repository.importDictionary(dictionary(existingId, "must not replace data"), { overwrite: true }), (error) => error === failure);
    assert.deepEqual(await repository.getDictionarySnapshot(existingId), original);
    assert.equal(await fs.readFile(repository.indexPath, "utf8"), before);
  } finally {
    repository.writeIndexFile = writeIndexFile;
  }
  // A rejected lock task must neither poison the queue nor leave the temp file unusable.
  await repository.updatePreferences({ uiLanguage: "zh" });
  assert.equal((await repository.readIndex()).uiLanguage, "zh");
}

async function checkReadersDuringWrites(repository) {
  const stableId = (await repository.readIndex()).activeDictionaryId;
  const beforeIds = (await repository.readIndex()).dictionaryIds;
  const deletedIds = beforeIds.filter((id) => id !== stableId).slice(0, 10);
  const addedIds = [];
  const operations = [];
  for (let i = 0; i < 200; i += 1) {
    operations.push(
      repository.readIndex(),
      repository.requireDictionary(stableId),
      repository.readState(),
      repository.hasDictionary(stableId),
      repository.exportDictionary(stableId),
      repository.updatePreferences({ uiTheme: i % 2 ? "dark" : "light" }),
    );
    if (i < deletedIds.length) {
      const addedId = `dict-read-write-${i}`;
      addedIds.push(addedId);
      operations.push(
        repository.createDictionary(dictionary(addedId)),
        repository.deleteDictionary(deletedIds[i]),
      );
    }
  }
  const results = await Promise.allSettled(operations);
  results.forEach((result) => assert.equal(result.status, "fulfilled", result.reason?.stack));
  const index = await repository.readIndex();
  assert.equal(index.uiTheme, "dark");
  assert.deepEqual(new Set(index.dictionaryIds), new Set([
    ...beforeIds.filter((id) => !deletedIds.includes(id)),
    ...addedIds,
  ]));
}

async function checkDatabaseFailures(repository) {
  const writeDictionary = repository.writeDictionaryToDatabase;
  const failure = new Error("injected dictionary write failure");
  const before = await repository.readIndex();
  repository.writeDictionaryToDatabase = () => { throw failure; };
  try {
    await assert.rejects(repository.createDictionary(dictionary("dict-write-failed")), (error) => error === failure);
    assert.deepEqual(await repository.readIndex(), before);
    await assertMissing(repository.dictionaryPath("dict-write-failed"));
  } finally {
    repository.writeDictionaryToDatabase = writeDictionary;
  }

  const original = await repository.createDictionary(dictionary("dict-overwrite", "original data"));
  await repository.activateDictionary(before.activeDictionaryId);
  const previousIndex = await repository.readIndex();
  repository.writeDictionaryToDatabase = () => { throw failure; };
  try {
    await assert.rejects(repository.importDictionary(dictionary(original.id, "replacement"), { overwrite: true }), (error) => error === failure);
    assert.deepEqual(await repository.readIndex(), previousIndex);
    assert.deepEqual(await repository.getDictionarySnapshot(original.id), original);
  } finally {
    repository.writeDictionaryToDatabase = writeDictionary;
  }

  // Also fail inside the real transaction after it has deleted the old contents.
  const db = repository.openDictionaryDatabase(original.id);
  db.exec("CREATE TEMP TRIGGER reject_overwrite BEFORE INSERT ON dictionary_meta BEGIN SELECT RAISE(ABORT, 'injected transaction failure'); END;");
  try {
    await assert.rejects(repository.importDictionary(dictionary(original.id, "replacement"), { overwrite: true }), /injected transaction failure/);
    assert.deepEqual(await repository.readIndex(), previousIndex);
    assert.deepEqual(await repository.getDictionarySnapshot(original.id), original);
  } finally {
    db.exec("DROP TRIGGER reject_overwrite;");
  }

  const applySchema = repository.applySchema;
  repository.applySchema = () => { throw failure; };
  try {
    await assert.rejects(repository.createDictionary(dictionary("dict-open-failed")), (error) => error === failure);
    assert.deepEqual(await repository.readIndex(), previousIndex);
    await assertMissing(repository.dictionaryPath("dict-open-failed"));
  } finally {
    repository.applySchema = applySchema;
  }
}

async function checkCompensationFailure(repository) {
  const writeDictionary = repository.writeDictionaryToDatabase;
  const writeIndexFile = repository.writeIndexFile;
  const before = await repository.readIndex();
  const writeFailure = new Error("injected write failure");
  const restoreFailure = new Error("injected restoration failure");
  let writes = 0;
  repository.writeDictionaryToDatabase = () => { throw writeFailure; };
  repository.writeIndexFile = function failRestoration(index) {
    writes += 1;
    if (writes === 2) {
      throw restoreFailure;
    }
    return writeIndexFile.call(this, index);
  };
  try {
    await assert.rejects(repository.createDictionary(dictionary("dict-compensation-failed")), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [writeFailure, restoreFailure]);
      return true;
    });
    await assertMissing(repository.dictionaryPath("dict-compensation-failed"));
  } finally {
    repository.writeDictionaryToDatabase = writeDictionary;
    repository.writeIndexFile = writeIndexFile;
  }
  const state = await repository.readState();
  assert.deepEqual(state.dictionaries.map((item) => item.id), before.dictionaryIds);
  await repository.updatePreferences({ uiTheme: "dark" });
  assert.equal((await repository.readIndex()).uiTheme, "dark");
}

async function checkDeleteIndexFailure(repository) {
  await repository.createDictionary(dictionary("dict-delete-failed"));
  const writeIndexFile = repository.writeIndexFile;
  const failure = new Error("injected delete registration failure");
  repository.writeIndexFile = () => { throw failure; };
  try {
    await assert.rejects(repository.deleteDictionary("dict-delete-failed"), (error) => error === failure);
    await assertMissing(repository.dictionaryPath("dict-delete-failed"));
    assert.ok((await repository.readIndex()).dictionaryIds.includes("dict-delete-failed"));
  } finally {
    repository.writeIndexFile = writeIndexFile;
  }
  const state = await repository.readState();
  assert.equal(state.dictionaries.some((item) => item.id === "dict-delete-failed"), false);
  assert.equal((await repository.readIndex()).dictionaryIds.includes("dict-delete-failed"), false, "Listing repairs registration after a delete-index failure");
}

async function main() {
  requireSqliteRuntime("index consistency check");
  const { repository, cleanup } = await createTempSqliteRepository("conlexicon-index-consistency-");
  try {
    await checkConcurrentChanges(repository);
    await checkPruningWithConcurrentChanges(repository);
    await checkAtomicWriteFailure(repository);
    await checkReadersDuringWrites(repository);
    await checkDatabaseFailures(repository);
    await checkCompensationFailure(repository);
    await checkDeleteIndexFailure(repository);
  } finally {
    await cleanup();
  }
  console.log("Index concurrency, atomic replacement and failure compensation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
