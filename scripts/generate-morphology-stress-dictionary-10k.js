#!/usr/bin/env node
process.env.CONLEXICON_STRESS_MORPHOLOGY = "1";
process.env.CONLEXICON_STRESS_DICTIONARY_ID = "dict-7a4f7f2b-71dd-4c9f-8d3f-7bb391000001";

require("./generate-stress-dictionary-10k");
