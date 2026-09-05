/*
 * ReadTune — cloud text-to-speech provider fan-out (pure, no node built-ins)
 *
 * `api/speak.js` owns the HTTP handler; this file owns "try each free TTS
 * provider in turn and return the first one that gives us audio". The reader
 * never holds a key — everything runs off ReadTune's own relay keys in
 * Vercel's env. If none is configured, or all fail, `api/speak.js` returns a
 * signal and the extension falls back to the on-device Piper voice.
 *
 * Almost everything goes through OpenRouter's one speech endpoint
 * (`/api/v1/audio/speech`, OpenAI-shaped): the premium BYOK voice first
 * (Deepgram Aura-2 via a key you add in OpenRouter's BYOK settings), then two
 * genuinely-free models that need no credits. Cartesia is the one provider
 * OpenRouter can't BYOK, so it stays a direct call on its own key. Models and
 * voices are env-overridable so they can be retuned without a code change.
 * Underscore prefix => Vercel helper, not a route.
 */

const TIMEOUT_MS = 25000;

// A status that means *this request* is bad and every provider would reject it
// identically — no point trying the next one. Kept narrow: 413/422 are about
// the payload itself. A 400 is left off — a provider returns it for its own
// reasons (an unknown voice, a model it doesn't host) while the next is fine.
const REQUEST_FATAL = new Set([413, 422]);

const OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech";

// OpenRouter speech models in preference order. `aura2` is the premium voice
// (served by a BYOK Deepgram key — free on Deepgram's own allowance, and it
// honours `speed`); the two `:free` models need no credits and are the safety
// net. `speed:false` means the model has no speed control, so the clip plays
// at 1× and the highlight estimate adapts to the real duration.
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

/* ---- provider request builders ----
   Each returns { name, url, headers, body } for a POST that responds with raw
   audio bytes, or null when its key isn't set. */

function openRouterSpeech(spec, text, speed, voice, env) {
  if (!env.OPENROUTER_API_KEY) return null;
  // Only forward the caller's voice to the model whose namespace it belongs to
  // (the Aura-2 voice ids don't exist on flux/fish); otherwise use the default.
  const useVoice = spec.voicePrefix && typeof voice === "string" && voice.startsWith(spec.voicePrefix) ? voice : spec.voice;
  const body = {
    model: spec.model,
    input: text,
    voice: useVoice,
    response_format: "mp3",
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
  // Cartesia isn't a provider OpenRouter can BYOK, so it's a direct call. It
  // wants a UUID voice id and takes no numeric speed on this endpoint version,
  // so the clip is 1× — fine for a last-resort provider.
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

/** The ordered list of configured providers for this request. */
export function speakProvidersFromEnv(text, speed, env = {}, voice = "") {
  const s = clampSpeed(speed);
  const list = OPENROUTER_SPEECH.map((spec) => openRouterSpeech(spec, text, s, voice, env));
  list.push(cartesia(text, env));
  return list.filter(Boolean);
}

/** One provider call → { audio: ArrayBuffer, contentType } or throws with .status. */
export async function callSpeak(provider, fetchImpl = fetch) {
  // Keep the timeout armed through the body reads too: with the manual-timer
  // fallback, a provider that stalls partway through res.text()/arrayBuffer()
  // would otherwise never abort. cancel() only fires once everything is read.
  const { signal, cancel } = timeoutSignal(TIMEOUT_MS);
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
      const err = new Error(
        e && e.name === "AbortError" ? "The premium voice took too long." : "Couldn't reach the premium voice.",
      );
      err.status = 502;
      throw err;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      let detail = "";
      try {
        detail = contentType.includes("json") ? JSON.stringify(await res.json()).slice(0, 200) : (await res.text()).slice(0, 200);
      } catch {
        /* body already consumed / not readable */
      }
      const err = new Error(`${provider.name} TTS failed (${res.status})${detail ? ": " + detail : ""}`);
      err.status = res.status;
      throw err;
    }

    // A 200 with a JSON/text body is an error the provider didn't flag with a
    // status — treat it as a soft failure so the chain moves on.
    if (contentType.includes("json") || contentType.includes("text/")) {
      const err = new Error(`${provider.name} returned no audio`);
      err.status = 502;
      throw err;
    }

    const audio = await res.arrayBuffer();
    if (!audio || audio.byteLength < 512) {
      const err = new Error(`${provider.name} returned an empty clip`);
      err.status = 502;
      throw err;
    }
    return { audio, contentType: contentType || "audio/mpeg" };
  } finally {
    cancel();
  }
}

/** Walk the providers, returning the first that gives audio. */
export async function relaySpeak(providers, fetchImpl = fetch) {
  if (!providers.length) {
    const err = new Error("The premium voice isn't set up.");
    err.status = 503;
    throw err;
  }
  let lastErr;
  for (const provider of providers) {
    try {
      return await callSpeak(provider, fetchImpl);
    } catch (e) {
      lastErr = e;
      if (e && REQUEST_FATAL.has(e.status)) throw e;
    }
  }
  throw lastErr;
}
