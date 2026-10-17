import path from "node:path";
import { fileURLToPath } from "node:url";

import { createStaticReleaseBuildRunner } from "./blog-build-runner.mjs";
import { createBlogContentStore } from "./blog-content-store.mjs";

function confined(root, value, fallback, label) {
  const candidate = path.resolve(root, value || fallback);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error(`${label} must remain inside the project root`);
  return candidate;
}

function timeout(value) {
  if (value === undefined || value === "") return 120_000;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 15 * 60 * 1_000) throw new Error("Build timeout is invalid");
  return Number(value);
}

export async function bootstrapStaticRelease({ root, env = process.env } = {}) {
  const projectRoot = path.resolve(root ?? env.BLOGGER_PROJECT_ROOT ?? fileURLToPath(new URL("..", import.meta.url)));
  const stateDirectory = confined(projectRoot, env.BLOGGER_STATE_DIR, ".blogger-state", "State directory");
  const contentRoot = confined(projectRoot, env.BLOGGER_CONTENT_ROOT, "content/blog", "Content root");
  const mediaRoot = confined(projectRoot, env.BLOGGER_MEDIA_ROOT, "content/blog/media", "Media root");
  const outputRoot = confined(projectRoot, env.BLOGGER_OUTPUT_ROOT, path.relative(projectRoot, path.join(stateDirectory, "public")), "Output root");
  const buildTimeoutMs = timeout(env.BLOGGER_BUILD_TIMEOUT_MS);
  const store = createBlogContentStore({
    root: projectRoot,
    contentRoot,
    mediaRoot,
    outputRoot,
    transactionRoot: path.join(stateDirectory, "transaction"),
    build: createStaticReleaseBuildRunner({ root: projectRoot, contentRoot, mediaRoot, timeoutMs: buildTimeoutMs, env }),
  });
  await store.rebuild();
  return { current: path.join(outputRoot, "current") };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await bootstrapStaticRelease();
