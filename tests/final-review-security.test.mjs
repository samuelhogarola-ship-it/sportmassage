import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateImage } from "../scripts/image-validation.mjs";
import { createBlogContentStore, recoverBlogTransaction } from "../scripts/blog-content-store.mjs";
import { generateSiteRelease } from "../scripts/generate-site-release.mjs";
import { runIsolatedBuild } from "../scripts/blog-build-runner.mjs";

const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function temp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function post(slug = "locked") { return { title: "Locked", slug, description: "Process lock coverage.", date: "2026-10-18", lang: "en", author: "Author", status: "draft", image: "", tags: [], category: "", level: "", content_format: "markdown", body: "Body" }; }

test("supported image formats require matching magic, MIME, extension and bounded dimensions", () => {
  assert.deepEqual(validateImage({ filename: "a.png", bytes: png, declaredMime: "image/png" }), { mime: "image/png", width: 1, height: 1 });
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
  assert.deepEqual(validateImage({ filename: "a.gif", bytes: gif, declaredMime: "image/gif" }).width, 1);
  const jpeg = Buffer.from("ffd8ffc00011080001000103011100021100031100ffd9", "hex");
  assert.equal(validateImage({ filename: "a.jpg", bytes: jpeg, declaredMime: "image/jpeg" }).height, 1);
  const webp = Buffer.from("524946461600000057454250565038580a00000000000000000000000000", "hex");
  assert.equal(validateImage({ filename: "a.webp", bytes: webp, declaredMime: "image/webp" }).width, 1);
  assert.throws(() => validateImage({ filename: "a.jpg", bytes: png, declaredMime: "image/png" }), /MIME|extension/i);
  assert.throws(() => validateImage({ filename: "a.png", bytes: Buffer.from("fake"), declaredMime: "image/png" }), /malformed/i);
  const bomb = Buffer.from(png); bomb.writeUInt32BE(100_000, 16); bomb.writeUInt32BE(100_000, 20);
  assert.throws(() => validateImage({ filename: "bomb.png", bytes: bomb, declaredMime: "image/png" }), /dimensions/i);
});

test("two independent processes serialize mutations using one stale-safe filesystem lock", async () => {
  const root = temp("sportmassage-lock-");
  fs.mkdirSync(path.join(root, "content/blog/media"), { recursive: true });
  const stable = "1700000000000-aaaaaaaaaaaaaaaa";
  fs.mkdirSync(path.join(root, ".state/public/releases", stable), { recursive: true });
  fs.writeFileSync(path.join(root, ".state/public/releases", stable, "index.html"), "stable");
  fs.symlinkSync(`releases/${stable}`, path.join(root, ".state/public/current"));
  const worker = path.join(root, "worker.mjs");
  fs.writeFileSync(worker, `import fs from 'node:fs'; import {createBlogContentStore} from ${JSON.stringify(path.join(repo, "scripts/blog-content-store.mjs"))}; const [root,slug]=process.argv.slice(2); const log=root+'/events'; const store=createBlogContentStore({root,contentRoot:root+'/content/blog',mediaRoot:root+'/content/blog/media',outputRoot:root+'/.state/public',transactionRoot:root+'/.state/transaction',lockDirectory:root+'/.state/writer.lock',build:async()=>{},mutationHook:async()=>{fs.appendFileSync(log,'start:'+slug+'\\n');await new Promise(r=>setTimeout(r,150));fs.appendFileSync(log,'end:'+slug+'\\n')}}); await store.create(${JSON.stringify(post())}.slug ? {...${JSON.stringify(post())},slug} : {});`);
  const run = (slug) => new Promise((resolve, reject) => { const child = spawn(process.execPath, [worker, root, slug], { stdio: ["ignore", "pipe", "pipe"] }); let error=""; child.stderr.on("data", c => error += c); child.on("close", code => code === 0 ? resolve() : reject(new Error(error))); });
  await Promise.all([run("one"), run("two")]);
  const events = fs.readFileSync(path.join(root, "events"), "utf8").trim().split("\n");
  assert.equal(events.length, 4);
  assert.match(events.join(","), /^(start:one,end:one,start:two,end:two|start:two,end:two,start:one,end:one)$/);
  fs.mkdirSync(path.join(root, ".state/writer.lock"), { recursive: true });
  fs.writeFileSync(path.join(root, ".state/writer.lock/owner.json"), JSON.stringify({ pid: 99999999, createdAt: Date.now() - 600_000 }));
  await run("three");
});

