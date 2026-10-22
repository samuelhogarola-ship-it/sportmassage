import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("Coolify compose keeps source content and Blogger state on separate named volumes", () => {
  const compose = read("compose.yaml");
  assert.match(compose, /sportmassage_blog_content:\s*$/m);
  assert.match(compose, /sportmassage_blogger_state:\s*$/m);
  assert.match(compose, /sportmassage_blog_content:\/app\/content\/blog/);
  assert.match(compose, /sportmassage_blogger_state:\/app\/\.blogger-state/);
  assert.match(compose, /expose:\s*\n\s*- "8080"/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.doesNotMatch(compose, /-\s*["']?8787(?::8787)?["']?/);
});

test("Coolify compose requires runtime secrets without containing secret values", () => {
  const compose = read("compose.yaml");
  for (const name of [
    "BLOGGER_DIRECT_PASSWORD_HASH",
    "BLOGGER_SESSION_SECRET",
    "BLOGGER_HANDOFF_SECRET",
  ]) {
    assert.match(compose, new RegExp(`${name}: [\"']?\\x24\\{${name}:\\?`));
  }
  assert.match(compose, /BLOGGER_DIRECT_USERNAME: sportsmassage/);
});

test("Nginx serves the active release and proxies only dynamic Blogger routes to loopback", () => {
  const nginx = read("deploy/nginx-coolify.conf.template");
  assert.match(nginx, /listen \$\{NGINX_LISTEN\};/);
  assert.match(nginx, /root \$\{PUBLIC_ROOT\};/);
  assert.match(nginx, /location = \/admin\/blogger\/login/);
  assert.match(nginx, /location = \/admin\/blogger\/launch/);
  assert.match(nginx, /location \/admin\/blogger\//);
  assert.match(nginx, /location ~ \^\/\(api\/admin\|api\/blogger\|api\/posts\|api\/build\|\\\.well-known\/wf-blogger\\\.json\)/);
  assert.match(nginx, /proxy_pass http:\/\/\$\{BLOGGER_UPSTREAM\};/);
  assert.match(nginx, /proxy_set_header Host \$host;/);
  assert.match(nginx, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  assert.match(nginx, /try_files \$uri \$uri\/ \$uri\/index\.html =404;/);
});

test("container entrypoint is valid shell and prepares the release before starting services", () => {
  const entrypoint = path.join(root, "deploy/docker-entrypoint.sh");
  const syntax = spawnSync("bash", ["-n", entrypoint], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  const source = read("deploy/docker-entrypoint.sh");
  assert.match(source, /bootstrap-static-release\.mjs/);
  assert.match(source, /envsubst/);
  assert.match(source, /post-manager-server\.mjs/);
  assert.match(source, /nginx/);
  assert.match(source, /wait -n/);
});

test("entrypoint bootstrap mode creates a release and rendered Nginx config on persistent paths", (t) => {
  const runtime = fs.mkdtempSync(path.join(root, ".coolify-test-"));
  t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
  const relativeRuntime = path.relative(root, runtime);
  const state = path.join(runtime, "state");
  const result = spawnSync("bash", [path.join(root, "deploy/docker-entrypoint.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      APP_ROOT: root,
      BLOGGER_BOOTSTRAP_ONLY: "true",
      BLOGGER_CONTENT_ROOT: path.join(relativeRuntime, "content/blog"),
      BLOGGER_MEDIA_ROOT: path.join(relativeRuntime, "content/blog/media"),
      BLOGGER_STATE_DIR: path.join(relativeRuntime, "state"),
      BLOGGER_OUTPUT_ROOT: path.join(relativeRuntime, "state/public"),
      PUBLIC_ROOT: path.join(state, "public/current"),
      NGINX_CONFIG: path.join(state, "nginx.conf"),
      NGINX_PID: path.join(state, "nginx.pid"),
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.lstatSync(path.join(state, "public/current")).isSymbolicLink(), true);
  assert.match(fs.readFileSync(path.join(state, "nginx.conf"), "utf8"), new RegExp(`root ${path.join(state, "public/current").replaceAll("/", "\\/")};`));
});

test("container image has a health check and does not bake local state or secrets", () => {
  const dockerfile = read("Dockerfile");
  const ignore = read(".dockerignore");
  assert.match(dockerfile, /FROM node:22-bookworm-slim/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /USER www-data/);
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.blogger-state\/$/m);
  assert.match(ignore, /^content\/blog\/$/m);
});
