import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function terminate(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

export function runIsolatedBuild({ script, args = [], env = {}, timeoutMs = 120_000, killGraceMs = 1_000 }) {
  return new Promise((resolve, reject) => {
    const inherited = {};
    for (const name of ["PATH", "SystemRoot", "WINDIR", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ"]) if (process.env[name] !== undefined) inherited[name] = process.env[name];
    const supplied = {};
    for (const [name, value] of Object.entries(env)) if (/^(?:BLOG_BUILD_|UMAMI_)[A-Z0-9_]*$/.test(name) && value !== undefined) supplied[name] = String(value);
    const child = spawn(process.execPath, [path.resolve(script), ...args], {
      env: { ...inherited, ...supplied },
      stdio: ["ignore", "ignore", "pipe"],
      detached: process.platform !== "win32",
    });
    let stderr = "";
    let timedOut = false;
    let forceTimer;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { if (stderr.length < 16_384) stderr += chunk; });
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate(child, "SIGTERM");
      forceTimer = setTimeout(() => terminate(child, "SIGKILL"), killGraceMs);
      forceTimer.unref?.();
    }, timeoutMs);
    timeout.unref?.();
    child.once("error", (error) => {
      clearTimeout(timeout); clearTimeout(forceTimer); reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout); clearTimeout(forceTimer);
      if (timedOut) reject(new Error(`Build timed out after ${timeoutMs}ms`));
      else if (code === 0) resolve();
      else reject(new Error(`Build process failed (${signal ?? code})${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

const worker = fileURLToPath(new URL("./build-static-release.mjs", import.meta.url));

export function createStaticReleaseBuildRunner({ root, contentRoot, mediaRoot, timeoutMs, env = process.env }) {
  return ({ releaseRoot }) => runIsolatedBuild({
    script: worker,
    timeoutMs,
    env: {
      BLOG_BUILD_ROOT: root,
      BLOG_BUILD_CONTENT_ROOT: contentRoot,
      BLOG_BUILD_MEDIA_ROOT: mediaRoot,
      BLOG_BUILD_RELEASE_ROOT: releaseRoot,
      UMAMI_WEBSITE_ID: env.UMAMI_WEBSITE_ID ?? "",
      UMAMI_SCRIPT_URL: env.UMAMI_SCRIPT_URL ?? "",
      UMAMI_PRODUCTION_VERIFIED: env.UMAMI_PRODUCTION_VERIFIED ?? "",
    },
  });
}
