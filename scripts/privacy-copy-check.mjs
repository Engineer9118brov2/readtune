import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = ["PRIVACY.md", "privacy.html", "school.html", "store/listing.md"];
let failures = 0;

const requireAll = (name, text, phrases) => {
  for (const phrase of phrases) {
    if (!text.includes(phrase)) {
      console.error(`✗ ${name} is missing privacy disclosure: ${phrase}`);
      failures += 1;
    }
  }
};

for (const file of docs) {
  const text = readFileSync(join(ROOT, file), "utf8");
  requireAll(file, text, [
    "PDF file itself is never uploaded",
    "30-day response cache",
  ]);
  if (!/Ask answers[\s\S]{0,120}not (?:stored|written)/i.test(text)) {
    console.error(`✗ ${file} must say typed Ask answers are not cached`);
    failures += 1;
  }
}

const privacy = readFileSync(join(ROOT, "privacy.html"), "utf8");
if (!privacy.includes("Merely opening it sends nothing")) {
  console.error("✗ public privacy page must state that opening Ask AI sends nothing");
  failures += 1;
}
const store = readFileSync(join(ROOT, "store/listing.md"), "utf8");
if (!store.includes("Password fields are intentionally blocked")) {
  console.error("✗ Store copy must disclose that dictation excludes password fields");
  failures += 1;
}

if (failures) process.exit(1);
console.log("✓ PDF/AI privacy boundaries stay aligned across public, school, and Store copy");
