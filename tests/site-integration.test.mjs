import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("direct Git deployments preserve the central Blogger gateway", () => {
  const html = fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8");
  assert.match(html, /https:\/\/blogger\.sportmassagefuengirola\.com\//);
  assert.match(html, /location\.replace/);
  assert.doesNotMatch(html, /<form|type="password"|(?:admin|portal)\.webfuengirola\.com|<iframe/i);
});

test("site configuration keeps the legacy panel key and declares the canonical Studio tenant", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, ".web-core/site.json"), "utf8"));
  assert.equal(config.key, "sportmassage");
  assert.equal(config.panel.key, "sportmassage");
  assert.equal(config.blogger.tenantKey, "sportmassagefuengirola");
  assert.deepEqual(config.blogger.tenantAliases, ["sportmassage"]);
  assert.equal(config.blogger.apiBase, undefined);
  assert.equal(config.blogger.buildEndpoint, undefined);
});

test("the public release manifest follows the current origin/main design assets", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "deploy/public-manifest.json"), "utf8"));
  for (const relative of manifest.files) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  }
  assert.ok(manifest.files.includes("language-analytics.js"));
  assert.ok(manifest.files.includes("umami-loader.js"));
});

test("CI verifies tests, source policy and the complete static release build", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run build:site/);
});

test("the website repository contains no deployable Blogger authentication sidecar", () => {
  for (const relative of [
    "scripts/post-manager-server.mjs",
    "scripts/blogger-launch-session.mjs",
    "deploy/sportmassage-blogger.service.example",
    "deploy/nginx-blogger.conf.example",
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "package.json"), "utf8"), /start:blogger|post-manager-server/);
});

test("committed public HTML loads the verified consent-aware Umami configuration", () => {
  const pages = [
    "index.html",
    "legal.html",
    "blog/index.html",
    "blog/automatic-translation-test-2026-10-27/index.html",
    "blog/automatic-translation-test-2026-10-27/es/index.html",
    "blog/automatic-translation-test-2026-10-27/fi/index.html",
    "propuesta/color-diferente/index.html",
    "propuesta/creativa/index.html",
    "propuesta/moderno/index.html",
  ];
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /<script defer src="\/umami-loader\.js" data-website-id="59a72488-a454-4caf-962d-e9b4c2589710" data-script-url="https:\/\/analytics\.187\.124\.55\.36\.sslip\.io\/script\.js"><\/script>/, file);
    assert.equal(html.match(/data-website-id=/g)?.length, 1, file);
    assert.ok(html.indexOf('/umami-loader.js') < html.indexOf('/language-analytics.js'), file);
    const legacyCms = ["word", "press"].join("");
    assert.equal(html.toLowerCase().includes(legacyCms), false, file);
  }
  const legal = fs.readFileSync(path.join(root, "legal.html"), "utf8");
  assert.match(legal, /Umami analytics is active|Umami está activo|Umami-analytiikka on käytössä/);
  assert.match(legal, /sin cookies|without cookies|ilman evästeitä/i);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8"), /data-website-id|umami-loader/);
});
