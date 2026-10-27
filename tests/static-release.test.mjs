import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { generateSiteRelease } from "../scripts/generate-site-release.mjs";

const root = path.resolve(import.meta.dirname, "..");

function assertCentralGateway(html, label) {
  assert.match(html, /https:\/\/blogger\.sportmassagefuengirola\.com\//i, label);
  assert.match(html, /location\.replace/i, label);
  assert.doesNotMatch(html, /<form|type="password"/i, label);
  assert.doesNotMatch(html, /(?:admin|portal)\.webfuengirola\.com/i, label);
  assert.doesNotMatch(html, /<iframe\b/i, label);
  assert.doesNotMatch(html, /(?:reset|change|recover|recuperar|restablecer)[^<]*(?:password|contrase(?:ñ|n)a)/i, label);
}

test("source and generated releases preserve the same central Blogger gateway", async (t) => {
  const releaseRoot = fs.mkdtempSync(path.join(root, ".tmp-static-release-"));
  t.after(() => fs.rmSync(releaseRoot, { recursive: true, force: true }));

  await generateSiteRelease({ root, releaseRoot });

  assertCentralGateway(
    fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8"),
    "source",
  );
  assertCentralGateway(
    fs.readFileSync(path.join(releaseRoot, "admin/blogger/index.html"), "utf8"),
    "generated",
  );
});
