const http = require("node:http");
const os = require("node:os");
const { createApiRouter } = require("./api-routes");
const { serializeApiError } = require("./api-error");
const { assertHttpAccess } = require("./http-access");
const { sendJson, sendText } = require("./http-utils");
const { createStaticFileServer, PUBLIC_STATIC_FILES } = require("./static-server");

function createHttpServer({ repository, rootDir, lanDebug = "" }) {
  const lanEnabled = lanDebug === "1";
  const listenHost = lanEnabled ? "0.0.0.0" : "127.0.0.1";
  const lanAddresses = lanEnabled ? [...new Set(Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address))] : [];
  const routeApi = createApiRouter({ repository });
  const serveStatic = createStaticFileServer({ rootDir, files: PUBLIC_STATIC_FILES });
  // Missing Host is rejected by our boundary with the specified 403 response.
  const server = http.createServer({ requireHostHeader: false }, async (request, response) => {
    let url;
    try {
      // Host is checked separately; never use an untrusted Host as the URL base.
      url = new URL(request.url, "http://localhost");
      assertHttpAccess(request, url, { port: server.address().port, lanAddresses });
      if (url.pathname.startsWith("/api/") && (await routeApi(request, response, url))) {
        return;
      }
      await serveStatic(request, response, url);
    } catch (error) {
      console.error(error);
      if (!url) {
        sendText(response, 400, "Invalid request URL");
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, error.status || 500, serializeApiError(error));
        return;
      }
      sendText(response, error.status || 500, error.message || "Internal server error");
    }
  });
  return { server, listenHost, lanAddresses };
}

module.exports = { createHttpServer };
