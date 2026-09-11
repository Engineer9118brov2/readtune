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
 *      which forwards to a free chat model — Ollama Cloud first, then
 *      OpenRouter — and caches the response by article URL so a popular
 *      article is summarized once, ever.
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

// Ceilings so a stalled model / connection turns into a logged failure instead
// of a permanent "Reading the article…" spinner.
const ON_DEVICE_TIMEOUT_MS = 15000;
const CLOUD_TIMEOUT_MS = 30000;

/** Reject with a tagged error if `promise` doesn't settle within `ms`. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_res, rej) => {
    timer = setTimeout(() => {
      const e = new Error(`${label} timed out after ${Math.round(ms / 1000)}s`);
      e.name = "AssistTimeout";
      e.timedOut = true;
      rej(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const now = () =>
  (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

/* Which kinds may use ReadTune's cloud relay — disclosed in privacy.html /
   PRIVACY.md. Summary and Ask send the article text (Ask also sends the
   reader's typed question); Simplify stays on-device-only until its own cloud
   path is built and disclosed — see docs/ASSIST.md. */
const CLOUD_KINDS = new Set(["summary", "ask"]);

/* Never forward a query string or fragment to the relay — a URL can carry a
   session token or other identifying junk. The relay re-normalizes on receipt
   anyway; this just keeps that off the wire in the first place. */
function sanitizeUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.origin + u.pathname;
  } catch {
    return "";
  }
}

/* A summary reads the top of the article; a rewrite acts on a selection the
   reader made. Both are capped so a pathological page can't wedge the model —
   matches the cap the cloud relay re-enforces server-side. */
const MAX_SUMMARY_INPUT = 12000;
const MAX_SIMPLIFY_INPUT = 2400;
/* Ask sends the article as context alongside the question — a tighter cap than
   Summary so a huge page plus the Q still fits the model's window. */
const MAX_ASK_CONTEXT = 9000;
const MAX_ASK_QUESTION = 500;

const SIMPLIFY_SYSTEM =
  "You rewrite a passage in plain language for a reader who finds dense text hard to follow. " +
  "Keep every fact, name, number and step. Use short sentences and common words. " +
  "Do not add information, examples or opinions, and do not leave anything out. " +
  "Reply with only the rewritten passage.";

const SUMMARY_SYSTEM =
  "You list the main points of an article for a reader deciding whether to read it. " +
  "Three to five short plain lines, each a single idea, no preamble. Only what the text says.";

const ASK_SYSTEM =
  "You answer a reader's question about an article they are reading. Use the article as your main source and stay close to what it says. " +
  "If the article does not address the question, say that plainly first, then answer briefly from general knowledge and mark that part as outside the article. " +
  "Short paragraphs, plain words, no preamble. Do not claim to have read anything the reader did not give you.";

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

async function cloudGenerate(kind, text, url, signal, question = "", log = () => {}) {
  if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
  const timer = new AbortController();
  const to = setTimeout(() => timer.abort(new DOMException("cloud timed out", "AbortError")), CLOUD_TIMEOUT_MS);
  const onCallerAbort = () => timer.abort();
  if (signal) signal.addEventListener("abort", onCallerAbort, { once: true });
  const started = now();
  log(`cloud → POST ${CLOUD_URL} (kind=${kind}${question ? ", +question" : ""}, ${text.length} chars)`);
  let res;
  try {
    res = await fetch(CLOUD_URL, {
      method: "POST",
      signal: timer.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(question ? { kind, text, url, question } : { kind, text, url }),
    });
  } catch (e) {
    clearTimeout(to);
    if (signal && signal.aborted) throw e;
    if (isAbort(e)) {
      log(`cloud ✗ no response in ${CLOUD_TIMEOUT_MS / 1000}s (${Math.round(now() - started)}ms elapsed)`);
      throw new Error(`The AI helper didn't respond within ${CLOUD_TIMEOUT_MS / 1000}s.`);
    }
    log(`cloud ✗ fetch threw: ${(e && e.message) || e}`);
    throw new Error("Couldn't reach the AI helper. Check your connection.");
  } finally {
    if (signal) signal.removeEventListener("abort", onCallerAbort);
  }
  clearTimeout(to);
  log(`cloud ← HTTP ${res.status} in ${Math.round(now() - started)}ms`);
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    if (isAbort(e)) throw e;
    log(`cloud ✗ response body was not JSON`);
  }
  if (!res.ok) {
    log(`cloud ✗ error body: ${JSON.stringify(data).slice(0, 200)}`);
    if (res.status === 429) throw new Error("The AI helper is busy right now. Try again in a bit.");
    throw new Error((data && data.error) || `The AI helper couldn't handle that (${res.status}).`);
  }
  const text_ = data && data.text;
  if (!text_) {
    log(`cloud ✗ 200 OK but no text field`);
    throw new Error("The AI helper returned nothing usable.");
  }
  log(`cloud ✓ ${text_.length} chars${data.cached ? " (cached)" : ""}`);
  return text_;
}

