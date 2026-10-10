const { apiError } = require("./api-error");

function assertHttpAccess(request, url, { port, lanAddresses }) {
  const host = request.headers.host;
  const allowedHosts = ["localhost", "127.0.0.1", "[::1]", ...lanAddresses]
    .map((address) => `${address}:${port}`);
  if (!host || !allowedHosts.includes(host.toLowerCase())) {
    throw apiError("Forbidden Host", 403, "forbidden_host");
  }

  if (!url.pathname.startsWith("/api/") || request.method === "GET" || request.method === "HEAD") {
    return;
  }
  if (Object.hasOwn(request.headers, "origin") && request.headers.origin !== `http://${host}`) {
    throw apiError("Forbidden Origin", 403, "forbidden_origin");
  }
  const mediaType = (request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw apiError("Unsupported media type", 415, "unsupported_media_type");
  }
}

module.exports = { assertHttpAccess };
