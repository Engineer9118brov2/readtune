/*
 * ReadTune — reading-assistant UI
 *
 * One dismissible card for both jobs:
 *   • Summary   — key points for the article, before you commit to it
 *   • Simplify  — a plain-language rewrite of the passage you selected, shown
 *                 next to the original, never replacing it
 *
 * The card always carries an "AI — may not be exact" line. The rewrite is an
 * aid, not a substitute for the words on the page, and a reader who leans on it
 * cannot easily check it against the source — so the original stays visible and
 * the label stays honest.
 */

function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const c of kids == null ? [] : Array.isArray(kids) ? kids : [kids]) {
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

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
    const note = el("p", { class: "rt-assist-working" }, label);
    const cancel = el("button", { type: "button", class: "rt-assist-cancel" }, "Cancel");
    cancel.addEventListener("click", close);
    body.setAttribute("aria-busy", "true");
    body.replaceChildren(note, cancel);
    return {
      progress({ loaded, total }) {
        note.textContent = total
          ? `Setting up on-device AI — ${Math.round((loaded / total) * 100)}%. One time.`
          : "Setting up on-device AI. One time — this can take a minute.";
      },
    };
  }

  async function fail(body, message, retry) {
    const parts = [el("p", { class: "rt-assist-error" }, message || "That didn't work.")];

    /* "Nothing to run on" means this browser has no on-device AI at all —
       that's not a transient failure, so there's no "try again" here, just an
       honest note. Everything else (a network blip, a model that was busy) is
       worth one retry button. */
    let where = { mode: "none" };
    try { where = await assistant.describe(); } catch {}
    if (where.mode === "none") {
      parts.push(el("p", { class: "rt-assist-sub" }, "The rest of ReadTune works the same either way — this is just the optional AI part."));
    } else if (typeof retry === "function") {
      const again = el("button", { type: "button", class: "rt-assist-btn" }, "Try again");
      again.addEventListener("click", () => retry());
      parts.push(el("div", { class: "rt-assist-actions" }, [again]));
    }
    fill(body, ...parts);
  }

  function resultBlock(text) {
    const box = el("div", { class: "rt-assist-result" });
    for (const line of String(text).split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
      box.append(el("p", {}, line.replace(/^[-•*]\s*/, "• ")));
    }
    return box;
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

  const disclaimer = () =>
    el("p", { class: "rt-assist-note" }, "AI — may not be exact. Check anything that matters against the original.");

  /* Chrome's on-device model is a one-time ~2 GB download — kept by Chrome and
     shared across every site, but it uses storage on THIS device only; it
     isn't synced to a reader's other devices. Worth asking before it starts,
     not just showing a progress bar mid-download. Already downloading,
     already available, or not offered at all: nothing new to ask, so this
     runs `go` straight away in all of those cases. Clicking "Not now" closes
     the card without starting anything or leaving a preference behind — the
     next Summary/Simplify simply asks again. */
  async function withDownloadConsent(body, go) {
    working(body, "Checking on-device AI…"); // avoids a blank card while describe() resolves
    let where = null;
    try {
      where = await assistant.describe();
    } catch {
      /* describe() itself failed — fall through and let `go` surface the real error */
    }
    if (!where || where.state !== "downloadable") {
      await go();
      return;
    }
    const note = el(
      "p",
      { class: "rt-assist-sub" },
      "This needs a one-time download — about 2 GB, kept by Chrome and shared with every site you use it on. It uses storage on this device only, and isn't sent anywhere.",
    );
    const yes = el("button", { type: "button", class: "rt-assist-btn" }, "Set it up");
    const not = el("button", { type: "button", class: "rt-assist-btn" }, "Not now");
    yes.addEventListener("click", () => go());
    not.addEventListener("click", () => close());
    fill(body, note, el("div", { class: "rt-assist-actions" }, [yes, not]));
  }

  async function openSummary() {
    const body = frame("What this is about");
    const signal = controller.signal;
    await withDownloadConsent(body, async () => {
      const w = working(body, "Reading the article…");
      try {
        const { text, clipped } = await assistant.summarize({ signal, onProgress: (p) => w.progress(p) });
        if (signal.aborted) return;
        const kids = [];
        if (clipped) kids.push(el("p", { class: "rt-assist-sub" }, "From the start of a long article."));
        kids.push(resultBlock(text), disclaimer(), actions(() => text, signal));
        fill(body, ...kids);
      } catch (err) {
        if (!signal.aborted) await fail(body, (err && err.message) || "The summary couldn't be generated.", openSummary);
      }
    });
  }

  async function simplifySelection(passageArg) {
    const passage = String(passageArg || getSelectionText() || "").trim();
    if (!passage) {
      onError("Select a sentence or paragraph first, then choose Simplify.");
      return;
    }
    const body = frame("In plainer words");
    const signal = controller.signal;
    await withDownloadConsent(body, async () => {
      const w = working(body, "Rewriting the passage…");
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
    });
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
    openSummary,
    simplifySelection,
    mountSelectionTrigger,
    isOpen: () => !!card,
    destroy: close,
  };
}
