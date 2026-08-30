/*
 * Builds a clean Chrome Web Store zip: only the files the extension ships,
 * no dev harness, no docs, no build tooling.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, rmSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;

const SHIP_FILES = ["manifest.json", "background.js", "content.js", "LICENSE"];
const SHIP_GLOBS = [
  "popup.html", "popup.js", "popup.css",
  "reader.html", "reader.js",
  "pdf.html", "pdfview.js", "pdf.css",
  "calibration.html", "calibration.js", "calibration.css",
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
rmSync(outPath, { force: true });
execFileSync("zip", ["-r", "-q", outPath, "readtune"], { cwd: staging });
rmSync(staging, { recursive: true, force: true });

const sizeMB = (readFileSync(outPath).length / 1024 / 1024).toFixed(2);
console.log(`✓ ${outName}  (${sizeMB} MB)  — upload this to the Chrome Web Store`);
