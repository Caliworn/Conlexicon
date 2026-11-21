// Entry-side morphology: the read-only table renderer shared by the entry detail and the
// template page's word-form trial, the detail section, and the entry editor used by both the
// full edit and the morphology partial edit. Loaded before app.js; everything here runs only
// after app.js has finished loading.

const morphologyResolverCache = new WeakMap();

function morphologyResolverFor(morphology) {
  if (!morphologyResolverCache.has(morphology)) {
    morphologyResolverCache.set(morphology, window.ConlexiconMorphology.createMorphologyResolver(morphology));
  }
  return morphologyResolverCache.get(morphology);
}

function morphologyTableById(morphology, tableId) {
  for (const slot of morphology.slots) {
    const table = slot.tables.find(({ id }) => id === tableId);
    if (table) return table;
  }
  return null;
}

function morphologyTableTitleHtml(table) {
  return table.title
    ? escapeHtml(table.title)
    : `<span class="morphology-untitled">${escapeHtml(aText("未命名表格", "Untitled table"))}</span>`;
}

function morphologyTableTitleText(table) {
  return table.title || aText("未命名表格", "Untitled table");
}

function morphologyAxisLabel(axis, index) {
  return axis[index].label || String(index + 1);
}

// ---- Context labels ------------------------------------------------------------------------

// Definitions shown in the detail are numbered in order; a fully empty one (and the context of an
// entry without definitions) only uses the entry tags and shares the "Entry tags" label.
function morphologyContextLabeler(definitions = []) {
  const numbers = new Map();
  let number = 0;
  definitions.forEach((definition) => {
    const visible = definition.meaning || (definition.examples || []).length || definition.note || (definition.tags || []).length;
    if (visible) {
      number += 1;
      numbers.set(definition.id, number);
    }
  });
  return (definitionIds) => {
    const listed = definitionIds.map((id) => numbers.get(id)).filter(Boolean);
    const parts = [];
    if (listed.length) {
      parts.push(`${aText("释义", "Definition")} ${listed.join(aText("、", ", "))}`);
    }
    if (definitionIds.some((id) => !numbers.has(id))) {
      parts.push(aText("词条标签", "Entry tags"));
    }
    return parts.join(aText("；", "; "));
  };
}

// ---- Read-only table -----------------------------------------------------------------------

function morphologyResultText(result) {
  return result.kind === "absent" ? "—" : result.kind === "form" ? result.value : "";
}

function morphologyResultCellHtml(result) {
  const value = result.kind === "absent"
    ? `<span aria-hidden="true">—</span><span class="visually-hidden">${escapeHtml(aText("不存在", "Absent"))}</span>`
    : escapeHtml(morphologyResultText(result));
  return result.overridden ? `${value}<span class="visually-hidden"> ${escapeHtml(aText("已覆写", "Overridden"))}</span>` : value;
}

function morphologyResultCellClasses(result) {
  const classes = [];
  if (result.kind === "absent") classes.push("is-absent");
  if (result.overridden) classes.push("is-overridden");
  return classes;
}