/* ---------- the assistant ---------- */

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return { text: t, clipped: false };
  return { text: t.slice(0, n).replace(/\s+\S*$/, "") + " …", clipped: true };
};

export function createAssistant({ getArticleText = () => "", getArticleUrl = () => "" } = {}) {
  async function run({ kind, text, question = "", onProgress, onLog, signal }) {
    const log = typeof onLog === "function" ? (m) => onLog(m) : () => {};
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

    const status = await onDeviceStatus();
    log(`on-device: summarizer=${status.summarizer} rewriter=${status.rewriter} prompt=${status.prompt}`);
    const make = async (name, opts) => {
      const API = globalApi(name);
      if (!API) return null;
      try {
        return await API.create(opts);
      } catch (e) {
        log(`on-device ${name}.create() failed: ${(e && e.message) || e}`);
        return null;
      }
    };
    const tryEngine = async (name, factoryOpts, invoke) => {
      const inst = await make(name, factoryOpts);
      if (!inst) return null;
      const t0 = now();
      try {
        const out = await withTimeout(invoke(inst), ON_DEVICE_TIMEOUT_MS, `on-device ${name}`);
        log(`on-device ${name} ✓ ${String(out).length} chars in ${Math.round(now() - t0)}ms`);
        return out;
      } catch (e) {
        if (isAbort(e) && signal && signal.aborted) throw e;
        log(`on-device ${name} ✗ ${(e && e.message) || e} — falling back`);
        return null;
      } finally {
        safeDestroy(inst);
      }
    };

    let out = null;
    if (kind === "summary" && status.summarizer === "available") {
      out = await tryEngine(
        "Summarizer",
        { type: "key-points", format: "plain-text", length: "short", sharedContext: SUMMARY_SYSTEM },
        (s) => s.summarize(text, { context: "Deciding whether to read this.", signal }),
      );
    }
    if (out == null && kind === "simplify" && status.rewriter === "available") {
      out = await tryEngine(
        "Rewriter",
        { tone: "more-casual", length: "as-is", format: "plain-text", sharedContext: SIMPLIFY_SYSTEM },
        (r) => r.rewrite(text, { context: "Put this in plainer words for a struggling reader.", signal }),
      );
    }
    if (out == null && status.prompt === "available") {
      const system = kind === "summary" ? SUMMARY_SYSTEM : kind === "ask" ? ASK_SYSTEM : SIMPLIFY_SYSTEM;
      const ask =
        kind === "summary"
          ? `Main points of this article:\n\n${text}`
          : kind === "ask"
            ? `Article:\n\n${text}\n\nReader's question: ${question}`
            : `Rewrite this passage in plain language:\n\n${text}`;
      out = await tryEngine(
        "LanguageModel",
        { initialPrompts: [{ role: "system", content: system }] },
        (lm) => lm.prompt(ask, { signal }),
      );
    }
    if (out != null) return out;

    if (!CLOUD_KINDS.has(kind)) {
      log(`no on-device model for ${kind}, and it has no cloud path`);
      throw new Error("This browser doesn't have on-device AI ready for Simplify right now.");
    }
    if (onProgress) onProgress({ phase: "cloud" });
    return await cloudGenerate(kind, text, sanitizeUrl(getArticleUrl()), signal, question, log);
  }

  return {
    describe: () => describeAvailability(),
    async summarize({ onProgress, onLog, signal } = {}) {
      const { text, clipped } = clip(getArticleText(), MAX_SUMMARY_INPUT);
      if (!text) throw new Error("There's no article text to summarize.");
      return { text: await run({ kind: "summary", text, onProgress, onLog, signal }), clipped };
    },
    async simplify(passage, { onProgress, onLog, signal } = {}) {
      const { text, clipped } = clip(passage, MAX_SIMPLIFY_INPUT);
      if (!text) throw new Error("Select a sentence or paragraph first.");
      return { text: await run({ kind: "simplify", text, onProgress, onLog, signal }), clipped };
    },
    async ask(question, { onProgress, onLog, signal } = {}) {
      const q = String(question || "").replace(/\s+/g, " ").trim().slice(0, MAX_ASK_QUESTION);
      if (!q) throw new Error("Type a question first.");
      const { text, clipped } = clip(getArticleText(), MAX_ASK_CONTEXT);
      if (!text) throw new Error("There's no article text to ask about.");
      return { text: await run({ kind: "ask", text, question: q, onProgress, onLog, signal }), clipped };
    },
  };
}
