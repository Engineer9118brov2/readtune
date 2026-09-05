/*
 * ReadTune — chat-relay provider fan-out (pure, no node built-ins)
 *
 * `api/assist.js` owns the HTTP handler, the cache and the rate limiter; this
 * file owns just the "try each free chat provider in turn" part so it can be
 * unit-tested in the browser harness with a mock fetch.
 *
 * Every provider here speaks the OpenAI chat shape: POST { model, messages }
 * with `Authorization: Bearer <key>`, reply at `choices[0].message.content`.
 * That's true of OpenRouter and of Ollama Cloud (ollama.com/v1), so one
 * `callChat` covers both and the list is just configuration.
 *
 * Underscore prefix => Vercel treats it as a helper, not a route.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// OpenRouter's own free-model router — it picks a working free model behind
// this single id, so there's no per-model list to keep up to date here.
export const OPENROUTER_MODEL = "openrouter/free";

export const OLLAMA_URL = "https://ollama.com/v1/chat/completions";
// gpt-oss:20b is Ollama Cloud's smallest always-on free model.
export const OLLAMA_MODEL = "gpt-oss:20b";

const UPSTREAM_TIMEOUT_MS = 30000;

// package.json pins no Node version for these functions, so don't assume
// AbortSignal.timeout() — fall back to a plain AbortController.
function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), cancel: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/* Build the ordered provider list from the environment. Ollama first — a
   signed-in Ollama account carries a larger free daily allowance than the
   keyless OpenRouter free tier — then OpenRouter. Reorder this array to
   change preference; drop a key from the env to skip that provider. */
export function providersFromEnv(env = {}) {
  return [
    env.OLLAMA_API_KEY && {
      name: "ollama",
      url: OLLAMA_URL,
      key: env.OLLAMA_API_KEY,
      model: env.OLLAMA_MODEL || OLLAMA_MODEL,
    },
    env.OPENROUTER_API_KEY && {
      name: "openrouter",
      url: OPENROUTER_URL,
      key: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL || OPENROUTER_MODEL,
      extraHeaders: { "HTTP-Referer": "https://readtune.tech", "X-Title": "ReadTune" },
    },
  ].filter(Boolean);
}

/* One provider call. Throws an Error with a numeric `.status` on any failure
   so the caller can decide whether to fall through or surface it. */
export async function callChat(provider, system, user, fetchImpl = fetch) {
  const { signal, cancel } = timeoutSignal(UPSTREAM_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(provider.url, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.key}`,
        ...(provider.extraHeaders || {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });
  } catch (e) {
    const err = new Error(
      e && e.name === "AbortError"
        ? "The AI helper took too long to respond."
        : "Couldn't reach the AI helper. Check your connection.",
    );
    err.status = 502;
    throw err;
  } finally {
    cancel();
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(
      (data && data.error && data.error.message) || `The AI helper couldn't handle that (${res.status}).`,
    );
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

/* Walk the provider list, returning the first success. If every provider
   fails, throw the last error (so its `.status` propagates). With no
   providers configured at all, that's a 503 "not set up yet". */
export async function relayChat(providers, system, user, fetchImpl = fetch) {
  if (!providers.length) {
    const err = new Error("The AI helper isn't set up yet.");
    err.status = 503;
    throw err;
  }
  let lastErr;
  for (const provider of providers) {
    try {
      return await callChat(provider, system, user, fetchImpl);
    } catch (e) {
      lastErr = e;
      // 4xx that isn't rate-limiting is the request's fault, not this
      // provider's — another provider would reject it too, so stop early.
      if (e && typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw e;
      }
    }
  }
  throw lastErr;
}
