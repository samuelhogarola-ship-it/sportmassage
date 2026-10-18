import fs from "node:fs";
import path from "node:path";

const LEGACY_CMS_PATTERN = new RegExp([
  "word", "press",
  "|wp-(?:admin|content|includes|json)",
].join(""), "i");
const THEME_ARCHIVE_PATTERN = new RegExp(["(?:the", "me|te", "ma)", "[^\\n]{0,80}", "\\.", "zip"].join(""), "i");
const TEXT_FILE_PATTERN = /\.(?:css|html?|js|json|md|mjs|service|txt|ya?ml|conf)$/i;

export function findLegacyCmsArtifacts({ root, files }) {
  const findings = [];
  for (const relative of files) {
    const normalized = String(relative).replaceAll(path.sep, "/");
    if (/\.zip$/i.test(normalized) || LEGACY_CMS_PATTERN.test(normalized)) {
      findings.push({ path: normalized, reason: "legacy CMS artifact" });
      continue;
    }
    if (!TEXT_FILE_PATTERN.test(normalized)) continue;
    const content = fs.readFileSync(path.join(root, relative), "utf8");
    if (LEGACY_CMS_PATTERN.test(content) || THEME_ARCHIVE_PATTERN.test(content)) {
      findings.push({ path: normalized, reason: "legacy CMS reference" });
    }
  }
  return findings;
}
