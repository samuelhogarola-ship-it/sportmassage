export function normalizeEditorPostPayload(input) {
  const tags = Array.isArray(input?.tags)
    ? input.tags
    : String(input?.tags ?? "").split(",");
  return {
    ...input,
    tags: [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))],
    content_format: "markdown",
  };
}
