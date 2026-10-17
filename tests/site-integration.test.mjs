import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("the service sandbox grants writes to every default transactional publication path", () => {
  const unit = fs.readFileSync(path.join(root, "deploy/sportmassage-blogger.service.example"), "utf8");
  const projectRoot = "/srv/sportmassage/current";
  const writableLine = unit.split("\n").find((line) => line.startsWith("ReadWritePaths="));
  const writable = writableLine.slice("ReadWritePaths=".length).trim().split(/\s+/).map((entry) => path.resolve(entry));
  const canWrite = (candidate) => writable.some((entry) => candidate === entry || candidate.startsWith(`${entry}${path.sep}`));
  for (const candidate of [
    path.join(projectRoot, "content/blog"),
    path.join(projectRoot, ".blogger-state/transaction"),
    path.join(projectRoot, ".blogger-state/public/releases"),
    path.join(projectRoot, ".blogger-state/public/current"),
  ]) assert.equal(canWrite(candidate), true, candidate);
});

test("committed public HTML is tracker-free and legal copy allows cookie-free Umami activation", () => {
  const pages = [
    "index.html",
    "legal.html",
    "blog/index.html",
    "propuesta/color-diferente/index.html",
    "propuesta/creativa/index.html",
    "propuesta/moderno/index.html",
  ];
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(html, /data-website-id|<script[^>]+umami/i, file);
    const legacyCms = ["word", "press"].join("");
    assert.equal(html.toLowerCase().includes(legacyCms), false, file);
  }
  const legal = fs.readFileSync(path.join(root, "legal.html"), "utf8");
  assert.match(legal, /Umami/);
  assert.match(legal, /sin cookies|without cookies|ilman evästeitä/i);
});
