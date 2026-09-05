/*
 * ReadTune — cloud text-to-speech provider fan-out (pure, no node built-ins)
 *
 * `api/speak.js` owns the HTTP handler; this file owns "try each free TTS
 * provider in turn and return the first one that gives us audio". Every
 * provider here has a keyless-for-the-reader free tier — the key lives only
 * in Vercel's env. If none is configured, or all fail, the caller returns a
 * signal and the extension falls back to the on-device Piper voice.
 *
 * Provider order is OpenRouter → Groq → Unreal Speech. Each is skipped unless
 * its key is set; model/voice are env-overridable so they can be retuned
 * without a code change. Underscore prefix => Vercel helper, not a route.
 */

const TIMEOUT_MS = 25000;

// A status that means *this request* is bad and every provider would reject it
// identically — no point trying the next one. Kept narrow: 413/422 are about
// the payload itself. A 400 is left off — providers return it for their own
// reasons (an unknown voice id, a retired model) while another provider is
// still fine, so a 400 falls through like a bad key or a 5xx. api/speak.js
// caps the input length before we ever get here.
const REQUEST_FATAL = new Set([413, 422]);

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
   Each takes (text, speed, env) and returns { url, headers, body } for a POST
   that responds with raw audio bytes, or null when its key isn't set. */

function openrouter(text, speed, env) {
  if (!env.OPENROUTER_API_KEY) return null;
  return {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/audio/speech",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://readtune.tech",
      "X-Title": "ReadTune",
    },
    body: {
      model: env.SPEAK_OPENROUTER_MODEL || "deepgram/flux-tts:free",
      input: text,
      voice: env.SPEAK_OPENROUTER_VOICE || "aura-2-thalia-en",
      response_format: "mp3",
      speed,
    },
  };
}

function groq(text, speed, env) {
  if (!env.GROQ_API_KEY) return null;
  // Groq retired playai-tts at the end of 2025; TTS is Orpheus (Canopy Labs)
  // now. Orpheus only emits WAV, has no speed control, and caps input at ~200
  // chars — so a long sentence 400s here and falls through to Unreal, which is
  // fine for a middle-of-the-chain provider. `speed` is unused on purpose.
  return {
    name: "groq",
    url: "https://api.groq.com/openai/v1/audio/speech",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: {
      model: env.SPEAK_GROQ_MODEL || "canopylabs/orpheus-v1-english",
      input: text,
      voice: env.SPEAK_GROQ_VOICE || "Troy",
      response_format: "wav",
    },
  };
}

function unreal(text, speed, env) {
  if (!env.UNREALSPEECH_API_KEY) return null;
  // Unreal's Speed is an offset in [-1, 1], not a multiplier.
  const offset = Math.min(1, Math.max(-1, speed - 1));
  return {
    name: "unreal",
    url: "https://api.v6.unrealspeech.com/stream",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.UNREALSPEECH_API_KEY}`,
    },
    body: {
      Text: text,
      VoiceId: env.SPEAK_UNREAL_VOICE || "Will",
      Bitrate: "192k",
      Codec: "libmp3lame",
      Speed: Number(offset.toFixed(2)),
    },
  };
}

const BUILDERS = [openrouter, groq, unreal];

/** The ordered list of configured providers for this request. */
export function speakProvidersFromEnv(text, speed, env = {}) {
  const s = clampSpeed(speed);
  return BUILDERS.map((b) => b(text, s, env)).filter(Boolean);
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
