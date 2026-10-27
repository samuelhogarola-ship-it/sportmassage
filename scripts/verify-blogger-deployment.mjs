import path from "node:path";
import { fileURLToPath } from "node:url";

const FAILURE = "Central Blogger gateway verification failed";
const DESTINATION = "https://blogger.sportmassagefuengirola.com/";
const RETIRED_PATHS = [
  "/admin/blogger/app.js",
  "/admin/blogger/blogger-auth.js",
  "/api/posts",
  "/api/build",
  "/api/admin/session",
  "/api/blogger/health",
];

function exactHttpsTarget(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !["", "/", "/admin/blogger/"].includes(url.pathname) || url.search || url.hash) {
    throw new Error(`${FAILURE}: base URL must be HTTPS`);
  }
  return url.pathname === "/admin/blogger/" ? url.href : `${url.origin}/admin/blogger/`;
}

export async function verifyIndependentBlogger(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(exactHttpsTarget(baseUrl), { method: "GET", redirect: "manual", headers: { accept: "text/html" } });
  if (response.status !== 200 || response.headers.get("location") || !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
    throw new Error(`${FAILURE}: unexpected response`);
  }
  const html = await response.text();
  const escaped = DESTINATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactReplace = new RegExp(`location\\.replace\\(\\s*["']${escaped}["']\\s*\\)`);
  const exactRefresh = new RegExp(`<meta\\s+[^>]*http-equiv=["']refresh["'][^>]*content=["']0;\\s*url=${escaped}["'][^>]*>`, "i");
  const exactLink = new RegExp(`<a\\s+[^>]*href=["']${escaped}["'][^>]*>`, "i");
  const replacements = html.match(/location\.replace\s*\(/g) ?? [];
  if (replacements.length !== 1 || !exactReplace.test(html) || !exactRefresh.test(html) || !exactLink.test(html) ||
      /<form|type=["']password["']|<iframe|(?:admin|portal)\.webfuengirola\.com|\/api\/(?:admin|blogger|posts|build)|blogger-auth|post-manager/i.test(html)) {
    throw new Error(`${FAILURE}: exact branded-host gateway is missing or unsafe`);
  }
  const origin = new URL(exactHttpsTarget(baseUrl)).origin;
  for (const retiredPath of RETIRED_PATHS) {
    const retired = await fetchImpl(`${origin}${retiredPath}`, { method: "GET", redirect: "manual", headers: { accept: "text/html,*/*" } });
    if (![404, 410].includes(retired.status) || retired.headers.get("location")) {
      throw new Error(`${FAILURE}: obsolete Blogger runtime is still reachable`);
    }
  }
  return { ok: true };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: node scripts/verify-blogger-deployment.mjs https://example.com\n");
    process.exitCode = 2;
  } else {
    verifyIndependentBlogger(process.argv[2])
      .then(() => process.stdout.write("Central Blogger gateway verified\n"))
      .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : FAILURE}\n`); process.exitCode = 1; });
  }
}
