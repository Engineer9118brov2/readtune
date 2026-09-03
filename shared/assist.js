/*
 * ReadTune — reading assistant
 *
 * Two things that help when a passage won't come together: a plain-language
 * rewrite of the part you pick, and a short "what is this about" before you
 * commit to a long article.
 *
 * Free and private, the same call ReadTune made for read-aloud:
 *   • On-device first. Chrome's built-in AI — the Summarizer and Rewriter APIs,
 *     with the Prompt API as a fallback — runs against a model the browser
 *     downloads once and shares across every site. No key, no network, no cost,
 *     works offline once the model is there.
 *   • Bring your own key second. On a browser with no built-in AI, the reader
 *     can paste a Google AI Studio (Gemini) key — it has a free tier — kept only
 *     in chrome.storage.local and sent only to Google's endpoint, straight from
 *     the reader's browser. ReadTune runs no server in this path.
 *
 * Never a ReadTune-hosted model: that would put the text you are reading on a
 * server, which every other promise in this extension is about not doing.
 *
 * What this is NOT: a comprehension engine. It offers a rewrite of a passage
 * you choose, generated on your device, and labels it approximate. It is not a
 * claim that the article has been understood for you.
 */

export const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com/*";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/* A request the user cancelled (card closed, Escape, "Cancel") aborts the
   fetch / on-device call, which rejects with an AbortError. That is not a
   failure to report — the caller checks `signal.aborted` and stays quiet — so
   it must reach them AS an AbortError, never remapped to a network message. */
const isAbort = (e) => !!e && (e.name === "AbortError" || e.name === "TimeoutError");

/* A summary reads the top of the article; a rewrite acts on a selection the
   reader made. Both are capped so a pathological page can't wedge the model. */
const MAX_SUMMARY_INPUT = 12000;
const MAX_SIMPLIFY_INPUT = 2400;

const SIMPLIFY_SYSTEM =
  "You rewrite a passage in plain language for a reader who finds dense text hard to follow. " +
  "Keep every fact, name, number and step. Use short sentences and common words. " +
  "Do not add information, examples or opinions, and do not leave anything out. " +
  "Reply with only the rewritten passage.";

const SUMMARY_SYSTEM =
  "You list the main points of an article for a reader deciding whether to read it. " +
  "Three to five short plain lines, each a single idea, no preamble. Only what the text says.";

/* ---------- on-device: Chrome built-in AI ---------- */

const globalApi = (name) => {
  try {
    return (typeof self !== "undefined" && self[name]) || null;
  } catch {
    return null;
  }
};

async function availabilityOf(name) {
  const A = globalApi(name);
  if (!A || typeof A.availability !== "function") return "unavailable";
  try {
    return await A.availability();
  } catch {
    return "unavailable";
  }
}

const CAN_USE = new Set(["available", "downloadable", "downloading"]);
const usable = (s) => CAN_USE.has(s);

/**
 * Per-API on-device availability.
 * @returns {{summarizer:string, rewriter:string, prompt:string}}
 *   each: "unavailable" | "downloadable" | "downloading" | "available"
 */
export async function onDeviceStatus() {
  const [summarizer, rewriter, prompt] = await Promise.all([
    availabilityOf("Summarizer"),
    availabilityOf("Rewriter"),
    availabilityOf("LanguageModel"),
  ]);
  return { summarizer, rewriter, prompt };
}

/**
 * One line describing where the assistant will run, for the panel / popup.
 * @param {boolean} hasKey whether a BYOK key is saved
 */
export async function describeAvailability(hasKey) {
  const s = await onDeviceStatus();
  const anyOnDevice = usable(s.summarizer) || usable(s.rewriter) || usable(s.prompt);
  if (anyOnDevice) {
    const ready = s.summarizer === "available" || s.rewriter === "available" || s.prompt === "available";
    return {
      mode: "on-device",
      ready,
      needsDownload: !ready,
      text: ready
        ? "On-device AI is ready. Nothing you read leaves your device."
        : "On-device AI is available to download — one time, about 2 GB, kept by Chrome and shared with every site.",
    };
  }
  if (hasKey) {
    return {
      mode: "byok",
      ready: true,
      needsDownload: false,
      text: "Using your Gemini key. The passage goes from your browser straight to Google — ReadTune has no server in between.",
    };
  }
  return {
    mode: "none",
    ready: false,
    needsDownload: false,
    text: "This browser has no on-device AI. Add a free Google AI Studio (Gemini) key in the Reading Lab to turn the assistant on.",
  };
}

/* ---------- permissions (BYOK) ---------- */

export async function hasGeminiPermission() {
  try {
    return await chrome.permissions.contains({ origins: [GEMINI_ORIGIN] });
  } catch {
    return false;
  }
}

export async function requestGeminiPermission() {
  try {
    return await chrome.permissions.request({ origins: [GEMINI_ORIGIN] });
  } catch (err) {
    console.warn("[ReadTune] Gemini permission request failed:", err);
    return false;
  }
}

/* ---------- BYOK: Google Gemini ---------- */

