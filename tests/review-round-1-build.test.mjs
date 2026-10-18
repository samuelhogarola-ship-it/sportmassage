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
  fs.writeFileSync(path.join(root, "legal.html"), "<html><head></head><body>Analytics is currently disabled and no advertising cookies are used. If Umami is activated, it will measure aggregate, privacy-friendly visits without cookies or personal profiles.</body></html>");
  fs.writeFileSync(path.join(root, "propuesta/demo/index.html"), "<html><head></head><body>proposal</body></html>");
  fs.writeFileSync(path.join(root, "admin/blogger/index.html"), "<html><head></head><body>admin</body></html>");
  fs.writeFileSync(path.join(root, ".env"), "SECRET=must-not-copy\n");
  fs.mkdirSync(path.join(root, "deploy"), { recursive: true });
  fs.writeFileSync(path.join(root, "deploy/public-manifest.json"), JSON.stringify({ files: ["index.html", "legal.html", "propuesta/demo/index.html"] }));
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
  assert.match(fs.readFileSync(path.join(enabled, "legal.html"), "utf8"), /Umami analytics is active/);
  assert.doesNotMatch(fs.readFileSync(path.join(enabled, "legal.html"), "utf8"), /currently disabled/);
  const bloggerEntry = fs.readFileSync(path.join(enabled, "admin/blogger/index.html"), "utf8");
  assert.match(bloggerEntry, /https:\/\/admin\.webfuengirola\.com\/cliente\/proyectos\/sportmassagefuengirola\/blogger/);
  assert.doesNotMatch(bloggerEntry, /\/api\/|admin\/blogger\/login/);
  assert.equal(fs.existsSync(path.join(enabled, "admin/blogger/app.js")), false);
  assert.equal(fs.existsSync(path.join(enabled, ".env")), false);
});

test("analytics activation rewrites every legacy disclosure in every tracked HTML file", async () => {
  const root = temp("sportmassage-release-disclosures-");
  fs.mkdirSync(path.join(root, "content/blog"), { recursive: true });
  fs.mkdirSync(path.join(root, "propuesta/demo"), { recursive: true });
  fs.mkdirSync(path.join(root, "deploy"), { recursive: true });
  const longDisabled = [
    "Actualmente no hay analítica activa ni cookies publicitarias. Si se activa Umami, medirá visitas agregadas y respetuosas con la privacidad sin cookies ni perfiles personales.",
    "Analytics is currently disabled and no advertising cookies are used. If Umami is activated, it will measure aggregate, privacy-friendly visits without cookies or personal profiles.",
    "Analytiikka ei ole tällä hetkellä käytössä eikä sivusto käytä mainosevästeitä. Jos Umami otetaan käyttöön, se mittaa koottuja käyntejä yksityisyyttä kunnioittaen ilman evästeitä tai henkilöprofiileja.",
  ];
  const shortDisabled = [
    "La analítica está desactivada. Si se activa Umami, medirá visitas agregadas sin cookies ni perfiles personales.",
    "Analytics is disabled. If Umami is activated, it will measure aggregate visits without cookies or personal profiles.",
    "Analytiikka ei ole käytössä. Jos Umami otetaan käyttöön, se mittaa koottuja käyntejä ilman evästeitä tai henkilöprofiileja.",
  ];
  fs.writeFileSync(path.join(root, "index.html"), `<html><head></head><body>${shortDisabled.join("|")}</body></html>`);
  fs.writeFileSync(path.join(root, "legal.html"), `<html><head></head><body>${longDisabled.concat(longDisabled).join("|")}</body></html>`);
  fs.writeFileSync(path.join(root, "propuesta/demo/index.html"), `<html><head></head><body>${shortDisabled.join("|")}</body></html>`);
  fs.writeFileSync(path.join(root, "deploy/public-manifest.json"), JSON.stringify({ files: ["index.html", "legal.html", "propuesta/demo/index.html"] }));

  const releaseRoot = path.join(root, "release");
  await siteRelease.generateSiteRelease({
    root,
    releaseRoot,
    umamiWebsiteId: "123e4567-e89b-42d3-a456-426614174000",
    umamiScriptUrl: "https://analytics.example/script.js",
    umamiProductionVerified: true,
  });

  const html = ["index.html", "legal.html", "propuesta/demo/index.html"].map((relative) => fs.readFileSync(path.join(releaseRoot, relative), "utf8"));
  for (const page of html) {
    assert.match(page, /data-website-id=/);
    for (const disclosure of [...longDisabled, ...shortDisabled]) assert.equal(page.includes(disclosure), false, disclosure);
  }
  const combined = html.join("\n");
  for (const active of [
    "Umami está activo y mide visitas agregadas",
    "Umami analytics is active and measures aggregate visits",
    "Umami-analytiikka on käytössä ja mittaa koottuja käyntejä",
  ]) assert.match(combined, new RegExp(active));
});

test("the analytics activation gate fails closed for malformed production configuration", async () => {
  const root = temp("sportmassage-release-invalid-");
  fs.mkdirSync(path.join(root, "content/blog"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<html><head></head><body>home</body></html>");
  fs.writeFileSync(path.join(root, "legal.html"), "<html><head></head><body>legal</body></html>");
  fs.mkdirSync(path.join(root, "deploy"), { recursive: true });
  fs.writeFileSync(path.join(root, "deploy/public-manifest.json"), JSON.stringify({ files: ["index.html", "legal.html"] }));
  const releaseRoot = path.join(root, "release");
  await siteRelease.generateSiteRelease({
    root, releaseRoot, umamiWebsiteId: "not-real", umamiScriptUrl: "http://analytics.example/script.js", umamiProductionVerified: true,
  });
  assert.doesNotMatch(fs.readFileSync(path.join(releaseRoot, "index.html"), "utf8"), /data-website-id|analytics\.example/);
});
