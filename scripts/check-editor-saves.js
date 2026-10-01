const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// app.js is not modular yet, so this check slices source between known
// function declarations and runs it in a VM with stubbed globals. The slices
// assume ensureDocsDraft() … cloneCorpus() hold the docs save functions and
// closePendingEditsForPageSwitch() … filteredEntries() hold the switch flow.
// Reordering app.js or adding functions inside those ranges makes this check
// fail loudly; update the boundaries (or the stubs) rather than the behaviour.
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const docsFunctions = app.slice(app.indexOf("function ensureDocsDraft("), app.indexOf("function cloneCorpus("));
const switchFunction = app.slice(app.indexOf("async function closePendingEditsForPageSwitch("), app.indexOf("function filteredEntries("));
const tick = () => new Promise((resolve) => setImmediate(resolve));

function docsHarness() {
  const dictionaries = new Map([
    ["one", { id: "one", docs: { markdown: "saved" }, settings: { docsAutoSave: true } }],
    ["two", { id: "two", docs: { markdown: "other" }, settings: { docsAutoSave: true } }],
  ]);
  let activeId = "one";
  const requests = [];
  const errors = [];
  const context = vm.createContext({
    activeDictionary: () => dictionaries.get(activeId),
    api: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, docs: JSON.parse(options.body), resolve, reject });
    }),
    applyDictionaryModulePayload: (saved) => {
      const dictionary = dictionaries.get(saved.id);
      dictionary.docs = saved.docs;
      return dictionary;
    },
    clearTimeout() {},
    setTimeout() { return 1; },
    normalizeDictionarySettings: (settings) => settings,
    showToast() {},
    showApiErrorToast: (error) => errors.push(error),
    t: (key) => key,
    console: { error: (error) => errors.push(error) },
  });
  vm.runInContext("let docsDraftState = null; let docsSaveTimer = null; let docsSavePromise = null; let docsSaveRequested = false;", context);
  vm.runInContext(docsFunctions, context);
  return {
    context, requests, errors, dictionaries,
    edit(markdown) { context.ensureDocsDraft().markdown = markdown; },
    draft() { return context.ensureDocsDraft(); },
    switchTo(id) { activeId = id; },
    resolve(index) {
      const request = requests[index];
      const id = decodeURIComponent(request.url.split("/")[3]);
      request.resolve({ id, docs: request.docs });
    },
  };
}

async function checkDocsSaves() {
  const h = docsHarness();
  h.edit("first input");
  const draft = h.draft();
  const first = h.context.saveLanguageDocs(false);
  h.edit("input during request");
  const second = h.context.saveLanguageDocs(false);
  assert.equal(h.requests.length, 1, "Overlapping saves must serialize requests");
  h.resolve(0);
  await tick();
  assert.equal(h.draft(), draft, "Save must retain the live draft object");
  assert.equal(h.draft().markdown, "input during request");
  assert.equal(h.requests.length, 2, "New input must be saved after the pending request");
  assert.equal(h.requests[1].docs.markdown, "input during request");
  h.resolve(1);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.context.docsFormIsDirty(), false);

  // Returning to the previous baseline while a save is pending is still an edit.
  h.edit("temporary");
  const revert = h.context.saveLanguageDocs(false);
  h.edit("input during request");
  h.resolve(2);
  await tick();
  assert.equal(h.requests[3].docs.markdown, "input during request");
  h.resolve(3);
  assert.equal(await revert, true);

  const switched = docsHarness();
  switched.edit("one update");
  const oldSave = switched.context.saveLanguageDocs(false);
  switched.switchTo("two");
  switched.edit("two unsaved");
  const otherDraft = switched.draft();
  switched.resolve(0);
  assert.equal(await oldSave, true);
  assert.equal(switched.draft(), otherDraft);
  assert.equal(switched.draft().markdown, "two unsaved");
  assert.equal(switched.requests.length, 1, "An old response must not start saving another dictionary");
  assert.equal(switched.context.docsFormIsDirty(), true);

  const failed = docsHarness();
  failed.edit("retry me");
  const pending = failed.context.saveLanguageDocs(false);
  const error = new Error("save failed");
  failed.requests[0].reject(error);
  assert.equal(await pending, false);
  assert.equal(failed.errors[0], error);
  assert.equal(failed.draft().markdown, "retry me");
  assert.equal(failed.context.docsFormIsDirty(), true);
  const retry = failed.context.saveLanguageDocs(false);
  failed.resolve(1);
  assert.equal(await retry, true);
  assert.equal(failed.context.docsFormIsDirty(), false);
}

async function checkEditSwitchErrors() {
  const errors = [];
  const error = new Error("unexpected dirty check error");
  const context = vm.createContext({
    activeDictionary: () => ({ settings: { partialEditPageSwitchAction: "prompt" } }),
    normalizeDictionarySettings: (settings) => settings,
    partialEditForm: () => ({}),
    partialEntryFormIsDirty: () => { throw error; },
    console: { error: (value) => errors.push(value) },
    t: (key) => key,
    appEditSwitchPrompt: async () => "cancel",
  });
  vm.runInContext(switchFunction, context);
  assert.equal(await context.closePendingEditsForPageSwitch(), false);
  assert.equal(errors[0], error, "Unexpected errors must be logged while blocking navigation");
  errors.length = 0;
  context.partialEntryFormIsDirty = () => true;
  assert.equal(await context.closePendingEditsForPageSwitch(), false);
  assert.equal(errors.length, 0, "Normal cancellation is not an error");
}

async function main() {
  await checkDocsSaves();
  await checkEditSwitchErrors();
  console.log("Editor save and navigation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
