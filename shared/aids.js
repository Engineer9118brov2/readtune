/*
 * ReadTune — reading environment aids
 *
 * Things that watch scroll / pointer / selection rather than transform the text:
 * the top progress bar, the reading ruler, paragraph focus dimming, resume
 * position, and persistent highlights. Attaches to the flow reading view.
 */

import { measuredLineHeight, adaptiveRulerHeight, normalizeRulerLines } from "./ruler.js";

export function createReadingAids({ getFlow, onSaveScroll, onSaveHighlights, onHighlightsChanged }) {
  const progress = document.createElement("div");
  progress.className = "rt-progress";
  progress.hidden = true;

  const ruler = document.createElement("div");
  ruler.className = "rt-ruler";
  ruler.hidden = true;

  const hlButton = document.createElement("button");
  hlButton.type = "button";
  hlButton.className = "rt-btn rt-primary rt-hl-trigger";
  hlButton.textContent = "Highlight";
  Object.assign(hlButton.style, {
    position: "fixed",
    zIndex: "34",
    width: "auto",
    padding: "6px 12px",
    fontSize: "0.82rem",
    display: "none",
  });

  document.body.append(progress, ruler, hlButton);

  let profile = {};
  let rulerY = window.innerHeight * 0.4;
  let rulerTarget = null;
  let saveTimer = 0;
  let highlights = [];
  let savedRange = null;

  /* ---- scroll: progress + resume + paragraph focus ---- */
  function onScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const frac = max > 0 ? doc.scrollTop / max : 0;
    if (!progress.hidden) progress.style.width = `${Math.min(100, Math.max(0, frac * 100))}%`;
    if (!ruler.hidden && rulerTarget) positionRuler();

    if (profile.focus === "paragraph") updateFocusParagraph();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => onSaveScroll && onSaveScroll(Math.round(doc.scrollTop)), 400);
  }

  function updateFocusParagraph() {
    const flow = getFlow();
    if (!flow) return;
    const vh = window.innerHeight;
    const mid = vh / 2;
    let best = null;
    let bestDist = Infinity;
    for (const el of flow.children) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || (!r.width && !r.height)) {
        el.classList.remove("rt-focus-active");
        continue;
      }
      /* Score by the *visible* slice's centre, not the whole element's —
         a block taller than the viewport (a long list, an infobox, a big
         table) has its geometric centre far off-screen, so this used to
         hand focus to whichever block's full-height centre happened to be
         numerically nearest `mid`, not whichever block actually filled the
         middle of the screen. That flickered between neighbours while
         scrolling through a tall block, and could leave nothing clearly
         "the" focused paragraph even though one plainly filled the view. */
      const visTop = Math.max(0, r.top);
      const visBottom = Math.min(vh, r.bottom);
      const d = Math.abs((visTop + visBottom) / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    }
    for (const el of flow.children) el.classList.toggle("rt-focus-active", el === best);
  }

  /* ---- pointer: ruler ---- */
  function onPointerMove(e) {
    if (rulerTarget) return;
    rulerY = e.clientY;
    if (!ruler.hidden) positionRuler();
  }
  function positionRuler() {
    const { target, lineHeightPx, height, lineCount } = currentRulerMetrics();
    ruler.style.height = `${height}px`;
    if (rulerTarget && target === rulerTarget && target.getBoundingClientRect) {
      const rect = target.getBoundingClientRect();
      const anchorHeight = Math.min(lineHeightPx * lineCount, Math.max(lineHeightPx, rect.height || lineHeightPx));
      const top = rect.top - Math.max(0, (height - anchorHeight) / 2);
      ruler.style.top = `${Math.max(0, Math.min(window.innerHeight - height, top))}px`;
      return;
    }
    ruler.style.top = `${Math.max(0, rulerY - height / 2)}px`;
  }

  function currentRulerMetrics() {
    const flow = getFlow();
    const fallback = (Number(profile.fontSize) || 19) * (Number(profile.lineHeight) || 1.6);
    let target = rulerTarget;
    if (target && (!target.isConnected || (flow && !flow.contains(target)))) {
      target = null;
      rulerTarget = null;
    }
    if (!target) {
      const flowRect = flow && flow.getBoundingClientRect ? flow.getBoundingClientRect() : null;
      const probeX = flowRect
        ? Math.max(12, Math.min(window.innerWidth - 12, flowRect.left + Math.min(flowRect.width / 2, 120)))
        : Math.max(12, Math.min(window.innerWidth - 12, window.innerWidth / 2));
      target = document.elementFromPoint(probeX, Math.max(8, Math.min(window.innerHeight - 8, rulerY)));
      if (!flow || !target || !flow.contains(target)) target = flow || document.body;
    } else {
      rulerTarget = target;
    }
    const style = target ? getComputedStyle(target) : null;
    const lineHeightPx = measuredLineHeight(style, fallback);
    const lineCount = normalizeRulerLines(profile.rulerLines);
    return {
      target,
      lineHeightPx,
      lineCount,
      height: adaptiveRulerHeight({
        lineHeightPx,
        fontSizePx: style ? parseFloat(style.fontSize) || Number(profile.fontSize) || 19 : Number(profile.fontSize) || 19,
        baseHeight: Number(profile.rulerHeight) || 40,
        lines: lineCount,
      }),
    };
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  /* ---- highlights ---- */
  function currentSelectionRange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const flow = getFlow();
    if (!flow || !flow.contains(range.commonAncestorContainer)) return null;
    if (!range.toString().trim()) return null;
    return range;
  }

  function onSelectionChange() {
    const range = currentSelectionRange();
    if (!range) {
      hlButton.style.display = "none";
      savedRange = null;
      return;
    }
    savedRange = range.cloneRange();
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    if (!last) return;
    hlButton.style.display = "block";
    hlButton.style.left = `${Math.min(window.innerWidth - 110, last.right)}px`;
    hlButton.style.top = `${Math.max(8, last.bottom + 6)}px`;
  }
  document.addEventListener("selectionchange", onSelectionChange);

  function onPopoverKeydown(e) {
    if (e.key === "Escape" && popover && !popover.hidden) closePopover();
  }
  function onPopoverOutsideClick(e) {
    if (popover && !popover.hidden && !popover.contains(e.target) && !e.target.closest(".rt-hl")) closePopover();
  }
  document.addEventListener("keydown", onPopoverKeydown);
  document.addEventListener("mousedown", onPopoverOutsideClick, true);

  /** Wraps a live Range as a highlight and registers it — the one real path
      any highlight is created through, whether the reader drew the selection
      themselves (the Highlight button below) or an AI tool (Define/Explain's
      "Save as highlight") handed back a range it already had in hand.
      Returns the new highlight record, or null if the range had nothing
      wrappable (empty/collapsed selection). */
  function createHighlightFromRange(range, note = "") {
    if (!range) return null;
    const text = range.toString().replace(/\s+/g, " ").trim();
    if (!text) return null;
    const flow = getFlow();
    /* wrapRange wraps every text node the range touches in a fresh <mark>,
       even one that's already inside an existing rt-hl mark — surroundContents
       doesn't reject that, it just nests marks. A repeated "Save as highlight"
       click, or two auto-annotate quotes that land on the same sentence,
       produced a visibly doubled underline/dot decoration this way (the CSS
       reads through both marks).
       Don't just refuse, though — Define/Explain's "Save as highlight" runs
       on text the reader may well have already highlighted, and a flat
       refusal there discards a note the reader can never get back (repeating
       the same selection just fails again). Fold the new note into whichever
       existing highlight(s) the range overlaps instead of nesting a mark. */
    if (flow) {
      const overlapping = [...flow.querySelectorAll(".rt-hl")]
        .filter((mark) => range.intersectsNode(mark))
        .map((mark) => highlights.find((x) => x.id === mark.dataset.hlId))
        .filter(Boolean);
      if (overlapping.length) {
        const target = overlapping[0];
        const addition = String(note || "").trim();
        if (addition && !target.note.includes(addition)) {
          target.note = `${target.note ? target.note + "\n\n" : ""}${addition}`.trim().slice(0, 500);
          for (const mark of flow.querySelectorAll(`.rt-hl[data-hl-id="${cssEscape(target.id)}"]`)) {
            mark.classList.add("rt-hl-noted");
          }
          persistHighlights();
        }
        return target;
      }
    }
    const before = contextBefore(flow, range, 24);
    const id = newHighlightId();
    const marks = wrapRange(range, "rt-hl");
    if (!marks.length) return null;
    // Push before wiring: wireHighlightMark looks the highlight up by id to
    // decide whether to show the "noted" indicator, so the record must exist
    // first — otherwise a highlight created with a note (the AI-tools path)
    // renders without its indicator until the next re-render.
    const h = { id, text, before, note: String(note || "").trim().slice(0, 500) };
    highlights.push(h);
    marks.forEach((m) => wireHighlightMark(m, id));
    persistHighlights();
    return h;
  }

  hlButton.addEventListener("mousedown", (e) => e.preventDefault());
  hlButton.addEventListener("click", () => {
    if (!savedRange) return;
    createHighlightFromRange(savedRange);
    window.getSelection().removeAllRanges();
    hlButton.style.display = "none";
    savedRange = null;
  });

  let idCounter = 0;
  function newHighlightId() {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch {
      /* fall through */
    }
    return `hl-${Date.now()}-${idCounter++}`;
  }

  /* ---- note popover: click any highlight to add a note or remove it ----
     A highlight is annotation, not just marking — a reader studying from an
     article needs to say *why* a passage mattered, not only that it did. */
  let popover = null;
  let popoverId = null;
  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement("div");
    popover.className = "rt-hl-note";
    popover.hidden = true;
    const textarea = document.createElement("textarea");
    textarea.className = "rt-hl-note-input";
    textarea.placeholder = "Add a note (optional)…";
    textarea.rows = 3;
    const row = document.createElement("div");
    row.className = "rt-hl-note-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "rt-btn rt-primary";
    save.textContent = "Save";
    save.addEventListener("click", () => {
      const h = highlights.find((x) => x.id === popoverId);
      if (h) {
        h.note = textarea.value.trim().slice(0, 500);
        persistHighlights();
        syncNoteIndicators(popoverId, !!h.note);
      }
      closePopover();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "rt-btn rt-hl-note-remove";
    remove.textContent = "Remove highlight";
    remove.addEventListener("click", () => {
      removeHighlight(popoverId);
      closePopover();
    });
    row.append(save, remove);
    popover.append(textarea, row);
    popover._textarea = textarea;
    document.body.append(popover);
    return popover;
  }

  function closePopover() {
    if (popover) popover.hidden = true;
    popoverId = null;
  }

  function openPopoverFor(id, anchorRect) {
    const p = ensurePopover();
    const h = highlights.find((x) => x.id === id);
    if (!h) return;
    popoverId = id;
    p._textarea.value = h.note || "";
    p.hidden = false;
    const top = Math.min(window.innerHeight - 160, Math.max(8, anchorRect.bottom + 6));
    const left = Math.min(window.innerWidth - 280, Math.max(8, anchorRect.left));
    p.style.top = `${top}px`;
    p.style.left = `${left}px`;
    p._textarea.focus({ preventScroll: true });
  }

  function syncNoteIndicators(id, hasNote) {
    for (const mark of document.querySelectorAll(`mark.rt-hl[data-hl-id="${cssEscape(id)}"]`)) {
      mark.classList.toggle("rt-hl-noted", hasNote);
    }
  }

  function cssEscape(s) {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");
  }

  function removeHighlight(id) {
    for (const mark of document.querySelectorAll(`mark.rt-hl[data-hl-id="${cssEscape(id)}"]`)) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    }
    highlights = highlights.filter((h) => h.id !== id);
    persistHighlights();
  }

  function wireHighlightMark(mark, id) {
    mark.dataset.hlId = id;
    mark.classList.add("rt-hl");
    const h = highlights.find((x) => x.id === id);
    if (h && h.note) mark.classList.add("rt-hl-noted");
    mark.title = "Click to add a note or remove this highlight";
    mark.addEventListener("click", (e) => {
      e.stopPropagation();
      if (popoverId === id && popover && !popover.hidden) {
        closePopover();
        return;
      }
      openPopoverFor(id, mark.getBoundingClientRect());
    });
  }

  function persistHighlights() {
    onSaveHighlights && onSaveHighlights(highlights.slice(0, 200));
    onHighlightsChanged && onHighlightsChanged(highlights.slice());
  }

  function restoreHighlights(list) {
    highlights = (Array.isArray(list) ? list : []).map((h) => ({ note: "", ...h, id: h.id || newHighlightId() }));
    const flow = getFlow();
    if (!flow) return;
    /* A record saved before the overlap guard existed (or two records that
       happen to cover the same text) would otherwise nest a second <mark>
       on reload — restoreHighlights bypasses createHighlightFromRange and
       calls wrapRange directly, so it needs the same guard. Drop the record
       rather than silently nesting; persist so the stale duplicate doesn't
       keep coming back on every future load. */
    let dropped = false;
    highlights = highlights.filter((h) => {
      const range = rangeFromText(flow, h.text, h.before);
      if (!range) return true; // couldn't relocate it — leave restoreHighlights' own miss-handling alone
      if ([...flow.querySelectorAll(".rt-hl")].some((mark) => range.intersectsNode(mark))) {
        dropped = true;
        return false;
      }
      wrapRange(range, "rt-hl").forEach((m) => wireHighlightMark(m, h.id));
      return true;
    });
    if (dropped) persistHighlights();
    else onHighlightsChanged && onHighlightsChanged(highlights.slice());
  }

  /** Scrolls a highlight into view and gives it a brief attention flash — used
      by the Highlights list in the settings rail so "jump to" actually orients
      the reader, not just moves the scrollbar. */
  function scrollToHighlight(id) {
    const mark = document.querySelector(`mark.rt-hl[data-hl-id="${cssEscape(id)}"]`);
    if (!mark) return false;
    // A highlight inside a folded infobox or a folded long list (render.js)
    // sits in a closed <details> — open every ancestor or "jump to" lands on
    // nothing visible. Mirrors tts.js's read-aloud handling of the same case.
    for (let d = mark.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
    mark.scrollIntoView({ block: "center", behavior: "smooth" });
    mark.classList.add("rt-hl-flash");
    setTimeout(() => mark.classList.remove("rt-hl-flash"), 1200);
    return true;
  }

  /* ---- public ---- */
  function apply(next) {
    profile = next || {};
    // the ruler / focus dimming / scroll progress only make sense over flowing text
    const flowing = ["flow", "scroll", "aloud"].includes(profile.pacing || "flow");
    progress.hidden = !flowing;
    ruler.hidden = !flowing || profile.focus !== "ruler";
    if (ruler.hidden) rulerTarget = null;
    if (!ruler.hidden) positionRuler();
    const flow = getFlow();
    if (flowing && profile.focus === "paragraph") updateFocusParagraph();
    else if (flow) for (const el of flow.children) el.classList.remove("rt-focus-active");
    onScroll();
  }

  function trackRulerTo(target) {
    rulerTarget = target && target.isConnected ? target : null;
    if (!ruler.hidden) positionRuler();
  }

  function clearRulerTracking() {
    rulerTarget = null;
    if (!ruler.hidden) positionRuler();
  }

  function restoreScroll(y) {
    if (y && y > 40) window.scrollTo({ top: y, behavior: "instant" });
  }

  function destroy() {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("resize", onScroll);
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("keydown", onPopoverKeydown);
    document.removeEventListener("mousedown", onPopoverOutsideClick, true);
    progress.remove();
    ruler.remove();
    hlButton.remove();
    if (popover) popover.remove();
  }

  /** Wraps the first occurrence of `text` in the article as a highlight, for
      callers that only have quoted text (not a live Range) — the AI-annotate
      flow, which reads back a list of {quote, note} pairs from the model.
      Unlike addHighlightFromRange there's no "before" context to disambiguate
      repeats, so this always takes the first match; returns null (not a
      throw) when the quote isn't found verbatim, since a model can still
      paraphrase instead of copying exactly despite being told not to. */
  function addHighlightByText(text, note = "") {
    const flow = getFlow();
    if (!flow || !text) return null;
    const range = rangeFromText(flow, text, "");
    return createHighlightFromRange(range, note);
  }

  return {
    apply,
    restoreScroll,
    restoreHighlights,
    trackRulerTo,
    clearRulerTracking,
    destroy,
    listHighlights: () => highlights.slice(),
    scrollToHighlight,
    removeHighlight,
    addHighlightFromRange: createHighlightFromRange,
    addHighlightByText,
  };
}