async function geminiGenerate(key, system, user, signal) {
  let res;
  try {
    /* Key goes in the header, not the query string — a URL turns up in far more
       logs, proxies and error reports than a header does. Same choice as the
       ElevenLabs path (xi-api-key). */
    res = await fetch(GEMINI_URL, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new Error("Couldn't reach Google. Check your connection.");
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error("That Gemini key was rejected. Check it and paste it again.");
    if (res.status === 429) throw new Error("Gemini's free quota is used up for now. Try again later.");
    throw new Error(`Gemini error (${res.status}).`);
  }
  const data = await res.json().catch(() => ({}));
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = (parts || []).map((p) => p && p.text).filter(Boolean).join("").trim();
  if (!text) throw new Error("Gemini returned nothing for that passage.");
  return text;
}

/** Confirm a pasted key works, cheaply. */
export async function geminiKeyWorks(key) {
  if (!key) return { ok: false, reason: "No key." };
  try {
    await geminiGenerate(key, "Reply with the word ok.", "ok");
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || "That key didn't work." };
  }
}

/* ---------- the assistant ---------- */

/* Normalise whitespace and cap the length. Returns whether it actually had to
   cut — sniffing the result for a trailing "…" gets it wrong when the source
   text ends with one of its own. */
const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return { text: t, clipped: false };
  return { text: t.slice(0, n).replace(/\s+\S*$/, "") + " …", clipped: true };
};

/**
 * @param {object}   opts
 * @param {() => string}        opts.getArticleText  full reading text, for summaries
 * @param {() => {key:string}}  opts.getConfig       the saved BYOK config
 */
const safeDestroy = (o) => { try { o && o.destroy && o.destroy(); } catch {} };

export function createAssistant({ getArticleText = () => "", getConfig = () => ({ key: "" }) } = {}) {
  /* Route one request. Prefer on-device; fall back to the key if there is one.
     There is deliberately NO `await` before the first `.create()`: it must run
     while the click that started this is still a live user gesture, or Chrome
     refuses to begin the one-time model download ("Requires a user gesture"). */
  async function run({ kind, text, onProgress, signal }) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
    const key = (getConfig() || {}).key || "";

    const monitor = (m) => {
      m.addEventListener("downloadprogress", (e) => {
        if (onProgress) onProgress({ phase: "download", loaded: e.loaded, total: e.total || 0 });
      });
    };
    /* Try to stand up a built-in-AI session. null = the browser doesn't offer
       this one, the gesture has lapsed and a download can't start, or the
       option shape doesn't match this browser's build of the API (Rewriter is
       still moving) — in every case, fall through to the next tier. A genuine
       resource failure (out of memory) is re-thrown. */
    const make = async (name, opts) => {
      const API = globalApi(name);
      if (!API) return null;
      try {
        return await API.create({ ...opts, monitor });
      } catch (e) {
        // absent/disabled/gesture-lapsed, or an option this build rejects
        const soft = ["NotAllowedError", "NotSupportedError", "UnknownError", "TypeError"];
        if (e && soft.includes(e.name)) return null;
        throw e;
      }
    };

    // 1 — a task-specific on-device API, if the browser has one
    if (kind === "summary") {
      const s = await make("Summarizer", { type: "key-points", format: "plain-text", length: "short", sharedContext: SUMMARY_SYSTEM });
      if (s) {
        try {
          return await s.summarize(text, { context: "Deciding whether to read this.", signal });
        } finally {
          safeDestroy(s);
        }
      }
    }
    if (kind === "simplify") {
      const r = await make("Rewriter", { tone: "more-casual", length: "as-is", format: "plain-text", sharedContext: SIMPLIFY_SYSTEM });
      if (r) {
        try {
          return await r.rewrite(text, { context: "Put this in plainer words for a struggling reader.", signal });
        } finally {
          safeDestroy(r);
        }
      }
    }

    // 2 — the general Prompt API, if that is what is on-device
    const lm = await make("LanguageModel", {
      initialPrompts: [{ role: "system", content: kind === "summary" ? SUMMARY_SYSTEM : SIMPLIFY_SYSTEM }],
    });
    if (lm) {
      try {
        const ask =
          kind === "summary"
            ? `Main points of this article:\n\n${text}`
            : `Rewrite this passage in plain language:\n\n${text}`;
        return await lm.prompt(ask, { signal });
      } finally {
        safeDestroy(lm);
      }
    }

    // 3 — the reader's own Gemini key
    if (key) {
      if (!(await hasGeminiPermission())) {
        const granted = await requestGeminiPermission();
        if (!granted) throw new Error("ReadTune needs permission to reach Google for this.");
      }
      const system = kind === "summary" ? SUMMARY_SYSTEM : SIMPLIFY_SYSTEM;
      const user =
        kind === "summary" ? `Main points of this article:\n\n${text}` : `Rewrite this passage in plain language:\n\n${text}`;
      return await geminiGenerate(key, system, user, signal);
    }

    throw new Error(
      "The assistant has nothing to run on. This browser has no on-device AI, and no Gemini key is set.",
    );
  }

  return {
    describe: () => describeAvailability(!!((getConfig() || {}).key)),

    /** Key points for the whole article (its opening, if it's long). Rejects on
        failure — including an AbortError when the caller cancels — for the UI to
        present; nothing is reported here. */
    async summarize({ onProgress, signal } = {}) {
      const { text, clipped } = clip(getArticleText(), MAX_SUMMARY_INPUT);
      if (!text) throw new Error("There's no article text to summarize.");
      return { text: await run({ kind: "summary", text, onProgress, signal }), clipped };
    },

    /** Plain-language rewrite of a passage the reader selected. */
    async simplify(passage, { onProgress, signal } = {}) {
      const { text, clipped } = clip(passage, MAX_SIMPLIFY_INPUT);
      if (!text) throw new Error("Select a sentence or paragraph first.");
      return { text: await run({ kind: "simplify", text, onProgress, signal }), clipped };
    },
  };
}
