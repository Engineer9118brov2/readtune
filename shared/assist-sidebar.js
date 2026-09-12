/*
 * ReadTune — reading-assistant UI: the "Ask AI" rail
 *
 * The headline AI feature lives in a docked left-hand rail (see shared/theme.css
 * `.rt-rail`). It's opened from the corner button, collapsed by its own × or
 * Escape. Reading keeps working alongside it — it isn't a dialog and it does
 * NOT close when you click the article.
 *
 * On open it summarises the article; a composer at the bottom takes freeform
 * questions about it (assistant.ask). Every answer gets a Play button that
 * reads it aloud through the same voice as everything else in ReadTune, and
 * the same honest working / fail states as the Simplify card.
 *
 * A collapsible "Diagnostics" panel at the bottom records what each request
 * did (which path, HTTP status, timings, why it failed) with a Copy button —
 * so a stuck request can be reported instead of just spinning.
 */

import { el, resultBlock, disclaimer, workingNodes, failNodes, annotationReview } from "./assist-render.js";

/** The model is told to reply with ONLY a JSON array, but a chat model can
    still wrap it in prose or a code fence despite that — this pulls out the
    `[...]` span rather than trusting the whole response to be clean JSON. */
function extractJsonArray(text) {
  const s = String(text || "");
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON array in the response.");
  return s.slice(start, end + 1);
}

const CHIPS = [
  { label: "Summarise", run: (a, opts) => a.summarize(opts) },
  {
    label: "Key terms",
    run: (a, opts) => a.ask("What are the key terms, names or numbers in this article, and what does each mean?", opts),
  },
  {
    label: "Explain simply",
    run: (a, opts) => a.ask("Explain what this article is about in plain language, for someone new to the topic.", opts),
  },
];

/* A typed question can ask for its answer at a plainer reading level — the
   article text itself is unchanged, only how the answer is written. Applies
   to the composer's freeform questions, not the CHIPS above (those already
   word their own asks). Only the level id is passed to assistant.ask() —
   the actual phrasing hint lives in shared/assist.js and travels to the
   relay as its own field, never concatenated into the question itself (that
   would risk truncation at the question length cap, and would leak style
   words into the question's own relevance-scoring for context selection). */
const LEVELS = [
  { id: "written", label: "As written" },
  { id: "simple", label: "Simpler" },
  { id: "simplest", label: "Simplest" },
];

/**
 * @param {object} opts
 * @param {ReturnType<import("./assist.js").createAssistant>} opts.assistant
 * @param {(t:string, signal?:AbortSignal)=>Promise<any>} [opts.speak] reads text aloud through the shared voice
 * @param {(m:string)=>void} [opts.onError]
 * @param {HTMLElement} [opts.mountEl] rail element to render into (falls back to <body>)
 * @param {(open:boolean)=>void} [opts.onToggle] told when the panel opens / collapses
 * @param {string} [opts.initialLevel] reading level to start on ("written" | "simple" | "simplest")
 * @param {(level:string)=>void} [opts.onLevelChange] told when the reader picks a different level, to persist it
 * @param {(quote:string, note:string)=>({id:string}|null)} [opts.onAnnotateApply]
 *   turns one Annotate-article candidate into a highlight+note — typically
 *   shared/aids.js's addHighlightByText. Omit and the Annotate action simply
 *   isn't offered (see chipRow()).
 */
