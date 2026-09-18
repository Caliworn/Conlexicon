(function initSourceReferences(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ConlexiconSourceReferences = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createSourceReferences() {
  function normalizeSourceReferences(sources = [], { allowDuplicateTargets = false } = {}) {
    if (!Array.isArray(sources)) throw new TypeError("Source references must be an array");
    const targets = new Set();
    return orderSourceReferences(sources.map((source) => {
      if (!source || typeof source !== "object" || Array.isArray(source)
        || typeof source.text !== "string" || typeof source.entryId !== "string") {
        throw new TypeError("A source reference requires string entryId and text fields");
      }
      const reference = { entryId: source.entryId.trim(), text: source.text.trim() };
      if (!reference.entryId && !reference.text) throw new TypeError("Empty source reference");
      if (!allowDuplicateTargets && reference.entryId && targets.has(reference.entryId)) {
        const error = new TypeError("Duplicate source target");
        error.code = "duplicate_source_target";
        throw error;
      }
      if (reference.entryId) targets.add(reference.entryId);
      return reference;
    }));
  }

  function orderSourceReferences(sources = []) {
    return [...sources.filter((source) => source.entryId), ...sources.filter((source) => !source.entryId)];
  }

  function sourceReferenceText(source, entries = []) {
    const target = source.entryId && entries.find((entry) => entry.id === source.entryId);
    return target ? target.lemma || target.id : source.text;
  }

  return { normalizeSourceReferences, sourceReferenceText, orderSourceReferences };
});
