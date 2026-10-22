import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer as createTcpServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const serverModule = await import("../scripts/post-manager-server.mjs").catch(
  () => ({}),
);
const auth = await import("../scripts/blogger-launch-session.mjs").catch(
  () => ({}),
);
const editorSchema = await import("../admin/blogger/editor-schema.js").catch(() => ({}));
const generator = await import("../scripts/generate-blog.mjs").catch(() => ({}));
const repositoryRoot = path.resolve(import.meta.dirname, "..");

const password = "Massage-Blogger-Only-2026!";
const handoffRequest = (code) => JSON.stringify({
  protocol: "wf-blogger-handoff/v1",
  code,
  siteKey: "sportmassagefuengirola",
});
const handoffTicket = (overrides = {}) => ({
  protocol: "wf-blogger-handoff/v1",
  siteKey: "sportmassagefuengirola",
  audience: "https://sportmassagefuengirola.com",
  subject: { role: "client", userId: "user-1", clientId: "client-1", projectId: "project-1" },
  ...overrides,
});

test("listen host defaults to loopback and accepts an explicit container address", () => {
  assert.equal(serverModule.resolveListenHost(), "127.0.0.1");
  assert.equal(serverModule.resolveListenHost("0.0.0.0"), "0.0.0.0");
  assert.throws(() => serverModule.resolveListenHost("blogger.internal"), /HOST is invalid/);
});

test("client IP trusts a validated proxy header only for loopback or explicit proxy mode", () => {
  const request = (peer, forwarded) => ({
    socket: { remoteAddress: peer },
    headers: forwarded === undefined ? {} : { "x-real-ip": forwarded },
  });
  assert.equal(serverModule.resolveClientKey(request("198.51.100.20", "203.0.113.8"), false), "198.51.100.20");
  assert.equal(serverModule.resolveClientKey(request("198.51.100.20", "203.0.113.8"), true), "203.0.113.8");
  assert.equal(serverModule.resolveClientKey(request("127.0.0.1", "203.0.113.9"), false), "203.0.113.9");
  assert.equal(serverModule.resolveClientKey(request("198.51.100.20", "not-an-ip"), true), "198.51.100.20");
  assert.equal(serverModule.resolveClientKey(request("198.51.100.20", "203.0.113.8, 203.0.113.9"), true), "198.51.100.20");
});

