// The "Morphology Tables" page: one shared draft of the morphology module per dictionary, shown
// in a structure view (slots, rules, inheritance, assignment trial) and a tables view (rows,
// columns, cells, word-form trial). Loaded before app.js; it only runs after app.js has loaded.

const morphologyPageStates = new Map();
let morphologyDragState = null;
let morphologyModalCleanup = null;
let morphologyTrialRequestId = 0;
let morphologyLayoutObserver;
let morphologyCompactTrial;

function morphologyDraftModel() {
  return window.ConlexiconMorphologyDraft;
}

function morphologyModalIsOpen() {
  return Boolean(morphologyModalCleanup || elements.morphologyTablesPanel.querySelector(".morphology-drawer[open]"));
}

// ---- State ----------------------------------------------------------------------------------

function newMorphologyPageState(dictionary) {
  return {
    dictionaryId: dictionary.id,
    view: "structure",
    selectedTableId: "",
    trial: { mode: "tags", tagsText: "", entryQuery: "", entry: null, entryStatus: "idle", contextKey: "merged" },
    formTrial: { lemma: "", autoFilled: false },
    drawer: null,
    pick: null,
    ...morphologyPageBase(dictionary),
  };
}

function morphologyPageBase(dictionary) {
  const saved = structuredClone(dictionary.morphology);
  return {
    saved,
    savedJson: stableJson(saved),
    draft: structuredClone(saved),
    lineage: morphologyDraftModel().initialLineage(saved),
    undo: null,
    saving: false,
  };
}

// The draft survives leaving and returning; it follows the saved module while it has no edits.
function morphologyPageState(dictionary = activeDictionary()) {
  let page = morphologyPageStates.get(dictionary.id);
  if (!page) {
    page = newMorphologyPageState(dictionary);
    morphologyPageStates.set(dictionary.id, page);
  } else if (page.savedJson !== stableJson(dictionary.morphology) && !morphologyPageIsDirty(page)) {
    Object.assign(page, morphologyPageBase(dictionary));
  }
  if (page.selectedTableId && !morphologyDraftModel().findTable(page.draft, page.selectedTableId)) {
    page.selectedTableId = "";
  }
  return page;
}

function morphologyPageIsDirty(page) {
  return morphologyDraftModel().draftIsDirty(page.draft, page.saved);
}

function morphologyTemplatesAreDirty(dictionary = activeDictionary()) {
  const page = dictionary && morphologyPageStates.get(dictionary.id);
  return Boolean(page && morphologyPageIsDirty(page));
}

function discardMorphologyDraft(dictionary = activeDictionary()) {
  const page = morphologyPageStates.get(dictionary.id);
  if (!page) return;
  Object.assign(page, morphologyPageBase(dictionary), { pick: null });
}

// Leaving the page clears the undo record once any unsaved check has passed.
async function confirmLeaveMorphologyTemplates() {
  const dictionary = activeDictionary();
  const page = morphologyPageStates.get(dictionary.id);
  if (!page) return true;
  if (morphologyPageIsDirty(page)) {
    const left = await confirmUnsavedChanges(t("unsavedMorphologyTablesConfirm"), {
      save: () => saveMorphologyTemplates(),
      discard: () => discardMorphologyDraft(dictionary),
    });
    if (!left) return false;
  }
  page.undo = null;
  page.pick = null;
  page.drawer = null;
  return true;
}

// ---- Derived data ---------------------------------------------------------------------------

function morphologyRuleTextError(sourceText, functions) {
  const model = window.ConlexiconMorphology;
  for (const reference of model.extractMorphologyReferences(sourceText)) {
    if (reference.unterminated) return aText("缺少 }", "Missing }");
    const body = reference.body.trim();
    if (!body || body.toLowerCase() === "lemma") continue;
    for (const part of body.split(",")) {
      const parsed = model.parseMorphologyReplacement(part);
      if (!parsed.valid) return `{${body}}：${parsed.reason}`;
    }
  }
  for (const call of model.extractMorphologyFunctionCalls(sourceText)) {
    if (call.invalidOffset) return aText(`${call.name} 的位置必须是正整数`, `${call.name} offset must be a positive integer`);
    if (call.name === "left" || call.name === "right") continue;
    const configured = functions[call.name] || [];
    if (!configured.length) return aText(`${call.name} 还没有配置识别对象`, `${call.name} has no recognition objects`);
    const invalid = call.options.filter((option) => !configured.includes(option));
    if (invalid.length) return aText(`${call.name}(${invalid.join(", ")}) 不在识别对象中`, `${call.name}(${invalid.join(", ")}) is not configured`);
  }
  return "";
}

// Everything that blocks saving, located by table, rule row or cell.
function morphologyDraftProblems(page) {
  const draftModel = morphologyDraftModel();
  const functions = page.draft.functions;
  const cellErrors = [];
  draftModel.allTables(page.draft).forEach((table) => table.cells.forEach((cell) => {
    if (cell.kind !== "rule") return;
    const message = morphologyRuleTextError(cell.sourceText, functions);
    if (message) cellErrors.push({ tableId: table.id, rowId: cell.rowId, columnId: cell.columnId, message });
  }));
  return {
    ruleErrors: draftModel.ruleRowErrors(page.draft),
    cycles: draftModel.referenceCycles(page.draft),
    cellErrors,
  };
}

// Tables whose generation a problem pauses: the table itself and everything inheriting from it.
function morphologyPausedTableIds(page, problems) {
  const paused = new Set();
  [...problems.cycles, ...problems.cellErrors].forEach(({ tableId }) => {
    morphologyDraftModel().descendantTableIds(page.draft, tableId).forEach((id) => paused.add(id));
  });
  return paused;
}

function morphologyRuleRowText(rule) {
  const all = rule.all.join(", ");
  return rule.none.length ? `${all} · ${aText("排除", "except")}：${rule.none.join(", ")}` : all;
}

function morphologyTableLabel(morphology, tableId) {
  const table = morphologyDraftModel().findTable(morphology, tableId);
  return table ? morphologyTableTitleText(table) : tableId;
}

function morphologySummaryCounts(dictionary) {
  const queryState = analysisQueryStateFor("morphology", dictionary);
  if (queryState.status === "idle") void loadAnalysisQuery("morphology", dictionary);
  if (queryState.status !== "ready") return { status: queryState.status === "error" ? "error" : "loading" };
  return {
    status: "ready",
    response: queryState.response,
    counts: new Map(queryState.response.summary.tables.map((row) => [row.tableId, row.assignedEntryCount])),
  };
}

function morphologyTagUsage(dictionary) {
  startTagUsageCheck(dictionary);
  if (tagUsageState.status !== "success" || tagUsageState.key !== tagUsageApiKey(dictionary)) return null;
  const normalize = window.ConlexiconSearchNormalization.normalizeStructuralKey;
  return new Map(tagUsageState.rows.map((row) => [normalize(row.tag), row.entryCount]));
}

// Assignment trial: contexts, per-context explanations and the context in view.
function morphologyTrialState(page, problems) {
  const { trial } = page;
  if (problems.ruleErrors.length) return { status: "rule_error" };
  let contexts = null;
  let entryNote = "";
  if (trial.mode === "tags") {
    const tags = parseTagListText(trial.tagsText);
    if (!tags.length) return { status: "empty" };
    contexts = [{ definitionId: null, tags }];
  } else {
    if (!trial.entry) return { status: trial.entryStatus === "loading" ? "loading" : trial.entryStatus === "error" ? "error" : "empty" };
    contexts = window.ConlexiconMorphology.morphologyMatchContexts(trial.entry);
    if (trial.entry.morphologyMode === "manual") {
      entryNote = aText("这个词条手动选择形态表；这里用它的标签试算自动分配。", "This entry selects tables manually; this shows what automatic assignment would give its tags.");
    }
  }
  const morphology = morphologyDraftModel().normalizedDraft(page.draft);
  const explained = window.ConlexiconMorphology.explainAutomaticTables(contexts, morphology);
  const label = morphologyContextLabeler(trial.mode === "entry" ? trial.entry.definitions : []);
  // Contexts that read the same label (entry tags only) have the same tags and results.
  const options = [];
  explained.contexts.forEach((context) => {
    const text = label([context.definitionId]);
    const existing = options.find((option) => option.label === text);
    if (existing) existing.definitionIds.push(context.definitionId);
    else options.push({ key: String(context.definitionId), label: text, definitionIds: [context.definitionId], context });
  });
  const key = options.length > 1 && options.some((option) => option.key === trial.contextKey) ? trial.contextKey : (options.length > 1 ? "merged" : options[0].key);
  return { status: "ready", morphology, explained, options, key, label, entryNote };
}

function morphologyExplanationText(page, explanation) {
  const names = (ids) => ids.map((id) => `“${morphologyTableLabel(page.draft, id)}”`).join(aText("、", ", "));
  if (explanation.status === "effective") return aText("生效", "Applies");
  if (explanation.status === "coeffective") return aText("同时生效", "Applies alongside others");
  if (explanation.status === "covered") return aText(`被${names(explanation.coveredByTableIds)}覆盖`, `Covered by ${names(explanation.coveredByTableIds)}`);
  if (explanation.status === "no_rules") return aText("没有匹配规则", "No match rules");
  const rows = explanation.rules.map((rule) => {
    const parts = [];
    if (rule.missingTags.length) parts.push(aText(`缺少 ${rule.missingTags.join("、")}`, `missing ${rule.missingTags.join(", ")}`));
    if (rule.excludedTags.length) parts.push(aText(`带有排除标签 ${rule.excludedTags.join("、")}`, `has excluded ${rule.excludedTags.join(", ")}`));
    return explanation.rules.length > 1 ? `${aText(`第 ${rule.row} 行`, `Row ${rule.row}`)}：${parts.join(aText("，", ", "))}` : parts.join(aText("，", ", "));
  });
  return `${aText("不满足", "Not matched")}：${rows.join(aText("；", "; "))}`;
}

// Per-table trial verdicts for the card badges, for the merged view or one context.
function morphologyTrialVerdicts(page, trialState) {
  const verdicts = new Map();
  if (trialState.status !== "ready") return verdicts;
  if (trialState.key === "merged") {
    const contextsByTable = new Map();
    trialState.explained.contexts.forEach((context) => context.tableIds.forEach((id) => {
      if (!contextsByTable.has(id)) contextsByTable.set(id, []);
      contextsByTable.get(id).push(context.definitionId);
    }));
    morphologyDraftModel().allTables(page.draft).forEach((table) => {
      const definitionIds = contextsByTable.get(table.id);
      verdicts.set(table.id, definitionIds
        ? { effective: true, badge: aText("生效", "Applies"), detail: trialState.label(definitionIds) }
        : { effective: false, badge: aText("未生效", "Does not apply"), detail: "" });
    });
    return verdicts;
  }
  const option = trialState.options.find(({ key }) => key === trialState.key);
  option.context.slots.forEach((slot) => slot.tables.forEach((explanation) => {
    const effective = explanation.status === "effective" || explanation.status === "coeffective";
    const badges = {
      effective: aText("生效", "Applies"),
      coeffective: aText("同时生效", "Applies alongside"),
      no_rules: aText("没有匹配规则", "No match rules"),
      unmatched: aText("不满足", "Not matched"),
    };
    // A covered table says by whom in the badge; an unmatched one lists the reasons after it.
    const text = morphologyExplanationText(page, explanation);
    verdicts.set(explanation.tableId, {
      effective,
      badge: explanation.status === "covered" ? text : badges[explanation.status],
      detail: explanation.status === "unmatched" ? text.slice(text.indexOf(aText("：", ":")) + 1).trim() : "",
    });
  }));
  return verdicts;
}

// ---- Rendering: page frame ---------------------------------------------------------------------

function morphologyToolbarHtml(page) {
  return `<div class="morphology-page-toolbar">
    <div class="morphology-toolbar-main">
      <div class="morphology-view-switch" role="tablist" aria-label="${escapeHtml(aText("视图", "View"))}">
        ${[["structure", aText("结构", "Structure")], ["tables", aText("表格", "Tables")]].map(([view, label]) => `
          <button class="morphology-toolbar-button" type="button" role="tab" data-mtp-action="view" data-view-name="${view}" data-mtp-focus="view:${view}" aria-selected="${page.view === view}">${escapeHtml(label)}</button>
        `).join("")}
      </div>
      ${page.view === "structure" ? `<div class="morphology-toolbar-drawers">
        <button class="morphology-toolbar-button" type="button" data-mtp-action="open-drawer" data-pane="trial" data-mtp-focus="drawer:trial" aria-haspopup="dialog" aria-controls="morphologyDrawer" aria-expanded="false">
          <span>${escapeHtml(aText("试算", "Trial"))}</span><span class="morphology-toolbar-trial-summary" data-mtp-region="trial-summary" hidden></span>
        </button>
        <button class="morphology-toolbar-button" type="button" data-mtp-action="open-drawer" data-pane="properties" data-mtp-focus="drawer:properties" aria-haspopup="dialog" aria-controls="morphologyDrawer" aria-expanded="false"${page.selectedTableId ? "" : " disabled"}>${escapeHtml(aText("属性", "Properties"))}</button>
      </div>` : morphologyTableSelectHtml(page)}
    </div>
    <div class="morphology-toolbar-actions">
      <span class="morphology-dirty-status" role="status" data-mtp-region="save-status"></span>
      <button class="morphology-toolbar-button" type="button" data-mtp-action="discard" data-mtp-focus="discard">${escapeHtml(t("editSwitchDiscard"))}</button>
      <button class="morphology-toolbar-button morphology-toolbar-save" type="button" data-mtp-action="save" data-mtp-focus="save">${escapeHtml(t("save"))}</button>
    </div>
    <div class="morphology-undo-notice" hidden>
      <span class="morphology-undo-message" role="status" data-mtp-region="undo-message"></span>
      <button class="morphology-toolbar-button" type="button" data-mtp-action="undo" data-mtp-focus="undo">${escapeHtml(aText("撤销", "Undo"))}</button>
    </div>
  </div>`;
}

