/*
 * Fast pre-commit sanity check: every JS file parses, the manifest is valid,
 * and every path the manifest / HTML references exists.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => {
  console.error("✗ " + m);
  failures++;
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "lib", "test"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);

// 1. syntax
for (const f of files.filter((f) => extname(f) === ".js" || extname(f) === ".mjs")) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    fail(`syntax: ${f}\n${e.stderr}`);
  }
}

// 2. manifest
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3) fail("manifest_version is not 3");
  for (const p of ["background.service_worker", "action.default_popup"]) {
    const val = p.split(".").reduce((o, k) => o && o[k], manifest);
    if (val && !existsSync(join(ROOT, val))) fail(`manifest → ${p}: missing ${val}`);
  }
  for (const size of ["16", "48", "128"]) {
    const p = manifest.icons && manifest.icons[size];
    if (!p || !existsSync(join(ROOT, p))) fail(`manifest → icons.${size}: missing`);
  }
  const webResources = new Set((manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []));
  for (const need of ["shared/settings.js", "shared/research.js", "shared/inpage-style.js", "shared/ruler.js"]) {
    if (!webResources.has(need)) fail(`manifest → web_accessible_resources: missing ${need}`);
  }
} catch (e) {
  fail("manifest.json invalid JSON: " + e.message);
}

// 3. HTML asset references
for (const f of files.filter((f) => extname(f) === ".html")) {
  const html = readFileSync(f, "utf8");
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
    const target = join(dirname(f), ref);
    if (!existsSync(target)) fail(`${f.replace(ROOT + "/", "")} → missing ${ref}`);
  }
}

// 4. lib present
for (const need of ["lib/readability.js", "lib/pdf.min.js", "lib/pdf.worker.min.js", "lib/hyphen.js", "lib/fonts"]) {
  if (!existsSync(join(ROOT, need))) fail(`missing ${need}`);
}

if (failures) {
  console.error(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log("✓ all checks passed (" + files.length + " files)");
