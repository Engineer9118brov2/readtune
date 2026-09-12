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
const ON_DEVICE_TIMEOUT_MS = 8000;
const ON_DEVICE_ONLY_TIMEOUT_MS = 15000;
const CLOUD_TIMEOUT_MS = 30000;
const AVAILABILITY_TIMEOUT_MS = 500;
// Chrome can report a built-in model as available while starting its session
// still takes tens of seconds. Give the private path a brief head start, then
// race the relay rather than making the reader wait through two serial stalls.
const CLOUD_HEDGE_MS = 700;

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
   reader's typed question); Define sends the selected word plus its sentence;
   Explain sends the selected passage. Simplify stays on-device-only until its
   own cloud path is built and disclosed — see docs/ASSIST.md. */
const CLOUD_KINDS = new Set(["summary", "ask", "define", "explain", "annotate"]);

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
const MAX_DEFINE_CONTEXT = 800; // a sentence or two, not a whole article
const MAX_DEFINE_WORD = 80; // a word or short phrase
const MAX_EXPLAIN_INPUT = 2400; // matches MAX_SIMPLIFY_INPUT — a selection, not an article

/* A typed question can ask for its answer at a plainer reading level. Kept
   entirely separate from the question string itself (never concatenated into
   it) — see cloudGenerate's comment for why: truncation and context-selection
   leakage both go away when the hint travels its own path all the way to the
   relay. "written" carries no hint at all. */
const LEVEL_HINTS = {
  written: "",
  simple: " Answer at a simple, plain-language reading level — short sentences, common words.",
  simplest: " Answer at the simplest possible reading level — very short sentences, the most common everyday words.",
};

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

const DEFINE_SYSTEM =
  "You define a word or short phrase exactly as it's used in the sentence given, for a reader who finds reading difficult. " +
  "One plain sentence. Do not repeat the word itself unless it clarifies a homograph (a word with more than one meaning). No preamble.";

const EXPLAIN_SYSTEM =
  "You explain what a passage means for a reader who finds reading difficult — any figurative language, tone, or theme. " +
  "If nothing figurative is present, explain the main idea instead. Two to four short sentences, plain words, no preamble.";

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
    return await Promise.race([
      A.availability(),
      new Promise((resolve) => setTimeout(() => resolve("unavailable"), AVAILABILITY_TIMEOUT_MS)),
    ]);
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
      ? "On-device AI gets a brief head start. If it is slow, ReadTune's free helper takes over so you are not left waiting; the article text is then sent to generate the response."
      : "Runs through ReadTune's free AI helper. The article text (or the passage you select) is sent to generate the response — everything else in ReadTune stays on your device.",
  };
}

const safeDestroy = (o) => { try { o && o.destroy && o.destroy(); } catch {} };

/* ---------- cloud: ReadTune's own relay to a free model ---------- */

