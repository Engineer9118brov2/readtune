/*
 * Fast pre-commit sanity check: every JS file parses, the manifest is valid,
 * and every path the manifest / HTML references exists.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => {
  console.error("✗ " + m);
  failures++;
};

function walk(dir, out = [], { skip = ["node_modules", ".git", ".chrome-ci", ".vercel", "lib", "test"] } = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, { skip });
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

// 3b. the Vercel site beacons must never reach a file the extension ships.
//     site.js is site-only; if it ever gets pulled into an extension page the
//     privacy policy stops being true, so fail loudly instead.
const SHIPPED = [
  "manifest.json", "background.js", "content.js", "inpage.js", "inpage.css", "dictate.js",
  "popup.html", "popup.js", "popup.css", "reader.html", "reader.js",
  "pdf.html", "pdfview.js", "pdf.css", "calibration.html", "calibration.js", "calibration.css",
  "lab.html", "lab.js", "lab.css",
];
for (const rel of SHIPPED) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  if (/_vercel|site\.js/.test(readFileSync(abs, "utf8"))) fail(`${rel} references site-only analytics — the extension must ship none`);
}
/* build.mjs copies every SHIP_DIR into the package wholesale, so the beacon
   must not be referenced from any of them — not just shared/. */
for (const dir of ["shared", "lib", "icons"]) {
  for (const abs of walk(join(ROOT, dir), [], { skip: [] })) {
    if (!/\.(m?js|cjs|html|css|json)$/.test(abs)) continue;
    if (/_vercel|["'`]\.?\/?site\.js["'`]/.test(readFileSync(abs, "utf8"))) {
      fail(`${abs.replace(ROOT + "/", "")} references site-only analytics — the extension must ship none`);
    }
  }
}

// 4. lib present — incl. the on-device voice engine and the bundled default voice
for (const need of [
  "lib/readability.js",
  "lib/pdf.min.js",
  "lib/pdf.worker.min.js",
  "lib/hyphen.js",
  "lib/fonts",
  "lib/ort/ort.wasm.min.js",
  "lib/piper/piper_phonemize.wasm",
  "lib/piper/piper_phonemize.data",
  "lib/piper/voices/en_US-ljspeech-medium.onnx",
  "lib/piper/voices/en_US-ljspeech-medium.onnx.json",
]) {
  if (!existsSync(join(ROOT, need))) fail(`missing ${need}`);
}

if (failures) {
  console.error(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log("✓ all checks passed (" + files.length + " files)");
