const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const rootDir = __dirname;
const dataDir = process.env.CONLEXICON_DATA_DIR ? path.resolve(process.env.CONLEXICON_DATA_DIR) : path.join(rootDir, "data");
const dictionariesDir = path.join(dataDir, "dictionaries");
const indexPath = path.join(dataDir, "index.json");
const port = Number(process.env.PORT || 4173);
const GLOSS_STYLE_KEYS = ["gla", "glb", "glc", "ft"];
const DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN = "(\\gla)\n(\\glb)\n(\\glc)\n(\\ft)";
const DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT = 3;
const MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT = 2;
const MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT = 10;
const DEFAULT_INDEX = { activeDictionaryId: "", dictionaryIds: [], uiLanguage: "zh", uiTheme: "light" };

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function ensureDataStore() {
  await fs.mkdir(dictionariesDir, { recursive: true });
  try {
    await fs.access(indexPath);
  } catch {
    await writeJson(indexPath, DEFAULT_INDEX);
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function dictionaryPath(id) {
  if (!/^dict-[a-z0-9-]+$/i.test(id)) {
    throw Object.assign(new Error("Invalid dictionary id"), { status: 400 });
  }
  return path.join(dictionariesDir, `${id}.json`);
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function reserveEntityId(value, prefix, usedIds) {
  const existing = String(value || "").trim();
  if (existing) {
    usedIds.add(existing);
    return existing;
  }
  let id = uid(prefix);
  while (usedIds.has(id)) {
    id = uid(prefix);
  }
  usedIds.add(id);
  return id;
}

function normalizeEntry(entry = {}) {
  const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
  if (entry.partOfSpeech && tags[0] !== entry.partOfSpeech) {
    tags.unshift(entry.partOfSpeech);
  }

  const definitions = Array.isArray(entry.definitions) && entry.definitions.length
    ? entry.definitions.map(normalizeDefinition)
    : [
        normalizeDefinition({
          meaning: entry.meaning || "",
          example: entry.example || "",
          note: "",
        }),
      ];
  const migratedEtymology = [entry.roots, entry.variant].filter(Boolean).join("\n");
  const sourceText = entry.etymology?.sourceText || entry.etymology?.source || "";
  const sources = Array.isArray(entry.etymology?.sources)
    ? entry.etymology.sources.map(String).map((item) => item.trim()).filter(Boolean)
    : splitSourceText(sourceText);
  if (entry.etymology?.sourceEntryId && !sources.includes(entry.etymology.sourceEntryId)) {
    sources.push(entry.etymology.sourceEntryId);
  }

  return {
    id: entry.id || uid("entry"),
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags,
    definitions,
    etymology: {
      sources,
      description: entry.etymology?.description || migratedEtymology,
    },
    notes: entry.notes || "",
    morphology: normalizeEntryMorphology(entry.morphology),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function splitSourceText(value) {
  return String(value || "")
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDefinition(definition = {}) {
  return {
    id: definition.id || uid("def"),
    meaning: definition.meaning || "",
    example: definition.example || "",
    note: definition.note || "",
  };
}

function normalizeMorphology(morphology = {}) {
  return {
    functions: normalizeMorphologyFunctions(morphology.functions),
    tables: Array.isArray(morphology.tables) ? morphology.tables.map(normalizeMorphologyTable) : [],
  };
}

function normalizeMorphologyFunctions(functions = {}) {
  return {
    leftV: uniqueList(functions.leftV),
    rightV: uniqueList(functions.rightV),
  };
}

function uniqueList(value) {
  const items = Array.isArray(value) ? value.map(String) : splitList(value);
  const unique = [];
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!unique.includes(item)) {
        unique.push(item);
      }
    });
  return unique;
}

function normalizeMorphologyTable(table = {}) {
  const rows = Math.max(1, Number.parseInt(table.rows, 10) || 2);
  const cols = Math.max(1, Number.parseInt(table.cols, 10) || 2);
  const rowLabels = Array.from({ length: rows }, (_, index) => String(table.rowLabels?.[index] || `${index + 1}`));
  const colLabels = Array.from({ length: cols }, (_, index) => String(table.colLabels?.[index] || `${index + 1}`));
  const cells = {};
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = morphologyCellKey(row, col);
      cells[key] = normalizeMorphologyCell(table.cells?.[key]);
    }
  }
  return {
    id: table.id || uid("morph"),
    name: String(table.name || "Morphology Table"),
    rows,
    cols,
    rowLabels,
    colLabels,
    matchTags: splitList(Array.isArray(table.matchTags) ? table.matchTags.join("，") : table.matchTags || ""),
    cells,
  };
}

function normalizeMorphologyCell(cell = {}) {
  return {
    mode: cell.mode === "replace" ? "replace" : "reference",
    value: String(cell.value || ""),
  };
}

function normalizeEntryMorphology(morphology = {}) {
  return {
    tableId: morphology.tableId || "auto",
    overrides: normalizeMorphologyOverrides(morphology.overrides),
  };
}

function normalizeMorphologyOverrides(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(overrides)
      .map(([key, value]) => [key, String(value || "").trim()])
      .filter(([, value]) => value),
  );
}

