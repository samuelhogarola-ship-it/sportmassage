import path from "node:path";
import { fileURLToPath } from "node:url";

const FAILURE = "Central Blogger gateway verification failed";
const DESTINATION = "https://portal.webfuengirola.com/acceso/blogger/sportmassagefuengirola";

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
  if (!exactReplace.test(html) || !exactRefresh.test(html) || !exactLink.test(html) ||
      /<form|type=["']password["']|<iframe|admin\.webfuengirola\.com|\/api\/(?:admin|blogger|posts|build)|blogger-auth|post-manager/i.test(html)) {
    throw new Error(`${FAILURE}: exact neutral-host gateway is missing or unsafe`);
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
