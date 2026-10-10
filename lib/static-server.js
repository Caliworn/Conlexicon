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

const PUBLIC_STATIC_FILES = Object.freeze([
  "index.html",
  "liquid-glass-lab.html",
  "app.js",
  "styles.css",
  "theme-classic.css",
  "theme-layered-glass.css",
  "theme-liquid-glass.css",
  "lib/search-normalization-model.js",
  "lib/tag-model.js",
  "lib/orthography-model.js",
  "lib/morphology-model.js",
  "lib/entry-search-model.js",
  "lib/entry-query-model.js",
  "lib/source-reference-model.js",
  "lib/etymology-graph-model.js",
  "lib/entry-relations-model.js",
  "lib/ipa-model.js",
  "lib/quality-model.js",
  "lib/query-page-cache.js",
  "lib/liquid-glass-geometry.js",
  "lib/liquid-glass-engine.js",
  "lib/entry-workspace-layout.js",
  "lib/entry-sort-control.js",
  "assets/liquid-glass-lab/interior.jpg",
  "assets/liquid-glass-lab/diamond-valley-lake-poppies.jpg",
  "assets/liquid-glass-lab/whangarei-falls-footbridge.jpg",
  "assets/liquid-glass-lab/turquoise-shallow-water-rocks.jpg",
  "assets/liquid-glass-lab/people-in-dry-grass-field.jpg",
]);

function createStaticFileServer({ rootDir, files }) {
  const publicPaths = new Map(files.map((file) => [`/${file}`, path.join(rootDir, file)]));
  publicPaths.set("/", path.join(rootDir, "index.html"));
  return async function serveStatic(request, response, url) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Method not allowed");
      return;
    }
    const filePath = publicPaths.get(url.pathname);
    if (!filePath) {
      sendText(response, 404, "Not found");
      return;
    }
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)],
      "Content-Length": content.length,
    });
    response.end(request.method === "HEAD" ? undefined : content);
  };
}

module.exports = {
  createStaticFileServer,
  PUBLIC_STATIC_FILES,
};
