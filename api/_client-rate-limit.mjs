import { createHmac, randomBytes } from "node:crypto";

const PROCESS_SALT = randomBytes(32);

function firstHeader(req, name) {
  const value = req && req.headers ? req.headers[name] : "";
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

export function clientFingerprint(req, secret = "") {
  const forwarded = firstHeader(req, "x-forwarded-for");
  const raw = (forwarded.split(",")[0] || firstHeader(req, "x-real-ip") || "unknown").trim();
  const key = secret ? Buffer.from(String(secret)) : PROCESS_SALT;
  return createHmac("sha256", key).update(raw).digest("hex").slice(0, 20);
}

export function createMemoryLimiter(limitPerMinute) {
  let minute = -1;
  let counts = new Map();
  return function memoryRateOk(clientKey = "global") {
    const now = Math.floor(Date.now() / 60000);
    if (now !== minute) {
      minute = now;
      counts = new Map();
    }
    const next = (counts.get(clientKey) || 0) + 1;
    counts.set(clientKey, next);
    return next <= limitPerMinute;
  };
}
