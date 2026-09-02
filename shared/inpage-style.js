/*
 * ReadTune — in-page stylesheet
 *
 * Generates the CSS injected into a live web page by inpage.js when the user
 * chooses "Restyle this page". Scoped to `html.rt-inpage`. Kept as its own
 * module so the rule generation can be unit-tested without a browser.
 */

export const IN_PAGE_STACKS = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  dyslexic: '"OpenDyslexic", "Comic Sans MS", "Segoe UI", sans-serif',
  atkinson: '"Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif',
  lexend: '"Lexend", "Helvetica Neue", Arial, sans-serif',
};

export const IN_PAGE_TINTS = {
  none: null,
  cream: { bg: "#f7f0dc", ink: "#302a1b" },
  peach: { bg: "#faeee6", ink: "#3a2b22" },
  yellow: { bg: "#fbf3cc", ink: "#332f18" },
  green: { bg: "#e6f1e6", ink: "#20301f" },
  blue: { bg: "#e3eef6", ink: "#1d2b33" },
  rose: { bg: "#f7e9ee", ink: "#342029" },
  grey: { bg: "#eceae6", ink: "#2a2a28" },
  dark: { bg: "#181a1d", ink: "#d9d7d1" },
  custom: null, // filled from profile.customTint
};

// elements that are usually icon glyphs or interactive controls, not prose
const READING_GUARD =
  ':not(i):not(.fa):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"])' +
  ':not([class*="material-icons"]):not([class*="material-symbols"]):not([class*="glyph"])' +
  ':not([aria-hidden="true"]):not(svg):not(svg *)' +
  ':not(button):not(input):not(select):not(textarea):not(option)';

// containers that hold the actual reading text — safe to resize
const TEXT_CONTAINERS = [
  "p", "li", "dd", "dt", "blockquote", "figcaption", "td", "th",
  "article", "main", "section",
  '[class*="article"]', '[class*="content"]', '[class*="post"]', '[class*="story"]',
  '[class*="prose"]', '[class*="markdown"]', '[itemprop="articleBody"]',
].map((s) => `html.rt-inpage ${s}`).join(", ");

const FORM_CONTROLS = ["button", "input", "select", "textarea", "option"].map((s) => `html.rt-inpage ${s}`).join(", ");

