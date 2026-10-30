(function initIpaModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconIpa = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createIpaModel() {
  const IPA_STRESS_MARKER = "\uE000";
  const DEFAULT_IPA_VOWELS = Object.freeze(["a", "e", "i", "o", "u"]);
  const DEFAULT_IPA_KEYBOARD = Object.freeze(["ˈ", "ˌ", "͡"]);
  const TONE_LETTERS = "\\u02E5-\\u02E9\\uA708-\\uA716";
  const LAST_TONE_LETTER = new RegExp(`[${TONE_LETTERS}][^${TONE_LETTERS}]*$`, "u");
  const TONE_LETTER_RUN = new RegExp(`[${TONE_LETTERS}]+`, "uy");

  function splitSymbolList(value) {
    return String(value || "")
      .split(/[\s,，、]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeIpaKeyboard(symbols) {
    const parsed = Array.isArray(symbols)
      ? symbols.map(String)
      : splitSymbolList(symbols);
    const unique = [];
    parsed
      .map((symbol) => symbol.trim())
      .filter(Boolean)
      .forEach((symbol) => {
        if (!unique.includes(symbol)) {
          unique.push(symbol);
        }
      });
    return unique.length ? unique : [...DEFAULT_IPA_KEYBOARD];
  }

  function normalizeIpaSettings(ipa = {}) {
    const defaultStress = Number.parseInt(ipa.defaultStress, 10);
    const mappings = normalizeIpaRuleList(ipa.mappings);
    return {
      mappings,
      syllable: {
        vowels: normalizeVowelList(ipa.syllable?.vowels),
        separator: ipa.syllable?.separator || ".",
        onsetClusters: normalizeClusterList(ipa.syllable?.onsetClusters),
        codaClusters: normalizeClusterList(ipa.syllable?.codaClusters),
        complexPhonemes: normalizeClusterList(ipa.syllable?.complexPhonemes),
      },
      defaultStress: Number.isInteger(defaultStress) ? defaultStress : -2,
      unstressMonosyllables: ipa.unstressMonosyllables !== false,
    };
  }

  function uniqueSymbols(value) {
    return [...new Set((Array.isArray(value) ? value : [value]).flatMap(splitSymbolList))];
  }

  function normalizeVowelList(value) {
    const vowels = uniqueSymbols(value);
    return vowels.length ? vowels : [...DEFAULT_IPA_VOWELS];
  }

  function normalizeClusterList(value) {
    return uniqueSymbols(value).sort((a, b) => b.length - a.length);
  }

  function phonemeUnits(syllableSettings = {}) {
    const multiCharacterVowels = normalizeVowelList(syllableSettings.vowels).filter((vowel) => vowel.length > 1);
    return normalizeClusterList([...multiCharacterVowels, ...uniqueSymbols(syllableSettings.complexPhonemes)]);
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
    return `/${joinSyllables(syllables, ipa.syllable.separator, stressIndex)}/`;
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
    const separator = ipa.syllable.separator;
    return {
      mapped: displayIpaStage(mapped),
      syllables: joinSyllables(syllables, separator),
      final: `/${joinSyllables(syllables, separator, stressIndex)}/`,
    };
  }

  function joinSyllables(syllables, separator, stressIndex = null) {
    return syllables
      .map((syllable, index) => {
        const stressed = index === stressIndex ? `ˈ${syllable}` : syllable;
        const atWordEnd = index === syllables.length - 1 || /\s$/.test(syllable);
        return atWordEnd ? stressed : `${stressed}${separator}`;
      })
      .join("");
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
    const text = String(value || "").replaceAll("ˈ", "");
    if (!text) {
      return [""];
    }
    const settings = { ...syllableSettings, complexPhonemes: phonemeUnits(syllableSettings) };
    // Whitespace is a word boundary. It stays on the last syllable of its word,
    // so the syllables still join back into the text.
    return text.match(/\S+\s*|\s+/g).flatMap((chunk) => {
      const word = chunk.trimEnd();
      if (!word) {
        return [chunk];
      }
      const syllables = splitWordIntoSyllables(word, settings);
      syllables[syllables.length - 1] += chunk.slice(word.length);
      return syllables;
    });
  }

  function splitWordIntoSyllables(text, syllableSettings) {
    const separator = syllableSettings.separator || ".";
    if (separator && text.includes(separator)) {
      return text.split(separator).filter(Boolean);
    }

    const vowels = new Set(normalizeVowelList(syllableSettings.vowels));
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
      const betweenStart = currentVowel.end + afterLastToneLetter(text.slice(currentVowel.end, nextVowel.start));
      const between = text.slice(betweenStart, nextVowel.start);
      const codaCluster = matchingCodaCluster(between, syllableSettings);
      const onsetCluster = matchingOnsetCluster(between, syllableSettings);
      const breakAt = codaCluster
        ? betweenStart + codaCluster.length
        : onsetCluster
          ? nextVowel.start - onsetCluster.length
          : middleTokenBreak(betweenStart, between, syllableSettings.complexPhonemes);
      syllables.push(text.slice(start, breakAt));
      start = breakAt;
    });
    syllables.push(text.slice(start));
    return syllables.filter(Boolean);
  }

  function afterLastToneLetter(value) {
    return value.search(LAST_TONE_LETTER) + 1;
  }

  function tokenizePhonemeUnits(value, complexPhonemes = []) {
    const phonemes = normalizeClusterList(complexPhonemes);
    const text = String(value || "");
    const tokens = [];
    let index = 0;

    while (index < text.length) {
      TONE_LETTER_RUN.lastIndex = index;
      const phoneme = TONE_LETTER_RUN.exec(text)?.[0]
        || phonemes.find((candidate) => text.startsWith(candidate, index));
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
    normalizeVowelList,
    phonemeUnits,
    resolveIpaStressIndex,
    ruleMatchesAt,
    splitIntoSyllables,
    splitSymbolList,
    syllabifyIpaOutput,
    tokenizePhonemeUnits,
  };
});
