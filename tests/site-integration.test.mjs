import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("direct Git deployments preserve the central Blogger gateway", () => {
  const html = fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8");
  assert.match(html, /https:\/\/portal\.webfuengirola\.com\/acceso\/blogger\/sportmassagefuengirola/);
  assert.match(html, /location\.replace/);
  assert.doesNotMatch(html, /<form|type="password"|admin\.webfuengirola\.com|<iframe/i);
});

test("site configuration keeps the legacy panel key and declares the canonical Studio tenant", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, ".web-core/site.json"), "utf8"));
  assert.equal(config.key, "sportmassage");
  assert.equal(config.panel.key, "sportmassage");
  assert.equal(config.blogger.tenantKey, "sportmassagefuengirola");
  assert.deepEqual(config.blogger.tenantAliases, ["sportmassage"]);
});

test("the public release manifest follows the current origin/main design assets", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "deploy/public-manifest.json"), "utf8"));
  for (const relative of manifest.files) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  }
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

test("committed public HTML is tracker-free and legal copy allows cookie-free Umami activation", () => {
  const pages = [
    "index.html",
    "legal.html",
    "blog/index.html",
    "propuesta/color-diferente/index.html",
    "propuesta/creativa/index.html",
    "propuesta/moderno/index.html",
  ];
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(html, /data-website-id|<script[^>]+umami/i, file);
    const legacyCms = ["word", "press"].join("");
    assert.equal(html.toLowerCase().includes(legacyCms), false, file);
  }
  const legal = fs.readFileSync(path.join(root, "legal.html"), "utf8");
  assert.match(legal, /Umami/);
  assert.match(legal, /sin cookies|without cookies|ilman evästeitä/i);
});
