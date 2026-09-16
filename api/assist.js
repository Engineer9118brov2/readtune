/*
 * ReadTune — cloud-assisted reading helper relay
 *
 * The extension sends only the text needed for the AI action and this relays
 * it to a configured chat provider. There are no accounts or cookies. To save
 * repeat provider work, only article summaries may be cached; user-authored
 * Ask responses and the other interactive AI actions are never persisted in
 * the response cache.
 *
 * See privacy.html / PRIVACY.md for the network-boundary disclosure.
 */

import { createHash } from "node:crypto";
import { providersFromEnv, relayChat } from "./_relay.mjs";
import { applyRelayCors } from "./_cors.mjs";
import { clientFingerprint, createMemoryClientLimiter, retryAfterSeconds } from "./_rate-limit.mjs";

const MAX_INPUT = 12000;
const MAX_ASK_QUESTION = 500;
const MAX_DEFINE_CONTEXT = 800;
const MAX_DEFINE_WORD = 80;
const MAX_LEVEL_HINT = 200;
const SUMMARY_MAX_TOKENS = 600;
const ASK_MAX_TOKENS = 800;
const DEFINE_MAX_TOKENS = 150;
const EXPLAIN_MAX_TOKENS = 300;
const ANNOTATE_MAX_TOKENS = 1200;
const CACHEABLE_KINDS = new Set(["summary"]);

const SUMMARY_SYSTEM =
  "You list the main points of an article for a reader deciding whether to read it. " +
  "Three to five short plain lines, each a single idea, no preamble. Only what the text says.";
const SIMPLIFY_SYSTEM =
  "You rewrite a passage in plain language for a reader who finds dense text hard to follow. " +
  "Keep every fact, name, number and step. Use short sentences and common words. " +
  "Do not add information, examples or opinions, and do not leave anything out. Reply with only the rewritten passage.";
const ASK_SYSTEM =
  "You answer a reader's question about an article they are reading. Use the article as your main source and stay close to what it says. " +
  "If the article does not address the question, say that plainly first, then answer briefly from general knowledge and mark that part as outside the article. " +
  "Short paragraphs, plain words, no preamble. Do not claim to have read anything the reader did not give you.";
const DEFINE_SYSTEM =
  "You define a word or short phrase exactly as it's used in the sentence given, for a reader who finds reading difficult. " +
  "One plain sentence. Do not repeat the word itself unless it clarifies a homograph. No preamble.";
const EXPLAIN_SYSTEM =
  "You explain what a passage means for a reader who finds reading difficult — any figurative language, tone, or theme. " +
  "If nothing figurative is present, explain the main idea instead. Two to four short sentences, plain words, no preamble.";
const ANNOTATE_SYSTEM =
  "Read the article and pick 5 to 10 short passages worth annotating for a reader who finds reading difficult: hard vocabulary, " +
  "figurative language, and important themes. Reply with ONLY a JSON array, no prose, no code fences, no markdown — just the array: " +
  '[{"quote": "...", "note": "...", "kind": "define"|"explain"|"theme"}]. ' +
  "Each \"quote\" must be copied exactly, word-for-word, from the article — not paraphrased, not summarized. " +
  'Each "note" is one short plain sentence explaining that passage.';

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

const KINDS = {
  summary: { system: SUMMARY_SYSTEM, maxText: MAX_INPUT, maxTokens: SUMMARY_MAX_TOKENS, buildUser: (text) => text, validate: (text) => (!text ? "No article text to work with." : null) },
  simplify: { system: SIMPLIFY_SYSTEM, maxText: MAX_INPUT, buildUser: (text) => text, validate: (text) => (!text ? "No passage to work with." : null) },
  ask: {
    system: ASK_SYSTEM,
    maxText: MAX_INPUT,
    maxTokens: ASK_MAX_TOKENS,
    needsQuestion: true,
    maxQuestion: MAX_ASK_QUESTION,
    buildUser: (text, question, levelHint = "") => `Article:\n\n${text}\n\nReader's question: ${question}${levelHint}`,
    validate: (text, question) => (!text ? "No article text to work with." : !question ? "No question to answer." : null),
  },
  define: {
    system: DEFINE_SYSTEM,
    maxText: MAX_DEFINE_CONTEXT,
    maxTokens: DEFINE_MAX_TOKENS,
    needsQuestion: true,
    maxQuestion: MAX_DEFINE_WORD,
    buildUser: (text, question) => (text ? `Sentence:\n${text}\n\nDefine as used here: "${question}"` : `Define: "${question}"`),
    validate: (text, question) => (!question ? "No word to define." : null),
  },
  explain: { system: EXPLAIN_SYSTEM, maxText: MAX_INPUT, maxTokens: EXPLAIN_MAX_TOKENS, buildUser: (text) => text, validate: (text) => (!text ? "No passage to work with." : null) },
  annotate: { system: ANNOTATE_SYSTEM, maxText: MAX_INPUT, maxTokens: ANNOTATE_MAX_TOKENS, buildUser: (text) => text, validate: (text) => (!text ? "No article text to work with." : null) },
};

