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
  for (const need of ["shared/settings.js", "shared/research.js", "shared/inpage-style.js", "shared/ruler.js", "shared/page-audio.js"]) {
    if (!webResources.has(need)) fail(`manifest → web_accessible_resources: missing ${need}`);
  }
} catch (e) {
  fail("manifest.json invalid JSON: " + e.message);
}

// The package manager metadata and submission instructions must describe the
// same uploadable extension version as manifest.json.
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  if (manifest && pkg.version !== manifest.version) {
    fail(`package.json version ${pkg.version} does not match manifest version ${manifest.version}`);
  }
  const listing = readFileSync(join(ROOT, "store", "listing.md"), "utf8");
  if (manifest && !listing.includes(`readtune-${manifest.version}.zip`)) {
    fail(`store/listing.md does not name the current upload artifact readtune-${manifest.version}.zip`);
  }
  const piperDoc = readFileSync(join(ROOT, "docs", "PIPER.md"), "utf8");
  if (manifest && !piperDoc.includes(`## As shipped (v${manifest.version})`)) {
    fail(`docs/PIPER.md does not name the current shipped version v${manifest.version}`);
  }
} catch (e) {
  fail("release metadata check failed: " + e.message);
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

// 3c. Security invariants that previously produced CodeQL alerts. Keep these
//     checks local so a future dependency/workflow edit cannot silently bring
//     the same findings back after GitHub has gone green.
try {
  const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  if (!/permissions:\s*\n\s+contents:\s*read/.test(ci)) {
    fail("CI workflow must explicitly restrict GITHUB_TOKEN to contents: read");
  }
  for (const m of ci.matchAll(/uses:\s*([^\s#]+)/g)) {
    const spec = m[1];
    const at = spec.lastIndexOf("@");
    const ref = at >= 0 ? spec.slice(at + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(ref)) fail(`CI action is not pinned to a full commit SHA: ${spec}`);
  }

  const readability = readFileSync(join(ROOT, "lib", "readability.js"), "utf8");
  for (const scheme of ["javascript:", "vbscript:", "data:"]) {
    if (!readability.includes(`unsafeHref.indexOf("${scheme}")`)) {
      fail(`vendored Readability URL hardening no longer blocks ${scheme}`);
    }
  }
} catch (e) {
  fail("security invariant check failed: " + e.message);
}

// 3d. Marketing media manifest: placeholders must never probe missing files.
try {
  const mediaDir = join(ROOT, "assets", "site");
  const mediaManifest = JSON.parse(readFileSync(join(mediaDir, "media.json"), "utf8"));
  const listed = new Set(Array.isArray(mediaManifest.files) ? mediaManifest.files : []);
  for (const name of listed) {
    if (!/^[a-z0-9-]+\.(?:png|mp4)$/i.test(name)) fail(`assets/site/media.json has an invalid filename: ${name}`);
    if (!existsSync(join(mediaDir, name))) fail(`assets/site/media.json lists a missing asset: ${name}`);
  }
  for (const name of readdirSync(mediaDir)) {
    if (/\.(?:png|mp4)$/i.test(name) && !listed.has(name)) fail(`assets/site/${name} exists but is not listed in media.json`);
  }
} catch (e) {
  fail("marketing media manifest check failed: " + e.message);
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

// 5. Public copy must keep the calibrated-flow and optional-network boundaries
// in sync. These are release promises, not marketing flourishes.
const publicCopy = {
  "index.html": [
    "four-minute preference check",
    "Six short passages",
    "Premium voice and ElevenLabs are separate optional voice paths",
  ],
  "privacy.html": [
    "Only article summaries are eligible for ReadTune's shared 30-day response cache.",
    "There is no ReadTune account.",
  ],
  "school.html": [
    "Ask AI, Premium voice, and reader-configured ElevenLabs",
    "Read-aloud uses Piper, a neural voice that runs entirely on the device.",
  ],
  "docs/DEVPOST.md": [
    "six short readings plus a\nwarm-up",
    "Local by default\" has clearly labelled opt-in exceptions",
  ],
};
for (const [rel, snippets] of Object.entries(publicCopy)) {
  const contents = readFileSync(join(ROOT, rel), "utf8");
  for (const snippet of snippets) {
    if (!contents.includes(snippet)) fail(`${rel} is missing the release-copy invariant: ${snippet}`);
  }
}
for (const [rel, stale] of Object.entries({
  "index.html": "A three-minute experiment",
  "docs/DEVPOST.md": "exactly one exception",
  "school.html": "The one exception",
})) {
  if (readFileSync(join(ROOT, rel), "utf8").includes(stale)) {
    fail(`${rel} contains stale release copy: ${stale}`);
  }
}
if (readFileSync(join(ROOT, "index.html"), "utf8").includes("the one opt-in exception")) {
  fail("index.html contains stale release copy: the one opt-in exception");
}
for (const rel of ["docs/LAUNCH.md", "docs/SCHOOL-DISTRICTS.md", "store/listing.md"]) {
  if (readFileSync(join(ROOT, rel), "utf8").includes("readtune.vercel.app")) {
    fail(`${rel} contains the retired readtune.vercel.app hostname`);
  }
}
for (const rel of ["PRIVACY.md", "privacy.html", "site.js"]) {
  if (readFileSync(join(ROOT, rel), "utf8").includes("readtune.app")) {
    fail(`${rel} contains the retired readtune.app hostname`);
  }
}
if (readFileSync(join(ROOT, "docs/SCHOOL-DISTRICTS.md"), "utf8").includes("the one opt-in\nexception")) {
  fail("docs/SCHOOL-DISTRICTS.md contains stale single-exception copy");
}

// 9. Legal/compliance release files and disclosure anchors must ship.
for (const rel of ["THIRD_PARTY_NOTICES.md", "terms.html"]) {
  if (!existsSync(join(ROOT, rel))) fail(`missing legal release file: ${rel}`);
}
for (const [rel, snippets] of Object.entries({
  "PRIVACY.md": ["Service providers and infrastructure", "pseudonymous HMAC fingerprint", "does not send the article URL", "Chrome Web Store Limited Use"],
  "privacy.html": ["Service providers and infrastructure", "pseudonymous HMAC fingerprint", "does not send the article URL", "Chrome Web Store Limited Use"],
  "terms.html": ["not a diagnosis, clinical assessment, medical device, treatment", "Third-Party Notices"],
  "store/listing.md": ["not a diagnosis, clinical assessment, medical device, or treatment", "pseudonymous rate-limit identifier"],
  "THIRD_PARTY_NOTICES.md": ["espeak-ng", "GPL-3.0-or-later"],
})) {
  const contents = readFileSync(join(ROOT, rel), "utf8");
  for (const snippet of snippets) {
    if (!contents.includes(snippet)) fail(`${rel} is missing legal/compliance invariant: ${snippet}`);
  }
}

try {
  const labCss = readFileSync(join(ROOT, "lab.css"), "utf8");
  const sidebar = readFileSync(join(ROOT, "shared", "assist-sidebar.js"), "utf8");
  const assistApi = readFileSync(join(ROOT, "api", "assist.js"), "utf8");
  if (!labCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))")) {
    fail("Voice Fit must retain the two-column comparison grid on wide screens");
  }
  if (sidebar.includes("From the start of a long article.")) {
    fail("assistant still claims long summaries only use the start of the article");
  }
  if (!assistApi.includes("const ANNOTATE_MAX_TOKENS = 1800;") || !assistApi.includes("pick 4 to 6 short passages")) {
    fail("annotation anti-truncation guard changed");
  }
  for (const rel of ["lab.html", "popup.html", "shared/controls.js"]) {
    if (readFileSync(join(ROOT, rel), "utf8").includes("Research-backed starter")) {
      fail(`${rel} still overstates the starter as research-backed`);
    }
  }
} catch (e) {
  fail("submission UX invariant check failed: " + e.message);
}

if (failures) {
  console.error(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log("✓ all checks passed (" + files.length + " files)");