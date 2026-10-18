const { apiError } = require("./api-error");

// Versioned window cursors shared by in-process result sessions. A cursor is
// valid only for the process, cache generation and view digest that issued it.
function resultWindowOffset(page, context) {
  if (!page.cursor) {
    if ((page.windowOffset || 0) > 0) {
      throw apiError("A versioned cursor is required for a non-zero query window", 400, "query_cursor_required");
    }
    return 0;
  }
  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8"));
  } catch {
    payload = null;
  }
  const offset = Number.parseInt(payload?.offset, 10);
  const staleReason = !payload || payload.version !== 1 || !Number.isSafeInteger(offset) || offset < 0
    ? "invalid"
    : payload.processEpoch !== context.processEpoch
      ? "process_epoch"
      : Number(payload.generation) !== context.generation
        ? "cache_generation"
        : payload.descriptorDigest !== context.descriptorDigest
          ? "descriptor"
          : "";
  if (staleReason) {
    throw apiError("Query cursor is stale", 409, "query_cursor_stale", { reason: staleReason });
  }
  return page.windowOffset === null ? offset : page.windowOffset;
}

function encodeResultWindowCursor(context, offset) {
  return Buffer.from(JSON.stringify({
    version: 1,
    ...context,
    offset,
  }), "utf8").toString("base64url");
}

module.exports = {
  encodeResultWindowCursor,
  resultWindowOffset,
};
