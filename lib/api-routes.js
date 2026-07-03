const {
  importDictionaryFromPayload,
  normalizeDictionary,
} = require("./dictionary-model");
const {
  localDateStamp,
  readRequestBody,
  sendJson,
} = require("./http-utils");

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function entryFromRequestBody(body) {
  const candidate = body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
    ? body.entry
    : body;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw httpError("Invalid entry payload", 400);
  }
  return candidate;
}

function objectFromBody(body, key, label) {
  const candidate = body?.[key] && typeof body[key] === "object" && !Array.isArray(body[key])
    ? body[key]
    : body;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw httpError(`Invalid ${label} payload`, 400);
  }
  return candidate;
}

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

    const dictionaryMetaMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/meta$/);
    if (dictionaryMetaMatch) {
      const id = decodeURIComponent(dictionaryMetaMatch[1]);
      if (request.method === "PUT") {
        const body = await readRequestBody(request);
        sendJson(response, 200, await repository.updateMetadata(id, {
          name: String(body.name || ""),
          language: String(body.language || ""),
          description: String(body.description || ""),
        }));
        return true;
      }
    }

    const dictionaryModuleMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/(settings|docs|corpus|morphology)$/);
    if (dictionaryModuleMatch) {
      const id = decodeURIComponent(dictionaryModuleMatch[1]);
      const module = dictionaryModuleMatch[2];

      if (request.method === "PUT") {
        const body = await readRequestBody(request);
        if (module === "settings") {
          sendJson(response, 200, await repository.updateSettings(id, objectFromBody(body, "settings", "settings")));
          return true;
        }
        if (module === "docs") {
          sendJson(response, 200, await repository.saveDocs(id, objectFromBody(body, "docs", "docs")));
          return true;
        }
        if (module === "corpus") {
          sendJson(response, 200, await repository.saveCorpusChanges(id, objectFromBody(body, "corpus", "corpus")));
          return true;
        }
        if (module === "morphology") {
          sendJson(response, 200, await repository.saveMorphology(id, objectFromBody(body, "morphology", "morphology")));
          return true;
        }
      }
    }

    const ipaSettingsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/settings\/ipa$/);
    if (ipaSettingsMatch) {
      const id = decodeURIComponent(ipaSettingsMatch[1]);
      if (request.method === "PUT") {
        const body = await readRequestBody(request);
        sendJson(response, 200, await repository.updateIpaSettings(id, objectFromBody(body, "ipa", "IPA settings")));
        return true;
      }
    }

    const entryCollectionMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entries$/);
    if (entryCollectionMatch) {
      const id = decodeURIComponent(entryCollectionMatch[1]);

      if (request.method === "GET") {
        sendJson(response, 200, await repository.queryEntries(id));
        return true;
      }

      if (request.method === "POST") {
        const entry = entryFromRequestBody(await readRequestBody(request));
        if (entry.id && await repository.getEntry(id, entry.id)) {
          throw httpError("Entry ID already exists", 409);
        }
        const dictionary = await repository.saveEntry(id, entry);
        const savedEntry = entry.id
          ? dictionary.entries.find((item) => item.id === entry.id)
          : dictionary.entries.at(-1);
        sendJson(response, 201, savedEntry);
        return true;
      }

      if (request.method === "PATCH") {
        const body = await readRequestBody(request);
        if (!Array.isArray(body?.updates)) {
          throw httpError("Invalid entry updates payload", 400);
        }
        const options = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
          ? { settings: body.settings }
          : {};
        sendJson(response, 200, await repository.patchEntries(id, body.updates, options));
        return true;
      }
    }

    const entryMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entries\/([^/]+)$/);
    if (entryMatch) {
      const id = decodeURIComponent(entryMatch[1]);
      const entryId = decodeURIComponent(entryMatch[2]);

      if (request.method === "GET") {
        const entry = await repository.getEntry(id, entryId);
        if (!entry) {
          throw httpError("Entry not found", 404);
        }
        sendJson(response, 200, entry);
        return true;
      }

      if (request.method === "PUT") {
        const entry = entryFromRequestBody(await readRequestBody(request));
        const dictionary = await repository.saveEntry(id, { ...entry, id: entryId });
        sendJson(response, 200, dictionary.entries.find((item) => item.id === entryId));
        return true;
      }

      if (request.method === "DELETE") {
        await repository.deleteEntry(id, entryId);
        sendJson(response, 200, { id: entryId });
        return true;
      }
    }

    return false;
  };
}

module.exports = {
  createApiRouter,
};
