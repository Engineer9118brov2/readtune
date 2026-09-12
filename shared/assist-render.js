/*
 * ReadTune — small DOM helpers shared by the reading-assistant surfaces
 * (the Simplify card in assist-ui.js, the Summary sidebar in assist-sidebar.js).
 */

export function el(tag, attrs, kids) {
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

/* The model is asked for plain text, but it still reaches for markdown now
   and then — most often `**bold**` in an answer that wants to emphasise one
   term. Rather than fight that in the prompt forever, parse the handful of
   marks worth honouring and turn them into real elements. Everything else
   (raw text, unmatched `**`) passes through as a plain text node — this never
   builds HTML from the string, so there's no injection risk. */
function appendInline(p, line) {
  const re = /\*\*([^*\n]+)\*\*|(?:^|(?<=\s))\*([^*\n]+)\*(?=\s|$)/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last) p.append(document.createTextNode(line.slice(last, m.index)));
    p.append(el(m[1] != null ? "strong" : "em", {}, m[1] != null ? m[1] : m[2]));
    last = re.lastIndex;
  }
  if (last < line.length) p.append(document.createTextNode(line.slice(last)));
}

export function resultBlock(text) {
  const box = el("div", { class: "rt-assist-result" });
  for (const line of String(text).split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
    const p = el("p", {});
    appendInline(p, line.replace(/^[-•*]\s*/, "• "));
    box.append(p);
  }
  return box;
}

export const disclaimer = () =>
  el("p", { class: "rt-assist-note" }, "AI — may not be exact. Check anything that matters against the original.");

/** A "…doing the thing" line plus a Cancel button, as a node list ready for `replaceChildren(...)`. */
export function workingNodes(label, onCancel) {
  const note = el("p", { class: "rt-assist-working" }, label);
  const cancel = el("button", { type: "button", class: "rt-assist-cancel" }, "Cancel");
  cancel.addEventListener("click", () => onCancel && onCancel());
  return [note, cancel];
}

/** An error line plus an optional "Try again" button, as a node list ready for `replaceChildren(...)`. */
export function failNodes(message, onRetry) {
  const parts = [el("p", { class: "rt-assist-error" }, message || "That didn't work.")];
  if (typeof onRetry === "function") {
    const again = el("button", { type: "button", class: "rt-assist-btn" }, "Try again");
    again.addEventListener("click", () => onRetry());
    parts.push(el("div", { class: "rt-assist-actions" }, [again]));
  }
  return parts;
}