async function cloudGenerate(kind, text, url, signal, question = "", log = () => {}, levelHint = "") {
  if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
  const timer = new AbortController();
  const to = setTimeout(() => timer.abort(new DOMException("cloud timed out", "AbortError")), CLOUD_TIMEOUT_MS);
  const onCallerAbort = () => timer.abort();
  if (signal) signal.addEventListener("abort", onCallerAbort, { once: true });
  const started = now();
  log(`cloud → POST ${CLOUD_URL} (kind=${kind}${question ? ", +question" : ""}${levelHint ? ", +level" : ""}, ${text.length} chars)`);
  let res;
  try {
    const body = { kind, text, url };
    if (question) body.question = question;
    // Kept separate from `question` end-to-end (never concatenated into it)
    // so a reading-level phrasing hint can't (a) get silently truncated when
    // the raw question is already near MAX_ASK_QUESTION, or (b) leak style
    // words like "simple"/"sentences" into selectAskContext's relevance
    // scoring, which would happen if it were part of the question string.
    if (levelHint) body.levelHint = levelHint;
    res = await fetch(CLOUD_URL, {
      method: "POST",
      signal: timer.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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

/* A question about a long article was silently failing whenever the answer
   lived past MAX_ASK_CONTEXT: a flat "read the first N characters" clip has
   no idea the reader asked about something near the bottom of the page (a
   Wikipedia infobox table two screens down, say). This is a cheap keyword
   match, not a search engine — no index, no embeddings, nothing to keep in
   sync — but it means "what changed at the end?" actually reads the end. */
const ASK_STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is",
  "are", "was", "were", "be", "been", "being", "it", "its", "this", "that",
  "these", "those", "with", "as", "by", "from", "what", "which", "who",
  "whom", "how", "why", "when", "where", "do", "does", "did", "has", "have",
  "had", "will", "would", "can", "could", "about", "into", "than", "so",
  "not", "no", "you", "your", "i", "me", "my", "we", "our", "they", "them",
]);
const wordsOf = (s) => (String(s || "").toLowerCase().match(/[a-z0-9']+/g) || []);

/** Pick the article blocks most likely to answer `question`, in their
    original order, up to `maxChars`. Falls back to the article's start when
    the question shares no real words with any block (a vague or off-topic
    ask) or when there are no block boundaries to work with at all. */
function selectAskContext(blocks, question, maxChars) {
  if (!Array.isArray(blocks) || blocks.length <= 1) return null;
  const qWords = new Set(wordsOf(question).filter((w) => w.length > 2 && !ASK_STOPWORDS.has(w)));
  if (!qWords.size) return null;
  const scored = blocks.map((text, i) => {
    const seen = new Set(wordsOf(text));
    let score = 0;
    for (const w of seen) if (qWords.has(w)) score++;
    return { text, i, score };
  });
  if (!scored.some((b) => b.score > 0)) return null;
  // The opening block or two ground the model in what the article even is,
  // even when they didn't individually score — a table titled "Employers"
  // three screens down means nothing without knowing the article is about
  // Calabasas. Everything else competes purely on relevance.
  const chosen = new Set([0, 1].filter((i) => i < blocks.length));
  for (const b of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (b.score <= 0) break;
    chosen.add(b.i);
  }
  let out = "";
  for (const i of [...chosen].sort((a, b) => a - b)) {
    const next = (out ? out + "\n\n" : "") + blocks[i];
    if (next.length > maxChars) { if (!out) out = blocks[i].slice(0, maxChars); break; }
    out = next;
  }
  return out || null;
}

export function createAssistant({ getArticleText = () => "", getArticleBlocks = null, getArticleUrl = () => "" } = {}) {
  async function run({ kind, text, question = "", levelHint = "", onProgress, onLog, signal }) {
    const log = typeof onLog === "function" ? (m) => onLog(m) : () => {};
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

    // On-device gets first chance, but only when it's already ready. No `.create()` call
    // here ever triggers a download: every status checked below is either
    // "available" (use it) or something else (skip straight to the cloud).
    const status = await onDeviceStatus();
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
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
    // Try an on-device engine; return its text, or null to fall through to the
    // cloud. A timeout or a mid-flight failure is logged and falls through —
    // never a permanent hang.
    const tryEngine = async (name, factoryOpts, invoke, engineSignal = signal) => {
      if (engineSignal && engineSignal.aborted) throw new DOMException("Aborted", "AbortError");
      const inst = await make(name, factoryOpts);
      if (!inst) return null;
      if (engineSignal && engineSignal.aborted) {
        safeDestroy(inst);
        throw new DOMException("Aborted", "AbortError");
      }
      const t0 = now();
      const timeoutMs = CLOUD_KINDS.has(kind) ? ON_DEVICE_TIMEOUT_MS : ON_DEVICE_ONLY_TIMEOUT_MS;
      try {
        const out = await withTimeout(invoke(inst, engineSignal), timeoutMs, `on-device ${name}`);
        log(`on-device ${name} ✓ ${String(out).length} chars in ${Math.round(now() - t0)}ms`);
        return out;
      } catch (e) {
        // An aborted engineSignal means the hedged local branch lost (or the
        // reader cancelled). Don't convert that into "no result" and fall
        // through to the next on-device engine — session create/prompt would
        // keep running after the caller already moved on.
        if (isAbort(e) && ((signal && signal.aborted) || (engineSignal && engineSignal.aborted))) throw e;
        log(`on-device ${name} ✗ ${(e && e.message) || e} — falling back`);
        return null;
      } finally {
        safeDestroy(inst);
      }
    };

    const runOnDevice = async (engineSignal = signal) => {
      let out = null;
      if (kind === "summary" && status.summarizer === "available") {
        out = await tryEngine(
          "Summarizer",
          { type: "key-points", format: "plain-text", length: "short", sharedContext: SUMMARY_SYSTEM },
          (s, activeSignal) => s.summarize(text, { context: "Deciding whether to read this.", signal: activeSignal }),
          engineSignal,
        );
      }
      if (out == null && kind === "simplify" && status.rewriter === "available") {
        out = await tryEngine(
          "Rewriter",
          { tone: "more-casual", length: "as-is", format: "plain-text", sharedContext: SIMPLIFY_SYSTEM },
          (r, activeSignal) => r.rewrite(text, { context: "Put this in plainer words for a struggling reader.", signal: activeSignal }),
          engineSignal,
        );
      }
      if (out == null && status.prompt === "available") {
        const system =
          kind === "summary" ? SUMMARY_SYSTEM :
          kind === "ask" ? ASK_SYSTEM :
          kind === "define" ? DEFINE_SYSTEM :
          kind === "explain" ? EXPLAIN_SYSTEM :
          SIMPLIFY_SYSTEM;
        const ask =
          kind === "summary" ? `Main points of this article:\n\n${text}` :
          kind === "ask" ? `Article:\n\n${text}\n\nReader's question: ${question}${levelHint}` :
          kind === "define" ? (text ? `Sentence:\n${text}\n\nDefine as used here: "${question}"` : `Define: "${question}"`) :
          kind === "explain" ? `Explain this passage:\n\n${text}` :
          `Rewrite this passage in plain language:\n\n${text}`;
        out = await tryEngine(
          "LanguageModel",
          { initialPrompts: [{ role: "system", content: system }] },
          (lm, activeSignal) => lm.prompt(ask, { signal: activeSignal }),
          engineSignal,
        );
      }
      if (out == null) throw new Error("No on-device result");
      return out;
    };

    const hasLocal =
      kind !== "annotate" && (
        (kind === "summary" && status.summarizer === "available") ||
        (kind === "simplify" && status.rewriter === "available") ||
        status.prompt === "available"
      );
    // Annotate always goes straight to the relay — it asks for several
    // structured {quote, note} entries as strict JSON, which a small
    // on-device model is much more likely to get subtly wrong (bad JSON,
    // paraphrased quotes) than a bigger cloud model already told to be
    // strict about it. Simplify is the mirror case (on-device only); this is
    // the one kind that's cloud-only.

    if (hasLocal && CLOUD_KINDS.has(kind)) {
      const localController = new AbortController();
      const cloudController = new AbortController();
      const abortBranches = () => {
        localController.abort();
        cloudController.abort();
      };
      // AbortSignal does not replay abort to late listeners. If the reader
      // cancelled during onDeviceStatus(), abort both branches immediately
      // instead of starting a race that can still hit the relay.
      if (signal && signal.aborted) {
        abortBranches();
        throw new DOMException("Aborted", "AbortError");
      }
      if (signal) signal.addEventListener("abort", abortBranches, { once: true });
      let hedgeTimer;
      const cloudAfterHeadStart = new Promise((resolve, reject) => {
        hedgeTimer = setTimeout(() => {
          if (onProgress) onProgress({ phase: "cloud" });
          cloudGenerate(kind, text, sanitizeUrl(getArticleUrl()), cloudController.signal, question, log, levelHint).then(resolve, reject);
        }, CLOUD_HEDGE_MS);
        cloudController.signal.addEventListener("abort", () => {
          clearTimeout(hedgeTimer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
      try {
        const localAttempt = runOnDevice(localController.signal);
        const result = await Promise.any([localAttempt, cloudAfterHeadStart]);
        localAttempt.catch(() => {});
        cloudAfterHeadStart.catch(() => {});
        return result;
      } catch (e) {
        if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
        throw (e && e.errors && e.errors[e.errors.length - 1]) || e;
      } finally {
        clearTimeout(hedgeTimer);
        abortBranches();
        if (signal) signal.removeEventListener("abort", abortBranches);
      }
    }
    if (hasLocal) return await runOnDevice();

    if (!CLOUD_KINDS.has(kind)) {
      log(`no on-device model for ${kind}, and it has no cloud path`);
      throw new Error("This browser doesn't have on-device AI ready for Simplify right now.");
    }
    if (onProgress) onProgress({ phase: "cloud" });
    return await cloudGenerate(kind, text, sanitizeUrl(getArticleUrl()), signal, question, log, levelHint);
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
    async ask(question, { onProgress, onLog, signal, level = "written" } = {}) {
      const q = String(question || "").replace(/\s+/g, " ").trim().slice(0, MAX_ASK_QUESTION);
      if (!q) throw new Error("Type a question first.");
      // selectAskContext scores blocks against the reader's actual words —
      // it must see the raw question, not one carrying "simple"/"sentences"/
      // "words" from a level hint, or those style terms would themselves
      // count as relevance signal and could crowd out the block that
      // actually answers the question.
      const blocks = typeof getArticleBlocks === "function" ? getArticleBlocks() : null;
      const relevant = selectAskContext(blocks, q, MAX_ASK_CONTEXT);
      const { text, clipped } = relevant != null ? clip(relevant, MAX_ASK_CONTEXT) : clip(getArticleText(), MAX_ASK_CONTEXT);
      if (!text) throw new Error("There's no article text to ask about.");
      const levelHint = LEVEL_HINTS[level] || "";
      return { text: await run({ kind: "ask", text, question: q, levelHint, onProgress, onLog, signal }), clipped };
    },
    async define(word, context = "", { onProgress, onLog, signal } = {}) {
      const w = String(word || "").replace(/\s+/g, " ").trim().slice(0, MAX_DEFINE_WORD);
      if (!w) throw new Error("Select a word first.");
      const { text, clipped } = clip(context, MAX_DEFINE_CONTEXT);
      return { text: await run({ kind: "define", text, question: w, onProgress, onLog, signal }), clipped };
    },
    async explain(passage, { onProgress, onLog, signal } = {}) {
      const { text, clipped } = clip(passage, MAX_EXPLAIN_INPUT);
      if (!text) throw new Error("Select a sentence or paragraph first.");
      return { text: await run({ kind: "explain", text, onProgress, onLog, signal }), clipped };
    },
    /** Reads the whole article and asks for several {quote, note, kind}
        annotations back as a JSON string — the caller (assist-sidebar.js)
        parses it and turns each into a highlight via aids.js's
        addHighlightByText. Cloud-only — see the hasLocal comment in run(). */
    async annotate({ onProgress, onLog, signal } = {}) {
      const { text, clipped } = clip(getArticleText(), MAX_SUMMARY_INPUT);
      if (!text) throw new Error("There's no article text to annotate.");
      return { text: await run({ kind: "annotate", text, onProgress, onLog, signal }), clipped };
    },
  };
}
