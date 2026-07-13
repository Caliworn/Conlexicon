(function initSearchNormalizationModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconSearchNormalization = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createSearchNormalizationModel() {
  const DEFAULT_NORMALIZATION_LOCALE = "zh-CN";

  // This is deliberately the current compatibility baseline: trim outer
  // whitespace, then lowercase with the supplied locale. Future NFC and full
  // Unicode case-folding policy must be added here, not reimplemented by
  // callers.
  function normalizeText(value, locale = DEFAULT_NORMALIZATION_LOCALE) {
    return String(value || "").trim().toLocaleLowerCase(locale);
  }

  function normalizeSearchText(value, options = {}) {
    return normalizeText(value, options.locale || DEFAULT_NORMALIZATION_LOCALE);
  }

  function normalizeStructuralKey(value) {
    return String(value || "").trim();
  }

  function createSearchNormalizer(options = {}) {
    return (value) => normalizeSearchText(value, options);
  }

  return {
    DEFAULT_NORMALIZATION_LOCALE,
    createSearchNormalizer,
    normalizeSearchText,
    normalizeStructuralKey,
    normalizeText,
  };
});
