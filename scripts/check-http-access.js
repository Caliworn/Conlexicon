const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createHttpServer } = require("../lib/http-server");
const { createStaticFileServer, PUBLIC_STATIC_FILES } = require("../lib/static-server");
const { createTempSqliteRepository, requireSqliteRuntime } = require("./sqlite-check-utils");

const ROOT_DIR = path.resolve(__dirname, "..");

function request(port, pathname, {
  method = "GET", host = `localhost:${port}`, origin, contentType, body,
} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const req = http.request({
      hostname: "127.0.0.1", port, path: pathname, method, setHost: false,
      headers: {
        Connection: "close",
        ...(host === null ? {} : { Host: host }),
        ...(origin === undefined ? {} : { Origin: origin }),
        ...(contentType === undefined ? {} : { "Content-Type": contentType }),
        ...(payload === undefined ? {} : { "Content-Length": payload.length }),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString("utf8");
        try {
          resolve({
            status: response.statusCode, headers: response.headers, buffer, text,
            json: text && response.headers["content-type"]?.startsWith("application/json") ? JSON.parse(text) : null,
          });
        } catch (error) {
          reject(new Error(`Invalid JSON from ${method} ${pathname}`, { cause: error }));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error(`Request timed out: ${method} ${pathname}`)));
    req.end(payload);
  });
}

function assertError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.json.error.code, code);
}

async function withServer(lanDebug, fn) {
  const context = await createTempSqliteRepository("conlexicon-http-access-");
  const { server, listenHost, lanAddresses } = createHttpServer({ repository: context.repository, rootDir: ROOT_DIR, lanDebug });
  let port;
  try {
    await context.repository.ensureDataStore();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, listenHost, resolve);
    });
    port = server.address().port;
    await fn({ port, server, repository: context.repository, lanAddresses });
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await assert.rejects(request(port, "/"), { code: "ECONNREFUSED" });
    }
    await context.cleanup();
  }
}

async function checkHosts(port) {
  for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, `LOCALHOST:${port}`]) {
    assert.equal((await request(port, "/api/state", { host })).status, 200);
    assert.equal((await request(port, "/", { host })).status, 200);
  }
  for (const host of [`evil.example:${port}`, `localhost:${port + 1}`, null, "[invalid"]) {
    assertError(await request(port, "/api/state", { host }), 403, "forbidden_host");
    const staticResponse = await request(port, "/", { host });
    assert.equal(staticResponse.status, 403);
    assert.match(staticResponse.headers["content-type"], /^text\/plain/);
  }
  assertError(await request(port, "/api/dictionaries", {
    method: "POST", host: `evil.example:${port}`, origin: "http://evil.example", contentType: "text/plain", body: "not JSON",
  }), 403, "forbidden_host");
  const malformedUrl = await request(port, "http://[");
  assert.equal(malformedUrl.status, 400);
  assert.equal(malformedUrl.text, "Invalid request URL");
  assert.equal((await request(port, "/api/state")).status, 200, "Malformed input must not stop the server");
}

async function checkWrites(port) {
  const origin = `http://localhost:${port}`;
  const create = (options = {}) => request(port, "/api/dictionaries", {
    method: "POST", origin, contentType: "application/json", body: { name: "HTTP boundary check" }, ...options,
  });
  const first = await create();
  assert.equal(first.status, 201);
  assert.equal((await create({ origin: undefined })).status, 201);
  let before = (await request(port, "/api/state")).json.dictionaries.length;
  for (const rejectedOrigin of ["http://evil.example", "null", `http://127.0.0.1:${port}`]) {
    assertError(await create({ origin: rejectedOrigin, contentType: "text/plain", body: "not JSON" }), 403, "forbidden_origin");
  }
  assert.equal((await request(port, "/api/state")).json.dictionaries.length, before);
  for (const contentType of ["text/plain", undefined, "application/x-www-form-urlencoded"]) {
    assertError(await create({ contentType, body: "not JSON" }), 415, "unsupported_media_type");
  }
  assertError(await request(port, `/api/dictionaries/${first.json.id}`, {
    method: "DELETE", origin,
  }), 415, "unsupported_media_type");
  assert.equal((await request(port, "/api/state")).json.dictionaries.length, before);
  for (const contentType of ["application/json; charset=utf-8", "Application/JSON"]) {
    assert.equal((await create({ contentType })).status, 201);
  }
  const autosave = await request(port, `/api/dictionaries/${first.json.id}/autosave`, {
    method: "POST", origin, contentType: "application/json", body: { docs: { markdown: "beacon-compatible save" } },
  });
  assert.equal(autosave.status, 200);
  assert.equal(autosave.json.docs.markdown, "beacon-compatible save");
  assert.equal((await request(port, `/api/dictionaries/${first.json.id}`)).json.docs.markdown, "beacon-compatible save");
  assert.equal((await request(port, `/api/dictionaries/${first.json.id}`, {
    method: "DELETE", origin, contentType: "application/json",
  })).status, 200);
  assert.equal((await request(port, "/api/state")).json.dictionaries.length, before + 1);
  // Read requests do not acquire write-origin or media-type requirements.
  assert.equal((await request(port, "/api/state", { origin: "http://evil.example", contentType: "text/plain" })).status, 200);
}

