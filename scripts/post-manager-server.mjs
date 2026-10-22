import fs from "node:fs";
import http from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAuditLogger,
  createRateLimiter,
  createSessionStore,
  isSupportedPasswordHash,
  validateRuntimeSecrets,
  verifyPassword,
} from "./blogger-launch-session.mjs";
import { createBlogContentStore } from "./blog-content-store.mjs";
import { createStaticReleaseBuildRunner } from "./blog-build-runner.mjs";

export const HANDOFF_PROTOCOL = "wf-blogger-handoff/v1";
export const BLOGGER_SITE_KEY = "sportmassagefuengirola";
export const BLOGGER_AUDIENCE = "https://sportmassagefuengirola.com";
const COOKIE_NAME = "__Host-sportmassage_blogger_session";
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_LOGIN_BODY = 8 * 1024;
const MAX_HANDOFF_BODY = 4 * 1024;
const MAX_POST_BODY = 512 * 1024;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_BODY = Math.ceil((MAX_MEDIA_BYTES * 4) / 3) + 8 * 1024;
const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required Blogger configuration: ${name}`);
  return value;
}

function exactOrigin(value, name, protocols = ["https:"]) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an exact origin`);
  }
  if (
    !protocols.includes(parsed.protocol) ||
    parsed.origin !== value ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must be an exact origin`);
  }
  return value;
}

function confined(root, candidate, label) {
  const base = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${label} must remain inside the project root`);
  }
  return resolved;
}

function configuredPath(root, value, fallback, label) {
  const candidate = value ?? fallback;
  return confined(root, path.isAbsolute(candidate) ? candidate : path.join(root, candidate), label);
}

function positiveInteger(value, fallback, maximum, label) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new Error(`${label} is invalid`);
  return parsed;
}

export function resolveListenHost(value) {
  const host = value?.trim() || "127.0.0.1";
  if (!isIP(host)) throw new Error("HOST is invalid");
  return host;
}

export function installGracefulShutdown(server, {
  signalSource = process,
  timeoutMs = 30_000,
  forceExit = (code) => process.exit(code),
} = {}) {
  let stopping = false;
  let timer;
  const cleanup = () => {
    signalSource.removeListener("SIGTERM", shutdown);
    signalSource.removeListener("SIGINT", shutdown);
  };
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    timer = setTimeout(() => {
      server.closeAllConnections?.();
      forceExit(1);
    }, timeoutMs);
    timer.unref?.();
    server.close((error) => {
      clearTimeout(timer);
      cleanup();
      if (error) {
        forceExit(1);
        return;
      }
      signalSource.exitCode = 0;
    });
  };
  signalSource.once("SIGTERM", shutdown);
  signalSource.once("SIGINT", shutdown);
  return cleanup;
}

