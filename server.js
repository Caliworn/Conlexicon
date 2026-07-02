const http = require("node:http");
const path = require("node:path");
const { createApiRouter } = require("./lib/api-routes");
const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
} = require("./lib/dictionary-model");
const { sendText } = require("./lib/http-utils");
const { JsonDictionaryRepository } = require("./lib/json-dictionary-repository");
const { createStaticFileServer } = require("./lib/static-server");

const rootDir = __dirname;
const dataDir = process.env.CONLEXICON_DATA_DIR ? path.resolve(process.env.CONLEXICON_DATA_DIR) : path.join(rootDir, "data");
const port = Number(process.env.PORT || 4173);

const repository = new JsonDictionaryRepository({
  dataDir,
  defaultIndex: DEFAULT_INDEX,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiTheme,
  validateDictionary: assertUniqueDictionaryEntityIds,
});

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
    sendText(response, error.status || 500, error.message || "Internal server error");
  }
}

repository.ensureDataStore().then(() => {
  http.createServer(handleRequest).listen(port, () => {
    console.log(`Conlexicon running at http://localhost:${port}`);
  });
});