test("content paths and recovery reject symlinks and hostile journal targets", () => {
  const root = temp("sportmassage-symlink-");
  const outside = temp("sportmassage-outside-");
  fs.mkdirSync(path.join(root, "content"), { recursive: true });
  fs.symlinkSync(outside, path.join(root, "content/blog"));
  assert.throws(() => createBlogContentStore({ root, contentRoot: path.join(root,"content/blog"), mediaRoot: path.join(root,"content/blog/media"), outputRoot: path.join(root,".state/public"), transactionRoot: path.join(root,".state/transaction"), build: async()=>{} }), /symlink/i);

  fs.rmSync(path.join(root, "content/blog"));
  fs.mkdirSync(path.join(root, "content/blog/media"), { recursive: true });
  fs.mkdirSync(path.join(root, ".state/public/releases"), { recursive: true });
  fs.mkdirSync(path.join(root, ".state/transaction/content"), { recursive: true });
  fs.writeFileSync(path.join(root, ".state/transaction/journal.json"), JSON.stringify({ version: 1, phase: "building", releaseId: "../../outside", previousTarget: "../../victim" }));
  fs.writeFileSync(path.join(outside, "sentinel"), "safe");
  assert.throws(() => recoverBlogTransaction({ root, contentRoot:path.join(root,"content/blog"), outputRoot:path.join(root,".state/public"), transactionRoot:path.join(root,".state/transaction") }), /journal/i);
  assert.equal(fs.readFileSync(path.join(outside, "sentinel"), "utf8"), "safe");

  fs.rmSync(path.join(root, ".state/transaction"), { recursive: true, force: true });
  fs.writeFileSync(path.join(root, "content/blog/live.json"), "live-source");
  fs.mkdirSync(path.join(root, ".state/transaction/content"), { recursive: true });
  fs.symlinkSync(path.join(outside, "sentinel"), path.join(root, ".state/transaction/content/trap.json"));
  fs.writeFileSync(path.join(root, ".state/transaction/journal.json"), JSON.stringify({ version:1, phase:"building", releaseId:"1700000000002-cccccccccccccccc", previousTarget:null }));
  assert.throws(() => recoverBlogTransaction({ root, contentRoot:path.join(root,"content/blog"), outputRoot:path.join(root,".state/public"), transactionRoot:path.join(root,".state/transaction") }), /symlink/i);
  assert.equal(fs.readFileSync(path.join(root, "content/blog/live.json"), "utf8"), "live-source");
});

