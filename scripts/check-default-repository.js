const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

function randomPort() {
  return 43000 + Math.floor(Math.random() * 10000);
}

function requestJson(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({
            status: response.statusCode,
            body: text ? JSON.parse(text) : null,
          });
        } catch (error) {
          reject(new Error(`Invalid JSON response from ${method} ${pathname}: ${text}\n${error.message}`));
        }
      });
    });
    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

function startServer({ dataDir, port, repositoryMode }) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      CONLEXICON_DATA_DIR: dataDir,
      PORT: String(port),
    };
    if (repositoryMode) {
      env.CONLEXICON_REPOSITORY = repositoryMode;
    } else {
      delete env.CONLEXICON_REPOSITORY;
    }

    const child = spawn(process.execPath, ["server.js"], {
      cwd: ROOT_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      stopServer(child).finally(() => {
        reject(new Error(`Server did not start on port ${port}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      });
    }, 8000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (!settled && stdout.includes(`http://localhost:${port}`)) {
        settled = true;
        clearTimeout(timeout);
        resolve({ child, stdout: () => stdout, stderr: () => stderr });
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Server exited before startup. code=${code} signal=${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function withTempDataDir(prefix, fn) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(dataDir);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function checkServerMode({ label, repositoryMode, expectedMode, expectedExtension }) {
  await withTempDataDir(`conlexicon-${label}-repo-`, async (dataDir) => {
    const port = randomPort();
    const server = await startServer({ dataDir, port, repositoryMode });
    try {
      assert.match(server.stdout(), new RegExp(`\\(${expectedMode} repository\\)`));

      let response = await requestJson(port, "GET", "/api/state");
      assert.equal(response.status, 200);
      assert.equal(response.body.activeDictionaryId, "");
      assert.deepEqual(response.body.dictionaries, []);

      response = await requestJson(port, "POST", "/api/dictionaries", {
        name: `${expectedMode} default check`,
        language: "test",
        description: "created by scripts/check-default-repository.js",
      });
      assert.equal(response.status, 201);
      assert.ok(response.body.id);

      const dictionaryPath = path.join(dataDir, "dictionaries", `${response.body.id}.${expectedExtension}`);
      await fs.access(dictionaryPath);

      response = await requestJson(port, "GET", "/api/state");
      assert.equal(response.status, 200);
      assert.equal(response.body.activeDictionaryId, response.body.dictionaries[0].id);
      assert.equal(response.body.dictionaries[0].id, response.body.activeDictionaryId);
    } finally {
      await stopServer(server.child);
    }
  });
}

async function main() {
  await checkServerMode({
    label: "default-sqlite",
    repositoryMode: "",
    expectedMode: "sqlite",
    expectedExtension: "sqlite",
  });
  await checkServerMode({
    label: "explicit-json",
    repositoryMode: "json",
    expectedMode: "json",
    expectedExtension: "json",
  });
  console.log("Default repository checks passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  checkServerMode,
};