function renderMorphologyTemplatePage(dictionary = activeDictionary()) {
  const panel = elements.morphologyTablesPanel;
  if (!dictionary || panel.hidden) return;
  const page = morphologyPageState(dictionary);
  if (page.view === "tables" && !page.selectedTableId) page.selectedTableId = page.draft.slots[0]?.tables[0].id || "";
  const focus = morphologyFocusSnapshot(panel);
  const scroll = [...panel.querySelectorAll("[data-mtp-scroll]")].map((node) => [node.dataset.mtpScroll, node.scrollTop]);
  const drawer = panel.querySelector(".morphology-drawer[open]");
  if (drawer) hideMorphologyDrawer(drawer);
  panel.innerHTML = `
    ${morphologyToolbarHtml(page)}
    <div class="morphology-page-body" data-view="${page.view}">
      ${page.view === "structure" ? morphologyStructureViewHtml(page) : morphologyTablesViewHtml(page)}
    </div>
  `;
  panel.inert = page.saving;
  const entryPicker = panel.querySelector('[data-mtp-trial="entry"]');
  if (entryPicker) {
    bindSourceAutocompleteInput(entryPicker, {
      label: aText("词条", "Entries"),
      onPick: (summary) => void morphologyPickTrialEntry(summary),
    });
  }
  if (page.view === "structure" && page.drawer && morphologyStructureIsNarrow()) {
    showMorphologyDrawer(page);
  } else {
    page.drawer = null;
  }
  renderMorphologyTemplateDerived(dictionary);
  observeMorphologyLayout();
  for (const [name, top] of scroll) {
    const node = panel.querySelector(`[data-mtp-scroll="${CSS.escape(name)}"]`);
    if (node) node.scrollTop = top;
  }
  morphologyRestoreFocus(panel, focus);
}

// Updates what follows from the draft without replacing any control the user may be typing in.
function renderMorphologyTemplateDerived(dictionary = activeDictionary()) {
  const panel = elements.morphologyTablesPanel;
  if (!dictionary || panel.hidden || !panel.firstElementChild) return;
  const page = morphologyPageState(dictionary);
  const problems = morphologyDraftProblems(page);
  renderMorphologyToolbarState(page);
  if (page.view === "structure") {
    renderMorphologyStructureDerived(page, dictionary, problems);
  } else {
    renderMorphologyTablesDerived(page, dictionary, problems);
  }
}

function renderMorphologyToolbarState(page) {
  const panel = elements.morphologyTablesPanel;
  const dirty = morphologyPageIsDirty(page);
  const status = panel.querySelector('[data-mtp-region="save-status"]');
  const text = page.saving ? aText("正在保存", "Saving")
    : dirty ? aText("未保存", "Unsaved") : aText("已保存", "Saved");
  if (status.textContent !== text) status.textContent = text;
  panel.querySelector('[data-mtp-action="discard"]').disabled = !dirty || page.saving;
  panel.querySelector('[data-mtp-action="save"]').disabled = !dirty || page.saving;
  const notice = panel.querySelector(".morphology-undo-notice");
  const message = notice.querySelector('[data-mtp-region="undo-message"]');
  notice.hidden = !page.undo;
  if (message.textContent !== (page.undo?.message || "")) message.textContent = page.undo?.message || "";
}

function observeMorphologyLayout() {
  const panel = elements.morphologyTablesPanel;
  const toolbar = panel.querySelector(".morphology-page-toolbar");
  const workspace = panel.closest(".workspace");
  const update = () => {
    if (state.activeView !== "morphology-tables" || panel.hidden) return;
    panel.style.setProperty("--morphology-toolbar-height", `${toolbar.offsetHeight}px`);
    panel.style.setProperty("--morphology-workspace-height", mobileShellMode() ? `${workspace.clientHeight}px` : "100dvh");
    if (panel.querySelector(".morphology-drawer[open]") && !morphologyStructureIsNarrow()) {
      closeMorphologyDrawer({ docked: true });
    }
  };
  morphologyLayoutObserver?.disconnect();
  morphologyLayoutObserver = new ResizeObserver(update);
  morphologyLayoutObserver.observe(toolbar);
  morphologyLayoutObserver.observe(workspace);
  update();
}

function morphologyFocusSnapshot(panel) {
  const active = document.activeElement;
  if (!panel.contains(active) || !active.dataset.mtpFocus) return null;
  return { key: active.dataset.mtpFocus, start: active.selectionStart, end: active.selectionEnd };
}

function morphologyRestoreFocus(panel, snapshot, { preventScroll = false } = {}) {
  const page = morphologyPageState();
  const key = page.pendingFocus || snapshot?.key;
  page.pendingFocus = "";
  if (!key) return;
  const target = panel.querySelector(`[data-mtp-focus="${CSS.escape(key)}"]`)
    || document.querySelector(`[data-mtp-focus="${CSS.escape(key)}"]`);
  if (!target) return;
  target.focus({ preventScroll });
  if (snapshot && snapshot.key === key && typeof snapshot.start === "number" && target.setSelectionRange) {
    target.setSelectionRange(snapshot.start, snapshot.end);
  }
}

function morphologyFocusAfterRender(key) {
  morphologyPageState().pendingFocus = key;
}

// ---- Structure view ----------------------------------------------------------------------------

function morphologyStructureViewHtml(page) {
  const selected = page.selectedTableId ? morphologyDraftModel().findTable(page.draft, page.selectedTableId) : null;
  return `<div class="morphology-structure">
    <aside class="morphology-structure-rail">
      <section class="morphology-structure-trial" data-mtp-pane="trial" data-mtp-scroll="trial" aria-labelledby="morphologyTrialHeading">${morphologyTrialHtml(page)}</section>
      <section class="morphology-structure-properties" data-mtp-pane="properties" data-mtp-scroll="properties:${escapeHtml(page.selectedTableId)}" aria-labelledby="morphologyPropertiesHeading">
        ${morphologyPaneHeadingHtml("morphologyPropertiesHeading", aText("表格属性", "Table properties"))}
        ${selected ? morphologyPropertiesHtml(page, selected) : `<p class="muted-text">${escapeHtml(aText("选择一张表来编辑标题、备注和匹配规则。", "Select a table to edit its title, notes and match rules."))}</p>`}
      </section>
    </aside>
    <section class="morphology-structure-slots" aria-label="${escapeHtml(aText("槽位", "Slots"))}">
      <ol class="morphology-slot-list" data-mtp-region="slots">${morphologySlotListHtml(page)}</ol>
      <button class="secondary-button additive-button" type="button" data-control-tone="accent" data-control-emphasis="outline" data-mtp-action="new-table" data-mtp-focus="new-table">${escapeHtml(aText("新建表格", "New table"))}</button>
    </section>
    <dialog class="morphology-drawer" id="morphologyDrawer"></dialog>
  </div>`;
}

function morphologyPaneHeadingHtml(id, label) {
  return `<div class="morphology-pane-heading">
    <h3 id="${id}">${escapeHtml(label)}</h3>
    <button class="secondary-button morphology-drawer-close" type="button" data-control-tone="neutral" data-mtp-action="close-drawer" data-mtp-focus="close:${id}">${escapeHtml(t("close"))}</button>
  </div>`;
}

// Move the original pane into the dialog so its controls and IDs stay unique across layouts.
function showMorphologyDrawer(page) {
  const panel = elements.morphologyTablesPanel;
  const { pane } = page.drawer;
  const drawer = panel.querySelector(".morphology-drawer");
  const section = panel.querySelector(`[data-mtp-pane="${pane}"]`);
  drawer.setAttribute("aria-labelledby", section.getAttribute("aria-labelledby"));
  drawer.append(section);
  panel.querySelector(`[data-mtp-action="open-drawer"][data-pane="${pane}"]`).setAttribute("aria-expanded", "true");
  hideAppTooltip();
  // Put tooltips on the same top layer as their controls.
  drawer.append(elements.appTooltip);
  drawer.showModal();
  syncMorphologyTrialDetails(page);
}

function hideMorphologyDrawer(drawer) {
  hideAppTooltip();
  document.body.append(elements.appTooltip);
  drawer.close();
}

function closeMorphologyDrawer({ docked = false } = {}) {
  const page = morphologyPageState();
  const panel = elements.morphologyTablesPanel;
  const { pane, returnFocus } = page.drawer;
  const drawer = panel.querySelector(".morphology-drawer");
  const section = drawer.firstElementChild;
  const focus = morphologyFocusSnapshot(panel);
  const rail = panel.querySelector(".morphology-structure-rail");
  page.drawer = null;
  hideMorphologyDrawer(drawer);
  if (pane === "trial") rail.prepend(section);
  else rail.append(section);
  panel.querySelector(`[data-mtp-action="open-drawer"][data-pane="${pane}"]`).setAttribute("aria-expanded", "false");
  syncMorphologyTrialDetails(page);

  if (docked) {
    const firstField = pane === "properties" ? "prop-title" : `trial-${page.trial.mode}`;
    morphologyRestoreFocus(panel, focus && !focus.key.startsWith("close:") ? focus : { key: firstField });
  } else {
    morphologyRestoreFocus(panel, { key: returnFocus }, { preventScroll: true });
  }
}

function morphologySlotListHtml(page) {
  if (!page.draft.slots.length) {
    return `<li class="morphology-slot-empty muted-text">${escapeHtml(aText("还没有形态表。", "No morphology tables yet."))}</li>`;
  }
  return page.draft.slots.map((slot, slotIndex) => {
    const multi = slot.tables.length > 1;
    const handle = `<button class="morphology-drag-handle" type="button" draggable="true" data-mtp-drag="slot" data-mtp-action="slot-menu" data-mtp-focus="slot-handle:${escapeHtml(slot.id)}" aria-haspopup="menu" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-label="${escapeHtml(aText(`槽位 ${slotIndex + 1}：拖动或按 Alt+方向键调整顺序`, `Slot ${slotIndex + 1}: drag or press Alt+arrow keys to reorder`))}" data-app-tooltip="always">⋮⋮</button>`;
    return `<li class="morphology-slot${multi ? " is-competing" : ""}" data-slot-id="${escapeHtml(slot.id)}">
      ${handle}
      ${multi ? `<input class="morphology-slot-name" data-mtp-slot-name data-mtp-focus="slot-name:${escapeHtml(slot.id)}" value="${escapeHtml(slot.name)}" placeholder="${escapeHtml(aText("未命名槽位", "Untitled slot"))}" aria-label="${escapeHtml(aText("槽位名称", "Slot name"))}">` : ""}
      <div class="morphology-card-row" data-mtp-drop="slot">${slot.tables.map((table) => morphologyCardHtml(page, table)).join("")}</div>
    </li>`;
  }).join("");
}

function morphologyCardHtml(page, table) {
  const selected = table.id === page.selectedTableId;
  return `<article class="morphology-table-card${selected ? " is-selected" : ""}" data-table-id="${escapeHtml(table.id)}" tabindex="0" draggable="true" data-mtp-drag="table" data-mtp-focus="card:${escapeHtml(table.id)}" aria-current="${selected}" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Shift+F10" aria-label="${escapeHtml(morphologyTableTitleText(table))}">
    <div class="morphology-table-card-head">
      <strong>${morphologyTableTitleHtml(table)}</strong>
      <button class="morphology-cell-menu-button" type="button" tabindex="-1" data-mtp-action="card-menu" aria-haspopup="menu" aria-label="${escapeHtml(`${morphologyTableTitleText(table)} ${aText("操作", "actions")}`)}">⋯</button>
    </div>
    <div class="morphology-table-card-info" data-mtp-region="card-info"></div>
  </article>`;
}

