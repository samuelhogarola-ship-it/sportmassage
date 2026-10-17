import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const content = await import("../scripts/blog-content-store.mjs").catch(
  () => ({}),
);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sportmassage-store-"));
  const contentRoot = path.join(root, "content/blog");
  const mediaRoot = path.join(root, "blog/media");
  const outputRoot = path.join(root, "blog");
  fs.mkdirSync(contentRoot, { recursive: true });
  fs.mkdirSync(mediaRoot, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "index.html"), "stable\n");
  return { root, contentRoot, mediaRoot, outputRoot };
}

function post(overrides = {}) {
  return {
    title: "Cómo recuperar después del deporte",
    slug: "recuperacion-deportiva",
    description: "Consejos de recuperación deportiva en Fuengirola.",
    date: "2026-10-17",
    lang: "es",
    author: "Sport Massage in Fuengirola",
    status: "draft",
    image: "",
    tags: ["recuperación"],
    category: "Bienestar",
    level: "",
    body: "## Recuperación\n\nEscucha a tu cuerpo.",
    ...overrides,
  };
}

test("content paths and media names cannot escape configured roots", async () => {
  assert.equal(typeof content.createBlogContentStore, "function");
  const paths = fixture();
  const store = content.createBlogContentStore({ ...paths, build: async () => {} });
  for (const slug of ["../escape", "a/b", "%2e%2e", ".hidden"]) {
    await assert.rejects(() => store.create(post({ slug })), /slug/i);
  }
  await store.create(post());
  for (const filename of ["../escape.webp", "a/b.png", ".hidden.jpg", "x.svg"]) {
    await assert.rejects(
      () => store.saveImage(post().slug, { filename, bytes: Buffer.from("x") }),
      /image|file/i,
    );
  }
  assert.equal(fs.existsSync(path.join(paths.root, "escape.webp")), false);
});

test("media accepts confined web images and enforces byte limits", async () => {
  assert.equal(typeof content.createBlogContentStore, "function");
  const paths = fixture();
  const store = content.createBlogContentStore({
    ...paths,
    maxMediaBytes: 8,
    build: async () => {},
  });
  await store.create(post());
  const saved = await store.saveImage(post().slug, {
    filename: "cover.webp",
    bytes: Buffer.from("12345678"),
  });
  assert.equal(saved.file, "cover.webp");
  await assert.rejects(
    () =>
      store.saveImage(post().slug, {
        filename: "large.webp",
        bytes: Buffer.from("123456789"),
      }),
    /large/i,
  );
});

test("all mutations share one writer and cannot interleave", async () => {
  assert.equal(typeof content.createBlogContentStore, "function");
  const paths = fixture();
  let active = 0;
  let maximum = 0;
  const checkpoints = [];
  const store = content.createBlogContentStore({
    ...paths,
    mutationHook: async (label) => {
      active += 1;
      maximum = Math.max(maximum, active);
      checkpoints.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, 15));
      checkpoints.push(`end:${label}`);
      active -= 1;
    },
    build: async () => {},
  });
  await Promise.all([
    store.create(post({ slug: "primero" })),
    store.create(post({ slug: "segundo" })),
    store.create(post({ slug: "tercero" })),
  ]);
  assert.equal(maximum, 1);
  assert.deepEqual(checkpoints, [
    "start:create",
    "end:create",
    "start:create",
    "end:create",
    "start:create",
    "end:create",
  ]);
});

test("publish and unpublish commit source and generated output transactionally", async () => {
  assert.equal(typeof content.createBlogContentStore, "function");
  const paths = fixture();
  const build = async () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(paths.contentRoot, "transactional.json"), "utf8"),
    );
    fs.writeFileSync(
      path.join(paths.outputRoot, "index.html"),
      `${source.status}\n`,
    );
  };
  const store = content.createBlogContentStore({ ...paths, build });
  await store.create(post({ slug: "transactional" }));
  await store.publish("transactional");
  assert.equal((await store.get("transactional")).meta.status, "published");
  assert.equal(fs.readFileSync(path.join(paths.outputRoot, "index.html"), "utf8"), "published\n");
  await store.unpublish("transactional");
  assert.equal((await store.get("transactional")).meta.status, "draft");
  assert.equal(fs.readFileSync(path.join(paths.outputRoot, "index.html"), "utf8"), "draft\n");
});

test("failed or timed-out builds roll source and public output back", async () => {
  assert.equal(typeof content.createBlogContentStore, "function");
  const paths = fixture();
  const store = content.createBlogContentStore({
    ...paths,
    buildTimeoutMs: 40,
    build: async () => {
      fs.writeFileSync(path.join(paths.outputRoot, "index.html"), "broken\n");
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new Error("build exploded");
    },
  });
  await store.create(post({ slug: "rollback" }));
  await assert.rejects(() => store.publish("rollback"), /timed out|exploded/i);
  assert.equal((await store.get("rollback")).meta.status, "draft");
  assert.equal(fs.readFileSync(path.join(paths.outputRoot, "index.html"), "utf8"), "stable\n");
  assert.equal(fs.existsSync(path.join(paths.root, ".blogger-transaction")), false);
});