function morphologyCellKey(row, col) {
  return `${row},${col}`;
}

function normalizeDictionarySettings(settings = {}) {
  const {
    glossSmallCaps,
    glossFontFamily,
    glossFont,
    corpusGlossAlign,
    savePartialEditOnSwitch,
    saveFullEditOnSwitch,
    savePartialEditOnPageSwitch,
    saveFullEditOnPageSwitch,
    ...restSettings
  } = settings;

  return {
    ...restSettings,
    glossStyles: normalizeGlossStyles(settings.glossStyles, glossFontFamily || glossFont, glossSmallCaps),
    corpusUnitCardRenderPattern: String(settings.corpusUnitCardRenderPattern ?? settings.corpusUnitRenderPattern ?? ""),
    corpusUnitCardGlossAlign: Boolean(settings.corpusUnitCardGlossAlign ?? corpusGlossAlign ?? true),
    corpusUnitRenderPattern: String(settings.corpusUnitRenderPattern || ""),
    corpusUnitGlossAlign: Boolean(settings.corpusUnitGlossAlign ?? corpusGlossAlign ?? true),
    entryExampleRenderPattern: String(settings.entryExampleRenderPattern ?? DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN),
    entryExampleGlossAlign: Boolean(settings.entryExampleGlossAlign ?? true),
    corpusAutoSave: Boolean(settings.corpusAutoSave ?? true),
    docsAutoSave: Boolean(settings.docsAutoSave ?? true),
    tagDisplayMap: normalizeTagDisplayMap(settings.tagDisplayMap),
    entryListRawTagDisplay: Boolean(settings.entryListRawTagDisplay),
    entryListTagDisplayLimit: normalizeEntryListTagDisplayLimit(settings.entryListTagDisplayLimit),
    redHighlightTags: normalizeRedHighlightTags(settings.redHighlightTags),
    entryListPolysemyDisplay: Boolean(settings.entryListPolysemyDisplay),
    networkPolysemyDisplay: Boolean(settings.networkPolysemyDisplay),
    fuzzySearch: Boolean(settings.fuzzySearch),
    tagFuzzySearch: Boolean(settings.tagFuzzySearch),
    sourceFuzzyCompletion: Boolean(settings.sourceFuzzyCompletion),
    searchHighlight: Boolean(settings.searchHighlight ?? true),
    partialEditPageSwitchAction: normalizeEditPageSwitchAction(
      settings.partialEditPageSwitchAction,
      savePartialEditOnPageSwitch ?? savePartialEditOnSwitch,
    ),
    fullEditPageSwitchAction: normalizeEditPageSwitchAction(
      settings.fullEditPageSwitchAction,
      saveFullEditOnPageSwitch ?? saveFullEditOnSwitch,
    ),
    ipaKeyboard: normalizeIpaKeyboard(settings.ipaKeyboard),
    ipa: normalizeIpaSettings(settings.ipa),
  };
}

function normalizeEditPageSwitchAction(value, legacySaveValue = false) {
  return ["save", "discard", "prompt"].includes(value)
    ? value
    : (legacySaveValue ? "save" : "discard");
}

function normalizeGlossFontFamily(value) {
  return ["serif", "sans", "mono"].includes(value) ? value : "serif";
}

function normalizeGlossFontSize(value) {
  return ["small", "medium", "large"].includes(value) ? value : "medium";
}

