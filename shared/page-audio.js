/*
 * ReadTune — spot the page's own narration
 *
 * A lot of news sites and long blogs publish a "Listen to this article" player
 * or embed a podcast episode of the piece. When ReadTune is restyling a page in
 * place, pointing the reader at that is better than reading over it with Piper.
 *
 * This module only *finds* the control and says what kind it is. inpage.js
 * decides what to show and never sends anything anywhere — playback stays
 * entirely between the reader and the page they're already on.
 */

// Hosts that only ever serve spoken-word audio players.
const EMBED_HOSTS =
  /(?:open\.spotify\.com\/embed\/episode|podcasts\.apple\.com|player\.simplecast\.com|w\.soundcloud\.com|players\.brightcove\.net\/.*audio|audioboom\.com\/posts|megaphone\.fm|omny\.fm|art19\.com|iframe\.acast\.com|podbean\.com\/player|player\.fm|spreaker\.com\/player|transistor\.fm)/i;

// Accessible name / visible text that clearly means "listen to the words on
// this page" — not a video, a music track, or a game.
const LISTEN_RE =
  /(listen to (?:this|the) (?:article|story|post|page|piece)|listen to this(?:\s+(?:article|story|post))?\b|audio version|hear this (?:article|story|post)|read (?:this )?(?:article |story |page )?aloud|play(?: the)? audio(?: version)?|narrated by|listen \d+ min)/i;

// Kill switches: if any of these show up in the name it's almost certainly
// video / music / navigation, not article narration.
const DENY_RE =
  /\b(video|trailer|watch|playlist|song|album|track \d|music|episode list|live stream|livestream|radio station|mute|volume|subscribe|sign in|newsletter)\b/i;

function accessibleName(el) {
  const label =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el.getAttribute("aria-labelledby") &&
      el.ownerDocument.getElementById(el.getAttribute("aria-labelledby"))?.textContent) ||
    el.textContent ||
    "";
  return String(label).replace(/\s+/g, " ").trim();
}

function inReadTune(el) {
  return !!el.closest(
    '#readtune-bar-host, #readtune-inpage, #readtune-ruler, rt-bionic, [data-say], [data-readtune]',
  );
}

function hasSize(el) {
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
}

function audioSrc(el) {
  return (
    el.currentSrc ||
    el.getAttribute("src") ||
    (el.querySelector("source[src]") && el.querySelector("source[src]").getAttribute("src")) ||
    ""
  );
}

/*
 * Returns the single best narration handle on the page, or null.
 *   { kind: "audio",   el }  — a real <audio> element we can play/pause and watch
 *   { kind: "embed",   el }  — a podcast iframe; we can only scroll it into view
 *   { kind: "control", el, name }  — a "Listen" button/link; we click it and let
 *                                    the page's own player take over
 */
export function findPageNarration(root) {
  const doc = root || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const scope = doc.body || doc.documentElement || doc;

  // 1 — a controllable <audio> element wins: real state, real play/pause.
  for (const el of scope.querySelectorAll("audio")) {
    if (inReadTune(el)) continue;
    if (!audioSrc(el)) continue;
    if (el.muted && !el.controls && !el.hasAttribute("controls")) continue;
    return { kind: "audio", el };
  }

  // 2 — an embedded podcast episode of the article.
  for (const el of scope.querySelectorAll("iframe[src]")) {
    if (inReadTune(el)) continue;
    if (EMBED_HOSTS.test(el.getAttribute("src") || "")) return { kind: "embed", el };
  }

  // 3 — a visible "Listen to this article" control we can click.
  for (const el of scope.querySelectorAll(
    'button, a[href], [role="button"], input[type="button"], input[type="submit"]',
  )) {
    if (inReadTune(el)) continue;
    const name = accessibleName(el);
    if (!name || name.length > 120) continue;
    if (!LISTEN_RE.test(name) || DENY_RE.test(name)) continue;
    if (!hasSize(el)) continue;
    return { kind: "control", el, name };
  }

  return null;
}
