import path from "node:path";
import { fileURLToPath } from "node:url";

const FAILURE = "Independent Blogger verification failed";

function exactHttpsTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${FAILURE}: base URL must be HTTPS`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["", "/", "/admin/blogger/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) throw new Error(`${FAILURE}: base URL must be HTTPS`);
  return url.pathname === "/admin/blogger/" ? url.href : `${url.origin}/admin/blogger/`;
}

function hasLoginForm(html) {
  const form = html.match(/<form\b[^>]*id=["']bloggerLoginForm["'][^>]*>/i)?.[0] ?? "";
  return /\bmethod=["']post["']/i.test(form)
    && /\baction=["']\/admin\/blogger\/login["']/i.test(form)
    && /<input\b[^>]*\bname=["']username["']/i.test(html)
    && /<input\b[^>]*\bname=["']password["'][^>]*\btype=["']password["']/i.test(html);
}

export async function verifyIndependentBlogger(baseUrl, fetchImpl = fetch) {
  const target = exactHttpsTarget(baseUrl);
  const response = await fetchImpl(target, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "text/html" },
  });
  if (response.status !== 200 || response.headers.get("location")) {
    throw new Error(`${FAILURE}: unexpected response`);
  }
  const html = await response.text();
  if (
    !hasLoginForm(html) ||
    /<meta\b[^>]*http-equiv=["']refresh["']/i.test(html) ||
    /<iframe\b/i.test(html) ||
    /https:\/\/(?:admin|portal)\.webfuengirola\.com/i.test(html)
  ) throw new Error(`${FAILURE}: direct login shell is missing or unsafe`);
  return { ok: true };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: node scripts/verify-blogger-deployment.mjs https://example.com\n");
    process.exitCode = 2;
  } else {
    verifyIndependentBlogger(process.argv[2])
      .then(() => process.stdout.write("Independent Blogger verified\n"))
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : FAILURE}\n`);
        process.exitCode = 1;
      });
  }
}
