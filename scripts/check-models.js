const assert = require("node:assert/strict");
const analysisModel = require("../lib/analysis-model");
const { checkModelNormalization } = require("./repository-contract");

checkModelNormalization();
assert.deepEqual(analysisModel.analysisSliceDepsForPage("overview"), []);
assert.deepEqual(analysisModel.analysisSliceDepsForPage("entries", "tags"), ["tags"]);
assert.deepEqual(analysisModel.analysisSliceDepsForPage("entries", "forms"), ["forms"]);
assert.deepEqual(analysisModel.analysisSliceDepsForPage("entries", "roots"), ["rootFamilies"]);
assert.deepEqual(analysisModel.analysisSliceDepsForPage("activity"), []);
console.log("Model and legacy JSON conversion checks passed.");
