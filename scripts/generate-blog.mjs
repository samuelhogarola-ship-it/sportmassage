import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateImage } from "./image-validation.mjs";

const SITE_ORIGIN = "https://sportmassagefuengirola.com";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function localMediaUrl(url, slug, mediaRoot) {
  const match = String(url).match(new RegExp(`^/blog/media/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([A-Za-z0-9][A-Za-z0-9._-]{0,99}\\.(?:gif|jpe?g|png|webp))$`, "i"));
  if (!match) return null;
  const file = path.join(mediaRoot, slug, match[1]);
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() ? url : null;
  } catch { return null; }
}

function renderInline(value, slug, mediaRoot) {
  const tokens = [];
  let source = String(value).replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (_all, alt, url) => {
    const safeUrl = localMediaUrl(url, slug, mediaRoot);
    if (!safeUrl) return alt;
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(`<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}">`);
    return token;
  });
  source = source.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (_all, label, url) => {
    let safeUrl = null;
    try { const parsed = new URL(url); if (["http:", "https:"].includes(parsed.protocol)) safeUrl = parsed.href; } catch { /* local links handled below */ }
    if (!safeUrl && /^\/(?!\/)[A-Za-z0-9/_#?.=&%-]*$/.test(url)) safeUrl = url;
    if (!safeUrl) return label;
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(`<a href="${escapeHtml(safeUrl)}" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    return token;
  });
  source = escapeHtml(source)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return source.replace(/\u0000(\d+)\u0000/g, (_all, index) => tokens[Number(index)]);
}

function renderMarkdown(markdown, slug, mediaRoot) {
  const lines = String(markdown).replaceAll("\r\n", "\n").split("\n");
  const output = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) { output.push(`<h${heading[1].length}>${renderInline(heading[2], slug, mediaRoot)}</h${heading[1].length}>`); index += 1; continue; }
    if (/^-\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) items.push(`<li>${renderInline(lines[index++].trim().slice(2), slug, mediaRoot)}</li>`);
      output.push(`<ul>\n      ${items.join("\n      ")}\n    </ul>`); continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{2,3}|-)\s+/.test(lines[index].trim())) paragraph.push(renderInline(lines[index++].trim(), slug, mediaRoot));
    output.push(`<p>${paragraph.join("<br>\n")}</p>`);
  }
  return output.join("\n    ");
}

function trackerMarkup(websiteId, scriptUrl, productionVerified) {
  if (productionVerified !== true || !UUID_PATTERN.test(websiteId ?? "")) return "";
  let parsed;
  try {
    parsed = new URL(scriptUrl);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
  return `\n  <script defer src="${escapeHtml(parsed.href)}" data-website-id="${escapeHtml(websiteId)}"></script>`;
}

const sharedStyles = `<style>
    :root{color-scheme:light;--navy:#102a35;--gold:#c9a96e;--paper:#f6f3ee;--muted:#53656b}*{box-sizing:border-box}body{margin:0;color:var(--navy);background:var(--paper);font:16px/1.7 Arial,sans-serif}main{width:min(920px,calc(100% - 40px));margin:0 auto;padding:72px 0}.eyebrow{color:var(--gold);letter-spacing:.16em;text-transform:uppercase;font-size:.78rem}h1{margin:12px 0 20px;font:500 clamp(2.5rem,7vw,5rem)/1 Georgia,serif}h2,h3{font-family:Georgia,serif}.intro,.meta{color:var(--muted)}.posts{display:grid;gap:20px;margin-top:44px}.post-card{padding:28px;background:#fff;border:1px solid #ded8ce}.post-card a,.back{color:inherit}.article{font-size:1.08rem}.article p{margin:1.2em 0}.back{display:inline-block;margin-top:36px;color:var(--gold)}
  </style>`;

function page({ title, description, canonical, body, tracker, lang = "es" }) {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${sharedStyles}${tracker}
</head>
<body>
${body}
</body>
</html>
`;
}

function validatePost(post) {
  if (!post || typeof post !== "object" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug ?? "")) {
    throw new Error("Invalid blog post");
  }
  for (const field of ["title", "description", "date", "author", "body", "status"]) {
    if (typeof post[field] !== "string") throw new Error(`Invalid blog post ${field}`);
  }
  if (!Array.isArray(post.tags)) throw new Error("Invalid blog post tags");
  if (post.content_format !== undefined && post.content_format !== "markdown") throw new Error("Invalid blog post content format");
  return post;
}

export async function generateBlog({
  root,
  contentRoot = path.join(root, "content/blog"),
  outputRoot = path.join(root, "blog"),
  mediaRoot = path.join(contentRoot, "media"),
  umamiWebsiteId = process.env.UMAMI_WEBSITE_ID,
  umamiScriptUrl = process.env.UMAMI_SCRIPT_URL,
  umamiProductionVerified = process.env.UMAMI_PRODUCTION_VERIFIED === "true",
} = {}) {
  const posts = fs.existsSync(contentRoot)
    ? fs.readdirSync(contentRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => validatePost(JSON.parse(fs.readFileSync(path.join(contentRoot, entry.name), "utf8"))))
        .filter((post) => post.status === "published")
        .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
    : [];
  const tracker = trackerMarkup(umamiWebsiteId, umamiScriptUrl, umamiProductionVerified);
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true, mode: 0o750 });
  for (const post of posts) {
    const sourceDirectory = path.join(mediaRoot, post.slug);
    if (!fs.existsSync(sourceDirectory)) continue;
    if (!fs.lstatSync(sourceDirectory).isDirectory() || fs.lstatSync(sourceDirectory).isSymbolicLink()) throw new Error("Blog media directory must be a regular directory");
    const destinationDirectory = path.join(outputRoot, "media", post.slug);
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
      if (entry.name === ".metadata.json") continue;
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Blog media must contain regular files only");
      const source = path.join(sourceDirectory, entry.name); const bytes = fs.readFileSync(source);
      validateImage({ filename: entry.name, bytes });
      fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o750 });
      const target = path.join(destinationDirectory, entry.name); fs.writeFileSync(target, bytes, { mode: 0o640 });
    }
  }

  const cards = posts.length
    ? posts.map((post) => `<article class="post-card"><p class="meta">${escapeHtml(post.date)} · ${escapeHtml(post.category)}</p><h2><a href="/blog/${escapeHtml(post.slug)}/">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.description)}</p></article>`).join("\n      ")
    : `<section class="post-card" aria-labelledby="empty-title"><h2 id="empty-title">Próximamente</h2><p>Estamos preparando nuevos artículos para ayudarte a cuidar tu cuerpo en el día a día.</p></section>`;
  fs.writeFileSync(path.join(outputRoot, "index.html"), page({
    title: "Blog | Sport Massage in Fuengirola",
    description: "Consejos de masaje deportivo, recuperación y bienestar en Fuengirola.",
    canonical: `${SITE_ORIGIN}/blog/`,
    tracker,
    body: `  <main><p class="eyebrow">Sport Massage in Fuengirola</p><h1>Consejos para moverte mejor.</h1><p class="intro">Artículos sobre masaje, recuperación muscular, postura y bienestar.</p><section class="posts">${cards}</section><a class="back" href="/">← Volver a Sport Massage</a></main>`,
  }), { mode: 0o640 });

  for (const post of posts) {
    const directory = path.join(outputRoot, post.slug);
    fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
    let featured = null;
    const metadataFile = path.join(mediaRoot, post.slug, ".metadata.json");
    if (fs.existsSync(metadataFile)) {
      const stat = fs.lstatSync(metadataFile); if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Invalid image metadata");
      const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
      for (const [filename, details] of Object.entries(metadata)) {
        const url = `/blog/media/${post.slug}/${filename}`;
        if (details?.isFeatured === true && localMediaUrl(url, post.slug, mediaRoot)) { featured = { url, ...details }; break; }
      }
    }
    const featuredMarkup = featured ? `<figure class="featured-image"><img src="${escapeHtml(featured.url)}" alt="${escapeHtml(featured.alt)}">${featured.description ? `<figcaption>${escapeHtml(featured.description)}</figcaption>` : ""}</figure>` : "";
    fs.writeFileSync(path.join(directory, "index.html"), page({
      title: `${post.title} | Sport Massage in Fuengirola`,
      description: post.description,
      canonical: `${SITE_ORIGIN}/blog/${post.slug}/`,
      tracker,
      lang: post.lang,
      body: `  <main><p class="eyebrow">${escapeHtml(post.category || "Bienestar")}</p><h1>${escapeHtml(post.title)}</h1><p class="meta">${escapeHtml(post.date)} · ${escapeHtml(post.author)}</p>${featuredMarkup}<article class="article">${renderMarkdown(post.body, post.slug, mediaRoot)}</article><a class="back" href="/blog/">← Volver al blog</a></main>`,
    }), { mode: 0o640 });
  }

  return { posts: posts.length };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  await generateBlog({ root });
}
