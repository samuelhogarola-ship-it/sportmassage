import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const browserAuth = await import("../admin/blogger/blogger-auth-core.js").catch(() => ({}));
const root = path.resolve(import.meta.dirname, "..");

test("Blogger gateway exposes no local credentials, recovery or change UI", () => {
  const html = fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8");
  assert.doesNotMatch(html, /(?:recover|recovery|reset|change|recuperar|restablecer|cambiar)[^<]*(?:password|contrase(?:ñ|n)a)/i);
  assert.doesNotMatch(html, /href=["'][^"']*(?:recover|reset|password)/i);
  assert.doesNotMatch(html, /<form|type=["']password["']|name=["']remember["']/i);
  assert.match(html, /https:\/\/portal\.webfuengirola\.com\/acceso\/blogger\/sportmassagefuengirola/);
});

test("Studio handoff fragments are ignored in direct-only mode without issuing a request", async () => {
  assert.equal(typeof browserAuth.consumeStudioLaunchFragment, "function");
  const requests = [];
  const replacements = [];
  const location = { href: `https://sportmassagefuengirola.com/admin/blogger/#protocol=wf-blogger-handoff%2Fv1&code=${"A".repeat(43)}&siteKey=sportmassagefuengirola` };
  const consumed = await browserAuth.consumeStudioLaunchFragment({
    location,
    replaceUrl: (value) => replacements.push(value),
    request: async (url, options) => { requests.push({ url, options }); },
  });
  assert.equal(consumed, false);
  assert.deepEqual(replacements, []);
  assert.deepEqual(requests, []);
});

test("query-string launch codes are ignored so they cannot be propagated through request targets", async () => {
  let called = false;
  const consumed = await browserAuth.consumeStudioLaunchFragment({
    location: { href: "https://sportmassagefuengirola.com/admin/blogger/?code=logged-secret" },
    replaceUrl: () => {},
    request: async () => { called = true; },
  });
  assert.equal(consumed, false);
  assert.equal(called, false);
});

test("authenticated Blogger API requests use the HttpOnly session cookie without a bearer header", async () => {
  assert.equal(typeof browserAuth.fetchBloggerJson, "function");
  let observed;
  const data = await browserAuth.fetchBloggerJson(async (url, options) => {
    observed = { url, options };
    return Response.json({ ok: true });
  }, "/api/posts", { method: "POST", body: { title: "Fixture" } });
  assert.deepEqual(data, { ok: true });
  assert.equal(observed.options.credentials, "same-origin");
  assert.equal("Authorization" in observed.options.headers, false);
  assert.equal(observed.options.headers["Content-Type"], "application/json");
});
