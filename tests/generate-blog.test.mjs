import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const generator = await import("../scripts/generate-blog.mjs").catch(() => ({}));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sportmassage-generate-"));
  const contentRoot = path.join(root, "content/blog");
  const outputRoot = path.join(root, "blog");
  fs.mkdirSync(contentRoot, { recursive: true });
  return { root, contentRoot, outputRoot };
}

function writePost(contentRoot, overrides = {}) {
  const value = {
    title: "Recuperación <segura>",
    slug: "recuperacion-segura",
    description: 'Descripción con <script> y "comillas".',
    date: "2026-10-17",
    lang: "es",
    author: "Sport Massage & Wellness",
    status: "published",
    image: "",
    tags: ["recuperación"],
    category: "Bienestar",
    level: "",
    body: "## Cuerpo <fuerte>\n\nNo ejecutes <script>alert(1)</script>.",
    ...overrides,
  };
  fs.writeFileSync(
    path.join(contentRoot, `${value.slug}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

test("generator excludes drafts and creates stable canonical post URLs", async () => {
  assert.equal(typeof generator.generateBlog, "function");
  const paths = fixture();
  writePost(paths.contentRoot);
  writePost(paths.contentRoot, { slug: "borrador", status: "draft" });
  await generator.generateBlog(paths);
  const index = fs.readFileSync(path.join(paths.outputRoot, "index.html"), "utf8");
  const article = fs.readFileSync(path.join(paths.outputRoot, "recuperacion-segura/index.html"), "utf8");
  assert.match(index, /href="\/blog\/recuperacion-segura\/"/);
  assert.doesNotMatch(index, /borrador/);
  assert.match(article, /rel="canonical" href="https:\/\/sportmassagefuengirola\.com\/blog\/recuperacion-segura\/"/);
  assert.equal(fs.existsSync(path.join(paths.outputRoot, "borrador/index.html")), false);
});

test("generator escapes metadata and Markdown body HTML", async () => {
  assert.equal(typeof generator.generateBlog, "function");
  const paths = fixture();
  writePost(paths.contentRoot);
  await generator.generateBlog(paths);
  const article = fs.readFileSync(path.join(paths.outputRoot, "recuperacion-segura/index.html"), "utf8");
  assert.doesNotMatch(article, /<script>alert\(1\)<\/script>/);
  assert.match(article, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(article, /Recuperación &lt;segura&gt;/);
  assert.match(article, /Descripción con &lt;script&gt; y &quot;comillas&quot;\./);
});

test("generator output is byte-for-byte deterministic", async () => {
  assert.equal(typeof generator.generateBlog, "function");
  const paths = fixture();
  writePost(paths.contentRoot);
  await generator.generateBlog(paths);
  const first = new Map(
    ["index.html", "recuperacion-segura/index.html"].map((file) => [
      file,
      fs.readFileSync(path.join(paths.outputRoot, file), "utf8"),
    ]),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  await generator.generateBlog(paths);
  for (const [file, expected] of first) {
    assert.equal(fs.readFileSync(path.join(paths.outputRoot, file), "utf8"), expected);
  }
});

test("generated blog index preserves the approved bilingual design from main", async () => {
  assert.equal(typeof generator.generateBlog, "function");
  const paths = fixture();
  await generator.generateBlog(paths);
  const index = fs.readFileSync(path.join(paths.outputRoot, "index.html"), "utf8");
  assert.match(index, /<title>Blog \| Aprende sobre tu cuerpo y tu salud<\/title>/);
  assert.match(index, /class="language-switcher"/);
  assert.match(index, /data-lang="es"/);
  assert.match(index, /data-lang="en"/);
  assert.match(index, /data-i18n="title"/);
  assert.match(index, /localStorage\.setItem\('smf-lang', lang\)/);
});

test("Umami is injected only with a valid explicit website UUID", async () => {
  assert.equal(typeof generator.generateBlog, "function");
  const validId = "123e4567-e89b-42d3-a456-426614174000";
  for (const [websiteId, expected] of [
    [undefined, false],
    ["placeholder", false],
    [validId, true],
  ]) {
    const paths = fixture();
    writePost(paths.contentRoot);
    await generator.generateBlog({
      ...paths,
      umamiWebsiteId: websiteId,
      umamiScriptUrl: "https://analytics.example.com/script.js",
      umamiProductionVerified: websiteId === validId,
    });
    const html = fs.readFileSync(path.join(paths.outputRoot, "index.html"), "utf8");
    assert.equal(html.includes("data-website-id"), expected);
    assert.equal(html.includes(validId), expected);
  }
});
