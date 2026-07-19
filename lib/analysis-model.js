(function initAnalysisModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconAnalysis = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createAnalysisModel() {
  const DEFAULT_ANALYSIS_OVERVIEW_WIDGETS = [
    "entryCounts",
    "derivedCounts",
    "definitionCoverage",
    "ipaCoverage",
    "morphologyCoverage",
    "partDistribution",
    "coverageBreakdown",
    "activityPreview",
  ];
  const ANALYSIS_OVERVIEW_WIDGETS = {
    entryCounts: { deps: ["relation"] },
    derivedCounts: { deps: ["relation"] },
    definitionCoverage: { deps: ["coverage"] },
    ipaCoverage: { deps: ["coverage", "ipa"] },
    morphologyCoverage: { deps: ["coverage", "morphology"] },
    partDistribution: { deps: ["tags"] },
    coverageBreakdown: { deps: ["coverage"] },
    topRootFamilies: { deps: ["rootFamilies"] },
    rootFamilies: { deps: ["rootFamilies"] },
    activityPreview: { deps: ["activity"] },
  };
  const analysisSliceCache = new Map();

  function analysisSliceDepsForOverviewWidgets(widgets = DEFAULT_ANALYSIS_OVERVIEW_WIDGETS) {
    return [...new Set((widgets || [])
      .flatMap((widget) => ANALYSIS_OVERVIEW_WIDGETS[widget]?.deps || []))];
  }

  function analysisSliceDepsForPage(page = "overview", subpage = "") {
    if (page === "overview") {
      return analysisSliceDepsForOverviewWidgets();
    }
    if (page === "entries") {
      if (subpage === "forms") {
        return ["forms"];
      }
      if (subpage === "roots") {
        return ["rootFamilies"];
      }
      if (subpage === "coverage") {
        return ["coverage", "relation", "search"];
      }
      return ["tags"];
    }
    if (page === "ipa") {
      return subpage === "units" || subpage === "mismatches"
        ? ["ipa"]
        : ["ipa", "coverage"];
    }
    if (page === "morphology") {
      return subpage === "overrides" || subpage === "generated"
        ? ["morphology"]
        : ["morphology", "coverage"];
    }
    if (page === "activity") {
      return ["activity"];
    }
    return ["relation", "rootFamilies", "coverage", "tags", "forms", "ipa", "morphology", "search", "activity"];
  }

  function emptyAnalysisSlices() {
    const emptyCoverage = {
      definitions: 0,
      examples: 0,
      notes: 0,
      sources: 0,
      ipa: 0,
      morphology: 0,
    };
    return {
      relation: {
        rootCount: 0,
        derivedCount: 0,
        isolatedRootCount: 0,
        multiSourceCount: 0,
        multiSourceEntryIds: [],
      },
      rootFamilies: {
        rootFamilies: [],
        allRootFamilies: [],
      },
      coverage: {
        definitionCount: 0,
        examples: 0,
        glossExamples: 0,
        definitionEntryIds: [],
        exampleEntryIds: [],
        glossEntryIds: [],
        noteEntryIds: [],
        sourceEntryIds: [],
        ipaEntryIds: [],
        morphologyEntryIds: [],
        noDefinitionEntryIds: [],
        noExampleEntryIds: [],
        noNoteEntryIds: [],
        noSourceEntryIds: [],
        noIpaEntryIds: [],
        noMorphologyEntryIds: [],
        coverage: emptyCoverage,
        coverageRows: [],
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
      ipa: {
        units: [],
        allUnits: [],
        initials: [],
        allInitials: [],
        finals: [],
        allFinals: [],
        syllableCounts: [],
        allSyllableCounts: [],
        syllableAverage: "0",
        generatedMatch: 0,
        generatedMatchEntryIds: [],
        generatedMismatch: 0,
        generatedMismatchEntryIds: [],
        generatedMismatchStrict: 0,
        generatedMismatchStrictEntryIds: [],
      },
      morphology: {
        tables: [],
        allTables: [],
        overrides: [],
        allOverrides: [],
        generatedForms: 0,
        emptyCells: 0,
        emptyCellEntryIds: [],
      },
      search: {
        searchMatches: 0,
        searchMatchEntryIds: [],
        searchFields: [],
      },
      activity: {
        created: [],
        updated: [],
        latest: [],
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
    ANALYSIS_OVERVIEW_WIDGETS,
    DEFAULT_ANALYSIS_OVERVIEW_WIDGETS,
    analysisSliceDepsForOverviewWidgets,
    analysisSliceDepsForPage,
    buildReportForRoute,
    emptyAnalysisSlices,
  };
});
