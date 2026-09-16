import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "pdfview.js"), "utf8");
const checks = [
  ["let loading = false", "PDF mode needs an in-flight loading guard"],
  ["if (loading) return;", "concurrent loads must be ignored"],
  ['dropCard.setAttribute("aria-busy"', "busy extraction should be exposed to assistive tech"],
  ["setLoading(true)", "PDF extraction must enter the busy state"],
  ["setLoading(false)", "PDF extraction must leave the busy state"],
];
let failures = 0;
for (const [needle, message] of checks) {
  if (!src.includes(needle)) {
    console.error(`✗ ${message}`);
    failures += 1;
  }
}
if (failures) process.exit(1);
console.log("✓ PDF mode blocks overlapping file loads and exposes busy state");
