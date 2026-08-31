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
        contrast: Math.min(100, Math.max(86, Number(p.contrast) || 100)),
      };
    case "study":
      return {
        pacing: "flow",
        focus: "paragraph",
        freezeMotion: true,
        lineHeight: Math.max(1.85, Number(p.lineHeight) || 1.6),
        wordSpacing: Math.max(0.08, Number(p.wordSpacing) || 0),
        paragraphSpacing: Math.max(1.25, Number(p.paragraphSpacing) || 1),
        columnWidth: Math.min(58, Number(p.columnWidth) || 62),
      };
    case "listen":
      return {
        pacing: "aloud",
        focus: "ruler",
        freezeMotion: true,
      };
    case "skim":
      return {
        pacing: "sentence",
        focus: "off",
        hideImages: true,
        freezeMotion: true,
        columnWidth: Math.min(54, Number(p.columnWidth) || 62),
      };
    default:
      return {};
  }
}
