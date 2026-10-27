import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { generateSiteRelease } from "../scripts/generate-site-release.mjs";

const root = path.resolve(import.meta.dirname, "..");

function assertIndependentLoginShell(html, label) {
  const loginForm = html.match(/<form\b[^>]*id="bloggerLoginForm"[^>]*>/i)?.[0] ?? "";
  assert.match(loginForm, /action="\/admin\/blogger\/login"/i, label);
  assert.match(loginForm, /method="post"/i, label);
  assert.match(html, /name="username"/i, label);
  assert.match(html, /name="password"[^>]*type="password"/i, label);
  assert.doesNotMatch(html, /http-equiv="refresh"/i, label);
  assert.doesNotMatch(html, /admin\.webfuengirola\.com|portal\.webfuengirola\.com/i, label);
  assert.doesNotMatch(html, /<iframe\b/i, label);
  assert.doesNotMatch(html, /(?:reset|change|recover|recuperar|restablecer)[^<]*(?:password|contrase(?:ñ|n)a)/i, label);
  for (const asset of ["styles.css", "app.js", "blogger-auth.js"]) assert.match(html, new RegExp(asset.replace(".", "\\.")), `${label}: ${asset}`);
}

test("source and generated releases preserve the same independent Blogger login shell", async (t) => {
  const releaseRoot = fs.mkdtempSync(path.join(root, ".tmp-static-release-"));
  t.after(() => fs.rmSync(releaseRoot, { recursive: true, force: true }));

  await generateSiteRelease({ root, releaseRoot });

  assertIndependentLoginShell(
    fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8"),
    "source",
  );
  assertIndependentLoginShell(
    fs.readFileSync(path.join(releaseRoot, "admin/blogger/index.html"), "utf8"),
    "generated",
  );
});