/* ---------- range helpers ---------- */

function textNodesIn(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}

function wrapRange(range, className) {
  const marks = [];
  const nodes = textNodesIn(
    range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer
  ).filter((node) => range.intersectsNode(node));

  for (const node of nodes) {
    const r = document.createRange();
    r.selectNodeContents(node);
    if (node === range.startContainer) r.setStart(node, range.startOffset);
    if (node === range.endContainer) r.setEnd(node, range.endOffset);
    if (r.collapsed || !r.toString()) continue;
    const mark = document.createElement("mark");
    mark.className = className;
    try {
      r.surroundContents(mark);
      marks.push(mark);
    } catch {
      /* range crossed an element boundary awkwardly — skip this fragment */
    }
  }
  return marks;
}

function contextBefore(root, range, n) {
  try {
    const pre = document.createRange();
    pre.setStart(root, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().replace(/\s+/g, " ").trim().slice(-n);
  } catch {
    return "";
  }
}

function rangeFromText(root, needle, before) {
  if (!needle) return null;
  const full = textNodesIn(root);
  let combined = "";
  const map = []; // [{node, start}]
  for (const node of full) {
    map.push({ node, start: combined.length });
    combined += node.nodeValue;
  }
  const hay = combined.replace(/\s+/g, " ");
  const want = needle.replace(/\s+/g, " ");
  let at = -1;
  if (before) {
    const ci = hay.indexOf((before + " " + want).replace(/\s+/g, " "));
    if (ci >= 0) at = ci + (before ? before.length + 1 : 0);
  }
  if (at < 0) at = hay.indexOf(want);
  if (at < 0) return null;

  // map normalized offset back — approximate by scanning raw string
  const rawAt = approxRawOffset(combined, at);
  const rawEnd = approxRawOffset(combined, at + want.length);
  const startLoc = locate(map, rawAt);
  const endLoc = locate(map, rawEnd);
  if (!startLoc || !endLoc) return null;
  const range = document.createRange();
  range.setStart(startLoc.node, startLoc.offset);
  range.setEnd(endLoc.node, endLoc.offset);
  return range.collapsed ? null : range;
}

function approxRawOffset(raw, normOffset) {
  // walk raw, counting normalized characters, until we reach normOffset
  let norm = 0;
  let prevSpace = false;
  for (let i = 0; i < raw.length; i++) {
    if (norm >= normOffset) return i;
    const isSpace = /\s/.test(raw[i]);
    if (isSpace) {
      if (!prevSpace) norm++;
      prevSpace = true;
    } else {
      norm++;
      prevSpace = false;
    }
  }
  return raw.length;
}

function locate(map, rawOffset) {
  for (let i = map.length - 1; i >= 0; i--) {
    if (rawOffset >= map[i].start) {
      return { node: map[i].node, offset: Math.min(rawOffset - map[i].start, map[i].node.nodeValue.length) };
    }
  }
  return null;
}
