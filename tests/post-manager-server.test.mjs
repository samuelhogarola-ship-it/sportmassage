import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const serverModule = await import("../scripts/post-manager-server.mjs").catch(
  () => ({}),
);
const auth = await import("../scripts/blogger-launch-session.mjs").catch(
  () => ({}),
);

const password = "Massage-Blogger-Only-2026!";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sportmassage-server-"));
  fs.mkdirSync(path.join(root, "content/blog"), { recursive: true });
  fs.mkdirSync(path.join(root, "blog/media"), { recursive: true });
  fs.mkdirSync(path.join(root, "blog"), { recursive: true });
  fs.mkdirSync(path.join(root, "admin/blogger"), { recursive: true });
  fs.writeFileSync(path.join(root, "blog/index.html"), "stable\n");
  fs.writeFileSync(path.join(root, "admin/blogger/index.html"), "editor\n");
  return root;
}

async function listen(overrides = {}) {
  assert.equal(typeof serverModule.createPostManagerServer, "function");
  assert.equal(typeof auth.generatePasswordHash, "function");
  const root = overrides.root ?? fixture();
  const passwordHash = await auth.generatePasswordHash(password);
  const env = {
    NODE_ENV: "test",
    BLOGGER_PUBLIC_ORIGIN: "https://sportmassagefuengirola.com",
    BLOGGER_STUDIO_ORIGIN: "https://studio.example.com",
    BLOGGER_STUDIO_EXCHANGE_URL: "https://studio.example.com/api/tool-launch/exchange",
    BLOGGER_DIRECT_USERNAME: "sofia-blogger",
    BLOGGER_DIRECT_PASSWORD_HASH: passwordHash,
    BLOGGER_SESSION_SECRET: "session_4Yz!Q9mP2vK7xN5cR8tL3wD6hF1sJ0aB",
    BLOGGER_HANDOFF_SECRET: "handoff_7Nv!P3qR9mC2xW8kT5dL1yF6jH4sA0e",
    BLOGGER_TEST_ORIGIN: "http://127.0.0.1",
    BLOGGER_LOGIN_MAX_ATTEMPTS: "2",
    ...overrides.env,
  };
  const server = serverModule.createPostManagerServer({
    projectRoot: root,
    env,
    fetchImpl: overrides.fetchImpl,
    build: overrides.build ?? (async () => {}),
    maxSessions: overrides.maxSessions ?? 3,
    maxRateLimitEntries: overrides.maxRateLimitEntries ?? 3,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    root,
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function cookie(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function login(app, body = {}) {
  return fetch(`${app.url}/admin/blogger/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1",
      ...(body.headers ?? {}),
    },
    body: JSON.stringify({
      username: body.username ?? "sofia-blogger",
      password: body.password ?? password,
    }),
  });
}

test("direct credentials grant Blogger scope only and audit direct origin", async (t) => {
  const app = await listen();
  t.after(app.close);
  const response = await login(app);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly; Secure; SameSite=Strict/);
  const session = await fetch(`${app.url}/api/admin/session`, {
    headers: { cookie: cookie(response) },
  });
  assert.deepEqual(await session.json(), {
    authenticated: true,
    source: "direct",
    scope: ["blogger"],
    subject: { role: "blogger_editor", username: "sofia-blogger" },
  });
  const audit = fs.readFileSync(path.join(app.root, ".blogger-state/audit.ndjson"), "utf8");
  assert.match(audit, /"origin":"direct"/);
  assert.doesNotMatch(audit, new RegExp(password));
});

test("a new direct login rotates the browser's prior session", async (t) => {
  const app = await listen();
  t.after(app.close);
  const first = await login(app);
  const firstCookie = cookie(first);
  const second = await login(app, { headers: { cookie: firstCookie } });
  assert.equal(second.status, 200);
  assert.notEqual(cookie(second), firstCookie);
  const retired = await fetch(`${app.url}/api/admin/session`, {
    headers: { cookie: firstCookie },
  });
  assert.equal(retired.status, 401);
});

test("Studio handoff exchanges the exact site audience and records studio origin", async (t) => {
  let exchangeRequest;
  const app = await listen({
    fetchImpl: async (url, init) => {
      exchangeRequest = { url, init, body: JSON.parse(init.body) };
      return Response.json({
        protocol: "wf-blogger-handoff/v1",
        audience: "sportmassagefuengirola",
        subject: { role: "client", userId: "user-1", projectId: "project-1" },
      });
    },
  });
  t.after(app.close);
  const response = await fetch(`${app.url}/admin/blogger/launch`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    body: JSON.stringify({ code: "A".repeat(43) }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(exchangeRequest.url, "https://studio.example.com/api/tool-launch/exchange");
  assert.equal(exchangeRequest.body.audience, "sportmassagefuengirola");
  assert.equal(exchangeRequest.init.headers.Authorization, `Bearer ${"handoff_7Nv!P3qR9mC2xW8kT5dL1yF6jH4sA0e"}`);
  const session = await fetch(`${app.url}/api/admin/session`, {
    headers: { cookie: cookie(response) },
  });
  const body = await session.json();
  assert.equal(body.source, "studio");
  assert.deepEqual(body.scope, ["blogger"]);
  const audit = fs.readFileSync(path.join(app.root, ".blogger-state/audit.ndjson"), "utf8");
  assert.match(audit, /"origin":"studio"/);
});

test("Studio handoff rejects a response with the wrong protocol", async (t) => {
  const app = await listen({
    fetchImpl: async () => Response.json({
      protocol: "unexpected/v2",
      audience: "sportmassagefuengirola",
      subject: { role: "client", userId: "user-1" },
    }),
  });
  t.after(app.close);
  const response = await fetch(`${app.url}/admin/blogger/launch`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    body: JSON.stringify({ code: "A".repeat(43) }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_or_expired_ticket" });
});

test("login rate limiting is generic and its backing store remains bounded", async (t) => {
  const app = await listen({ maxRateLimitEntries: 2 });
  t.after(app.close);
  for (let index = 0; index < 2; index += 1) {
    const failed = await login(app, { username: `wrong-${index}`, password: "Wrong-Password-2026!" });
    assert.equal(failed.status, 401);
    assert.deepEqual(await failed.json(), { error: "authentication_failed" });
  }
  const blocked = await login(app);
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: "authentication_failed" });
  assert.match(blocked.headers.get("retry-after") ?? "", /^\d+$/);
});

test("rate limiting separates validated reverse-proxy client addresses", async (t) => {
  const app = await listen();
  t.after(app.close);
  for (let index = 0; index < 2; index += 1) {
    const failed = await login(app, {
      username: "wrong-user",
      password: "Wrong-Password-2026!",
      headers: { "x-real-ip": "203.0.113.10" },
    });
    assert.equal(failed.status, 401);
  }
  const separateClient = await login(app, {
    headers: { "x-real-ip": "203.0.113.11" },
  });
  assert.equal(separateClient.status, 200);
});

test("anonymous clients cannot mutate posts, media or builds", async (t) => {
  const app = await listen();
  t.after(app.close);
  for (const [route, method] of [
    ["/api/posts", "POST"],
    ["/api/posts/example", "PUT"],
    ["/api/posts/example", "DELETE"],
    ["/api/posts/example/images", "POST"],
    ["/api/build", "POST"],
  ]) {
    const response = await fetch(`${app.url}${route}`, {
      method,
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 401, `${method} ${route}`);
  }
});

test("health and discovery are secret-free and fail closed", async (t) => {
  const app = await listen();
  t.after(app.close);
  for (const route of ["/api/blogger/health", "/.well-known/wf-blogger.json"]) {
    const response = await fetch(`${app.url}${route}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.audience, "sportmassagefuengirola");
    assert.deepEqual(body.capabilities, ["posts", "media", "publish", "unpublish"]);
    const encoded = JSON.stringify(body);
    for (const secret of ["session_", "handoff_", "sofia-blogger", app.root, "websiteId"]) {
      assert.equal(encoded.includes(secret), false);
    }
  }
  assert.throws(
    () => serverModule.createPostManagerServer({ projectRoot: fixture(), env: {} }),
    /configuration|missing/i,
  );
});

test("relative state, content, media and output paths resolve inside the project root", async (t) => {
  const app = await listen({
    env: {
      BLOGGER_STATE_DIR: ".state",
      BLOGGER_CONTENT_ROOT: "sources",
      BLOGGER_MEDIA_ROOT: "sources/media",
      BLOGGER_OUTPUT_ROOT: "public-blog",
    },
  });
  t.after(app.close);
  assert.equal(fs.existsSync(path.join(app.root, ".state")), true);
  assert.equal(fs.existsSync(path.join(app.root, "sources")), true);
  assert.equal(fs.existsSync(path.join(app.root, "public-blog")), true);
});

test("logout destroys the local session", async (t) => {
  const app = await listen();
  t.after(app.close);
  const loggedIn = await login(app);
  const sessionCookie = cookie(loggedIn);
  const logout = await fetch(`${app.url}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: sessionCookie, origin: "http://127.0.0.1" },
  });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
  const session = await fetch(`${app.url}/api/admin/session`, {
    headers: { cookie: sessionCookie },
  });
  assert.equal(session.status, 401);
});

test("authenticated media upload, metadata update and deletion match the editor contract", async (t) => {
  const app = await listen();
  t.after(app.close);
  const loggedIn = await login(app);
  const sessionCookie = cookie(loggedIn);
  const headers = {
    cookie: sessionCookie,
    origin: "http://127.0.0.1",
    "content-type": "application/json",
  };
  const created = await fetch(`${app.url}/api/posts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Media post",
      slug: "media-post",
      description: "A post used to verify the editor media API.",
      date: "2026-10-17",
      lang: "es",
      author: "Sport Massage in Fuengirola",
      status: "draft",
      image: "",
      tags: [],
      category: "Bienestar",
      level: "",
      body: "Media body",
    }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const uploaded = await fetch(`${app.url}/api/posts/media-post/images`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fileName: "cover.png",
      data: `data:image/png;base64,${Buffer.from("png-fixture").toString("base64")}`,
    }),
  });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  assert.equal((await uploaded.json()).url, "/blog/media/media-post/cover.png");
  const metadata = await fetch(`${app.url}/api/posts/media-post/images/cover.png`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ alt: "Massage recovery", description: "Cover", isFeatured: true }),
  });
  assert.equal(metadata.status, 200, await metadata.clone().text());
  const loaded = await fetch(`${app.url}/api/posts/media-post`, {
    headers: { cookie: sessionCookie },
  });
  assert.deepEqual((await loaded.json()).images[0], {
    file: "cover.png",
    url: "/blog/media/media-post/cover.png",
    alt: "Massage recovery",
    description: "Cover",
    isFeatured: true,
    canDelete: true,
  });
  const removed = await fetch(`${app.url}/api/posts/media-post/images/cover.png`, {
    method: "DELETE",
    headers: { cookie: sessionCookie, origin: "http://127.0.0.1" },
  });
  assert.equal(removed.status, 204);
});

