/*
 * ReadTune — premium (cloud) read-aloud relay
 *
 * The extension's read-aloud has one always-available voice: on-device Piper.
 * This endpoint is the optional upgrade — it relays a sentence to a configured
 * cloud TTS provider and streams back the audio. The reader never sees a key;
 * it lives in Vercel's env. If nothing is configured, or every provider fails,
 * this returns 503 and the extension keeps using Piper.
 *
 * Stateless: no accounts, no storage of the text or the audio.
 */

import { speakProvidersFromEnv, relaySpeak } from "./_speak-providers.mjs";
import { applyRelayCors } from "./_cors.mjs";
import { clientFingerprint, createMemoryClientLimiter, retryAfterSeconds } from "./_rate-limit.mjs";

const MAX_INPUT = 800;
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);
const RATE_LIMIT_SECRET = process.env.RELAY_RATE_LIMIT_SECRET || REDIS_TOKEN;
const GLOBAL_LIMIT_PER_MINUTE = 200;
const CLIENT_LIMIT_PER_MINUTE = 80;
const MEM_GLOBAL_LIMIT_PER_MINUTE = 120;
const memClientRateOk = createMemoryClientLimiter(CLIENT_LIMIT_PER_MINUTE);
let memBucketKey = 0;
let memBucketCount = 0;

function memGlobalRateOk() {
  const now = Math.floor(Date.now() / 60000);
  if (now !== memBucketKey) {
    memBucketKey = now;
    memBucketCount = 0;
  }
  memBucketCount += 1;
  return memBucketCount <= MEM_GLOBAL_LIMIT_PER_MINUTE;
}

function redisFetch(path) {
  const opts = { headers: { authorization: `Bearer ${REDIS_TOKEN}` } };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    opts.signal = AbortSignal.timeout(600);
  }
  return fetch(`${REDIS_URL}${path}`, opts);
}

async function incrementBucket(bucket, limit) {
  const r = await redisFetch(`/incr/${encodeURIComponent(bucket)}`).then((x) => x.json());
  if (r && r.result === 1) await redisFetch(`/expire/${encodeURIComponent(bucket)}/70`).catch(() => {});
  return !r || (typeof r.result === "number" && r.result <= limit);
}

async function rateLimitOk(req) {
  const clientId = clientFingerprint(req, RATE_LIMIT_SECRET);
  const fallback = () => memClientRateOk(clientId) && memGlobalRateOk();
  if (!hasRedis) return fallback();
  try {
    const minute = Math.floor(Date.now() / 60000);
    if (!(await incrementBucket(`speak:client:${clientId}:${minute}`, CLIENT_LIMIT_PER_MINUTE))) return false;
    return await incrementBucket(`speak:rl:${minute}`, GLOBAL_LIMIT_PER_MINUTE);
  } catch {
    return fallback();
  }
}

export default async function handler(req, res) {
  const corsAllowed = applyRelayCors(req, res);
  if (req.method === "OPTIONS") {
    if (!corsAllowed) return res.status(403).end();
    return res.status(204).end();
  }
  if (!corsAllowed) return res.status(403).json({ error: "Origin not allowed." });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === "object" ? body : {};

  const text = clip(body.text, MAX_INPUT);
  const speed = Number(body.speed) || 1;
  const voice = typeof body.voice === "string" && /^[a-z0-9_.:-]{1,40}$/i.test(body.voice) ? body.voice : "";
  if (!text) return res.status(400).json({ error: "Nothing to read." });

  const providers = speakProvidersFromEnv(text, speed, process.env, voice);
  if (!providers.length) return res.status(503).json({ error: "The premium voice isn't set up yet." });
  if (!(await rateLimitOk(req))) {
    res.setHeader("Retry-After", String(retryAfterSeconds()));
    return res.status(429).json({ error: "The premium voice is busy right now." });
  }

  try {
    const { audio, contentType } = await relaySpeak(providers);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    return res.status(200).send(Buffer.from(audio));
  } catch (err) {
    const status = err && typeof err.status === "number" ? err.status : 502;
    return res.status(status).json({ error: (err && err.message) || "The premium voice failed." });
  }
}
