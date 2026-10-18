import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { validateImage } from "./image-validation.mjs";
import { withFilesystemLock } from "./filesystem-lock.mjs";
import { assertNoSymlinkPath, copyRegularTree, validateRegularTree } from "./safe-filesystem.mjs";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(?:gif|jpe?g|png|webp)$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_ID_PATTERN = /^\d{13}-[0-9a-f]{16}$/;
const RELEASE_TARGET_PATTERN = /^releases\/\d{13}-[0-9a-f]{16}$/;

function validateSlug(slug) {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) throw new Error("Invalid post slug");
  return slug;
}

function normalizePost(input, forcedSlug) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Post must be an object");
  const slug = validateSlug(forcedSlug ?? input.slug);
  for (const key of ["title", "description", "date", "lang", "author", "body"]) {
    if (typeof input[key] !== "string" || !input[key].trim()) throw new Error(`Post ${key} is required`);
  }
  if (!DATE_PATTERN.test(input.date)) throw new Error("Post date is invalid");
  const [year, month, day] = input.date.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) throw new Error("Post date is invalid");
  if (!/^[a-z]{2}$/.test(input.lang)) throw new Error("Post language is invalid");
  if (!["draft", "published"].includes(input.status)) throw new Error("Post status is invalid");
  const tags = typeof input.tags === "string" ? input.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : (input.tags ?? []);
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
    throw new Error("Post tags are invalid");
  }
  const contentFormat = input.content_format ?? "markdown";
  if (contentFormat !== "markdown") throw new Error("Post content format is invalid");
  return {
    title: input.title.trim(), slug, description: input.description.trim(), date: input.date,
    lang: input.lang, author: input.author.trim(), status: input.status,
    image: typeof input.image === "string" ? input.image : "", tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))],
    category: typeof input.category === "string" ? input.category : "",
    level: typeof input.level === "string" ? input.level : "", content_format: contentFormat, body: input.body,
  };
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function editorPost(post, mediaRoot) {
  const imageDirectory = path.join(mediaRoot, post.slug);
  const metadataFile = path.join(imageDirectory, ".metadata.json");
  let metadata = {};
  if (fs.existsSync(metadataFile)) {
    const stat = fs.lstatSync(metadataFile);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Image metadata must be a regular file");
    try { metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8")); } catch { metadata = {}; }
  }
  const images = fs.existsSync(imageDirectory)
    ? fs.readdirSync(imageDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && IMAGE_PATTERN.test(entry.name))
        .map((entry) => ({
          file: entry.name, url: `/blog/media/${post.slug}/${entry.name}`,
          alt: typeof metadata[entry.name]?.alt === "string" ? metadata[entry.name].alt : "",
          description: typeof metadata[entry.name]?.description === "string" ? metadata[entry.name].description : "",
          isFeatured: metadata[entry.name]?.isFeatured === true, canDelete: true,
        })).sort((a, b) => a.file.localeCompare(b.file))
    : [];
  return { slug: post.slug, meta: { ...post }, body: post.body, format: post.content_format, images,
    isPublished: post.status === "published", words: post.body.trim() ? post.body.trim().split(/\s+/).length : 0 };
}

function copyDirectory(source, destination) {
  if (fs.existsSync(source)) copyRegularTree(source, destination);
}

function currentTarget(outputRoot) {
  const current = path.join(outputRoot, "current");
  try {
    if (!fs.lstatSync(current).isSymbolicLink()) throw new Error("Current release pointer is invalid");
    const target = fs.readlinkSync(current);
    if (!RELEASE_TARGET_PATTERN.test(target)) throw new Error("Current release pointer is invalid");
    return target;
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function activateRelease(outputRoot, target) {
  if (!RELEASE_TARGET_PATTERN.test(target)) throw new Error("Release target is invalid");
  fs.mkdirSync(outputRoot, { recursive: true });
  const current = path.join(outputRoot, "current");
  const temporary = path.join(outputRoot, `.current-${process.pid}-${randomBytes(6).toString("hex")}`);
  fs.symlinkSync(target, temporary);
  fs.renameSync(temporary, current);
}

function restoreContent(contentRoot, snapshotRoot) {
  validateRegularTree(snapshotRoot);
  const nonce = `${process.pid}-${randomBytes(6).toString("hex")}`;
  const prepared = `${contentRoot}.restore-${nonce}`; const backup = `${contentRoot}.backup-${nonce}`;
  copyDirectory(snapshotRoot, prepared);
  fs.renameSync(contentRoot, backup);
  try { fs.renameSync(prepared, contentRoot); fs.rmSync(backup, { recursive: true, force: true }); }
  catch (error) { if (!fs.existsSync(contentRoot) && fs.existsSync(backup)) fs.renameSync(backup, contentRoot); fs.rmSync(prepared, { recursive: true, force: true }); throw error; }
}

export function recoverBlogTransaction({ root, contentRoot, outputRoot, transactionRoot }) {
  const projectRoot = path.resolve(root);
  const sources = assertNoSymlinkPath(projectRoot, contentRoot, "Content root");
  const output = assertNoSymlinkPath(projectRoot, outputRoot, "Output root");
  const transaction = assertNoSymlinkPath(projectRoot, transactionRoot, "Transaction root");
  const journalFile = path.join(transaction, "journal.json");
  if (!fs.existsSync(journalFile)) return false;
  if (fs.lstatSync(journalFile).isSymbolicLink()) throw new Error("Invalid transaction journal");
  const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
  if (journal?.version !== 1 || !["prepared", "building", "release_ready", "activated"].includes(journal.phase) || !RELEASE_ID_PATTERN.test(journal.releaseId ?? "") || !(journal.previousTarget === null || RELEASE_TARGET_PATTERN.test(journal.previousTarget ?? ""))) throw new Error("Invalid transaction journal");
  const releaseTarget = `releases/${journal.releaseId}`;
  if (currentTarget(output) === releaseTarget) {
    fs.rmSync(transaction, { recursive: true, force: true });
    return true;
  }
  restoreContent(sources, path.join(transaction, "content"));
  fs.rmSync(path.join(output, releaseTarget), { recursive: true, force: true });
  if (journal.previousTarget && currentTarget(output) !== journal.previousTarget) activateRelease(output, journal.previousTarget);
  fs.rmSync(transaction, { recursive: true, force: true });
  return true;
}

export function createBlogContentStore({
  root, contentRoot, mediaRoot, outputRoot, transactionRoot, build,
  lockDirectory,
  maxMediaBytes = 10 * 1024 * 1024, mutationHook = async () => {},
  removeRelease = (directory) => fs.rmSync(directory, { recursive: true, force: true }),
  onMaintenanceError = (record) => console.error(JSON.stringify(record)),
}) {
  const projectRoot = path.resolve(root);
  const sources = assertNoSymlinkPath(projectRoot, contentRoot, "Content root");
  const media = assertNoSymlinkPath(sources, mediaRoot, "Media root");
  const output = assertNoSymlinkPath(projectRoot, outputRoot, "Output root");
  const transaction = assertNoSymlinkPath(projectRoot, transactionRoot ?? path.join(projectRoot, ".blogger-transaction"), "Transaction root");
  const lock = assertNoSymlinkPath(projectRoot, lockDirectory ?? path.join(path.dirname(transaction), "writer.lock"), "Writer lock");
  const overlaps = (left, right) => left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
  if (overlaps(sources, output) || overlaps(sources, transaction) || overlaps(output, transaction) || overlaps(lock, sources) || overlaps(lock, output) || overlaps(lock, transaction)) throw new Error("Content, output, transaction, and writer lock roots must not overlap");
  if (typeof build !== "function") throw new Error("Build function is required");
  fs.mkdirSync(sources, { recursive: true, mode: 0o750 });
  fs.mkdirSync(media, { recursive: true, mode: 0o750 });
  fs.mkdirSync(path.join(output, "releases"), { recursive: true, mode: 0o750 });
  fs.chmodSync(output, 0o750); fs.chmodSync(path.join(output, "releases"), 0o750);
  let writer = Promise.resolve();

  function sourceFile(slug) {
    validateSlug(slug);
    return assertNoSymlinkPath(sources, path.join(sources, `${slug}.json`), "Post path");
  }
  function read(slug) {
    const file = sourceFile(slug);
    if (!fs.existsSync(file)) throw new Error("Post not found");
    return normalizePost(JSON.parse(fs.readFileSync(file, "utf8")), slug);
  }
  function mutate(label, operation) {
    const run = writer.then(() => withFilesystemLock(lock, async () => {
      recoverBlogTransaction({ root: projectRoot, contentRoot: sources, outputRoot: output, transactionRoot: transaction });
      await mutationHook(label); return operation();
    }));
    writer = run.catch(() => {});
    return run;
  }
  function journal(value) { atomicJson(path.join(transaction, "journal.json"), { version: 1, ...value }); }
  function cleanupOldReleases() {
    const active = currentTarget(output);
    for (const entry of fs.readdirSync(path.join(output, "releases"), { withFileTypes: true })) {
      if (!RELEASE_ID_PATTERN.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) throw Object.assign(new Error("Invalid release entry"), { code: "INVALID_RELEASE_ENTRY" });
      if (`releases/${entry.name}` !== active) removeRelease(path.join(output, "releases", entry.name));
    }
  }
  function reportMaintenanceError(phase, error) {
    const errorCode = typeof error?.code === "string" && /^[A-Z0-9_]{2,40}$/.test(error.code) ? error.code : "MAINTENANCE_FAILED";
    try { onMaintenanceError({ event: "blogger_maintenance_error", phase, errorCode }); } catch { /* maintenance reporting cannot change commit semantics */ }
  }
  async function transact(operation) {
    if (fs.existsSync(path.join(transaction, "journal.json"))) throw new Error("Unresolved transaction journal");
    fs.rmSync(transaction, { recursive: true, force: true });
    fs.mkdirSync(transaction, { recursive: true, mode: 0o700 });
    copyDirectory(sources, path.join(transaction, "content"));
    const releaseId = `${Date.now()}-${randomBytes(8).toString("hex")}`;
    const releaseTarget = `releases/${releaseId}`;
    const releaseRoot = path.join(output, releaseTarget);
    const previousTarget = currentTarget(output);
    journal({ phase: "prepared", releaseId, previousTarget });
    let result;
    try {
      result = await operation();
      journal({ phase: "building", releaseId, previousTarget });
      await build({ releaseRoot, releaseId });
      const releaseStat = fs.lstatSync(assertNoSymlinkPath(projectRoot, releaseRoot, "Release root"));
      if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) throw new Error("Build did not create a regular release directory");
      validateRegularTree(releaseRoot);
      journal({ phase: "release_ready", releaseId, previousTarget });
      activateRelease(output, releaseTarget);
    } catch (error) {
      restoreContent(sources, path.join(transaction, "content"));
      fs.rmSync(releaseRoot, { recursive: true, force: true });
      if (previousTarget && currentTarget(output) !== previousTarget) activateRelease(output, previousTarget);
      fs.rmSync(transaction, { recursive: true, force: true });
      throw error;
    }
    try { journal({ phase: "activated", releaseId, previousTarget }); } catch (error) { reportMaintenanceError("journal_finalize", error); }
    try { fs.rmSync(transaction, { recursive: true, force: true }); } catch (error) { reportMaintenanceError("transaction_cleanup", error); }
    try { cleanupOldReleases(); } catch (error) { reportMaintenanceError("release_cleanup", error); }
    return result;
  }
  async function statusChange(slug, status) {
    return mutate(status === "published" ? "publish" : "unpublish", async () => {
      const original = read(slug);
      if (original.status === status) return editorPost(original, media);
      const next = { ...original, status };
      return transact(async () => { atomicJson(sourceFile(slug), next); return editorPost(next, media); });
    });
  }
  function mediaMutation(label, slug, operation) {
    return mutate(label, async () => {
      const post = read(slug);
      return post.status === "published" ? transact(operation) : operation();
    });
  }

  return {
    async list() {
      return mutate("read", async () => fs.readdirSync(sources, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => editorPost(read(entry.name.slice(0, -5)), media))
        .sort((a, b) => b.meta.date.localeCompare(a.meta.date) || a.slug.localeCompare(b.slug)));
    },
    async get(slug) { return mutate("read", async () => editorPost(read(slug), media)); },
    async recover() { return mutate("recover", async () => false); },
    create(input) {
      return mutate("create", async () => {
        const post = normalizePost(input);
        const operation = async () => {
          const file = sourceFile(post.slug);
          if (fs.existsSync(file)) throw new Error("Post already exists");
          atomicJson(file, post);
          return editorPost(post, media);
        };
        return post.status === "published" ? transact(operation) : operation();
      });
    },
    update(slug, input) {
      return mutate("update", async () => {
        const original = read(slug);
        const post = normalizePost({ ...input, slug }, slug);
        const operation = async () => { atomicJson(sourceFile(slug), post); return editorPost(post, media); };
        return original.status === "published" || post.status === "published" ? transact(operation) : operation();
      });
    },
    updatePublished(slug, input) { return this.update(slug, { ...input, status: "published" }); },
    delete(slug) {
      return mutate("delete", async () => {
        const post = read(slug);
        const operation = async () => { fs.rmSync(sourceFile(slug)); fs.rmSync(path.join(media, slug), { recursive: true, force: true }); };
        return post.status === "published" ? transact(operation) : operation();
      });
    },
    publish(slug) { return statusChange(slug, "published"); },
    unpublish(slug) { return statusChange(slug, "draft"); },
    rebuild() { return mutate("build", () => transact(async () => undefined)); },
    saveImage(slug, { filename, bytes, declaredMime }) {
      return mediaMutation("image", slug, async () => {
        if (typeof filename !== "string" || !IMAGE_PATTERN.test(filename)) throw new Error("Invalid image filename");
        if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxMediaBytes) throw new Error("Image is empty or too large");
        validateImage({ filename, bytes, declaredMime });
        const directory = assertNoSymlinkPath(media, path.join(media, slug), "Image directory");
        const file = assertNoSymlinkPath(directory, path.join(directory, filename), "Image file");
        fs.mkdirSync(directory, { recursive: true });
        const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
        fs.writeFileSync(temporary, bytes, { mode: 0o600 }); fs.renameSync(temporary, file);
        return { file: filename, url: `/blog/media/${slug}/${filename}`, alt: "", description: "", isFeatured: false, canDelete: true };
      });
    },
    updateImage(slug, filename, input) {
      return mediaMutation("image-metadata", slug, async () => {
        if (!IMAGE_PATTERN.test(filename)) throw new Error("Invalid image filename");
        const directory = assertNoSymlinkPath(media, path.join(media, slug), "Image directory");
        const file = assertNoSymlinkPath(directory, path.join(directory, filename), "Image file");
        if (!fs.existsSync(file)) throw new Error("Image not found");
        if (typeof input?.alt !== "string" || typeof input?.description !== "string" || typeof input?.isFeatured !== "boolean" || input.alt.length > 300 || input.description.length > 1_000) throw new Error("Invalid image metadata");
        const metadataFile = assertNoSymlinkPath(directory, path.join(directory, ".metadata.json"), "Image metadata");
        let metadata = fs.existsSync(metadataFile) ? JSON.parse(fs.readFileSync(metadataFile, "utf8")) : {};
        if (input.isFeatured) for (const item of Object.values(metadata)) item.isFeatured = false;
        metadata[filename] = { alt: input.alt, description: input.description, isFeatured: input.isFeatured };
        atomicJson(metadataFile, metadata);
        return editorPost(read(slug), media).images.find((image) => image.file === filename);
      });
    },
    deleteImage(slug, filename) {
      return mediaMutation("image-delete", slug, async () => {
        if (!IMAGE_PATTERN.test(filename)) throw new Error("Invalid image filename");
        const directory = assertNoSymlinkPath(media, path.join(media, slug), "Image directory");
        const file = assertNoSymlinkPath(directory, path.join(directory, filename), "Image file");
        if (!fs.existsSync(file)) throw new Error("Image not found");
        fs.rmSync(file);
        const metadataFile = assertNoSymlinkPath(directory, path.join(directory, ".metadata.json"), "Image metadata");
        if (fs.existsSync(metadataFile)) {
          const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8")); delete metadata[filename];
          if (Object.keys(metadata).length) atomicJson(metadataFile, metadata); else fs.rmSync(metadataFile);
        }
      });
    },
  };
}