function readConfiguration(projectRoot, env) {
  const root = path.resolve(projectRoot);
  const secretConfiguration = {
    BLOGGER_SESSION_SECRET: required(env, "BLOGGER_SESSION_SECRET"),
    BLOGGER_HANDOFF_SECRET: required(env, "BLOGGER_HANDOFF_SECRET"),
  };
  const { sessionSecret, handoffSecret } = validateRuntimeSecrets(secretConfiguration);
  const publicOrigin = exactOrigin(required(env, "BLOGGER_PUBLIC_ORIGIN"), "BLOGGER_PUBLIC_ORIGIN");
  const studioOrigin = exactOrigin(required(env, "BLOGGER_STUDIO_ORIGIN"), "BLOGGER_STUDIO_ORIGIN");
  const exchangeUrl = new URL(required(env, "BLOGGER_STUDIO_EXCHANGE_URL"));
  if (exchangeUrl.protocol !== "https:" || exchangeUrl.origin !== studioOrigin || exchangeUrl.pathname !== "/api/tool-launch/exchange") {
    throw new Error("BLOGGER_STUDIO_EXCHANGE_URL is invalid");
  }
  const username = required(env, "BLOGGER_DIRECT_USERNAME");
  if (!/^[A-Za-z0-9][A-Za-z0-9._@+-]{2,127}$/.test(username)) {
    throw new Error("BLOGGER_DIRECT_USERNAME is invalid");
  }
  const passwordHash = required(env, "BLOGGER_DIRECT_PASSWORD_HASH");
  if (!isSupportedPasswordHash(passwordHash)) throw new Error("BLOGGER_DIRECT_PASSWORD_HASH is invalid");
  const mutationOrigin = env.NODE_ENV === "test" && env.BLOGGER_TEST_ORIGIN
    ? exactOrigin(env.BLOGGER_TEST_ORIGIN, "BLOGGER_TEST_ORIGIN", ["http:"])
    : publicOrigin;
  const stateDirectory = configuredPath(root, env.BLOGGER_STATE_DIR, ".blogger-state", "State directory");
  return {
    root,
    publicOrigin,
    studioOrigin,
    exchangeUrl: exchangeUrl.href,
    mutationOrigin,
    sessionSecret,
    handoffSecret,
    username,
    passwordHash,
    stateDirectory,
    contentRoot: configuredPath(root, env.BLOGGER_CONTENT_ROOT, "content/blog", "Content root"),
    mediaRoot: configuredPath(root, env.BLOGGER_MEDIA_ROOT, "content/blog/media", "Media root"),
    outputRoot: configuredPath(root, env.BLOGGER_OUTPUT_ROOT, path.join(stateDirectory, "public"), "Output root"),
    sessionTtlMs: positiveInteger(env.BLOGGER_SESSION_TTL_SECONDS, 8 * 60 * 60, 24 * 60 * 60, "Session TTL") * 1_000,
    loginAttempts: positiveInteger(env.BLOGGER_LOGIN_MAX_ATTEMPTS, 5, 20, "Login attempts"),
    buildTimeoutMs: positiveInteger(env.BLOGGER_BUILD_TIMEOUT_MS, 120_000, 15 * 60 * 1_000, "Build timeout"),
  };
}

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
});

function setHeaders(response, contentType) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
  response.setHeader("Content-Type", contentType);
  response.setHeader("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
}

function json(response, status, body, extraHeaders = {}) {
  setHeaders(response, "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function empty(response, status, extraHeaders = {}) {
  setHeaders(response, "text/plain; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.statusCode = status;
  response.end();
}

async function readJson(request, maximum) {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new RequestError(415, "unsupported_media_type");
  }
  const declared = request.headers["content-length"];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    request.resume();
    throw new RequestError(413, "payload_too_large");
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximum) {
      request.resume();
      throw new RequestError(413, "payload_too_large");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw new RequestError(400, "invalid_request");
  }
}

