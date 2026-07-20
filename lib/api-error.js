function apiError(message, status = 500, code = "unknown_error", details = undefined) {
  const error = Object.assign(new Error(message), { status, code });
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function systemErrorCode(error) {
  if (error?.code === "EACCES" || error?.code === "EPERM") {
    return "system_file_permission";
  }
  if (error?.code === "ENOSPC") {
    return "system_disk_full";
  }
  if (error?.code === "EBUSY") {
    return "system_file_busy";
  }
  if (error?.code === "ENOENT") {
    return "system_file_missing";
  }
  if (error instanceof SyntaxError) {
    return "system_json_parse";
  }
  return "unknown_error";
}

function serializeApiError(error) {
  const status = error?.status || 500;
  const code = error?.code && typeof error.code === "string" && status < 500
    ? error.code
    : error?.code && typeof error.code === "string" && error.code.startsWith("system_")
      ? error.code
      : status >= 500
        ? systemErrorCode(error)
        : "unknown_error";
  return {
    error: {
      code,
      message: error?.message || "Internal server error",
      ...(error?.details !== undefined ? { details: error.details } : {}),
    },
  };
}

module.exports = {
  apiError,
  serializeApiError,
};
