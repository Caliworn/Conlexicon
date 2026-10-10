const path = require("node:path");
const {
  DEFAULT_INDEX,
  assertUniqueDictionaryEntityIds,
  normalizeDictionary,
  normalizeUiLanguage,
  normalizeUiSkin,
  normalizeUiTheme,
} = require("./lib/dictionary-model");
const { createHttpServer } = require("./lib/http-server");
const { SqliteDictionaryRepository } = require("./lib/sqlite-dictionary-repository");

const rootDir = __dirname;
const dataDir = process.env.CONLEXICON_DATA_DIR ? path.resolve(process.env.CONLEXICON_DATA_DIR) : path.join(rootDir, "data");
const port = Number(process.env.PORT || 4173);
const lanDebug = process.env.CONLEXICON_LAN_DEBUG;

function repositoryOptions() {
  return {
    dataDir,
    defaultIndex: DEFAULT_INDEX,
    normalizeDictionary,
    normalizeUiLanguage,
    normalizeUiSkin,
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

repository.ensureDataStore().then(() => {
  const { server, listenHost, lanAddresses } = createHttpServer({ repository, rootDir, lanDebug });
  server.listen(port, listenHost, () => {
    const actualPort = server.address().port;
    console.log(`Conlexicon running at http://localhost:${actualPort} (sqlite repository)`);
    if (lanDebug === "1") {
      const addresses = lanAddresses.map((address) => `http://${address}:${actualPort}`).join(", ") || "(no non-internal IPv4 addresses)";
      console.warn(`LAN DEBUG: ${addresses}. Any device on the LAN can read and write this data directory. Use a temporary CONLEXICON_DATA_DIR.`);
    }
  });
});
