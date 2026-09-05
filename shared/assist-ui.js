/*
 * ReadTune — reading-assistant UI: Simplify
 *
 * A dismissible card for a plain-language rewrite of the passage you
 * selected, shown next to the original, never replacing it. (Summary lives
 * in its own docked sidebar now — see assist-sidebar.js — since it's the
 * headline AI feature and reads better as a persistent panel than a modal.)
 *
 * The card always carries an "AI — may not be exact" line. The rewrite is an
 * aid, not a substitute for the words on the page, and a reader who leans on it
 * cannot easily check it against the source — so the original stays visible and
 * the label stays honest.
 */

import { el, resultBlock, disclaimer, workingNodes, failNodes } from "./assist-render.js";

/**
 * @param {object} opts
 * @param {ReturnType<import("./assist.js").createAssistant>} opts.assistant
 * @param {() => string}       opts.getSelectionText  the reader's current selection
 * @param {(t:string)=>Promise<any>} [opts.speak]     optional "hear it" for the result
 * @param {(m:string)=>void}   [opts.onError]
 */
export function createAssistUi({ assistant, getSelectionText = () => "", speak, onError = () => {} } = {}) {
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

  function actions(getText, signal) {
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
    return row;
  }

  async function simplifySelection(passageArg) {
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
        actions(() => text, signal),
      );
    } catch (err) {
      if (!signal.aborted) await fail(body, (err && err.message) || "That passage couldn't be rewritten.", () => simplifySelection(passage));
    }
  }

  /* A "Simplify" pill that surfaces over a selection inside the reading flow —
     the natural place to ask for a rewrite is right where you selected the
     text. Returns a teardown. */
  function mountSelectionTrigger(getFlowEl) {
    let pill = null;
    const hide = () => {
      if (pill) pill.remove();
      pill = null;
    };
    const show = (rect) => {
      if (!pill) {
        pill = el("button", { type: "button", class: "rt-assist-pill" }, "Simplify");
        pill.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
        pill.addEventListener("click", () => {
          hide();
          simplifySelection();
        });
        document.body.appendChild(pill);
      }
      const box = pill.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - box.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
      let top = rect.top - box.height - 8;
      if (top < 8) top = rect.bottom + 8;
      pill.style.left = `${Math.round(left)}px`;
      pill.style.top = `${Math.round(top)}px`;
    };
    const sync = () => {
      const sel = window.getSelection();
      const flow = typeof getFlowEl === "function" ? getFlowEl() : null;
      const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      const text = range ? String(range.toString() || "").trim() : "";
      const inFlow = range && flow && flow.contains(range.commonAncestorContainer);
      // card open, nothing selected, selection outside the flow, or too short
      if (card || !sel || sel.isCollapsed || !inFlow || text.length < 12) {
        hide();
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) hide();
      else show(rect);
    };
    let debounce = 0;
    const onSelectionChange = () => {
      clearTimeout(debounce);
      debounce = setTimeout(sync, 180);
    };
    const onDown = (e) => {
      if (pill && !pill.contains(e.target)) hide();
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
    mountSelectionTrigger,
    isOpen: () => !!card,
    destroy: close,
  };
}
