import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const policy = await import("../scripts/source-policy.mjs").catch(() => ({}));

test("source policy rejects legacy CMS references and theme archives", () => {
  assert.equal(typeof policy.findLegacyCmsArtifacts, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sportmassage-source-policy-"));
  fs.mkdirSync(path.join(root, "docs"));
  const retiredRoute = ["wp", "admin"].join("-");
  const archive = ["old", "theme"].join("-") + [".", "zip"].join("");
  fs.writeFileSync(path.join(root, "docs", "migration.txt"), `Use ${retiredRoute} for publishing.\n`);
  fs.writeFileSync(path.join(root, archive), "not-a-real-archive\n");
  const findings = policy.findLegacyCmsArtifacts({
    root,
    files: ["docs/migration.txt", archive],
  });
  assert.deepEqual(findings.map((finding) => finding.path), ["docs/migration.txt", archive]);
});

test("source policy accepts the static Blogger flow", () => {
  assert.equal(typeof policy.findLegacyCmsArtifacts, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sportmassage-source-policy-clean-"));
  fs.writeFileSync(path.join(root, "README.md"), "Static Blogger publishes generated HTML.\n");
  assert.deepEqual(policy.findLegacyCmsArtifacts({ root, files: ["README.md"] }), []);
});
