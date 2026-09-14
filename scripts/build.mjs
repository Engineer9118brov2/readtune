/*
 * Builds a clean Chrome Web Store zip: only the files the extension ships,
 * no dev harness, no docs, no build tooling.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, rmSync, readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;

const SHIP_FILES = ["manifest.json", "background.js", "content.js", "inpage.js", "inpage.css", "dictate.js", "LICENSE"];
const SHIP_GLOBS = [
  "popup.html", "popup.js", "popup.css",
  "reader.html", "reader.js",
  "pdf.html", "pdfview.js", "pdf.css",
  "calibration.html", "calibration.js", "calibration.css",
  "lab.html", "lab.js", "lab.css",
];
const SHIP_DIRS = ["icons", "shared", "lib"];

const staging = mkdtempSync(join(tmpdir(), "readtune-build-"));
const pkgDir = join(staging, "readtune");
mkdirSync(pkgDir, { recursive: true });

for (const f of [...SHIP_FILES, ...SHIP_GLOBS]) {
  if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(pkgDir, f));
}
for (const d of SHIP_DIRS) {
  cpSync(join(ROOT, d), join(pkgDir, d), { recursive: true });
}

const outName = `readtune-${version}.zip`;
const outPath = join(ROOT, outName);
const stagedArchive = join(staging, outName);
execFileSync("zip", ["-r", "-q", stagedArchive, "readtune"], { cwd: staging });

// Keep the store artifact honest: development material must never slip into the
// upload, and the default offline voice must always be present.
execFileSync("unzip", ["-tqq", stagedArchive]);
const archivePaths = execFileSync("unzip", ["-Z1", stagedArchive], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const requiredArchivePaths = [
  "readtune/manifest.json",
  "readtune/shared/piper/worker.js",
  "readtune/lib/ort/ort.wasm.min.js",
  "readtune/lib/piper/piper_phonemize.wasm",
  "readtune/lib/piper/voices/en_US-ljspeech-medium.onnx",
];
for (const required of requiredArchivePaths) {
  if (!archivePaths.includes(required)) {
    throw new Error(`Build archive is missing required runtime asset: ${required}`);
  }
}
const forbiddenArchiveParts = ["/test/", "/docs/", "/scripts/", "/node_modules/", "/.env"];
for (const path of archivePaths) {
  if (forbiddenArchiveParts.some((part) => path.includes(part))) {
    throw new Error(`Build archive contains development-only path: ${path}`);
  }
}

rmSync(outPath, { force: true });
copyFileSync(stagedArchive, outPath);
rmSync(staging, { recursive: true, force: true });

const sizeMB = (readFileSync(outPath).length / 1024 / 1024).toFixed(2);
console.log(`✓ ${outName}  (${sizeMB} MB)  — upload this to the Chrome Web Store`);
