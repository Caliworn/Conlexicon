(function initIpaModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconIpa = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createIpaModel() {
  const IPA_STRESS_MARKER = "\uE000";

  function splitKeyboardSymbols(value) {
    return String(value || "")
      .split(/[\s,，、]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeIpaKeyboard(symbols) {
    const parsed = Array.isArray(symbols)
      ? symbols.map(String)
      : splitKeyboardSymbols(symbols || "ˈ ˌ");
    const unique = [];
    parsed
      .map((symbol) => symbol.trim())
      .filter(Boolean)
      .forEach((symbol) => {
        if (!unique.includes(symbol)) {
          unique.push(symbol);
        }
      });
    return unique.length ? unique : ["ˈ", "ˌ"];
  }

  function normalizeIpaSettings(ipa = {}) {
    const defaultStress = Number.parseInt(ipa.defaultStress, 10);
    const mappings = normalizeIpaRuleList(ipa.mappings);
    return {
      mappings,
      syllable: {
        vowels: ipa.syllable?.vowels || "aeiouAEIOU",
        separator: ipa.syllable?.separator || ".",
        onsetClusters: normalizeClusterList(ipa.syllable?.onsetClusters),
        codaClusters: normalizeClusterList(ipa.syllable?.codaClusters),
        complexPhonemes: normalizeClusterList(ipa.syllable?.complexPhonemes),
      },
      defaultStress: Number.isInteger(defaultStress) ? defaultStress : -2,
      unstressMonosyllables: ipa.unstressMonosyllables !== false,
    };
  }

  function normalizeClusterList(value) {
    const clusters = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
    return [...new Set(clusters.map((cluster) => String(cluster).trim()).filter(Boolean))]
      .sort((a, b) => b.length - a.length);
  }

  function normalizeOnsetClusters(value) {
    return normalizeClusterList(value);
  }

  function hasStressOutput(value) {
    const output = String(value || "");
    return output.startsWith("'") || output.includes("ˈ") || output.includes(IPA_STRESS_MARKER);
  }

  function normalizeIpaRuleList(rules) {
    return Array.isArray(rules)
      ? rules.map((rule) => normalizeIpaRule(rule)).filter((rule) => rule.from || rule.to || rule.before || rule.after)
      : [];
  }

  function normalizeIpaRule(rule = {}) {
    return {
      from: String(rule.from || ""),
      to: String(rule.to || ""),
      before: String(rule.before || ""),
      after: String(rule.after || ""),
    };
  }

  function generateIpaFromLemma(lemma, ipaSettings = {}) {
    const ipa = normalizeIpaSettings(ipaSettings);
    const source = String(lemma || "").trim();
    if (!source) {
      return "";
    }

    const mapped = applyIpaMappings(source, ipa);
    const syllabified = syllabifyIpaOutput(mapped.output, ipa.syllable);
    const syllables = syllabified.syllables;
    const stressIndex = resolveIpaStressIndex(syllables, syllabified.stressIndex, ipa);
    const separator = ipa.syllable.separator || ".";
    const body = syllables
      .map((syllable, index) => (index === stressIndex ? `ˈ${syllable}` : syllable))
      .join(separator);
    return `/${body}/`;
  }

  function ipaPipelinePreview(source, ipaSettings = {}) {
    const ipa = normalizeIpaSettings(ipaSettings);
    const input = String(source || "").trim();
    if (!input) {
      return { mapped: "", syllables: "", final: "" };
    }

    const mapped = applyIpaMappings(input, ipa).output;
    const syllabified = syllabifyIpaOutput(mapped, ipa.syllable);
    const syllables = syllabified.syllables;
    const stressIndex = resolveIpaStressIndex(syllables, syllabified.stressIndex, ipa);
    const separator = ipa.syllable.separator || ".";
    const syllableText = syllables.join(separator);
    const finalBody = syllables
      .map((syllable, index) => (index === stressIndex ? `ˈ${syllable}` : syllable))
      .join(separator);
    return {
      mapped: displayIpaStage(mapped),
      syllables: syllableText,
      final: `/${finalBody}/`,
    };
  }

  function displayIpaStage(value) {
    return String(value || "").replaceAll(IPA_STRESS_MARKER, "ˈ");
  }

  function applyIpaMappings(source, ipaSettings = {}) {
    const ipa = normalizeIpaSettings(ipaSettings);
    const rules = ipa.mappings.filter((rule) => rule.from);

    const chunks = [];
    let index = 0;

    while (index < source.length) {
      const rule = rules.find((candidate) => ruleMatchesAt(source, index, candidate));
      if (!rule) {
        chunks.push(source[index]);
        index += 1;
        continue;
      }

      const rawOutput = rule.to || rule.from;
      const markedOutput = rawOutput.startsWith("'")
        ? `${IPA_STRESS_MARKER}${rawOutput.slice(1)}`
        : rawOutput.replaceAll("ˈ", IPA_STRESS_MARKER);
      chunks.push(markedOutput);
      index += rule.from.length;
    }

    return { output: chunks.join("") };
  }

  function ruleMatchesAt(source, index, rule) {
    if (!source.startsWith(rule.from, index)) {
      return false;
    }
    const before = source.slice(0, index);
    const after = source.slice(index + rule.from.length);
    return conditionMatches(before, rule.before, true) && conditionMatches(after, rule.after, false);
  }

  function conditionMatches(value, condition, matchEnd) {
    if (!condition) {
      return true;
    }
    try {
      const pattern = matchEnd ? `${condition}$` : `^${condition}`;
      return new RegExp(pattern).test(value);
    } catch {
      return matchEnd ? value.endsWith(condition) : value.startsWith(condition);
    }
  }

  function splitIntoSyllables(value, syllableSettings = {}) {
    const separator = syllableSettings.separator || ".";
    const text = String(value || "").replaceAll("ˈ", "");
    if (!text) {
      return [""];
    }
    if (separator && text.includes(separator)) {
      return text.split(separator).filter(Boolean);
    }

    const vowels = new Set(Array.from(String(syllableSettings.vowels || "aeiouAEIOU")));
    const tokens = tokenizePhonemeUnits(text, syllableSettings.complexPhonemes);
    const vowelTokenIndexes = tokens.reduce((positions, token, index) => {
      if (vowels.has(token.value)) {
        positions.push(index);
      }
      return positions;
    }, []);
    if (vowelTokenIndexes.length <= 1) {
      return [text];
    }

    const syllables = [];
    let start = 0;
    vowelTokenIndexes.forEach((tokenIndex, index) => {
      if (index === vowelTokenIndexes.length - 1) {
        return;
      }
      const currentVowel = tokens[tokenIndex];
      const nextVowel = tokens[vowelTokenIndexes[index + 1]];
      const between = text.slice(currentVowel.end, nextVowel.start);
      const codaCluster = matchingCodaCluster(between, syllableSettings);
      const onsetCluster = matchingOnsetCluster(between, syllableSettings);
      const breakAt = codaCluster
        ? currentVowel.end + codaCluster.length
        : onsetCluster
          ? nextVowel.start - onsetCluster.length
          : middleTokenBreak(currentVowel.end, between, syllableSettings.complexPhonemes);
      syllables.push(text.slice(start, breakAt));
      start = breakAt;
    });
    syllables.push(text.slice(start));
    return syllables.filter(Boolean);
  }

  function tokenizePhonemeUnits(value, complexPhonemes = []) {
    const phonemes = normalizeClusterList(complexPhonemes);
    const text = String(value || "");
    const tokens = [];
    let index = 0;

    while (index < text.length) {
      const phoneme = phonemes.find((candidate) => text.startsWith(candidate, index));
      if (phoneme) {
        tokens.push({ value: phoneme, start: index, end: index + phoneme.length });
        index += phoneme.length;
        continue;
      }

      const char = Array.from(text.slice(index))[0];
      tokens.push({ value: char, start: index, end: index + char.length });
      index += char.length;
    }

    return tokens;
  }

  function tokenBoundaryPrefixes(tokens) {
    const prefixes = [];
    let value = "";
    tokens.forEach((token) => {
      value += token.value;
      prefixes.push(value);
    });
    return prefixes;
  }

  function tokenBoundarySuffixes(tokens) {
    const suffixes = [];
    let value = "";
    [...tokens].reverse().forEach((token) => {
      value = `${token.value}${value}`;
      suffixes.push(value);
    });
    return suffixes;
  }

  function matchingCodaCluster(between, syllableSettings = {}) {
    const tokens = tokenizePhonemeUnits(between, syllableSettings.complexPhonemes);
    const prefixes = tokenBoundaryPrefixes(tokens);
    return normalizeClusterList(syllableSettings.codaClusters).find((cluster) => prefixes.includes(cluster)) || "";
  }

  function matchingOnsetCluster(between, syllableSettings = {}) {
    const tokens = tokenizePhonemeUnits(between, syllableSettings.complexPhonemes);
    const suffixes = tokenBoundarySuffixes(tokens);
    return normalizeClusterList(syllableSettings.onsetClusters).find((cluster) => suffixes.includes(cluster)) || "";
  }

  function middleTokenBreak(start, between, complexPhonemes = []) {
    const tokens = tokenizePhonemeUnits(between, complexPhonemes);
    const codaTokenCount = Math.floor(tokens.length / 2);
    const codaLength = tokens
      .slice(0, codaTokenCount)
      .reduce((length, token) => length + token.value.length, 0);
    return start + codaLength;
  }

  function syllabifyIpaOutput(value, syllableSettings = {}) {
    const text = String(value || "");
    let markerIndex = null;
    let cleanIndex = 0;
    let cleanText = "";

    for (const char of text) {
      if (char === IPA_STRESS_MARKER) {
        if (markerIndex === null) {
          markerIndex = cleanIndex;
        }
        continue;
      }
      cleanText += char;
      cleanIndex += 1;
    }

    const syllables = splitIntoSyllables(cleanText, syllableSettings);
    if (markerIndex === null) {
      return { syllables, stressIndex: null };
    }

    let offset = 0;
    const stressIndex = syllables.findIndex((syllable) => {
      const nextOffset = offset + syllable.length;
      const contains = markerIndex < nextOffset;
      offset = nextOffset;
      return contains;
    });
    return {
      syllables,
      stressIndex: stressIndex >= 0 ? stressIndex : Math.max(0, syllables.length - 1),
    };
  }

  function defaultStressIndex(length, defaultStress) {
    if (length <= 0) {
      return null;
    }
    if (defaultStress === 0) {
      return null;
    }
    if (defaultStress > 0) {
      return Math.min(defaultStress - 1, length - 1);
    }
    return Math.max(length + defaultStress, 0);
  }

  function resolveIpaStressIndex(syllables, explicitStressIndex, ipaSettings = normalizeIpaSettings()) {
    const ipa = normalizeIpaSettings(ipaSettings);
    const length = syllables.length;
    if (length <= 0 || (ipa.unstressMonosyllables && length === 1)) {
      return null;
    }
    return explicitStressIndex ?? defaultStressIndex(length, ipa.defaultStress);
  }

  function cleanIpaText(value) {
    return String(value || "")
      .replace(/[\/\[\]]/g, "")
      .replace(/[ˈˌ]/g, "")
      .trim();
  }

  function normalizeIpaCompare(value) {
    return cleanIpaText(value).replace(/\s+/g, "");
  }

  function countPrimaryStressMarks(value) {
    return [...String(value || "")].filter((char) => char === "ˈ" || char === IPA_STRESS_MARKER).length;
  }

  return {
    IPA_STRESS_MARKER,
    applyIpaMappings,
    cleanIpaText,
    conditionMatches,
    countPrimaryStressMarks,
    defaultStressIndex,
    displayIpaStage,
    generateIpaFromLemma,
    hasStressOutput,
    ipaPipelinePreview,
    matchingCodaCluster,
    matchingOnsetCluster,
    middleTokenBreak,
    normalizeClusterList,
    normalizeIpaCompare,
    normalizeIpaKeyboard,
    normalizeIpaRule,
    normalizeIpaRuleList,
    normalizeIpaSettings,
    normalizeOnsetClusters,
    resolveIpaStressIndex,
    ruleMatchesAt,
    splitIntoSyllables,
    splitKeyboardSymbols,
    syllabifyIpaOutput,
    tokenizePhonemeUnits,
  };
});