function normalizeGlossStyles(styles = {}, legacyFontFamily = "serif", legacySmallCaps = false) {
  const fallbackFont = normalizeGlossFontFamily(legacyFontFamily);
  return Object.fromEntries(GLOSS_STYLE_KEYS.map((key) => {
    const style = styles?.[key] && typeof styles[key] === "object" ? styles[key] : {};
    return [key, {
      fontFamily: normalizeGlossFontFamily(style.fontFamily || fallbackFont),
      fontSize: normalizeGlossFontSize(style.fontSize),
      bold: Boolean(style.bold),
      italic: Boolean(style.italic ?? (key === "ft")),
      ...(key === "glb" ? { smallCaps: Boolean(style.smallCaps ?? legacySmallCaps) } : {}),
    }];
  }));
}

function normalizeTagDisplayMap(map = {}) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(map)
      .map(([key, value]) => [String(key).trim(), String(value).trim()])
      .filter(([key, value]) => key && value),
  );
}

function normalizeDocs(docs = {}) {
  return {
    markdown: String(docs.markdown || ""),
  };
}

function normalizeCorpus(corpus = {}, usedIds = new Set()) {
  return {
    ...corpus,
    blocks: Array.isArray(corpus.blocks) ? corpus.blocks.map((block) => normalizeCorpusBlock(block, usedIds)) : [],
    units: Array.isArray(corpus.units) ? corpus.units.map((unit) => normalizeCorpusUnit(unit, usedIds)) : [],
  };
}

function normalizeCorpusBlock(block = {}, usedIds = new Set()) {
  const now = new Date().toISOString();
  return {
    ...block,
    id: reserveEntityId(block.id, "corpus-block", usedIds),
    title: String(block.title || block.name || ""),
    attributes: normalizeCorpusAttributes(block.attributes),
    tags: uniqueList(block.tags),
    notes: String(block.notes || ""),
    unitIds: normalizeCorpusUnitIds(block.unitIds),
    layers: Array.isArray(block.layers) ? block.layers.map((layer) => normalizeCorpusLayer(layer, usedIds)) : [],
    createdAt: block.createdAt || now,
    updatedAt: block.updatedAt || now,
  };
}

function normalizeCorpusLayer(layer = {}, usedIds = new Set()) {
  return {
    ...layer,
    id: reserveEntityId(layer.id, "corpus-layer", usedIds),
    name: String(layer.name || ""),
    speaker: String(layer.speaker || ""),
    modality: String(layer.modality || ""),
    attributes: normalizeCorpusAttributes(layer.attributes),
    tags: uniqueList(layer.tags),
    notes: String(layer.notes || ""),
    unitIds: normalizeCorpusUnitIds(layer.unitIds),
  };
}

function normalizeCorpusUnit(unit = {}, usedIds = new Set()) {
  const now = new Date().toISOString();
  return {
    ...unit,
    id: reserveEntityId(unit.id, "corpus-unit", usedIds),
    content: String(unit.content || unit.text || ""),
    attributes: normalizeCorpusAttributes(unit.attributes),
    tags: uniqueList(unit.tags),
    notes: String(unit.notes || ""),
    createdAt: unit.createdAt || now,
    updatedAt: unit.updatedAt || now,
  };
}

function normalizeCorpusAttributes(attributes = {}) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, value]) => [String(key).trim(), String(value ?? "")])
      .filter(([key]) => key),
  );
}

function normalizeCorpusUnitIds(unitIds = []) {
  return Array.isArray(unitIds)
    ? unitIds.map((unitId) => String(unitId || "").trim()).filter(Boolean)
    : [];
}

function normalizeIpaKeyboard(symbols) {
  const parsed = Array.isArray(symbols)
    ? symbols.map(String)
    : splitKeyboardSymbols(symbols || "ˈ ˌ");
  const unique = [];
  parsed
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .forEach((symbol) => {
      if (!unique.includes(symbol)) {
        unique.push(symbol);
      }
    });
  return unique.length ? unique : ["ˈ", "ˌ"];
}

