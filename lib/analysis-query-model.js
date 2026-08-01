const ANALYSIS_WIDGET_LIMIT_MAX = 50;
const ANALYSIS_WIDGETS_MAX = 16;
const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";

const ANALYSIS_WIDGET_DEFINITIONS = {
  entryCount: { tasks: ["entryStats"] },
  lexiconSummary: { tasks: ["entryStats"] },
  coverageBreakdown: { tasks: ["entryStats"] },
  partDistribution: { tasks: ["partStats"], acceptsLimit: true },
  tagFrequency: { tasks: ["tagStats"], acceptsLimit: true },
  tagSetDistribution: { tasks: ["tagSetStats"], acceptsLimit: true },
  activityPreview: { tasks: ["activityStats"], defaultLimit: 6 },
  activityDistribution: { tasks: ["activityStats"] },
  rootFamilyRanking: { tasks: ["rootTopology"] },
};

class AnalysisQueryValidationError extends Error {
  constructor(message, code, details = undefined) {
    super(message);
    this.name = "AnalysisQueryValidationError";
    this.code = code;
    this.details = details;
  }
}

function normalizeLimit(value, fallback, type) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (!/^\d+$/.test(String(value))) {
    throw new AnalysisQueryValidationError("Invalid analysis widget limit", "invalid_analysis_widget_limit", { type, value });
  }
  const limit = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ANALYSIS_WIDGET_LIMIT_MAX) {
    throw new AnalysisQueryValidationError("Invalid analysis widget limit", "invalid_analysis_widget_limit", { type, value });
  }
  return limit;
}

function normalizeAnalysisWidget(widget, index) {
  if (!widget || typeof widget !== "object" || Array.isArray(widget)) {
    throw new AnalysisQueryValidationError("Invalid analysis widget", "invalid_analysis_widget", { index });
  }
  const id = String(widget.id || "").trim();
  if (!id || id.length > 80 || !/^[a-z0-9._-]+$/i.test(id)) {
    throw new AnalysisQueryValidationError("Invalid analysis widget ID", "invalid_analysis_widget_id", { index, id });
  }
  const type = String(widget.type || "").trim();
  const definition = ANALYSIS_WIDGET_DEFINITIONS[type];
  if (!definition) {
    throw new AnalysisQueryValidationError("Unsupported analysis widget", "unsupported_analysis_widget", { index, type });
  }
  const acceptsLimit = definition.acceptsLimit || definition.defaultLimit !== undefined;
  if (!acceptsLimit && widget.limit !== undefined) {
    throw new AnalysisQueryValidationError("Analysis widget does not accept a limit", "invalid_analysis_widget_limit", { type, value: widget.limit });
  }
  const limit = widget.limit === undefined
    ? definition.defaultLimit
    : normalizeLimit(widget.limit, definition.defaultLimit, type);
  return {
    id,
    type,
    ...(limit === undefined ? {} : { limit }),
  };
}

function normalizeAnalysisQuery(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalysisQueryValidationError("Invalid analysis query payload", "invalid_analysis_query_payload");
  }
  if (!Array.isArray(value.widgets) || !value.widgets.length || value.widgets.length > ANALYSIS_WIDGETS_MAX) {
    throw new AnalysisQueryValidationError("Analysis widgets are required", "invalid_analysis_widgets", {
      maxWidgets: ANALYSIS_WIDGETS_MAX,
    });
  }
  const widgets = value.widgets.map(normalizeAnalysisWidget);
  const ids = new Set();
  widgets.forEach((widget) => {
    if (ids.has(widget.id)) {
      throw new AnalysisQueryValidationError("Duplicate analysis widget ID", "duplicate_analysis_widget_id", { id: widget.id });
    }
    ids.add(widget.id);
  });
  const options = value.options && typeof value.options === "object" && !Array.isArray(value.options)
    ? value.options
    : {};
  return {
    widgets,
    options: {
      includeActions: options.includeActions !== false,
    },
  };
}

function planAnalysisQuery(query) {
  const tasks = [];
  const seen = new Set();
  query.widgets.forEach((widget) => {
    ANALYSIS_WIDGET_DEFINITIONS[widget.type].tasks.forEach((task) => {
      if (!seen.has(task)) {
        seen.add(task);
        tasks.push(task);
      }
    });
  });
  const activityWidgets = query.widgets.filter((widget) => (
    widget.type === "activityPreview" || widget.type === "activityDistribution"
  ));
  const includeFullActivity = activityWidgets.some((widget) => widget.type === "activityDistribution");
  return {
    tasks,
    activityLimit: includeFullActivity
      ? null
      : Math.max(0, ...activityWidgets
      .filter((widget) => widget.type === "activityPreview")
      .map((widget) => widget.limit)),
  };
}

