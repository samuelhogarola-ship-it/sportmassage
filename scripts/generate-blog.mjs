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
  const lines = String(markdown).replace(/\r\n?|\u2028|\u2029/g, "\n").split("\n");
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
    if (!paragraph.length) paragraph.push(renderInline(lines[index++].trim(), slug, mediaRoot));
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
  return `\n  <script defer src="/umami-loader.js" data-website-id="${escapeHtml(websiteId)}" data-script-url="${escapeHtml(parsed.href)}"></script>`;
}

const sharedStyles = `<style>
    :root{color-scheme:light;--navy:#102a35;--gold:#c9a96e;--paper:#f6f3ee;--muted:#53656b}*{box-sizing:border-box}body{margin:0;color:var(--navy);background:var(--paper);font:16px/1.7 Arial,sans-serif}main{width:min(1100px,calc(100% - 40px));margin:0 auto;padding:72px 0}.eyebrow{color:var(--gold);letter-spacing:.16em;text-transform:uppercase;font-size:.78rem}h1{max-width:720px;margin:12px 0 20px;font:500 clamp(2.5rem,7vw,5.6rem)/.98 Georgia,serif}h2,h3{font-family:Georgia,serif}.intro,.meta{color:var(--muted)}.posts{display:grid;gap:20px;margin-top:48px}.post-card,.empty{padding:32px;background:#fff;border:1px solid #ded8ce}.post-card a,.back{color:inherit}.article{font-size:1.08rem}.article p{margin:1.2em 0}.back{display:inline-block;margin-top:28px;color:var(--gold)}.site-top{width:min(1100px,calc(100% - 40px));margin:0 auto;padding:24px 0 0;display:flex;justify-content:space-between;align-items:center;gap:24px}.brand{color:var(--navy);text-decoration:none;font:600 1rem/1.1 Georgia,serif;letter-spacing:.03em}.brand small{display:block;margin-top:5px;color:#718086;font:500 .65rem/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase}.blog-nav{display:flex;align-items:center;gap:18px}.home-link{color:var(--gold);text-decoration:none;font-size:.82rem}.language-switcher{display:flex;gap:5px}.language-switcher button{border:1px solid #d8d0c4;border-radius:999px;background:transparent;color:#53656b;padding:6px 9px;cursor:pointer;font-size:.72rem;letter-spacing:.06em}.language-switcher button.active,.language-switcher button:hover{background:var(--navy);color:#fff;border-color:var(--navy)}@media(max-width:620px){.site-top{align-items:flex-start}.blog-nav{flex-direction:column;align-items:flex-end;gap:10px}}
    .intro { max-width: 650px; }
    .empty { margin-top: 48px; }
  </style>`;

const blogIndexScript = `  <script>
    const copy = {
      es: { home: 'Inicio', title: 'Aprende sobre tu cuerpo y tu salud.', intro: 'Artículos sobre masaje, recuperación muscular, postura y bienestar. Aquí aparecerán las publicaciones creadas desde Blogger.', soon: 'Próximamente', empty: 'Estamos preparando nuevos artículos para ayudarte a cuidar tu cuerpo en el día a día.', back: '← Volver a Sport Massage' },
      en: { home: 'Home', title: 'Learn about your body and your health.', intro: 'Articles about massage, muscle recovery, posture and wellbeing. New posts created from Blogger will appear here.', soon: 'Coming soon', empty: 'We are preparing new articles to help you care for your body every day.', back: '← Back to Sport Massage' }
    };
    function setBlogLanguage(lang) {
      const t = copy[lang] || copy.es;
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t[el.dataset.i18n]; });
      document.querySelectorAll('[data-lang]').forEach((button) => button.classList.toggle('active', button.dataset.lang === lang));
      try { localStorage.setItem('smf-lang', lang); } catch (error) {}
    }
    document.querySelectorAll('[data-lang]').forEach((button) => button.addEventListener('click', () => setBlogLanguage(button.dataset.lang)));
    let initialLanguage = 'es';
    try { initialLanguage = localStorage.getItem('smf-lang') || (navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es'); } catch (error) {}
    setBlogLanguage(initialLanguage);
  </script>`;

function page({ title, description, canonical, body, tracker, lang = "es" }) {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <script defer src="/language-analytics.js"></script>
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
    : `<h2 id="empty-title" data-i18n="soon">Próximamente</h2><p data-i18n="empty">Estamos preparando nuevos artículos para ayudarte a cuidar tu cuerpo en el día a día.</p>`;
  fs.writeFileSync(path.join(outputRoot, "index.html"), page({
    title: "Blog | Aprende sobre tu cuerpo y tu salud",
    description: "Aprende sobre tu cuerpo, masaje, recuperación y salud con Sport Massage Fuengirola.",
    canonical: `${SITE_ORIGIN}/blog/`,
    tracker,
    body: `  <header class="site-top"><a class="brand" href="/">Sport Massage<small>Fuengirola · Sofía</small></a><div class="blog-nav"><a class="home-link" href="/" data-i18n="home">Inicio</a><div class="language-switcher" aria-label="Language selector"><button type="button" data-lang="es" class="active">ES</button><button type="button" data-lang="en">EN</button></div></div></header>
  <main><p class="eyebrow">Sport Massage in Fuengirola</p><h1 data-i18n="title">Aprende sobre tu cuerpo y tu salud.</h1><p class="intro" data-i18n="intro">Artículos sobre masaje, recuperación muscular, postura y bienestar. Aquí aparecerán las publicaciones creadas desde Blogger.</p><section class="${posts.length ? "posts" : "empty"}"${posts.length ? "" : " aria-labelledby=\"empty-title\""}>${cards}</section><a class="back" href="/" data-i18n="back">← Volver a Sport Massage</a></main>
${blogIndexScript}`,
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
