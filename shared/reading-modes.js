/*
 * ReadTune — guided reading modes
 *
 * Competitors mostly hand users a pile of toggles. These modes bundle the most
 * useful combinations into a few jobs people actually have: focus, study,
 * listen, and skim.
 */

export const READING_MODES = [
  { key: "focus", label: "Focus", blurb: "Reduce visual drift and keep your place." },
  { key: "study", label: "Study", blurb: "Open spacing for longer, denser reading." },
  { key: "listen", label: "Listen", blurb: "Switch straight into read-aloud." },
  { key: "skim", label: "Skim", blurb: "Move through text in smaller chunks." },
];

export function modePatch(mode, profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  switch (mode) {
    case "focus":
      return {
        pacing: "flow",
        focus: "ruler",
        hideImages: true,
        freezeMotion: true,
        columnWidth: Math.min(56, Number(p.columnWidth) || 58),
        contrast: Math.min(96, Math.max(90, Number(p.contrast) || 94)),
      };
    case "study":
      return {
        pacing: "flow",
        focus: "paragraph",
        freezeMotion: true,
        lineHeight: Math.max(1.9, Number(p.lineHeight) || 1.75),
        letterSpacing: Math.max(0.02, Number(p.letterSpacing) || 0.02),
        wordSpacing: Math.max(0.12, Number(p.wordSpacing) || 0.08),
        paragraphSpacing: Math.max(1.6, Number(p.paragraphSpacing) || 1.5),
        columnWidth: Math.min(56, Number(p.columnWidth) || 58),
      };
    case "listen":
      return {
        pacing: "aloud",
        focus: "ruler",
        freezeMotion: true,
        columnWidth: Math.min(58, Number(p.columnWidth) || 58),
      };
    case "skim":
      return {
        pacing: "sentence",
        focus: "off",
        hideImages: true,
        freezeMotion: true,
        columnWidth: Math.min(52, Number(p.columnWidth) || 58),
      };
    default:
      return {};
  }
}
