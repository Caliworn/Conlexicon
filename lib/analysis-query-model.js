const ANALYSIS_WIDGET_LIMIT_MAX = 50;
const ANALYSIS_WIDGETS_MAX = 16;
const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";

const ANALYSIS_WIDGET_DEFINITIONS = {
  entryCount: { tasks: ["entryStats"] },
  coverageBreakdown: { tasks: ["entryStats"] },
  partDistribution: { tasks: ["partStats"], defaultLimit: 12 },
  activityPreview: { tasks: ["activityStats"], defaultLimit: 6 },
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
  if (definition.defaultLimit === undefined && widget.limit !== undefined) {
    throw new AnalysisQueryValidationError("Analysis widget does not accept a limit", "invalid_analysis_widget_limit", { type, value: widget.limit });
  }
  return {
    id,
    type,
    ...(definition.defaultLimit === undefined
      ? {}
      : { limit: normalizeLimit(widget.limit, definition.defaultLimit, type) }),
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
  return {
    tasks,
    activityLimit: Math.max(0, ...query.widgets
      .filter((widget) => widget.type === "activityPreview")
      .map((widget) => widget.limit)),
  };
}

function entryFilterAction(filter, count) {
  return {
    type: "entryFilter",
    count: Number(count || 0),
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
    total: entryCount,
    rows: fields.map(([field, rawCount, rawItemCount]) => {
      const count = Number(rawCount || 0);
      const missingCount = Math.max(0, entryCount - count);
      return {
        field,
        count,
        missingCount,
        ratio: entryCount ? count / entryCount : 0,
        ...(rawItemCount === null ? {} : { itemCount: Number(rawItemCount || 0) }),
        ...(includeActions ? {
          action: entryFilterAction({ presence: [{ field, present: true }] }, count),
          missingAction: entryFilterAction({ presence: [{ field, present: false }] }, missingCount),
        } : {}),
      };
    }),
  };
}

function partDistributionWidget(task, widget, includeActions) {
  const rows = [...(task.parts || [])];
  if (task.noPartOfSpeechCount > 0) {
    rows.push({ part: NO_PART_FILTER_VALUE, displayLabel: "", count: Number(task.noPartOfSpeechCount) });
  }
  rows.sort((left, right) => (
    Number(right.count) - Number(left.count)
    || String(left.displayLabel || left.part).localeCompare(String(right.displayLabel || right.part), "zh-CN")
  ));
  return {
    type: "partDistribution",
    rows: rows.slice(0, widget.limit).map((row) => ({
      part: row.part,
      displayLabel: row.displayLabel || "",
      count: Number(row.count || 0),
      ...(includeActions ? {
        action: entryFilterAction({ part: row.part }, row.count),
      } : {}),
    })),
  };
}

function activityRows(rows, field, includeActions) {
  return (rows || []).map((row) => ({
    day: row.day,
    count: Number(row.count || 0),
    ...(includeActions ? {
      action: entryFilterAction({ activityDays: [{ field, day: row.day }] }, row.count),
    } : {}),
  }));
}

function activityPreviewWidget(task, widget, includeActions) {
  return {
    type: "activityPreview",
    created: activityRows((task.created || []).slice(-widget.limit), "created", includeActions),
    updated: activityRows((task.updated || []).slice(-widget.limit), "updated", includeActions),
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
    if (widget.type === "coverageBreakdown") {
      return [widget.id, coverageWidget(taskResults.entryStats || {}, includeActions)];
    }
    if (widget.type === "partDistribution") {
      return [widget.id, partDistributionWidget(taskResults.partStats || {}, widget, includeActions)];
    }
    return [widget.id, activityPreviewWidget(taskResults.activityStats || {}, widget, includeActions)];
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