async function checkStaticResources(port) {
  const expectedTypes = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg",
  };
  for (const file of PUBLIC_STATIC_FILES) {
    const content = await fs.readFile(path.join(ROOT_DIR, file));
    const response = await request(port, `/${file}`);
    assert.equal(response.status, 200, file);
    assert.equal(response.headers["content-type"], expectedTypes[path.extname(file)], file);
    assert.deepEqual(response.buffer, content, file);
    const head = await request(port, `/${file}`, { method: "HEAD" });
    assert.equal(head.status, 200, file);
    assert.equal(head.headers["content-type"], response.headers["content-type"], file);
    assert.equal(Number(head.headers["content-length"]), content.length, file);
    assert.equal(head.buffer.length, 0, "HEAD must not include a response body");
  }
  assert.equal((await request(port, "/")).text, await fs.readFile(path.join(ROOT_DIR, "index.html"), "utf8"));
  for (const pathname of [
    "/.git/config", "/data/index.json", "/DATA/index.json", "/server.js",
    "/lib/sqlite-dictionary-repository.js", "/APP.JS", "/%2e%2e/package.json", "/lib/../server.js",
    "/%61pp.js", "/lib%2ftag-model.js", "/%", "/assets/liquid-glass-lab/not-public.jpg",
  ]) {
    assert.equal((await request(port, pathname)).status, 404, `${pathname} is outside the public resource boundary`);
  }
  assert.equal((await request(port, "/index.html", { method: "POST" })).status, 405);
  assert.equal((await request(port, "/app.js?version=test")).status, 200);
}

async function checkPublicResourceContract() {
  const files = new Set(PUBLIC_STATIC_FILES);
  for (const page of ["index.html", "liquid-glass-lab.html"]) {
    const html = await fs.readFile(path.join(ROOT_DIR, page), "utf8");
    for (const [, file] of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
      assert.ok(files.has(file), `${page} script must be public: ${file}`);
    }
    for (const [, file] of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/g)) {
      // The lab's generated link elements interpolate the two URLs checked below.
      if (!file.startsWith("${")) {
        assert.ok(files.has(file), `${page} stylesheet must be public: ${file}`);
      }
    }
    for (const [, file] of html.matchAll(/["'](assets\/liquid-glass-lab\/[^"']+|[^"']+\.css)["']/g)) {
      assert.ok(files.has(file), `${page} runtime resource must be public: ${file}`);
    }
  }
  const directoryImages = await fs.readdir(path.join(ROOT_DIR, "assets", "liquid-glass-lab"));
  for (const file of directoryImages.filter((file) => /\.(jpg|png|jpeg|svg)$/.test(file))) {
    assert.ok(files.has(`assets/liquid-glass-lab/${file}`), `Lab image must be public: ${file}`);
  }
  // A missing public file is an I/O failure, not a silent 404 fallback.
  const serveStatic = createStaticFileServer({ rootDir: ROOT_DIR, files: ["missing-public-file.js"] });
  await assert.rejects(serveStatic({ method: "GET" }, {}, new URL("http://localhost/missing-public-file.js")), { code: "ENOENT" });
}

async function checkLanMode() {
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);
  await withServer(undefined, async ({ port, server }) => {
    assert.equal(server.address().address, "127.0.0.1");
    for (const address of addresses) {
      assertError(await request(port, "/api/state", { host: `${address}:${port}` }), 403, "forbidden_host");
    }
  });
  for (const value of ["0", "true", "2"]) {
    await withServer(value, async ({ server }) => assert.equal(server.address().address, "127.0.0.1"));
  }
  await withServer("1", async ({ port, server, lanAddresses }) => {
    assert.equal(server.address().address, "0.0.0.0");
    assert.deepEqual(new Set(lanAddresses), new Set(addresses));
    for (const address of addresses) {
      const host = `${address}:${port}`;
      assert.equal((await request(port, "/api/state", { host })).status, 200);
      assert.equal((await request(port, "/api/dictionaries", {
        method: "POST", host, origin: `http://${host}`, contentType: "application/json", body: { name: "LAN debug check" },
      })).status, 201);
    }
    assertError(await request(port, "/api/state", { host: `evil.example:${port}` }), 403, "forbidden_host");
    if (!addresses.length) {
      console.log("No non-internal IPv4 address: skipped only address-dependent assertions in spec 1a.");
    }
  });
}

async function main() {
  requireSqliteRuntime("HTTP access check");
  const originalConsoleError = console.error;
  const expectedErrors = [];
  console.error = (error) => expectedErrors.push(error);
  try {
    await checkPublicResourceContract();
    await withServer(undefined, async ({ port, server }) => {
      assert.equal(server.address().address, "127.0.0.1");
      await checkHosts(port);
      await checkWrites(port);
      await checkStaticResources(port);
    });
    await checkLanMode();
    expectedErrors.forEach((error) => assert.ok([403, 415].includes(error.status) || error.code === "ERR_INVALID_URL", error.stack));
  } finally {
    console.error = originalConsoleError;
  }
  console.log("HTTP Host, Origin, media type, static allowlist and LAN debug checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
