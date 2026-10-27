import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const auth = await import("../scripts/blogger-launch-session.mjs").catch(
  () => ({}),
);

test("strong Blogger passwords hash and verify without retaining plaintext", async () => {
  assert.equal(typeof auth.generatePasswordHash, "function");
  const password = "Massage-Blogger-Only-2026!";
  const hash = await auth.generatePasswordHash(password);
  assert.match(hash, /^scrypt\$v1\$/);
  assert.equal(hash.includes(password), false);
  assert.equal(await auth.verifyPassword(password, hash), true);
  assert.equal(await auth.verifyPassword(`${password}x`, hash), false);
  await assert.rejects(() => auth.generatePasswordHash("short"), /strong/i);
});

test("runtime secret validation rejects weak, reused and malformed values", () => {
  assert.equal(typeof auth.validateRuntimeSecrets, "function");
  const valid = {
    BLOGGER_SESSION_SECRET: "session_4Yz!Q9mP2vK7xN5cR8tL3wD6hF1sJ0aB",
    BLOGGER_HANDOFF_SECRET: "handoff_7Nv!P3qR9mC2xW8kT5dL1yF6jH4sA0e",
  };
  assert.doesNotThrow(() => auth.validateRuntimeSecrets(valid));
  for (const invalid of [
    { ...valid, BLOGGER_SESSION_SECRET: "too-short" },
    { ...valid, BLOGGER_SESSION_SECRET: "a".repeat(64) },
    { ...valid, BLOGGER_HANDOFF_SECRET: valid.BLOGGER_SESSION_SECRET },
  ]) {
    assert.throws(() => auth.validateRuntimeSecrets(invalid), /secret/i);
  }
});

test("session store expires records and stays bounded", () => {
  assert.equal(typeof auth.createSessionStore, "function");
  let now = 1_000;
  const store = auth.createSessionStore({
    maxEntries: 2,
    ttlMs: 100,
    now: () => now,
    secret: "session_4Yz!Q9mP2vK7xN5cR8tL3wD6hF1sJ0aB",
  });
  const first = store.create({ source: "direct", scope: ["blogger"] });
  const second = store.create({ source: "studio", scope: ["blogger"] });
  const third = store.create({ source: "direct", scope: ["blogger"] });
  assert.equal(store.size, 2);
  assert.equal(store.get(first), null);
  assert.equal(store.get(second).source, "studio");
  assert.equal(store.get(third).scope.includes("studio"), false);
  now += 101;
  assert.equal(store.get(second), null);
  assert.equal(store.size, 0);
});

test("rotating the owner-managed session secret invalidates every existing cookie", () => {
  const first = auth.createSessionStore({
    secret: "session_4Yz!Q9mP2vK7xN5cR8tL3wD6hF1sJ0aB",
  });
  const cookie = first.create({ source: "direct", siteKey: "sportmassagefuengirola", scope: ["blogger"] });
  const rotated = auth.createSessionStore({
    secret: "rotated_8Ks!M4vQ1xC9pT6wR2yH7nD5jL0aF3zB",
  });

  assert.equal(rotated.get(cookie), null);
});

test("password hash CLI reads stdin only and prints only the encoded hash", async () => {
  const script = path.resolve(import.meta.dirname, "../scripts/generate-blogger-password-hash.mjs");
  const password = "Synthetic-Owner-Reset-2026!";
  const run = (args, input = "") => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", code => resolve({
      code,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    child.stdin.end(input);
  });

  const generated = await run([], password);
  assert.equal(generated.code, 0);
  assert.match(generated.stdout, /^scrypt\$v1\$[^\n]+\n$/);
  assert.equal(generated.stdout.includes(password), false);
  assert.equal(generated.stderr, "");

  const refused = await run([password]);
  assert.equal(refused.code, 2);
  assert.equal(refused.stdout, "");
  assert.equal(refused.stderr.includes(password), false);
});

test("rate limiter is bounded and resets after its window", () => {
  assert.equal(typeof auth.createRateLimiter, "function");
  let now = 5_000;
  const limiter = auth.createRateLimiter({
    maxEntries: 2,
    limit: 2,
    windowMs: 100,
    now: () => now,
  });
  assert.equal(limiter.consume("one").allowed, true);
  assert.equal(limiter.consume("one").allowed, true);
  assert.equal(limiter.consume("one").allowed, false);
  limiter.consume("two");
  limiter.consume("three");
  assert.equal(limiter.size, 2);
  now += 101;
  assert.equal(limiter.consume("one").allowed, true);
});

test("process runner times out and terminates a stuck child", async () => {
  assert.equal(typeof auth.runProcessWithTimeout, "function");
  const started = Date.now();
  await assert.rejects(
    () =>
      auth.runProcessWithTimeout(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        { timeoutMs: 50, killGraceMs: 50, spawnImpl: spawn },
      ),
    /timed out/i,
  );
  assert.ok(Date.now() - started < 2_000);
});