export function inpageCSS(profile, fontFaceBlock = "") {
  const p = profile || {};
  const stack = IN_PAGE_STACKS[p.font] || IN_PAGE_STACKS.sans;
  const size = clamp(p.fontSize, 13, 34, 19);
  const lh = clamp(p.lineHeight, 1.1, 3, 1.6);
  const ls = clamp(p.letterSpacing, 0, 0.35, 0);
  const ws = clamp(p.wordSpacing, 0, 1, 0);
  const para = clamp(p.paragraphSpacing, 0.4, 3.2, 1);
  const contrast = clamp(p.contrast, 70, 100, 100) / 100;

  let tint = IN_PAGE_TINTS[p.overlay];
  if (p.overlay === "custom" && /^#[0-9a-fA-F]{6}$/.test(p.customTint || "")) {
    const dark = luminance(p.customTint) < 0.42;
    tint = { bg: p.customTint, ink: dark ? "#f2f0ea" : "#1f2430" };
  }

  const out = [];
  out.push(fontFaceBlock);

  out.push(`
html.rt-inpage, html.rt-inpage body { font-family: ${stack} !important; }
html.rt-inpage *${READING_GUARD} {
  font-family: ${stack} !important;
  letter-spacing: ${ls}em !important;
  word-spacing: ${ws}em !important;
  line-height: ${lh} !important;
}
${TEXT_CONTAINERS} {
  font-size: ${size}px !important;
  line-height: ${lh} !important;
}
${FORM_CONTROLS} {
  font-family: ${stack} !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
  line-height: normal !important;
}
html.rt-inpage p, html.rt-inpage li, html.rt-inpage blockquote {
  margin-top: ${para * 0.5}em !important;
  margin-bottom: ${para}em !important;
}
html.rt-inpage :is(p, li, article, main) { text-align: left !important; }
`);

  if (tint) {
    const scheme = luminance(tint.bg) < 0.45 ? "dark" : "light";
    out.push(`
html.rt-inpage {
  color-scheme: ${scheme} !important;
  --rt-inpage-bg: ${tint.bg};
  --rt-inpage-ink: ${tint.ink};
  --rt-inpage-muted: color-mix(in srgb, var(--rt-inpage-ink) 72%, var(--rt-inpage-bg));
  --rt-inpage-faint: color-mix(in srgb, var(--rt-inpage-ink) 18%, var(--rt-inpage-bg));
  --color-base: var(--rt-inpage-ink);
  --color-emphasized: var(--rt-inpage-ink);
  --color-subtle: var(--rt-inpage-muted);
  --color-muted: var(--rt-inpage-muted);
  --color-placeholder: var(--rt-inpage-muted);
  --background-color-base: var(--rt-inpage-bg);
  --background-color-interactive-subtle: var(--rt-inpage-faint);
  --background-color-neutral-subtle: var(--rt-inpage-faint);
  --border-color-base: var(--rt-inpage-faint);
  --border-color-subtle: var(--rt-inpage-faint);
  background: var(--rt-inpage-bg) !important;
  color: var(--rt-inpage-ink) !important;
}
html.rt-inpage body {
  background: var(--rt-inpage-bg) !important;
  color: var(--rt-inpage-ink) !important;
  caret-color: var(--rt-inpage-ink) !important;
}
html.rt-inpage body *${READING_GUARD} {
  color: var(--rt-inpage-ink) !important;
  -webkit-text-fill-color: var(--rt-inpage-ink) !important;
}
/* Clear the page's own surfaces, not a hand-picked list of them.
 *
 * Naming a few containers left every other opaque box behind — and on a site
 * already in its own dark theme (Wikipedia's night mode, say) those boxes keep
 * a dark fill while the text on top is repainted dark too. The result is
 * unreadable patches scattered through an otherwise tinted page. Media and
 * anything painting with an image keep what they have. */
html.rt-inpage body *:not(img):not(picture):not(svg):not(svg *):not(video):not(canvas):not(iframe):not(rt-bionic):not(pre):not(code):not(kbd):not(samp):not(blockquote):not(mark):not(button):not(input):not(select):not(textarea):not(option):not(optgroup) {
  background-color: transparent !important;
}
/* Controls are excluded from the ink rules above, so give them a surface of
   their own rather than letting them keep a dark fill under dark text. */
html.rt-inpage :is(button, input, select, textarea, option, optgroup) {
  background-color: var(--rt-inpage-faint) !important;
  color: var(--rt-inpage-ink) !important;
  -webkit-text-fill-color: var(--rt-inpage-ink) !important;
  border-color: var(--rt-inpage-faint) !important;
}
/* Blocks that mean something by being set apart keep a faint surface. */
html.rt-inpage :is(pre, code, kbd, samp, blockquote, mark) {
  background-color: var(--rt-inpage-faint) !important;
}
html.rt-inpage mark { color: var(--rt-inpage-ink) !important; }
html.rt-inpage :is(a, a:visited, a:hover, a:active)${READING_GUARD} {
  color: var(--rt-inpage-ink) !important;
  -webkit-text-fill-color: var(--rt-inpage-ink) !important;
  text-decoration-color: color-mix(in srgb, var(--rt-inpage-ink) 48%, transparent) !important;
}
`);
  }

  if (contrast < 1) {
    out.push(`html.rt-inpage body { filter: contrast(${contrast}) !important; }`);
  }
  if (p.deItalic) {
    out.push(`html.rt-inpage :is(i, em)${ICON_GUARD} { font-style: normal !important; font-weight: 600 !important; }`);
  }
  if (p.hideImages) {
    out.push(`html.rt-inpage :is(img, picture, figure, video, iframe[src*="youtube"], [role="img"]) { display: none !important; }`);
  }
  if (p.freezeMotion) {
    out.push(`html.rt-inpage *, html.rt-inpage *::before, html.rt-inpage *::after { animation-play-state: paused !important; transition: none !important; }`);
  }

  out.push(`
html.rt-inpage rt-bionic { display: inline; }
html.rt-inpage rt-bionic b { font-weight: 700; }
#readtune-ruler {
  position: fixed; left: 0; right: 0; z-index: 2147483646; pointer-events: none;
  box-shadow: 0 0 0 100vmax rgba(18, 20, 16, 0.22);
  border-top: 2px solid rgba(120, 170, 150, 0.7); border-bottom: 2px solid rgba(120, 170, 150, 0.7);
}
`);

  return out.filter(Boolean).join("\n");
}

function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((((n >> 16) & 255) * 0.299) + (((n >> 8) & 255) * 0.587) + ((n & 255) * 0.114)) / 255;
}
