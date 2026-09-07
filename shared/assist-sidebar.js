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
 */

import { el, resultBlock, disclaimer, workingNodes, failNodes } from "./assist-render.js";

const CHIPS = [
  { label: "Summarise", run: (a, signal) => a.summarize({ signal }) },
  {
    label: "Key terms",
    run: (a, signal) => a.ask("What are the key terms, names or numbers in this article, and what does each mean?", { signal }),
  },
  {
    label: "Explain simply",
    run: (a, signal) => a.ask("Explain what this article is about in plain language, for someone new to the topic.", { signal }),
  },
];

/**
 * @param {object} opts
 * @param {ReturnType<import("./assist.js").createAssistant>} opts.assistant
 * @param {(t:string, signal?:AbortSignal)=>Promise<any>} [opts.speak] reads text aloud through the shared voice
 * @param {(m:string)=>void} [opts.onError]
 * @param {HTMLElement} [opts.mountEl] rail element to render into (falls back to <body>)
 * @param {(open:boolean)=>void} [opts.onToggle] told when the panel opens / collapses
 */
export function createAssistSidebar({ assistant, speak, onError = () => {}, mountEl = null, onToggle = null } = {}) {
  let panel = null;
  let bodyEl = null;
  let controller = null; // the active request (summary or a question)
  let speakController = null; // a separate, shorter-lived one for Play/Stop
  let lastFocus = null;

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

  function mount() {
    const opener = document.activeElement;
    close(false);
    lastFocus = opener && opener !== document.body && document.contains(opener) ? opener : null;

    const closeBtn = el("button", { type: "button", class: "rt-assist-x", "aria-label": "Collapse" }, "×");
    closeBtn.addEventListener("click", () => close());

    bodyEl = el("div", { class: "rt-assist-body", "aria-live": "polite", "aria-busy": "true" });

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
      runTask("ask", q, (a, signal) => a.ask(q, { signal }));
    };
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    const composer = el("form", { class: "rt-assist-composer" }, [input, send]);
    composer.addEventListener("submit", (e) => e.preventDefault());

    panel = el(
      "aside",
      { class: "rt-assist-sidebar", role: "complementary", "aria-label": "Ask AI about this article", tabindex: "-1" },
      [el("div", { class: "rt-assist-head" }, [el("span", { class: "rt-assist-title" }, "Ask AI"), closeBtn]), bodyEl, composer],
    );
    (mountEl || document.body).appendChild(panel);
    // Reveal the rail first — focusing a still-hidden element sends focus to
    // <body> instead.
    if (onToggle) onToggle(true);
    panel.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey, true);
  }

  const fill = (...kids) => {
    if (!bodyEl) return;
    bodyEl.replaceChildren(...kids);
    bodyEl.setAttribute("aria-busy", "false");
  };

  /** Toggles between reading the answer aloud and stopping — reuses the exact
      voice read-aloud already uses elsewhere, not a new audio system. */
  function playButton(getText) {
    const btn = el("button", { type: "button", class: "rt-assist-btn rt-assist-play" }, "▶ Play");
    btn.addEventListener("click", async () => {
      if (speakController) {
        stopSpeaking();
        btn.textContent = "▶ Play";
        return;
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

  function chipRow() {
    return el(
      "div",
      { class: "rt-assist-chips", role: "group", "aria-label": "Quick asks" },
      CHIPS.map((c) => {
        const b = el("button", { type: "button", class: "rt-assist-chip" }, c.label);
        b.addEventListener("click", () =>
          runTask(c.label === "Summarise" ? "summary" : "ask", null, c.run));
        return b;
      }),
    );
  }

  /** Run one task (a chip or a typed question) into the answer area. `question`
      is echoed above the answer when the reader typed one (null otherwise). */
  async function runTask(kind, question, invoke) {
    stopSpeaking();
    if (controller) { try { controller.abort(); } catch {} }
    controller = new AbortController();
    const mine = controller;
    fill(...workingNodes(kind === "ask" ? "Reading and thinking…" : "Reading the article…", () => close()));
    bodyEl.setAttribute("aria-busy", "true");
    try {
      const { text, clipped } = await invoke(assistant, mine.signal);
      if (mine.signal.aborted) return;
      const kids = [chipRow()];
      if (question) kids.push(el("p", { class: "rt-assist-q" }, question));
      if (clipped && kind !== "ask") kids.push(el("p", { class: "rt-assist-sub" }, "From the start of a long article."));
      kids.push(resultBlock(text), disclaimer());
      if (typeof speak === "function") kids.push(el("div", { class: "rt-assist-actions" }, [playButton(() => text)]));
      fill(...kids);
    } catch (err) {
      if (!mine.signal.aborted) {
        fill(...failNodes((err && err.message) || "That didn't work.", () => runTask(kind, question, invoke)));
      }
    } finally {
      if (controller === mine) controller = null;
    }
  }

  function open() {
    mount();
    return runTask("summary", null, (a, signal) => a.summarize({ signal }));
  }

  return {
    open,
    isOpen: () => !!panel,
    destroy: close,
  };
}
