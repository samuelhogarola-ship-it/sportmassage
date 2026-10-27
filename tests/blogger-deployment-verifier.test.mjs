import assert from "node:assert/strict";
import test from "node:test";

import { verifyIndependentBlogger } from "../scripts/verify-blogger-deployment.mjs";

const destination = "https://portal.webfuengirola.com/acceso/blogger/sportmassagefuengirola";
const gateway = `<!doctype html><html lang="en"><head><meta http-equiv="refresh" content="0; url=${destination}"><script>location.replace('${destination}')</script></head><body><a href="${destination}">Continue to Blogger</a></body></html>`;

test("deployment verifier accepts only the exact neutral-host central gateway", async () => {
  const calls = [];
  const fetchGateway = async (url, init) => {
    calls.push({ url, init });
    return new Response(gateway, { status: 200, headers: { "content-type": "text/html" } });
  };
  assert.deepEqual(await verifyIndependentBlogger("https://sportmassagefuengirola.com", fetchGateway), { ok: true });
  assert.equal(calls[0].url, "https://sportmassagefuengirola.com/admin/blogger/");
  assert.equal(calls[0].init.redirect, "manual");

  for (const invalid of [
    '<form><input type="password"></form>',
    gateway.replaceAll(destination, "https://admin.webfuengirola.com/acceso/blogger/sportmassagefuengirola"),
    gateway.replace("location.replace", "void"),
    gateway.replace(`location.replace('${destination}')`, `/* ${destination} */ location.replace('https://evil.example')`),
  ]) {
    await assert.rejects(() => verifyIndependentBlogger("https://sportmassagefuengirola.com", async () => new Response(invalid, { headers: { "content-type": "text/html" } })), /central Blogger gateway verification failed/i);
  }
  await assert.rejects(() => verifyIndependentBlogger("https://sportmassagefuengirola.com", async () => new Response(gateway, { headers: { "content-type": "text/plain" } })), /central Blogger gateway verification failed/i);
});
