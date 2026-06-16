const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const rootDir = __dirname;
const dataDir = process.env.CONLEXICON_DATA_DIR ? path.resolve(process.env.CONLEXICON_DATA_DIR) : path.join(rootDir, "data");
const dictionariesDir = path.join(dataDir, "dictionaries");
const indexPath = path.join(dataDir, "index.json");
const port = Number(process.env.PORT || 4173);

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
    await writeJson(indexPath, { activeDictionaryId: "", dictionaryIds: [] });
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
    savePartialEditOnSwitch,
    saveFullEditOnSwitch,
    ...restSettings
  } = settings;

  return {
    ...restSettings,
    glossSmallCaps: Boolean(settings.glossSmallCaps),
    tagDisplayMap: normalizeTagDisplayMap(settings.tagDisplayMap),
    redHighlightTags: normalizeRedHighlightTags(settings.redHighlightTags),
    entryListPolysemyDisplay: Boolean(settings.entryListPolysemyDisplay),
    networkPolysemyDisplay: Boolean(settings.networkPolysemyDisplay),
    fuzzySearch: Boolean(settings.fuzzySearch),
    tagFuzzySearch: Boolean(settings.tagFuzzySearch),
    sourceFuzzyCompletion: Boolean(settings.sourceFuzzyCompletion),
    searchHighlight: Boolean(settings.searchHighlight ?? true),
    savePartialEditOnPageSwitch: Boolean(settings.savePartialEditOnPageSwitch ?? savePartialEditOnSwitch),
    saveFullEditOnPageSwitch: Boolean(settings.saveFullEditOnPageSwitch ?? saveFullEditOnSwitch),
    ipaKeyboard: normalizeIpaKeyboard(settings.ipaKeyboard),
    ipa: normalizeIpaSettings(settings.ipa),
  };
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
    unstressMonosyllables: Boolean(ipa.unstressMonosyllables),
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
  return {
    id: dictionary.id || uid("dict"),
    name: dictionary.name || "未命名词典",
    language: dictionary.language || "",
    description: dictionary.description || "",
    settings: normalizeDictionarySettings(dictionary.settings),
    docs: normalizeDocs(dictionary.docs),
    morphology: normalizeMorphology(dictionary.morphology),
    createdAt: dictionary.createdAt || now,
    updatedAt: dictionary.updatedAt || now,
    entries: Array.isArray(dictionary.entries) ? dictionary.entries.map(normalizeEntry) : [],
  };
}

async function readIndex() {
  const index = await readJson(indexPath, { activeDictionaryId: "", dictionaryIds: [] });
  return {
    activeDictionaryId: index.activeDictionaryId || "",
    dictionaryIds: Array.isArray(index.dictionaryIds) ? index.dictionaryIds : [],
  };
}

async function writeIndex(index) {
  await writeJson(indexPath, {
    activeDictionaryId: index.activeDictionaryId || "",
    dictionaryIds: Array.isArray(index.dictionaryIds) ? index.dictionaryIds : [],
  });
}

async function readDictionary(id) {
  return normalizeDictionary(await readJson(dictionaryPath(id)));
}

async function writeDictionary(dictionary) {
  const normalized = normalizeDictionary(dictionary);
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

  return { activeDictionaryId, dictionaries };
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

async function routeApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, await readState());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/export") {
    sendJson(response, 200, await readState(), {
      "Content-Disposition": `attachment; filename="conlexicon-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/import") {
    const imported = await readRequestBody(request);
    const dictionaries = Array.isArray(imported.dictionaries) ? imported.dictionaries.map(normalizeDictionary) : [];
    const existing = await readIndex();

    for (const id of existing.dictionaryIds) {
      await fs.rm(dictionaryPath(id), { force: true });
    }

    for (const dictionary of dictionaries) {
      await writeDictionary(dictionary);
    }

    const dictionaryIds = dictionaries.map((dictionary) => dictionary.id);
    const activeDictionaryId = dictionaryIds.includes(imported.activeDictionaryId) ? imported.activeDictionaryId : dictionaryIds[0] || "";
    await writeIndex({ activeDictionaryId, dictionaryIds });
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

  const dictionaryMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)(?:\/(activate))?$/);
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