function entryFilterAction(filter, resultCount) {
  return {
    type: "entryFilter",
    resultCount: Number(resultCount || 0),
    filter,
  };
}

function coverageWidget(task, includeActions) {
  const entryCount = Number(task.entryCount || 0);
  const fields = [
    ["definition", task.definitionEntryCount, task.definitionCount],
    ["example", task.exampleEntryCount, task.exampleCount],
    ["entryNote", task.noteEntryCount, null],
    ["source", task.sourceEntryCount, null],
    ["ipa", task.ipaEntryCount, null],
  ];
  return {
    type: "coverageBreakdown",
    entryTotal: entryCount,
    rows: fields.map(([field, rawCount, rawItemCount]) => {
      const coveredEntryCount = Number(rawCount || 0);
      const missingEntryCount = Math.max(0, entryCount - coveredEntryCount);
      return {
        field,
        coveredEntryCount,
        missingEntryCount,
        ratio: entryCount ? coveredEntryCount / entryCount : 0,
        ...(rawItemCount === null ? {} : { itemCount: Number(rawItemCount || 0) }),
        ...(includeActions ? {
          action: entryFilterAction({ presence: [{ field, present: true }] }, coveredEntryCount),
          missingAction: entryFilterAction({ presence: [{ field, present: false }] }, missingEntryCount),
        } : {}),
      };
    }),
  };
}

function lexiconSummaryWidget(task, includeActions) {
  const entryCount = Number(task.entryCount || 0);
  const derivedEntryCount = Number(task.sourceEntryCount || 0);
  const rootEntryCount = Math.max(0, entryCount - derivedEntryCount);
  const multiSourceEntryCount = Number(task.multiSourceEntryCount || 0);
  return {
    type: "lexiconSummary",
    entryCount,
    rootEntryCount,
    derivedEntryCount,
    multiSourceEntryCount,
    ...(includeActions ? {
      action: { type: "view", target: "editor" },
      rootAction: entryFilterAction({ presence: [{ field: "source", present: false }] }, rootEntryCount),
      derivedAction: entryFilterAction({ presence: [{ field: "source", present: true }] }, derivedEntryCount),
      multiSourceAction: entryFilterAction({ sourceCount: { min: 2 } }, multiSourceEntryCount),
    } : {}),
  };
}

function partDistributionWidget(task, widget, includeActions) {
  const rows = [...(task.parts || [])];
  const noPartOfSpeechCount = Number(task.noPartOfSpeechCount || 0);
  if (task.noPartOfSpeechCount > 0) {
    rows.push({ part: NO_PART_FILTER_VALUE, displayLabel: "", entryCount: noPartOfSpeechCount });
  }
  rows.sort((left, right) => (
    Number(right.entryCount) - Number(left.entryCount)
    || String(left.displayLabel || left.part).localeCompare(String(right.displayLabel || right.part), "zh-CN")
  ));
  return {
    type: "partDistribution",
    partTypeCount: (task.parts || []).length,
    noPartOfSpeechCount,
    ...(includeActions ? {
      noPartAction: entryFilterAction({ part: NO_PART_FILTER_VALUE }, noPartOfSpeechCount),
    } : {}),
    rows: (widget.limit === undefined ? rows : rows.slice(0, widget.limit)).map((row) => ({
      part: row.part,
      displayLabel: row.displayLabel || "",
      entryCount: Number(row.entryCount || 0),
      ...(includeActions ? {
        action: entryFilterAction({ part: row.part }, row.entryCount),
      } : {}),
    })),
  };
}

function tagFrequencyWidget(task, widget, includeActions) {
  const rows = [...(task.tags || [])]
    .sort((left, right) => (
      Number(right.entryCount) - Number(left.entryCount)
      || String(left.displayLabel || left.tag).localeCompare(String(right.displayLabel || right.tag), "zh-CN")
    ));
  return {
    type: "tagFrequency",
    tagTypeCount: rows.length,
    rows: (widget.limit === undefined ? rows : rows.slice(0, widget.limit)).map((row) => ({
      tag: row.tag,
      displayLabel: row.displayLabel || "",
      entryCount: Number(row.entryCount || 0),
      ...(includeActions ? {
        action: entryFilterAction({ tags: { values: [row.tag], mode: "any" } }, row.entryCount),
      } : {}),
    })),
  };
}