function morphologyCardInfoHtml(page, table, { coverage, counts, verdict, ruleErrors, savedIds }) {
  const draftModel = morphologyDraftModel();
  const rows = draftModel.collectRuleRows(table).filter(({ empty }) => !empty);
  const chips = rows.length
    ? rows.map((rule, index) => `${index ? `<span class="morphology-rule-or">${escapeHtml(aText("或", "or"))}</span>` : ""}<span class="morphology-rule-chip${rule.error ? " is-invalid" : ""}">${escapeHtml(morphologyRuleRowText(rule))}</span>`).join("")
    : `<span class="muted-text">${escapeHtml(aText("没有匹配规则，不会自动生效", "No match rules; never applies automatically"))}</span>`;
  const parent = table.inheritsFrom ? `<p class="morphology-card-line">${escapeHtml(aText("继承自", "Inherits from"))} “${escapeHtml(morphologyTableLabel(page.draft, table.inheritsFrom))}”</p>` : "";
  const covers = coverage.filter(({ full }) => full);
  const partial = coverage.filter(({ full }) => !full);
  const coverText = covers.length ? `<p class="morphology-card-line">${escapeHtml(aText("覆盖", "Covers"))}：${covers.map(({ tableId }) => `“${escapeHtml(morphologyTableLabel(page.draft, tableId))}”`).join(aText("、", ", "))}</p>` : "";
  const partialText = partial.map(({ tableId, rowIndexes }) => `<details class="morphology-card-line morphology-partial-cover"><summary>${escapeHtml(aText("部分覆盖", "Partly covers"))}：“${escapeHtml(morphologyTableLabel(page.draft, tableId))}”</summary><span>${escapeHtml(aText(`它的第 ${rowIndexes.map((index) => index + 1).join("、")} 行规则`, `its rule rows ${rowIndexes.map((index) => index + 1).join(", ")}`))}</span></details>`).join("");
  let count = "";
  if (!savedIds.has(table.id)) count = `<span class="muted-text">${escapeHtml(aText("尚未保存", "Not saved yet"))}</span>`;
  else if (counts.status === "loading") count = `<span class="muted-text">${escapeHtml(aText("正在统计词条数", "Counting entries"))}</span>`;
  else if (counts.status === "error") count = `<button class="text-link-button" type="button" data-mtp-action="retry-counts">${escapeHtml(aText("词条数加载失败，重试", "Could not count entries. Retry"))}</button>`;
  else {
    const value = counts.counts.get(table.id) || 0;
    count = value
      ? `<button class="text-link-button" type="button" data-mtp-action="open-entries">${escapeHtml(aText(`${value} 个词条`, `${value} entries`))}</button>`
      : `<span class="muted-text">${escapeHtml(aText("0 个词条", "0 entries"))}</span>`;
  }
  return `<div class="morphology-rule-chips">${chips}</div>
    ${parent}${coverText}${partialText}
    <p class="morphology-card-line morphology-card-count">${count}</p>
    ${ruleErrors ? `<p class="morphology-card-line is-error">${escapeHtml(aText("匹配规则有误", "Match rules have errors"))}</p>` : ""}
    ${verdict ? `<p class="morphology-trial-verdict"><span class="morphology-trial-badge">${escapeHtml(verdict.badge)}</span>${verdict.detail ? `<span>${escapeHtml(verdict.detail)}</span>` : ""}</p>` : ""}`;
}

function morphologyRuleInputValue(rule, field) {
  const text = rule[`${field}Text`];
  return text !== undefined ? text : serializeTagList(rule[field]);
}

function morphologyPropertiesHtml(page, table) {
  const draftModel = morphologyDraftModel();
  const rules = table.matchRules.length ? table.matchRules : [{ all: [], none: [] }];
  const parent = table.inheritsFrom ? draftModel.findTable(page.draft, table.inheritsFrom) : null;
  const children = draftModel.childTableIds(page.draft, table.id);
  return `<label><span>${escapeHtml(aText("标题", "Title"))}</span><input data-mtp-prop="title" data-mtp-focus="prop-title" value="${escapeHtml(table.title)}" placeholder="${escapeHtml(aText("未命名表格", "Untitled table"))}"></label>
    <label><span>${escapeHtml(aText("备注", "Notes"))}</span><textarea rows="2" data-mtp-prop="notes" data-mtp-focus="prop-notes">${escapeHtml(table.notes)}</textarea></label>
    <div class="morphology-properties-parent">
      ${parent
        ? `<span>${escapeHtml(aText("继承自", "Inherits from"))}</span> <button class="text-link-button" type="button" data-mtp-action="select-table" data-target-table-id="${escapeHtml(parent.id)}">${morphologyTableTitleHtml(parent)}</button>`
        : `<span class="muted-text">${escapeHtml(aText("独立表格（自带行列）", "Root table with its own rows and columns"))}</span>`}
      ${children.length ? `<span class="muted-text">${escapeHtml(aText(`${children.length} 张子表继承此表`, `${children.length} child tables inherit from it`))}</span>` : ""}
    </div>
    <fieldset class="morphology-rule-editor">
      <legend>${escapeHtml(aText("匹配规则", "Match rules"))}</legend>
      ${rules.map((rule, index) => `
        ${index ? `<p class="morphology-rule-or-line">${escapeHtml(aText("或", "or"))}</p>` : ""}
        <div class="morphology-rule-row" data-rule-index="${index}">
          <label><span>${escapeHtml(aText("同时包含", "Has all of"))}</span><input data-mtp-rule-field="all" data-mtp-focus="rule:${index}:all" value="${escapeHtml(morphologyRuleInputValue(rule, "all"))}"></label>
          <label><span>${escapeHtml(aText("排除", "Except"))}</span><input data-mtp-rule-field="none" data-mtp-focus="rule:${index}:none" value="${escapeHtml(morphologyRuleInputValue(rule, "none"))}"></label>
          ${rules.length > 1 ? `<button class="secondary-button morphology-rule-remove" type="button" data-control-tone="neutral" data-mtp-action="remove-rule" aria-label="${escapeHtml(aText(`删除第 ${index + 1} 行规则`, `Remove rule row ${index + 1}`))}" data-app-tooltip="always">×</button>` : ""}
          <p class="morphology-rule-feedback" data-mtp-region="rule-feedback"></p>
        </div>`).join("")}
      <button class="secondary-button" type="button" data-control-tone="neutral" data-mtp-action="add-rule">${escapeHtml(aText("＋ 或者", "+ Or"))}</button>
    </fieldset>
    <button class="secondary-button" type="button" data-control-tone="neutral" data-mtp-action="edit-cells">${escapeHtml(aText("编辑格 →", "Edit cells →"))}</button>`;
}

function morphologyTrialHtml(page) {
  const { trial } = page;
  return `${morphologyPaneHeadingHtml("morphologyTrialHeading", aText("分配试算", "Assignment trial"))}
    <div class="segmented-control morphology-trial-mode" role="radiogroup" aria-label="${escapeHtml(aText("试算输入", "Trial input"))}">
      ${[["tags", aText("输入标签", "Enter tags")], ["entry", aText("选择词条", "Pick an entry")]].map(([mode, label]) => `
        <button type="button" role="radio" data-control-tone="neutral" data-control-selection data-mtp-action="trial-mode" data-trial-mode="${mode}" aria-checked="${trial.mode === mode}" class="${trial.mode === mode ? "active" : ""}">${escapeHtml(label)}</button>`).join("")}
    </div>
    ${trial.mode === "tags"
      ? `<label class="morphology-trial-input"><span class="visually-hidden">${escapeHtml(aText("试算标签", "Trial tags"))}</span><input data-mtp-trial="tags" data-mtp-focus="trial-tags" value="${escapeHtml(trial.tagsText)}" placeholder="${escapeHtml(aText("例如：n, 不规则", "For example: n, irregular"))}"></label>`
      : `<div class="source-reference-field morphology-trial-entry"><label class="visually-hidden" for="morphologyTrialEntryInput">${escapeHtml(aText("搜索词条", "Search entries"))}</label><input id="morphologyTrialEntryInput" data-mtp-trial="entry" data-mtp-focus="trial-entry" value="${escapeHtml(trial.entryQuery)}" placeholder="${escapeHtml(aText("输入词形查找词条", "Type a lemma to find an entry"))}"><div class="source-suggestions" data-source-suggestions hidden></div></div>`}
    <div class="morphology-trial-output" data-mtp-region="trial-output" aria-live="polite"></div>
    <div class="morphology-trial-report" data-mtp-scroll="trial-report">
      <details class="morphology-trial-details" hidden>
      <summary tabindex="0" data-mtp-action="trial-details" data-mtp-focus="trial-details"></summary>
        <div data-mtp-region="trial-explanations"></div>
      </details>
    </div>`;
}

function syncMorphologyTrialDetails(page) {
  const details = elements.morphologyTablesPanel.querySelector(".morphology-trial-details");
  details.open = page.trial.detailsOpen ?? (page.drawer?.pane === "trial" || !morphologyCompactTrial.matches);
}

