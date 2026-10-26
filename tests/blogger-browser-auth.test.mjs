import assert from "node:assert/strict";
import test from "node:test";

const browserAuth = await import("../admin/blogger/blogger-auth-core.js").catch(() => ({}));

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
