import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const browserAuth = await import("../admin/blogger/blogger-auth-core.js").catch(() => ({}));
const root = path.resolve(import.meta.dirname, "..");

test("Studio launch codes are consumed from the URL fragment and sent only in a POST body", async () => {
  assert.equal(typeof browserAuth.consumeStudioLaunchFragment, "function");
  const requests = [];
  const replacements = [];
  const location = { href: "https://sportmassagefuengirola.com/admin/blogger/#code=A_secret_launch_code" };
  const consumed = await browserAuth.consumeStudioLaunchFragment({
    location,
    replaceUrl: (value) => replacements.push(value),
    request: async (url, options) => { requests.push({ url, options }); },
  });
  assert.equal(consumed, true);
  assert.deepEqual(replacements, ["/admin/blogger/"]);
  assert.equal(requests[0].url, "/admin/blogger/launch");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), { code: "A_secret_launch_code" });
  assert.equal(requests[0].url.includes("A_secret_launch_code"), false);
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

test("paste normalization preserves common formatting and rejects active content", () => {
  assert.equal(typeof browserAuth.normalizePastedHtml, "function");
  const normalized = browserAuth.normalizePastedHtml('<h2 onclick="steal()">Recovery</h2><p>Use <strong>gentle</strong> <em>pressure</em>.</p><script>steal()</script><a href="javascript:steal()" onmouseover="steal()">unsafe</a><ul><li>Hydrate</li></ul>');
  assert.match(normalized, /<h2>Recovery<\/h2>/);
  assert.match(normalized, /<strong>gentle<\/strong>/);
  assert.match(normalized, /<em>pressure<\/em>/);
  assert.match(normalized, /<ul><li>Hydrate<\/li><\/ul>/);
  assert.doesNotMatch(normalized, /script|onclick|onmouseover|javascript:/i);
});

test("login and mobile editor markup expose remembered access and touch-safe responsive controls", () => {
  const html = fs.readFileSync(path.join(root, "admin/blogger/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "admin/blogger/styles.css"), "utf8");
  const authScript = fs.readFileSync(path.join(root, "admin/blogger/blogger-auth.js"), "utf8");
  assert.match(html, /name="username"[^>]*autocomplete="username"/);
  assert.match(html, /name="password"[^>]*autocomplete="current-password"/);
  assert.match(html, /name="remember"[^>]*type="checkbox"[^>]*checked/);
  assert.match(html, /Recordarme en este dispositivo/);
  assert.match(authScript, /remember:\s*loginForm\.elements\.remember\.checked/);
  assert.match(authScript, /addEventListener\("paste"/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /overflow-x:\s*(?:auto|hidden)/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /bottom:\s*0/);
});
