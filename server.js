const http = require("node:http");
const path = require("node:path");
const { createApiRouter } = require("./lib/api-routes");
const { serializeApiError } = require("./lib/api-error");
const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("./lib/dictionary-model");
const { sendJson, sendText } = require("./lib/http-utils");
const { SqliteDictionaryRepository } = require("./lib/sqlite-dictionary-repository");
const { createStaticFileServer } = require("./lib/static-server");

const rootDir = __dirname;
const dataDir = process.env.CONLEXICON_DATA_DIR ? path.resolve(process.env.CONLEXICON_DATA_DIR) : path.join(rootDir, "data");
const port = Number(process.env.PORT || 4173);

function repositoryOptions() {
  return {
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiTheme,
    validateDictionary: assertUniqueDictionaryEntityIds,
  };
}

function createRepository() {
  if (!SqliteDictionaryRepository.isRuntimeAvailable()) {
    throw new Error("SQLite repository requires a Node runtime with node:sqlite support");
  }
  return new SqliteDictionaryRepository(repositoryOptions());
}

const repository = createRepository();

const routeApi = createApiRouter({ repository });
const serveStatic = createStaticFileServer({ rootDir });

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/") && (await routeApi(request, response, url))) {
      return;
    }
    await serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, error.status || 500, serializeApiError(error));
      return;
    }
    sendText(response, error.status || 500, error.message || "Internal server error");
  }
}

repository.ensureDataStore().then(() => {
  http.createServer(handleRequest).listen(port, () => {
    console.log(`Conlexicon running at http://localhost:${port} (sqlite repository)`);
  });
});
