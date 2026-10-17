import fs from "node:fs";
import path from "node:path";

import { generateBlog } from "./generate-blog.mjs";

const PUBLIC_FILES = [
  "index.html", "legal.html", "cookie-banner-core.js", "legal-core.css", "legal-core.js",
  "favicon-16.png", "favicon-16.webp", "favicon-192.png", "favicon-32.png", "favicon-32.webp",
  "favicon-512.webp", "favicon.ico", "logo.png", "logo.webp", "nif.png",
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trackerMarkup(websiteId, scriptUrl, verified) {
  if (verified !== true || !UUID_PATTERN.test(websiteId ?? "")) return "";
  try {
    const parsed = new URL(scriptUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    return `<script defer src="${parsed.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" data-website-id="${websiteId}"></script>`;
  } catch {
    return "";
  }
}

function htmlFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export async function generateSiteRelease({
  root, releaseRoot, contentRoot = path.join(root, "content/blog"), mediaRoot = path.join(contentRoot, "media"),
  umamiWebsiteId = process.env.UMAMI_WEBSITE_ID, umamiScriptUrl = process.env.UMAMI_SCRIPT_URL,
  umamiProductionVerified = process.env.UMAMI_PRODUCTION_VERIFIED === "true",
} = {}) {
  const sourceRoot = path.resolve(root);
  const destination = path.resolve(releaseRoot);
  if (destination === sourceRoot || !destination.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Release root must remain inside the project root");
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const relative of PUBLIC_FILES) {
    const source = path.join(sourceRoot, relative);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(destination, relative));
  }
  const proposal = path.join(sourceRoot, "propuesta");
  if (fs.existsSync(proposal)) fs.cpSync(proposal, path.join(destination, "propuesta"), { recursive: true });
  await generateBlog({ root: sourceRoot, contentRoot, mediaRoot, outputRoot: path.join(destination, "blog"), umamiProductionVerified: false });
  const tracker = trackerMarkup(umamiWebsiteId, umamiScriptUrl, umamiProductionVerified);
  if (tracker) {
    for (const file of htmlFiles(destination)) {
      const html = fs.readFileSync(file, "utf8");
      if (!html.includes("data-website-id=") && html.includes("</head>")) {
        fs.writeFileSync(file, html.replace("</head>", `  ${tracker}\n</head>`));
      }
    }
  }
}
