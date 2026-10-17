import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { spawn as defaultSpawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = "scrypt$v1";
const SCRYPT_OPTIONS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertStrong(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > 256 ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/\d/.test(value) ||
    !/[^A-Za-z0-9]/.test(value) ||
    new Set(value).size < 12
  ) {
    throw new Error(`${label} must be a strong value`);
  }
}

export async function generatePasswordHash(password) {
  assertStrong(password, "Blogger password");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 32, SCRYPT_OPTIONS);
  return `${HASH_PREFIX}$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export function isSupportedPasswordHash(value) {
  if (typeof value !== "string") return false;
  const parts = value.split("$");
  if (parts.length !== 4 || `${parts[0]}$${parts[1]}` !== HASH_PREFIX) return false;
  try {
    return (
      Buffer.from(parts[2], "base64url").length === 16 &&
      Buffer.from(parts[3], "base64url").length === 32
    );
  } catch {
    return false;
  }
}

export async function verifyPassword(password, encoded) {
  if (!isSupportedPasswordHash(encoded) || typeof password !== "string") return false;
  const [, , saltEncoded, hashEncoded] = encoded.split("$");
  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = await scrypt(
    password,
    Buffer.from(saltEncoded, "base64url"),
    expected.length,
    SCRYPT_OPTIONS,
  );
  return timingSafeEqual(expected, Buffer.from(actual));
}

export function validateRuntimeSecrets(env) {
  const sessionSecret = env.BLOGGER_SESSION_SECRET;
  const handoffSecret = env.BLOGGER_HANDOFF_SECRET;
  assertStrong(sessionSecret, "Session secret");
  assertStrong(handoffSecret, "Handoff secret");
  if (safeEqual(sessionSecret, handoffSecret)) {
    throw new Error("Session and handoff secrets must be distinct");
  }
  return { sessionSecret, handoffSecret };
}

export function createSessionStore({
  maxEntries = 256,
  ttlMs = 8 * 60 * 60 * 1_000,
  now = Date.now,
  secret,
} = {}) {
  assertStrong(secret, "Session secret");
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 10_000) {
    throw new Error("Session capacity is invalid");
  }
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 24 * 60 * 60 * 1_000) {
    throw new Error("Session TTL is invalid");
  }
  const records = new Map();

  function prune() {
    const current = now();
    for (const [id, record] of records) {
      if (record.expiresAt <= current) records.delete(id);
    }
  }

  function sign(id) {
    return createHmac("sha256", secret).update(id).digest("base64url");
  }

  function parse(token) {
    if (typeof token !== "string") return null;
    const [id, signature, extra] = token.split(".");
    if (!id || !signature || extra || !safeEqual(signature, sign(id))) return null;
    return id;
  }

  return {
    get size() {
      prune();
      return records.size;
    },
    create(data) {
      prune();
      while (records.size >= maxEntries) records.delete(records.keys().next().value);
      const id = randomBytes(24).toString("base64url");
      records.set(id, {
        ...structuredClone(data),
        createdAt: now(),
        expiresAt: now() + ttlMs,
      });
      return `${id}.${sign(id)}`;
    },
    get(token) {
      prune();
      const id = parse(token);
      if (!id) return null;
      const record = records.get(id);
      return record ? structuredClone(record) : null;
    },
    destroy(token) {
      const id = parse(token);
      return id ? records.delete(id) : false;
    },
  };
}

export function createRateLimiter({
  maxEntries = 1_024,
  limit = 5,
  windowMs = 15 * 60 * 1_000,
  now = Date.now,
} = {}) {
  if (![maxEntries, limit, windowMs].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error("Rate-limit configuration is invalid");
  }
  const entries = new Map();
  return {
    get size() {
      return entries.size;
    },
    consume(key) {
      const current = now();
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= current) {
        entry = { count: 0, resetAt: current + windowMs };
      }
      entries.delete(key);
      entry.count += 1;
      entries.set(key, entry);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return {
        allowed: entry.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - current) / 1_000)),
      };
    },
  };
}

export function createAuditLogger(stateDirectory, now = () => new Date().toISOString()) {
  fs.mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const auditFile = path.join(stateDirectory, "audit.ndjson");
  return (event) => {
    const safeEvent = {
      at: now(),
      event: String(event.event || "session"),
      origin: event.origin === "studio" ? "studio" : "direct",
    };
    fs.appendFileSync(auditFile, `${JSON.stringify(safeEvent)}\n`, { mode: 0o600 });
  };
}

export function runProcessWithTimeout(
  command,
  args = [],
  { timeoutMs = 120_000, killGraceMs = 1_000, spawnImpl = defaultSpawn, cwd, env } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(chunk));
    child.stderr?.on("data", (chunk) => stderr.push(chunk));
    let timedOut = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
      killTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.once("error", (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (timedOut) reject(new Error(`Process timed out after ${timeoutMs}ms`));
      else if (code !== 0) reject(new Error(`Process exited with code ${code}`));
      else resolve(result);
    });
  });
}

export function fingerprint(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}
