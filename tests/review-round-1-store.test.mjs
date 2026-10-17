import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const content = await import("../scripts/blog-content-store.mjs").catch(() => ({}));
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sportmassage-round1-store-"));
  const contentRoot = path.join(root, "content/blog");
  const mediaRoot = path.join(contentRoot, "media");
  const stateRoot = path.join(root, ".state");
  const outputRoot = path.join(stateRoot, "public");
  const transactionRoot = path.join(stateRoot, "transaction");
  fs.mkdirSync(contentRoot, { recursive: true });
  fs.mkdirSync(mediaRoot, { recursive: true });
  return { root, contentRoot, mediaRoot, stateRoot, outputRoot, transactionRoot };
}

function post(overrides = {}) {
  return {
    title: "Transactional post",
    slug: "transactional-post",
    description: "A post for transactional review coverage.",
    date: "2026-10-18",
    lang: "es",
    author: "Sport Massage in Fuengirola",
    status: "draft",
    image: "",
    tags: [],
    category: "Bienestar",
    level: "",
    body: "Body",
    ...overrides,
  };
}

function currentFile(paths, file = "index.html") {
  return path.join(paths.outputRoot, "current", file);
}

function buildFromSources(paths, controls = {}) {
  return async ({ releaseRoot }) => {
    assert.equal(releaseRoot.startsWith(path.join(paths.outputRoot, "releases")), true);
    assert.equal(fs.existsSync(paths.transactionRoot), true);
    fs.mkdirSync(releaseRoot, { recursive: true });
    const published = fs.readdirSync(paths.contentRoot)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(fs.readFileSync(path.join(paths.contentRoot, file), "utf8")))
      .filter((item) => item.status === "published")
      .map((item) => item.title)
      .sort();
    fs.writeFileSync(path.join(releaseRoot, "index.html"), `${published.join("|") || "empty"}\n`);
    if (controls.fail) throw new Error("fixture build failed");
  };
}

test("service transactions use state/transaction and publish through an atomic current pointer", async () => {
  assert.equal(typeof content.createBlogContentStore, "function");
  const paths = fixture();
  const store = content.createBlogContentStore({
    ...paths,
    build: buildFromSources(paths),
  });
  await store.create(post({ status: "published" }));
  assert.equal(fs.lstatSync(path.join(paths.outputRoot, "current")).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(currentFile(paths), "utf8"), "Transactional post\n");
  assert.equal(fs.existsSync(paths.transactionRoot), false);
});

test("published to draft edits and explicit unpublish update source and public output together", async () => {
  const paths = fixture();
  const store = content.createBlogContentStore({ ...paths, build: buildFromSources(paths) });
  await store.create(post({ status: "published" }));
  await store.update(post().slug, post({ status: "draft", title: "Draft edit" }));
  assert.equal((await store.get(post().slug)).meta.status, "draft");
  assert.equal(fs.readFileSync(currentFile(paths), "utf8"), "empty\n");
  await store.publish(post().slug);
  await store.unpublish(post().slug);
  assert.equal((await store.get(post().slug)).meta.status, "draft");
  assert.equal(fs.readFileSync(currentFile(paths), "utf8"), "empty\n");
});

test("immediately published creation rolls source and current release back on build failure", async () => {
  const paths = fixture();
  const controls = { fail: false };
  const store = content.createBlogContentStore({ ...paths, build: buildFromSources(paths, controls) });
  await store.rebuild();
  controls.fail = true;
  await assert.rejects(() => store.create(post({ status: "published" })), /fixture build failed/);
  assert.equal(fs.existsSync(path.join(paths.contentRoot, `${post().slug}.json`)), false);
  assert.equal(fs.readFileSync(currentFile(paths), "utf8"), "empty\n");
});

test("published delete and media mutations rebuild transactionally and roll back on failure", async () => {
  const paths = fixture();
  const controls = { fail: false };
  const store = content.createBlogContentStore({ ...paths, build: buildFromSources(paths, controls) });
  await store.create(post({ status: "published" }));
  await store.saveImage(post().slug, { filename: "cover.png", bytes: onePixelPng });
  controls.fail = true;
  await assert.rejects(() => store.deleteImage(post().slug, "cover.png"), /fixture build failed/);
  assert.equal(fs.existsSync(path.join(paths.mediaRoot, post().slug, "cover.png")), true);
  await assert.rejects(() => store.delete(post().slug), /fixture build failed/);
  assert.equal((await store.get(post().slug)).meta.status, "published");
  assert.equal(fs.readFileSync(currentFile(paths), "utf8"), "Transactional post\n");
});

