import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const background = readFileSync(join(ROOT, "background.js"), "utf8");
const reader = readFileSync(join(ROOT, "reader.js"), "utf8");
const eleven = readFileSync(join(ROOT, "shared/elevenlabs.js"), "utf8");
let failures = 0;
const requireText = (src, needle, message) => {
  if (!src.includes(needle)) {
    console.error(`✗ ${message}`);
    failures += 1;
  }
};

requireText(background, "pruneExpiredLocalArticleHandoffs", "background must clean abandoned local Reader handoffs");
requireText(background, "if (!sameTab)", "source-page audio metadata must only be captured when the source tab survives");
requireText(background, "delete res.tabId", "same-tab Reader handoffs must drop dead source-tab metadata");
requireText(reader, "ARTICLE_TTL_MS", "Reader must enforce the temporary handoff TTL before rendering");
requireText(reader, "This Reader View handoff expired", "expired handoffs should fail with an explicit message");
requireText(eleven, "removeElevenPermission", "ElevenLabs integration removal must revoke optional host access");
requireText(eleven, "chrome.storage.onChanged.addListener", "permission revocation must follow explicit key removal");

if (failures) process.exit(1);
console.log("✓ Reader handoffs, page audio metadata, and ElevenLabs permission lifecycle are bounded");