// Which tags one context matches with: the entry tags, plus the definition's own tags. A context
// without a definition (or with an empty one) uses the entry tags alone.
function morphologyTrialTagSourceHtml(entry, definitionId) {
  const definition = (entry.definitions || []).find(({ id }) => id === definitionId);
  const list = (tags) => (tags.length
    ? escapeHtml(tags.join(aText("、", ", ")))
    : `<span class="muted-text">${escapeHtml(aText("无", "none"))}</span>`);
  const rows = [[aText("词条标签", "Entry tags"), list(entry.tags || [])]];
  if (definition && (definition.tags || []).length) rows.push([aText("释义标签", "Definition tags"), list(definition.tags)]);
  return `<dl class="morphology-trial-tags">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}

function morphologyTrialOutputHtml(page, trialState, problems) {
  if (trialState.status === "rule_error") {
    const first = problems.ruleErrors[0];
    return `<p class="is-error">${escapeHtml(aText(`“${morphologyTableLabel(page.draft, first.tableId)}”第 ${first.index + 1} 行规则有误，试算已暂停。`, `Rule row ${first.index + 1} of “${morphologyTableLabel(page.draft, first.tableId)}” has an error; the trial is paused.`))}</p>
      <button class="text-link-button" type="button" data-mtp-action="locate-rule" data-target-table-id="${escapeHtml(first.tableId)}" data-rule-index="${first.index}">${escapeHtml(aText("定位", "Show"))}</button>`;
  }
  if (trialState.status === "loading") return `<p class="muted-text">${escapeHtml(aText("正在读取词条", "Loading entry"))}</p>`;
  if (trialState.status === "error") return `<p class="is-error">${escapeHtml(aText("无法读取词条", "Could not load the entry"))}</p>`;
  if (trialState.status !== "ready") return "";
  const entryLine = page.trial.mode === "entry" ? `<p class="morphology-trial-entry-name"><strong>${escapeHtml(page.trial.entry.lemma)}</strong></p>` : "";
  const switcher = trialState.options.length > 1 ? `<div class="morphology-context-switch" role="radiogroup" aria-label="${escapeHtml(aText("上下文", "Context"))}">
      ${[{ key: "merged", label: aText("合并", "Combined") }, ...trialState.options].map(({ key, label }) => `
        <button type="button" role="radio" class="chip-button${trialState.key === key ? " active" : ""}" aria-checked="${trialState.key === key}" data-mtp-action="trial-context" data-context-key="${escapeHtml(key)}">${escapeHtml(label)}</button>`).join("")}
    </div>` : "";
  return `${entryLine}${switcher}`;
}

function morphologyTrialExplanationsHtml(page, trialState) {
  const note = trialState.entryNote ? `<p class="field-help">${escapeHtml(trialState.entryNote)}</p>` : "";
  if (trialState.key === "merged") {
    const byTable = new Map();
    trialState.explained.contexts.forEach((context) => context.tableIds.forEach((id) => {
      if (!byTable.has(id)) byTable.set(id, []);
      byTable.get(id).push(context.definitionId);
    }));
    const results = byTable.size
      ? `<ul class="morphology-trial-list">${[...byTable].map(([id, definitionIds]) => `<li class="is-effective"><strong>${escapeHtml(morphologyTableLabel(page.draft, id))}</strong><span>${escapeHtml(trialState.label(definitionIds))}</span></li>`).join("")}</ul>`
      : `<p class="muted-text">${escapeHtml(aText("没有表生效", "No table applies"))}</p>`;
    return note + results;
  }
  const option = trialState.options.find(({ key }) => key === trialState.key);
  const source = page.trial.mode === "entry" ? morphologyTrialTagSourceHtml(page.trial.entry, option.context.definitionId) : "";
  return `${note}${source}<ul class="morphology-trial-list">${option.context.slots.flatMap((slot) => slot.tables).map((explanation) => `
    <li class="${explanation.status === "effective" || explanation.status === "coeffective" ? "is-effective" : ""}"><strong>${escapeHtml(morphologyTableLabel(page.draft, explanation.tableId))}</strong><span>${escapeHtml(morphologyExplanationText(page, explanation))}</span></li>`).join("")}</ul>`;
}

function renderMorphologyStructureDerived(page, dictionary, problems) {
  const panel = elements.morphologyTablesPanel;
  const counts = morphologySummaryCounts(dictionary);
  const trialState = morphologyTrialState(page, problems);
  const verdicts = morphologyTrialVerdicts(page, trialState);
  const savedIds = new Set(morphologyDraftModel().allTables(page.saved).map(({ id }) => id));
  const errorTables = new Set(problems.ruleErrors.map(({ tableId }) => tableId));
  page.draft.slots.forEach((slot) => {
    const coverage = morphologyDraftModel().slotCoverage(slot);
    slot.tables.forEach((table) => {
      const info = panel.querySelector(`[data-table-id="${CSS.escape(table.id)}"] [data-mtp-region="card-info"]`);
      if (!info) return;
      info.innerHTML = morphologyCardInfoHtml(page, table, {
        coverage: coverage.get(table.id),
        counts,
        verdict: verdicts.get(table.id),
        ruleErrors: errorTables.has(table.id),
        savedIds,
      });
      const card = info.closest(".morphology-table-card");
      card.querySelector(".morphology-table-card-head strong").innerHTML = morphologyTableTitleHtml(table);
      const verdict = verdicts.get(table.id);
      if (verdict) card.dataset.trialState = verdict.effective ? "effective" : "inactive";
      else delete card.dataset.trialState;
    });
  });
  const output = panel.querySelector('[data-mtp-region="trial-output"]');
  if (output) output.innerHTML = morphologyTrialOutputHtml(page, trialState, problems);
  const details = panel.querySelector(".morphology-trial-details");
  const ready = trialState.status === "ready";
  details.hidden = !ready;
  if (ready) {
    const count = [...verdicts.values()].filter(({ effective }) => effective).length;
    const summary = details.querySelector("summary");
    const label = aText(`${count} 张表生效 · 判定详情`, `${count} ${count === 1 ? "table applies" : "tables apply"} · Details`);
    if (summary.textContent !== label) summary.textContent = label;
    details.querySelector('[data-mtp-region="trial-explanations"]').innerHTML = morphologyTrialExplanationsHtml(page, trialState);
  }
  syncMorphologyTrialDetails(page);
  const toolbarSummary = panel.querySelector('[data-mtp-region="trial-summary"]');
  const trialInput = page.trial.mode === "entry" ? page.trial.entry?.lemma : page.trial.tagsText.trim();
  toolbarSummary.hidden = !trialInput;
  if (toolbarSummary.textContent !== (trialInput || "")) toolbarSummary.textContent = trialInput || "";
  const usage = morphologyTagUsage(dictionary);
  const selected = page.selectedTableId && morphologyDraftModel().findTable(page.draft, page.selectedTableId);
  if (selected) {
    const rows = morphologyDraftModel().collectRuleRows(selected);
    panel.querySelectorAll(".morphology-rule-row").forEach((rowNode) => {
      const index = Number(rowNode.dataset.ruleIndex);
      const row = rows[index];
      const feedback = rowNode.querySelector('[data-mtp-region="rule-feedback"]');
      rowNode.classList.toggle("is-invalid", Boolean(row?.error));
      if (row?.error) {
        feedback.className = "morphology-rule-feedback is-error";
        feedback.textContent = row.error === "empty_all"
          ? aText("“同时包含”不能为空：只写排除会匹配几乎所有词条。", "“Has all of” cannot be empty: exclusions alone would match almost every entry.")
          : aText("同一个标签不能既要求又排除。", "A tag cannot be both required and excluded.");
        return;
      }
      feedback.className = "morphology-rule-feedback";
      const normalize = window.ConlexiconSearchNormalization.normalizeStructuralKey;
      const unused = usage && row ? [...row.all, ...row.none].filter((tag) => !usage.get(normalize(tag))) : [];
      feedback.textContent = unused.length ? `${aText("没有词条使用此标签", "No entry uses this tag")}：${unused.join(aText("、", ", "))}` : "";
    });
  }
}

// ---- Tables view -------------------------------------------------------------------------------

function morphologyTableSelectHtml(page) {
  if (!page.selectedTableId) return "";
  const choices = morphologyTableChoices(page.draft);
  return `<label class="morphology-table-select"><span class="visually-hidden">${escapeHtml(aText("选择表格", "Choose table"))}</span><select data-mtp-field="table-select" data-mtp-focus="table-select">${choices.map(({ id, label }) => `<option value="${escapeHtml(id)}"${id === page.selectedTableId ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>`;
}

function morphologyTablesViewHtml(page) {
  const draftModel = morphologyDraftModel();
  if (!page.selectedTableId) {
    return `<div class="morphology-tables-empty"><p class="muted-text">${escapeHtml(aText("还没有形态表，先在结构视图里新建。", "No morphology tables yet. Create one in the structure view."))}</p></div>`;
  }
  const table = draftModel.findTable(page.draft, page.selectedTableId);
  const list = page.draft.slots.map((slot) => {
    const items = slot.tables.map((item) => `<li><button type="button" class="morphology-table-list-item${item.id === table.id ? " active" : ""}" data-mtp-action="select-table" data-target-table-id="${escapeHtml(item.id)}" aria-current="${item.id === table.id}">${morphologyTableTitleHtml(item)}</button></li>`).join("");
    return slot.tables.length > 1
      ? `<li class="morphology-table-list-group"><span>${escapeHtml(slot.name || aText("未命名槽位", "Untitled slot"))}</span><ul>${items}</ul></li>`
      : items;
  }).join("");
  return `<div class="morphology-tables">
    <nav class="morphology-table-list" data-mtp-scroll="table-list" aria-label="${escapeHtml(aText("表格列表", "Tables"))}"><ul>${list}</ul></nav>
    <section class="morphology-table-editor" data-table-id="${escapeHtml(table.id)}">
      <input class="morphology-table-title-input" data-mtp-prop="title" data-mtp-focus="table-title" value="${escapeHtml(table.title)}" placeholder="${escapeHtml(aText("未命名表格", "Untitled table"))}" aria-label="${escapeHtml(aText("标题", "Title"))}">
      <div class="morphology-table-summary" data-mtp-region="table-summary"></div>
      <div class="morphology-pick-banner" data-mtp-region="pick-banner" role="status"></div>
      <div class="morphology-grid-scroll" data-mtp-region="grid" tabindex="-1">${morphologyGridHtml(page, table)}</div>
      ${table.inheritsFrom ? "" : `<button class="secondary-button morphology-add-row" type="button" data-control-tone="neutral" data-mtp-action="append-row">${escapeHtml(aText("＋ 行", "+ Row"))}</button>`}
      <section class="morphology-form-trial">
        <label><span>${escapeHtml(aText("词形试算", "Word-form trial"))}</span><input data-mtp-field="form-trial" data-mtp-focus="form-trial" value="${escapeHtml(page.formTrial.lemma)}" placeholder="${escapeHtml(aText("输入示例词形", "Type a sample lemma"))}"></label>
        <div data-mtp-region="form-trial"></div>
      </section>
    </section>
  </div>`;
}

function morphologyGridHtml(page, table) {
  const draftModel = morphologyDraftModel();
  const shape = draftModel.rootTable(page.draft, table.id);
  const child = Boolean(table.inheritsFrom);
  const header = (axis, item, index) => {
    const label = item.label;
    const focusKey = `axis:${axis}:${item.id}`;
    const keys = axis === "rows" ? "Alt+ArrowUp Alt+ArrowDown Shift+F10" : "Alt+ArrowLeft Alt+ArrowRight Shift+F10";
    const control = child
      ? `<span class="morphology-axis-text">${escapeHtml(label || String(index + 1))}</span><button class="morphology-cell-menu-button is-focusable" type="button" data-mtp-action="axis-menu" data-mtp-focus="${escapeHtml(focusKey)}" aria-haspopup="menu" aria-label="${escapeHtml(`${label || index + 1} ${aText("操作", "actions")}`)}">⋯</button>`
      : `<button class="morphology-drag-handle morphology-axis-handle" type="button" draggable="true" tabindex="-1" data-mtp-drag="axis" aria-hidden="true">⋮⋮</button><input class="morphology-axis-input" data-mtp-axis-label data-mtp-focus="${escapeHtml(focusKey)}" value="${escapeHtml(label)}" placeholder="${index + 1}" aria-label="${escapeHtml(axis === "rows" ? aText(`第 ${index + 1} 行标签`, `Row ${index + 1} label`) : aText(`第 ${index + 1} 列标签`, `Column ${index + 1} label`))}" aria-keyshortcuts="${keys}"><button class="morphology-cell-menu-button" type="button" tabindex="-1" data-mtp-action="axis-menu" aria-haspopup="menu" aria-label="${escapeHtml(`${label || index + 1} ${aText("操作", "actions")}`)}">⋯</button>`;
    return `<th scope="${axis === "rows" ? "row" : "col"}" class="morphology-axis-header" data-axis="${axis}" data-item-id="${escapeHtml(item.id)}"><div class="morphology-axis-head">${control}</div></th>`;
  };
  return `<table class="morphology-grid">
    <thead><tr><td class="morphology-corner"></td>${shape.columns.map((column, index) => header("columns", column, index)).join("")}${child ? "" : `<td class="morphology-add-column-cell"><button class="secondary-button" type="button" data-control-tone="neutral" data-mtp-action="append-column" aria-label="${escapeHtml(aText("在末尾添加列", "Add a column at the end"))}">${escapeHtml(aText("＋ 列", "+ Column"))}</button></td>`}</tr></thead>
    <tbody>${shape.rows.map((row, rowIndex) => `<tr>${header("rows", row, rowIndex)}${shape.columns.map((column) => morphologyGridCellHtml(page, table, shape, row, column)).join("")}${child ? "" : "<td class=\"morphology-add-column-cell\"></td>"}</tr>`).join("")}</tbody>
  </table>`;
}

function morphologyGridCellHtml(page, table, shape, row, column) {
  const draftModel = morphologyDraftModel();
  const record = draftModel.ownCell(table, row.id, column.id);
  const label = window.ConlexiconMorphology.morphologyCellLabel(shape, row.id, column.id);
  const focusKey = `cell:${row.id}:${column.id}`;
  const menu = `<button class="morphology-cell-menu-button" type="button" tabindex="-1" data-mtp-action="cell-menu" aria-haspopup="menu" aria-label="${escapeHtml(`${label} ${aText("操作", "actions")}`)}">⋯</button>`;
  let body;
  if (!record || record.kind === "rule") {
    body = `<input class="morphology-rule-input" data-mtp-cell-rule data-mtp-focus="${escapeHtml(focusKey)}" value="${escapeHtml(record?.sourceText || "")}" aria-label="${escapeHtml(label)}" aria-keyshortcuts="Shift+F10" spellcheck="false">`;
  } else {
    body = `<button class="morphology-cell-state" type="button" data-mtp-action="cell-menu" data-mtp-focus="${escapeHtml(focusKey)}" aria-haspopup="menu" aria-keyshortcuts="Shift+F10" aria-label="${escapeHtml(label)}"></button>`;
  }
  return `<td class="morphology-grid-cell" data-row-id="${escapeHtml(row.id)}" data-column-id="${escapeHtml(column.id)}"><div class="morphology-cell-box">${body}${menu}</div><small class="morphology-cell-note"></small></td>`;
}

// Text for a cell without its own rule input: absent, a reference, unfilled or inherited content.
function morphologyCellDisplay(page, table, shape, rowId, columnId) {
  const draftModel = morphologyDraftModel();
  const own = draftModel.ownCell(table, rowId, columnId);
  const describe = (record) => {
    if (!record) return "";
    if (record.kind === "absent") return aText("不存在", "Absent");
    if (record.kind === "refer") return `= ${window.ConlexiconMorphology.morphologyCellLabel(shape, record.targetRowId, record.targetColumnId)}`;
    return record.sourceText;
  };
  if (own && own.kind !== "rule") return { state: own.kind, text: describe(own) };
  if (own) return { state: "rule", placeholder: "" };
  if (!table.inheritsFrom) return { state: "unfilled", placeholder: aText("未填写", "Not filled") };
  let parent = draftModel.findTable(page.draft, table.inheritsFrom);
  while (parent) {
    const record = draftModel.ownCell(parent, rowId, columnId);
    if (record) return { state: "inherited", placeholder: `${aText("继承", "Inherited")} · ${describe(record)}` };
    parent = parent.inheritsFrom ? draftModel.findTable(page.draft, parent.inheritsFrom) : null;
  }
  return { state: "inherited", placeholder: `${aText("继承", "Inherited")} · ${aText("未填写", "not filled")}` };
}

function renderMorphologyTablesDerived(page, dictionary, problems) {
  const panel = elements.morphologyTablesPanel;
  const editor = panel.querySelector(".morphology-table-editor");
  if (!editor) return;
  const draftModel = morphologyDraftModel();
  const table = draftModel.findTable(page.draft, page.selectedTableId);
  const shape = draftModel.rootTable(page.draft, table.id);
  const location = draftModel.locateTable(page.draft, table.id);
  const rows = draftModel.collectRuleRows(table).filter(({ empty }) => !empty);
  const slotName = location.slot.tables.length > 1
    ? (location.slot.name || aText("未命名槽位", "Untitled slot"))
    : aText(`独立槽位 ${location.slotIndex + 1}`, `own slot ${location.slotIndex + 1}`);
  editor.querySelector('[data-mtp-region="table-summary"]').innerHTML = `
    <div class="morphology-rule-chips">${rows.length ? rows.map((rule, index) => `${index ? `<span class="morphology-rule-or">${escapeHtml(aText("或", "or"))}</span>` : ""}<span class="morphology-rule-chip">${escapeHtml(morphologyRuleRowText(rule))}</span>`).join("") : `<span class="muted-text">${escapeHtml(aText("没有匹配规则", "No match rules"))}</span>`}</div>
    <span class="muted-text">${escapeHtml(aText("槽位", "Slot"))}：${escapeHtml(slotName)}</span>
    ${table.inheritsFrom ? `<span class="muted-text">${escapeHtml(aText("继承自", "Inherits from"))} “${escapeHtml(morphologyTableLabel(page.draft, table.inheritsFrom))}”</span>` : ""}
    <button class="text-link-button" type="button" data-mtp-action="edit-structure">${escapeHtml(aText("在结构中编辑", "Edit in structure"))}</button>
    ${table.inheritsFrom ? `<p class="field-help morphology-shape-note">${escapeHtml(aText(`行列由“${morphologyTableTitleText(shape)}”决定。`, `Rows and columns come from “${morphologyTableTitleText(shape)}”.`))} <button class="text-link-button" type="button" data-mtp-action="select-table" data-target-table-id="${escapeHtml(shape.id)}">${escapeHtml(aText("编辑行列", "Edit rows and columns"))}</button></p>` : ""}`;
  panel.querySelectorAll(".morphology-table-list-item").forEach((button) => {
    button.innerHTML = morphologyTableTitleHtml(draftModel.findTable(page.draft, button.dataset.targetTableId));
  });
  const cycleKeys = new Set(problems.cycles.filter(({ tableId }) => tableId === table.id).map(({ rowId, columnId }) => `${rowId}|${columnId}`));
  const errors = new Map(problems.cellErrors.filter(({ tableId }) => tableId === table.id).map((error) => [`${error.rowId}|${error.columnId}`, error.message]));
  editor.querySelectorAll(".morphology-grid-cell").forEach((cell) => {
    const { rowId, columnId } = cell.dataset;
    const display = morphologyCellDisplay(page, table, shape, rowId, columnId);
    const input = cell.querySelector("[data-mtp-cell-rule]");
    const stateButton = cell.querySelector(".morphology-cell-state");
    if (input) input.placeholder = display.placeholder || "";
    if (stateButton) stateButton.textContent = display.text;
    cell.dataset.cellState = display.state;
    const key = `${rowId}|${columnId}`;
    const message = errors.get(key) || (cycleKeys.has(key) ? aText("引用形成了循环", "References form a loop") : "");
    cell.classList.toggle("is-invalid", Boolean(message));
    cell.querySelector(".morphology-cell-note").textContent = message;
    const pick = page.pick;
    cell.classList.toggle("is-pick-target", Boolean(pick && pick.cursor && (
      pick.kind === "cell" ? pick.cursor.rowId === rowId && pick.cursor.columnId === columnId
        : pick.kind === "rows" ? pick.cursor.itemId === rowId : pick.cursor.itemId === columnId
    )));
    cell.classList.toggle("is-pick-source", Boolean(pick && pick.kind === "cell" && pick.rowId === rowId && pick.columnId === columnId));
  });
  const banner = editor.querySelector('[data-mtp-region="pick-banner"]');
  banner.textContent = page.pick ? morphologyPickBannerText(page, shape) : "";
  banner.hidden = !page.pick;
  editor.querySelector('[data-mtp-region="grid"]').classList.toggle("is-picking", Boolean(page.pick));
  renderMorphologyFormTrial(page, table, shape, problems);
}

function renderMorphologyFormTrial(page, table, shape, problems) {
  const host = elements.morphologyTablesPanel.querySelector('[data-mtp-region="form-trial"]');
  const lemma = page.formTrial.lemma.trim();
  if (!lemma) {
    host.innerHTML = "";
    return;
  }
  if (morphologyPausedTableIds(page, problems).has(table.id)) {
    const problem = [...problems.cycles, ...problems.cellErrors].find(({ tableId }) => (
      morphologyDraftModel().descendantTableIds(page.draft, tableId).includes(table.id)
    ));
    const cell = window.ConlexiconMorphology.morphologyCellLabel(shape, problem.rowId, problem.columnId);
    host.innerHTML = `<p class="is-error">${escapeHtml(aText(`“${morphologyTableLabel(page.draft, problem.tableId)}”的 ${cell} 有错误，试算已暂停。`, `Cell ${cell} of “${morphologyTableLabel(page.draft, problem.tableId)}” has an error; the trial is paused.`))}</p>`;
    return;
  }
  const morphology = morphologyDraftModel().normalizedDraft(page.draft);
  const resolver = window.ConlexiconMorphology.createMorphologyResolver(morphology);
  host.innerHTML = morphologyReadonlyTableHtml(resolver.tableShape(table.id), resolver.cellResolver(table.id, lemma), {
    caption: `${morphologyTableTitleText(table)} · ${lemma}`,
  });
}

function morphologyPickBannerText(page, shape) {
  const { pick } = page;
  const axisLabel = (axis, id) => {
    const index = shape[axis].findIndex((item) => item.id === id);
    return shape[axis][index].label || String(index + 1);
  };
  const target = pick.cursor
    ? (pick.kind === "cell" ? window.ConlexiconMorphology.morphologyCellLabel(shape, pick.cursor.rowId, pick.cursor.columnId) : axisLabel(pick.kind, pick.cursor.itemId))
    : "";
  const prompt = pick.kind === "cell"
    ? aText("选择要引用的格", "Choose the cell to refer to")
    : pick.kind === "rows" ? aText("选择要引用的行", "Choose the row to refer to") : aText("选择要引用的列", "Choose the column to refer to");
  return `${prompt}${target ? ` · ${target}` : ""} — ${aText("点选，或用方向键移动后按 Enter；Esc 取消", "click, or move with the arrow keys and press Enter; Esc cancels")}`;
}

// ---- Draft changes -----------------------------------------------------------------------------

// `select` names a table the change created. It is selected only once the new draft is in place:
// reading the page state earlier would drop a selection the old draft does not contain.
function morphologyApply(result, { undoMessage = "", rerender = true, focus = "", select = "" } = {}) {
  const page = morphologyPageState();
  if (result.error) {
    morphologyReportOperationError(page, result.error);
    return false;
  }
  page.draft = result.morphology;
  if (select) {
    page.selectedTableId = select;
    if (page.view === "structure" && morphologyStructureIsNarrow()) {
      page.drawer = { pane: "properties", returnFocus: `card:${select}` };
    }
  }
  if (result.undo) page.undo = { record: result.undo, message: undoMessage };
  if (focus) morphologyFocusAfterRender(focus);
  if (rerender) renderMorphologyTemplatePage();
  else renderMorphologyTemplateDerived();
  if (select) {
    elements.morphologyTablesPanel.querySelector(`.morphology-table-card[data-table-id="${CSS.escape(select)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }
  return true;
}

function morphologyReportOperationError(page, error) {
  if (error.kind === "cycle") {
    const shape = morphologyDraftModel().rootTable(page.draft, error.tableId);
    showToast(aText(
      `会在“${morphologyTableLabel(page.draft, error.tableId)}”的 ${window.ConlexiconMorphology.morphologyCellLabel(shape, error.rowId, error.columnId)} 形成引用循环，未修改。`,
      `This would create a reference loop at ${window.ConlexiconMorphology.morphologyCellLabel(shape, error.rowId, error.columnId)} in “${morphologyTableLabel(page.draft, error.tableId)}”; nothing changed.`,
    ));
  } else if (error.kind === "has_children") {
    showToast(aText(`先解除 ${error.childTableIds.length} 张子表的继承`, `Detach its ${error.childTableIds.length} child tables first`));
  }
}

function morphologySelectTable(tableId, { view, focus, openDrawer = false } = {}) {
  const page = morphologyPageState();
  page.selectedTableId = tableId;
  page.pick = null;
  if (view) page.view = view;
  if (page.view === "structure" && openDrawer && morphologyStructureIsNarrow()) {
    page.drawer = { pane: "properties", returnFocus: `card:${tableId}` };
  }
  // An opened drawer takes the focus unless the caller names a field inside it.
  const focusKey = page.view === "structure" && page.drawer?.pane === "properties" && (!focus || focus.startsWith("card:"))
    ? "prop-title" : focus;
  if (focusKey) morphologyFocusAfterRender(focusKey);
  renderMorphologyTemplatePage();
}

function morphologyStructureIsNarrow() {
  return elements.morphologyTablesPanel.getBoundingClientRect().width < 760;
}

function morphologyAxisName(axis, item, shape) {
  const index = shape[axis].findIndex(({ id }) => id === item.id);
  return item.label || String(index >= 0 ? index + 1 : "");
}

function morphologyRemoveAxis(table, axis, itemId) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  const shape = draftModel.rootTable(page.draft, table.id);
  const index = shape[axis].findIndex(({ id }) => id === itemId);
  const item = shape[axis][index];
  const result = draftModel.removeAxisItem(page.draft, shape.id, axis, itemId);
  const name = morphologyAxisName(axis, item, shape);
  const parts = [axis === "rows" ? aText(`已删除“${name}”行`, `Deleted row “${name}”`) : aText(`已删除“${name}”列`, `Deleted column “${name}”`)];
  if (result.clearedRootReferenceCount) parts.push(aText(`另有 ${result.clearedRootReferenceCount} 格的引用变回未填写`, `${result.clearedRootReferenceCount} referring cells are now unfilled`));
  if (result.clearedChildReferenceCount) parts.push(aText(`${result.clearedChildReferenceCount} 格子表引用恢复继承`, `${result.clearedChildReferenceCount} child cells inherit again`));
  const neighbour = shape[axis][index + 1] || shape[axis][index - 1];
  morphologyApply(result, {
    undoMessage: parts.join(aText("，", "; ")),
    focus: table.inheritsFrom ? "" : `axis:${axis}:${neighbour.id}`,
  });
}

function morphologyDeleteTable(tableId) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  const table = draftModel.findTable(page.draft, tableId);
  const result = draftModel.deleteTable(page.draft, tableId);
  if (result.error) {
    morphologyReportOperationError(page, result.error);
    return;
  }
  const location = draftModel.locateTable(page.draft, tableId);
  const neighbour = location.slot.tables[location.index + 1] || location.slot.tables[location.index - 1]
    || page.draft.slots[location.slotIndex + 1]?.tables[0] || page.draft.slots[location.slotIndex - 1]?.tables[0];
  page.selectedTableId = neighbour?.id || "";
  morphologyApply(result, {
    undoMessage: aText(`已删除表格“${morphologyTableTitleText(table)}”`, `Deleted table “${morphologyTableTitleText(table)}”`),
    focus: neighbour ? (page.view === "structure" ? `card:${neighbour.id}` : "table-title") : "new-table",
  });
}

function morphologyUndo() {
  const page = morphologyPageState();
  const result = morphologyDraftModel().applyUndo(page.draft, page.undo.record);
  if (result.invalid) {
    page.undo = null;
    showToast(aText("这次操作已无法撤销", "This change can no longer be undone"));
    renderMorphologyTemplateDerived();
    return;
  }
  if (result.error) {
    morphologyReportOperationError(page, result.error);
    return;
  }
  page.draft = result.morphology;
  page.undo = null;
  if (result.focusTableId) page.selectedTableId = result.focusTableId;
  if (result.focusAxis) morphologyFocusAfterRender(`axis:${result.focusAxis.axis}:${result.focusAxis.itemId}`);
  else if (result.focusTableId) morphologyFocusAfterRender(page.view === "structure" ? `card:${result.focusTableId}` : "table-title");
  renderMorphologyTemplatePage();
}

function morphologyDetach(tableId) {
  const page = morphologyPageState();
  const result = morphologyDraftModel().detachTable(page.draft, tableId, page.lineage);
  if (result.error) {
    morphologyReportOperationError(page, result.error);
    return;
  }
  page.lineage = result.lineage;
  if (page.undo && !morphologyDraftModel().undoSurvivesDetach(page.undo.record, result.family)) page.undo = null;
  morphologyApply(result, { focus: page.view === "structure" ? `card:${tableId}` : "table-title" });
}

// ---- Menus -------------------------------------------------------------------------------------

function morphologyMoveSlotBy(slotId, delta) {
  const page = morphologyPageState();
  const index = page.draft.slots.findIndex(({ id }) => id === slotId);
  if (index + delta < 0 || index + delta >= page.draft.slots.length) return;
  morphologyApply(morphologyDraftModel().moveSlot(page.draft, slotId, index + delta), { focus: `slot-handle:${slotId}` });
}

function morphologyMoveTableBy(tableId, delta) {
  const page = morphologyPageState();
  const { slot, index } = morphologyDraftModel().locateTable(page.draft, tableId);
  if (index + delta < 0 || index + delta >= slot.tables.length) return;
  morphologyApply(morphologyDraftModel().moveTableInSlot(page.draft, tableId, index + delta), { focus: `card:${tableId}` });
}

function openMorphologySlotMenu(slot, event) {
  const page = morphologyPageState();
  const { slotId } = slot.dataset;
  const handle = slot.querySelector('[data-mtp-action="slot-menu"]');
  const index = page.draft.slots.findIndex(({ id }) => id === slotId);
  showContextMenu(morphologyMenuPosition(event, handle), aText("槽位操作", "Slot actions"), [
    { key: "up", label: `${aText("上移", "Move up")}  Alt+↑`, disabledReason: index === 0 ? aText("已在最上面", "Already first") : "", handler: () => morphologyMoveSlotBy(slotId, -1) },
    { key: "down", label: `${aText("下移", "Move down")}  Alt+↓`, disabledReason: index === page.draft.slots.length - 1 ? aText("已在最下面", "Already last") : "", handler: () => morphologyMoveSlotBy(slotId, 1) },
  ], { returnFocus: handle });
}

function openMorphologyCardMenu(card, event) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  const tableId = card.dataset.tableId;
  const table = draftModel.findTable(page.draft, tableId);
  const { slot, index } = draftModel.locateTable(page.draft, tableId);
  const children = draftModel.childTableIds(page.draft, tableId);
  const otherSlots = page.draft.slots.filter(({ id }) => id !== slot.id);
  const actions = [
    { key: "back", label: `${aText("前移", "Move back")}  Alt+←`, disabledReason: index === 0 ? aText("已在槽位最前", "Already first in the slot") : "", handler: () => morphologyMoveTableBy(tableId, -1) },
    { key: "forward", label: `${aText("后移", "Move forward")}  Alt+→`, disabledReason: index === slot.tables.length - 1 ? aText("已在槽位最后", "Already last in the slot") : "", handler: () => morphologyMoveTableBy(tableId, 1) },
    {
      key: "move-to-slot",
      label: aText("移到槽位…", "Move to slot…"),
      separatorBefore: true,
      disabledReason: otherSlots.length ? "" : aText("没有其他槽位", "There is no other slot"),
      handler: () => openMorphologySlotPicker(card, tableId, otherSlots),
    },
  ];
  if (slot.tables.length > 1) {
    actions.push({
      key: "extract",
      label: aText("移出为独立槽位", "Move into its own slot"),
      handler: () => morphologyApply(draftModel.extractTableToOwnSlot(page.draft, tableId), { focus: `card:${tableId}` }),
    });
  }
  actions.push({
    key: "child",
    label: aText("新建继承此表的子表", "New child table inheriting from this"),
    separatorBefore: true,
    handler: () => {
      const result = draftModel.createChildTable(page.draft, tableId);
      morphologyApply(result, { focus: "prop-title", select: result.tableId });
    },
  });
  if (table.inheritsFrom) {
    const candidates = draftModel.parentCandidates(page.draft, tableId).filter(({ id }) => id !== table.inheritsFrom);
    actions.push({
      key: "parent",
      label: aText("改换父表…", "Change parent…"),
      disabledReason: candidates.length ? "" : aText("同一继承链里没有其他可选的父表", "No other parent in this inheritance chain"),
      handler: () => openMorphologyParentPicker(card, tableId, candidates),
    });
    const blocked = draftModel.detachBlockedReason(page.draft, page.saved, tableId);
    actions.push({
      key: "detach",
      label: aText("解除继承", "Detach from parent"),
      disabledReason: blocked ? aText("先保存这层继承关系，再解除", "Save this inheritance first, then detach") : "",
      handler: () => morphologyDetach(tableId),
    });
  }
  actions.push({
    key: "cells",
    label: aText("编辑格", "Edit cells"),
    handler: () => morphologySelectTable(tableId, { view: "tables", focus: "table-title" }),
  });
  actions.push({
    key: "delete",
    label: aText("删除表格", "Delete table"),
    danger: true,
    disabledReason: children.length ? aText(`先解除 ${children.length} 张子表的继承`, `Detach its ${children.length} child tables first`) : "",
    handler: () => morphologyDeleteTable(tableId),
  });
  showContextMenu(morphologyMenuPosition(event, card), aText("表格操作", "Table actions"), actions, { returnFocus: card });
}

function openMorphologySlotPicker(card, tableId, slots) {
  const page = morphologyPageState();
  showContextMenu(morphologyMenuPosition(null, card), aText("移到槽位", "Move to slot"), slots.map((slot) => {
    const index = page.draft.slots.indexOf(slot);
    const names = slot.tables.map((table) => morphologyTableTitleText(table)).join(aText("、", ", "));
    return {
      key: slot.id,
      label: `${slot.name || aText(`槽位 ${index + 1}`, `Slot ${index + 1}`)}（${names}）`,
      handler: () => morphologyApply(morphologyDraftModel().moveTableToSlot(page.draft, tableId, slot.id), { focus: `card:${tableId}` }),
    };
  }), { returnFocus: card });
}

function openMorphologyParentPicker(card, tableId, candidates) {
  const page = morphologyPageState();
  const labels = new Map(morphologyTableChoices(page.draft).map(({ id, label }) => [id, label]));
  showContextMenu(morphologyMenuPosition(null, card), aText("改换父表", "Change parent"), candidates.map((candidate) => ({
    key: candidate.id,
    label: labels.get(candidate.id),
    handler: () => morphologyApply(morphologyDraftModel().changeParent(page.draft, tableId, candidate.id), { focus: page.view === "structure" ? `card:${tableId}` : "table-title" }),
  })), { returnFocus: card });
}

function openMorphologyAxisMenu(header, event) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  const table = draftModel.findTable(page.draft, page.selectedTableId);
  const shape = draftModel.rootTable(page.draft, table.id);
  const { axis, itemId } = header.dataset;
  const rows = axis === "rows";
  const index = shape[axis].findIndex(({ id }) => id === itemId);
  const item = shape[axis][index];
  const name = morphologyAxisName(axis, item, shape);
  const returnFocus = header.querySelector("[data-mtp-focus]");
  const fill = {
    key: "fill",
    label: rows ? aText("整行同…", "Whole row same as…") : aText("整列同…", "Whole column same as…"),
    separatorBefore: !table.inheritsFrom,
    disabledReason: shape[axis].length < 2 ? (rows ? aText("只有一行", "There is only one row") : aText("只有一列", "There is only one column")) : "",
    handler: () => morphologyStartPick({ kind: axis, itemId }),
  };
  if (table.inheritsFrom) {
    showContextMenu(morphologyMenuPosition(event, header), name, [fill], { returnFocus });
    return;
  }
  const descendants = draftModel.descendantTableIds(page.draft, table.id).length - 1;
  const affects = descendants ? aText(`（会同时影响 ${descendants} 张子表）`, ` (also affects ${descendants} child tables)`) : "";
  const insert = (offset, label) => ({
    key: `insert-${offset}`,
    label: `${label}${affects}`,
    handler: () => {
      const result = draftModel.insertAxisItem(page.draft, table.id, axis, index + offset);
      morphologyApply(result, { focus: `axis:${axis}:${result.itemId}` });
    },
  });
  const move = (delta, label, keys) => ({
    key: `move-${delta}`,
    label: `${label}  ${keys}`,
    separatorBefore: delta < 0,
    disabledReason: index + delta < 0 || index + delta >= shape[axis].length ? aText("已在边上", "Already at the edge") : "",
    handler: () => morphologyApply(draftModel.moveAxisItem(page.draft, table.id, axis, itemId, index + delta), { focus: `axis:${axis}:${itemId}` }),
  });
  showContextMenu(morphologyMenuPosition(event, header), name, [
    insert(0, rows ? aText("在上方插入行", "Insert row above") : aText("在左侧插入列", "Insert column left")),
    insert(1, rows ? aText("在下方插入行", "Insert row below") : aText("在右侧插入列", "Insert column right")),
    move(-1, rows ? aText("上移", "Move up") : aText("左移", "Move left"), rows ? "Alt+↑" : "Alt+←"),
    move(1, rows ? aText("下移", "Move down") : aText("右移", "Move right"), rows ? "Alt+↓" : "Alt+→"),
    fill,
    {
      key: "delete",
      label: `${rows ? aText("删除行", "Delete row") : aText("删除列", "Delete column")}${affects}`,
      danger: true,
      disabledReason: shape[axis].length === 1 ? (rows ? aText("表格至少要有一行", "A table needs at least one row") : aText("表格至少要有一列", "A table needs at least one column")) : "",
      handler: () => morphologyRemoveAxis(table, axis, itemId),
    },
  ], { returnFocus });
}

function openMorphologyCellMenu(cell, event) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  const table = draftModel.findTable(page.draft, page.selectedTableId);
  const { rowId, columnId } = cell.dataset;
  const record = draftModel.ownCell(table, rowId, columnId);
  const returnFocus = cell.querySelector("[data-mtp-focus]");
  const focus = `cell:${rowId}:${columnId}`;
  showContextMenu(morphologyMenuPosition(event, cell), aText("格操作", "Cell actions"), [
    {
      key: "absent",
      label: aText("标为不存在", "Mark as absent"),
      disabledReason: record?.kind === "absent" ? aText("这一格已标为不存在", "This cell is already absent") : "",
      handler: () => morphologyApply(draftModel.setCellRecord(page.draft, table.id, rowId, columnId, { kind: "absent" }), { focus }),
    },
    {
      key: "refer",
      label: aText("设为同…", "Same as…"),
      handler: () => morphologyStartPick({ kind: "cell", rowId, columnId }),
    },
    {
      key: "clear",
      label: table.inheritsFrom ? aText("恢复继承", "Inherit again") : aText("清除内容", "Clear content"),
      separatorBefore: true,
      disabledReason: record ? "" : (table.inheritsFrom ? aText("这一格已在继承", "This cell already inherits") : aText("这一格还没有内容", "This cell has no content")),
      handler: () => morphologyApply(draftModel.setCellRecord(page.draft, table.id, rowId, columnId, null), { focus }),
    },
  ], { returnFocus });
}

// ---- Cell picking ------------------------------------------------------------------------------

function morphologyStartPick(pick) {
  const page = morphologyPageState();
  const cursor = pick.kind === "cell"
    ? { rowId: pick.rowId, columnId: pick.columnId }
    : { itemId: pick.itemId };
  page.pick = { ...pick, cursor };
  renderMorphologyTemplateDerived();
  const grid = elements.morphologyTablesPanel.querySelector('[data-mtp-region="grid"]');
  grid.focus();
}

function morphologyEndPick(confirm) {
  const page = morphologyPageState();
  const pick = page.pick;
  page.pick = null;
  const draftModel = morphologyDraftModel();
  const table = draftModel.findTable(page.draft, page.selectedTableId);
  const shape = draftModel.rootTable(page.draft, table.id);
  const sourceFocus = pick.kind === "cell" ? `cell:${pick.rowId}:${pick.columnId}` : `axis:${pick.kind}:${pick.itemId}`;
  if (!confirm) {
    morphologyFocusAfterRender(sourceFocus);
    renderMorphologyTemplatePage();
    return;
  }
  if (pick.kind === "cell") {
    if (pick.cursor.rowId === pick.rowId && pick.cursor.columnId === pick.columnId) {
      showToast(aText("一格不能引用自己", "A cell cannot refer to itself"));
      page.pick = pick;
      return;
    }
    morphologyApply(draftModel.setCellRecord(page.draft, table.id, pick.rowId, pick.columnId, {
      kind: "refer", targetRowId: pick.cursor.rowId, targetColumnId: pick.cursor.columnId,
    }), { focus: sourceFocus });
    return;
  }
  if (pick.cursor.itemId === pick.itemId) {
    showToast(aText("不能引用自己", "It cannot refer to itself"));
    page.pick = pick;
    return;
  }
  const result = draftModel.fillAxisReferences(page.draft, table.id, pick.kind, pick.itemId, pick.cursor.itemId);
  const name = (id) => morphologyAxisName(pick.kind, shape[pick.kind].find((item) => item.id === id), shape);
  const message = pick.kind === "rows"
    ? aText(`已将“${name(pick.itemId)}”行设为同“${name(pick.cursor.itemId)}”（覆盖 ${result.overwrittenCount || 0} 格）`, `Row “${name(pick.itemId)}” now refers to “${name(pick.cursor.itemId)}” (${result.overwrittenCount || 0} cells replaced)`)
    : aText(`已将“${name(pick.itemId)}”列设为同“${name(pick.cursor.itemId)}”（覆盖 ${result.overwrittenCount || 0} 格）`, `Column “${name(pick.itemId)}” now refers to “${name(pick.cursor.itemId)}” (${result.overwrittenCount || 0} cells replaced)`);
  if (!morphologyApply(result, { undoMessage: message, focus: sourceFocus }) || result.undo) return;
  showToast(message);
}

function handleMorphologyPickKeydown(event) {
  const page = morphologyPageState();
  if (!page.pick || event.isComposing) return false;
  const shape = morphologyDraftModel().rootTable(page.draft, page.selectedTableId);
  const { pick } = page;
  const step = (axis, id, delta) => {
    const items = shape[axis];
    const index = items.findIndex((item) => item.id === id);
    return items[Math.max(0, Math.min(items.length - 1, index + delta))].id;
  };
  const moves = { ArrowUp: ["rows", -1], ArrowDown: ["rows", 1], ArrowLeft: ["columns", -1], ArrowRight: ["columns", 1] };
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    morphologyEndPick(false);
    return true;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    morphologyEndPick(true);
    return true;
  }
  if (moves[event.key]) {
    const [axis, delta] = moves[event.key];
    event.preventDefault();
    event.stopPropagation();
    if (pick.kind === "cell") {
      const field = axis === "rows" ? "rowId" : "columnId";
      pick.cursor = { ...pick.cursor, [field]: step(axis, pick.cursor[field], delta) };
    } else if (pick.kind === axis) {
      pick.cursor = { itemId: step(axis, pick.cursor.itemId, delta) };
    }
    renderMorphologyTemplateDerived();
    return true;
  }
  // Other keys are left to the page, but typing never edits cells while picking.
  if (event.key.length === 1) event.preventDefault();
  return true;
}

// ---- Drag and drop -----------------------------------------------------------------------------

function morphologyClearDropMarkers() {
  elements.morphologyTablesPanel.querySelectorAll(".drop-before, .drop-after, .drop-into").forEach((node) => {
    node.classList.remove("drop-before", "drop-after", "drop-into");
  });
}

// Where a dragged item would land among `items`, by the pointer position along one axis.
function morphologyDropIndex(items, event, horizontal) {
  for (let index = 0; index < items.length; index += 1) {
    const rect = items[index].getBoundingClientRect();
    const middle = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    if ((horizontal ? event.clientX : event.clientY) < middle) return index;
  }
  return items.length;
}

function morphologyMarkDrop(items, index) {
  if (!items.length) return;
  if (index < items.length) items[index].classList.add("drop-before");
  else items.at(-1).classList.add("drop-after");
}

function morphologyDragTarget(event) {
  const page = morphologyPageState();
  const drag = morphologyDragState;
  const panel = elements.morphologyTablesPanel;
  if (drag.type === "table") {
    const row = event.target.closest(".morphology-card-row");
    if (!row) return null;
    const slotId = row.closest("[data-slot-id]").dataset.slotId;
    const { slot } = morphologyDraftModel().locateTable(page.draft, drag.tableId);
    if (slotId !== slot.id) return { kind: "slot", slotId, element: row };
    const cards = [...row.querySelectorAll(".morphology-table-card")].filter((card) => card.dataset.tableId !== drag.tableId);
    return { kind: "within", slotId, index: morphologyDropIndex(cards, event, true), items: cards };
  }
  if (drag.type === "slot") {
    if (!event.target.closest(".morphology-slot-list")) return null;
    const slots = [...panel.querySelectorAll(".morphology-slot")].filter((slot) => slot.dataset.slotId !== drag.slotId);
    return { kind: "slot-order", index: morphologyDropIndex(slots, event, false), items: slots };
  }
  const header = event.target.closest(`.morphology-axis-header[data-axis="${drag.axis}"]`);
  if (!header) return null;
  const headers = [...panel.querySelectorAll(`.morphology-axis-header[data-axis="${drag.axis}"]`)].filter((node) => node.dataset.itemId !== drag.itemId);
  return { kind: "axis", index: morphologyDropIndex(headers, event, drag.axis === "columns"), items: headers };
}

function morphologyCommitDrop(target) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  const drag = morphologyDragState;
  if (target.kind === "slot") {
    morphologyApply(draftModel.moveTableToSlot(page.draft, drag.tableId, target.slotId), { focus: `card:${drag.tableId}` });
  } else if (target.kind === "within") {
    morphologyApply(draftModel.moveTableInSlot(page.draft, drag.tableId, target.index), { focus: `card:${drag.tableId}` });
  } else if (target.kind === "slot-order") {
    morphologyApply(draftModel.moveSlot(page.draft, drag.slotId, target.index), { focus: `slot-handle:${drag.slotId}` });
  } else {
    morphologyApply(draftModel.moveAxisItem(page.draft, page.selectedTableId, drag.axis, drag.itemId, target.index), { focus: `axis:${drag.axis}:${drag.itemId}` });
  }
}

// ---- Save --------------------------------------------------------------------------------------

function morphologyLocateProblem(problems) {
  const page = morphologyPageState();
  const rule = problems.ruleErrors[0];
  if (rule) {
    morphologySelectTable(rule.tableId, { view: "structure", focus: `rule:${rule.index}:all`, openDrawer: true });
    showToast(aText("匹配规则有误，未保存", "A match rule has errors; nothing was saved"));
    return;
  }
  const cell = problems.cycles[0] || problems.cellErrors[0];
  if (cell) {
    page.view = "tables";
    morphologySelectTable(cell.tableId, { view: "tables", focus: `cell:${cell.rowId}:${cell.columnId}` });
    showToast(problems.cycles[0]
      ? aText("引用形成了循环，未保存", "References form a loop; nothing was saved")
      : `${aText("规则有误，未保存", "A rule has errors; nothing was saved")}：${cell.message}`);
  }
}

// Saves the draft snapshot taken now. Deletions that drop entry data ask first and resend the same
// snapshot with the confirmed summary; the draft stays locked until the attempt ends.
async function saveMorphologyTemplates() {
  const dictionary = activeDictionary();
  const page = morphologyPageState(dictionary);
  const panel = elements.morphologyTablesPanel;
  const draftModel = morphologyDraftModel();
  const problems = morphologyDraftProblems(page);
  if (problems.ruleErrors.length || problems.cycles.length || problems.cellErrors.length) {
    morphologyLocateProblem(problems);
    return false;
  }
  if (!morphologyPageIsDirty(page)) return true;
  const snapshot = {
    morphology: draftModel.morphologyForSave(page.draft),
    detachments: draftModel.detachmentsForSave(page.draft, page.saved, page.lineage),
  };
  const clearedTemplateReferences = draftModel.clearedTemplateReferenceCount(page.saved, page.draft);
  const focus = morphologyFocusSnapshot(panel);
  page.saving = true;
  panel.inert = true;
  renderMorphologyToolbarState(page);
  let confirmation = {};
  let navigateTo = "";
  try {
    for (;;) {
      try {
        const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/morphology`, {
          method: "PUT",
          body: JSON.stringify({ ...snapshot, ...confirmation }),
        });
        applyDictionaryModulePayload(saved);
        resetEntryReadStateAfterSave();
        const keep = { view: page.view, selectedTableId: page.selectedTableId, trial: page.trial, formTrial: page.formTrial };
        Object.assign(page, morphologyPageBase(activeDictionary()), keep);
        showToast(t("dictionarySaved"));
        return true;
      } catch (error) {
        if (error.code !== "morphology_references_in_use") throw error;
        const answer = await openMorphologyDeleteDialog(page, error.details, clearedTemplateReferences);
        if (answer.entryId) {
          navigateTo = answer.entryId;
          return false;
        }
        if (!answer.confirmed) return false;
        confirmation = {
          confirmReferenceRemoval: true,
          confirmedReferences: {
            referenceCount: error.details.referenceCount,
            targets: error.details.targets.map(({ tableId, rowId, columnId, entryCount }) => ({
              tableId, ...(rowId ? { rowId } : {}), ...(columnId ? { columnId } : {}), entryCount,
            })),
          },
        };
      }
    }
  } catch (error) {
    morphologyReportSaveError(page, error);
    return false;
  } finally {
    page.saving = false;
    panel.inert = false;
    // A successful save replaced the dictionary object; rendering the one captured before the
    // request would read the old module as "saved" and reset the page to it.
    if (state.activeView === "morphology-tables" && activeDictionary()?.id === dictionary.id) {
      renderMorphologyTemplatePage(activeDictionary());
      if (focus?.key === "save" && !navigateTo && document.activeElement === document.body) {
        const key = morphologyPageIsDirty(page) ? focus.key : `view:${page.view}`;
        morphologyRestoreFocus(panel, { key }, { preventScroll: true });
      }
    }
    if (navigateTo) setTimeout(() => void navigateToEntryFromReport(navigateTo));
  }
}

