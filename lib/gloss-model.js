(function initGlossModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconGloss = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createGlossModel() {
  // Reads the \gla / \glb / \glc / \ft lines of a definition example. Returns
  // null when the example has no gloss lines at all.
  function parseGloss(example) {
    const gloss = { gla: [], glb: [], glc: [], ft: "" };
    let hasGloss = false;
    String(example || "")
      .replaceAll("\\n", "\n")
      .split(/\r?\n/)
      .forEach((line) => {
        const match = line.match(/^\\(gla|glb|glc|ft)\s*(.*)$/);
        if (!match) {
          return;
        }
        hasGloss = true;
        if (match[1] === "ft") {
          gloss.ft = match[2].trim();
        } else {
          gloss[match[1]] = match[2].trim().split(/\s+/).filter(Boolean);
        }
      });
    return hasGloss ? gloss : null;
  }

  return {
    parseGloss,
  };
});
