const {
  normalizeDictionary,
} = require("./dictionary-model");
const {
  createDictionaryConversionService,
} = require("./dictionary-conversion-service");
const {
  localDateStamp,
  readRequestBody,
  sendJson,
} = require("./http-utils");
const { apiError } = require("./api-error");

function httpError(message, status, code, details) {
  return apiError(message, status, code, details);
}

function entryFromRequestBody(body) {
  const candidate = body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
    ? body.entry
    : body;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw httpError("Invalid entry payload", 400, "invalid_entry_payload");
  }
  return candidate;
}

function objectFromBody(body, key, label, code = `invalid_${key}_payload`) {
  const candidate = body?.[key] && typeof body[key] === "object" && !Array.isArray(body[key])
    ? body[key]
    : body;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw httpError(`Invalid ${label} payload`, 400, code);
  }
  return candidate;
}

function dictionaryMetadataResponse(dictionary) {
  return {
    id: dictionary.id,
    name: dictionary.name || "",
    language: dictionary.language || "",
    description: dictionary.description || "",
    createdAt: dictionary.createdAt || "",
    updatedAt: dictionary.updatedAt || "",
    ...(dictionary.summary ? { summary: dictionary.summary } : {}),
  };
}

function dictionaryModuleResponse(dictionary, moduleName) {
  return {
    id: dictionary.id,
    updatedAt: dictionary.updatedAt || "",
    [moduleName]: dictionary[moduleName],
  };
}

function dictionarySettingsResponse(dictionary) {
  return {
    id: dictionary.id,
    updatedAt: dictionary.updatedAt || "",
    settings: dictionary.settings,
  };
}

function dictionaryAutosaveResponse(dictionary, body) {
  return {
    id: dictionary.id,
    updatedAt: dictionary.updatedAt || "",
    ...(body.docs ? { docs: dictionary.docs } : {}),
    ...(body.corpus ? { corpus: dictionary.corpus } : {}),
  };
}

function entryPatchResponse(dictionary, updates = [], options = {}) {
  const changedIds = new Set(updates.map((update) => String(update?.id || "").trim()).filter(Boolean));
  return {
    id: dictionary.id,
    updatedAt: dictionary.updatedAt || "",
    entries: (dictionary.entries || []).filter((entry) => changedIds.has(entry.id)),
    ...(Object.hasOwn(options, "settings") ? { settings: dictionary.settings } : {}),
  };
}

