import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const buildRunner = await import("../scripts/blog-build-runner.mjs").catch(() => ({}));
const siteRelease = await import("../scripts/generate-site-release.mjs").catch(() => ({}));

function temp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("timed-out isolated builds are terminated and cannot perform a late write", async () => {
  assert.equal(typeof buildRunner.runIsolatedBuild, "function");
  const root = temp("sportmassage-timeout-");
  const marker = path.join(root, "late.txt");
  const script = path.join(root, "late-build.mjs");
  fs.writeFileSync(script, `import fs from "node:fs";\nprocess.on("SIGTERM", () => {});\nsetTimeout(() => fs.writeFileSync(process.argv[2], "late"), 300);\nsetInterval(() => {}, 1000);\n`);
  await assert.rejects(
    () => buildRunner.runIsolatedBuild({ script, args: [marker], timeoutMs: 100, killGraceMs: 30 }),
    /timed out after 100ms/,
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(fs.existsSync(marker), false);
});

test("site releases inject Umami everywhere public only after explicit production verification", async () => {
  assert.equal(typeof siteRelease.generateSiteRelease, "function");
  const root = temp("sportmassage-release-");
  const contentRoot = path.join(root, "content/blog");
  fs.mkdirSync(contentRoot, { recursive: true });
  fs.mkdirSync(path.join(root, "propuesta/demo"), { recursive: true });
  fs.mkdirSync(path.join(root, "admin/blogger"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<html><head></head><body>home</body></html>");
  fs.writeFileSync(path.join(root, "legal.html"), "<html><head></head><body>legal</body></html>");
  fs.writeFileSync(path.join(root, "propuesta/demo/index.html"), "<html><head></head><body>proposal</body></html>");
  fs.writeFileSync(path.join(root, "admin/blogger/index.html"), "<html><head></head><body>admin</body></html>");
  fs.writeFileSync(path.join(root, ".env"), "SECRET=must-not-copy\n");
  fs.writeFileSync(path.join(contentRoot, "fixture.json"), JSON.stringify({
    title: "Fixture", slug: "fixture", description: "Description", date: "2026-10-18",
    lang: "es", author: "Author", status: "published", image: "", tags: [], category: "", level: "", body: "Body",
  }));
  const websiteId = "123e4567-e89b-42d3-a456-426614174000";
  const scriptUrl = "https://analytics.example/script.js";
  const disabled = path.join(root, "disabled");
  await siteRelease.generateSiteRelease({ root, contentRoot, releaseRoot: disabled, umamiWebsiteId: websiteId, umamiScriptUrl: scriptUrl, umamiProductionVerified: false });
  assert.doesNotMatch(fs.readFileSync(path.join(disabled, "index.html"), "utf8"), /data-website-id/);
  const enabled = path.join(root, "enabled");
  await siteRelease.generateSiteRelease({ root, contentRoot, releaseRoot: enabled, umamiWebsiteId: websiteId, umamiScriptUrl: scriptUrl, umamiProductionVerified: true });
  for (const relative of ["index.html", "legal.html", "propuesta/demo/index.html", "blog/index.html", "blog/fixture/index.html"]) {
    assert.match(fs.readFileSync(path.join(enabled, relative), "utf8"), new RegExp(`data-website-id="${websiteId}"`));
  }
  assert.equal(fs.existsSync(path.join(enabled, "admin")), false);
  assert.equal(fs.existsSync(path.join(enabled, ".env")), false);
});

test("the analytics activation gate fails closed for malformed production configuration", async () => {
  const root = temp("sportmassage-release-invalid-");
  fs.mkdirSync(path.join(root, "content/blog"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<html><head></head><body>home</body></html>");
  const releaseRoot = path.join(root, "release");
  await siteRelease.generateSiteRelease({
    root, releaseRoot, umamiWebsiteId: "not-real", umamiScriptUrl: "http://analytics.example/script.js", umamiProductionVerified: true,
  });
  assert.doesNotMatch(fs.readFileSync(path.join(releaseRoot, "index.html"), "utf8"), /data-website-id|analytics\.example/);
});