function tagSetDistributionWidget(task, widget, includeActions) {
  const rows = [...(task.rows || [])];
  return {
    type: "tagSetDistribution",
    tagSetCount: Number(task.tagSetCount || 0),
    taggedEntryCount: Number(task.taggedEntryCount || 0),
    multiTagEntryCount: Number(task.multiTagEntryCount || 0),
    rows: (widget.limit === undefined ? rows : rows.slice(0, widget.limit)).map((row) => {
      const tags = (row.tags || []).map((tag) => ({
        value: tag.value,
        displayLabel: tag.displayLabel || "",
        isPartOfSpeech: Boolean(tag.isPartOfSpeech),
      }));
      const entryCount = Number(row.entryCount || 0);
      return {
        tags,
        entryCount,
        ...(includeActions ? {
          action: entryFilterAction({
            tags: { values: tags.map((tag) => tag.value), mode: "exact" },
          }, entryCount),
        } : {}),
      };
    }),
  };
}

function activityRows(rows, field, includeActions) {
  return (rows || []).map((row) => ({
    day: row.day,
    entryCount: Number(row.entryCount || 0),
    ...(includeActions ? {
      action: entryFilterAction({ activityDays: [{ field, day: row.day }] }, row.entryCount),
    } : {}),
  }));
}

function activityPreviewWidget(task, widget, includeActions) {
  const created = activityRows((task.created || []).slice(-widget.limit), "created", includeActions);
  const updated = activityRows((task.updated || []).slice(-widget.limit), "updated", includeActions);
  return {
    type: "activityPreview",
    created,
    updated,
  };
}

function activityDistributionWidget(task, includeActions) {
  return {
    type: "activityDistribution",
    created: activityRows(task.created, "created", includeActions),
    updated: activityRows(task.updated, "updated", includeActions),
  };
}

function rootFamilyRankingWidget(task, includeActions) {
  return {
    type: "rootFamilyRanking",
    familyCount: Number(task.familyCount || 0),
    rows: (task.rows || []).map((row) => ({
      rootId: row.rootId,
      lemma: row.lemma || "",
      derivedEntryCount: Number(row.derivedEntryCount || 0),
      ...(includeActions ? {
        action: { type: "entry", entryId: row.rootId },
      } : {}),
    })),
  };
}

function buildAnalysisWidgets(query, taskResults) {
  const includeActions = query.options.includeActions;
  return Object.fromEntries(query.widgets.map((widget) => {
    if (widget.type === "entryCount") {
      return [widget.id, {
        type: "entryCount",
        value: Number(taskResults.entryStats?.entryCount || 0),
        ...(includeActions ? { action: { type: "view", target: "editor" } } : {}),
      }];
    }
    if (widget.type === "lexiconSummary") {
      return [widget.id, lexiconSummaryWidget(taskResults.entryStats || {}, includeActions)];
    }
    if (widget.type === "coverageBreakdown") {
      return [widget.id, coverageWidget(taskResults.entryStats || {}, includeActions)];
    }
    if (widget.type === "partDistribution") {
      return [widget.id, partDistributionWidget(taskResults.partStats || {}, widget, includeActions)];
    }
    if (widget.type === "tagFrequency") {
      return [widget.id, tagFrequencyWidget(taskResults.tagStats || {}, widget, includeActions)];
    }
    if (widget.type === "tagSetDistribution") {
      return [widget.id, tagSetDistributionWidget(taskResults.tagSetStats || {}, widget, includeActions)];
    }
    if (widget.type === "activityPreview") {
      return [widget.id, activityPreviewWidget(taskResults.activityStats || {}, widget, includeActions)];
    }
    if (widget.type === "activityDistribution") {
      return [widget.id, activityDistributionWidget(taskResults.activityStats || {}, includeActions)];
    }
    return [widget.id, rootFamilyRankingWidget(taskResults.rootTopology || {}, includeActions)];
  }));
}

module.exports = {
  ANALYSIS_WIDGET_DEFINITIONS,
  ANALYSIS_WIDGET_LIMIT_MAX,
  ANALYSIS_WIDGETS_MAX,
  AnalysisQueryValidationError,
  buildAnalysisWidgets,
  normalizeAnalysisQuery,
  planAnalysisQuery,
};
