import assert from "node:assert/strict";
import test from "node:test";

import { verifyIndependentBlogger } from "../scripts/verify-blogger-deployment.mjs";

const destination = "https://portal.webfuengirola.com/acceso/blogger/sportmassagefuengirola";
const gateway = `<!doctype html><html lang="en"><head><meta http-equiv="refresh" content="0; url=${destination}"><script>location.replace('${destination}')</script></head><body><a href="${destination}">Continue to Blogger</a></body></html>`;

test("deployment verifier accepts only the exact neutral-host central gateway", async () => {
  const calls = [];
  const fetchGateway = async (url, init) => {
    calls.push({ url, init });
    return url.endsWith('/admin/blogger/')
      ? new Response(gateway, { status: 200, headers: { "content-type": "text/html" } })
      : new Response('Not found', { status: 404, headers: { "content-type": "text/plain" } });
  };
  assert.deepEqual(await verifyIndependentBlogger("https://sportmassagefuengirola.com", fetchGateway), { ok: true });
  assert.equal(calls[0].url, "https://sportmassagefuengirola.com/admin/blogger/");
  assert.equal(calls[0].init.redirect, "manual");
  assert.deepEqual(calls.slice(1).map(call => new URL(call.url).pathname), [
    '/admin/blogger/app.js', '/admin/blogger/blogger-auth.js', '/api/posts',
    '/api/build', '/api/admin/session', '/api/blogger/health',
  ]);

  for (const invalid of [
    '<form><input type="password"></form>',
    gateway.replaceAll(destination, "https://admin.webfuengirola.com/acceso/blogger/sportmassagefuengirola"),
    gateway.replace("location.replace", "void"),
    gateway.replace(`location.replace('${destination}')`, `/* ${destination} */ location.replace('https://evil.example')`),
    gateway.replace('</script>', `; location.replace('https://evil.example')</script>`),
  ]) {
    await assert.rejects(() => verifyIndependentBlogger("https://sportmassagefuengirola.com", async url => url.endsWith('/admin/blogger/')
      ? new Response(invalid, { headers: { "content-type": "text/html" } })
      : new Response('Not found', { status: 404 })), /central Blogger gateway verification failed/i);
  }
  await assert.rejects(() => verifyIndependentBlogger("https://sportmassagefuengirola.com", async () => new Response(gateway, { headers: { "content-type": "text/plain" } })), /central Blogger gateway verification failed/i);
  await assert.rejects(() => verifyIndependentBlogger("https://sportmassagefuengirola.com", async url => url.endsWith('/admin/blogger/')
    ? new Response(gateway, { headers: { "content-type": "text/html" } })
    : new Response('stale runtime', { status: 200 })), /obsolete Blogger runtime is still reachable/i);
});