test("graceful shutdown forces termination after its timeout", async () => {
  const signals = new EventEmitter();
  let closeCalls = 0;
  let forcedConnections = 0;
  let exitCode = null;
  const server = {
    close() { closeCalls += 1; },
    closeAllConnections() { forcedConnections += 1; },
  };
  serverModule.installGracefulShutdown(server, {
    signalSource: signals,
    timeoutMs: 10,
    forceExit(code) { exitCode = code; },
  });
  signals.emit("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(closeCalls, 1);
  assert.equal(forcedConnections, 1);
  assert.equal(exitCode, 1);
});

async function reservePort() {
  const reservation = createTcpServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  return port;
}

async function waitForOutput(stream, expected) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
    if (output.includes(expected)) return output;
  }
  throw new Error(`Process ended before output: ${expected}`);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  test(`standalone server closes cleanly on ${signal}`, async (t) => {
    const runtime = fs.mkdtempSync(path.join(repositoryRoot, ".shutdown-test-"));
    t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
    const port = await reservePort();
    const passwordHash = await auth.generatePasswordHash(password);
    const relativeRuntime = path.relative(repositoryRoot, runtime);
    const child = spawn(process.execPath, ["scripts/post-manager-server.mjs"], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: String(port),
        BLOGGER_PUBLIC_ORIGIN: "https://sportmassagefuengirola.com",
        BLOGGER_STUDIO_ORIGIN: "https://studio.example.com",
        BLOGGER_STUDIO_EXCHANGE_URL: "https://studio.example.com/api/tool-launch/exchange",
        BLOGGER_DIRECT_USERNAME: "sportsmassage",
        BLOGGER_DIRECT_PASSWORD_HASH: passwordHash,
        BLOGGER_SESSION_SECRET: "session_4Yz!Q9mP2vK7xN5cR8tL3wD6hF1sJ0aB",
        BLOGGER_HANDOFF_SECRET: "handoff_7Nv!P3qR9mC2xW8kT5dL1yF6jH4sA0e",
        BLOGGER_TEST_ORIGIN: "http://127.0.0.1",
        BLOGGER_CONTENT_ROOT: path.join(relativeRuntime, "content/blog"),
        BLOGGER_MEDIA_ROOT: path.join(relativeRuntime, "content/blog/media"),
        BLOGGER_STATE_DIR: path.join(relativeRuntime, "state"),
        BLOGGER_OUTPUT_ROOT: path.join(relativeRuntime, "state/public"),
      },
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    });
    const expected = `Sport Massage Blogger listening on 127.0.0.1:${port}`;
    await waitForOutput(child.stdout, expected);
    child.kill(signal);
    const [code, exitSignal] = await once(child, "exit");
    assert.equal(code, 0);
    assert.equal(exitSignal, null);
  });
}

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
    BLOGGER_DIRECT_USERNAME: "sportsmassage",
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
    handoffPerIpLimit: overrides.handoffPerIpLimit,
    handoffGlobalLimit: overrides.handoffGlobalLimit,
    maxConcurrentHandoffs: overrides.maxConcurrentHandoffs,
    maxHandoffResponseBytes: overrides.maxHandoffResponseBytes,
    accessSync: overrides.accessSync,
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
      username: body.username ?? "sportsmassage",
      password: body.password ?? password,
      remember: body.remember ?? false,
    }),
  });
}

test("wrong usernames still execute one password derivation", async () => {
  assert.equal(typeof serverModule.verifyDirectCredentials, "function");
  let derivations = 0;
  const valid = await serverModule.verifyDirectCredentials({
    suppliedUsername: "unknown-user",
    suppliedPassword: "Wrong-Password-2026!",
    expectedUsername: "sportsmassage",
    passwordHash: "encoded-password-hash",
    passwordVerifier: async (password, encoded) => {
      derivations += 1;
      assert.equal(password, "Wrong-Password-2026!");
      assert.equal(encoded, "encoded-password-hash");
      return true;
    },
  });
  assert.equal(valid, false);
  assert.equal(derivations, 1);
});

