const ipaModel = require("./ipa-model");

const SIMPLE_IPA_ENGINE_ID = "conlexicon-simple-ipa";
const SIMPLE_IPA_ENGINE_VERSION = "1";

function createSimpleIpaEngine(model = ipaModel) {
  return {
    id: SIMPLE_IPA_ENGINE_ID,
    version: SIMPLE_IPA_ENGINE_VERSION,

    generate({ input = {}, profile = {} } = {}) {
      const value = model.generateIpaFromLemma(
        input.orthography,
        profile.ipaSettings,
      );
      return {
        status: String(value || "").trim() ? "generated" : "unavailable",
        primary: String(value || ""),
        alternatives: [],
        diagnostics: [],
      };
    },

    compare({ generated, observed } = {}) {
      const generatedText = String(generated || "");
      const observedText = String(observed || "");
      return {
        exact: generatedText === observedText,
        equivalent: model.normalizeIpaCompare(generatedText) === model.normalizeIpaCompare(observedText),
      };
    },
  };
}

module.exports = {
  SIMPLE_IPA_ENGINE_ID,
  SIMPLE_IPA_ENGINE_VERSION,
  createSimpleIpaEngine,
};
