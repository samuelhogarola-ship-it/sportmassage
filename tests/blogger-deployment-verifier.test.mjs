import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

const verifier = await import("../scripts/verify-blogger-deployment.mjs").catch(() => ({}));

const loginShell = `<!doctype html><html><body>
  <form id="bloggerLoginForm" method="post" action="/admin/blogger/login">
    <input name="username" autocomplete="username">
    <input name="password" type="password" autocomplete="current-password">
  </form>
</body></html>`;

async function fixtureServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "https://admin.webfuengirola.com/acceso/blogger/sportmassagefuengirola" });
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (request.url === "/meta") response.end('<meta http-equiv="refresh" content="0;url=https://admin.webfuengirola.com/">');
    else if (request.url === "/link") response.end('<a href="https://admin.webfuengirola.com/">Studio</a>');
    else if (request.url === "/iframe") response.end('<iframe src="https://example.com"></iframe>');
    else response.end(loginShell);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    server,
    fetchPath: (pathname, observed) => async (_url, init) => {
      observed.push(init);
      return fetch(`http://127.0.0.1:${port}${pathname}`, init);
    },
  };
}

test("deployment verifier accepts only a same-origin direct login shell and never follows redirects", async (t) => {
  assert.equal(typeof verifier.verifyIndependentBlogger, "function");
  const app = await fixtureServer();
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const observed = [];
  assert.deepEqual(
    await verifier.verifyIndependentBlogger("https://sportmassagefuengirola.com", app.fetchPath("/ok", observed)),
    { ok: true },
  );
  assert.equal(observed[0].redirect, "manual");

  for (const pathname of ["/redirect", "/meta", "/link", "/iframe"]) {
    await assert.rejects(
      () => verifier.verifyIndependentBlogger("https://sportmassagefuengirola.com", app.fetchPath(pathname, observed)),
      /independent Blogger verification failed/i,
      pathname,
    );
  }
});