function splitKeyboardSymbols(value) {
  return String(value || "")
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIpaSettings(ipa = {}) {
  const defaultStress = Number.parseInt(ipa.defaultStress, 10);
  const mappings = [
    ...normalizeIpaRuleList(ipa.mappings),
    ...normalizeIpaRuleList(ipa.stressMappings).map((rule) => ({
      ...rule,
      to: hasStressOutput(rule.to) ? rule.to : `ˈ${rule.to || rule.from}`,
    })),
  ];
  return {
    mappings,
    syllable: {
      vowels: ipa.syllable?.vowels || "aeiouAEIOU",
      separator: ipa.syllable?.separator || ".",
      onsetClusters: normalizeClusterList(ipa.syllable?.onsetClusters),
      codaClusters: normalizeClusterList(ipa.syllable?.codaClusters),
      complexPhonemes: normalizeClusterList(ipa.syllable?.complexPhonemes),
    },
    defaultStress: Number.isInteger(defaultStress) ? defaultStress : -2,
    unstressMonosyllables: ipa.unstressMonosyllables !== false,
  };
}

function normalizeRedHighlightTags(value) {
  const items = Array.isArray(value)
    ? value.map(String)
    : String(value || "").split(/[\s,，、]+/);
  const unique = [];
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!unique.includes(item)) {
        unique.push(item);
      }
    });
  return unique;
}

function normalizeEntryListTagDisplayLimit(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT;
  }
  return Math.min(MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT, Math.max(MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT, number));
}

