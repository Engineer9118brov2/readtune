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
export const OPENROUTER_MODELS = [
  "openai/gpt-oss-120b",
  "google/gemini-3.5-flash-lite",
  "mistralai/ministral-8b-2512",
];
export const OPENROUTER_MODEL = OPENROUTER_MODELS[0];

export const OLLAMA_URL = "https://ollama.com/v1/chat/completions";
export const OLLAMA_MODEL = "gpt-oss:20b";

const UPSTREAM_TIMEOUT_MS = 30000;
const REQUEST_FATAL = new Set([400, 413, 422]);

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), cancel: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

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
      models: env.OPENROUTER_MODEL ? null : OPENROUTER_MODELS.slice(1),
      zdr: true,
      extraHeaders: { "HTTP-Referer": "https://readtune.tech", "X-Title": "ReadTune" },
    },
  ].filter(Boolean);
}

const DEFAULT_MAX_TOKENS = 400;

export async function callChat(provider, system, user, fetchImpl = fetch, maxTokens = DEFAULT_MAX_TOKENS) {
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
        ...(provider.models && provider.models.length ? { models: provider.models } : {}),
        ...(provider.zdr ? { provider: { zdr: true } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
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
    // Never surface an upstream provider's raw error body to the public relay.
    // It can contain provider/model/account details that are useful only to us.
    const err = new Error(
      REQUEST_FATAL.has(res.status)
        ? "The AI helper couldn't use that request."
        : "The AI helper couldn't handle that right now.",
    );
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const choice = data && data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  const trimmed = (text || "").trim();
  if (choice && choice.finish_reason === "length") {
    const err = new Error("The AI helper stopped before finishing its answer.");
    err.status = 502;
    err.partialText = trimmed;
    throw err;
  }
  if (!trimmed) {
    const err = new Error("The AI helper returned nothing usable.");
    err.status = 502;
    throw err;
  }
  return trimmed;
}

export async function relayChat(providers, system, user, fetchImpl = fetch, maxTokens = DEFAULT_MAX_TOKENS) {
  if (!providers.length) {
    const err = new Error("The AI helper isn't set up yet.");
    err.status = 503;
    throw err;
  }
  let lastErr;
  let bestPartial = "";
  for (const provider of providers) {
    try {
      return await callChat(provider, system, user, fetchImpl, maxTokens);
    } catch (e) {
      lastErr = e;
      if (e && e.partialText && e.partialText.length > bestPartial.length) bestPartial = e.partialText;
      if (e && REQUEST_FATAL.has(e.status)) throw e;
    }
  }
  // A length-limited answer is still more useful than replacing the entire
  // response with an error card. We try every provider first; only when none
  // can complete do we return the best partial with an explicit disclosure.
  if (bestPartial) return `${bestPartial}\n\n(Answer shortened.)`;
  throw lastErr;
}
