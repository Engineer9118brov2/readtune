/*
 * ReadTune — cloud-assisted Summary relay
 *
 * A tiny, stateless proxy: the extension sends article text (and, for a
 * whole-article summary, the article's URL), this relays it to a free model
 * on OpenRouter, and hands back the generated text. Nothing here is tied to
 * a person — no accounts, no auth, no per-user storage. The only thing kept
 * around is a cache of { article URL -> generated summary } so a popular
 * article is summarized once, ever, not once per reader.
 *
 * This is the one part of ReadTune where article text leaves the device —
 * see privacy.html / PRIVACY.md for the plain-language disclosure. Every
 * other feature (calibration, Reader View, Piper read-aloud, PDF mode) still
 * sends nothing anywhere.
 */

import { createHash } from "node:crypto";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// OpenRouter's own free-model router: it picks a working free model behind
// this one id, so there is no per-model list to maintain here.
const OPENROUTER_MODEL = "openrouter/free";

const MAX_INPUT = 12000; // matches shared/assist.js's MAX_SUMMARY_INPUT

const SUMMARY_SYSTEM =
  "You list the main points of an article for a reader deciding whether to read it. " +
  "Three to five short plain lines, each a single idea, no preamble. Only what the text says.";

const SIMPLIFY_SYSTEM =
  "You rewrite a passage in plain language for a reader who finds dense text hard to follow. " +
  "Keep every fact, name, number and step. Use short sentences and common words. " +
  "Do not add information, examples or opinions, and do not leave anything out. " +
  "Reply with only the rewritten passage.";

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

function hash(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

// Strip the fragment/query noise that would otherwise fracture the cache
// (utm params, #anchors) for what is, for summarizing purposes, the same page.
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
}

function cacheKeyFor(kind, url, text) {
  const norm = url ? normalizeUrl(url) : "";
  const basis = norm ? `url:${norm}` : `text:${hash(text)}`;
  return `assist:${kind}:${basis}`;
}

/* ---------- cache + rate limit: Upstash Redis via its REST API, when set up.
   Both are no-ops until the env vars exist, so the endpoint works (just
   without cost savings or an abuse guard) before that's configured. Vercel's
   Upstash-for-Redis marketplace integration sets UPSTASH_REDIS_REST_URL /
   UPSTASH_REDIS_REST_TOKEN; the legacy Vercel KV names are also accepted. */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);

async function redisCall(path) {
  const res = await fetch(`${REDIS_URL}${path}`, { headers: { authorization: `Bearer ${REDIS_TOKEN}` } });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return res.json();
}

async function cacheGet(key) {
  if (!hasRedis) return null;
  try {
    const r = await redisCall(`/get/${encodeURIComponent(key)}`);
    return r && typeof r.result === "string" ? r.result : null;
  } catch {
    return null; // a cache miss on error is safe — falls through to a real call
  }
}

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — content doesn't need to be fresher than that

async function cacheSet(key, value) {
  if (!hasRedis) return;
  try {
    await redisCall(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${CACHE_TTL_SECONDS}`);
  } catch {
    /* best-effort — a cache write failure shouldn't fail the request */
  }
}

// A coarse, generous abuse guard, not a precise limiter: one shared counter
// per minute, well above what real usage needs, just to stop a runaway loop
// from burning the whole free OpenRouter quota in seconds.
const RATE_LIMIT_PER_MINUTE = 60;

async function rateLimitOk() {
  if (!hasRedis) return true;
  try {
    const bucket = `assist:rl:${Math.floor(Date.now() / 60000)}`;
    const r = await redisCall(`/incr/${encodeURIComponent(bucket)}`);
    if (r && r.result === 1) await redisCall(`/expire/${encodeURIComponent(bucket)}/70`);
    return !r || (typeof r.result === "number" && r.result <= RATE_LIMIT_PER_MINUTE);
  } catch {
    return true; // fail open — a Redis hiccup shouldn't block real requests
  }
}

async function callOpenRouter(system, user) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const err = new Error("The AI helper isn't set up yet.");
    err.status = 503;
    throw err;
  }
  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://readtune.tech",
        "X-Title": "ReadTune",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });
  } catch {
    const err = new Error("Couldn't reach the AI helper. Check your connection.");
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error((data && data.error && data.error.message) || `The AI helper couldn't handle that (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const trimmed = (text || "").trim();
  if (!trimmed) {
    const err = new Error("The AI helper returned nothing usable.");
    err.status = 502;
    throw err;
  }
  return trimmed;
}

function setCors(res) {
  // A stateless public relay with no auth/cookies to protect — any origin,
  // including a Chrome extension's chrome-extension://<id>, may call it.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body && typeof body === "object" ? body : {};

  // v1 ships Summary only; the shape already supports Simplify for later.
  const kind = body.kind === "simplify" ? "simplify" : "summary";
  const text = clip(body.text, MAX_INPUT);
  const url = typeof body.url === "string" ? body.url : "";

  if (!text) {
    res.status(400).json({ error: "No text to summarize." });
    return;
  }

  const cacheKey = cacheKeyFor(kind, url, text);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    res.status(200).json({ text: cached, cached: true });
    return;
  }

  const allowed = await rateLimitOk();
  if (!allowed) {
    res.status(429).json({ error: "The AI helper is busy right now. Try again in a bit." });
    return;
  }

  try {
    const system = kind === "summary" ? SUMMARY_SYSTEM : SIMPLIFY_SYSTEM;
    const generated = await callOpenRouter(system, text);
    await cacheSet(cacheKey, generated);
    res.status(200).json({ text: generated, cached: false });
  } catch (err) {
    const status = err && typeof err.status === "number" ? err.status : 502;
    res.status(status).json({ error: (err && err.message) || "The AI helper couldn't handle that right now." });
  }
}
