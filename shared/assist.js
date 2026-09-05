/*
 * ReadTune — reading assistant
 *
 * Two things that help when a passage won't come together: a plain-language
 * rewrite of the part you pick, and a short "what is this about" before you
 * commit to a long article.
 *
 * On-device only. Chrome's built-in AI — the Summarizer and Rewriter APIs,
 * with the Prompt API as a fallback — runs against a model the browser
 * downloads once and shares across every site. No key, no network, no cost,
 * works offline once the model is there.
 *
 * There used to be a "bring your own key" fallback for browsers without
 * built-in AI. It's gone: pasting a Google AI Studio key is not a real option
 * for the readers this extension is for, so a browser with no on-device AI
 * simply doesn't get this feature, rather than a form nobody can use.
 *
 * Never a ReadTune-hosted model either: that would put the text you are
 * reading on a server, which every other promise in this extension is about
 * not doing.
 *
 * What this is NOT: a comprehension engine. It offers a rewrite of a passage
 * you choose, generated on your device, and labels it approximate. It is not a
 * claim that the article has been understood for you.
 */

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

/* One aggregate state across the three sub-APIs, best-first, so the UI can
   tell "nothing has started yet" (worth asking first) apart from "a download
   is already running" (nothing to ask, just show progress). */
function aggregateState(s) {
  const vals = [s.summarizer, s.rewriter, s.prompt];
  if (vals.includes("available")) return "available";
  if (vals.includes("downloading")) return "downloading";
  if (vals.includes("downloadable")) return "downloadable";
  return "unavailable";
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
  const state = aggregateState(s);
  if (state !== "unavailable") {
    const ready = state === "available";
    return {
      mode: "on-device",
      state,
      ready,
      needsDownload: !ready,
      text:
        state === "available"
          ? "On-device AI is ready. Nothing you read leaves your device."
          : state === "downloading"
          ? "On-device AI is downloading — one time, about 2 GB, kept by Chrome and shared with every site."
          : "On-device AI is available to download — one time, about 2 GB, kept by Chrome and shared with every site. It uses storage on this device and isn't shared with your other devices.",
    };
  }
  return {
    mode: "none",
    state: "unavailable",
    ready: false,
    needsDownload: false,
    text: "This browser doesn't have on-device AI yet, so the reading assistant isn't available here. The rest of ReadTune works the same either way.",
  };
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

const safeDestroy = (o) => { try { o && o.destroy && o.destroy(); } catch {} };

/**
 * @param {object}   opts
 * @param {() => string}  opts.getArticleText  full reading text, for summaries
 */
export function createAssistant({ getArticleText = () => "" } = {}) {
  /* Route one request against whatever on-device API the browser offers.
     There is deliberately NO `await` before the first `.create()`: it must run
     while the click that started this is still a live user gesture, or Chrome
     refuses to begin the one-time model download ("Requires a user gesture"). */
  async function run({ kind, text, onProgress, signal }) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

    const monitor = (m) => {
      m.addEventListener("downloadprogress", (e) => {
        if (onProgress) onProgress({ phase: "download", loaded: e.loaded, total: e.total || 0 });
      });
    };
    /* Try to stand up a built-in-AI session. null = the browser doesn't offer
       this one, the gesture has lapsed and a download can't start, or the
       option shape doesn't match this browser's build of the API (Rewriter is
       still moving) — in every case, fall through to the next on-device API.
       A genuine resource failure (out of memory) is re-thrown. */
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

    throw new Error("This browser doesn't have on-device AI available right now.");
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
