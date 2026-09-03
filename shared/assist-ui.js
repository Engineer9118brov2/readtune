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
 * @param {(key:string)=>Promise<boolean>} [opts.onSaveKey]  persist a BYOK key
 * @param {(m:string)=>void}   [opts.onError]
 */
export function createAssistUi({ assistant, getSelectionText = () => "", speak, onSaveKey, onError = () => {} } = {}) {
  let card = null;
  let controller = null;

  const stop = () => {
    if (controller) {
      try { controller.abort(); } catch {}
      controller = null;
    }
  };
  const close = () => {
    stop();
    if (card) card.remove();
    card = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onDown, true);
  };

  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  };
  const onDown = (e) => {
    if (card && !card.contains(e.target)) close();
  };

  function frame(title) {
    close();
    controller = new AbortController();

    const closeBtn = el("button", { type: "button", class: "rt-assist-x", "aria-label": "Close" }, "×");
    closeBtn.addEventListener("click", close);

    const body = el("div", { class: "rt-assist-body" });
    card = el(
      "div",
      { class: "rt-assist-card", role: "dialog", "aria-label": title, "aria-modal": "false" },
      [el("div", { class: "rt-assist-head" }, [el("span", { class: "rt-assist-title" }, title), closeBtn]), body],
    );
    document.body.appendChild(card);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    return body;
  }

  function working(body, label) {
    const note = el("p", { class: "rt-assist-working" }, label);
    const cancel = el("button", { type: "button", class: "rt-assist-cancel" }, "Cancel");
    cancel.addEventListener("click", close);
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

    /* If the reason is "nothing to run on", offer the way out right here — a
       free Gemini key — rather than sending the reader off to find a settings
       page. On-device AI, where the browser has it, needs no key and never
       shows this. */
    let where = { mode: "none" };
    try { where = await assistant.describe(); } catch {}
    if (where.mode === "none" && typeof onSaveKey === "function") {
      const input = el("input", {
        type: "password",
        class: "rt-assist-key",
        placeholder: "Google AI Studio (Gemini) key",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": "Gemini API key",
      });
      const save = el("button", { type: "button", class: "rt-assist-btn" }, "Save & retry");
      save.addEventListener("click", async () => {
        const v = input.value.trim();
        if (!v) return;
        save.disabled = true;
        save.textContent = "Checking…";
        const ok = await onSaveKey(v);
        if (!ok) {
          save.disabled = false;
          save.textContent = "Save & retry";
          input.value = "";
          return;
        }
        if (typeof retry === "function") retry();
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && save.click());
      parts.push(
        el("p", { class: "rt-assist-sub" }, "Get a free key at aistudio.google.com/apikey — it stays in this browser and is sent only to Google."),
        el("div", { class: "rt-assist-actions" }, [input, save]),
      );
    } else if (typeof retry === "function") {
      /* An engine is set up — this was a transient failure (a network blip, a
         model that was busy). One button to run it again. */
      const again = el("button", { type: "button", class: "rt-assist-btn" }, "Try again");
      again.addEventListener("click", () => retry());
      parts.push(el("div", { class: "rt-assist-actions" }, [again]));
    }
    body.replaceChildren(...parts);
  }

  function resultBlock(text) {
    const box = el("div", { class: "rt-assist-result" });
    for (const line of String(text).split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
      box.append(el("p", {}, line.replace(/^[-•*]\s*/, "• ")));
    }
    return box;
  }

  function actions(getText) {
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
          await speak(getText());
        } catch (err) {
          onError((err && err.message) || "The voice couldn't read that.");
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

  async function openSummary() {
    const body = frame("What this is about");
    const w = working(body, "Reading the article…");
    const signal = controller.signal;
    try {
      const { text, clipped } = await assistant.summarize({ signal, onProgress: (p) => w.progress(p) });
      if (signal.aborted) return;
      body.replaceChildren(
        clipped ? el("p", { class: "rt-assist-sub" }, "From the start of a long article.") : document.createComment(""),
        resultBlock(text),
        disclaimer(),
        actions(() => text),
      );
    } catch (err) {
      if (!signal.aborted) await fail(body, (err && err.message) || "The summary couldn't be generated.", openSummary);
    }
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
      body.replaceChildren(
        el("div", { class: "rt-assist-pair" }, [
          el("div", { class: "rt-assist-col" }, [el("h4", {}, "Original"), el("p", { class: "rt-assist-orig" }, passage)]),
          el("div", { class: "rt-assist-col" }, [el("h4", {}, "In plainer words"), resultBlock(text)]),
        ]),
        disclaimer(),
        actions(() => text),
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
      if (card) return hide(); // the card is already open
      const flow = typeof getFlowEl === "function" ? getFlowEl() : null;
      const sel = window.getSelection();
      if (!flow || !sel || sel.isCollapsed || !sel.rangeCount) return hide();
      const range = sel.getRangeAt(0);
      if (!flow.contains(range.commonAncestorContainer)) return hide();
      const text = String(range.toString() || "").trim();
      if (text.length < 12) return hide(); // not worth it for a word or two
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return hide();
      show(rect);
    };
    const onSelectionChange = () => {
      clearTimeout(sync._t);
      sync._t = setTimeout(sync, 180);
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
      clearTimeout(sync._t);
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
