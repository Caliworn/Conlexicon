const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const { createApiRouter } = require("../lib/api-routes");
const {
  readRequestBody,
  REQUEST_BODY_LIMITS,
} = require("../lib/http-utils");

function requestFrom(chunks, contentLength) {
  const request = Readable.from(chunks);
  request.headers = contentLength === undefined
    ? {}
    : { "content-length": String(contentLength) };
  return request;
}

async function assertTooLarge(promise, limitBytes) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, 413);
    assert.equal(error.code, "request_body_too_large");
    assert.deepEqual(error.details, { limitBytes });
    return true;
  });
}

async function callRoute(method, pathname, rawBody, { repository, conversionService } = {}) {
  const request = requestFrom([Buffer.from(rawBody)], Buffer.byteLength(rawBody));
  request.method = method;
  let statusCode = 0;
  let responseBody = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      responseBody = value || "";
    },
  };
  const handled = await createApiRouter({ repository, conversionService })(
    request,
    response,
    new URL(pathname, "http://localhost"),
  );
  return {
    handled,
    statusCode,
    body: responseBody ? JSON.parse(responseBody) : null,
  };
}

async function main() {
  assert.deepEqual(REQUEST_BODY_LIMITS, {
    default: 5 * 1024 * 1024,
    module: 32 * 1024 * 1024,
    import: 64 * 1024 * 1024,
  });

  assert.deepEqual(
    await readRequestBody(requestFrom([Buffer.from('{"ok":true}')]), { maxBytes: 16 }),
    { ok: true },
  );
  await assertTooLarge(
    readRequestBody(requestFrom([Buffer.from("{}")], 17), { maxBytes: 16 }),
    16,
  );
  await assertTooLarge(
    readRequestBody(requestFrom([Buffer.from('{"a":'), Buffer.from("1}")]), { maxBytes: 6 }),
    6,
  );
  await assertTooLarge(
    readRequestBody(requestFrom([Buffer.from('{"a":1}')], 2), { maxBytes: 6 }),
    6,
  );

  const padding = "x".repeat(REQUEST_BODY_LIMITS.default);
  const defaultBody = JSON.stringify({ padding });
  await assertTooLarge(
    callRoute("PUT", "/api/preferences", defaultBody, {
      repository: { updatePreferences: async () => assert.fail("oversized preferences reached repository") },
    }),
    REQUEST_BODY_LIMITS.default,
  );

  const docsBody = JSON.stringify({ docs: { padding } });
  const docsRequest = requestFrom([Buffer.from(docsBody)], Buffer.byteLength(docsBody));
  docsRequest.method = "PUT";
  let docsStatus = 0;
  const docsResponse = {
    writeHead(status) {
      docsStatus = status;
    },
    end() {},
  };
  const docsHandled = await createApiRouter({
    repository: {
      async saveDocs(id, docs) {
        return { id, updatedAt: "2026-07-19T00:00:00.000Z", docs };
      },
    },
  })(
    docsRequest,
    docsResponse,
    new URL("/api/dictionaries/dict-test/docs", "http://localhost"),
  );
  assert.equal(docsHandled, true);
  assert.equal(docsStatus, 200);

  let imported = false;
  const importResult = await callRoute("POST", "/api/import", defaultBody, {
    repository: {
      async importDictionary() {
        imported = true;
      },
      async readState() {
        return { activeDictionaryId: "dict-test", dictionaries: [] };
      },
    },
    conversionService: {
      importDictionaryFromJsonPayload() {
        return { dictionary: { id: "dict-test" } };
      },
    },
  });
  assert.equal(importResult.handled, true);
  assert.equal(importResult.statusCode, 200);
  assert.equal(imported, true);

  console.log("HTTP request limit checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
