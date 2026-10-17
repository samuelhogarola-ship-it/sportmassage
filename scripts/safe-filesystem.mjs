import fs from "node:fs";
import path from "node:path";

export function assertLexicallyInside(root, candidate, label) {
  const base = path.resolve(root); const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`${label} escapes its configured root`);
  return resolved;
}

export function assertNoSymlinkPath(root, candidate, label, { allowMissing = true } = {}) {
  const base = path.resolve(root); const resolved = assertLexicallyInside(base, candidate, label);
  try { if (fs.lstatSync(base).isSymbolicLink()) throw new Error(`${label} contains a symlink`); }
  catch (error) { if (!(error.code === "ENOENT" && allowMissing)) throw error; }
  const relative = path.relative(base, resolved); let current = base;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} contains a symlink`); }
    catch (error) { if (error.code === "ENOENT" && allowMissing) break; throw error; }
  }
  return resolved;
}

export function copyRegularTree(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error("Source tree contains a symlink");
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o750 });
    for (const entry of fs.readdirSync(source)) copyRegularTree(path.join(source, entry), path.join(destination, entry));
    return;
  }
  if (!stat.isFile()) throw new Error("Source tree contains a non-regular file");
  fs.copyFileSync(source, destination); fs.chmodSync(destination, 0o640);
}

export function validateRegularTree(source) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error("Source tree contains a symlink");
  if (stat.isDirectory()) { for (const entry of fs.readdirSync(source)) validateRegularTree(path.join(source, entry)); return; }
  if (!stat.isFile()) throw new Error("Source tree contains a non-regular file");
}
