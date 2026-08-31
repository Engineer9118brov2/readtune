/*
 * ReadTune — ruler sizing helpers
 *
 * The reading ruler should hug the current line instead of staying a rigid
 * fixed height. These helpers keep the sizing logic shared between Reader View
 * and the in-page restyle surface.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const DEFAULT_RULER_LINES = 1;
export const RULER_LINE_OPTIONS = Object.freeze([1, 3, 5]);

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

export function normalizeRulerLines(raw, fallback = DEFAULT_RULER_LINES) {
  const n = Number(raw);
  if (RULER_LINE_OPTIONS.includes(n)) return n;
  const next = Number(fallback);
  return RULER_LINE_OPTIONS.includes(next) ? next : DEFAULT_RULER_LINES;
}

export function inferLegacyRulerLines(heightPx, fallback = DEFAULT_RULER_LINES) {
  const height = Number(heightPx);
  if (!Number.isFinite(height)) return normalizeRulerLines(fallback);
  if (height >= 72) return 5;
  if (height >= 50) return 3;
  return 1;
}

export function cycleRulerLines(current) {
  const lineCount = normalizeRulerLines(current);
  const idx = RULER_LINE_OPTIONS.indexOf(lineCount);
  return RULER_LINE_OPTIONS[(idx + 1) % RULER_LINE_OPTIONS.length];
}

export function rulerSpanLabel(raw, { compact = false } = {}) {
  const lineCount = normalizeRulerLines(raw);
  if (compact) return `${lineCount}L`;
  return `${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
}

export function adaptiveRulerHeight({ lineHeightPx, fontSizePx = 0, baseHeight = 40, lines = DEFAULT_RULER_LINES } = {}) {
  const lineCount = normalizeRulerLines(lines);
  const line = Math.max(
    14,
    Number(lineHeightPx) || 0,
    Number(fontSizePx) ? Number(fontSizePx) * 1.25 : 0
  );
  const cushion = clamp((Number(baseHeight) || 40) * 0.22, 6, 18);
  return Math.round(clamp(line * lineCount + cushion * 2, line + 12, 360));
}

function px(raw) {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}
