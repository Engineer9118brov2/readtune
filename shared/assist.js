/*
 * ReadTune — reading assistant
 *
 * Two things that help when a passage won't come together: a plain-language
 * rewrite of the part you pick, and a short "what is this about" before you
 * commit to a long article.
 *
 * Routing, in order:
 *   1. On-device, but ONLY if Chrome's built-in AI is already ready — never
 *      trigger the ~2 GB one-time download ourselves. That download turned
 *      out to be a bad bet for this extension's real audience: some readers'
 *      own devices are storage/CPU-limited, and — the disqualifying case —
 *      students on shared school Chromebooks that don't keep a local profile
 *      between logins would re-download it every single sign-in. So this
 *      path only fires when it costs nothing: the model Chrome already has
 *      ready for some other feature.
 *   2. Otherwise, ReadTune's own small relay (`/api/assist`, see that file),
 *      which forwards to a free model on OpenRouter and caches the response
 *      by article URL so a popular article is summarized once, ever.
 *
 * This is the one place in ReadTune where text leaves the device — see
 * privacy.html / PRIVACY.md for the plain disclosure. Every other feature
 * (calibration, Reader View, Piper read-aloud, PDF mode) still sends nothing
 * anywhere. There used to be a "bring your own Gemini key" third tier here;
 * it's gone — pasting an API key is not a real option for the readers this
 * extension is for.
 *
 * What this is NOT: a comprehension engine. It offers a rewrite of a passage
 * you choose, or the key points of an article, and labels the result
 * approximate. It is not a claim that the article has been understood for you.
 */

const CLOUD_URL = "https://readtune.tech/api/assist";

const isAbort = (e) => !!e && (e.name === "AbortError" || e.name === "TimeoutError");

/* A summary reads the top of the article; a rewrite acts on a selection the
   reader made. Both are capped so a pathological page can't wedge the model —
   matches the cap the cloud relay re-enforces server-side. */
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

/* ---------- on-device: Chrome built-in AI (opportunistic only) ---------- */

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

/** One line describing where the assistant will run, for the panel / popup. */
export async function describeAvailability() {
  const s = await onDeviceStatus();
  const ready = s.summarizer === "available" || s.rewriter === "available" || s.prompt === "available";
  return {
    mode: ready ? "on-device" : "cloud",
    ready: true, // the cloud relay means the assistant always has somewhere to run
    text: ready
      ? "On-device AI is ready on this browser. Nothing you read leaves your device."
      : "Runs through ReadTune's free AI helper. The article text (or the passage you select) is sent to generate the response — everything else in ReadTune stays on your device.",
  };
}

const safeDestroy = (o) => { try { o && o.destroy && o.destroy(); } catch {} };

/* ---------- cloud: ReadTune's own relay to a free model ---------- */

async function cloudGenerate(kind, text, url, signal) {
  let res;
  try {
    res = await fetch(CLOUD_URL, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, text, url }),
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new Error("Couldn't reach the AI helper. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw new Error("The AI helper is busy right now. Try again in a bit.");
    throw new Error((data && data.error) || `The AI helper couldn't handle that (${res.status}).`);
  }
  const text_ = data && data.text;
  if (!text_) throw new Error("The AI helper returned nothing usable.");
  return text_;
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
 * @param {() => string}  opts.getArticleText  full reading text, for summaries
 * @param {() => string}  [opts.getArticleUrl] the article's URL, for cache keying server-side
 */
export function createAssistant({ getArticleText = () => "", getArticleUrl = () => "" } = {}) {
  async function run({ kind, text, onProgress, signal }) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

    // 1 — on-device, but only when it's already ready. No `.create()` call
    // here ever triggers a download: every status checked below is either
    // "available" (use it) or something else (skip straight to the cloud).
    const status = await onDeviceStatus();
    const make = async (name, opts) => {
      const API = globalApi(name);
      if (!API) return null;
      try {
        return await API.create(opts);
      } catch {
        return null; // ready a moment ago, not ready now — fall through
      }
    };
    if (kind === "summary" && status.summarizer === "available") {
      const s = await make("Summarizer", { type: "key-points", format: "plain-text", length: "short", sharedContext: SUMMARY_SYSTEM });
      if (s) {
        try {
          return await s.summarize(text, { context: "Deciding whether to read this.", signal });
        } finally {
          safeDestroy(s);
        }
      }
    }
    if (kind === "simplify" && status.rewriter === "available") {
      const r = await make("Rewriter", { tone: "more-casual", length: "as-is", format: "plain-text", sharedContext: SIMPLIFY_SYSTEM });
      if (r) {
        try {
          return await r.rewrite(text, { context: "Put this in plainer words for a struggling reader.", signal });
        } finally {
          safeDestroy(r);
        }
      }
    }
    if (status.prompt === "available") {
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
    }

    // 2 — ReadTune's cloud relay. Always available, so the assistant never
    // has "nothing to run on" anymore.
    if (onProgress) onProgress({ phase: "cloud" });
    return await cloudGenerate(kind, text, kind === "summary" ? getArticleUrl() : "", signal);
  }

  return {
    describe: () => describeAvailability(),

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