function parseCookies(request) {
  const values = {};
  for (const part of String(request.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) values[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return values;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function requireOrigin(request, expected) {
  if (request.headers.origin !== expected) throw new RequestError(403, "forbidden");
}

function clientKey(request) {
  const peer = request.socket.remoteAddress ?? "unknown";
  const forwarded = request.headers["x-real-ip"];
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer);
  if (loopback && typeof forwarded === "string" && forwarded.length <= 45 && isIP(forwarded)) {
    return forwarded;
  }
  return peer;
}

function decodeDataUrl(value) {
  if (typeof value !== "string") throw new RequestError(400, "invalid_image");
  const match = value.match(/^data:(image\/(?:gif|jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/i);
  if (!match) throw new RequestError(400, "invalid_image");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new RequestError(413, "image_too_large");
  return { bytes, declaredMime: match[1].toLowerCase() };
}

function publicCapabilities() {
  return {
    protocol: HANDOFF_PROTOCOL,
    siteKey: BLOGGER_SITE_KEY,
    audience: BLOGGER_AUDIENCE,
    capabilities: ["posts", "media", "publish", "unpublish"],
  };
}

function exactKeys(value, expected) {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

export function serializeHandoffExchangeRequest(code) {
  return JSON.stringify({ protocol: HANDOFF_PROTOCOL, code, siteKey: BLOGGER_SITE_KEY });
}

export function validateHandoffExchangeResponse(ticket) {
  if (
    !ticket || typeof ticket !== "object" || Array.isArray(ticket) ||
    !exactKeys(ticket, ["protocol", "siteKey", "audience", "subject"]) ||
    ticket.protocol !== HANDOFF_PROTOCOL ||
    ticket.siteKey !== BLOGGER_SITE_KEY ||
    ticket.audience !== BLOGGER_AUDIENCE
  ) return null;
  const subject = ticket.subject;
  if (
    !subject || typeof subject !== "object" || Array.isArray(subject) ||
    !exactKeys(subject, ["role", "userId", "clientId", "projectId"]) ||
    !["admin", "client"].includes(subject.role) ||
    typeof subject.userId !== "string" || !subject.userId ||
    (subject.clientId !== null && (typeof subject.clientId !== "string" || !subject.clientId)) ||
    typeof subject.projectId !== "string" || !subject.projectId
  ) return null;
  return structuredClone(subject);
}

export async function verifyDirectCredentials({
  suppliedUsername,
  suppliedPassword,
  expectedUsername,
  passwordHash,
  passwordVerifier = verifyPassword,
}) {
  const passwordValid = await passwordVerifier(suppliedPassword, passwordHash);
  return suppliedUsername === expectedUsername && passwordValid;
}

export function createPostManagerServer({
  projectRoot,
  env = process.env,
  fetchImpl = fetch,
  build,
  maxSessions = 256,
  maxRateLimitEntries = 1_024,
  handoffPerIpLimit = 5,
  handoffGlobalLimit = 50,
  maxConcurrentHandoffs = 4,
  maxHandoffResponseBytes = 16 * 1024,
  accessSync = fs.accessSync,
} = {}) {
  const config = readConfiguration(projectRoot, env);
  const sessions = createSessionStore({
    maxEntries: maxSessions,
    ttlMs: config.sessionTtlMs,
    rememberedTtlMs: REMEMBERED_SESSION_TTL_MS,
    persistentFile: path.join(config.stateDirectory, "sessions.json"),
    secret: config.sessionSecret,
  });
  const limiter = createRateLimiter({
    maxEntries: maxRateLimitEntries,
    limit: config.loginAttempts,
  });
  const handoffIpLimiter = createRateLimiter({ maxEntries: maxRateLimitEntries, limit: handoffPerIpLimit });
  const handoffGlobalLimiter = createRateLimiter({ maxEntries: 1, limit: handoffGlobalLimit });
  if (![maxConcurrentHandoffs, maxHandoffResponseBytes].every((value) => Number.isInteger(value) && value > 0)) throw new Error("Handoff limits are invalid");
  let activeHandoffs = 0;
  const audit = createAuditLogger(config.stateDirectory);
  const buildBlog = build ?? createStaticReleaseBuildRunner({
    root: config.root,
    contentRoot: config.contentRoot,
    mediaRoot: config.mediaRoot,
    timeoutMs: config.buildTimeoutMs,
    env,
  });
  const store = createBlogContentStore({
    root: config.root,
    contentRoot: config.contentRoot,
    mediaRoot: config.mediaRoot,
    outputRoot: config.outputRoot,
    transactionRoot: path.join(config.stateDirectory, "transaction"),
    lockDirectory: path.join(config.stateDirectory, "writer.lock"),
    build: buildBlog,
  });

  function currentSession(request) {
    return sessions.get(parseCookies(request)[COOKIE_NAME]);
  }

  function requireSession(request) {
    const session = currentSession(request);
    if (!session || !session.scope?.includes("blogger")) throw new RequestError(401, "authentication_required");
    return session;
  }

  function establish(request, response, data, { remembered = false } = {}) {
    const prior = parseCookies(request)[COOKIE_NAME];
    if (prior) sessions.destroy(prior);
    const token = sessions.create(data, { remembered });
    const ttlMs = remembered ? REMEMBERED_SESSION_TTL_MS : config.sessionTtlMs;
    json(response, 200, { authenticated: true }, { "Set-Cookie": sessionCookie(token, Math.floor(ttlMs / 1_000)) });
  }

  function readiness() {
    function canAccess(candidate, mode) {
      try { accessSync(candidate, mode); return true; }
      catch { return false; }
    }
    function directory(directory) {
      try {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return { readable: false, writable: false };
        return {
          readable: canAccess(directory, fs.constants.R_OK | fs.constants.X_OK),
          writable: canAccess(directory, fs.constants.W_OK | fs.constants.X_OK),
        };
      } catch { return { readable: false, writable: false }; }
    }
    let activeRelease = false;
    try {
      const current = path.join(config.outputRoot, "current"); const target = fs.readlinkSync(current);
      if (/^releases\/\d{13}-[0-9a-f]{16}$/.test(target)) {
        const index = path.join(config.outputRoot, target, "index.html"); const stat = fs.lstatSync(index);
        activeRelease = stat.isFile() && !stat.isSymbolicLink()
          && canAccess(path.dirname(index), fs.constants.X_OK)
          && canAccess(index, fs.constants.R_OK);
      }
    } catch { activeRelease = false; }
    const content = directory(config.contentRoot); const state = directory(config.stateDirectory);
    const recoveryResolved = !fs.existsSync(path.join(config.stateDirectory, "transaction/journal.json"));
    const checks = { activeRelease, contentReadable: content.readable, contentWritable: content.writable, stateReadable: state.readable, stateWritable: state.writable, recoveryResolved };
    return { ready: Object.values(checks).every(Boolean), checks };
  }

  async function boundedResponseJson(response) {
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > maxHandoffResponseBytes) throw new Error("exchange_response_invalid");
    const chunks = []; let length = 0;
    for await (const chunk of response.body ?? []) {
      length += chunk.length; if (length > maxHandoffResponseBytes) throw new Error("exchange_response_invalid"); chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks)));
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, config.publicOrigin);
      const method = request.method ?? "GET";

      if (method === "GET" && url.pathname === "/.well-known/wf-blogger.json") {
        json(response, 200, publicCapabilities());
        return;
      }
      if (method === "GET" && url.pathname === "/api/blogger/health") {
        const status = readiness(); json(response, status.ready ? 200 : 503, status); return;
      }

      if (method === "POST" && url.pathname === "/admin/blogger/login") {
        requireOrigin(request, config.mutationOrigin);
        const attempt = limiter.consume(clientKey(request));
        if (!attempt.allowed) {
          json(response, 429, { error: "authentication_failed" }, { "Retry-After": String(attempt.retryAfterSeconds) });
          return;
        }
        const body = await readJson(request, MAX_LOGIN_BODY);
        if (body.remember !== undefined && typeof body.remember !== "boolean") throw new RequestError(400, "invalid_request");
        const valid = await verifyDirectCredentials({
          suppliedUsername: body.username,
          suppliedPassword: body.password,
          expectedUsername: config.username,
          passwordHash: config.passwordHash,
        });
        if (!valid) {
          json(response, 401, { error: "authentication_failed" });
          return;
        }
        audit({ event: "session_created", origin: "direct" });
        establish(request, response, {
          source: "direct",
          scope: ["blogger"],
          subject: { role: "blogger_editor", username: config.username },
        }, { remembered: body.remember === true });
        return;
      }

      if (method === "POST" && url.pathname === "/admin/blogger/launch") {
        requireOrigin(request, config.mutationOrigin);
        if (activeHandoffs >= maxConcurrentHandoffs) { json(response, 429, { error: "launch_unavailable" }); return; }
        const ipAttempt = handoffIpLimiter.consume(clientKey(request));
        if (!ipAttempt.allowed) { json(response, 429, { error: "launch_unavailable" }); return; }
        const globalAttempt = handoffGlobalLimiter.consume("global");
        if (!globalAttempt.allowed) { json(response, 429, { error: "launch_unavailable" }); return; }
        activeHandoffs += 1;
        try {
          const body = await readJson(request, MAX_HANDOFF_BODY);
          if (
            !body || typeof body !== "object" || Array.isArray(body) ||
            !exactKeys(body, ["protocol", "code", "siteKey"]) ||
            body.protocol !== HANDOFF_PROTOCOL || body.siteKey !== BLOGGER_SITE_KEY ||
            !CODE_PATTERN.test(body.code ?? "")
          ) throw new RequestError(400, "invalid_launch_code");
          let ticket;
          try {
            const exchange = await fetchImpl(config.exchangeUrl, {
              method: "POST", headers: { Authorization: `Bearer ${config.handoffSecret}`, "Content-Type": "application/json" },
              body: serializeHandoffExchangeRequest(body.code), signal: AbortSignal.timeout(8_000),
            });
            if (!exchange.ok) throw new Error("exchange_rejected");
            ticket = await boundedResponseJson(exchange);
          } catch { throw new RequestError(401, "invalid_or_expired_ticket"); }
          const subject = validateHandoffExchangeResponse(ticket);
          if (!subject) throw new RequestError(401, "invalid_or_expired_ticket");
          audit({ event: "session_created", origin: "studio" });
          establish(request, response, { source: "studio", scope: ["blogger"], subject });
          return;
        } finally {
          activeHandoffs -= 1;
        }
      }

      if (method === "GET" && url.pathname === "/api/admin/session") {
        const session = requireSession(request);
        json(response, 200, {
          authenticated: true,
          source: session.source,
          scope: session.scope,
          subject: session.subject,
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/admin/logout") {
        requireOrigin(request, config.mutationOrigin);
        sessions.destroy(parseCookies(request)[COOKIE_NAME]);
        empty(response, 204, { "Set-Cookie": sessionCookie("", 0) });
        return;
      }

      const postMatch = url.pathname.match(/^\/api\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(publish|unpublish|images))?$/);
      const imageMatch = url.pathname.match(/^\/api\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/images\/([A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(?:gif|jpe?g|png|webp))$/i);
      if (url.pathname === "/api/posts" && method === "GET") {
        requireSession(request);
        json(response, 200, { posts: await store.list() });
        return;
      }
      if (url.pathname === "/api/posts" && method === "POST") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        const body = await readJson(request, MAX_POST_BODY);
        json(response, 201, await store.create(body));
        return;
      }
      if (postMatch && !postMatch[2] && method === "GET") {
        requireSession(request);
        json(response, 200, await store.get(postMatch[1]));
        return;
      }
      if (postMatch && !postMatch[2] && method === "PUT") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        const body = await readJson(request, MAX_POST_BODY);
        json(response, 200, await store.update(postMatch[1], body));
        return;
      }
      if (postMatch && !postMatch[2] && method === "DELETE") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        await store.delete(postMatch[1]);
        empty(response, 204);
        return;
      }
      if (postMatch?.[2] === "publish" && method === "POST") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        json(response, 200, await store.publish(postMatch[1]));
        return;
      }
      if (postMatch?.[2] === "unpublish" && method === "POST") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        json(response, 200, await store.unpublish(postMatch[1]));
        return;
      }
      if (postMatch?.[2] === "images" && method === "POST") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        const body = await readJson(request, MAX_MEDIA_BODY);
        const imageData = decodeDataUrl(body.data);
        const image = await store.saveImage(postMatch[1], {
          filename: body.fileName,
          ...imageData,
        });
        json(response, 201, image);
        return;
      }
      if (imageMatch && method === "PUT") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        const body = await readJson(request, MAX_HANDOFF_BODY);
        json(response, 200, await store.updateImage(imageMatch[1], imageMatch[2], body));
        return;
      }
      if (imageMatch && method === "DELETE") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        await store.deleteImage(imageMatch[1], imageMatch[2]);
        empty(response, 204);
        return;
      }
      if (url.pathname === "/api/build" && method === "POST") {
        requireSession(request);
        requireOrigin(request, config.mutationOrigin);
        await readJson(request, MAX_HANDOFF_BODY);
        await store.rebuild();
        json(response, 200, { built: true });
        return;
      }

      json(response, 404, { error: "not_found" });
    } catch (error) {
      const status = error instanceof RequestError ? error.status : /not found/i.test(error.message) ? 404 : /already exists/i.test(error.message) ? 409 : /invalid|required|large|escape|image|MIME|malformed|unsupported|dimension/i.test(error.message) ? 400 : 500;
      json(response, status, { error: error instanceof RequestError ? error.code : status === 500 ? "internal_error" : "invalid_request" });
    }
  });
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const server = createPostManagerServer({ projectRoot: root });
  const port = positiveInteger(process.env.PORT, 8787, 65535, "PORT");
  const host = resolveListenHost(process.env.HOST);
  const shutdownTimeoutMs = positiveInteger(process.env.BLOGGER_SHUTDOWN_TIMEOUT_MS, 30_000, 120_000, "Shutdown timeout");
  installGracefulShutdown(server, { timeoutMs: shutdownTimeoutMs });
  server.listen(port, host, () => {
    process.stdout.write(`Sport Massage Blogger listening on ${host}:${port}\n`);
  });
}
