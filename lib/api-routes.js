const crypto = require("node:crypto");
const {
  createDictionaryConversionService,
} = require("./dictionary-conversion-service");
const {
  localDateStamp,
  readRequestBody,
  REQUEST_BODY_LIMITS,
  sendJson,
} = require("./http-utils");
const { apiError } = require("./api-error");
const { AnalysisFeatureService } = require("./analysis-feature-service");
const { QualityResultService } = require("./quality-result-service");
const { CorpusQualityService } = require("./corpus-quality-service");
const { UI_SKIN_IDS, assertValidSearchNormalizationRules } = require("./dictionary-model");

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

// Text fields of a corpus item from a request; a missing field is empty.
function corpusItemFromBody(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)
    || ["name", "group", "content"].some((field) => item[field] !== undefined && typeof item[field] !== "string")) {
    throw httpError("Invalid corpus item payload", 400, "invalid_corpus_payload");
  }
  return { name: item.name || "", group: item.group || "", content: item.content || "" };
}

function corpusListQuery(searchParams) {
  const offset = searchParams.has("offset") ? Number(searchParams.get("offset")) : 0;
  const limit = searchParams.has("limit") ? Number(searchParams.get("limit")) : 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw httpError("Invalid corpus query", 400, "invalid_corpus_query");
  }
  return {
    q: searchParams.get("q") || "",
    ...(searchParams.has("group") ? { group: searchParams.get("group") } : {}),
    offset,
    limit,
  };
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

function entryWriteResponse(result) {
  return {
    entry: result.entry,
    summary: result.summary,
    ...(result.tagRegistry ? { tagRegistry: result.tagRegistry } : {}),
  };
}

function dictionarySettingsResponse(dictionary) {
  return {
    id: dictionary.id,
    updatedAt: dictionary.updatedAt || "",
    settings: dictionary.settings,
  };
}

