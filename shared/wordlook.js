/*
 * ReadTune — word lookup
 *
 * Double-click any word in the reader and get the two things that actually
 * help when a word won't decode: where it breaks into syllables, and what it
 * sounds like. Both come from what the extension already ships — the bundled
 * hyphenation patterns and the on-device Piper voice — so this works offline
 * and sends nothing anywhere.
 *
 * Deliberately not a dictionary. A definition needs a 10MB corpus and answers
 * a different question ("what does it mean") than the one a reader stuck on a
 * long word is asking ("how do I say it").
 */

import { syllabify } from "./syllables.js";

const WORD_RE = /[\p{L}\p{M}'’-]+/u;

/** The word under a click, from the browser's own selection.
 *
 * Read through the Range, not Selection.toString(): the latter reports the
 * *rendered* selection and comes back empty in cases the range handles fine —
 * it returned "" for a live selection whose range read "Calabasas". */
export function wordAtSelection(sel) {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return "";
  const range = sel.getRangeAt(0);

  /* With "Show syllable breaks" on, a word is rendered as text nodes with
     literal "·" spans between them. Double-clicking then selects one syllable,
     or a string the word regex truncates at the first dot — either way the
     lookup and Hear it would act on a fragment. Rebuild from the wrapper. */
  const node = range.startContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const wrap = el && typeof el.closest === "function" ? el.closest(".rt-syl-wrap") : null;
  if (wrap) {
    const whole = Array.from(wrap.childNodes)
      .filter((n) => !(n.nodeType === Node.ELEMENT_NODE && n.classList.contains("rt-syl")))
      .map((n) => n.textContent)
      .join("");
    const w = whole.match(WORD_RE);
    if (w) return w[0];
  }

  const raw = String(range.toString() || sel.toString() || "").trim();
  const m = raw.match(WORD_RE);
  return m ? m[0] : "";
}

/** "unbelievable" → ["un","be","lie","va","ble"] — never an empty split. */
export function syllablesOf(word) {
  const bare = String(word || "").replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  if (!bare) return [];
  const parts = syllabify(bare);
  return parts.length ? parts : [bare];
}

export function createWordLookup({ getFlow, speak, onError = () => {} } = {}) {
  let pop = null;

  const close = () => {
    if (pop) pop.remove();
    pop = null;
  };

  function open(word, rect) {
    close();
    const parts = syllablesOf(word);

    pop = document.createElement("div");
    pop.className = "rt-wordlook";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", `About the word ${word}`);

    const head = document.createElement("div");
    head.className = "rt-wordlook-word";
    head.textContent = word;

    const syl = document.createElement("div");
    syl.className = "rt-wordlook-syllables";
    parts.forEach((part, n) => {
      if (n) {
        const dot = document.createElement("span");
        dot.className = "rt-wordlook-dot";
        dot.setAttribute("aria-hidden", "true");
        dot.textContent = "·";
        syl.append(dot);
      }
      const chip = document.createElement("span");
      chip.className = "rt-wordlook-syllable";
      chip.textContent = part;
      syl.append(chip);
    });
    /* Screen readers should hear the word, not the pieces spelled out. */
    syl.setAttribute("aria-label", `${parts.length} syllable${parts.length === 1 ? "" : "s"}`);

    const hear = document.createElement("button");
    hear.type = "button";
    hear.className = "rt-wordlook-hear";
    hear.textContent = "Hear it";
    hear.addEventListener("click", async () => {
      if (typeof speak !== "function") return;
      hear.disabled = true;
      hear.textContent = "…";
      try {
        await speak(word);
        hear.textContent = "Hear it";
      } catch (err) {
        hear.textContent = "Hear it";
        onError((err && err.message) || "The voice couldn't say that word.");
      } finally {
        hear.disabled = false;
      }
    });

    const shut = document.createElement("button");
    shut.type = "button";
    shut.className = "rt-wordlook-close";
    shut.setAttribute("aria-label", "Close");
    shut.textContent = "×";
    shut.addEventListener("click", close);

    pop.append(head, syl, hear, shut);
    document.body.appendChild(pop);

    /* Sit under the word, nudged back inside the viewport rather than off it. */
    const margin = 8;
    const place = () => {
      const box = pop.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - box.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
      /* Below the word by default; above it when there isn't room, and pinned
         inside the viewport if it fits in neither. */
      let top = rect.bottom + margin;
      if (top + box.height > window.innerHeight - margin) {
        const above = rect.top - box.height - margin;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - box.height - margin);
      }
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
    };
    place();
    /* Fonts and the syllable chips can change the width after the first
       measure, so correct once the layout has settled. */
    requestAnimationFrame(place);
    hear.focus();
  }

  const onDblClick = (e) => {
    const flow = typeof getFlow === "function" ? getFlow() : null;
    if (!flow || !flow.contains(e.target)) return;
    const sel = window.getSelection();
    const word = wordAtSelection(sel);
    if (!word) return close();
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    const rect = range ? range.getBoundingClientRect() : null;
    if (!rect || (!rect.width && !rect.height)) return close();
    open(word, rect);
  };

  const onKey = (e) => {
    if (e.key === "Escape") return close();
    /* The reading screen binds Space at the document level to step the
       sentence / toggle RSVP and calls preventDefault(). With focus inside the
       popup, Space has to activate the button in front of the reader. */
    if (pop && pop.contains(e.target) && (e.key === " " || e.key === "Enter")) e.stopPropagation();
  };
  const onDown = (e) => {
    if (pop && !pop.contains(e.target)) close();
  };

  document.addEventListener("dblclick", onDblClick);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("mousedown", onDown);

  return {
    close,
    isOpen: () => !!pop,
    destroy() {
      close();
      document.removeEventListener("dblclick", onDblClick);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    },
  };
}
