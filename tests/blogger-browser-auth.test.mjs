import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const browserAuth = await import("../admin/blogger/blogger-auth-core.js").catch(() => ({}));
const root = path.resolve(import.meta.dirname, "..");

test("Blogger exposes no self-service password recovery or change UI", () => {
  const html = fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8");
  assert.doesNotMatch(html, /(?:recover|recovery|reset|change|recuperar|restablecer|cambiar)[^<]*(?:password|contrase(?:ñ|n)a)/i);
  assert.doesNotMatch(html, /href=["'][^"']*(?:recover|reset|password)/i);
  assert.doesNotMatch(html, /name=["']remember["'][^>]*\bchecked\b/i);
  assert.match(html, /id=["']bloggerLogout["'][^>]*>[\s\S]*?Cerrar sesi[oó]n/i);
  assert.match(html, /id=["']bloggerPasswordVisibility["'][^>]*aria-controls=["']bloggerPassword["']/i);
  assert.match(html, />Mostrar</i);
});

test("password visibility control updates the input and its accessible state", () => {
  assert.equal(typeof browserAuth.setPasswordVisibility, "function");
  const input = { type: "password" };
  const control = {
    textContent: "",
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
  };

  browserAuth.setPasswordVisibility(input, control, true);
  assert.equal(input.type, "text");
  assert.equal(control.textContent, "Ocultar");
  assert.equal(control.attributes.get("aria-pressed"), "true");

  browserAuth.setPasswordVisibility(input, control, false);
  assert.equal(input.type, "password");
  assert.equal(control.textContent, "Mostrar");
  assert.equal(control.attributes.get("aria-pressed"), "false");
});

test("authentication failures preserve the HTTP status so the UI can distinguish outages", async () => {
  await assert.rejects(
    () => browserAuth.fetchBloggerJson(async () => new Response("Hostinger 404", {
      status: 404,
      headers: { "content-type": "text/html" },
    }), "/admin/blogger/login", { method: "POST", body: {} }),
    error => error?.status === 404 && error?.code === "authentication_failed",
  );
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
