import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

function stale(lockDirectory, staleMs) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lockDirectory, "owner.json"), "utf8"));
    return Number.isFinite(owner.createdAt) && Date.now() - owner.createdAt > staleMs && !alive(owner.pid);
  } catch {
    try { return Date.now() - fs.statSync(lockDirectory).mtimeMs > staleMs; } catch { return false; }
  }
}

export async function withFilesystemLock(lockDirectory, operation, { timeoutMs = 30_000, staleMs = 5 * 60_000, retryMs = 20 } = {}) {
  fs.mkdirSync(path.dirname(lockDirectory), { recursive: true, mode: 0o750 });
  const parentStat = fs.lstatSync(path.dirname(lockDirectory));
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) throw new Error("Filesystem writer lock parent is invalid");
  const nonce = randomBytes(12).toString("hex");
  const started = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDirectory, { mode: 0o700 });
      fs.writeFileSync(path.join(lockDirectory, "owner.json"), JSON.stringify({ pid: process.pid, createdAt: Date.now(), nonce }), { mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const lockStat = fs.lstatSync(lockDirectory);
      if (lockStat.isSymbolicLink() || !lockStat.isDirectory()) throw new Error("Filesystem writer lock is invalid");
      if (stale(lockDirectory, staleMs)) {
        const retired = `${lockDirectory}.stale-${process.pid}-${nonce}`;
        try { fs.renameSync(lockDirectory, retired); fs.rmSync(retired, { recursive: true, force: true }); } catch (retireError) { if (!["ENOENT", "EEXIST"].includes(retireError.code)) throw retireError; }
        continue;
      }
      if (Date.now() - started >= timeoutMs) throw new Error("Filesystem writer lock timed out");
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
  try { return await operation(); }
  finally {
    try {
      const owner = JSON.parse(fs.readFileSync(path.join(lockDirectory, "owner.json"), "utf8"));
      if (owner.nonce === nonce) fs.rmSync(lockDirectory, { recursive: true, force: true });
    } catch { /* a missing lock is already released */ }
  }
}
