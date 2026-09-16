import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "dictate.js"), "utf8");
let failures = 0;
const fail = (message) => {
  console.error(`✗ ${message}`);
  failures += 1;
};

const editableMatch = src.match(/const EDITABLE = ([^;]+);/);
if (!editableMatch) fail("dictation editable selector is missing");
else if (/password/i.test(editableMatch[1])) fail("password inputs must not be eligible dictation targets");

if (!src.includes('function isPasswordField(node)')) {
  fail("dictation must explicitly recognize password fields");
}
if (!src.includes('if (isPasswordField(e.target))')) {
  fail("focusing a password field must clear the active dictation target");
}
if (!src.includes('if (!isEditable(target) || !document.contains(target))')) {
  fail("dictation must revalidate the target before inserting a final transcript");
}
if (!src.includes('Dictation is disabled for password fields.')) {
  fail("password-field rejection should be explained in the dictation UI");
}

if (failures) process.exit(1);
console.log("✓ dictation rejects password fields and revalidates targets before insertion");
