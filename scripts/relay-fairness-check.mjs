import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientFingerprint, createMemoryClientLimiter, retryAfterSeconds } from "../api/_rate-limit.mjs";

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

const reqA = { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" } };
const reqB = { headers: { "x-forwarded-for": "203.0.113.11" } };
const a1 = clientFingerprint(reqA, "test-secret");
const a2 = clientFingerprint(reqA, "test-secret");
const b = clientFingerprint(reqB, "test-secret");
check(a1 === a2, "client pseudonym must be stable within the same secret");
check(a1 !== b, "different clients need independent pseudonyms");
check(!a1.includes("203.0.113.10"), "raw client address must not be persisted in bucket ids");

const limit = createMemoryClientLimiter(2);
check(limit("a", 0) && limit("a", 0) && !limit("a", 0), "one client must hit its local ceiling");
check(limit("b", 0), "a second client must remain allowed after the first is limited");
check(limit("a", 60000), "client counters must reset in a new minute");
check(retryAfterSeconds(59999) === 1 && retryAfterSeconds(0) === 60, "Retry-After must describe the current minute window");

for (const [src, name] of [[assist, "assist"], [speak, "speak"]]) {
  check(src.includes(`${name}:client:`), `${name} relay must check a per-client Redis bucket`);
  check(src.includes("Retry-After"), `${name} relay must set Retry-After on 429`);
  check(src.includes("CLIENT_LIMIT_PER_MINUTE"), `${name} relay must define a client ceiling before the shared ceiling`);
}

if (failures) process.exit(1);
console.log("✓ relays apply pseudonymous per-client fairness before shared ceilings");
