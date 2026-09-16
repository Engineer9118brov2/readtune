/*
 * ReadTune — cloud text-to-speech provider fan-out (pure, no node built-ins)
 *
 * `api/speak.js` owns the HTTP handler; this file owns "try each free TTS
 * provider in turn and return the first one that gives us audio". The reader
 * never holds a key — everything runs off ReadTune's own relay keys in
 * Vercel's env. If none is configured, or all fail, `api/speak.js` returns a
 * signal and the extension falls back to the on-device Piper voice.
 */

export const SPEAK_PROVIDER_TIMEOUT_MS = 6500;
export const SPEAK_RELAY_BUDGET_MS = 18000;
const REQUEST_FATAL = new Set([413, 422]);
const OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech";

const OPENROUTER_SPEECH = [
  { name: "aura2", model: "deepgram/aura-2", voice: "aura-2-thalia-en", voicePrefix: "aura-2-", speed: true },
  { name: "flux-free", model: "deepgram/flux-tts:free", voice: "flux-alexis-en", speed: false },
  { name: "fish-free", model: "fish-audio/s2.1-pro-free:free", voice: "alloy", speed: false },
];

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), cancel: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

const clampSpeed = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(3, Math.max(0.5, n)) : 1;
};

function openRouterSpeech(spec, text, speed, voice, env) {
  if (!env.OPENROUTER_API_KEY) return null;
  const useVoice = spec.voicePrefix && typeof voice === "string" && voice.startsWith(spec.voicePrefix) ? voice : spec.voice;
  const body = {
    model: spec.model,
    input: text,
    voice: useVoice,
    response_format: "mp3",
    provider: { zdr: true },
  };
  if (spec.speed) body.speed = speed;
  return {
    name: `openrouter:${spec.name}`,
    url: OPENROUTER_SPEECH_URL,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://readtune.tech",
      "X-Title": "ReadTune",
    },
    body,
  };
}

function cartesia(text, env) {
  if (!env.CARTESIA_API_KEY) return null;
  return {
    name: "cartesia",
    url: "https://api.cartesia.ai/tts/bytes",
    headers: {
      "content-type": "application/json",
      "X-API-Key": env.CARTESIA_API_KEY,
      "Cartesia-Version": "2024-11-13",
    },
    body: {
      model_id: env.SPEAK_CARTESIA_MODEL || "sonic-2",
      transcript: text,
      voice: { mode: "id", id: env.SPEAK_CARTESIA_VOICE || "a0e99841-438c-4a64-b679-ae501e7d6091" },
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    },
  };
}

export function speakProvidersFromEnv(text, speed, env = {}, voice = "") {
  const s = clampSpeed(speed);
  const list = OPENROUTER_SPEECH.map((spec) => openRouterSpeech(spec, text, s, voice, env));
  list.push(cartesia(text, env));
  return list.filter(Boolean);
}

export async function callSpeak(provider, fetchImpl = fetch, timeoutMs = SPEAK_PROVIDER_TIMEOUT_MS) {
  const boundedTimeout = Math.max(1, Math.min(SPEAK_PROVIDER_TIMEOUT_MS, Number(timeoutMs) || SPEAK_PROVIDER_TIMEOUT_MS));
  const { signal, cancel } = timeoutSignal(boundedTimeout);
  try {
    let res;
    try {
      res = await fetchImpl(provider.url, {
        method: "POST",
        signal,
        headers: provider.headers,
        body: JSON.stringify(provider.body),
      });
    } catch (e) {
      const timedOut = !!e && (e.name === "AbortError" || e.name === "TimeoutError");
      const err = new Error(timedOut ? "The premium voice took too long." : "Couldn't reach the premium voice.");
      err.status = timedOut ? 504 : 502;
      throw err;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      // Do not expose provider names, account details, model ids, or raw
      // upstream response bodies through the public relay endpoint.
      const err = new Error(
        REQUEST_FATAL.has(res.status)
          ? "The premium voice couldn't use that request."
          : "The premium voice provider failed.",
      );
      err.status = res.status;
      throw err;
    }

    if (contentType.includes("json") || contentType.includes("text/")) {
      const err = new Error("The premium voice provider returned no audio.");
      err.status = 502;
      throw err;
    }

    const audio = await res.arrayBuffer();
    if (!audio || audio.byteLength < 512) {
      const err = new Error("The premium voice provider returned an empty clip.");
      err.status = 502;
      throw err;
    }
    return { audio, contentType: contentType || "audio/mpeg" };
  } finally {
    cancel();
  }
}

export async function relaySpeak(providers, fetchImpl = fetch, { budgetMs = SPEAK_RELAY_BUDGET_MS, now = Date.now } = {}) {
  if (!providers.length) {
    const err = new Error("The premium voice isn't set up.");
    err.status = 503;
    throw err;
  }

  const budget = Math.max(1, Number(budgetMs) || SPEAK_RELAY_BUDGET_MS);
  const started = now();
  let lastErr;

  for (const provider of providers) {
    const remaining = budget - Math.max(0, now() - started);
    if (remaining <= 0) {
      const err = new Error("The premium voice took too long.");
      err.status = 504;
      throw err;
    }
    try {
      return await callSpeak(provider, fetchImpl, Math.min(SPEAK_PROVIDER_TIMEOUT_MS, remaining));
    } catch (e) {
      lastErr = e;
      if (e && REQUEST_FATAL.has(e.status)) throw e;
    }
  }
  throw lastErr;
}
