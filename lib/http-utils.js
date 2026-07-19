const { apiError } = require("./api-error");

const MEBIBYTE = 1024 * 1024;
const REQUEST_BODY_LIMITS = Object.freeze({
  default: 5 * MEBIBYTE,
  module: 32 * MEBIBYTE,
  import: 64 * MEBIBYTE,
});

function requestBodyTooLarge(limitBytes) {
  return apiError(
    "Request body too large",
    413,
    "request_body_too_large",
    { limitBytes },
  );
}

async function readRequestBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? REQUEST_BODY_LIMITS.default;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("readRequestBody maxBytes must be a positive safe integer");
  }

  const declaredLength = Number(request.headers?.["content-length"]);
  if (Number.isSafeInteger(declaredLength) && declaredLength >= 0 && declaredLength > maxBytes) {
    throw requestBodyTooLarge(maxBytes);
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw requestBodyTooLarge(maxBytes);
    }
    chunks.push(buffer);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw apiError(error.message || "Invalid JSON body", 400, "invalid_json_body");
  }
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(value, null, 2));
}

function sendText(response, status, value) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(value);
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = {
  localDateStamp,
  readRequestBody,
  REQUEST_BODY_LIMITS,
  sendJson,
  sendText,
};
