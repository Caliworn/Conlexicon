(function initEntityId(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconEntityId = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createEntityId() {
  // Random version 4 UUIDs from crypto.getRandomValues(). Browsers offer crypto.randomUUID()
  // only on secure origins, so it fails when a phone opens the LAN debug server over HTTP.
  function randomUuid() {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function uid(prefix) {
    return `${prefix}-${randomUuid()}`;
  }

  return { randomUuid, uid };
});
