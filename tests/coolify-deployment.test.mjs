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

test("Compose gives Blogger a dedicated egress network without direct ingress", () => {
  const compose = read("compose.yaml");
  assert.match(compose, /blogger_internal:\s*\n\s*internal: true/);
  assert.match(compose, /blogger_egress:\s*(?:\n|$)/);
  assert.doesNotMatch(compose, /blogger_egress:\s*\n\s*internal: true/);
  assert.match(composeService(compose, "blogger", "proxy"), /networks:\s*\n\s*- blogger_internal\s*\n\s*- blogger_egress/);
  assert.match(composeService(compose, "proxy", "unused"), /networks:\s*\n\s*- blogger_internal\s*\n\s*- web/);
  assert.doesNotMatch(composeService(compose, "blogger", "proxy"), /- web/);
  assert.doesNotMatch(composeService(compose, "proxy", "unused"), /- blogger_egress/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.doesNotMatch(compose, /^\s*labels:/m);
});

test("Compose requires runtime secrets without embedding their values", () => {
  const compose = read("compose.yaml");
  for (const name of ["BLOGGER_DIRECT_PASSWORD_HASH", "BLOGGER_SESSION_SECRET", "BLOGGER_HANDOFF_SECRET"]) {
    assert.match(compose, new RegExp(`${name}: ["']?\\x24\\{${name}:\\?`));
  }
  assert.match(composeService(compose, "blogger", "proxy"), /BLOGGER_TRUST_PROXY: "true"/);
});

test("Compose grants both services enough time for graceful shutdown", () => {
  const compose = read("compose.yaml");
  const blogger = composeService(compose, "blogger", "proxy");
  const proxy = composeService(compose, "proxy", "unused");
  assert.match(blogger, /stop_grace_period: (?:3[5-9]|[4-9]\d|\d{3,})s/);
  assert.match(proxy, /stop_signal: SIGQUIT/);
  assert.match(proxy, /stop_grace_period: (?:3[5-9]|[4-9]\d|\d{3,})s/);
});

test("unprivileged proxy uses writable temp paths and waits through the maximum build", () => {
  const nginx = read("deploy/nginx-coolify.conf");
  assert.match(nginx, /pid \/tmp\/nginx\/nginx\.pid;/);
  assert.match(nginx, /client_body_temp_path \/tmp\/nginx\/client_temp;/);
  assert.match(nginx, /proxy_temp_path \/tmp\/nginx\/proxy_temp;/);
  assert.match(nginx, /fastcgi_temp_path \/tmp\/nginx\/fastcgi_temp;/);
  assert.match(nginx, /uwsgi_temp_path \/tmp\/nginx\/uwsgi_temp;/);
  assert.match(nginx, /scgi_temp_path \/tmp\/nginx\/scgi_temp;/);
  assert.match(nginx, /root \/usr\/share\/nginx\/html\/current;/);
  assert.match(nginx, /proxy_pass http:\/\/blogger:8787;/);
  assert.match(nginx, /proxy_read_timeout 910s;/);
  assert.match(nginx, /map \$http_x_real_ip \$blogger_client_ip/);
  assert.match(nginx, /default \$remote_addr;/);
  assert.match(nginx, /proxy_set_header X-Real-IP \$blogger_client_ip;/);
  assert.doesNotMatch(nginx, /proxy_set_header X-Real-IP \$remote_addr;/);
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
  for (const directory of ["client_temp", "proxy_temp", "fastcgi_temp", "uwsgi_temp", "scgi_temp"]) {
    assert.match(proxyImage, new RegExp(`/tmp/nginx/${directory}`));
  }
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
