/*
 * ReadTune — ruler sizing helpers
 *
 * The reading ruler should hug the current line instead of staying a rigid
 * fixed height. These helpers keep the sizing logic shared between Reader View
 * and the in-page restyle surface.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function measuredLineHeight(styleLike, fallbackPx) {
  const style = styleLike || {};
  const fontSize = px(style.fontSize);
  const lineHeight = px(style.lineHeight);
  if (lineHeight > 0) return lineHeight;
  if (String(style.lineHeight || "").trim().toLowerCase() === "normal" && fontSize > 0) {
    return fontSize * 1.35;
  }
  if (fontSize > 0) return fontSize * 1.35;
  return Math.max(14, Number(fallbackPx) || 30);
}

export function adaptiveRulerHeight({ lineHeightPx, fontSizePx = 0, baseHeight = 40 } = {}) {
  const line = Math.max(
    14,
    Number(lineHeightPx) || 0,
    Number(fontSizePx) ? Number(fontSizePx) * 1.25 : 0
  );
  const cushion = clamp((Number(baseHeight) || 40) * 0.22, 6, 18);
  return Math.round(line + cushion * 2);
}

function px(raw) {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}
