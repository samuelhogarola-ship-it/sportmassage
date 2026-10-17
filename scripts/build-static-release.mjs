import { generateSiteRelease } from "./generate-site-release.mjs";

for (const name of ["BLOG_BUILD_ROOT", "BLOG_BUILD_CONTENT_ROOT", "BLOG_BUILD_MEDIA_ROOT", "BLOG_BUILD_RELEASE_ROOT"]) {
  if (!process.env[name]) throw new Error(`Missing isolated build input: ${name}`);
}

await generateSiteRelease({
  root: process.env.BLOG_BUILD_ROOT,
  contentRoot: process.env.BLOG_BUILD_CONTENT_ROOT,
  mediaRoot: process.env.BLOG_BUILD_MEDIA_ROOT,
  releaseRoot: process.env.BLOG_BUILD_RELEASE_ROOT,
  umamiWebsiteId: process.env.UMAMI_WEBSITE_ID,
  umamiScriptUrl: process.env.UMAMI_SCRIPT_URL,
  umamiProductionVerified: process.env.UMAMI_PRODUCTION_VERIFIED === "true",
});
