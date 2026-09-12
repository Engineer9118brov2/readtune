/*
 * ReadTune — reading-assistant UI: Simplify, Define, Explain
 *
 * A dismissible card for a plain-language rewrite of the passage you
 * selected (Simplify), a one-sentence definition of a word you selected
 * (Define), or a read on figurative language/theme in a passage (Explain).
 * All three show their result beside the original where that makes sense,
 * never in its place. (Summary lives in its own docked sidebar now — see
 * assist-sidebar.js — since it's the headline AI feature and reads better as
 * a persistent panel than a modal.)
 *
 * Which pill(s) show over a selection depends on its shape: a single short
 * word or phrase gets Define; a longer passage gets Simplify and Explain
 * together (a rewrite and an interpretation are genuinely different asks).
 * The Highlight pill (shared/aids.js) is a separate concern — marking, not
 * asking AI — and shows alongside these independently.
 *
 * Every result card carries an "AI — may not be exact" line, and — when the
 * caller wires onSaveAsHighlight — a "Save as highlight" action that turns
 * the AI's own answer into a note on a highlight over the exact text that
 * was selected, without retyping anything.
 */

import { el, resultBlock, disclaimer, workingNodes, failNodes } from "./assist-render.js";

/** A short word or phrase — the shape Define wants — rather than a full
    sentence or passage (Simplify/Explain's territory). */
function isWordLike(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 24 || /\n/.test(t)) return false;
  return t.split(/\s+/).length <= 3;
}

/** The nearest block of text around a range, for Define's "as used in this
    sentence" grounding — not sentence-boundary-precise, just enough context
    for a model to pick the right sense of a word. */
function contextForRange(range) {
  try {
    const node = range.commonAncestorContainer;
    const el_ = node.nodeType === 1 ? node : node.parentElement;
    if (!el_) return "";
    const block = typeof el_.closest === "function"
      ? el_.closest("p, li, td, th, blockquote, figcaption, h1, h2, h3, h4, h5, h6")
      : null;
    return (block || el_).textContent || "";
  } catch {
    return "";
  }
}

/**
 * @param {object} opts
 * @param {ReturnType<import("./assist.js").createAssistant>} opts.assistant
 * @param {() => string}       opts.getSelectionText  the reader's current selection
 * @param {(t:string)=>Promise<any>} [opts.speak]     optional "hear it" for the result
 * @param {(m:string)=>void}   [opts.onError]
 * @param {(range:Range, note:string)=>({id:string}|null)} [opts.onSaveAsHighlight]
 *   turns the AI's result into a highlight+note over the range that produced
 *   it — typically shared/aids.js's addHighlightFromRange. Omit to hide the
 *   "Save as highlight" action entirely.
 */
