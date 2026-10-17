import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function renderMarkdown(markdown) {
  return String(markdown)
    .replaceAll("\r\n", "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const safe = escapeHtml(block.trim());
      if (safe.startsWith("### ")) return `<h3>${safe.slice(4).replaceAll("\n", " ")}</h3>`;
      if (safe.startsWith("## ")) return `<h2>${safe.slice(3).replaceAll("\n", " ")}</h2>`;
      return `<p>${safe.replaceAll("\n", "<br>\n")}</p>`;
    })
    .join("\n    ");
}

function trackerMarkup(websiteId, scriptUrl) {
  if (!UUID_PATTERN.test(websiteId ?? "")) return "";
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

function page({ title, description, canonical, body, tracker }) {
  return `<!doctype html>
<html lang="es">
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
  return post;
}

export async function generateBlog({
  root,
  contentRoot = path.join(root, "content/blog"),
  outputRoot = path.join(root, "blog"),
  mediaRoot = path.join(contentRoot, "media"),
  umamiWebsiteId = process.env.UMAMI_WEBSITE_ID,
  umamiScriptUrl = process.env.UMAMI_SCRIPT_URL,
} = {}) {
  const posts = fs.existsSync(contentRoot)
    ? fs.readdirSync(contentRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => validatePost(JSON.parse(fs.readFileSync(path.join(contentRoot, entry.name), "utf8"))))
        .filter((post) => post.status === "published")
        .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
    : [];
  const tracker = trackerMarkup(umamiWebsiteId, umamiScriptUrl);
  const staging = `${outputRoot}.staging-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  if (fs.existsSync(mediaRoot)) fs.cpSync(mediaRoot, path.join(staging, "media"), { recursive: true });

  const cards = posts.length
    ? posts.map((post) => `<article class="post-card"><p class="meta">${escapeHtml(post.date)} · ${escapeHtml(post.category)}</p><h2><a href="/blog/${escapeHtml(post.slug)}/">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.description)}</p></article>`).join("\n      ")
    : `<section class="post-card" aria-labelledby="empty-title"><h2 id="empty-title">Próximamente</h2><p>Estamos preparando nuevos artículos para ayudarte a cuidar tu cuerpo en el día a día.</p></section>`;
  fs.writeFileSync(path.join(staging, "index.html"), page({
    title: "Blog | Sport Massage in Fuengirola",
    description: "Consejos de masaje deportivo, recuperación y bienestar en Fuengirola.",
    canonical: `${SITE_ORIGIN}/blog/`,
    tracker,
    body: `  <main><p class="eyebrow">Sport Massage in Fuengirola</p><h1>Consejos para moverte mejor.</h1><p class="intro">Artículos sobre masaje, recuperación muscular, postura y bienestar.</p><section class="posts">${cards}</section><a class="back" href="/">← Volver a Sport Massage</a></main>`,
  }));

  for (const post of posts) {
    const directory = path.join(staging, post.slug);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.html"), page({
      title: `${post.title} | Sport Massage in Fuengirola`,
      description: post.description,
      canonical: `${SITE_ORIGIN}/blog/${post.slug}/`,
      tracker,
      body: `  <main><p class="eyebrow">${escapeHtml(post.category || "Bienestar")}</p><h1>${escapeHtml(post.title)}</h1><p class="meta">${escapeHtml(post.date)} · ${escapeHtml(post.author)}</p><article class="article">${renderMarkdown(post.body)}</article><a class="back" href="/blog/">← Volver al blog</a></main>`,
    }));
  }

  const previous = `${outputRoot}.previous-${process.pid}`;
  fs.rmSync(previous, { recursive: true, force: true });
  if (fs.existsSync(outputRoot)) fs.renameSync(outputRoot, previous);
  try {
    fs.renameSync(staging, outputRoot);
    fs.rmSync(previous, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(previous) && !fs.existsSync(outputRoot)) fs.renameSync(previous, outputRoot);
    throw error;
  }
  return { posts: posts.length };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  await generateBlog({ root });
}
