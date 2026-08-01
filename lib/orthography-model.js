(function initOrthographyModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconOrthography = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createOrthographyModel() {
  const ORTHOGRAPHY_FILTER_CATEGORIES = new Set([
    "length",
    "initial",
    "character",
    "bigram",
  ]);

  function codePoints(value) {
    return Array.from(String(value ?? ""));
  }

  function orthographyRuns(value) {
    return String(value ?? "")
      .split(/\s+/u)
      .filter(Boolean)
      .map(codePoints);
  }

  function increment(map, value, amount = 1) {
    const key = String(value);
    map.set(key, (map.get(key) || 0) + amount);
  }

  function analyzeOrthography(value) {
    const lemma = String(value ?? "");
    const runs = orthographyRuns(lemma);
    const characterCounts = new Map();
    const bigramCounts = new Map();
    runs.forEach((run) => {
      run.forEach((character, index) => {
        increment(characterCounts, character);
        if (index < run.length - 1) {
          increment(bigramCounts, `${character}${run[index + 1]}`);
        }
      });
    });
    return {
      length: codePoints(lemma).length,
      initial: codePoints(lemma.trim())[0] || "",
      characterCounts,
      bigramCounts,
    };
  }

  function normalizedOrthographyFilter(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Invalid orthography filter");
    }
    const category = String(value.category || "").trim();
    if (!ORTHOGRAPHY_FILTER_CATEGORIES.has(category)) {
      throw new TypeError("Unsupported orthography filter category");
    }
    if (category === "length") {
      const length = Number(value.value);
      if (!Number.isSafeInteger(length) || length < 1) {
        throw new TypeError("Invalid orthography length filter value");
      }
      return { category, value: String(length) };
    }
    const filterValue = String(value.value ?? "");
    const points = codePoints(filterValue);
    const expectedLength = category === "bigram" ? 2 : 1;
    const emptyInitial = category === "initial" && filterValue === "";
    if (!emptyInitial && (
      points.length !== expectedLength
      || points.some((point) => /\s/u.test(point))
    )) {
      throw new TypeError("Invalid orthography filter value");
    }
    return { category, value: filterValue };
  }

  function orthographyMatches(value, filter) {
    let normalized;
    try {
      normalized = normalizedOrthographyFilter(filter);
    } catch {
      return false;
    }
    if (!normalized) {
      return true;
    }
    const lemma = String(value ?? "");
    if (normalized.category === "length") {
      return String(codePoints(lemma).length) === normalized.value;
    }
    if (normalized.category === "initial") {
      return (codePoints(lemma.trim())[0] || "") === normalized.value;
    }
    const runs = orthographyRuns(lemma);
    if (normalized.category === "character") {
      return runs.some((run) => run.includes(normalized.value));
    }
    return runs.some((run) => run.some((character, index) => (
      index < run.length - 1
      && `${character}${run[index + 1]}` === normalized.value
    )));
  }

  function incrementDistributionFacet(map, value, occurrenceCount = 1) {
    const key = String(value);
    const current = map.get(key) || { occurrenceCount: 0, entryCount: 0 };
    current.occurrenceCount += occurrenceCount;
    current.entryCount += 1;
    map.set(key, current);
  }

  function frequencyRows(map) {
    return [...map.entries()]
      .sort((left, right) => (
        right[1].occurrenceCount - left[1].occurrenceCount
        || String(left[0]).localeCompare(String(right[0]), "zh-CN")
      ))
      .map(([value, counts]) => ({ value, ...counts }));
  }

  function numericRows(map) {
    return [...map.entries()]
      .sort((left, right) => Number(left[0]) - Number(right[0]))
      .map(([value, counts]) => ({ value, entryCount: counts.entryCount }));
  }

  function buildOrthographyDistribution(records = []) {
    const facets = {
      lengths: new Map(),
      initials: new Map(),
      characters: new Map(),
      bigrams: new Map(),
    };
    let lemmaEntryCount = 0;
    records.forEach((record) => {
      const lemma = String(record?.lemma ?? "");
      if (!lemma) {
        return;
      }
      lemmaEntryCount += 1;
      const analyzed = analyzeOrthography(lemma);
      incrementDistributionFacet(facets.lengths, analyzed.length);
      incrementDistributionFacet(facets.initials, analyzed.initial);
      analyzed.characterCounts.forEach((count, character) => {
        incrementDistributionFacet(facets.characters, character, count);
      });
      analyzed.bigramCounts.forEach((count, bigram) => {
        incrementDistributionFacet(facets.bigrams, bigram, count);
      });
    });
    return {
      lemmaEntryCount,
      wordLengths: numericRows(facets.lengths),
      initials: frequencyRows(facets.initials).map(({ value, entryCount }) => ({ value, entryCount })),
      characters: frequencyRows(facets.characters),
      bigrams: frequencyRows(facets.bigrams),
    };
  }

  return {
    ORTHOGRAPHY_FILTER_CATEGORIES,
    analyzeOrthography,
    buildOrthographyDistribution,
    normalizedOrthographyFilter,
    orthographyMatches,
    orthographyRuns,
  };
});