test("retained rebuild runs through the same single writer as mutations", async () => {
  const paths = fixture();
  let active = 0;
  let maximum = 0;
  const build = async ({ releaseRoot }) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.mkdirSync(releaseRoot, { recursive: true });
    fs.writeFileSync(path.join(releaseRoot, "index.html"), "release\n");
    active -= 1;
  };
  const store = content.createBlogContentStore({ ...paths, build });
  await Promise.all([store.rebuild(), store.create(post()), store.rebuild()]);
  assert.equal(maximum, 1);
});

test("release activation never removes the readable current pointer", async () => {
  const paths = fixture();
  let version = 0;
  const store = content.createBlogContentStore({
    ...paths,
    build: async ({ releaseRoot }) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      fs.mkdirSync(releaseRoot, { recursive: true });
      fs.writeFileSync(path.join(releaseRoot, "index.html"), `v${version += 1}\n`);
    },
  });
  await store.rebuild();
  const missing = [];
  const poll = setInterval(() => {
    try { fs.readFileSync(currentFile(paths), "utf8"); } catch (error) { missing.push(error.code); }
  }, 1);
  await store.rebuild();
  clearInterval(poll);
  assert.deepEqual(missing, []);
  assert.equal(fs.readFileSync(currentFile(paths), "utf8"), "v2\n");
});

test("startup recovery rolls back a prepared release or accepts an already-switched release", async () => {
  assert.equal(typeof content.recoverBlogTransaction, "function");
  const paths = fixture();
  const releases = path.join(paths.outputRoot, "releases");
  const oldId = "1700000000000-aaaaaaaaaaaaaaaa";
  const newId = "1700000000001-bbbbbbbbbbbbbbbb";
  const oldRelease = path.join(releases, oldId);
  const newRelease = path.join(releases, newId);
  fs.mkdirSync(oldRelease, { recursive: true });
  fs.mkdirSync(newRelease, { recursive: true });
  fs.writeFileSync(path.join(oldRelease, "index.html"), "old\n");
  fs.writeFileSync(path.join(newRelease, "index.html"), "new\n");
  fs.mkdirSync(paths.outputRoot, { recursive: true });
  fs.symlinkSync(`releases/${oldId}`, path.join(paths.outputRoot, "current"));
  fs.writeFileSync(path.join(paths.contentRoot, `${post().slug}.json`), `${JSON.stringify(post({ title: "mutated" }))}\n`);
  fs.mkdirSync(path.join(paths.transactionRoot, "content"), { recursive: true });
  fs.writeFileSync(path.join(paths.transactionRoot, "content", `${post().slug}.json`), `${JSON.stringify(post({ title: "original" }))}\n`);
  fs.writeFileSync(path.join(paths.transactionRoot, "journal.json"), `${JSON.stringify({ version: 1, phase: "release_ready", releaseId: newId, previousTarget: `releases/${oldId}` })}\n`);
  content.recoverBlogTransaction(paths);
  assert.equal(JSON.parse(fs.readFileSync(path.join(paths.contentRoot, `${post().slug}.json`), "utf8")).title, "original");
  assert.equal(fs.readlinkSync(path.join(paths.outputRoot, "current")), `releases/${oldId}`);
  assert.equal(fs.existsSync(newRelease), false);

  fs.mkdirSync(newRelease, { recursive: true });
  fs.writeFileSync(path.join(newRelease, "index.html"), "new\n");
  fs.rmSync(path.join(paths.outputRoot, "current"));
  fs.symlinkSync(`releases/${newId}`, path.join(paths.outputRoot, "current"));
  fs.mkdirSync(path.join(paths.transactionRoot, "content"), { recursive: true });
  fs.writeFileSync(path.join(paths.transactionRoot, "journal.json"), `${JSON.stringify({ version: 1, phase: "release_ready", releaseId: newId, previousTarget: `releases/${oldId}` })}\n`);
  content.recoverBlogTransaction(paths);
  assert.equal(fs.readlinkSync(path.join(paths.outputRoot, "current")), `releases/${newId}`);
  assert.equal(fs.existsSync(paths.transactionRoot), false);
});