test("direct credentials grant Blogger scope only and audit direct origin", async (t) => {
  const app = await listen();
  t.after(app.close);
  const response = await login(app);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-sportmassage_blogger_session=.*HttpOnly; Secure; SameSite=Strict/);
  const signedToken = cookie(response).split("=", 2)[1];
  const session = await fetch(`${app.url}/api/admin/session`, {
    headers: { cookie: cookie(response) },
  });
  assert.deepEqual(await session.json(), {
    authenticated: true,
    source: "direct",
    scope: ["blogger"],
    subject: { role: "blogger_editor", username: "sportsmassage" },
  });
  const audit = fs.readFileSync(path.join(app.root, ".blogger-state/audit.ndjson"), "utf8");
  assert.match(audit, /"origin":"direct"/);
  assert.doesNotMatch(audit, new RegExp(password));
  assert.equal(audit.includes(signedToken), false);
  const rejected = await login(app, { password: "Synthetic-Wrong-Password-2026!" });
  const errorBody = await rejected.text();
  assert.equal(errorBody, '{"error":"authentication_failed"}');
  assert.equal(errorBody.includes("Synthetic-Wrong-Password-2026!"), false);
  assert.equal(errorBody.includes(signedToken), false);
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

test("short direct sessions keep the configured lifetime and do not survive restart", async (t) => {
  const root = fixture();
  const firstApp = await listen({ root });
  t.after(async () => { if (firstApp.server.listening) await firstApp.close(); });
  const loggedIn = await login(firstApp, { remember: false });
  const sessionCookie = cookie(loggedIn);
  assert.match(loggedIn.headers.get("set-cookie") ?? "", /Max-Age=28800/);
  assert.equal(fs.existsSync(path.join(root, ".blogger-state/sessions.json")), false);
  await firstApp.close();

  const restarted = await listen({ root });
  t.after(restarted.close);
  const session = await fetch(`${restarted.url}/api/admin/session`, {
    headers: { cookie: sessionCookie },
  });
  assert.equal(session.status, 401);
});

test("remembered direct sessions use a 30-day cookie and survive restart without persisting credentials", async (t) => {
  const root = fixture();
  const firstApp = await listen({ root });
  t.after(async () => { if (firstApp.server.listening) await firstApp.close(); });
  const loggedIn = await login(firstApp, { remember: true });
  const sessionCookie = cookie(loggedIn);
  assert.match(loggedIn.headers.get("set-cookie") ?? "", /Max-Age=2592000/);
  const sessionFile = path.join(root, ".blogger-state/sessions.json");
  assert.equal(fs.statSync(sessionFile).mode & 0o777, 0o600);
  const state = fs.readFileSync(sessionFile, "utf8");
  assert.doesNotMatch(state, new RegExp(password));
  assert.doesNotMatch(state, /Massage-Blogger|__Host-|scrypt\$|\.[A-Za-z0-9_-]{43}/);
  await firstApp.close();

  const restarted = await listen({ root });
  t.after(restarted.close);
  const session = await fetch(`${restarted.url}/api/admin/session`, {
    headers: { cookie: sessionCookie },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).source, "direct");
});

test("remembered session rotation and logout delete the prior persistent record", async (t) => {
  const app = await listen();
  t.after(app.close);
  const first = await login(app, { remember: true });
  const firstCookie = cookie(first);
  const second = await login(app, { remember: true, headers: { cookie: firstCookie } });
  const secondCookie = cookie(second);
  assert.notEqual(secondCookie, firstCookie);
  assert.equal((await fetch(`${app.url}/api/admin/session`, { headers: { cookie: firstCookie } })).status, 401);
  const logout = await fetch(`${app.url}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: secondCookie, origin: "http://127.0.0.1" },
  });
  assert.equal(logout.status, 204);
  const persisted = JSON.parse(fs.readFileSync(path.join(app.root, ".blogger-state/sessions.json"), "utf8"));
  assert.deepEqual(persisted.records, []);
});

test("persistent session stores prune expired records and remain bounded", () => {
  assert.equal(typeof auth.createSessionStore, "function");
  const root = fixture();
  const sessionFile = path.join(root, ".blogger-state/sessions.json");
  let clock = 1_700_000_000_000;
  const options = {
    maxEntries: 2,
    ttlMs: 1_000,
    rememberedTtlMs: 30 * 24 * 60 * 60 * 1_000,
    persistentFile: sessionFile,
    now: () => clock,
    secret: "session_4Yz!Q9mP2vK7xN5cR8tL3wD6hF1sJ0aB",
  };
  const store = auth.createSessionStore(options);
  store.create({ source: "direct", scope: ["blogger"], marker: "first" }, { remembered: true });
  const retained = store.create({ source: "direct", scope: ["blogger"], marker: "second" }, { remembered: true });
  store.create({ source: "direct", scope: ["blogger"], marker: "third" }, { remembered: true });
  assert.equal(store.size, 2);
  assert.equal(store.get(retained).marker, "second");
  clock += 30 * 24 * 60 * 60 * 1_000 + 1;
  const restarted = auth.createSessionStore(options);
  assert.equal(restarted.size, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(sessionFile, "utf8")).records, []);
});

test("Studio handoff exchanges the exact site audience and records studio origin", async (t) => {
  let exchangeRequest;
  const app = await listen({
    fetchImpl: async (url, init) => {
      exchangeRequest = { url, init, body: JSON.parse(init.body) };
      return Response.json({
        protocol: "wf-blogger-handoff/v1",
        siteKey: "sportmassagefuengirola",
        audience: "https://sportmassagefuengirola.com",
        subject: { role: "client", userId: "user-1", clientId: "client-1", projectId: "project-1" },
      });
    },
  });
  t.after(app.close);
  const response = await fetch(`${app.url}/admin/blogger/launch`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    body: handoffRequest("A".repeat(43)),
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(exchangeRequest.url, "https://studio.example.com/api/tool-launch/exchange");
  assert.deepEqual(exchangeRequest.body, {
    protocol: "wf-blogger-handoff/v1",
    code: "A".repeat(43),
    siteKey: "sportmassagefuengirola",
  });
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

test("handoff exchange serializers and validators enforce the exact v1 contract", () => {
  assert.equal(typeof serverModule.serializeHandoffExchangeRequest, "function");
  assert.equal(typeof serverModule.validateHandoffExchangeResponse, "function");
  const code = "C".repeat(43);
  assert.deepEqual(JSON.parse(serverModule.serializeHandoffExchangeRequest(code)), {
    protocol: "wf-blogger-handoff/v1",
    code,
    siteKey: "sportmassagefuengirola",
  });
  const ticket = {
    protocol: "wf-blogger-handoff/v1",
    siteKey: "sportmassagefuengirola",
    audience: "https://sportmassagefuengirola.com",
    subject: { role: "admin", userId: "user-1", clientId: null, projectId: "project-1" },
  };
  assert.deepEqual(serverModule.validateHandoffExchangeResponse(ticket), ticket.subject);
  for (const invalid of [
    { ...ticket, protocol: "wrong" },
    { ...ticket, siteKey: "other" },
    { ...ticket, audience: "sportmassagefuengirola" },
    { ...ticket, extra: true },
    { ...ticket, subject: { ...ticket.subject, role: "owner" } },
  ]) assert.equal(serverModule.validateHandoffExchangeResponse(invalid), null);
});

test("Studio handoff rejects a response with the wrong protocol", async (t) => {
  const app = await listen({
    fetchImpl: async () => Response.json(handoffTicket({ protocol: "unexpected/v2" })),
  });
  t.after(app.close);
  const response = await fetch(`${app.url}/admin/blogger/launch`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    body: handoffRequest("A".repeat(43)),
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

test("discovery stays public while readiness is redacted and fails closed until an active writable release exists", async (t) => {
  let deniedPath;
  let deniedMode = 0;
  const app = await listen({
    accessSync: (candidate, mode) => {
      if (candidate === deniedPath && (mode & deniedMode)) {
        const error = new Error("Permission denied");
        error.code = "EACCES";
        throw error;
      }
      fs.accessSync(candidate, mode);
    },
  });
  t.after(app.close);
  const discovery = await fetch(`${app.url}/.well-known/wf-blogger.json`);
  assert.equal(discovery.status, 200);
  assert.deepEqual((await discovery.json()).capabilities, ["posts", "media", "publish", "unpublish"]);
  const unavailable = await fetch(`${app.url}/api/blogger/health`);
  assert.equal(unavailable.status, 503);
  const unavailableBody = await unavailable.json();
  assert.equal(unavailableBody.ready, false); assert.equal(unavailableBody.checks.activeRelease, false);
  fs.mkdirSync(path.join(app.root, ".blogger-state/public/releases/1700000000000-0123456789abcdef"), { recursive: true, mode: 0o750 });
  fs.writeFileSync(path.join(app.root, ".blogger-state/public/releases/1700000000000-0123456789abcdef/index.html"), "ready", { mode: 0o640 });
  fs.symlinkSync("releases/1700000000000-0123456789abcdef", path.join(app.root, ".blogger-state/public/current"));
  const ready = await fetch(`${app.url}/api/blogger/health`);
  assert.equal(ready.status, 200); assert.equal((await ready.json()).ready, true);
  deniedPath = path.join(app.root, "content/blog"); deniedMode = fs.constants.W_OK;
  const unwritable = await fetch(`${app.url}/api/blogger/health`);
  assert.equal(unwritable.status, 503); assert.equal((await unwritable.json()).checks.contentWritable, false);
  deniedPath = path.join(app.root, ".blogger-state/public/releases/1700000000000-0123456789abcdef/index.html"); deniedMode = fs.constants.R_OK;
  const unreadableRelease = await fetch(`${app.url}/api/blogger/health`);
  assert.equal(unreadableRelease.status, 503); assert.equal((await unreadableRelease.json()).checks.activeRelease, false);
  deniedPath = undefined; deniedMode = 0;
  fs.mkdirSync(path.join(app.root, ".blogger-state/transaction"), { recursive: true });
  fs.writeFileSync(path.join(app.root, ".blogger-state/transaction/journal.json"), "{}");
  const unresolved = await fetch(`${app.url}/api/blogger/health`);
  assert.equal(unresolved.status, 503); assert.equal((await unresolved.json()).checks.recoveryResolved, false);
  fs.rmSync(path.join(app.root, ".blogger-state/transaction"), { recursive: true, force: true });
  for (const body of [unavailableBody, await (await fetch(`${app.url}/api/blogger/health`)).json()]) {
    const encoded = JSON.stringify(body);
    for (const secret of ["session_", "handoff_", "sofia-blogger", app.root, "websiteId", "content/blog"]) assert.equal(encoded.includes(secret), false);
  }
  assert.throws(
    () => serverModule.createPostManagerServer({ projectRoot: fixture(), env: {} }),
    /configuration|missing/i,
  );
});

test("concurrent anonymous health reads do not queue behind or add store writes", async (t) => {
  let releaseBuild;
  let markBuildStarted;
  let buildCount = 0;
  const buildStarted = new Promise((resolve) => { markBuildStarted = resolve; });
  const buildBlocked = new Promise((resolve) => { releaseBuild = resolve; });
  const app = await listen({
    build: async ({ releaseRoot }) => {
      buildCount += 1;
      fs.mkdirSync(releaseRoot, { recursive: true });
      fs.writeFileSync(path.join(releaseRoot, "index.html"), "release\n");
      markBuildStarted();
      await buildBlocked;
    },
  });
  t.after(app.close);
  const loggedIn = await login(app);
  const buildRequest = fetch(`${app.url}/api/build`, {
    method: "POST",
    headers: {
      cookie: cookie(loggedIn),
      origin: "http://127.0.0.1",
      "content-type": "application/json",
    },
    body: "{}",
  });
  await buildStarted;
  const healthRequests = Promise.all(Array.from({ length: 4 }, () => fetch(`${app.url}/api/blogger/health`)));
  let watchdog;
  const completedBeforeRelease = await Promise.race([
    healthRequests.then(() => true),
    new Promise((resolve) => { watchdog = setTimeout(() => resolve(false), 1_000); }),
  ]);
  clearTimeout(watchdog);
  releaseBuild();
  const healthResponses = await healthRequests;
  const built = await buildRequest;
  assert.equal(completedBeforeRelease, true);
  assert.equal(buildCount, 1);
  assert.equal(built.status, 200);
  assert.deepEqual(healthResponses.map((response) => response.status), [503, 503, 503, 503]);
});

test("Studio launch exchange is bounded by per-IP, global and concurrency limits with generic failures", async (t) => {
  let release;
  let exchanges = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  const app = await listen({
    handoffPerIpLimit: 2, handoffGlobalLimit: 2, maxConcurrentHandoffs: 1, maxHandoffResponseBytes: 512,
    fetchImpl: async () => { exchanges += 1; if (exchanges === 1) await pending; return Response.json(handoffTicket()); },
  });
  t.after(app.close);
  const launch = (ip = "203.0.113.20") => fetch(`${app.url}/admin/blogger/launch`, { method:"POST", headers:{ "content-type":"application/json", origin:"http://127.0.0.1", "x-real-ip":ip }, body:handoffRequest("A".repeat(43)) });
  const first = launch(); await new Promise((resolve) => setTimeout(resolve, 30));
  const concurrent = await launch("203.0.113.21");
  release(); const firstResponse = await first;
  assert.equal(concurrent.status, 429); assert.deepEqual(await concurrent.json(), { error:"launch_unavailable" });
  assert.equal(firstResponse.status, 200);

  const oversized = await listen({ maxHandoffResponseBytes: 64, fetchImpl: async () => new Response(JSON.stringify({ padding:"x".repeat(500) }), { status:200, headers:{ "content-type":"application/json" } }) });
  t.after(oversized.close);
  const failed = await fetch(`${oversized.url}/admin/blogger/launch`, { method:"POST", headers:{ "content-type":"application/json", origin:"http://127.0.0.1" }, body:handoffRequest("B".repeat(43)) });
  assert.equal(failed.status, 401); assert.deepEqual(await failed.json(), { error:"invalid_or_expired_ticket" });
});

test("Studio launch reserves concurrency before reading the body and releases it after parse errors", async (t) => {
  let exchanges = 0;
  const app = await listen({
    handoffPerIpLimit: 10,
    handoffGlobalLimit: 10,
    maxConcurrentHandoffs: 1,
    fetchImpl: async () => {
      exchanges += 1;
      return Response.json(handoffTicket());
    },
  });
  t.after(app.close);
  const requestObserved = once(app.server, "request");
  let finishSlow;
  const slowResponse = new Promise((resolve, reject) => {
    const request = httpRequest(`${app.url}/admin/blogger/launch`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    request.once("error", reject);
    request.write('{"code":');
    finishSlow = () => request.end("not-json}");
  });
  await requestObserved;
  const concurrent = await fetch(`${app.url}/admin/blogger/launch`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    body: handoffRequest("A".repeat(43)),
  });
  finishSlow();
  const slowStatus = await slowResponse;
  assert.equal(concurrent.status, 429);
  assert.equal(slowStatus, 400);
  const afterParseError = await fetch(`${app.url}/admin/blogger/launch`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    body: handoffRequest("B".repeat(43)),
  });
  assert.equal(afterParseError.status, 200);
  assert.equal(exchanges, 1);
});

test("Studio launch rate limits are independently enforced per IP and globally", async (t) => {
  const ticket = () => Response.json(handoffTicket());
  const perIp = await listen({ handoffPerIpLimit:1, handoffGlobalLimit:10, fetchImpl:async()=>ticket() }); t.after(perIp.close);
  const launch = (app, ip, code) => fetch(`${app.url}/admin/blogger/launch`, { method:"POST", headers:{ "content-type":"application/json", origin:"http://127.0.0.1", "x-real-ip":ip }, body:handoffRequest(code.repeat(43)) });
  assert.equal((await launch(perIp, "203.0.113.30", "A")).status, 200);
  assert.equal((await launch(perIp, "203.0.113.30", "B")).status, 429);
  assert.equal((await launch(perIp, "203.0.113.31", "C")).status, 200);
  const global = await listen({ handoffPerIpLimit:10, handoffGlobalLimit:1, fetchImpl:async()=>ticket() }); t.after(global.close);
  assert.equal((await launch(global, "203.0.113.40", "D")).status, 200);
  const blocked = await launch(global, "203.0.113.41", "E"); assert.equal(blocked.status, 429); assert.deepEqual(await blocked.json(), { error:"launch_unavailable" });
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
  const malformed = await fetch(`${app.url}/api/posts/media-post/images`, {
    method: "POST", headers,
    body: JSON.stringify({ fileName: "fake.png", data: `data:image/png;base64,${Buffer.from("not-an-image").toString("base64")}` }),
  });
  assert.equal(malformed.status, 400); assert.deepEqual(await malformed.json(), { error: "invalid_request" });
  const mismatch = await fetch(`${app.url}/api/posts/media-post/images`, {
    method: "POST", headers,
    body: JSON.stringify({ fileName: "wrong.jpg", data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }),
  });
  assert.equal(mismatch.status, 400);
  const uploaded = await fetch(`${app.url}/api/posts/media-post/images`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fileName: "cover.png",
      data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
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
  const build = async ({ releaseRoot }) => {
    const source = JSON.parse(fs.readFileSync(path.join(root, "content/blog/published-edit.json"), "utf8"));
    fs.mkdirSync(releaseRoot, { recursive: true });
    fs.writeFileSync(path.join(releaseRoot, "index.html"), `${source.title}\n`);
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
  assert.equal(fs.readFileSync(path.join(root, ".blogger-state/public/current/index.html"), "utf8"), "Original published title\n");

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
  assert.equal(fs.readFileSync(path.join(root, ".blogger-state/public/current/index.html"), "utf8"), "Original published title\n");
});

test("service transactions and versioned releases stay under the configured writable state directory", async (t) => {
  const root = fixture();
  let observed = false;
  const app = await listen({
    root,
    env: { BLOGGER_STATE_DIR: ".service-state" },
    build: async ({ releaseRoot }) => {
      assert.equal(releaseRoot.startsWith(path.join(root, ".service-state/public/releases")), true);
      assert.equal(fs.existsSync(path.join(root, ".service-state/transaction")), true);
      fs.mkdirSync(releaseRoot, { recursive: true });
      fs.writeFileSync(path.join(releaseRoot, "index.html"), "published\n");
      observed = true;
    },
  });
  t.after(app.close);
  const loggedIn = await login(app);
  const response = await fetch(`${app.url}/api/posts`, {
    method: "POST",
    headers: { cookie: cookie(loggedIn), origin: "http://127.0.0.1", "content-type": "application/json" },
    body: JSON.stringify({
      title: "Atomic create", slug: "atomic-create", description: "Created and published in one mutation.",
      date: "2026-10-18", lang: "es", author: "Sport Massage in Fuengirola", status: "published",
      image: "", tags: [], category: "Bienestar", level: "", body: "Body",
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal(observed, true);
  assert.equal(fs.lstatSync(path.join(root, ".service-state/public/current")).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(root, ".blogger-transaction")), false);
});

test("the retained build endpoint is serialized with publishing through the rollback-safe writer", async (t) => {
  let active = 0;
  let maximum = 0;
  const app = await listen({
    build: async ({ releaseRoot }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      fs.mkdirSync(releaseRoot, { recursive: true });
      fs.writeFileSync(path.join(releaseRoot, "index.html"), "built\n");
      active -= 1;
    },
  });
  t.after(app.close);
  const loggedIn = await login(app);
  const headers = { cookie: cookie(loggedIn), origin: "http://127.0.0.1", "content-type": "application/json" };
  await fetch(`${app.url}/api/posts`, {
    method: "POST", headers,
    body: JSON.stringify({ title: "Draft", slug: "draft", description: "Draft post for serialized build coverage.", date: "2026-10-18", lang: "es", author: "Author", status: "draft", image: "", tags: [], category: "", level: "", body: "Body" }),
  });
  const [published, rebuilt] = await Promise.all([
    fetch(`${app.url}/api/posts/draft/publish`, { method: "POST", headers, body: "{}" }),
    fetch(`${app.url}/api/build`, { method: "POST", headers, body: "{}" }),
  ]);
  assert.equal(published.status, 200, await published.clone().text());
  assert.equal(rebuilt.status, 200, await rebuilt.clone().text());
  assert.equal(maximum, 1);
});

test("real editor payload persists canonical Markdown and renders safe editor features through HTTP", async (t) => {
  assert.equal(typeof editorSchema.normalizeEditorPostPayload, "function");
  const root = fixture();
  const app = await listen({
    root,
    build: ({ releaseRoot }) => generator.generateBlog({
      root,
      contentRoot: path.join(root, "content/blog"),
      mediaRoot: path.join(root, "content/blog/media"),
      outputRoot: path.join(releaseRoot, "blog"),
    }),
  });
  t.after(app.close);
  const loggedIn = await login(app);
  const headers = { cookie: cookie(loggedIn), origin: "http://127.0.0.1", "content-type": "application/json" };
  const rawEditorPayload = {
    title: "Editor contract", slug: "editor-contract", description: "Rendered from the real editor schema.",
    date: "2026-02-28", lang: "en", author: "Sport Massage in Fuengirola", status: "draft",
    image: "", tags: " recovery, mobility, recovery , ", category: "Recovery", level: "",
    content_format: "html",
    body: "## Recovery\n\nA **strong** and *gentle* paragraph with [safe guidance](https://example.com/help).\n\n- First\n- Second\n\n![Inline recovery](/blog/media/editor-contract/cover.png)\n\n[unsafe](javascript:alert(1))",
  };
  const payload = editorSchema.normalizeEditorPostPayload(rawEditorPayload);
  assert.deepEqual(payload.tags, ["recovery", "mobility"]);
  assert.equal(payload.content_format, "markdown");
  const created = await fetch(`${app.url}/api/posts`, { method: "POST", headers, body: JSON.stringify(payload) });
  assert.equal(created.status, 201, await created.clone().text());

  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const uploaded = await fetch(`${app.url}/api/posts/editor-contract/images`, {
    method: "POST", headers,
    body: JSON.stringify({ fileName: "cover.png", data: `data:image/png;base64,${onePixelPng.toString("base64")}` }),
  });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const metadata = await fetch(`${app.url}/api/posts/editor-contract/images/cover.png`, {
    method: "PUT", headers,
    body: JSON.stringify({ alt: "Featured recovery", description: "Treatment room", isFeatured: true }),
  });
  assert.equal(metadata.status, 200, await metadata.clone().text());
  const published = await fetch(`${app.url}/api/posts/editor-contract`, {
    method: "PUT", headers, body: JSON.stringify({ ...payload, status: "published" }),
  });
  assert.equal(published.status, 200, await published.clone().text());

  const stored = JSON.parse(fs.readFileSync(path.join(root, "content/blog/editor-contract.json"), "utf8"));
  assert.deepEqual(stored.tags, ["recovery", "mobility"]);
  assert.equal(stored.content_format, "markdown");
  const article = fs.readFileSync(path.join(root, ".blogger-state/public/current/blog/editor-contract/index.html"), "utf8");
  assert.match(article, /<html lang="en">/);
  assert.match(article, /<h2>Recovery<\/h2>/);
  assert.match(article, /<strong>strong<\/strong>/);
  assert.match(article, /<em>gentle<\/em>/);
  assert.match(article, /<a href="https:\/\/example\.com\/help"/);
  assert.match(article, /<ul>\s*<li>First<\/li>\s*<li>Second<\/li>\s*<\/ul>/);
  assert.match(article, /class="featured-image"[\s\S]*alt="Featured recovery"[\s\S]*Treatment room/);
  assert.match(article, /src="\/blog\/media\/editor-contract\/cover\.png" alt="Inline recovery"/);
  assert.doesNotMatch(article, /href="javascript:|<script/i);
});

test("post schema rejects impossible calendar dates and unsupported HTML content", async (t) => {
  const app = await listen();
  t.after(app.close);
  const loggedIn = await login(app);
  const headers = { cookie: cookie(loggedIn), origin: "http://127.0.0.1", "content-type": "application/json" };
  const base = { title: "Invalid schema", slug: "invalid-schema", description: "Invalid date and format coverage.", date: "2026-02-30", lang: "es", author: "Author", status: "draft", image: "", tags: ["one", "two"], category: "", level: "", content_format: "markdown", body: "Body" };
  const invalidDate = await fetch(`${app.url}/api/posts`, { method: "POST", headers, body: JSON.stringify(base) });
  assert.equal(invalidDate.status, 400);
  const html = await fetch(`${app.url}/api/posts`, { method: "POST", headers, body: JSON.stringify({ ...base, slug: "unsafe-html", date: "2026-02-28", content_format: "html", body: "<script>alert(1)</script>" }) });
  assert.equal(html.status, 400);
});
