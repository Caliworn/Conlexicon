(function initSearchNormalizationModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconSearchNormalization = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createSearchNormalizationModel() {
  const DEFAULT_NORMALIZATION_LOCALE = "zh-CN";
  const DEFAULT_CONFIGURED_SEARCH_NORMALIZATION = Object.freeze({
    unicodeNormalization: "none",
    caseFolding: false,
    customRules: Object.freeze([]),
  });

  // Full (C/F, non-Turkic) Unicode CaseFolding-17.0.0 mappings that differ
  // from JavaScript's ordinary toLowerCase(). All other scalar values can use
  // the host's Unicode lowercase mapping directly. This keeps the browser and
  // Node implementation compact while covering multi-character folds such as
  // ß → ss and contextual folds such as final sigma → sigma.
  const CASE_FOLD_OVERRIDES = Object.freeze({"µ":"μ","ß":"ss","ŉ":"ʼn","ſ":"s","ǰ":"ǰ","ͅ":"ι","ΐ":"ΐ","ΰ":"ΰ","ς":"σ","ϐ":"β","ϑ":"θ","ϕ":"φ","ϖ":"π","ϰ":"κ","ϱ":"ρ","ϵ":"ε","և":"եւ","ᏸ":"Ᏸ","ᏹ":"Ᏹ","ᏺ":"Ᏺ","ᏻ":"Ᏻ","ᏼ":"Ᏼ","ᏽ":"Ᏽ","ᲀ":"в","ᲁ":"д","ᲂ":"о","ᲃ":"с","ᲄ":"т","ᲅ":"т","ᲆ":"ъ","ᲇ":"ѣ","ᲈ":"ꙋ","ẖ":"ẖ","ẗ":"ẗ","ẘ":"ẘ","ẙ":"ẙ","ẚ":"aʾ","ẛ":"ṡ","ẞ":"ss","ὐ":"ὐ","ὒ":"ὒ","ὔ":"ὔ","ὖ":"ὖ","ᾀ":"ἀι","ᾁ":"ἁι","ᾂ":"ἂι","ᾃ":"ἃι","ᾄ":"ἄι","ᾅ":"ἅι","ᾆ":"ἆι","ᾇ":"ἇι","ᾈ":"ἀι","ᾉ":"ἁι","ᾊ":"ἂι","ᾋ":"ἃι","ᾌ":"ἄι","ᾍ":"ἅι","ᾎ":"ἆι","ᾏ":"ἇι","ᾐ":"ἠι","ᾑ":"ἡι","ᾒ":"ἢι","ᾓ":"ἣι","ᾔ":"ἤι","ᾕ":"ἥι","ᾖ":"ἦι","ᾗ":"ἧι","ᾘ":"ἠι","ᾙ":"ἡι","ᾚ":"ἢι","ᾛ":"ἣι","ᾜ":"ἤι","ᾝ":"ἥι","ᾞ":"ἦι","ᾟ":"ἧι","ᾠ":"ὠι","ᾡ":"ὡι","ᾢ":"ὢι","ᾣ":"ὣι","ᾤ":"ὤι","ᾥ":"ὥι","ᾦ":"ὦι","ᾧ":"ὧι","ᾨ":"ὠι","ᾩ":"ὡι","ᾪ":"ὢι","ᾫ":"ὣι","ᾬ":"ὤι","ᾭ":"ὥι","ᾮ":"ὦι","ᾯ":"ὧι","ᾲ":"ὰι","ᾳ":"αι","ᾴ":"άι","ᾶ":"ᾶ","ᾷ":"ᾶι","ᾼ":"αι","ι":"ι","ῂ":"ὴι","ῃ":"ηι","ῄ":"ήι","ῆ":"ῆ","ῇ":"ῆι","ῌ":"ηι","ῒ":"ῒ","ΐ":"ΐ","ῖ":"ῖ","ῗ":"ῗ","ῢ":"ῢ","ΰ":"ΰ","ῤ":"ῤ","ῦ":"ῦ","ῧ":"ῧ","ῲ":"ὼι","ῳ":"ωι","ῴ":"ώι","ῶ":"ῶ","ῷ":"ῶι","ῼ":"ωι","ꭰ":"Ꭰ","ꭱ":"Ꭱ","ꭲ":"Ꭲ","ꭳ":"Ꭳ","ꭴ":"Ꭴ","ꭵ":"Ꭵ","ꭶ":"Ꭶ","ꭷ":"Ꭷ","ꭸ":"Ꭸ","ꭹ":"Ꭹ","ꭺ":"Ꭺ","ꭻ":"Ꭻ","ꭼ":"Ꭼ","ꭽ":"Ꭽ","ꭾ":"Ꭾ","ꭿ":"Ꭿ","ꮀ":"Ꮀ","ꮁ":"Ꮁ","ꮂ":"Ꮂ","ꮃ":"Ꮃ","ꮄ":"Ꮄ","ꮅ":"Ꮅ","ꮆ":"Ꮆ","ꮇ":"Ꮇ","ꮈ":"Ꮈ","ꮉ":"Ꮉ","ꮊ":"Ꮊ","ꮋ":"Ꮋ","ꮌ":"Ꮌ","ꮍ":"Ꮍ","ꮎ":"Ꮎ","ꮏ":"Ꮏ","ꮐ":"Ꮐ","ꮑ":"Ꮑ","ꮒ":"Ꮒ","ꮓ":"Ꮓ","ꮔ":"Ꮔ","ꮕ":"Ꮕ","ꮖ":"Ꮖ","ꮗ":"Ꮗ","ꮘ":"Ꮘ","ꮙ":"Ꮙ","ꮚ":"Ꮚ","ꮛ":"Ꮛ","ꮜ":"Ꮜ","ꮝ":"Ꮝ","ꮞ":"Ꮞ","ꮟ":"Ꮟ","ꮠ":"Ꮠ","ꮡ":"Ꮡ","ꮢ":"Ꮢ","ꮣ":"Ꮣ","ꮤ":"Ꮤ","ꮥ":"Ꮥ","ꮦ":"Ꮦ","ꮧ":"Ꮧ","ꮨ":"Ꮨ","ꮩ":"Ꮩ","ꮪ":"Ꮪ","ꮫ":"Ꮫ","ꮬ":"Ꮬ","ꮭ":"Ꮭ","ꮮ":"Ꮮ","ꮯ":"Ꮯ","ꮰ":"Ꮰ","ꮱ":"Ꮱ","ꮲ":"Ꮲ","ꮳ":"Ꮳ","ꮴ":"Ꮴ","ꮵ":"Ꮵ","ꮶ":"Ꮶ","ꮷ":"Ꮷ","ꮸ":"Ꮸ","ꮹ":"Ꮹ","ꮺ":"Ꮺ","ꮻ":"Ꮻ","ꮼ":"Ꮼ","ꮽ":"Ꮽ","ꮾ":"Ꮾ","ꮿ":"Ꮿ","ﬀ":"ff","ﬁ":"fi","ﬂ":"fl","ﬃ":"ffi","ﬄ":"ffl","ﬅ":"st","ﬆ":"st","ﬓ":"մն","ﬔ":"մե","ﬕ":"մի","ﬖ":"վն","ﬗ":"մխ"});

  function stringValue(value) {
    return String(value ?? "");
  }

  // Relation and quality helpers use this locale-lower baseline.
  // Configurable free-text search uses createConfiguredSearchNormalizer().
  function normalizeText(value, locale = DEFAULT_NORMALIZATION_LOCALE) {
    return String(value || "").trim().toLocaleLowerCase(locale);
  }

  function normalizeSearchText(value, options = {}) {
    return normalizeText(value, options.locale || DEFAULT_NORMALIZATION_LOCALE);
  }

  function normalizeStructuralKey(value) {
    return String(value || "").trim();
  }

  function normalizeConfiguredSearchOptions(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const unicodeNormalization = String(source.unicodeNormalization || "none").toLowerCase();
    return {
      unicodeNormalization: unicodeNormalization === "nfc" ? "nfc" : "none",
      caseFolding: Boolean(source.caseFolding),
      customRules: Array.isArray(source.customRules) ? source.customRules : [],
    };
  }

  function unicodeDefaultCaseFold(value) {
    return Array.from(stringValue(value))
      .map((character) => CASE_FOLD_OVERRIDES[character] ?? character.toLowerCase())
      .join("");
  }

  function normalizeConfiguredSearchBase(value, options = {}) {
    const config = normalizeConfiguredSearchOptions(options);
    let normalized = stringValue(value).trim();
    if (config.unicodeNormalization === "nfc") {
      normalized = normalized.normalize("NFC");
    }
    return config.caseFolding ? unicodeDefaultCaseFold(normalized) : normalized;
  }

  function normalizeConfiguredSearchSegment(value, config) {
    let normalized = stringValue(value);
    if (config.unicodeNormalization === "nfc") {
      normalized = normalized.normalize("NFC");
    }
    return config.caseFolding ? unicodeDefaultCaseFold(normalized) : normalized;
  }

  function compileCustomSearchRules(value = [], options = {}) {
    const rules = Array.isArray(value) ? value : [];
    const variants = new Map();
    const errors = [];

    rules.forEach((rule, index) => {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
        errors.push({ index, code: "invalid_rule" });
        return;
      }
      if (typeof rule.canonical !== "string") {
        errors.push({ index, code: "invalid_canonical" });
        return;
      }
      if (!Array.isArray(rule.variants)) {
        errors.push({ index, code: "invalid_variants" });
        return;
      }
      if (!rule.variants.length) {
        errors.push({ index, code: "empty_variants" });
        return;
      }

      const canonical = normalizeConfiguredSearchBase(rule.canonical, options);
      if (!canonical) {
        errors.push({ index, code: "empty_canonical" });
        return;
      }

      rule.variants.forEach((variant, variantIndex) => {
        if (typeof variant !== "string") {
          errors.push({ index, variantIndex, code: "invalid_variant" });
          return;
        }
        const normalizedVariant = normalizeConfiguredSearchBase(variant, options);
        if (!normalizedVariant) {
          errors.push({ index, variantIndex, code: "empty_variant" });
          return;
        }
        const existing = variants.get(normalizedVariant);
        if (existing && existing !== canonical) {
          errors.push({ index, variantIndex, code: "conflicting_variant", variant: normalizedVariant });
          return;
        }
        variants.set(normalizedVariant, canonical);
      });
    });

    return {
      errors,
      rules: [...variants.entries()]
        .map(([variant, canonical]) => ({ variant, canonical }))
        .sort((left, right) => right.variant.length - left.variant.length || left.variant.localeCompare(right.variant)),
      valid: !errors.length,
    };
  }

  function applyCompiledCustomSearchRules(value, compiledRules) {
    const rules = compiledRules?.valid ? compiledRules.rules : [];
    if (!rules.length) {
      return value;
    }
    let cursor = 0;
    let normalized = "";
    while (cursor < value.length) {
      const matched = rules.find((rule) => value.startsWith(rule.variant, cursor));
      if (matched) {
        normalized += matched.canonical;
        cursor += matched.variant.length;
        continue;
      }
      const character = String.fromCodePoint(value.codePointAt(cursor));
      normalized += character;
      cursor += character.length;
    }
    return normalized;
  }

  function normalizeConfiguredSearchText(value, options = {}) {
    const config = normalizeConfiguredSearchOptions(options);
    const base = normalizeConfiguredSearchBase(value, config);
    const compiledRules = options.compiledRules || compileCustomSearchRules(config.customRules, config);
    return applyCompiledCustomSearchRules(base, compiledRules);
  }

  function configuredSearchTextWithMap(value, options = {}, compiledRules = null) {
    const config = normalizeConfiguredSearchOptions(options);
    const source = stringValue(value);
    const leading = source.length - source.trimStart().length;
    const trimmed = source.trim();
    const segments = typeof Intl !== "undefined" && Intl.Segmenter
      ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)]
        .map((item) => ({ text: item.segment, index: item.index }))
      : Array.from(trimmed).map((text, index, values) => ({
        text,
        index: values.slice(0, index).join("").length,
      }));
    let normalized = "";
    let map = [];
    segments.forEach((segment) => {
      const start = leading + segment.index;
      const end = start + segment.text.length;
      const output = normalizeConfiguredSearchSegment(segment.text, config);
      normalized += output;
      map.push(...Array.from({ length: output.length }, () => ({ start, end })));
    });

    const compiled = compiledRules || compileCustomSearchRules(config.customRules, config);
    if (!compiled.valid || !compiled.rules.length) {
      return { text: normalized, map };
    }
    let cursor = 0;
    let output = "";
    const outputMap = [];
    while (cursor < normalized.length) {
      const matched = compiled.rules.find((rule) => normalized.startsWith(rule.variant, cursor));
      if (!matched) {
        const character = String.fromCodePoint(normalized.codePointAt(cursor));
        output += character;
        outputMap.push(...map.slice(cursor, cursor + character.length));
        cursor += character.length;
        continue;
      }
      const covered = map.slice(cursor, cursor + matched.variant.length);
      const start = Math.min(...covered.map((item) => item.start));
      const end = Math.max(...covered.map((item) => item.end));
      output += matched.canonical;
      outputMap.push(...Array.from({ length: matched.canonical.length }, () => ({ start, end })));
      cursor += matched.variant.length;
    }
    return { text: output, map: outputMap };
  }

  function createConfiguredSearchNormalizer(options = {}) {
    const config = normalizeConfiguredSearchOptions(options);
    const compiledRules = compileCustomSearchRules(config.customRules, config);
    return {
      config,
      compiledRules,
      errors: compiledRules.errors,
      normalize: (value) => applyCompiledCustomSearchRules(
        normalizeConfiguredSearchBase(value, config),
        compiledRules,
      ),
      normalizeWithMap: (value) => configuredSearchTextWithMap(value, config, compiledRules),
    };
  }

  function createSearchNormalizer(options = {}) {
    return (value) => normalizeSearchText(value, options);
  }

  return {
    CASE_FOLD_OVERRIDES,
    DEFAULT_CONFIGURED_SEARCH_NORMALIZATION,
    DEFAULT_NORMALIZATION_LOCALE,
    applyCompiledCustomSearchRules,
    compileCustomSearchRules,
    configuredSearchTextWithMap,
    createConfiguredSearchNormalizer,
    createSearchNormalizer,
    normalizeConfiguredSearchBase,
    normalizeConfiguredSearchOptions,
    normalizeConfiguredSearchText,
    normalizeSearchText,
    normalizeStructuralKey,
    normalizeText,
    unicodeDefaultCaseFold,
  };
});
