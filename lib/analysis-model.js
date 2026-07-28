(function initAnalysisModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconAnalysis = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createAnalysisModel() {
  const analysisSliceCache = new Map();

  function analysisSliceDepsForPage(page = "overview", subpage = "") {
    if (page === "overview") {
      return [];
    }
    if (page === "entries") {
      if (subpage === "forms") {
        return ["forms"];
      }
      if (subpage === "roots") {
        return ["rootFamilies"];
      }
      return ["tags"];
    }
    if (page === "ipa") {
      return [];
    }
    if (page === "morphology") {
      return [];
    }
    if (page === "activity") {
      return ["activity"];
    }
    return ["relation", "rootFamilies", "tags", "forms", "activity"];
  }

  function emptyAnalysisSlices() {
    return {
      relation: {
        rootCount: 0,
        derivedCount: 0,
        isolatedRootCount: 0,
        multiSourceCount: 0,
      },
      rootFamilies: {
        rootFamilies: [],
        allRootFamilies: [],
      },
      tags: {
        parts: [],
        allParts: [],
        tags: [],
        allTags: [],
        tagCombos: [],
        allTagCombos: [],
      },
      forms: {
        initialLetters: [],
        allInitialLetters: [],
        wordLengths: [],
        allWordLengths: [],
        characters: [],
        allCharacters: [],
        bigrams: [],
        allBigrams: [],
      },
      activity: {
        created: [],
        updated: [],
      },
    };
  }

  function getAnalysisSlice(context, dep, options = {}) {
    const builder = options.builders?.[dep];
    if (!builder) {
      return null;
    }
    const key = options.sliceCacheKey
      ? options.sliceCacheKey(context, dep)
      : `${context.cacheBaseKey || ""}:${dep}`;
    if (analysisSliceCache.has(key)) {
      return analysisSliceCache.get(key);
    }
    const slice = builder(context);
    analysisSliceCache.set(key, slice);
    const maxCacheEntries = Number.isFinite(options.maxCacheEntries) ? options.maxCacheEntries : 24;
    while (analysisSliceCache.size > maxCacheEntries) {
      analysisSliceCache.delete(analysisSliceCache.keys().next().value);
    }
    return slice;
  }

  function buildRequiredAnalysisSlices(context, deps = [], options = {}) {
    const slices = emptyAnalysisSlices();
    [...new Set(deps)].forEach((dep) => {
      const slice = getAnalysisSlice(context, dep, options);
      if (slice) {
        slices[dep] = slice;
      }
    });
    return slices;
  }

  function buildReportForRoute(dictionary, route = {}, options = {}) {
    const page = route.page || "overview";
    const subpage = route.subpage || "";
    const context = options.buildContext(dictionary);
    const deps = analysisSliceDepsForPage(page, subpage);
    const slices = buildRequiredAnalysisSlices(context, deps, options);
    return options.composeReport(context, slices);
  }

  return {
    analysisSliceDepsForPage,
    buildReportForRoute,
    emptyAnalysisSlices,
  };
});
