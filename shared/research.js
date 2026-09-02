import { DEFAULT_RULER_LINES, normalizeRulerLines } from "./ruler.js";

/*
 * ReadTune — research-backed product guidance
 *
 * Keeps the product stance in one place so defaults, presentational copy, and
 * docs all agree on what has the strongest support versus what is best treated
 * as an individual preference.
 */

export const EVIDENCE_LEVELS = Object.freeze({
  strong: { label: "Best-supported", tone: "strong" },
  supported: { label: "Often helpful", tone: "supported" },
  mixed: { label: "Mixed evidence", tone: "mixed" },
  personal: { label: "Personal preference", tone: "personal" },
});

export const RESEARCH_STARTER_PROFILE = Object.freeze({
  font: "sans",
  fontSize: 20,
  lineHeight: 1.75,
  letterSpacing: 0.02,
  wordSpacing: 0.08,
  paragraphSpacing: 1.5,
  columnWidth: 58,
  bionic: 0,
  hyphenate: false,
  syllables: false,
  deItalic: false,
  overlay: "none",
  customTint: "#eef3f8",
  contrast: 94,
  hideImages: false,
  freezeMotion: false,
  focus: "off",
  rulerLines: DEFAULT_RULER_LINES,
  rulerHeight: 40,
  pacing: "flow",
  wpm: 300,
  ttsRate: 1,
});

export const RESEARCH_FOUNDATIONS = Object.freeze([
  {
    key: "aloud",
    level: "strong",
    title: "Read aloud + follow along",
    body: "The strongest support is for hearing the text while the current sentence and word stay visible.",
  },
  {
    key: "spacing",
    level: "strong",
    title: "Roomier spacing",
    body: "Extra breathing room between lines, words, and letters can reduce visual crowding and effort.",
  },
  {
    key: "measure",
    level: "supported",
    title: "Shorter line width",
    body: "A calmer measure gives the eyes shorter jumps, which usually feels steadier on dense pages.",
  },
  {
    key: "contrast",
    level: "supported",
    title: "Softer contrast",
    body: "Warm off-white with slightly softened ink is usually less harsh than pure black on bright white.",
  },
]);

export const RESEARCH_EXPERIMENTS = Object.freeze([
  {
    key: "fonts",
    level: "mixed",
    title: "Fonts are worth testing, not promising",
    body: "OpenDyslexic, Atkinson, and Lexend may feel better, but there is no clear universal winner in controlled studies.",
  },
  {
    key: "tints",
    level: "mixed",
    title: "Tints can help comfort",
    body: "Some readers clearly prefer a tint, but that is different from claiming coloured overlays treat dyslexia.",
  },
  {
    key: "bionic",
    level: "mixed",
    title: "Bionic is optional",
    body: "It is popular and sometimes feels anchoring, but the evidence is thin enough that it should stay opt-in.",
  },
  {
    key: "focus",
    level: "personal",
    title: "Focus tools help on overloaded days",
    body: "Ruler, paragraph focus, and sentence mode can reduce drift and working-memory load when attention is slipping.",
  },
]);

export function evidenceLevel(level) {
  return EVIDENCE_LEVELS[level] || EVIDENCE_LEVELS.mixed;
}

export function researchStarterPatch(current = {}) {
  const next = current && typeof current === "object" ? current : {};
  const rate = Number(next.ttsRate);
  const rulerHeight = Number(next.rulerHeight);
  return {
    ...RESEARCH_STARTER_PROFILE,
    rulerLines: normalizeRulerLines(next.rulerLines, RESEARCH_STARTER_PROFILE.rulerLines),
    rulerHeight: Number.isFinite(rulerHeight) ? rulerHeight : RESEARCH_STARTER_PROFILE.rulerHeight,
    ttsRate: Number.isFinite(rate) ? rate : RESEARCH_STARTER_PROFILE.ttsRate,
  };
}
