import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBlogContentStore } from "../scripts/blog-content-store.mjs";

function fixture(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const contentRoot = path.join(root, "content/blog");
  const mediaRoot = path.join(contentRoot, "media");
  const stateDirectory = path.join(root, ".blogger-state");
  const outputRoot = path.join(stateDirectory, "public");
  const transactionRoot = path.join(stateDirectory, "transaction");
  fs.mkdirSync(mediaRoot, { recursive: true });
  return { root, contentRoot, mediaRoot, stateDirectory, outputRoot, transactionRoot };
}

function post() {
  return {
    title: "Committed post",
    slug: "committed-post",
    description: "A post that must survive post-commit maintenance failure.",
    date: "2026-10-18",
    lang: "es",
    author: "Sport Massage in Fuengirola",
    status: "published",
    image: "",
    tags: [],
    category: "Bienestar",
    level: "",
    body: "Committed body",
  };
}

test("old-release cleanup failure after activation cannot roll back or erase committed source", async () => {
  const paths = fixture("sportmassage-round2-cleanup-");
  const oldRelease = path.join(paths.outputRoot, "releases/old");
  fs.mkdirSync(oldRelease, { recursive: true });
  fs.writeFileSync(path.join(oldRelease, "index.html"), "old release\n");
  fs.symlinkSync("releases/old", path.join(paths.outputRoot, "current"));
  const maintenanceErrors = [];
  const store = createBlogContentStore({
    ...paths,
    build: async ({ releaseRoot }) => {
      fs.mkdirSync(releaseRoot, { recursive: true });
      fs.writeFileSync(path.join(releaseRoot, "index.html"), "new release\n");
    },
    removeRelease: () => { throw new Error("cleanup denied"); },
    onMaintenanceError: (entry) => maintenanceErrors.push(entry),
  });

  const created = await store.create(post());

  assert.equal(created.meta.status, "published");
  assert.equal(JSON.parse(fs.readFileSync(path.join(paths.contentRoot, "committed-post.json"), "utf8")).status, "published");
  assert.equal(fs.readFileSync(path.join(paths.outputRoot, "current/index.html"), "utf8"), "new release\n");
  assert.notEqual(fs.readlinkSync(path.join(paths.outputRoot, "current")), "releases/old");
  assert.equal(fs.existsSync(paths.transactionRoot), false);
  assert.equal(fs.existsSync(oldRelease), true);
  assert.equal(maintenanceErrors.length, 1);
  assert.equal(maintenanceErrors[0].phase, "release_cleanup");
  assert.match(maintenanceErrors[0].error.message, /cleanup denied/);
});

test("deployment bootstrap command creates the versioned release and current pointer served by Nginx", () => {
  const paths = fixture("sportmassage-round2-bootstrap-");
  fs.mkdirSync(path.join(paths.root, "propuesta/demo"), { recursive: true });
  fs.writeFileSync(path.join(paths.root, "index.html"), "<html><head></head><body>home</body></html>");
  fs.writeFileSync(path.join(paths.root, "legal.html"), "<html><head></head><body>legal</body></html>");
  fs.writeFileSync(path.join(paths.root, "propuesta/demo/index.html"), "<html><head></head><body>proposal</body></html>");

  const result = spawnSync("npm", ["run", "build:site", "--silent"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      BLOGGER_PROJECT_ROOT: paths.root,
      BLOGGER_STATE_DIR: ".blogger-state",
      BLOGGER_CONTENT_ROOT: "content/blog",
      BLOGGER_MEDIA_ROOT: "content/blog/media",
      UMAMI_WEBSITE_ID: "",
      UMAMI_SCRIPT_URL: "",
      UMAMI_PRODUCTION_VERIFIED: "false",
    },
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.lstatSync(path.join(paths.outputRoot, "current")).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(path.join(paths.outputRoot, "current/index.html"), "utf8"), "<html><head></head><body>home</body></html>");
  assert.equal(fs.existsSync(path.join(paths.outputRoot, "current/blog/index.html")), true);
  assert.equal(fs.existsSync(path.join(paths.root, "blog/index.html")), false);
});
