import { createHmac, randomBytes } from "node:crypto";

const INSTANCE_SECRET = randomBytes(32).toString("hex");

function header(req, name) {
  const value = req && req.headers && req.headers[name];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function rawClientAddress(req) {
  // Vercel/proxy deployments populate these. Keep the raw address only in this
  // stack frame; callers receive an HMAC fingerprint, never the address itself.
  const forwarded = header(req, "x-forwarded-for").split(",")[0].trim();
  return forwarded || header(req, "x-real-ip").trim() || "unknown";
}

export function clientFingerprint(req, secret = "") {
  const key = String(secret || INSTANCE_SECRET);
  const source = rawClientAddress(req);
  return createHmac("sha256", key).update(source).digest("hex").slice(0, 24);
}

export function retryAfterSeconds(now = Date.now()) {
  const remainingMs = 60000 - (Number(now) % 60000);
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

export function createMemoryClientLimiter(limit, { maxClients = 512 } = {}) {
  let minute = -1;
  const counts = new Map();
  return (clientId, now = Date.now()) => {
    const currentMinute = Math.floor(Number(now) / 60000);
    if (currentMinute !== minute) {
      minute = currentMinute;
      counts.clear();
    }
    const id = String(clientId || "unknown");
    if (!counts.has(id) && counts.size >= maxClients) return false;
    const next = (counts.get(id) || 0) + 1;
    counts.set(id, next);
    return next <= limit;
  };
}
