#!/usr/bin/env node
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const CHECK_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.CONLEXICON_CHECK_TIMEOUT_MS) || 120000,
);
const CHECK_GROUPS = [
  {
    name: "models",
    scripts: [
      "check-models.js",
      "check-search-normalization.js",
      "check-entry-query-model.js",
      "check-query-page-cache.js",
      "check-http-request-limits.js",
    ],
  },
  {
    name: "sqlite-and-api",
    scripts: [
      "check-sqlite-repository.js",
      "check-sqlite-contract.js",
      "check-query-session-cache.js",
      "check-feature-result-session.js",
      "check-entry-search-consistency.js",
      "check-sqlite-migration.js",
      "check-morphology-acceptance.js",
      "check-default-repository.js",
    ],
  },
];

function runCheck(groupName, scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n[check:${groupName}] ${scriptName}`);
    const child = spawn(process.execPath, [path.join("scripts", scriptName)], {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: "inherit",
    });
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${scriptName} exceeded ${CHECK_TIMEOUT_MS}ms`));
    }, CHECK_TIMEOUT_MS);
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptName} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

async function main() {
  for (const group of CHECK_GROUPS) {
    for (const scriptName of group.scripts) {
      await runCheck(group.name, scriptName);
    }
  }
  console.log("\nAll Conlexicon checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
