import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

const verifier = await import("../scripts/verify-blogger-deployment.mjs").catch(() => ({}));

const loginShell = `<!doctype html><html><head>
  <link rel="stylesheet" href="styles.css">
</head><body>
  <form id="bloggerLoginForm" method="post" action="/admin/blogger/login">
    <input name="username" autocomplete="username">
    <input name="password" type="password" autocomplete="current-password">
  </form>
  <script type="module" src="app.js"></script>
  <script type="module" src="blogger-auth.js"></script>
  <script type="module" src="blogger-auth-core.js"></script>
  <script type="module" src="editor-schema.js"></script>
</body></html>`;

const assetPaths = new Set([
  "/admin/blogger/styles.css",
  "/admin/blogger/app.js",
  "/admin/blogger/blogger-auth.js",
  "/admin/blogger/blogger-auth-core.js",
  "/admin/blogger/editor-schema.js",
]);

async function fixtureServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "https://admin.webfuengirola.com/acceso/blogger/sportmassagefuengirola" });
      response.end();
      return;
    }
    if (assetPaths.has(request.url)) {
      response.writeHead(200, { "content-type": request.url.endsWith(".css") ? "text/css" : "text/javascript" });
      response.end("/* verified asset */");
      return;
    }
    if (request.url === "/missing-asset") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (request.url === "/meta") response.end('<meta http-equiv="refresh" content="0;url=https://admin.webfuengirola.com/">');
    else if (request.url === "/link") response.end('<a href="https://admin.webfuengirola.com/">Studio</a>');
    else if (request.url === "/http-link") response.end(`${loginShell}<a href="http://admin.webfuengirola.com/">Studio</a>`);
    else if (request.url === "/scheme-relative") response.end(`${loginShell}<a href="//portal.webfuengirola.com/">Studio</a>`);
    else if (request.url === "/bare-host") response.end(`${loginShell}<script>const oldHost = "admin.webfuengirola.com"</script>`);
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
    fetchPath: (pathname, observed, { missingAsset = false } = {}) => async (url, init) => {
      observed.push(init);
      const requestedPath = new URL(url).pathname;
      const fixturePath = requestedPath === "/admin/blogger/"
        ? pathname
        : missingAsset && requestedPath === "/admin/blogger/app.js"
          ? "/missing-asset"
          : requestedPath;
      return fetch(`http://127.0.0.1:${port}${fixturePath}`, init);
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
  assert.equal(observed.length, 6);
  assert.ok(observed.every((request) => request.redirect === "manual"));

  for (const pathname of ["/redirect", "/meta", "/link", "/http-link", "/scheme-relative", "/bare-host", "/iframe"]) {
    await assert.rejects(
      () => verifier.verifyIndependentBlogger("https://sportmassagefuengirola.com", app.fetchPath(pathname, observed)),
      /independent Blogger verification failed/i,
      pathname,
    );
  }

  await assert.rejects(
    () => verifier.verifyIndependentBlogger(
      "https://sportmassagefuengirola.com",
      app.fetchPath("/ok", [], { missingAsset: true }),
    ),
    /independent Blogger verification failed/i,
  );
});