function morphologySemanticTableHtml(shape, grid, className, caption) {
  return `<table class="${className}">
    ${caption ? `<caption class="visually-hidden">${escapeHtml(caption)}</caption>` : ""}
    <thead><tr><td class="morphology-corner"></td>${shape.columns.map((column, index) => `<th scope="col">${escapeHtml(morphologyAxisLabel(shape.columns, index))}</th>`).join("")}</tr></thead>
    <tbody>${shape.rows.map((row, rowIndex) => `<tr><th scope="row">${escapeHtml(morphologyAxisLabel(shape.rows, rowIndex))}</th>${grid[rowIndex].map((result) => `<td class="${morphologyResultCellClasses(result).join(" ")}">${morphologyResultCellHtml(result)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

// Resolves every cell once. Merged regions get a visual table with spans (hidden from
// assistive technology) plus a visually hidden semantic table that keeps every coordinate.
function morphologyReadonlyTableHtml(shape, resolveCell, { caption = "" } = {}) {
  const grid = shape.rows.map(({ id: rowId }) => shape.columns.map(({ id: columnId }) => resolveCell(rowId, columnId)));
  const regions = window.ConlexiconMorphology.morphologyMergeRegions(grid);
  if (!regions.length) {
    return `<div class="morphology-table-scroll" tabindex="0" role="group" aria-label="${escapeHtml(caption)}">${morphologySemanticTableHtml(shape, grid, "morphology-table", caption)}</div>`;
  }
  const regionOf = new Map();
  const spans = new Map();
  const covered = new Set();
  regions.forEach((region, index) => {
    region.cells.forEach(({ row, column }) => regionOf.set(`${row},${column}`, index));
    const { row, column, rowSpan, colSpan } = region.rectangle;
    spans.set(`${row},${column}`, { rowSpan, colSpan });
    for (let r = row; r < row + rowSpan; r += 1) {
      for (let c = column; c < column + colSpan; c += 1) {
        if (r !== row || c !== column) covered.add(`${r},${c}`);
      }
    }
  });
  const sameRegion = (key, row, column) => regionOf.has(key) && regionOf.get(key) === regionOf.get(`${row},${column}`);
  const visualRows = grid.map((cells, row) => cells.map((result, column) => {
    const key = `${row},${column}`;
    if (covered.has(key)) return "";
    const classes = morphologyResultCellClasses(result);
    if (!regionOf.has(key)) {
      return `<td class="${classes.join(" ")}">${escapeHtml(morphologyResultText(result))}</td>`;
    }
    const span = spans.get(key);
    classes.push("is-merged");
    // The spanning cell keeps its outline; the other cells of the region open the edges they
    // share with it or with each other, which collapsed borders resolve per segment.
    if (!span) {
      [["top", row - 1, column], ["bottom", row + 1, column], ["left", row, column - 1], ["right", row, column + 1]]
        .forEach(([side, r, c]) => {
          if (sameRegion(key, r, c)) classes.push(`open-${side}`);
        });
    }
    const attrs = span ? `${span.rowSpan > 1 ? ` rowspan="${span.rowSpan}"` : ""}${span.colSpan > 1 ? ` colspan="${span.colSpan}"` : ""}` : "";
    return `<td class="${classes.join(" ")}"${attrs}>${span ? escapeHtml(morphologyResultText(result)) : ""}</td>`;
  }).join(""));
  const visual = `<table class="morphology-table" aria-hidden="true">
    <thead><tr><td class="morphology-corner"></td>${shape.columns.map((column, index) => `<th>${escapeHtml(morphologyAxisLabel(shape.columns, index))}</th>`).join("")}</tr></thead>
    <tbody>${shape.rows.map((row, rowIndex) => `<tr><th>${escapeHtml(morphologyAxisLabel(shape.rows, rowIndex))}</th>${visualRows[rowIndex]}</tr>`).join("")}</tbody>
  </table>`;
  return `<div class="morphology-table-scroll" tabindex="0" role="group" aria-label="${escapeHtml(caption)}">
    <div class="visually-hidden">${morphologySemanticTableHtml(shape, grid, "", caption)}</div>${visual}
  </div>`;
}

// ---- Detail section ------------------------------------------------------------------------

function morphologyEntryOverlay(entry, tableId) {
  return (entry.morphologyTables || []).find((table) => table.tableId === tableId) || null;
}

function morphologyDisplayTableHtml(entry, table, resolver) {
  const overlay = morphologyEntryOverlay(entry, table.id);
  const notes = overlay?.notes?.trim() || "";
  const caption = morphologyTableTitleText(table);
  const resolveCell = resolver.cellResolver(table.id, entry.lemma || "", overlay?.overrides || []);
  return `<section class="morphology-display-table">
    ${table.title ? `<h5>${escapeHtml(table.title)}</h5>` : ""}
    ${notes ? `<p class="morphology-display-note">${escapeHtml(notes)}</p>` : ""}
    ${morphologyReadonlyTableHtml(resolver.tableShape(table.id), resolveCell, { caption })}
  </section>`;
}

function morphologyDisplayHtml(entry, morphology) {
  const resolver = morphologyResolverFor(morphology);
  if (entry.morphologyMode === "manual") {
    const tables = (entry.morphologyTables || [])
      .map(({ tableId }) => morphologyTableById(morphology, tableId))
      .filter(Boolean);
    return tables.length
      ? `<div class="morphology-display-slot"><div class="morphology-display-table-grid">${tables.map((table) => morphologyDisplayTableHtml(entry, table, resolver)).join("")}</div></div>`
      : "";
  }
  const { contexts } = resolver.resolveAutomaticTables(window.ConlexiconMorphology.morphologyMatchContexts(entry));
  const label = morphologyContextLabeler(entry.definitions);
  return morphology.slots.map((slot) => {
    const groups = window.ConlexiconMorphology.morphologySlotDisplayGroups(slot, contexts);
    if (!groups.length) return "";
    const columns = groups.map((group) => {
      const tables = group.tableIds.map((id) => morphologyTableById(morphology, id));
      return `<div class="morphology-display-column">
        ${group.fullWidth ? "" : `<p class="morphology-display-column-label">${escapeHtml(label(group.definitionIds))}</p>`}
        <div class="morphology-display-table-grid">${tables.map((table) => morphologyDisplayTableHtml(entry, table, resolver)).join("")}</div>
      </div>`;
    }).join("");
    return `<div class="morphology-display-slot${groups[0].fullWidth ? "" : " has-columns"}">${columns}</div>`;
  }).join("");
}

function renderMorphologyDisplay(entry, showEmptySections) {
  const html = morphologyDisplayHtml(entry, activeDictionary().morphology);
  elements.displayMorphologySection.hidden = !html && !showEmptySections;
  elements.displayMorphology.innerHTML = html
    ? `<div class="morphology-display-slots">${html}</div>`
    : (showEmptySections ? `<p class="muted-text">${escapeHtml(aText("没有生效的形态表", "No morphology tables apply"))}</p>` : "");
}

// ---- Cell menus (shared with the template page) -------------------------------------------

function morphologyMenuPosition(event, anchor) {
  if (event && (event.clientX || event.clientY)) {
    return { clientX: event.clientX, clientY: event.clientY };
  }
  const rect = anchor.getBoundingClientRect();
  return { clientX: rect.left, clientY: rect.bottom + 4 };
}

function isMorphologyMenuKey(event) {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

// ---- Entry editor ---------------------------------------------------------------------------

const entryMorphologyEditors = new WeakMap();
const expandedEntryMorphologyTables = new Set();

function entryMorphologyEditorFor(host) {
  return entryMorphologyEditors.get(host) || null;
}

// `previewEntry()` returns the lemma, tags and definitions the form would save, so the editor
// follows the draft. Overrides and notes live in this controller until the entry is saved.
function createEntryMorphologyEditor(host, entry, previewEntry) {
  const morphologyModel = window.ConlexiconMorphology;
  const initial = morphologyModel.normalizeEntryMorphologyState(entry);
  const controller = {
    entryId: entry.id || "",
    mode: initial.morphologyMode,
    tables: structuredClone(initial.morphologyTables),
    showDormant: false,
    render,
    refresh,
    collect,
  };
  entryMorphologyEditors.set(host, controller);

  function morphology() {
    return activeDictionary().morphology;
  }

  function layer(tableId) {
    let table = controller.tables.find((item) => item.tableId === tableId);
    if (!table) {
      table = { tableId, notes: "", overrides: [] };
      controller.tables.push(table);
    }
    return table;
  }

  function expandedKey(tableId) {
    return `${activeDictionary().id}:${controller.entryId}:${tableId}`;
  }

  function visibleTableIds() {
    const preview = previewEntry();
    if (controller.mode === "manual") return controller.tables.map(({ tableId }) => tableId);
    return morphologyResolverFor(morphology()).resolveAutomaticTables(morphologyModel.morphologyMatchContexts(preview)).tableIds;
  }

  function contextsByTable() {
    const preview = previewEntry();
    const contexts = morphologyModel.morphologyMatchContexts(preview);
    const result = morphologyResolverFor(morphology()).resolveAutomaticTables(contexts);
    const byTable = new Map();
    result.contexts.forEach(({ definitionId, tableIds }) => tableIds.forEach((id) => {
      if (!byTable.has(id)) byTable.set(id, []);
      byTable.get(id).push(definitionId);
    }));
    return { byTable, total: contexts.length, label: morphologyContextLabeler(preview.definitions) };
  }

  function dormantTables() {
    if (controller.mode !== "auto") return [];
    const visible = new Set(visibleTableIds());
    return controller.tables.filter((table) => !visible.has(table.tableId) && (table.notes.trim() || table.overrides.length)
      && morphologyTableById(morphology(), table.tableId));
  }

  function collect() {
    const tables = controller.tables
      .filter(({ tableId }) => morphologyTableById(morphology(), tableId))
      .map((table) => ({ ...table, notes: table.notes.trim() }));
    return morphologyModel.normalizeEntryMorphologyState({ morphologyMode: controller.mode, morphologyTables: tables });
  }

  function overrideAt(table, rowId, columnId) {
    return table.overrides.find((item) => item.rowId === rowId && item.columnId === columnId) || null;
  }

  function cellState(tableId, rowId, columnId) {
    const resolver = morphologyResolverFor(morphology());
    const lemma = previewEntry().lemma || "";
    const overrides = morphologyEntryOverlay({ morphologyTables: controller.tables }, tableId)?.overrides || [];
    const template = resolver.cellResolver(tableId, lemma)(rowId, columnId);
    const current = resolver.cellResolver(tableId, lemma, overrides)(rowId, columnId);
    const record = resolver.templateCells(tableId).get(morphologyModel.morphologyCellKey(rowId, columnId));
    return { template, current, record, override: overrideAt(layer(tableId), rowId, columnId) };
  }

  function templateText(result) {
    if (result.kind === "absent") return aText("模板中不存在", "Absent in template");
    return result.kind === "form" ? result.value : "";
  }

  function applyCellState(cell, tableId) {
    const { rowId, columnId } = cell.dataset;
    const shape = morphologyResolverFor(morphology()).tableShape(tableId);
    const { template, current, record, override } = cellState(tableId, rowId, columnId);
    const input = cell.querySelector("input");
    if (override?.kind === "absent") {
      input.placeholder = aText("覆写为不存在", "Overridden as absent");
    } else {
      // Following a reference shows the source cell's current value, including its override.
      input.placeholder = override ? "" : (current.kind === "absent" ? templateText(current) : current.kind === "form" ? current.value : "");
    }
    cell.classList.toggle("is-overridden", Boolean(override));
    cell.classList.toggle("is-override-absent", override?.kind === "absent");
    const notes = [];
    if (record?.kind === "refer") {
      notes.push(`= ${morphologyModel.morphologyCellLabel(shape, record.targetRowId, record.targetColumnId)}`);
    }
    if (override) {
      notes.push(template.kind === "absent"
        ? aText("已覆写 · 模板中不存在", "Overridden · absent in template")
        : `${aText("已覆写 · 模板", "Overridden · template")} ${template.value || aText("（空白）", "(blank)")}`);
    }
    cell.querySelector(".entry-morphology-cell-note").textContent = notes.join(" · ");
  }

  function refreshTableCells(tableId) {
    host.querySelectorAll(`[data-morphology-table-id="${CSS.escape(tableId)}"] [data-row-id]`).forEach((cell) => applyCellState(cell, tableId));
  }

  function tableCardHtml(tableId, { contextLabel = "", index = 0, total = 0 } = {}) {
    const table = morphologyTableById(morphology(), tableId);
    const own = layer(tableId);
    const shape = morphologyResolverFor(morphology()).tableShape(tableId);
    const hasContent = Boolean(own.notes.trim() || own.overrides.length);
    if (hasContent && !expandedEntryMorphologyTables.has(`seen:${expandedKey(tableId)}`)) {
      expandedEntryMorphologyTables.add(`seen:${expandedKey(tableId)}`);
      expandedEntryMorphologyTables.add(expandedKey(tableId));
    }
    const expanded = expandedEntryMorphologyTables.has(expandedKey(tableId));
    const manual = controller.mode === "manual";
    const removeIsDelete = manual && hasContent;
    const grid = `<table class="morphology-edit-table entry-morphology-override-table">
      <thead><tr><td class="morphology-corner"></td>${shape.columns.map((column, index) => `<th scope="col">${escapeHtml(morphologyAxisLabel(shape.columns, index))}</th>`).join("")}</tr></thead>
      <tbody>${shape.rows.map((row, rowIndex) => `<tr><th scope="row">${escapeHtml(morphologyAxisLabel(shape.rows, rowIndex))}</th>${shape.columns.map((column) => {
        const override = overrideAt(own, row.id, column.id);
        const label = morphologyModel.morphologyCellLabel(shape, row.id, column.id);
        return `<td class="entry-morphology-cell" data-row-id="${escapeHtml(row.id)}" data-column-id="${escapeHtml(column.id)}">
          <div class="morphology-cell-box">
            <input class="morphology-override-input" value="${escapeHtml(override?.kind === "form" ? override.value : "")}" aria-label="${escapeHtml(label)}" aria-keyshortcuts="Shift+F10">
            <button class="morphology-cell-menu-button" type="button" tabindex="-1" data-entry-morphology-action="cell-menu" aria-haspopup="menu" aria-label="${escapeHtml(`${label} ${aText("操作", "actions")}`)}">⋯</button>
          </div>
          <small class="entry-morphology-cell-note"></small>
        </td>`;
      }).join("")}</tr>`).join("")}</tbody>
    </table>`;
    return `<article class="entry-morphology-table-card${expanded ? " is-expanded" : ""}" data-morphology-table-id="${escapeHtml(tableId)}">
      <div class="entry-morphology-table-heading">
        <button class="content-disclosure-button" data-control-tone="neutral" data-control-disclosure type="button" data-entry-morphology-action="toggle" aria-expanded="${expanded}" aria-label="${escapeHtml(expanded ? t("collapse") : t("expand"))}" data-app-tooltip="always">
          <svg class="content-disclosure-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        <strong class="entry-morphology-table-title">${morphologyTableTitleHtml(table)}</strong>
        ${contextLabel ? `<span class="entry-morphology-context">${escapeHtml(contextLabel)}</span>` : ""}
        ${hasContent && !expanded ? `<span class="entry-morphology-content-badge">${escapeHtml(aText("有覆写或备注", "Has overrides or notes"))}</span>` : ""}
        ${manual ? `<div class="entry-morphology-table-actions">
          <button class="secondary-button" type="button" data-control-tone="neutral" data-entry-morphology-action="move-up" ${index === 0 ? "disabled" : ""}>${escapeHtml(t("moveUp"))}</button>
          <button class="secondary-button" type="button" data-control-tone="neutral" data-entry-morphology-action="move-down" ${index === total - 1 ? "disabled" : ""}>${escapeHtml(t("moveDown"))}</button>
          <button class="${removeIsDelete ? "danger-ghost" : "secondary-button"}" type="button" data-control-tone="${removeIsDelete ? "danger" : "neutral"}"${removeIsDelete ? ' data-control-emphasis="tinted"' : ""} data-entry-morphology-action="remove">${escapeHtml(removeIsDelete ? t("delete") : aText("移除", "Remove"))}</button>
        </div>` : ""}
      </div>
      <div class="entry-morphology-table-body"${expanded ? "" : " hidden"}>
        <label class="entry-morphology-notes"><span>${escapeHtml(aText("词条备注（此表）", "Entry notes for this table"))}</span><textarea rows="2" data-entry-morphology-field="notes">${escapeHtml(own.notes)}</textarea></label>
        <div class="morphology-edit-scroll">${grid}</div>
      </div>
    </article>`;
  }

  function dormantHtml() {
    const dormant = dormantTables();
    if (!dormant.length) return "";
    const details = controller.showDormant ? `<div class="entry-morphology-dormant-list">${dormant.map((table) => {
      const template = morphologyTableById(morphology(), table.tableId);
      const shape = morphologyResolverFor(morphology()).tableShape(table.tableId);
      const overrides = table.overrides.map((override) => `<li>${escapeHtml(morphologyModel.morphologyCellLabel(shape, override.rowId, override.columnId))}：${escapeHtml(override.kind === "absent" ? aText("不存在", "absent") : override.value)}</li>`).join("");
      return `<section class="entry-morphology-dormant-table">
        <strong>${morphologyTableTitleHtml(template)}</strong>
        ${table.notes.trim() ? `<p class="morphology-display-note">${escapeHtml(table.notes)}</p>` : ""}
        ${overrides ? `<ul>${overrides}</ul>` : ""}
      </section>`;
    }).join("")}</div>` : "";
    return `<div class="entry-morphology-dormant">
      <p><strong>${escapeHtml(formatCount(aText("未生效的覆写：{count} 张表", "Inactive overrides: {count} tables"), dormant.length))}</strong>
      <span class="muted-text">${escapeHtml(aText("这个词重新匹配到这些表时会恢复。", "They come back if this entry matches these tables again."))}</span></p>
      <div class="entry-morphology-dormant-actions">
        <button class="secondary-button" type="button" data-control-tone="neutral" data-entry-morphology-action="toggle-dormant" aria-expanded="${controller.showDormant}">${escapeHtml(controller.showDormant ? aText("收起", "Hide") : aText("查看", "View"))}</button>
        <button class="danger-ghost" type="button" data-control-tone="danger" data-control-emphasis="tinted" data-entry-morphology-action="delete-dormant">${escapeHtml(t("delete"))}</button>
      </div>
      ${details}
    </div>`;
  }

  function manualAddHtml() {
    const selected = new Set(controller.tables.map(({ tableId }) => tableId));
    const options = morphologyTableChoices(morphology()).filter(({ id }) => !selected.has(id));
    if (!options.length) return "";
    return `<div class="entry-morphology-add-row">
      <select data-entry-morphology-field="add-table" aria-label="${escapeHtml(aText("选择形态表", "Choose a morphology table"))}">${options.map(({ id, label }) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join("")}</select>
      <button class="secondary-button" type="button" data-control-tone="accent" data-control-emphasis="outline" data-entry-morphology-action="add">${escapeHtml(aText("添加表格", "Add table"))}</button>
    </div>`;
  }

  function render() {
    const hasTemplates = morphology().slots.length > 0;
    const ids = visibleTableIds().filter((id) => morphologyTableById(morphology(), id));
    const contexts = controller.mode === "auto" ? contextsByTable() : null;
    const cards = ids.map((tableId, index) => {
      let contextLabel = "";
      if (contexts && contexts.total > 1) {
        const definitionIds = contexts.byTable.get(tableId) || [];
        if (definitionIds.length < contexts.total) contextLabel = contexts.label(definitionIds);
      }
      return tableCardHtml(tableId, { contextLabel, index, total: ids.length });
    }).join("");
    const auto = controller.mode === "auto";
    host.innerHTML = `
      <div class="entry-morphology-mode-row">
        <strong>${escapeHtml(auto ? aText("自动分配", "Automatic assignment") : aText("手动选择", "Manual selection"))}</strong>
        <button class="secondary-button" type="button" data-control-tone="neutral" data-entry-morphology-action="toggle-mode">${escapeHtml(auto ? aText("改为手动选择", "Choose manually") : aText("恢复自动分配", "Restore automatic assignment"))}</button>
      </div>
      ${!hasTemplates ? `<p class="field-help">${escapeHtml(aText("这本词典还没有形态表。", "This dictionary has no morphology tables yet."))}</p>` : ""}
      ${hasTemplates && !ids.length ? `<p class="field-help">${escapeHtml(auto ? aText("当前没有生效的形态表。", "No morphology tables apply right now.") : aText("还没有选择形态表。", "No morphology tables selected."))}</p>` : ""}
      ${!auto ? manualAddHtml() : ""}
      <div class="entry-morphology-table-list">${cards}</div>
      ${dormantHtml()}
    `;
    ids.forEach((tableId) => refreshTableCells(tableId));
  }

  // Keeps the control being typed in when only derived text changes.
  function refresh() {
    if (host.contains(document.activeElement) && document.activeElement.matches("input, textarea")) {
      visibleTableIds().forEach((tableId) => refreshTableCells(tableId));
      return;
    }
    render();
  }

  function setOverride(tableId, rowId, columnId, override) {
    const own = layer(tableId);
    const index = own.overrides.findIndex((item) => item.rowId === rowId && item.columnId === columnId);
    if (!override) {
      if (index >= 0) own.overrides.splice(index, 1);
    } else if (index >= 0) {
      own.overrides[index] = { rowId, columnId, ...override };
    } else {
      own.overrides.push({ rowId, columnId, ...override });
    }
  }

  function openCellMenu(cell, event) {
    const tableId = cell.closest("[data-morphology-table-id]").dataset.morphologyTableId;
    const { rowId, columnId } = cell.dataset;
    const { override } = cellState(tableId, rowId, columnId);
    const input = cell.querySelector("input");
    showContextMenu(morphologyMenuPosition(event, cell), aText("格操作", "Cell actions"), [
      {
        key: "absent",
        label: aText("标为不存在", "Mark as absent"),
        disabledReason: override?.kind === "absent" ? aText("这一格已标为不存在", "This cell is already absent") : "",
        handler: () => {
          setOverride(tableId, rowId, columnId, { kind: "absent" });
          input.value = "";
          refreshTableCells(tableId);
          input.focus();
        },
      },
      {
        key: "restore",
        label: aText("恢复模板结果", "Restore template result"),
        disabledReason: override ? "" : aText("这一格没有覆写", "This cell has no override"),
        handler: () => {
          setOverride(tableId, rowId, columnId, null);
          input.value = "";
          refreshTableCells(tableId);
          input.focus();
        },
      },
    ], { returnFocus: input });
  }

  async function deleteDormant() {
    const dormant = dormantTables();
    const cells = dormant.reduce((sum, table) => sum + table.overrides.length, 0);
    const notes = dormant.filter((table) => table.notes.trim()).length;
    const names = dormant.map((table) => `“${morphologyTableTitleText(morphologyTableById(morphology(), table.tableId))}”`).join(aText("、", ", "));
    const confirmed = await appConfirm(aText(
      `删除${names}上的 ${cells} 格覆写和 ${notes} 条备注？这个词以后重新匹配到这些表时也不会恢复。`,
      `Delete ${cells} overridden cells and ${notes} notes on ${names}? They will not come back if this entry matches these tables again.`,
    ), { danger: true, confirmText: t("delete") });
    if (!confirmed) return;
    const ids = new Set(dormant.map(({ tableId }) => tableId));
    controller.tables = controller.tables.filter(({ tableId }) => !ids.has(tableId));
    render();
    host.querySelector('[data-entry-morphology-action="toggle-mode"]')?.focus();
  }

  async function removeManualTable(tableId) {
    const own = layer(tableId);
    if (own.notes.trim() || own.overrides.length) {
      const name = morphologyTableTitleText(morphologyTableById(morphology(), tableId));
      const confirmed = await appConfirm(aText(
        `删除“${name}”及这个词在其上的 ${own.overrides.length} 格覆写和备注？`,
        `Delete “${name}” with this entry's ${own.overrides.length} overridden cells and notes on it?`,
      ), { danger: true, confirmText: t("delete") });
      if (!confirmed) return;
    }
    controller.tables = controller.tables.filter((table) => table.tableId !== tableId);
    render();
    host.querySelector('[data-entry-morphology-action="toggle-mode"]')?.focus();
  }

  function moveManualTable(tableId, delta) {
    const index = controller.tables.findIndex((table) => table.tableId === tableId);
    const [table] = controller.tables.splice(index, 1);
    controller.tables.splice(index + delta, 0, table);
    render();
    host.querySelector(`[data-morphology-table-id="${CSS.escape(tableId)}"] [data-entry-morphology-action="${delta < 0 ? "move-up" : "move-down"}"]:not(:disabled)`)?.focus();
  }

  function toggleMode() {
    if (controller.mode === "auto") {
      const preview = { ...previewEntry(), morphologyMode: "auto", morphologyTables: collect().morphologyTables };
      controller.tables = morphologyModel.materializeAutomaticMorphologyTables(preview, morphology());
      controller.mode = "manual";
    } else {
      controller.mode = "auto";
      controller.tables = controller.tables.filter((table) => table.notes.trim() || table.overrides.length);
    }
    render();
    host.querySelector('[data-entry-morphology-action="toggle-mode"]')?.focus();
  }

  host.oninput = (event) => {
    const card = event.target.closest("[data-morphology-table-id]");
    if (!card) return;
    const { morphologyTableId: tableId } = card.dataset;
    if (event.target.matches('[data-entry-morphology-field="notes"]')) {
      layer(tableId).notes = event.target.value;
      return;
    }
    const cell = event.target.closest("[data-row-id]");
    if (cell && event.target.matches("input")) {
      const value = event.target.value.trim();
      setOverride(tableId, cell.dataset.rowId, cell.dataset.columnId, value ? { kind: "form", value } : null);
      refreshTableCells(tableId);
    }
  };
  host.onclick = (event) => {
    const action = event.target.closest("[data-entry-morphology-action]")?.dataset.entryMorphologyAction;
    if (!action) return;
    const tableId = event.target.closest("[data-morphology-table-id]")?.dataset.morphologyTableId;
    if (action === "toggle") {
      const key = expandedKey(tableId);
      if (expandedEntryMorphologyTables.has(key)) expandedEntryMorphologyTables.delete(key);
      else expandedEntryMorphologyTables.add(key);
      expandedEntryMorphologyTables.add(`seen:${key}`);
      render();
      host.querySelector(`[data-morphology-table-id="${CSS.escape(tableId)}"] [data-entry-morphology-action="toggle"]`)?.focus();
    } else if (action === "cell-menu") {
      openCellMenu(event.target.closest("[data-row-id]"), event);
    } else if (action === "toggle-mode") {
      toggleMode();
    } else if (action === "toggle-dormant") {
      controller.showDormant = !controller.showDormant;
      render();
      host.querySelector('[data-entry-morphology-action="toggle-dormant"]')?.focus();
    } else if (action === "delete-dormant") {
      void deleteDormant();
    } else if (action === "remove") {
      void removeManualTable(tableId);
    } else if (action === "move-up" || action === "move-down") {
      moveManualTable(tableId, action === "move-up" ? -1 : 1);
    } else if (action === "add") {
      const select = host.querySelector('[data-entry-morphology-field="add-table"]');
      layer(select.value);
      render();
      host.querySelector('[data-entry-morphology-field="add-table"]')?.focus();
    }
  };
  host.oncontextmenu = (event) => {
    const cell = event.target.closest(".entry-morphology-cell");
    if (!cell) return;
    event.preventDefault();
    openCellMenu(cell, event);
  };
  host.onkeydown = (event) => {
    const cell = event.target.closest(".entry-morphology-cell");
    if (cell && isMorphologyMenuKey(event) && !event.isComposing) {
      event.preventDefault();
      openCellMenu(cell, null);
    }
  };

  render();
  return controller;
}

function formatCount(template, count) {
  return template.replace("{count}", String(count));
}

// Choices for picking a table by name: untitled or repeated titles say where the table sits.
function morphologyTableChoices(morphology) {
  const titles = new Map();
  morphology.slots.forEach((slot) => slot.tables.forEach((table) => {
    const title = morphologyTableTitleText(table);
    titles.set(title, (titles.get(title) || 0) + 1);
  }));
  return morphology.slots.flatMap((slot, slotIndex) => slot.tables.map((table, index) => {
    const title = morphologyTableTitleText(table);
    const where = slot.tables.length > 1
      ? aText(`槽位 ${slotIndex + 1} 第 ${index + 1} 张`, `slot ${slotIndex + 1}, table ${index + 1}`)
      : aText(`槽位 ${slotIndex + 1}`, `slot ${slotIndex + 1}`);
    return { id: table.id, label: titles.get(title) > 1 ? `${title}（${where}）` : title };
  }));
}