function createApiRouter({
  repository,
  conversionService = createDictionaryConversionService(),
  analysisFeatureService = new AnalysisFeatureService({ repository }),
  qualityResultService = new QualityResultService({ repository }),
  corpusQualityService = new CorpusQualityService({ repository }),
}) {
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
      if (Object.hasOwn(body, "uiSkin") && !UI_SKIN_IDS.includes(body.uiSkin)) {
        throw httpError("Invalid UI skin", 400, "invalid_ui_skin");
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
        await readRequestBody(request, { maxBytes: REQUEST_BODY_LIMITS.import }),
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
        {
          name: body.name,
          language: body.language,
          description: body.description,
          entries: [],
        },
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
        const body = await readRequestBody(request, { maxBytes: REQUEST_BODY_LIMITS.module });
        const hasDocs = body.docs && typeof body.docs === "object" && !Array.isArray(body.docs);
        const hasCorpusItem = body.corpusItem && typeof body.corpusItem === "object" && !Array.isArray(body.corpusItem)
          && typeof body.corpusItem.id === "string" && body.corpusItem.id.trim();
        if (!hasDocs && !hasCorpusItem) {
          throw httpError("Autosave payload must include docs or a corpus item", 400, "invalid_autosave_payload");
        }
        const payload = {};
        if (hasDocs) {
          const saved = await repository.saveDocs(id, body.docs);
          payload.id = saved.id;
          payload.updatedAt = saved.updatedAt || "";
          payload.docs = saved.docs;
        }
        if (hasCorpusItem) {
          const saved = await repository.saveCorpusItem(id, body.corpusItem.id.trim(), corpusItemFromBody(body.corpusItem));
          payload.id = saved.id;
          payload.updatedAt = saved.updatedAt || "";
          payload.corpusItem = saved.item;
        }
        sendJson(response, 200, payload);
        return true;
      }

      if (request.method === "GET" && !action) {
        sendJson(response, 200, await repository.getDictionaryWorkspace(id));
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

    const dictionaryModuleMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/(settings|docs|morphology)$/);
    if (dictionaryModuleMatch) {
      const id = decodeURIComponent(dictionaryModuleMatch[1]);
      const module = dictionaryModuleMatch[2];

      if (request.method === "PUT") {
        const body = await readRequestBody(request, {
          maxBytes: module === "settings"
            ? REQUEST_BODY_LIMITS.default
            : REQUEST_BODY_LIMITS.module,
        });
        if (module === "settings") {
          const settings = objectFromBody(body, "settings", "settings");
          assertValidSearchNormalizationRules(settings);
          sendJson(response, 200, dictionarySettingsResponse(await repository.updateSettings(id, settings)));
          return true;
        }
        if (module === "docs") {
          sendJson(response, 200, dictionaryModuleResponse(await repository.saveDocs(id, objectFromBody(body, "docs", "docs")), "docs"));
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
        const ipa = objectFromBody(body, "ipa", "IPA settings", "invalid_ipa_settings_payload");
        sendJson(response, 200, dictionarySettingsResponse(await repository.updateIpaSettings(id, ipa, body.ipaKeyboard)));
        return true;
      }
    }

    const entryBatchMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entries\/batch$/);
    if (entryBatchMatch && request.method === "POST") {
      const id = decodeURIComponent(entryBatchMatch[1]);
      const body = await readRequestBody(request);
      const validOperation = body?.operation === "generateIpa" && ["missing", "all"].includes(body.mode);
      if (!validOperation || (body.dryRun !== undefined && typeof body.dryRun !== "boolean")) {
        throw httpError("Invalid entry batch payload", 400, "invalid_entry_batch_payload");
      }
      sendJson(response, 200, await repository.batchUpdateEntries(id, body));
      return true;
    }

    const createSourceMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entries\/create-source$/);
    if (createSourceMatch && request.method === "POST") {
      const id = decodeURIComponent(createSourceMatch[1]);
      const body = await readRequestBody(request);
      const entry = entryFromRequestBody(body?.entry);
      if (Object.hasOwn(entry, "id")) throw httpError("Entry ID is generated by the server", 400, "entry_id_not_allowed");
      if (!body.sourceBinding || typeof body.sourceBinding !== "object" || Array.isArray(body.sourceBinding)) {
        throw httpError("Invalid source binding", 400, "invalid_source_binding");
      }
      const result = await repository.saveEntry(id, { ...entry, id: `entry-${crypto.randomUUID()}` }, {
        createOnly: true, sourceBinding: body.sourceBinding,
      });
      sendJson(response, 201, { ...entryWriteResponse(result), ownerEntry: result.ownerEntry });
      return true;
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
        if (Object.hasOwn(entry, "id")) {
          throw httpError("Entry ID is generated by the server", 400, "entry_id_not_allowed");
        }
        const result = await repository.saveEntry(id, { ...entry, id: `entry-${crypto.randomUUID()}` }, { createOnly: true });
        sendJson(response, 201, entryWriteResponse(result));
        return true;
      }

      if (request.method === "PATCH") {
        const body = await readRequestBody(request, { maxBytes: REQUEST_BODY_LIMITS.module });
        if (!Array.isArray(body?.updates)) {
          throw httpError("Invalid entry updates payload", 400, "invalid_entry_updates_payload");
        }
        const options = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
          ? { settings: body.settings }
          : {};
        if (options.settings) {
          assertValidSearchNormalizationRules(options.settings);
        }
        sendJson(response, 200, await repository.patchEntries(id, body.updates, options));
        return true;
      }
    }

    const entryFilterFactsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entries\/filter-facts$/);
    if (entryFilterFactsMatch) {
      const id = decodeURIComponent(entryFilterFactsMatch[1]);
      if (request.method === "POST") {
        sendJson(response, 200, await repository.getEntryFilterFacts(id, await readRequestBody(request)));
        return true;
      }
    }

    const sourceCandidatesMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/source-candidates\/query$/);
    if (sourceCandidatesMatch && request.method === "POST") {
      const id = decodeURIComponent(sourceCandidatesMatch[1]);
      sendJson(response, 200, await repository.querySourceCandidates(id, await readRequestBody(request)));
      return true;
    }

    const entryLocationMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/entries\/([^/]+)\/location$/);
    if (entryLocationMatch) {
      const id = decodeURIComponent(entryLocationMatch[1]);
      const entryId = decodeURIComponent(entryLocationMatch[2]);
      if (request.method === "GET") {
        const query = Object.fromEntries(url.searchParams.entries());
        sendJson(response, 200, await repository.locateEntryQueryWindow(id, entryId, query));
        return true;
      }
    }

    const tagRegistryMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/tag-registry(\/changes)?$/);
    if (tagRegistryMatch) {
      const id = decodeURIComponent(tagRegistryMatch[1]);
      if (request.method === "GET" && !tagRegistryMatch[2]) {
        sendJson(response, 200, await repository.getTagRegistry(id));
        return true;
      }
      if (request.method === "POST" && tagRegistryMatch[2]) {
        sendJson(response, 200, await repository.changeTagRegistry(id, await readRequestBody(request)));
        return true;
      }
    }

    const analysisQueryMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/analysis\/query$/);
    if (analysisQueryMatch) {
      const id = decodeURIComponent(analysisQueryMatch[1]);
      if (request.method === "POST") {
        const body = await readRequestBody(request);
        sendJson(response, 200, await repository.queryAnalysis(id, body));
        return true;
      }
    }

    const analysisFeatureMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/analysis\/features\/(query|location)$/);
    if (analysisFeatureMatch) {
      const id = decodeURIComponent(analysisFeatureMatch[1]);
      const action = analysisFeatureMatch[2];
      if (request.method === "POST") {
        const body = await readRequestBody(request);
        const result = action === "location"
          ? await analysisFeatureService.location(id, body)
          : await analysisFeatureService.query(id, body);
        sendJson(response, 200, result);
        return true;
      }
    }

    const corpusGroupsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/corpus\/groups$/);
    if (corpusGroupsMatch && request.method === "GET") {
      sendJson(response, 200, await repository.getCorpusGroups(decodeURIComponent(corpusGroupsMatch[1])));
      return true;
    }

    const corpusItemsMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/corpus\/items$/);
    if (corpusItemsMatch) {
      const id = decodeURIComponent(corpusItemsMatch[1]);
      if (request.method === "GET") {
        sendJson(response, 200, await repository.queryCorpusItems(id, corpusListQuery(url.searchParams)));
        return true;
      }
      if (request.method === "POST") {
        const body = await readRequestBody(request);
        sendJson(response, 201, await repository.createCorpusItem(id, corpusItemFromBody(body?.item)));
        return true;
      }
    }

    const corpusItemLinksMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/corpus\/items\/([^/]+)\/links$/);
    if (corpusItemLinksMatch && request.method === "GET") {
      sendJson(response, 200, await repository.getCorpusItemLinks(
        decodeURIComponent(corpusItemLinksMatch[1]),
        decodeURIComponent(corpusItemLinksMatch[2]),
      ));
      return true;
    }

    const corpusItemMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/corpus\/items\/([^/]+)$/);
    if (corpusItemMatch) {
      const id = decodeURIComponent(corpusItemMatch[1]);
      const itemId = decodeURIComponent(corpusItemMatch[2]);
      if (request.method === "GET") {
        sendJson(response, 200, await repository.getCorpusItem(id, itemId));
        return true;
      }
      if (request.method === "PUT") {
        const body = await readRequestBody(request);
        sendJson(response, 200, await repository.saveCorpusItem(id, itemId, corpusItemFromBody(body?.item)));
        return true;
      }
      if (request.method === "DELETE") {
        sendJson(response, 200, await repository.deleteCorpusItem(id, itemId, {
          unlink: url.searchParams.get("unlink") === "true",
        }));
        return true;
      }
    }

    const qualityMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/quality\/(query|location)$/);
    if (qualityMatch) {
      const id = decodeURIComponent(qualityMatch[1]);
      const action = qualityMatch[2];
      if (request.method === "POST") {
        const body = await readRequestBody(request);
        const corpusSource = body?.source?.type === "corpusQuality";
        if (corpusSource && action === "location") {
          throw httpError("Corpus quality has no entry location", 400, "invalid_quality_item_kind");
        }
        const result = corpusSource
          ? await corpusQualityService.query(id, body)
          : action === "location"
            ? await qualityResultService.location(id, body)
            : await qualityResultService.query(id, body);
        sendJson(response, 200, result);
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

    const rootGroupLocationMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/root-groups\/location$/);
    if (rootGroupLocationMatch) {
      const id = decodeURIComponent(rootGroupLocationMatch[1]);
      if (request.method === "GET") {
        const query = Object.fromEntries(url.searchParams.entries());
        const entryId = String(query.entryId || "").trim();
        if (!entryId) {
          throw httpError("Entry location target is required", 400, "invalid_entry_location_target");
        }
        sendJson(response, 200, await repository.locateRootGroupQueryWindow(id, entryId, query));
        return true;
      }
    }

    const rootGroupEntriesMatch = url.pathname.match(/^\/api\/dictionaries\/([^/]+)\/root-groups\/([^/]+)\/entries$/);
    if (rootGroupEntriesMatch) {
      const id = decodeURIComponent(rootGroupEntriesMatch[1]);
      const rootId = decodeURIComponent(rootGroupEntriesMatch[2]);
      if (request.method === "GET") {
        const query = Object.fromEntries(url.searchParams.entries());
        sendJson(response, 200, await repository.queryRootGroupEntries(id, rootId, query));
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
        const result = await repository.saveEntry(id, { ...entry, id: entryId }, { requireExisting: true });
        sendJson(response, 200, entryWriteResponse(result));
        return true;
      }

      if (request.method === "DELETE") {
        const result = await repository.deleteEntry(id, entryId);
        sendJson(response, 200, {
          updatedAt: result.updatedAt || "",
          summary: result.summary,
        });
        return true;
      }
    }

    return false;
  };
}

module.exports = {
  createApiRouter,
};
