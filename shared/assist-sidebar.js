/*
 * ReadTune — reading-assistant UI: the "Ask AI" rail
 *
 * The headline AI feature lives in a docked left-hand rail (see shared/theme.css
 * `.rt-rail`). It's opened from the corner button, collapsed by its own × or
 * Escape. Reading keeps working alongside it — it isn't a dialog and it does
 * NOT close when you click the article.
 *
 * Key points for the article, a Play button that reads them aloud through the
 * same voice as everything else in ReadTune (no separate audio system), and the
 * same honest working/fail states as the Simplify card.
 */

import { el, resultBlock, disclaimer, workingNodes, failNodes } from "./assist-render.js";

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
  let controller = null; // the open request (summarize)
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
    controller = new AbortController();

    const closeBtn = el("button", { type: "button", class: "rt-assist-x", "aria-label": "Collapse" }, "×");
    closeBtn.addEventListener("click", () => close());

    const body = el("div", { class: "rt-assist-body", "aria-live": "polite", "aria-busy": "true" });
    panel = el(
      "aside",
      { class: "rt-assist-sidebar", role: "complementary", "aria-label": "Ask AI about this article", tabindex: "-1" },
      [el("div", { class: "rt-assist-head" }, [el("span", { class: "rt-assist-title" }, "Ask AI"), closeBtn]), body],
    );
    (mountEl || document.body).appendChild(panel);
    panel.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey, true);
    if (onToggle) onToggle(true);
    return body;
  }

  const fill = (body, ...kids) => {
    body.replaceChildren(...kids);
    body.setAttribute("aria-busy", "false");
  };

  /** Toggles between reading the summary aloud and stopping — reuses the
      exact voice read-aloud already uses elsewhere, not a new audio system. */
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

  async function open() {
    const body = mount();
    body.setAttribute("aria-busy", "true");
    body.replaceChildren(...workingNodes("Reading the article…", close));
    const signal = controller.signal;
    try {
      const { text, clipped } = await assistant.summarize({ signal });
      if (signal.aborted) return;
      const kids = [];
      if (clipped) kids.push(el("p", { class: "rt-assist-sub" }, "From the start of a long article."));
      kids.push(resultBlock(text), disclaimer());
      if (typeof speak === "function") kids.push(el("div", { class: "rt-assist-actions" }, [playButton(() => text)]));
      fill(body, ...kids);
    } catch (err) {
      if (!signal.aborted) fill(body, ...failNodes((err && err.message) || "The summary couldn't be generated.", open));
    }
  }

  return {
    open,
    isOpen: () => !!panel,
    destroy: close,
  };
}
