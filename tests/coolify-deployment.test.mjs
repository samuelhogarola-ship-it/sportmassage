import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function composeService(source, name, nextName) {
  const pattern = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  ${nextName}:\\n|^volumes:\\n|^networks:\\n)`, "m");
  return source.match(pattern)?.[0] ?? "";
}

test("Compose isolates Blogger writes from the read-only public proxy", () => {
  const compose = read("compose.yaml");
  const blogger = composeService(compose, "blogger", "proxy");
  const proxy = composeService(compose, "proxy", "unused");
  assert.ok(blogger);
  assert.ok(proxy);
  assert.match(blogger, /HOST: "0\.0\.0\.0"/);
  assert.match(blogger, /- "8787"/);
  assert.match(blogger, /sportmassage_blog_content:\/app\/content\/blog/);
  assert.match(blogger, /sportmassage_blogger_state:\/app\/\.blogger-state/);
  assert.match(blogger, /sportmassage_blogger_public:\/app\/\.blogger-state\/public/);
  assert.match(proxy, /- "8080"/);
  assert.match(proxy, /sportmassage_blogger_public:\/usr\/share\/nginx\/html:ro/);
  assert.doesNotMatch(proxy, /sportmassage_blog_content|sportmassage_blogger_state/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
});

test("Compose keeps Blogger on an internal network and requires runtime secrets", () => {
  const compose = read("compose.yaml");
  assert.match(compose, /blogger_internal:\s*\n\s*internal: true/);
  assert.match(composeService(compose, "blogger", "proxy"), /networks:\s*\n\s*- blogger_internal/);
  assert.match(composeService(compose, "proxy", "unused"), /networks:\s*\n\s*- blogger_internal\s*\n\s*- web/);
  for (const name of ["BLOGGER_DIRECT_PASSWORD_HASH", "BLOGGER_SESSION_SECRET", "BLOGGER_HANDOFF_SECRET"]) {
    assert.match(compose, new RegExp(`${name}: ["']?\\x24\\{${name}:\\?`));
  }
});

test("unprivileged proxy uses writable temp paths and waits through the maximum build", () => {
  const nginx = read("deploy/nginx-coolify.conf");
  assert.match(nginx, /pid \/tmp\/nginx\/nginx\.pid;/);
  assert.match(nginx, /client_body_temp_path \/tmp\/nginx\/client_temp;/);
  assert.match(nginx, /proxy_temp_path \/tmp\/nginx\/proxy_temp;/);
  assert.match(nginx, /root \/usr\/share\/nginx\/html\/current;/);
  assert.match(nginx, /proxy_pass http:\/\/blogger:8787;/);
  assert.match(nginx, /proxy_read_timeout 910s;/);
  assert.match(nginx, /location = \/admin\/blogger\/login/);
  assert.match(nginx, /location ~ \^\/\(api\/admin\|api\/blogger\|api\/posts\|api\/build\|\\\.well-known\/wf-blogger\\\.json\)/);
});

test("separate images run Blogger and Nginx as the documented numeric identity", () => {
  const bloggerImage = read("Dockerfile");
  const proxyImage = read("Dockerfile.nginx");
  assert.match(bloggerImage, /USER 10001:10001/);
  assert.doesNotMatch(bloggerImage, /apt-get install[\s\S]*nginx/);
  assert.match(proxyImage, /FROM nginxinc\/nginx-unprivileged:/);
  assert.match(proxyImage, /USER 10001:10001/);
  assert.match(proxyImage, /deploy\/nginx-coolify\.conf/);
  assert.match(proxyImage, /ENTRYPOINT \["nginx"\]/);
});

test("Blogger entrypoint builds the persistent release before execing Node", () => {
  const entrypoint = path.join(root, "deploy/docker-entrypoint.sh");
  const syntax = spawnSync("sh", ["-n", entrypoint], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  const source = read("deploy/docker-entrypoint.sh");
  assert.match(source, /bootstrap-static-release\.mjs/);
  assert.match(source, /exec node scripts\/post-manager-server\.mjs/);
  assert.doesNotMatch(source, /nginx|envsubst|wait -n/);
});

test("deployment guide covers Literal secrets, numeric ownership and ordered restore", () => {
  const guide = read("docs/coolify-deployment.md");
  assert.match(guide, /Literal/i);
  assert.match(guide, /UID\/GID `10001:10001`/);
  assert.match(guide, /restore[\s\S]*content[\s\S]*state[\s\S]*public/i);
});