function hash(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}
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
function cacheKeyFor(kind, url, text, question = "", levelHint = "") {
  const norm = url ? normalizeUrl(url) : "";
  let body = hash(text);
  if (question) body += `:${hash(question)}`;
  if (levelHint) body += `:${hash(levelHint)}`;
  const basis = norm ? `url:${norm}:${body}` : `text:${body}`;
  return `assist:${kind}:${basis}`;
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);
const RATE_LIMIT_SECRET = process.env.RELAY_RATE_LIMIT_SECRET || REDIS_TOKEN;
const GLOBAL_LIMIT_PER_MINUTE = 60;
const CLIENT_LIMIT_PER_MINUTE = 12;
const MEM_GLOBAL_LIMIT_PER_MINUTE = 40;
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
async function redisCall(path) {
  const res = await fetch(`${REDIS_URL}${path}`, { headers: { authorization: `Bearer ${REDIS_TOKEN}` } });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return res.json();
}
async function incrementBucket(bucket, limit) {
  const r = await redisCall(`/incr/${encodeURIComponent(bucket)}`);
  if (r && r.result === 1) await redisCall(`/expire/${encodeURIComponent(bucket)}/70`);
  return !r || (typeof r.result === "number" && r.result <= limit);
}
async function cacheGet(key) {
  if (!hasRedis) return null;
  try {
    const r = await redisCall(`/get/${encodeURIComponent(key)}`);
    return r && typeof r.result === "string" ? r.result : null;
  } catch {
    return null;
  }
}
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
async function cacheSet(key, value) {
  if (!hasRedis) return;
  try {
    await redisCall(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${CACHE_TTL_SECONDS}`);
  } catch {}
}
async function rateLimitOk(req) {
  const clientId = clientFingerprint(req, RATE_LIMIT_SECRET);
  const fallback = () => memClientRateOk(clientId) && memGlobalRateOk();
  if (!hasRedis) return fallback();
  try {
    const minute = Math.floor(Date.now() / 60000);
    if (!(await incrementBucket(`assist:client:${clientId}:${minute}`, CLIENT_LIMIT_PER_MINUTE))) return false;
    return await incrementBucket(`assist:rl:${minute}`, GLOBAL_LIMIT_PER_MINUTE);
  } catch {
    return fallback();
  }
}

export default async function handler(req, res) {
  const corsAllowed = applyRelayCors(req, res);
  res.setHeader("cache-control", "no-store");
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

  const kind = Object.prototype.hasOwnProperty.call(KINDS, body.kind) ? body.kind : "summary";
  const cfg = KINDS[kind];
  const text = clip(body.text, cfg.maxText);
  const url = typeof body.url === "string" ? body.url : "";
  const question = cfg.needsQuestion ? clip(body.question, cfg.maxQuestion) : "";
  const levelHint = kind === "ask" ? clip(body.levelHint, MAX_LEVEL_HINT) : "";
  const validationError = cfg.validate(text, question);
  if (validationError) return res.status(400).json({ error: validationError });

  const cacheable = CACHEABLE_KINDS.has(kind);
  const cacheKey = cacheable ? cacheKeyFor(kind, url, text, question, levelHint) : "";
  if (cacheable) {
    const cached = await cacheGet(cacheKey);
    if (cached) return res.status(200).json({ text: cached, cached: true });
  }

  if (!(await rateLimitOk(req))) {
    res.setHeader("Retry-After", String(retryAfterSeconds()));
    return res.status(429).json({ error: "The AI helper is busy right now. Try again in a bit." });
  }

  try {
    const generated = await relayChat(providersFromEnv(process.env), cfg.system, cfg.buildUser(text, question, levelHint), undefined, cfg.maxTokens);
    if (cacheable) await cacheSet(cacheKey, generated);
    return res.status(200).json({ text: generated, cached: false });
  } catch (err) {
    const status = err && typeof err.status === "number" ? err.status : 502;
    return res.status(status).json({ error: (err && err.message) || "The AI helper couldn't handle that right now." });
  }
}
