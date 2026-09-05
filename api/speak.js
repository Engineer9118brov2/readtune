/*
 * ReadTune — premium (cloud) read-aloud relay
 *
 * The extension's read-aloud has one always-available voice: on-device Piper.
 * This endpoint is the optional upgrade — it relays a sentence to a free
 * cloud TTS provider (OpenRouter → Groq → Unreal Speech, whichever keys are
 * set) and streams back the audio. The reader never sees a key; it lives in
 * Vercel's env. If nothing is configured, or every provider fails, this
 * returns 503 and the extension keeps using Piper.
 *
 * Like /api/assist, this is a place where article text leaves the device —
 * but only sentence-by-sentence, only while the premium voice is selected,
 * and only the text being spoken. See privacy.html / PRIVACY.md.
 *
 * Stateless: no accounts, no storage of the text or the audio. (A future
 * optimisation could cache synthesised audio by sentence hash; not v1.)
 */

import { speakProvidersFromEnv, relaySpeak } from "./_speak-providers.mjs";

const MAX_INPUT = 800; // one sentence; Unreal Speech caps at 1000, others higher

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/* Coarse shared abuse guard — one counter per minute, well above real use,
   just so a runaway loop can't burn a whole free tier. No-op without Redis.
   (Same Upstash/Vercel-KV env names as api/assist.js.) */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);
const RATE_LIMIT_PER_MINUTE = 200; // ~ a long article read by a few readers at once

async function rateLimitOk() {
  if (!hasRedis) return true;
  try {
    const bucket = `speak:rl:${Math.floor(Date.now() / 60000)}`;
    const r = await fetch(`${REDIS_URL}/incr/${encodeURIComponent(bucket)}`, {
      headers: { authorization: `Bearer ${REDIS_TOKEN}` },
    }).then((x) => x.json());
    if (r && r.result === 1) {
      await fetch(`${REDIS_URL}/expire/${encodeURIComponent(bucket)}/70`, {
        headers: { authorization: `Bearer ${REDIS_TOKEN}` },
      }).catch(() => {});
    }
    return !r || (typeof r.result === "number" && r.result <= RATE_LIMIT_PER_MINUTE);
  } catch {
    return true; // fail open — a Redis hiccup shouldn't silence read-aloud
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body && typeof body === "object" ? body : {};

  const text = clip(body.text, MAX_INPUT);
  const speed = Number(body.speed) || 1;
  const env = {
    ...process.env,
    // an explicit per-request voice wins over the env default, but only from a
    // short allow-shaped token — never forward arbitrary strings as a header.
    ...(typeof body.voice === "string" && /^[a-z0-9_.:-]{1,40}$/i.test(body.voice)
      ? { SPEAK_OPENROUTER_VOICE: body.voice, SPEAK_GROQ_VOICE: body.voice, SPEAK_UNREAL_VOICE: body.voice }
      : {}),
  };

  if (!text) return res.status(400).json({ error: "Nothing to read." });

  const providers = speakProvidersFromEnv(text, speed, env);
  if (!providers.length) return res.status(503).json({ error: "The premium voice isn't set up yet." });

  if (!(await rateLimitOk())) {
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
