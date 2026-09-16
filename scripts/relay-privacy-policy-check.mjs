import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isAllowedRelayOrigin } from "../api/_cors.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const assist = readFileSync(join(ROOT, "api/assist.js"), "utf8");
const speak = readFileSync(join(ROOT, "api/speak.js"), "utf8");
let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    console.error(`✗ ${msg}`);
    failures += 1;
  }
};

check(isAllowedRelayOrigin("https://readtune.tech"), "readtune.tech must be allowed");
check(isAllowedRelayOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "Chrome extension origins must be allowed");
check(!isAllowedRelayOrigin("https://evil.example"), "unrelated web origins must be blocked");
check(isAllowedRelayOrigin(""), "requests without Origin must remain usable for server/test callers");
check(!assist.includes('Access-Control-Allow-Origin", "*"'), "AI relay must not use wildcard CORS");
check(!speak.includes('Access-Control-Allow-Origin", "*"'), "voice relay must not use wildcard CORS");
check(assist.includes('const CACHEABLE_KINDS = new Set(["summary"])'), "only summaries should enter the response cache");
check(assist.includes("if (cacheable) await cacheSet(cacheKey, generated);"), "cache writes must be conditional on cacheable kind");

if (failures) process.exit(1);
console.log("✓ relays restrict browser origins and cache only article summaries");