test("editing a published post rolls source and public output back when rebuild fails", async (t) => {
  const root = fixture();
  let failBuild = false;
  const build = async () => {
    const source = JSON.parse(fs.readFileSync(path.join(root, "content/blog/published-edit.json"), "utf8"));
    fs.writeFileSync(path.join(root, "blog/index.html"), `${source.title}\n`);
    if (failBuild) throw new Error("fixture build failed");
  };
  const app = await listen({ root, build });
  t.after(app.close);
  const loggedIn = await login(app);
  const headers = {
    cookie: cookie(loggedIn),
    origin: "http://127.0.0.1",
    "content-type": "application/json",
  };
  const original = {
    title: "Original published title",
    slug: "published-edit",
    description: "A published post used to verify transactional edits.",
    date: "2026-10-17",
    lang: "es",
    author: "Sport Massage in Fuengirola",
    status: "published",
    image: "",
    tags: [],
    category: "Bienestar",
    level: "",
    body: "Original body",
  };
  const created = await fetch(`${app.url}/api/posts`, {
    method: "POST",
    headers,
    body: JSON.stringify(original),
  });
  assert.equal(created.status, 201, await created.clone().text());
  assert.equal(fs.readFileSync(path.join(root, "blog/index.html"), "utf8"), "Original published title\n");

  failBuild = true;
  const failed = await fetch(`${app.url}/api/posts/published-edit`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...original, title: "Broken replacement" }),
  });
  assert.equal(failed.status, 500);
  const source = JSON.parse(fs.readFileSync(path.join(root, "content/blog/published-edit.json"), "utf8"));
  assert.equal(source.title, "Original published title");
  assert.equal(source.status, "published");
  assert.equal(fs.readFileSync(path.join(root, "blog/index.html"), "utf8"), "Original published title\n");
});

test("the protected build endpoint returns after its configured timeout", async (t) => {
  const app = await listen({
    env: { BLOGGER_BUILD_TIMEOUT_MS: "40" },
    build: async () => new Promise(() => {}),
  });
  t.after(app.close);
  const loggedIn = await login(app);
  const started = Date.now();
  const response = await fetch(`${app.url}/api/build`, {
    method: "POST",
    headers: {
      cookie: cookie(loggedIn),
      origin: "http://127.0.0.1",
      "content-type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(500),
  }).catch(() => null);
  assert.notEqual(response, null, "build endpoint exceeded its timeout");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal_error" });
  assert.ok(Date.now() - started < 1_000);
});
