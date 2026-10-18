import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findLegacyCmsArtifacts } from "./source-policy.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.(?:m?js)$/.test(entry.name)) files.push(full);
  }
}
for (const relative of ["admin/blogger", "scripts", "tests"]) collect(path.join(root, relative));
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (tracked.status !== 0) {
  process.stderr.write(tracked.stderr || tracked.stdout || "Unable to list tracked source files.\n");
  process.exit(tracked.status ?? 1);
}
const findings = findLegacyCmsArtifacts({ root, files: tracked.stdout.split("\0").filter(Boolean) });
if (findings.length) {
  process.stderr.write(`Legacy CMS policy violations:\n${findings.map((finding) => `- ${finding.path}: ${finding.reason}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Syntax checked ${files.length} JavaScript files; legacy CMS policy checked ${tracked.stdout.split("\0").filter(Boolean).length} tracked files.\n`);
