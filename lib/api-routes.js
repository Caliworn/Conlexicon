const {
  importDictionaryFromPayload,
  normalizeDictionary,
} = require("./dictionary-model");
const {
  localDateStamp,
  readRequestBody,
  sendJson,
} = require("./http-utils");

function createApiRouter({ repository }) {
  return async function routeApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/state") {
      sendJson(response, 200, await repository.readState());
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
      sendJson(response, 200, await repository.updatePreferences(body));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/export") {
      const dictionary = await repository.exportDictionary(url.searchParams.get("dictionaryId"));
      sendJson(response, 200, dictionary, {
        "Content-Disposition": `attachment; filename="conlexicon-${dictionary.id}-${localDateStamp()}.json"`,
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/import") {
      const dictionary = importDictionaryFromPayload(await readRequestBody(request));
      const overwrite = url.searchParams.get("overwrite") === "true";
      const regenerateId = url.searchParams.get("regenerateId") === "true";
      await repository.importDictionary(dictionary, { overwrite, regenerateId });
      sendJson(response, 200, await repository.readState());
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/dictionaries") {
      const body = await readRequestBody(request);
      const dictionary = await repository.createDictionary(
        normalizeDictionary({
          name: body.name,
          language: body.language,
          description: body.description,
          entries: [],
        }),
      );
      sendJson(response, 201, dictionary);
      return true;
    }

    const dictionaryMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)(?:\/(activate|autosave))?$/);
    if (dictionaryMatch) {
      const id = decodeURIComponent(dictionaryMatch[1]);
      const action = dictionaryMatch[2];

      if (request.method === "POST" && action === "activate") {
        await repository.activateDictionary(id);
        sendJson(response, 200, await repository.readState());
        return true;
      }

      if (request.method === "POST" && action === "autosave") {
        const body = await readRequestBody(request);
        const dictionary = await repository.updateDictionary(id, body);
        sendJson(response, 200, dictionary);
        return true;
      }

      if (request.method === "PUT" && !action) {
        const body = await readRequestBody(request);
        const dictionary = await repository.updateDictionary(id, body);
        sendJson(response, 200, dictionary);
        return true;
      }

      if (request.method === "DELETE" && !action) {
        await repository.deleteDictionary(id);
        sendJson(response, 200, await repository.readState());
        return true;
      }
    }

    return false;
  };
}

module.exports = {
  createApiRouter,
};
