import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("Blogger UI provides direct login, Studio launch and cookie-session adapter", () => {
  const html = fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8");
  const adapter = fs.readFileSync(path.join(root, "admin/blogger/blogger-auth.js"), "utf8");
  assert.match(html, /id="bloggerLogin"/);
  assert.match(html, /id="bloggerLogout"/);
  assert.match(html, /"authModule":"\.\/blogger-auth\.js"/);
  assert.match(adapter, /\/admin\/blogger\/launch/);
  assert.match(adapter, /\/admin\/blogger\/login/);
  assert.match(adapter, /\/api\/admin\/session/);
  assert.doesNotMatch(adapter, /localStorage|sessionStorage/);
});

test("deployment contract is fail-closed and documents persistent content and recovery", () => {
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const guide = fs.readFileSync(path.join(root, "docs/blogger-deployment.md"), "utf8");
  for (const value of [
    "BLOGGER_PUBLIC_ORIGIN",
    "BLOGGER_STUDIO_EXCHANGE_URL",
    "BLOGGER_DIRECT_PASSWORD_HASH",
    "BLOGGER_SESSION_SECRET",
    "BLOGGER_HANDOFF_SECRET",
    "UMAMI_WEBSITE_ID=",
  ]) assert.match(env, new RegExp(value));
  for (const value of [
    "sportmassagefuengirola",
    "persistent",
    "rollback",
    "HTTPS",
    "health",
    "disabled",
    ".blogger-state/transaction",
  ]) assert.match(guide, new RegExp(value, "i"));
  const legacyCms = ["word", "press"].join("");
  assert.equal(`${env}\n${guide}`.toLowerCase().includes(legacyCms), false);
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
