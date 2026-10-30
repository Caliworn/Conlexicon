const { apiError } = require("./api-error");
const {
  TAG_COLORS,
  normalizeTagDisplayLabel,
  tagHasSeparator,
} = require("./tag-model");

function invalidChange() {
  return apiError("Invalid tag registry change", 400, "invalid_tag_registry_change");
}

function requireRow(registry, tag) {
  const row = registry.find((item) => item.tag === tag);
  if (!row) {
    throw apiError("Tag not found", 404, "tag_registry_tag_not_found");
  }
  return row;
}

function inZoneOrder(partRows, generalRows) {
  return [...partRows, ...generalRows];
}

function addTag(registry, { tag, partOfSpeech }) {
  if (typeof tag !== "string" || typeof partOfSpeech !== "boolean") {
    throw invalidChange();
  }
  const value = tag.trim();
  if (!value || tagHasSeparator(value)) {
    throw apiError("Invalid tag", 400, "tag_registry_invalid_tag");
  }
  if (registry.some((row) => row.tag === value)) {
    throw apiError("Tag already exists", 409, "tag_registry_tag_exists");
  }
  const row = { tag: value, partOfSpeech, displayLabel: "", color: "" };
  return inZoneOrder(
    [...registry.filter((item) => item.partOfSpeech), ...(partOfSpeech ? [row] : [])],
    [...registry.filter((item) => !item.partOfSpeech), ...(partOfSpeech ? [] : [row])],
  );
}

function moveTag(registry, { tag, partOfSpeech, before }) {
  if (typeof tag !== "string" || typeof partOfSpeech !== "boolean"
    || (before !== null && typeof before !== "string")) {
    throw invalidChange();
  }
  const row = requireRow(registry, tag);
  const others = registry.filter((item) => item !== row);
  const zone = others.filter((item) => item.partOfSpeech === partOfSpeech);
  const position = before === null ? zone.length : zone.findIndex((item) => item.tag === before);
  if (position < 0) {
    throw apiError("Anchor tag is not in the target zone", 404, "tag_registry_anchor_not_found");
  }
  zone.splice(position, 0, { ...row, partOfSpeech });
  const otherZone = others.filter((item) => item.partOfSpeech !== partOfSpeech);
  return partOfSpeech ? inZoneOrder(zone, otherZone) : inZoneOrder(otherZone, zone);
}

function updateTag(registry, { tag, displayLabel, color }) {
  const changesLabel = displayLabel !== undefined;
  const changesColor = color !== undefined;
  if (typeof tag !== "string" || (!changesLabel && !changesColor)
    || (changesLabel && typeof displayLabel !== "string")
    || (changesColor && color !== "" && !TAG_COLORS.includes(color))) {
    throw invalidChange();
  }
  const row = requireRow(registry, tag);
  const next = {
    ...row,
    ...(changesLabel ? { displayLabel: normalizeTagDisplayLabel(tag, displayLabel) } : {}),
    ...(changesColor ? { color } : {}),
  };
  return registry.map((item) => (item === row ? next : item));
}

function deleteTag(registry, { tag }, tagEntryCount) {
  if (typeof tag !== "string") {
    throw invalidChange();
  }
  const row = requireRow(registry, tag);
  const entryCount = tagEntryCount(tag);
  if (entryCount > 0) {
    throw apiError("Tag is in use", 409, "tag_registry_tag_in_use", { entryCount });
  }
  return registry.filter((item) => item !== row);
}

// Returns the whole registry after one operation. `tagEntryCount(tag)` counts
// the entries using a tag; the caller reads it inside the write transaction.
function applyTagRegistryChange(registry, change, tagEntryCount) {
  if (!change || typeof change !== "object" || Array.isArray(change)) {
    throw invalidChange();
  }
  switch (change.op) {
    case "add":
      return addTag(registry, change);
    case "move":
      return moveTag(registry, change);
    case "update":
      return updateTag(registry, change);
    case "delete":
      return deleteTag(registry, change, tagEntryCount);
    default:
      throw invalidChange();
  }
}

module.exports = {
  applyTagRegistryChange,
};
