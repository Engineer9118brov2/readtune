import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "content.js"), "utf8");

const requiredRemovedNodes = ["input", "textarea", "select", "iframe", "object", "embed"];
for (const token of requiredRemovedNodes) {
  if (!source.includes(token)) throw new Error(`Reader capture no longer removes <${token}> before storage`);
}

for (const attr of ["value", "action", "formaction", "srcdoc", "nonce"]) {
  if (!source.includes(`\"${attr}\"`)) throw new Error(`Reader capture no longer strips ${attr} before storage`);
}

console.log("✓ Reader capture privacy guard present");