function morphologyReportSaveError(page, error) {
  const details = error.details || {};
  if (error.code === "morphology_table_has_children") {
    showToast(aText("这张表仍被其他表继承，先解除它们的继承", "Other tables still inherit from this table; detach them first"));
    if (details.childTableIds?.[0]) page.selectedTableId = details.childTableIds[0];
    return;
  }
  if (error.code === "invalid_morphology_match_rule" && details.tableId && details.row) {
    const table = morphologyDraftModel().findTable(page.draft, details.tableId);
    const rows = morphologyDraftModel().collectRuleRows(table).filter(({ empty }) => !empty);
    const row = rows[details.row - 1];
    page.view = "structure";
    page.selectedTableId = details.tableId;
    if (row) morphologyFocusAfterRender(`rule:${row.index}:all`);
  } else if (error.code === "invalid_morphology_cell" && details.tableId && details.rowId) {
    page.view = "tables";
    page.selectedTableId = details.tableId;
    morphologyFocusAfterRender(`cell:${details.rowId}:${details.columnId}`);
  } else if (details.tableId && morphologyDraftModel().findTable(page.draft, details.tableId)) {
    page.selectedTableId = details.tableId;
  }
  showApiErrorToast(error, "dictionarySaveFailed");
}

// Independent of the leave prompt: lists each deletion's affected entries and examples.
function openMorphologyDeleteDialog(page, details, clearedTemplateReferences) {
  const returnFocus = document.activeElement;
  const tableTitle = (tableId) => {
    const table = morphologyDraftModel().findTable(page.saved, tableId) || morphologyDraftModel().findTable(page.draft, tableId);
    return table ? morphologyTableTitleText(table) : tableId;
  };
  const targets = details.targets.map((target) => {
    const what = target.rowId
      ? aText(`“${tableTitle(target.tableId)}”的“${target.label}”行`, `row “${target.label}” of “${tableTitle(target.tableId)}”`)
      : target.columnId
        ? aText(`“${tableTitle(target.tableId)}”的“${target.label}”列`, `column “${target.label}” of “${tableTitle(target.tableId)}”`)
        : aText(`表格“${tableTitle(target.tableId)}”`, `table “${tableTitle(target.tableId)}”`);
    return `<li>${escapeHtml(what)}：${escapeHtml(aText(`${target.entryCount} 个词条`, `${target.entryCount} entries`))}</li>`;
  }).join("");
  const samples = [];
  details.references.forEach((reference) => {
    if (!samples.some((sample) => sample.entryId === reference.entryId)) samples.push(reference);
  });
  const overlay = document.createElement("section");
  overlay.className = "modal-overlay morphology-delete-dialog";
  overlay.innerHTML = `<article class="modal-panel confirm-panel" role="dialog" aria-modal="true" aria-labelledby="morphologyDeleteTitle">
    <div class="modal-header"><h2 id="morphologyDeleteTitle">${escapeHtml(aText("删除会一并删除词条数据", "Deleting also removes entry data"))}</h2></div>
    <p>${escapeHtml(aText("保存这些删除时，以下位置上的词条手动选择、备注和覆写会一并删除：", "Saving these deletions also removes the entries' manual selections, notes and overrides here:"))}</p>
    <ul class="morphology-delete-targets">${targets}</ul>
    ${clearedTemplateReferences ? `<p class="field-help">${escapeHtml(aText(`模板里另有 ${clearedTemplateReferences} 格引用随删除清除。`, `${clearedTemplateReferences} template references are also cleared by the deletions.`))}</p>` : ""}
    ${samples.length ? `<div class="morphology-delete-samples"><span>${escapeHtml(aText("示例词条", "Example entries"))}：</span>${samples.map((sample) => `<button class="text-link-button" type="button" data-entry-id="${escapeHtml(sample.entryId)}">${escapeHtml(sample.lemma || sample.entryId)}</button>`).join("")}</div>` : ""}
    <div class="form-actions confirm-actions">
      <button class="secondary-button" type="button" data-control-tone="neutral" data-answer="cancel">${escapeHtml(t("cancel"))}</button>
      <button class="primary-button" type="button" data-control-tone="danger" data-control-emphasis="solid" data-answer="confirm">${escapeHtml(aText("删除并保存", "Delete and save"))}</button>
    </div>
  </article>`;
  document.body.append(overlay);
  return new Promise((resolve) => {
    const finish = (answer) => {
      morphologyModalCleanup?.();
      resolve(answer);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish({ confirmed: false });
      } else if (isSaveShortcutEvent(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        trapFocusWithin(overlay, event);
      }
    };
    overlay.addEventListener("click", (event) => {
      const sample = event.target.closest("[data-entry-id]");
      if (sample) {
        finish({ entryId: sample.dataset.entryId });
        return;
      }
      const answer = event.target.closest("[data-answer]")?.dataset.answer;
      if (answer) finish({ confirmed: answer === "confirm" });
    });
    window.addEventListener("keydown", onKeydown, true);
    morphologyModalCleanup = () => {
      window.removeEventListener("keydown", onKeydown, true);
      overlay.remove();
      morphologyModalCleanup = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
    overlay.querySelector('[data-answer="cancel"]').focus();
  });
}

// ---- Counts and entry jumps -------------------------------------------------------------------

async function morphologyOpenTableEntries(tableId) {
  const dictionary = activeDictionary();
  const counts = morphologySummaryCounts(dictionary);
  if (counts.status !== "ready") return;
  const page = morphologyPageState(dictionary);
  const label = morphologyTableTitleText(morphologyDraftModel().findTable(page.saved, tableId));
  const variant = morphologyFeatureVariant("table", tableId, activeFilterValueTitleDescriptor("activeFilterMorphologyTable", label), counts.counts.get(tableId) || 0);
  const action = featureResultActiveFilterAction(counts.response.source, [variant], "table", tableId);
  if (!(await confirmLeaveUnsavedConfigView())) return;
  await activateFilter(action);
}

// Opened from the analysis page: go through the unsaved checks, then show the table.
async function openMorphologyTemplateTable(tableId) {
  const dictionary = activeDictionary();
  const page = morphologyPageState(dictionary);
  await showView("morphology-tables");
  if (state.activeView !== "morphology-tables") return;
  if (morphologyDraftModel().findTable(page.draft, tableId)) {
    morphologySelectTable(tableId, { view: "structure", focus: `card:${tableId}` });
  }
}

// ---- Assignment trial entry picker -------------------------------------------------------------

async function morphologyPickTrialEntry(summary) {
  const dictionary = activeDictionary();
  const page = morphologyPageState(dictionary);
  const requestId = ++morphologyTrialRequestId;
  page.trial.entryQuery = summary.lemma || "";
  page.trial.entry = null;
  page.trial.entryStatus = "loading";
  page.trial.contextKey = "merged";
  const input = elements.morphologyTablesPanel.querySelector('[data-mtp-trial="entry"]');
  if (input) input.value = page.trial.entryQuery;
  renderMorphologyTemplateDerived(dictionary);
  try {
    const entry = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(summary.id)}`);
    if (requestId !== morphologyTrialRequestId || activeDictionary()?.id !== dictionary.id) return;
    page.trial.entry = entry;
    page.trial.entryStatus = "ready";
    if (!page.formTrial.lemma.trim() || page.formTrial.autoFilled) {
      page.formTrial = { lemma: entry.lemma, autoFilled: true };
    }
  } catch (error) {
    if (requestId !== morphologyTrialRequestId) return;
    page.trial.entryStatus = "error";
    console.error(error);
  }
  if (state.activeView === "morphology-tables" && activeDictionary()?.id === dictionary.id) {
    renderMorphologyTemplateDerived(activeDictionary());
  }
}

// ---- Events ------------------------------------------------------------------------------------

function handleMorphologyPageInput(event) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  const target = event.target;
  if (target.dataset.mtpProp) {
    morphologyApply(draftModel.updateTable(page.draft, page.selectedTableId, { [target.dataset.mtpProp]: target.value }), { rerender: false });
    if (page.view === "tables" && target.dataset.mtpProp === "title") {
      const select = elements.morphologyTablesPanel.querySelector('[data-mtp-field="table-select"]');
      const choices = morphologyTableChoices(page.draft);
      choices.forEach(({ label }, index) => { select.options[index].textContent = label; });
    }
    return;
  }
  if (target.hasAttribute("data-mtp-slot-name")) {
    const slotId = target.closest("[data-slot-id]").dataset.slotId;
    morphologyApply(draftModel.renameSlot(page.draft, slotId, target.value), { rerender: false });
    return;
  }
  if (target.dataset.mtpRuleField) {
    const index = Number(target.closest("[data-rule-index]").dataset.ruleIndex);
    const table = draftModel.findTable(page.draft, page.selectedTableId);
    const matchRules = table.matchRules.length ? structuredClone(table.matchRules) : [{ all: [], none: [] }];
    matchRules[index] = { ...matchRules[index], [`${target.dataset.mtpRuleField}Text`]: target.value };
    morphologyApply(draftModel.updateTable(page.draft, table.id, { matchRules }), { rerender: false });
    return;
  }
  if (target.matches("[data-mtp-cell-rule]")) {
    const cell = target.closest("[data-row-id]");
    morphologyApply(draftModel.setRuleText(page.draft, page.selectedTableId, cell.dataset.rowId, cell.dataset.columnId, target.value), { rerender: false });
    return;
  }
  if (target.matches("[data-mtp-axis-label]")) {
    const header = target.closest("[data-axis]");
    morphologyApply(draftModel.setAxisLabel(page.draft, page.selectedTableId, header.dataset.axis, header.dataset.itemId, target.value), { rerender: false });
    return;
  }
  if (target.dataset.mtpTrial === "tags") {
    page.trial.tagsText = target.value;
    renderMorphologyTemplateDerived();
    return;
  }
  if (target.dataset.mtpTrial === "entry") {
    page.trial.entryQuery = target.value;
    return;
  }
  if (target.dataset.mtpField === "form-trial") {
    page.formTrial = { lemma: target.value, autoFilled: false };
    renderMorphologyTemplateDerived();
  }
}

function handleMorphologyPageClick(event) {
  const page = morphologyPageState();
  const draftModel = morphologyDraftModel();
  if (event.target.matches(".morphology-drawer")) {
    closeMorphologyDrawer();
    return;
  }
  if (page.pick) {
    const cell = event.target.closest(".morphology-grid-cell, .morphology-axis-header");
    if (cell && elements.morphologyTablesPanel.querySelector('[data-mtp-region="grid"]').contains(cell)) {
      event.preventDefault();
      const rowId = cell.dataset.rowId || (cell.dataset.axis === "rows" ? cell.dataset.itemId : "");
      const columnId = cell.dataset.columnId || (cell.dataset.axis === "columns" ? cell.dataset.itemId : "");
      if (page.pick.kind === "cell" && rowId && columnId) page.pick.cursor = { rowId, columnId };
      else if (page.pick.kind === "rows" && rowId) page.pick.cursor = { itemId: rowId };
      else if (page.pick.kind === "columns" && columnId) page.pick.cursor = { itemId: columnId };
      else return;
      morphologyEndPick(true);
      return;
    }
  }
  const actionNode = event.target.closest("[data-mtp-action]");
  const action = actionNode?.dataset.mtpAction;
  if (!action) {
    const card = event.target.closest(".morphology-table-card");
    if (card && !event.target.closest("summary, button, a")) {
      morphologySelectTable(card.dataset.tableId, { focus: `card:${card.dataset.tableId}`, openDrawer: true });
    }
    return;
  }
  const card = actionNode.closest(".morphology-table-card");
  const tableId = actionNode.dataset.targetTableId || card?.dataset.tableId;
  switch (action) {
    case "view":
      page.view = actionNode.dataset.viewName;
      page.pick = null;
      page.drawer = null;
      morphologyFocusAfterRender(`view:${page.view}`);
      renderMorphologyTemplatePage();
      break;
    case "save":
      void saveMorphologyTemplates();
      break;
    case "discard":
      discardMorphologyDraft();
      renderMorphologyTemplatePage();
      break;
    case "undo":
      morphologyUndo();
      break;
    case "new-table": {
      const selectedSlot = page.selectedTableId ? draftModel.locateTable(page.draft, page.selectedTableId)?.slot.id : null;
      const result = draftModel.createTable(page.draft, { afterSlotId: selectedSlot });
      morphologyApply(result, { focus: "prop-title", select: result.tableId });
      break;
    }
    case "card-menu":
      openMorphologyCardMenu(card, event);
      break;
    case "slot-menu":
      openMorphologySlotMenu(actionNode.closest("[data-slot-id]"), event);
      break;
    case "axis-menu":
      openMorphologyAxisMenu(actionNode.closest(".morphology-axis-header"), event);
      break;
    case "cell-menu":
      openMorphologyCellMenu(actionNode.closest(".morphology-grid-cell"), event);
      break;
    case "select-table":
      morphologySelectTable(tableId, { focus: page.view === "structure" ? `card:${tableId}` : "table-title" });
      break;
    case "open-drawer":
      page.drawer = { pane: actionNode.dataset.pane, returnFocus: actionNode.dataset.mtpFocus };
      showMorphologyDrawer(page);
      break;
    case "close-drawer":
      closeMorphologyDrawer();
      break;
    case "add-rule": {
      const table = draftModel.findTable(page.draft, page.selectedTableId);
      const matchRules = [...(table.matchRules.length ? table.matchRules : [{ all: [], none: [] }]), { all: [], none: [] }];
      morphologyApply(draftModel.updateTable(page.draft, table.id, { matchRules }), { focus: `rule:${matchRules.length - 1}:all` });
      break;
    }
    case "remove-rule": {
      const index = Number(actionNode.closest("[data-rule-index]").dataset.ruleIndex);
      const table = draftModel.findTable(page.draft, page.selectedTableId);
      const matchRules = table.matchRules.filter((_, ruleIndex) => ruleIndex !== index);
      morphologyApply(draftModel.updateTable(page.draft, table.id, { matchRules }), { focus: `rule:${Math.max(0, index - 1)}:all` });
      break;
    }
    case "edit-cells":
      morphologySelectTable(page.selectedTableId, { view: "tables", focus: "table-title" });
      break;
    case "edit-structure":
      morphologySelectTable(page.selectedTableId, { view: "structure", focus: "prop-title", openDrawer: true });
      break;
    case "append-row": {
      const table = draftModel.findTable(page.draft, page.selectedTableId);
      const result = draftModel.insertAxisItem(page.draft, table.id, "rows", table.rows.length);
      morphologyApply(result, { focus: `axis:rows:${result.itemId}` });
      break;
    }
    case "append-column": {
      const table = draftModel.findTable(page.draft, page.selectedTableId);
      const result = draftModel.insertAxisItem(page.draft, table.id, "columns", table.columns.length);
      morphologyApply(result, { focus: `axis:columns:${result.itemId}` });
      break;
    }
    case "trial-mode":
      page.trial.mode = actionNode.dataset.trialMode;
      page.trial.contextKey = "merged";
      morphologyFocusAfterRender(page.trial.mode === "tags" ? "trial-tags" : "trial-entry");
      renderMorphologyTemplatePage();
      break;
    case "trial-context":
      page.trial.contextKey = actionNode.dataset.contextKey;
      renderMorphologyTemplateDerived();
      elements.morphologyTablesPanel.querySelector(`[data-context-key="${CSS.escape(page.trial.contextKey)}"]`)?.focus();
      break;
    case "trial-details":
      page.trial.detailsOpen = !actionNode.parentElement.open;
      break;
    case "locate-rule":
      morphologySelectTable(tableId, { focus: `rule:${actionNode.dataset.ruleIndex}:all`, openDrawer: true });
      break;
    case "retry-counts":
      void loadAnalysisQuery("morphology", activeDictionary(), { force: true });
      renderMorphologyTemplateDerived();
      break;
    case "open-entries":
      void morphologyOpenTableEntries(tableId);
      break;
    default:
      break;
  }
}

function handleMorphologyPageKeydown(event) {
  const page = morphologyPageState();
  if (page.pick && handleMorphologyPickKeydown(event)) return;
  if (event.isComposing || event.keyCode === 229) return;
  const target = event.target;
  const drawer = target.closest(".morphology-drawer[open]");
  if (drawer && trapFocusWithin(drawer, event)) return;
  const draftModel = morphologyDraftModel();
  if (isMorphologyMenuKey(event)) {
    const cell = target.closest(".morphology-grid-cell");
    const header = target.closest(".morphology-axis-header");
    const card = target.closest(".morphology-table-card");
    const handle = target.closest('[data-mtp-drag="slot"]');
    if (cell || header || card || handle) {
      event.preventDefault();
      if (cell) openMorphologyCellMenu(cell, null);
      else if (header) openMorphologyAxisMenu(header, null);
      else if (handle) openMorphologySlotMenu(handle.closest("[data-slot-id]"), null);
      else openMorphologyCardMenu(card, null);
    }
    return;
  }
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    if (event.key === "Enter" && target.matches(".morphology-table-card")) {
      event.preventDefault();
      morphologySelectTable(target.dataset.tableId, { focus: `card:${target.dataset.tableId}`, openDrawer: true });
    }
    return;
  }
  const vertical = { ArrowUp: -1, ArrowDown: 1 }[event.key];
  const horizontal = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (target.matches(".morphology-table-card") && horizontal) {
    event.preventDefault();
    morphologyMoveTableBy(target.dataset.tableId, horizontal);
  } else if (target.matches('[data-mtp-drag="slot"]') && vertical) {
    event.preventDefault();
    morphologyMoveSlotBy(target.closest("[data-slot-id]").dataset.slotId, vertical);
  } else if (target.matches("[data-mtp-axis-label]")) {
    const header = target.closest("[data-axis]");
    const delta = header.dataset.axis === "rows" ? vertical : horizontal;
    if (!delta) return;
    event.preventDefault();
    const shape = draftModel.rootTable(page.draft, page.selectedTableId);
    const index = shape[header.dataset.axis].findIndex(({ id }) => id === header.dataset.itemId);
    if (index + delta < 0 || index + delta >= shape[header.dataset.axis].length) return;
    morphologyApply(draftModel.moveAxisItem(page.draft, shape.id, header.dataset.axis, header.dataset.itemId, index + delta), {
      focus: `axis:${header.dataset.axis}:${header.dataset.itemId}`,
    });
  }
}

function bindMorphologyTemplatePage() {
  const panel = elements.morphologyTablesPanel;
  panel.addEventListener("input", handleMorphologyPageInput);
  panel.addEventListener("click", handleMorphologyPageClick);
  panel.addEventListener("keydown", handleMorphologyPageKeydown);
  panel.addEventListener("cancel", (event) => {
    if (event.target.matches(".morphology-drawer")) {
      event.preventDefault();
      closeMorphologyDrawer();
    }
  }, true);
  morphologyCompactTrial = window.matchMedia("(max-height: 700px)");
  morphologyCompactTrial.addEventListener("change", () => {
    if (state.activeView === "morphology-tables" && panel.querySelector(".morphology-trial-details")) {
      syncMorphologyTrialDetails(morphologyPageState());
    }
  });
  panel.addEventListener("change", (event) => {
    if (event.target.dataset.mtpField === "table-select") {
      morphologySelectTable(event.target.value, { focus: "table-select" });
    }
  });
  panel.addEventListener("contextmenu", (event) => {
    if (morphologyPageState().pick) {
      event.preventDefault();
      return;
    }
    const target = event.target;
    const cell = target.closest(".morphology-grid-cell");
    const header = target.closest(".morphology-axis-header");
    const card = target.closest(".morphology-table-card");
    const slot = target.matches("[data-mtp-slot-name]") ? null : target.closest("[data-slot-id]");
    if (!cell && !header && !card && !slot) return;
    event.preventDefault();
    if (cell) openMorphologyCellMenu(cell, event);
    else if (header) openMorphologyAxisMenu(header, event);
    else if (card) openMorphologyCardMenu(card, event);
    else openMorphologySlotMenu(slot, event);
  });
  panel.addEventListener("dragstart", (event) => {
    const source = event.target.closest?.("[data-mtp-drag]");
    if (!source) return;
    const kind = source.dataset.mtpDrag;
    if (kind === "table") morphologyDragState = { type: "table", tableId: source.dataset.tableId };
    else if (kind === "slot") morphologyDragState = { type: "slot", slotId: source.closest("[data-slot-id]").dataset.slotId };
    else {
      const header = source.closest(".morphology-axis-header");
      morphologyDragState = { type: "axis", axis: header.dataset.axis, itemId: header.dataset.itemId };
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-conlexicon-morphology", kind);
  });
  panel.addEventListener("dragover", (event) => {
    if (!morphologyDragState) return;
    const target = morphologyDragTarget(event);
    morphologyClearDropMarkers();
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (target.kind === "slot") target.element.classList.add("drop-into");
    else morphologyMarkDrop(target.items, target.index);
  });
  panel.addEventListener("drop", (event) => {
    if (!morphologyDragState) return;
    const target = morphologyDragTarget(event);
    morphologyClearDropMarkers();
    if (!target) return;
    event.preventDefault();
    morphologyCommitDrop(target);
    morphologyDragState = null;
  });
  panel.addEventListener("dragend", () => {
    morphologyDragState = null;
    morphologyClearDropMarkers();
  });
}