test("media writes reject a symlinked post directory without touching its target", async () => {
  const root = temp("sportmassage-media-link-"); const outside = temp("sportmassage-media-target-");
  fs.mkdirSync(path.join(root, "content/blog/media"), { recursive:true });
  const store = createBlogContentStore({ root, contentRoot:path.join(root,"content/blog"), mediaRoot:path.join(root,"content/blog/media"), outputRoot:path.join(root,".state/public"), transactionRoot:path.join(root,".state/transaction"), build:async()=>{} });
  await store.create(post("linked-media"));
  fs.symlinkSync(outside, path.join(root, "content/blog/media/linked-media"));
  await assert.rejects(() => store.saveImage("linked-media", { filename:"cover.png", bytes:png, declaredMime:"image/png" }), /symlink/i);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("release generation uses an explicit manifest and rejects symlinks or missing essentials", async () => {
  const root = temp("sportmassage-manifest-");
  fs.mkdirSync(path.join(root, "content/blog"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<html><head></head><body><script src=\"/essential.js\"></script></body></html>");
  fs.writeFileSync(path.join(root, "legal.html"), "<html><head></head><body>Privacy</body></html>");
  fs.writeFileSync(path.join(root, "essential.js"), "ok");
  fs.writeFileSync(path.join(root, "deploy-manifest.json"), JSON.stringify({ files: ["index.html", "legal.html", "essential.js"] }));
  await generateSiteRelease({ root, releaseRoot:path.join(root,"release"), manifestPath:path.join(root,"deploy-manifest.json") });
  assert.equal(fs.existsSync(path.join(root,"release/blog/index.html")), true);
  fs.unlinkSync(path.join(root, "essential.js")); fs.symlinkSync("/etc/hosts", path.join(root, "essential.js"));
  await assert.rejects(() => generateSiteRelease({ root, releaseRoot:path.join(root,"release-2"), manifestPath:path.join(root,"deploy-manifest.json") }), /symlink|regular/i);
  fs.unlinkSync(path.join(root, "legal.html"));
  await assert.rejects(() => generateSiteRelease({ root, releaseRoot:path.join(root,"release-3"), manifestPath:path.join(root,"deploy-manifest.json") }), /required|missing/i);
});

test("release manifest rejects a regular file reached through a symlinked parent", async () => {
  const root = temp("sportmassage-manifest-parent-");
  const outside = temp("sportmassage-manifest-outside-");
  fs.mkdirSync(path.join(root, "content/blog"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<html><head></head><body></body></html>");
  fs.writeFileSync(path.join(root, "legal.html"), "<html><head></head><body></body></html>");
  fs.writeFileSync(path.join(outside, "escaped.js"), "outside\n");
  fs.symlinkSync(outside, path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "deploy-manifest.json"), JSON.stringify({ files: ["index.html", "legal.html", "assets/escaped.js"] }));

  await assert.rejects(
    () => generateSiteRelease({ root, releaseRoot: path.join(root, "release"), manifestPath: path.join(root, "deploy-manifest.json") }),
    /symlink/i,
  );
  assert.equal(fs.existsSync(path.join(root, "release/assets/escaped.js")), false);
});

test("isolated build receives only an allowlisted environment", async () => {
  const root = temp("sportmassage-env-");
  const script = path.join(root, "env.mjs");
  const output = path.join(root, "env.json");
  fs.writeFileSync(script, `import fs from 'node:fs'; fs.writeFileSync(process.argv[2], JSON.stringify(process.env));`);
  const prior = process.env.BLOGGER_SESSION_SECRET; process.env.BLOGGER_SESSION_SECRET = "must-not-leak";
  try { await runIsolatedBuild({ script, args:[output], env:{ BLOG_BUILD_ROOT:root, UMAMI_WEBSITE_ID:"allowed" } }); } finally { if (prior === undefined) delete process.env.BLOGGER_SESSION_SECRET; else process.env.BLOGGER_SESSION_SECRET=prior; }
  const childEnv = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(childEnv.BLOGGER_SESSION_SECRET, undefined);
  assert.equal(childEnv.BLOG_BUILD_ROOT, root);
  assert.equal(childEnv.PATH, process.env.PATH);
});

test("deployment documentation forbids a website-local Blogger authentication service", () => {
  const deploymentGuide = fs.readFileSync(path.join(repo, "docs/blogger-deployment.md"), "utf8");
  assert.match(deploymentGuide, /must not run a Blogger login service/i);
  assert.match(deploymentGuide, /https:\/\/blogger\.sportmassagefuengirola\.com\//);
  assert.doesNotMatch(deploymentGuide, /portal\.webfuengirola\.com\/acceso\/blogger\/sportmassagefuengirola/);
  assert.doesNotMatch(deploymentGuide, /same-origin login shell|BLOGGER_DIRECT_PASSWORD_HASH|BLOGGER_SESSION_SECRET/);
});
