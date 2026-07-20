const fs = require("node:fs/promises");
const path = require("node:path");
const { sendText } = require("./http-utils");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function createStaticFileServer({ rootDir }) {
  return async function serveStatic(request, response, url) {
    const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.resolve(rootDir, `.${requestedPath}`);

    if (!filePath.startsWith(rootDir) || filePath.includes(`${path.sep}data${path.sep}`)) {
      sendText(response, 403, "Forbidden");
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      const type = contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": type });
      response.end(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        sendText(response, 404, "Not found");
        return;
      }
      throw error;
    }
  };
}

module.exports = {
  createStaticFileServer,
};