function normalizeClusterList(value) {
  const clusters = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
  return [...new Set(clusters.map((cluster) => String(cluster).trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
}

function hasStressOutput(value) {
  const output = String(value || "");
  return output.startsWith("'") || output.includes("ˈ");
}

function normalizeIpaRuleList(rules) {
  return Array.isArray(rules)
    ? rules.map(normalizeIpaRule).filter((rule) => rule.from || rule.to || rule.before || rule.after)
    : [];
}

function normalizeIpaRule(rule = {}) {
  return {
    id: rule.id || uid("ipa"),
    from: String(rule.from || ""),
    to: String(rule.to || ""),
    before: String(rule.before || ""),
    after: String(rule.after || ""),
  };
}

function normalizeDictionary(dictionary = {}) {
  const now = new Date().toISOString();
  const usedEntityIds = new Set(
    dictionaryEntityIdRecords(dictionary).map(({ id }) => String(id).trim()).filter(Boolean),
  );
  const entries = Array.isArray(dictionary.entries)
    ? dictionary.entries.map((entry) => normalizeEntry({
      ...entry,
      id: reserveEntityId(entry.id, "entry", usedEntityIds),
    }))
    : [];
  return {
    id: dictionary.id || uid("dict"),
    name: dictionary.name || "未命名词典",
    language: dictionary.language || "",
    description: dictionary.description || "",
    settings: normalizeDictionarySettings(dictionary.settings),
    docs: normalizeDocs(dictionary.docs),
    corpus: normalizeCorpus(dictionary.corpus, usedEntityIds),
    morphology: normalizeMorphology(dictionary.morphology),
    createdAt: dictionary.createdAt || now,
    updatedAt: dictionary.updatedAt || now,
    entries,
  };
}

async function readIndex() {
  const index = await readJson(indexPath, DEFAULT_INDEX);
  return {
    activeDictionaryId: index.activeDictionaryId || "",
    dictionaryIds: Array.isArray(index.dictionaryIds) ? index.dictionaryIds : [],
    uiLanguage: normalizeUiLanguage(index.uiLanguage),
    uiTheme: normalizeUiTheme(index.uiTheme),
  };
}

async function writeIndex(index) {
  const existing = await readJson(indexPath, DEFAULT_INDEX);
  await writeJson(indexPath, {
    activeDictionaryId: index.activeDictionaryId || "",
    dictionaryIds: Array.isArray(index.dictionaryIds) ? index.dictionaryIds : [],
    uiLanguage: normalizeUiLanguage(index.uiLanguage ?? existing.uiLanguage),
    uiTheme: normalizeUiTheme(index.uiTheme ?? existing.uiTheme),
  });
}

function normalizeUiLanguage(value) {
  return value === "en" ? "en" : "zh";
}

function normalizeUiTheme(value) {
  return value === "dark" ? "dark" : "light";
}

async function readDictionary(id) {
  return normalizeDictionary(await readJson(dictionaryPath(id)));
}

function dictionaryEntityIdRecords(dictionary = {}) {
  const records = (dictionary.entries || []).map((entry) => ({ id: entry.id, type: "entry" }));
  (dictionary.corpus?.blocks || []).forEach((block) => {
    records.push({ id: block.id, type: "corpus block" });
    (block.layers || []).forEach((layer) => {
      records.push({ id: layer.id, type: "corpus layer" });
    });
  });
  (dictionary.corpus?.units || []).forEach((unit) => {
    records.push({ id: unit.id, type: "corpus unit" });
  });
  return records.filter(({ id }) => id);
}

function assertUniqueDictionaryEntityIds(dictionary) {
  const recordsById = new Map();
  dictionaryEntityIdRecords(dictionary).forEach((record) => {
    if (!recordsById.has(record.id)) {
      recordsById.set(record.id, []);
    }
    recordsById.get(record.id).push(record.type);
  });
  const duplicates = [...recordsById.entries()].filter(([, types]) => types.length > 1);
  if (!duplicates.length) {
    return;
  }
  const details = duplicates
    .slice(0, 20)
    .map(([id, types]) => `${id} (${types.join(", ")})`)
    .join("; ");
  throw Object.assign(new Error(`Duplicate dictionary entity IDs: ${details}`), { status: 409 });
}

async function writeDictionary(dictionary) {
  const normalized = normalizeDictionary(dictionary);
  assertUniqueDictionaryEntityIds(normalized);
  await writeJson(dictionaryPath(normalized.id), normalized);
  return normalized;
}

async function readState() {
  const index = await readIndex();
  const dictionaries = [];

  for (const id of index.dictionaryIds) {
    try {
      dictionaries.push(await readDictionary(id));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const dictionaryIds = dictionaries.map((dictionary) => dictionary.id);
  const activeDictionaryId = dictionaryIds.includes(index.activeDictionaryId) ? index.activeDictionaryId : dictionaryIds[0] || "";

  if (dictionaryIds.length !== index.dictionaryIds.length || activeDictionaryId !== index.activeDictionaryId) {
    await writeIndex({ activeDictionaryId, dictionaryIds });
  }

  return { activeDictionaryId, dictionaries, uiLanguage: index.uiLanguage, uiTheme: index.uiTheme };
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 5_000_000) {
      throw Object.assign(new Error("Request body too large"), { status: 413 });
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(value, null, 2));
}

function sendText(response, status, value) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(value);
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function importDictionaryFromPayload(payload) {
  if (Array.isArray(payload?.dictionaries)) {
    const dictionary = payload.dictionaries.find((item) => item?.id === payload.activeDictionaryId) || payload.dictionaries[0];
    if (!dictionary) {
      throw Object.assign(new Error("Invalid import payload"), { status: 400 });
    }
    return normalizeDictionary(dictionary);
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const hasDictionaryShape = payload.id || payload.name || Array.isArray(payload.entries) || payload.settings || payload.docs || payload.corpus || payload.morphology;
    if (!hasDictionaryShape) {
      throw Object.assign(new Error("Invalid import payload"), { status: 400 });
    }
    return normalizeDictionary(payload);
  }

  throw Object.assign(new Error("Invalid import payload"), { status: 400 });
}

async function routeApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, await readState());
    return true;
  }

  if (request.method === "PUT" && url.pathname === "/api/preferences") {
    const body = await readRequestBody(request);
    if (Object.hasOwn(body, "uiLanguage") && !["zh", "en"].includes(body.uiLanguage)) {
      throw Object.assign(new Error("Invalid UI language"), { status: 400 });
    }
    if (Object.hasOwn(body, "uiTheme") && !["light", "dark"].includes(body.uiTheme)) {
      throw Object.assign(new Error("Invalid UI theme"), { status: 400 });
    }
    const index = await readIndex();
    const nextIndex = {
      ...index,
      ...(Object.hasOwn(body, "uiLanguage") ? { uiLanguage: body.uiLanguage } : {}),
      ...(Object.hasOwn(body, "uiTheme") ? { uiTheme: body.uiTheme } : {}),
    };
    await writeIndex(nextIndex);
    sendJson(response, 200, { uiLanguage: nextIndex.uiLanguage, uiTheme: nextIndex.uiTheme });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/export") {
    const index = await readIndex();
    const requestedId = url.searchParams.get("dictionaryId") || index.activeDictionaryId;
    if (!requestedId || !index.dictionaryIds.includes(requestedId)) {
      throw Object.assign(new Error("Dictionary not found"), { status: 404 });
    }
    const dictionary = await readDictionary(requestedId);
    sendJson(response, 200, dictionary, {
      "Content-Disposition": `attachment; filename="conlexicon-${requestedId}-${localDateStamp()}.json"`,
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/import") {
    const dictionary = importDictionaryFromPayload(await readRequestBody(request));
    const existing = await readIndex();
    const overwrite = url.searchParams.get("overwrite") === "true";
    if (existing.dictionaryIds.includes(dictionary.id) && !overwrite) {
      throw Object.assign(new Error("Dictionary ID already exists; overwrite confirmation required"), { status: 409 });
    }
    await writeDictionary(dictionary);

    const dictionaryIds = existing.dictionaryIds.includes(dictionary.id)
      ? existing.dictionaryIds
      : [...existing.dictionaryIds, dictionary.id];
    await writeIndex({ activeDictionaryId: dictionary.id, dictionaryIds });
    sendJson(response, 200, await readState());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/dictionaries") {
    const body = await readRequestBody(request);
    const dictionary = await writeDictionary(
      normalizeDictionary({
        name: body.name,
        language: body.language,
        description: body.description,
        entries: [],
      }),
    );
    const index = await readIndex();
    const dictionaryIds = [...index.dictionaryIds, dictionary.id];
    await writeIndex({ activeDictionaryId: dictionary.id, dictionaryIds });
    sendJson(response, 201, dictionary);
    return true;
  }

  const dictionaryMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)(?:\/(activate|autosave))?$/);
  if (dictionaryMatch) {
    const id = decodeURIComponent(dictionaryMatch[1]);
    const action = dictionaryMatch[2];

    if (request.method === "POST" && action === "activate") {
      const index = await readIndex();
      if (!index.dictionaryIds.includes(id)) {
        sendText(response, 404, "Dictionary not found");
        return true;
      }
      await writeIndex({ ...index, activeDictionaryId: id });
      sendJson(response, 200, await readState());
      return true;
    }

    if (request.method === "POST" && action === "autosave") {
      const index = await readIndex();
      if (!index.dictionaryIds.includes(id)) {
        sendText(response, 404, "Dictionary not found");
        return true;
      }
      const body = await readRequestBody(request);
      const existing = await readDictionary(id);
      const dictionary = await writeDictionary({ ...existing, ...body, id });
      sendJson(response, 200, dictionary);
      return true;
    }

    if (request.method === "PUT" && !action) {
      const body = await readRequestBody(request);
      const index = await readIndex();
      if (!index.dictionaryIds.includes(id)) {
        sendText(response, 404, "Dictionary not found");
        return true;
      }
      const existing = await readDictionary(id);
      const dictionary = await writeDictionary({ ...existing, ...body, id });
      sendJson(response, 200, dictionary);
      return true;
    }

    if (request.method === "DELETE" && !action) {
      const index = await readIndex();
      if (!index.dictionaryIds.includes(id)) {
        sendText(response, 404, "Dictionary not found");
        return true;
      }
      await fs.rm(dictionaryPath(id), { force: true });
      const dictionaryIds = index.dictionaryIds.filter((dictionaryId) => dictionaryId !== id);
      const activeDictionaryId = index.activeDictionaryId === id ? dictionaryIds[0] || "" : index.activeDictionaryId;
      await writeIndex({ activeDictionaryId, dictionaryIds });
      sendJson(response, 200, await readState());
      return true;
    }
  }

  return false;
}

async function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(rootDir, `.${requestedPath}`);

  if (!filePath.startsWith(rootDir) || filePath.includes(`${path.sep}data${path.sep}`)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const type = contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/") && (await routeApi(request, response, url))) {
      return;
    }
    await serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    sendText(response, error.status || 500, error.message || "Internal server error");
  }
}

ensureDataStore().then(() => {
  http.createServer(handleRequest).listen(port, () => {
    console.log(`Conlexicon running at http://localhost:${port}`);
  });
});
