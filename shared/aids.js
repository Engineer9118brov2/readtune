/*
 * ReadTune — reading environment aids
 *
 * Things that watch scroll / pointer / selection rather than transform the text:
 * the top progress bar, the reading ruler, paragraph focus dimming, resume
 * position, and persistent highlights. Attaches to the flow reading view.
 */

export function createReadingAids({ getFlow, onSaveScroll, onSaveHighlights }) {
  const progress = document.createElement("div");
  progress.className = "rt-progress";
  progress.hidden = true;

  const ruler = document.createElement("div");
  ruler.className = "rt-ruler";
  ruler.hidden = true;

  const hlButton = document.createElement("button");
  hlButton.type = "button";
  hlButton.className = "rt-btn rt-primary";
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
  let saveTimer = 0;
  let highlights = [];
  let savedRange = null;

  /* ---- scroll: progress + resume + paragraph focus ---- */
  function onScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const frac = max > 0 ? doc.scrollTop / max : 0;
    if (!progress.hidden) progress.style.width = `${Math.min(100, Math.max(0, frac * 100))}%`;

    if (profile.focus === "paragraph") updateFocusParagraph();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => onSaveScroll && onSaveScroll(Math.round(doc.scrollTop)), 400);
  }

  function updateFocusParagraph() {
    const flow = getFlow();
    if (!flow) return;
    const mid = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;
    for (const el of flow.children) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        el.classList.remove("rt-focus-active");
        continue;
      }
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    }
    for (const el of flow.children) el.classList.toggle("rt-focus-active", el === best);
  }

  /* ---- pointer: ruler ---- */
  function onPointerMove(e) {
    rulerY = e.clientY;
    if (!ruler.hidden) positionRuler();
  }
  function positionRuler() {
    const h = profile.rulerHeight || 40;
    ruler.style.top = `${Math.max(0, rulerY - h / 2)}px`;
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

  hlButton.addEventListener("mousedown", (e) => e.preventDefault());
  hlButton.addEventListener("click", () => {
    if (!savedRange) return;
    const text = savedRange.toString().replace(/\s+/g, " ").trim();
    const flow = getFlow();
    const before = contextBefore(flow, savedRange, 24);
    const marks = wrapRange(savedRange, "rt-hl");
    marks.forEach(wireHighlightRemoval);
    if (marks.length) {
      highlights.push({ text, before });
      persistHighlights();
    }
    window.getSelection().removeAllRanges();
    hlButton.style.display = "none";
    savedRange = null;
  });

  function wireHighlightRemoval(mark) {
    mark.style.cssText =
      "background: color-mix(in srgb, #ffd23f 55%, transparent); border-radius: 3px; cursor: pointer;";
    mark.title = "Click to remove highlight";
    mark.addEventListener("click", () => {
      const t = mark.textContent.replace(/\s+/g, " ").trim();
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
      highlights = highlights.filter((h) => h.text !== t);
      persistHighlights();
    });
  }

  function persistHighlights() {
    onSaveHighlights && onSaveHighlights(highlights.slice(0, 200));
  }

  function restoreHighlights(list) {
    highlights = Array.isArray(list) ? list.slice() : [];
    const flow = getFlow();
    if (!flow) return;
    for (const h of highlights) {
      const range = rangeFromText(flow, h.text, h.before);
      if (range) wrapRange(range, "rt-hl").forEach(wireHighlightRemoval);
    }
  }

  /* ---- public ---- */
  function apply(next) {
    profile = next || {};
    // the ruler / focus dimming / scroll progress only make sense over flowing text
    const flowing = ["flow", "scroll", "aloud"].includes(profile.pacing || "flow");
    progress.hidden = !flowing;
    ruler.hidden = !flowing || profile.focus !== "ruler";
    if (!ruler.hidden) positionRuler();
    const flow = getFlow();
    if (flowing && profile.focus === "paragraph") updateFocusParagraph();
    else if (flow) for (const el of flow.children) el.classList.remove("rt-focus-active");
    onScroll();
  }

  function restoreScroll(y) {
    if (y && y > 40) window.scrollTo({ top: y, behavior: "instant" });
  }

  function destroy() {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("resize", onScroll);
    document.removeEventListener("selectionchange", onSelectionChange);
    progress.remove();
    ruler.remove();
    hlButton.remove();
  }

  return { apply, restoreScroll, restoreHighlights, destroy };
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