function createApiRouter({ repository, conversionService = createDictionaryConversionService() }) {
  return async function routeApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/state") {
      sendJson(response, 200, await repository.readState());
      return true;
    }

    if (request.method === "PUT" && url.pathname === "/api/preferences") {
      const body = await readRequestBody(request);
      if (Object.hasOwn(body, "uiLanguage") && !["zh", "en"].includes(body.uiLanguage)) {
        throw httpError("Invalid UI language", 400, "invalid_ui_language");
      }
      if (Object.hasOwn(body, "uiTheme") && !["light", "dark"].includes(body.uiTheme)) {
        throw httpError("Invalid UI theme", 400, "invalid_ui_theme");
      }
      sendJson(response, 200, await repository.updatePreferences(body));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/export") {
      const exported = conversionService.exportDictionarySnapshot(
        await repository.exportDictionary(url.searchParams.get("dictionaryId")),
        {
          format: url.searchParams.get("format") || "json",
          profile: url.searchParams.get("profile") || "legacy-json",
        },
      );
      sendJson(response, 200, exported.payload, {
        "Content-Disposition": `attachment; filename="conlexicon-${exported.payload.id}-${localDateStamp()}.${exported.extension}"`,
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/import") {
      const { dictionary } = conversionService.importDictionaryFromJsonPayload(
        await readRequestBody(request),
        { profile: url.searchParams.get("profile") || "legacy-json" },
      );
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
        let dictionary = null;
        if (body.docs && typeof body.docs === "object" && !Array.isArray(body.docs)) {
          dictionary = await repository.saveDocs(id, body.docs);
        }
        if (body.corpus && typeof body.corpus === "object" && !Array.isArray(body.corpus)) {
          dictionary = await repository.saveCorpusChanges(id, body.corpus);
        }
        if (!dictionary) {
          dictionary = await repository.getDictionarySnapshot(id);
        }
        sendJson(response, 200, dictionaryAutosaveResponse(dictionary, body));
        return true;
      }

      if (request.method === "GET" && !action) {
        sendJson(response, 200, await repository.getDictionarySnapshot(id));
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
        const dictionary = await repository.updateMetadata(id, {
          name: String(body.name || ""),
          language: String(body.language || ""),
          description: String(body.description || ""),
        });
        sendJson(response, 200, dictionaryMetadataResponse(dictionary));
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
          sendJson(response, 200, dictionarySettingsResponse(await repository.updateSettings(id, objectFromBody(body, "settings", "settings"))));
          return true;
        }
        if (module === "docs") {
          sendJson(response, 200, dictionaryModuleResponse(await repository.saveDocs(id, objectFromBody(body, "docs", "docs")), "docs"));
          return true;
        }
        if (module === "corpus") {
          sendJson(response, 200, dictionaryModuleResponse(await repository.saveCorpusChanges(id, objectFromBody(body, "corpus", "corpus")), "corpus"));
          return true;
        }
        if (module === "morphology") {
          sendJson(response, 200, dictionaryModuleResponse(await repository.saveMorphology(id, objectFromBody(body, "morphology", "morphology")), "morphology"));
          return true;
        }
      }
    }

    const ipaSettingsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/settings\/ipa$/);
    if (ipaSettingsMatch) {
      const id = decodeURIComponent(ipaSettingsMatch[1]);
      if (request.method === "PUT") {
        const body = await readRequestBody(request);
        sendJson(response, 200, dictionarySettingsResponse(await repository.updateIpaSettings(id, objectFromBody(body, "ipa", "IPA settings", "invalid_ipa_settings_payload"))));
        return true;
      }
    }

    const entryCollectionMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entries$/);
    if (entryCollectionMatch) {
      const id = decodeURIComponent(entryCollectionMatch[1]);

      if (request.method === "GET") {
        const query = Object.fromEntries(url.searchParams.entries());
        sendJson(response, 200, await repository.queryEntries(id, query));
        return true;
      }

      if (request.method === "POST") {
        const entry = entryFromRequestBody(await readRequestBody(request));
        if (entry.id && await repository.getEntry(id, entry.id)) {
          throw httpError("Entry ID already exists", 409, "entry_id_exists");
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
          throw httpError("Invalid entry updates payload", 400, "invalid_entry_updates_payload");
        }
        const options = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
          ? { settings: body.settings }
          : {};
        const dictionary = await repository.patchEntries(id, body.updates, options);
        sendJson(response, 200, entryPatchResponse(dictionary, body.updates, options));
        return true;
      }
    }

    const facetsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/facets$/);
    if (facetsMatch) {
      const id = decodeURIComponent(facetsMatch[1]);
      if (request.method === "GET") {
        sendJson(response, 200, await repository.getEntryFacets(id));
        return true;
      }
    }

    const rootGroupsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/root-groups$/);
    if (rootGroupsMatch) {
      const id = decodeURIComponent(rootGroupsMatch[1]);
      if (request.method === "GET") {
        const query = Object.fromEntries(url.searchParams.entries());
        sendJson(response, 200, await repository.queryRootGroups(id, query));
        return true;
      }
    }

    const entryRelationsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entry-relations\/([^/]+)$/);
    if (entryRelationsMatch) {
      const id = decodeURIComponent(entryRelationsMatch[1]);
      const entryId = decodeURIComponent(entryRelationsMatch[2]);
      if (request.method === "GET") {
        sendJson(response, 200, await repository.getEntryRelations(id, entryId));
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
          throw httpError("Entry not found", 404, "entry_not_found");
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
        const dictionary = await repository.deleteEntry(id, entryId);
        sendJson(response, 200, { id: entryId, dictionaryId: id, updatedAt: dictionary.updatedAt || "" });
        return true;
      }
    }

    return false;
  };
}

module.exports = {
  createApiRouter,
};