export function createAssistUi({
  assistant,
  getSelectionText = () => "",
  speak,
  onError = () => {},
  onSaveAsHighlight = null,
} = {}) {
  let card = null;
  let controller = null;
  let lastFocus = null;

  /* Declared as hoisted functions: close() references onKey/onDown and they
     reference close() back, so no declaration order works as `const`. */
  function stop() {
    if (controller) {
      try { controller.abort(); } catch {}
      controller = null;
    }
  }
  function close(restoreFocus = true) {
    stop();
    if (card) card.remove();
    card = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onDown, true);
    /* Hand focus back to whatever opened the card (header button, the pill) so a
       keyboard user isn't dropped at the top of the document. frame() passes
       false — it's about to open a new card and set focus itself. */
    if (restoreFocus && lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === "function") {
      lastFocus.focus({ preventScroll: true });
    }
    if (restoreFocus) lastFocus = null;
  }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  }
  function onDown(e) {
    if (card && !card.contains(e.target)) close();
  }

  function frame(title) {
    /* Remember the real opener (header button, the pill), not a button inside a
       card we're replacing on retry. */
    const active = document.activeElement;
    const opener = card && card.contains(active) ? lastFocus : active;
    close(false);
    lastFocus = opener && opener !== document.body && document.contains(opener) ? opener : null;
    controller = new AbortController();

    const closeBtn = el("button", { type: "button", class: "rt-assist-x", "aria-label": "Close" }, "×");
    closeBtn.addEventListener("click", close);

    const body = el("div", { class: "rt-assist-body", "aria-live": "polite", "aria-busy": "true" });
    card = el(
      "div",
      { class: "rt-assist-card", role: "dialog", "aria-label": title, "aria-modal": "false", tabindex: "-1" },
      [el("div", { class: "rt-assist-head" }, [el("span", { class: "rt-assist-title" }, title), closeBtn]), body],
    );
    document.body.appendChild(card);
    card.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    return body;
  }

  /* Put the final content in the body and let a screen reader announce it
     (aria-live) now that it's no longer "busy". */
  const fill = (body, ...kids) => {
    body.replaceChildren(...kids);
    body.setAttribute("aria-busy", "false");
  };

  function working(body, label) {
    body.setAttribute("aria-busy", "true");
    body.replaceChildren(...workingNodes(label, close));
    return {
      /* Simplify only ever runs on-device (Rewriter / Prompt API, whichever
         is already ready) — never a multi-second download, so there's no
         percentage to show. */
      progress() {},
    };
  }

  async function fail(body, message, retry) {
    // Worth a retry even when the cause is "no on-device model ready" —
    // that can change moment to moment as Chrome's own state does — as well
    // as an actual transient failure of a ready model.
    fill(body, ...failNodes(message, retry));
  }

  function actions(getText, signal, range) {
    const row = el("div", { class: "rt-assist-actions" });

    const copy = el("button", { type: "button", class: "rt-assist-btn" }, "Copy");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(getText());
        copy.textContent = "Copied";
        setTimeout(() => (copy.textContent = "Copy"), 1500);
      } catch {
        onError("Couldn't copy to the clipboard.");
      }
    });
    row.append(copy);

    if (typeof speak === "function") {
      const hear = el("button", { type: "button", class: "rt-assist-btn" }, "Hear it");
      hear.addEventListener("click", async () => {
        hear.disabled = true;
        const was = hear.textContent;
        hear.textContent = "…";
        try {
          /* Pass the card's signal so closing the card stops the read — a
             full-summary read can run a minute. */
          await speak(getText(), signal);
        } catch (err) {
          if (!(signal && signal.aborted)) onError((err && err.message) || "The voice couldn't read that.");
        } finally {
          hear.textContent = was;
          hear.disabled = false;
        }
      });
      row.append(hear);
    }

    // Only offered when the caller wired it up AND we still hold the exact
    // Range the reader selected — a Range is a live DOM reference, not a
    // snapshot, so this keeps working even if the reader scrolled or kept
    // reading while the request was in flight, as long as those nodes are
    // still in the document.
    if (typeof onSaveAsHighlight === "function" && range) {
      const save = el("button", { type: "button", class: "rt-assist-btn" }, "Save as highlight");
      save.addEventListener("click", () => {
        const created = onSaveAsHighlight(range, getText());
        save.disabled = true;
        save.textContent = created ? "Saved" : "Couldn't save";
        if (!created) onError("Couldn't turn that selection into a highlight — try selecting it again.");
      });
      row.append(save);
    }
    return row;
  }

  async function simplifySelection(passageArg, rangeArg) {
    const passage = String(passageArg || getSelectionText() || "").trim();
    if (!passage) {
      onError("Select a sentence or paragraph first, then choose Simplify.");
      return;
    }
    const body = frame("In plainer words");
    const w = working(body, "Rewriting the passage…");
    const signal = controller.signal;
    try {
      const { text } = await assistant.simplify(passage, { signal, onProgress: (p) => w.progress(p) });
      if (signal.aborted) return;
      fill(
        body,
        el("div", { class: "rt-assist-pair" }, [
          el("div", { class: "rt-assist-col" }, [el("h4", {}, "Original"), el("p", { class: "rt-assist-orig" }, passage)]),
          el("div", { class: "rt-assist-col" }, [el("h4", {}, "In plainer words"), resultBlock(text)]),
        ]),
        disclaimer(),
        actions(() => text, signal, rangeArg),
      );
    } catch (err) {
      if (!signal.aborted) await fail(body, (err && err.message) || "That passage couldn't be rewritten.", () => simplifySelection(passage, rangeArg));
    }
  }

  /** Define a selected word or short phrase as it's used in its sentence.
      `contextArg` is whatever surrounding text mountSelectionTrigger could
      find (see contextForRange) — optional, since a reader can select a word
      with nothing useful around it (a caption, a bare list item). */
  async function defineSelection(wordArg, contextArg, rangeArg) {
    const word = String(wordArg || getSelectionText() || "").trim();
    if (!word) {
      onError("Select a word first, then choose Define.");
      return;
    }
    const body = frame("Define");
    const w = working(body, "Looking up the word…");
    const signal = controller.signal;
    try {
      const { text } = await assistant.define(word, contextArg || "", { signal, onProgress: (p) => w.progress(p) });
      if (signal.aborted) return;
      fill(
        body,
        el("div", { class: "rt-assist-col" }, [el("h4", {}, word), resultBlock(text)]),
        disclaimer(),
        actions(() => text, signal, rangeArg),
      );
    } catch (err) {
      if (!signal.aborted) await fail(body, (err && err.message) || "That word couldn't be defined.", () => defineSelection(word, contextArg, rangeArg));
    }
  }

  /** Explain a selected passage — figurative language, tone, or theme, or
      the main idea when nothing figurative is there. */
  async function explainSelection(passageArg, rangeArg) {
    const passage = String(passageArg || getSelectionText() || "").trim();
    if (!passage) {
      onError("Select a sentence or paragraph first, then choose Explain.");
      return;
    }
    const body = frame("What this means");
    const w = working(body, "Reading the passage…");
    const signal = controller.signal;
    try {
      const { text } = await assistant.explain(passage, { signal, onProgress: (p) => w.progress(p) });
      if (signal.aborted) return;
      fill(
        body,
        el("div", { class: "rt-assist-pair" }, [
          el("div", { class: "rt-assist-col" }, [el("h4", {}, "Passage"), el("p", { class: "rt-assist-orig" }, passage)]),
          el("div", { class: "rt-assist-col" }, [el("h4", {}, "What it means"), resultBlock(text)]),
        ]),
        disclaimer(),
        actions(() => text, signal, rangeArg),
      );
    } catch (err) {
      if (!signal.aborted) await fail(body, (err && err.message) || "That passage couldn't be explained.", () => explainSelection(passage, rangeArg));
    }
  }

  /* A small pill row that surfaces over a selection inside the reading flow —
     the natural place to ask for AI help is right where you selected the
     text. Which pills show depends on the selection's shape: a short word or
     phrase gets Define; a longer passage gets Simplify and Explain together.
     Returns a teardown. */
  function mountSelectionTrigger(getFlowEl) {
    let row = null;
    const hide = () => {
      if (row) row.remove();
      row = null;
    };
    const pillsFor = (text, range, context) => {
      const clicked = (fn, ...args) => () => {
        hide();
        fn(...args, range);
      };
      if (isWordLike(text)) {
        const define = el("button", { type: "button", class: "rt-assist-pill" }, "Define");
        define.addEventListener("click", clicked(defineSelection, text, context));
        return [define];
      }
      const simplify = el("button", { type: "button", class: "rt-assist-pill" }, "Simplify");
      simplify.addEventListener("click", clicked(simplifySelection, text));
      const explain = el("button", { type: "button", class: "rt-assist-pill" }, "Explain");
      explain.addEventListener("click", clicked(explainSelection, text));
      return [simplify, explain];
    };
    const show = (rect, text, range) => {
      hide();
      row = el("div", { class: "rt-assist-pill-row" }, pillsFor(text, range, contextForRange(range)));
      row.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
      document.body.appendChild(row);
      const box = row.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - box.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
      let top = rect.top - box.height - 8;
      if (top < 8) top = rect.bottom + 8;
      row.style.left = `${Math.round(left)}px`;
      row.style.top = `${Math.round(top)}px`;
    };
    const sync = () => {
      const sel = window.getSelection();
      const flow = typeof getFlowEl === "function" ? getFlowEl() : null;
      const liveRange = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      const text = liveRange ? String(liveRange.toString() || "").trim() : "";
      const inFlow = liveRange && flow && flow.contains(liveRange.commonAncestorContainer);
      const eligible = isWordLike(text) || text.length >= 12;
      // card open, nothing selected, selection outside the flow, or neither
      // shape a pill wants
      if (card || !sel || sel.isCollapsed || !inFlow || !eligible) {
        hide();
        return;
      }
      const rect = liveRange.getBoundingClientRect();
      if (!rect.width && !rect.height) { hide(); return; }
      // A Range is a live DOM reference, not a snapshot — cloneRange() so
      // clicking a pill and later "Save as highlight" still target this
      // exact selection even if the reader's live selection changes (or
      // collapses) while the request is in flight.
      show(rect, text, liveRange.cloneRange());
    };
    let debounce = 0;
    const onSelectionChange = () => {
      clearTimeout(debounce);
      debounce = setTimeout(sync, 180);
    };
    const onDown = (e) => {
      if (row && !row.contains(e.target)) hide();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      clearTimeout(debounce);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }

  return {
    simplifySelection,
    defineSelection,
    explainSelection,
    mountSelectionTrigger,
    isOpen: () => !!card,
    destroy: close,
  };
}
