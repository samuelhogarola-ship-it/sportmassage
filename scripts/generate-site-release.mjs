import fs from "node:fs";
import path from "node:path";

import { generateBlog } from "./generate-blog.mjs";
import { assertNoSymlinkPath } from "./safe-filesystem.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED = ["index.html", "legal.html"];

function trackerMarkup(websiteId, scriptUrl, verified) {
  if (verified !== true || !UUID_PATTERN.test(websiteId ?? "")) return "";
  try {
    const parsed = new URL(scriptUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    return `<script defer src="${parsed.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" data-website-id="${websiteId}"></script>`;
  } catch { return ""; }
}

function htmlFiles(directory) {
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith(".html")) result.push(full);
    }
  }
  visit(directory); return result;
}

function readManifest(sourceRoot, manifestPath) {
  const file = assertNoSymlinkPath(sourceRoot, manifestPath ?? path.join(sourceRoot, "deploy/public-manifest.json"), "Deploy manifest");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data.files) || !data.files.length) throw new Error("Deploy manifest files are required");
  const files = [...new Set(data.files)];
  for (const relative of files) if (typeof relative !== "string" || relative.startsWith("/") || relative.includes("\\") || relative.split("/").includes("..")) throw new Error("Invalid deploy manifest path");
  for (const required of REQUIRED) if (!files.includes(required)) throw new Error(`Required deploy file is missing: ${required}`);
  return files;
}

function copyManifest(sourceRoot, destination, files) {
  for (const relative of files) {
    let source;
    try {
      source = assertNoSymlinkPath(sourceRoot, path.join(sourceRoot, relative), "Manifest source", { allowMissing: false });
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Required manifest file is missing: ${relative}`);
      throw error;
    }
    let stat; try { stat = fs.lstatSync(source); } catch { throw new Error(`Required manifest file is missing: ${relative}`); }
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Manifest source must be a regular non-symlink file: ${relative}`);
    const target = path.join(destination, relative); fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 });
    fs.copyFileSync(source, target); fs.chmodSync(target, 0o640);
  }
}

function validateReferences(destination, files) {
  const included = new Set(files);
  for (const relative of files.filter((file) => file.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(destination, relative), "utf8");
    for (const match of html.matchAll(/(?:src|href)="([^"']+)"/g)) {
      const reference = match[1];
      if (!reference || reference.startsWith("#") || reference.startsWith("//") || /^[a-z]+:/i.test(reference) || reference.includes("+") || reference.includes("'") || reference.split(/[?#]/, 1)[0].endsWith("/")) continue;
      const clean = reference.split(/[?#]/, 1)[0]; if (!clean) continue;
      const resolved = reference.startsWith("/") ? clean.slice(1) : path.normalize(path.join(path.dirname(relative), clean)).replaceAll(path.sep, "/");
      if (!included.has(resolved)) throw new Error(`Referenced essential asset is absent from deploy manifest: ${resolved}`);
    }
  }
}

const ANALYTICS_DISCLOSURES = Object.freeze([
  ["Actualmente no hay analítica activa ni cookies publicitarias. Si se activa Umami, medirá visitas agregadas y respetuosas con la privacidad sin cookies ni perfiles personales.", "Umami está activo y mide visitas agregadas respetuosas con la privacidad, sin cookies ni perfiles personales."],
  ["Analytics is currently disabled and no advertising cookies are used. If Umami is activated, it will measure aggregate, privacy-friendly visits without cookies or personal profiles.", "Umami analytics is active and measures aggregate, privacy-friendly visits without cookies or personal profiles."],
  ["Analytiikka ei ole tällä hetkellä käytössä eikä sivusto käytä mainosevästeitä. Jos Umami otetaan käyttöön, se mittaa koottuja käyntejä yksityisyyttä kunnioittaen ilman evästeitä tai henkilöprofiileja.", "Umami-analytiikka on käytössä ja mittaa koottuja käyntejä yksityisyyttä kunnioittaen ilman evästeitä tai henkilöprofiileja."],
  ["La analítica está desactivada. Si se activa Umami, medirá visitas agregadas sin cookies ni perfiles personales.", "Umami está activo y mide visitas agregadas sin cookies ni perfiles personales."],
  ["Analytics is disabled. If Umami is activated, it will measure aggregate visits without cookies or personal profiles.", "Umami analytics is active and measures aggregate visits without cookies or personal profiles."],
  ["Analytiikka ei ole käytössä. Jos Umami otetaan käyttöön, se mittaa koottuja käyntejä ilman evästeitä tai henkilöprofiileja.", "Umami-analytiikka on käytössä ja mittaa koottuja käyntejä ilman evästeitä tai henkilöprofiileja."],
]);

function analyticsPrivacyVariant(html) {
  let updated = html;
  for (const [disabled, active] of ANALYTICS_DISCLOSURES) updated = updated.replaceAll(disabled, active);
  if (ANALYTICS_DISCLOSURES.some(([disabled]) => updated.includes(disabled))) throw new Error("Inactive analytics disclosure remains in tracked HTML");
  return updated;
}

export async function generateSiteRelease({
  root, releaseRoot, contentRoot = path.join(root, "content/blog"), mediaRoot = path.join(contentRoot, "media"), manifestPath,
  umamiWebsiteId = process.env.UMAMI_WEBSITE_ID, umamiScriptUrl = process.env.UMAMI_SCRIPT_URL,
  umamiProductionVerified = process.env.UMAMI_PRODUCTION_VERIFIED === "true",
} = {}) {
  const sourceRoot = path.resolve(root); const destination = path.resolve(releaseRoot);
  if (destination === sourceRoot || !destination.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Release root must remain inside the project root");
  const files = readManifest(sourceRoot, manifestPath);
  fs.rmSync(destination, { recursive: true, force: true }); fs.mkdirSync(destination, { recursive: true, mode: 0o750 });
  copyManifest(sourceRoot, destination, files); validateReferences(destination, files);
  await generateBlog({ root: sourceRoot, contentRoot, mediaRoot, outputRoot: path.join(destination, "blog"), umamiProductionVerified: false });
  for (const required of ["index.html", "legal.html", "blog/index.html"]) {
    const target = path.join(destination, required); if (!fs.existsSync(target) || !fs.lstatSync(target).isFile()) throw new Error(`Required release output is missing: ${required}`);
  }
  const tracker = trackerMarkup(umamiWebsiteId, umamiScriptUrl, umamiProductionVerified);
  if (tracker) for (const file of htmlFiles(destination)) {
    let html = analyticsPrivacyVariant(fs.readFileSync(file, "utf8"));
    if (!html.includes("data-website-id=") && html.includes("</head>")) html = html.replace("</head>", `  ${tracker}\n</head>`);
    fs.writeFileSync(file, html, { mode: 0o640 });
  }
  for (const directory of [destination, path.join(destination, "blog")]) fs.chmodSync(directory, 0o750);
}