export function createAssistSidebar({
  assistant,
  speak,
  onError = () => {},
  mountEl = null,
  onToggle = null,
  initialLevel = "written",
  onLevelChange = null,
  onAnnotateApply = null,
} = {}) {
  let panel = null;
  let bodyEl = null;
  let diagPre = null;
  let diagWrap = null;
  let logs = [];
  let controller = null; // the active request (summary or a question)
  let speakController = null; // a separate, shorter-lived one for Play/Stop
  let lastFocus = null;
  let level = LEVELS.some((l) => l.id === initialLevel) ? initialLevel : "written";

  function stopSpeaking() {
    if (speakController) {
      try { speakController.abort(); } catch {}
      speakController = null;
    }
  }

  function stop() {
    stopSpeaking();
    if (controller) {
      try { controller.abort(); } catch {}
      controller = null;
    }
  }

  function close(restoreFocus = true) {
    const wasOpen = !!panel;
    stop();
    if (panel) panel.remove();
    panel = null;
    bodyEl = null;
    diagPre = null;
    diagWrap = null;
    document.removeEventListener("keydown", onKey, true);
    if (restoreFocus && lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === "function") {
      lastFocus.focus({ preventScroll: true });
    }
    if (restoreFocus) lastFocus = null;
    if (wasOpen && onToggle) onToggle(false);
  }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  }

  const stamp = () => new Date().toLocaleTimeString([], { hour12: false }) + "." + String(Date.now() % 1000).padStart(3, "0");
  function pushLog(msg) {
    logs.push(`${stamp()}  ${msg}`);
    if (diagPre) diagPre.textContent = logs.join("\n");
    if (diagWrap) diagWrap.hidden = false;
  }
  function resetLog(header) {
    logs = [];
    pushLog(header);
    pushLog(`online=${typeof navigator !== "undefined" ? navigator.onLine : "?"}  ua=${(typeof navigator !== "undefined" && navigator.userAgent || "").slice(0, 80)}`);
  }

  function mount() {
    const opener = document.activeElement;
    close(false);
    lastFocus = opener && opener !== document.body && document.contains(opener) ? opener : null;

    const closeBtn = el("button", { type: "button", class: "rt-assist-x", "aria-label": "Collapse" }, "×");
    closeBtn.addEventListener("click", () => close());

    bodyEl = el("div", { class: "rt-assist-body rt-assist-thread", "aria-live": "polite", "aria-busy": "true" });

    const input = el("textarea", {
      class: "rt-assist-input",
      rows: "2",
      "aria-label": "Ask a question about this article",
      placeholder: "Ask about this article…",
    });
    const send = el("button", { type: "button", class: "rt-assist-send", "aria-label": "Ask" }, "↑");
    const submit = () => {
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      runTask("ask", q, (a, opts) => a.ask(q, { ...opts, level }));
    };
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    const composer = el("form", { class: "rt-assist-composer" }, [input, send]);
    composer.addEventListener("submit", (e) => e.preventDefault());

    diagPre = el("pre", { class: "rt-assist-diag-log" });
    const copyBtn = el("button", { type: "button", class: "rt-assist-btn" }, "Copy");
    copyBtn.addEventListener("click", async () => {
      const text = logs.join("\n");
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
      } catch {
        // clipboard blocked — select the text so the reader can copy by hand
        const r = document.createRange();
        r.selectNodeContents(diagPre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    });
    diagWrap = el("details", { class: "rt-assist-diag" }, [
      el("summary", {}, "Request details"),
      diagPre,
      el("div", { class: "rt-assist-actions" }, [copyBtn]),
    ]);

    panel = el(
      "aside",
      { class: "rt-assist-sidebar", role: "complementary", "aria-label": "Ask AI about this article", tabindex: "-1" },
      [
        el("div", { class: "rt-assist-head" }, [
          el("div", {}, [el("span", { class: "rt-assist-title" }, "Article chat"), el("span", { class: "rt-assist-kicker" }, "Ask about what you're reading")]),
          closeBtn,
        ]),
        chipRow(),
        bodyEl,
        diagWrap,
        levelControl(),
        composer,
      ],
    );
    (mountEl || document.body).appendChild(panel);
    // Reveal the rail first — focusing a still-hidden element sends focus to
    // <body> instead.
    if (onToggle) onToggle(true);
    panel.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey, true);
  }

  /** Toggles between reading the answer aloud and stopping — reuses the exact
      voice read-aloud already uses elsewhere, not a new audio system. */
  function playButton(getText) {
    const btn = el("button", { type: "button", class: "rt-assist-btn rt-assist-play" }, "▶ Play");
    btn.addEventListener("click", async () => {
      const stoppingThis = speakController && btn.textContent === "■ Stop";
      if (speakController) {
        stopSpeaking();
        btn.textContent = "▶ Play";
        if (stoppingThis) return;
      }
      if (typeof speak !== "function") return;
      speakController = new AbortController();
      const mine = speakController;
      btn.textContent = "■ Stop";
      try {
        await speak(getText(), mine.signal);
      } catch (err) {
        if (!mine.signal.aborted) onError((err && err.message) || "The voice couldn't read that.");
      } finally {
        if (speakController === mine) speakController = null;
        btn.textContent = "▶ Play";
      }
    });
    return btn;
  }

  /** A small segmented control for how plain a typed question's answer
      should be. Purely a phrasing hint threaded into the question sent to
      assistant.ask() — no relay/API change, the model just reads a slightly
      different question. */
  function levelControl() {
    const buttons = LEVELS.map((l) => {
      const b = el(
        "button",
        { type: "button", class: "rt-assist-level-btn", "aria-pressed": String(l.id === level) },
        l.label,
      );
      b.addEventListener("click", () => {
        if (level === l.id) return;
        level = l.id;
        buttons.forEach((btn, i) => btn.setAttribute("aria-pressed", String(LEVELS[i].id === level)));
        if (onLevelChange) onLevelChange(level);
      });
      return b;
    });
    return el(
      "div",
      { class: "rt-assist-level", role: "group", "aria-label": "Reading level for answers" },
      buttons,
    );
  }

  function chipRow() {
    const chips = CHIPS.map((c) => {
      const b = el("button", { type: "button", class: "rt-assist-chip" }, c.label);
      b.addEventListener("click", () =>
        runTask(c.label === "Summarise" ? "summary" : "ask", c.label, c.run));
      return b;
    });
    // Only offered when the caller wired somewhere to put the results —
    // without onAnnotateApply there'd be nothing for "Apply" to do.
    if (typeof onAnnotateApply === "function") {
      const annotate = el("button", { type: "button", class: "rt-assist-chip" }, "Annotate this article");
      annotate.addEventListener("click", () => runAnnotate());
      chips.push(annotate);
    }
    return el("div", { class: "rt-assist-chips", role: "group", "aria-label": "Quick asks" }, chips);
  }

  /** Reads the whole article and turns the model's {quote, note} suggestions
      into review cards the reader can Apply (or Apply all) / Skip — a bulk,
      AI-assisted version of manually highlighting-with-a-note. Kept separate
      from runTask() since its result isn't flat text: it needs JSON parsing
      and a different renderer (annotationReview, not resultBlock). */
  async function runAnnotate() {
    stopSpeaking();
    if (controller) { try { controller.abort(); } catch {} }
    controller = new AbortController();
    const mine = controller;
    resetLog("annotate requested");
    const pending = el("div", { class: "rt-chat-row rt-chat-row-ai rt-chat-pending" },
      workingNodes("Reading the article for things worth annotating…", () => stop()));
    bodyEl.append(pending);
    bodyEl.setAttribute("aria-busy", "true");
    bodyEl.scrollTop = bodyEl.scrollHeight;
    const t0 = Date.now();
    try {
      const { text } = await assistant.annotate({ signal: mine.signal, onLog: pushLog });
      if (mine.signal.aborted) {
        pending.remove();
        if (bodyEl && !bodyEl.querySelector(".rt-chat-pending")) bodyEl.setAttribute("aria-busy", "false");
        return;
      }
      let items = null;
      try {
        const parsed = JSON.parse(extractJsonArray(text));
        items = Array.isArray(parsed)
          ? parsed.filter((it) => it && typeof it.quote === "string" && it.quote.trim())
          : null;
      } catch {
        items = null;
      }
      if (!items || !items.length) {
        pushLog(`FAILED: response wasn't a usable JSON array (${String(text).length} chars)`);
        pending.className = "rt-chat-row rt-chat-row-ai rt-chat-error";
        pending.replaceChildren(...failNodes("The AI's answer wasn't in the right shape. Try again?", () => runAnnotate()));
        bodyEl.setAttribute("aria-busy", "false");
        return;
      }
      pushLog(`done in ${Date.now() - t0}ms → ${items.length} candidate annotation(s)`);
      pending.className = "rt-chat-row rt-chat-row-ai";
      pending.replaceChildren(
        annotationReview(items, (item) => onAnnotateApply(item.quote, item.note || "")),
        disclaimer(),
      );
      bodyEl.setAttribute("aria-busy", "false");
      bodyEl.scrollTop = bodyEl.scrollHeight;
    } catch (err) {
      if (mine.signal.aborted) {
        pushLog(`cancelled after ${Date.now() - t0}ms`);
        pending.remove();
        if (bodyEl && !bodyEl.querySelector(".rt-chat-pending")) bodyEl.setAttribute("aria-busy", "false");
        return;
      }
      pushLog(`FAILED after ${Date.now() - t0}ms: ${(err && err.message) || err}`);
      pending.className = "rt-chat-row rt-chat-row-ai rt-chat-error";
      pending.replaceChildren(...failNodes((err && err.message) || "That didn't work.", () => runAnnotate()));
      bodyEl.setAttribute("aria-busy", "false");
    } finally {
      if (controller === mine) controller = null;
    }
  }

  /** Run one task (a chip or a typed question) into the answer area. `question`
      is echoed above the answer when the reader typed one (null otherwise). */
  async function runTask(kind, question, invoke, echoQuestion = true) {
    stopSpeaking();
    if (controller) { try { controller.abort(); } catch {} }
    controller = new AbortController();
    const mine = controller;
    resetLog(`${kind === "ask" ? "ask" : "summary"} requested${question ? `: "${question.slice(0, 120)}"` : ""}`);
    if (question && echoQuestion) bodyEl.append(el("div", { class: "rt-chat-row rt-chat-row-user" }, [el("p", { class: "rt-assist-q" }, question)]));
    const pending = el("div", { class: "rt-chat-row rt-chat-row-ai rt-chat-pending" },
      workingNodes(kind === "ask" ? "Thinking…" : "Making a quick summary…", () => stop()));
    bodyEl.append(pending);
    bodyEl.setAttribute("aria-busy", "true");
    bodyEl.scrollTop = bodyEl.scrollHeight;
    const t0 = Date.now();
    try {
      const { text, clipped } = await invoke(assistant, { signal: mine.signal, onLog: pushLog });
      if (mine.signal.aborted) {
        pending.remove();
        if (bodyEl && !bodyEl.querySelector(".rt-chat-pending")) bodyEl.setAttribute("aria-busy", "false");
        return;
      }
      pushLog(`done in ${Date.now() - t0}ms → showing ${String(text).length} chars`);
      const kids = [];
      if (clipped && kind !== "ask") kids.push(el("p", { class: "rt-assist-sub" }, "From the start of a long article."));
      kids.push(resultBlock(text), disclaimer());
      if (typeof speak === "function") kids.push(el("div", { class: "rt-assist-actions" }, [playButton(() => text)]));
      pending.className = "rt-chat-row rt-chat-row-ai";
      pending.replaceChildren(...kids);
      bodyEl.setAttribute("aria-busy", "false");
      bodyEl.scrollTop = bodyEl.scrollHeight;
    } catch (err) {
      if (mine.signal.aborted) {
        pushLog(`cancelled after ${Date.now() - t0}ms`);
        pending.remove();
        if (bodyEl && !bodyEl.querySelector(".rt-chat-pending")) bodyEl.setAttribute("aria-busy", "false");
        return;
      }
      pushLog(`FAILED after ${Date.now() - t0}ms: ${(err && err.message) || err}`);
      pending.className = "rt-chat-row rt-chat-row-ai rt-chat-error";
      pending.replaceChildren(...failNodes((err && err.message) || "That didn't work.", () => runTask(kind, question, invoke, false)));
      bodyEl.setAttribute("aria-busy", "false");
    } finally {
      if (controller === mine) controller = null;
    }
  }

  function open() {
    mount();
    return runTask("summary", null, (a, opts) => a.summarize(opts));
  }

  return {
    open,
    isOpen: () => !!panel,
    destroy: close,
  };
}
