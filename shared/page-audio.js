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

// Accessible name / visible text that, on its own, clearly means "listen to
// the words on this page" — not a video, a music track, or a game.
const LISTEN_STRONG_RE =
  /(\blisten to (?:this|the) (?:article|story|post|page|piece)|\blisten to this(?:\s+(?:article|story|post))?\b|\baudio version\b|\bhear this (?:article|story|post)|\bread (?:this )?(?:article |story |page )?aloud\b|\bplay(?: the)? audio(?: version)?\b|\bnarrated by\b)/i;

// Real newsrooms (NPR chief among them) label the per-story control just
// "Listen" plus a duration — "Listen· 12:01", "Listen 4 min" — with nothing
// tying it to "article" in the name itself. That bare word needs a second
// piece of evidence before it counts: a duration in the name, or an
// audio-flavoured class/id on the element.
const LISTEN_WEAK_RE = /\blisten\b(?!\s+live)/i;
const DURATION_RE = /\b\d{1,2}:\d{2}\b|\b\d+[\s-]?(?:minute|min)\b/i;
const AUDIO_CLASS_HINT_RE = /(audio|listen|player|narrat|podcast)/i;

// Kill switches: if any of these show up in the name it's almost certainly
// video / music / navigation / a live stream, not recorded article narration.
const DENY_RE =
  /\b(video|trailer|watch|playlist|song|album|track \d|music|episode list|listen\s+live|live stream|livestream|radio station|mute|volume|subscribe|sign in|newsletter)\b/i;

// A live marker can also hide in the *evidence*, not the name — e.g. a radio
// widget marked up as class="audio-module-listen live" with the visible text
// just "Listen". Word "live" is scoped to this evidence-only check, since the
// name path already has its own live handling (LISTEN_WEAK_RE, DENY_RE above).
const LIVE_EVIDENCE_RE = /\blive(?:[-_ ]?stream)?\b/i;

function matchesListenControl(el, name) {
  if (DENY_RE.test(name)) return false;
  if (LISTEN_STRONG_RE.test(name)) return true;
  if (!LISTEN_WEAK_RE.test(name)) return false;
  if (DURATION_RE.test(name)) return true;
  const evidence = `${el.id} ${el.className}`;
  if (LIVE_EVIDENCE_RE.test(evidence)) return false;
  return AUDIO_CLASS_HINT_RE.test(evidence);
}

// Something in an <audio>'s own markup or its immediate surroundings that ties
// it to reading the article rather than a sound effect or ad.
const AUDIO_HINT_RE = /(listen|audio|narrat|read.?aloud|spoken|player|episode|podcast)/i;

function accessibleName(el) {
  const ids = (el.getAttribute("aria-labelledby") || "").trim().split(/\s+/).filter(Boolean);
  const labelledBy = ids
    .map((id) => (el.ownerDocument.getElementById(id) || {}).textContent || "")
    .join(" ")
    .trim();
  const label =
    labelledBy ||
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el.tagName === "INPUT" ? el.value : "") ||
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
  const view = el.ownerDocument.defaultView;
  const style = view && view.getComputedStyle(el);
  if (style && (style.visibility === "hidden" || style.display === "none")) return false;
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

// An <audio> that looks like article narration, not a notification chime or an
// autoplaying ad bed.
function isArticleAudio(el) {
  if (!audioSrc(el)) return false;
  if (el.muted && !el.hasAttribute("controls")) return false;
  if (el.hasAttribute("loop")) return false; // narration doesn't loop
  if (el.autoplay || el.hasAttribute("autoplay")) return false; // narration waits for a tap
  if (el.hasAttribute("controls")) return true; // an exposed player is the reader's to use
  // No visible controls: only trust it if the markup around it says "audio".
  const hay = `${el.id} ${el.className} ${el.getAttribute("aria-label") || ""} ${
    el.closest("[class],[id]") ? el.closest("[class],[id]").className + " " + el.closest("[class],[id]").id : ""
  } ${el.parentElement ? el.parentElement.textContent.slice(0, 120) : ""}`;
  return AUDIO_HINT_RE.test(hay);
}

/*
 * Returns the single best narration handle on the page, or null.
 *   { kind: "audio",   el }  — a real <audio> element we can play/pause and watch
 *   { kind: "control", el, name }  — a "Listen" button/link; a real button we
 *                                    click, a link we only scroll into view
 *   { kind: "embed",   el }  — a podcast iframe; we can only scroll it into view
 */
export function findPageNarration(root) {
  const doc = root || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const scope = doc.body || doc.documentElement || doc;

  // 1 — a controllable <audio> element: real state, real play/pause.
  for (const el of scope.querySelectorAll("audio")) {
    if (inReadTune(el)) continue;
    if (isArticleAudio(el)) return { kind: "audio", el };
  }

  // 2 — an explicitly labelled "Listen to this article" control. A named
  //     control for the story beats an unlabelled podcast embed elsewhere on
  //     the page, so this runs before the iframe scan.
  for (const el of scope.querySelectorAll('button, a[href], [role="button"], input[type="button"]')) {
    if (inReadTune(el)) continue;
    const name = accessibleName(el);
    if (!name || name.length > 120) continue;
    if (!matchesListenControl(el, name)) continue;
    if (!hasSize(el)) continue;
    return { kind: "control", el, name };
  }

  // 3 — an embedded podcast episode of the article.
  for (const el of scope.querySelectorAll("iframe[src]")) {
    if (inReadTune(el)) continue;
    if (EMBED_HOSTS.test(el.getAttribute("src") || "")) return { kind: "embed", el };
  }

  return null;
}
