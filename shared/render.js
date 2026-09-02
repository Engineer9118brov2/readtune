/*
 * ReadTune — the one formatting engine
 *
 * Reader View, PDF mode, and every calibration passage render through
 * createReadingView(). Feed it article HTML (Readability + a strict allowlist
 * sanitizer) or plain text. applyProfile() turns the saved profile into on-screen
 * typography, bionic bolding, syllable splitting, a reading tint, and one of five
 * ways to move through the text (flow / sentence / word / auto-scroll / aloud).
 */

import { OVERLAYS, FONTS, LINE_TINTS, isDarkSurface, DEFAULT_PROFILE } from "./settings.js";
import { hyphenateWord } from "../lib/hyphen.js";
import { syllabify } from "./syllables.js";

const ALLOWED = new Set([
  "P", "BR", "HR", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "DL", "DT", "DD", "BLOCKQUOTE",
  "A", "B", "STRONG", "I", "EM", "U", "MARK", "SUP", "SUB", "SPAN", "SMALL",
  "FIGURE", "FIGCAPTION", "IMG",
  "PRE", "CODE",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "CAPTION",
]);

const DROP_SUBTREE = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "SVG", "MATH",
  "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "LABEL",
  "LINK", "META", "HEAD", "CANVAS", "AUDIO", "VIDEO", "SOURCE", "TRACK", "MAP", "AREA",
  "DIALOG",
]);

/* Consent / cookie / paywall overlays.
 *
 * Readability drops anything with role="dialog", but most consent managers set
 * no ARIA role at all — so on a page with little continuous prose (a home page,
 * a feed) the cookie notice is the densest text on the page and Readability
 * hands it back as "the article". Britannica's home page did exactly that.
 *
 * These are matched on the ids and class names the big CMPs actually ship, plus
 * a narrow set of generic patterns. The generic ones require a second word
 * (banner / consent / notice / modal …) so an article *about* cookies or
 * privacy keeps its own markup.
 */
const OVERLAY_SELECTORS = [
  // named consent managers
  '[id*="onetrust" i]', '[class*="onetrust" i]', '[class*="ot-sdk" i]', '[class*="optanon" i]',
  '[id*="evidon" i]', '[class*="evidon" i]',
  '#truste-consent-track', '[id^="truste-" i]', '[class^="truste-" i]', '[class*="trustarc" i]',
  '[id^="sp_message_container" i]', '[class*="sp-message" i]',
  '[class*="qc-cmp" i]', '[class*="fc-consent-root" i]', '[class*="osano" i]',
  '[id*="usercentrics" i]', '[class*="usercentrics" i]', '[id*="didomi" i]', '[class*="didomi" i]',
  '[id*="cookiebot" i]', '[id="CybotCookiebotDialog"]', '[class*="termly" i]', '[class*="klaro" i]',
  '[class*="cc-window" i]', '[id*="gdpr-consent" i]', '[class*="gdpr-consent" i]',
  // generic — two words, so real prose about cookies survives
  '[id*="cookie" i][id*="banner" i]', '[class*="cookie" i][class*="banner" i]',
  '[id*="cookie" i][id*="consent" i]', '[class*="cookie" i][class*="consent" i]',
  '[id*="cookie" i][id*="notice" i]', '[class*="cookie" i][class*="notice" i]',
  '[class*="cookie" i][class*="popup" i]', '[class*="cookie" i][class*="modal" i]',
  '[class*="consent" i][class*="banner" i]', '[class*="consent" i][class*="modal" i]',
  '[class*="privacy" i][class*="banner" i]',
  // overlays that announce themselves
  '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
].join(",");

/* Belt-and-braces for a CMP whose markup none of the selectors above matches.
 *
 * Split in two on purpose. The first list is consent-UI copy — wording that
 * appears because a dialog is asking you something, not because a writer chose
 * it. The second list is wording an article about tracking might reasonably
 * quote, so on its own it is never grounds to throw a page away. Discarding a
 * real article silently is a worse failure than rendering a banner, which the
 * reader can at least see and route around. */
const CONSENT_UI_PHRASES = [
  /\bdo not sell (?:or share )?my (?:personal )?info(?:rmation)?\b/i,
  /\bopt[- ]out of the sale or sharing\b/i,
  /\bcustomi[sz]e my ad experience\b/i,
  /\byour privacy choices\b/i,
];

const CONSENT_TOPIC_PHRASES = [
  /\b(?:accept|allow) all cookies\b/i,
  /\bwe(?:'| u)se cookies\b/i,
  /\bmanage (?:your )?(?:cookie )?preferences\b/i,
  /\binterest[- ]based advertising\b/i,
  /\bstrictly necessary cookies\b/i,
];

export function stripOverlays(doc) {
  let removed = 0;
  let nodes = [];
  try {
    nodes = Array.from(doc.querySelectorAll(OVERLAY_SELECTORS));
  } catch {
    return 0; // a selector the engine dislikes must never break extraction
  }
  for (const node of nodes) {
    // <html>/<body> can carry a cookie class; removing those removes the page.
    if (node === doc.documentElement || node === doc.body) continue;
    if (node.isConnected) {
      node.remove();
      removed++;
    }
  }
  return removed;
}

const countHits = (list, t) => list.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);

/** How much of this text reads like a cookie/consent notice rather than prose. */
export function consentPhraseHits(text) {
  const t = String(text || "");
  return countHits(CONSENT_UI_PHRASES, t) + countHits(CONSENT_TOPIC_PHRASES, t);
}

/** Phrases that appear because a dialog is asking, not because a writer chose them. */
export function consentUiHits(text) {
  return countHits(CONSENT_UI_PHRASES, String(text || ""));
}

/* ---------- URL + node sanitizing ---------- */

function safeUrl(raw, base, protocols) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^(javascript|vbscript|file):/i.test(s)) return null;
  if (/^data:text\/html/i.test(s)) return null;
  try {
    const u = new URL(s, base || undefined);
    if (!protocols.includes(u.protocol)) return null;
    if (u.protocol === "data:" && !/^data:image\//i.test(u.href)) return null;
    return u.href;
  } catch {
    return null;
  }
}

function cleanNode(node, base) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ? document.createTextNode(node.nodeValue) : null;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName;
  if (DROP_SUBTREE.has(tag)) return null;

  const kids = () => {
    const frag = document.createDocumentFragment();
    for (const child of Array.from(node.childNodes)) {
      const c = cleanNode(child, base);
      if (c) frag.appendChild(c);
    }
    return frag;
  };

  if (!ALLOWED.has(tag)) {
    const frag = kids();
    return frag.childNodes.length ? frag : null;
  }

  const el = document.createElement(tag.toLowerCase());

  if (tag === "A") {
    const href = safeUrl(node.getAttribute("href"), base, ["http:", "https:", "mailto:"]);
    if (href) {
      el.setAttribute("href", href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow ugc");
    }
  } else if (tag === "IMG") {
    const src = safeUrl(node.getAttribute("src"), base, ["http:", "https:", "data:"]);
    if (!src) return null;
    el.setAttribute("src", src);
    el.setAttribute("alt", node.getAttribute("alt") || "");
    el.setAttribute("loading", "lazy");
    el.setAttribute("referrerpolicy", "no-referrer");
  } else if (tag === "TD" || tag === "TH") {
    for (const a of ["colspan", "rowspan"]) {
      const v = parseInt(node.getAttribute(a), 10);
      if (v > 1 && v < 1000) el.setAttribute(a, String(v));
    }
  }

  el.appendChild(kids());

  const isVoidish = tag === "BR" || tag === "HR" || tag === "IMG" || tag === "TD" || tag === "TH";
  if (!isVoidish && !el.textContent.trim() && !el.querySelector("img")) return null;

  return el;
}

/* ---------- Readability ---------- */

function runReadability(rawHtml, base) {
  let parsed;
  try {
    parsed = new DOMParser().parseFromString(String(rawHtml || ""), "text/html");
  } catch (err) {
    console.warn("[ReadTune] could not parse page HTML:", err);
    return null;
  }
  stripOverlays(parsed);
  if (base && parsed.head) {
    const b = parsed.createElement("base");
    b.setAttribute("href", base.href);
    parsed.head.prepend(b);
  }
  if (typeof window.Readability !== "function") {
    console.warn("[ReadTune] Readability library not loaded");
    return { root: parsed.body, meta: {} };
  }
  try {
    const article = new window.Readability(parsed.cloneNode(true), {
      charThreshold: 250,
      keepClasses: false,
    }).parse();
    if (article && article.content && article.content.trim()) {
      const holder = new DOMParser().parseFromString(article.content, "text/html");
      return {
        root: holder.body,
        meta: {
          title: article.title || "",
          byline: article.byline || "",
          siteName: article.siteName || "",
          excerpt: article.excerpt || "",
          length: article.length || 0,
        },
      };
    }
  } catch (err) {
    console.warn("[ReadTune] Readability failed on this page:", err);
  }
  return null;
}

/* ---------- post-extraction layout repairs ---------- */

/* A wide data table (a climate table, a fixture list) has no reason to widen
   the whole document, but `table { width: 100% }` alone doesn't stop it: the
   cells' own content sets a floor. Give every table its own scroll box so the
   reading column keeps the measure the reader chose. */
function wrapWideTables(fragment) {
  for (const table of Array.from(fragment.querySelectorAll("table"))) {
    if (table.parentElement && table.parentElement.classList.contains("rt-table-wrap")) continue;
    const box = document.createElement("div");
    box.className = "rt-table-wrap";
    box.setAttribute("tabindex", "0");
    box.setAttribute("role", "region");
    const caption = table.querySelector("caption");
    box.setAttribute("aria-label", (caption && caption.textContent.trim()) || "Table");
    table.parentNode.insertBefore(box, table);
    box.appendChild(table);
  }
}

/* Wikipedia and friends open with an infobox, so the reader lands on a wall of
   fact rows and has to scroll past it to reach the first sentence. Fold a
   leading table away behind a summary the way Wikipedia's own mobile view does.
   It stays in the document, in order, one click from open. */
function foldLeadingTable(fragment) {
  let node = fragment.firstElementChild;
  while (node && !node.textContent.trim()) node = node.nextElementSibling;
  if (!node) return;
  const table = node.classList && node.classList.contains("rt-table-wrap") ? node.querySelector("table") : null;
  if (!table) return;

  /* Only fold something that is clearly a sidebar of facts about the article.
     A leading table can just as easily *be* the article — a comparison, a
     schedule, results, pricing — and the sanitizer has already discarded the
     class names that would say which. So require the shape instead:

       · key/value rows, never more than two cells wide, most of them th + td
       · and real prose after it, so the table is not the point of the page. */
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length < 4) return;
  let widest = 0;
  let keyValueRows = 0;
  for (const row of rows) {
    const cells = Array.from(row.children).filter((c) => c.tagName === "TH" || c.tagName === "TD");
    widest = Math.max(widest, cells.length);
    if (cells.length === 2 && cells[0].tagName === "TH") keyValueRows++;
  }
  if (widest > 2) return;
  if (keyValueRows < Math.ceil(rows.length * 0.6)) return;

  let wordsAfter = 0;
  for (let sib = node.nextElementSibling; sib && wordsAfter < 100; sib = sib.nextElementSibling) {
    wordsAfter += wordsIn(sib.textContent).length;
  }
  if (wordsAfter < 100) return;

  const details = document.createElement("details");
  details.className = "rt-fold";
  const summary = document.createElement("summary");
  const caption = table.querySelector("caption");
  summary.textContent = (caption && caption.textContent.trim()) || "Quick facts";
  details.append(summary);
  node.parentNode.insertBefore(details, node);
  details.appendChild(node);
}

export function buildArticleFragment(rawHtml, baseUrl) {
  let base = null;
  try {
    base = baseUrl ? new URL(baseUrl) : null;
  } catch {
    base = null;
  }
  const rd = runReadability(rawHtml, base);
  const fragment = document.createDocumentFragment();
  let meta = {};
  let extracted = false;
  if (rd && rd.root) {
    meta = rd.meta || {};
    extracted = !!(rd.meta && rd.meta.title !== undefined && rd.root.textContent.trim().length > 0);
    for (const node of Array.from(rd.root.childNodes)) {
      const c = cleanNode(node, base);
      if (c) fragment.appendChild(c);
    }
  }
  const quality = assessArticleQuality(fragment, meta);
  wrapWideTables(fragment);
  foldLeadingTable(fragment);
  return { fragment, meta, extracted: extracted && fragment.textContent.trim().length > 0, quality };
}

/* ---------- plain text → fragment (PDF, calibration) ---------- */

export function textToFragment(text) {
  const frag = document.createDocumentFragment();
  const paras = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const para of paras) {
    const trimmed = para.replace(/[ \t]+\n/g, "\n").trim();
    if (!trimmed) continue;
    const p = document.createElement("p");
    const lines = trimmed.split("\n");
    lines.forEach((line, i) => {
      p.appendChild(document.createTextNode(line));
      if (i < lines.length - 1) p.appendChild(document.createElement("br"));
    });
    frag.appendChild(p);
  }
  if (!frag.childNodes.length && String(text || "").trim()) {
    const p = document.createElement("p");
    p.textContent = String(text).trim();
    frag.appendChild(p);
  }
  return frag;
}

/* ---------- sentence splitting ---------- */

const ABBREV = /\b(?:[A-Z][a-z]?|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|no|fig|al|i\.e|e\.g)\.$/;

export function splitSentences(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const matches = raw.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|\s*$)/g) || [raw];
  const out = [];
  for (let piece of matches) {
    piece = piece.trim();
    if (!piece) continue;
    const prev = out[out.length - 1];
    if (prev && (piece.length < 3 || ABBREV.test(prev))) out[out.length - 1] = prev + " " + piece;
    else out.push(piece);
  }
  return out;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function wordsIn(text) {
  const clean = normalizeText(text);
  return clean ? clean.split(/\s+/) : [];
}

export function assessArticleQuality(fragment, meta = {}) {
  const words = wordsIn(fragment.textContent);
  const blocks = Array.from(fragment.querySelectorAll("p, li, blockquote, dd, dt, figcaption, pre"));
  let meaningfulBlocks = 0;
  let denseBlocks = 0;
  let longestBlockWords = 0;

  for (const block of blocks) {
    const text = normalizeText(block.textContent);
    if (!text) continue;
    const blockWords = wordsIn(text).length;
    longestBlockWords = Math.max(longestBlockWords, blockWords);
    if (blockWords >= 8 || text.length >= 48) meaningfulBlocks++;
    if (blockWords >= 16 || text.length >= 96) denseBlocks++;
  }

  const readLength = Math.max(0, Number(meta.length) || 0);
  /* A consent notice is short, dense prose — it clears every threshold below on
     its own. Requires at least one phrase that only a consent dialog uses: an
     article that merely discusses tracking is never thrown away on the strength
     of the topic words alone. */
  const text = fragment.textContent;
  const consentHits = consentPhraseHits(text);
  const ui = consentUiHits(text);
  const looksLikeConsent = words.length < 400 && (ui >= 2 || (ui >= 1 && consentHits >= 3));
  const ok =
    words.length >= 30 &&
    (
      words.length >= 140 ||
      denseBlocks >= 2 ||
      meaningfulBlocks >= 3 ||
      longestBlockWords >= 32 ||
      (readLength >= 900 && meaningfulBlocks >= 2)
    ) &&
    !looksLikeConsent;

  let reason = "ok";
  if (!words.length) reason = "empty";
  else if (looksLikeConsent) reason = "consent-notice";
  else if (words.length < 30) reason = "too-short";
  else if (!meaningfulBlocks && !denseBlocks && longestBlockWords < 16) reason = "ui-shell";
  else if (!ok) reason = "thin";

  return { ok, reason, words: words.length, meaningfulBlocks, denseBlocks, longestBlockWords, readLength, consentHits };
}

function buildChunks(fragment) {
  const chunks = [];
  const push = (text, heading) => {
    for (const s of splitSentences(text)) chunks.push({ text: s, heading: !!heading });
  };

  const walk = (parent) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        push(node.nodeValue, false);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName;
      /* Layout wrappers — the table scroll box, a folded infobox — carry no text
         of their own. Descend, or their contents arrive here as one undivided
         run: before this, a wrapped table produced the single "sentence"
         "CountryUnited StatesStateCalifornia…". */
      if (tag === "DIV" || tag === "DETAILS" || tag === "SECTION") {
        walk(node);
      } else if (tag === "SUMMARY") {
        const t = node.textContent.trim();
        if (t) chunks.push({ text: t, heading: true });
      } else if (/^H[1-6]$/.test(tag)) {
        const t = node.textContent.trim();
        if (t) chunks.push({ text: t, heading: true });
      } else if (tag === "UL" || tag === "OL" || tag === "DL") {
        for (const li of node.querySelectorAll("li, dd, dt")) push(li.textContent, false);
      } else if (tag === "TABLE") {
        /* One chunk per cell, so a data table reads as the rows it is rather
           than as a wall of concatenated labels and values. */
        const caption = node.querySelector("caption");
        const captionText = caption ? caption.textContent.trim() : "";
        /* foldLeadingTable copies the caption into the <summary>, which this
           walker has already emitted — don't say it twice in a row. */
        const fold = node.closest("details.rt-fold");
        const summary = fold ? fold.querySelector("summary") : null;
        const alreadySaid = !!summary && summary.textContent.trim() === captionText;
        if (captionText && !alreadySaid) chunks.push({ text: captionText, heading: true });
        for (const row of node.querySelectorAll("tr")) {
          const cells = Array.from(row.querySelectorAll("th, td"))
            .map((c) => normalizeText(c.textContent))
            .filter(Boolean);
          if (cells.length) push(cells.join(": "), false);
        }
      } else if (tag === "FIGURE" || tag === "IMG" || tag === "HR") {
        /* skipped in chunk mode */
      } else {
        push(node.textContent, false);
      }
    }
  };

  walk(fragment);
  return chunks;
}

/* ---------- bionic bolding ---------- */

function splitToken(token, pct) {
  const m = token.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}’'’·-]*)(.*)$/u);
  if (!m) return null;
  const core = m[2];
  let n;
  if (core.length <= 3) n = 1;
  else n = Math.max(1, Math.min(core.length - 1, Math.round((core.length * pct) / 100)));
  return { pre: m[1], bold: core.slice(0, n), rest: core.slice(n) + (m[3] || "") };
}

function walkTextNodes(scope, skipTags) {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      let p = node.parentNode;
      while (p && p !== scope) {
        if (skipTags.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
        if (p.nodeName === "B" && p.classList && p.classList.contains("rt-b")) return NodeFilter.FILTER_REJECT;
        if (p.classList && (p.classList.contains("rt-b") || p.classList.contains("rt-syl-wrap"))) return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out = [];
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}

function applyBionic(scope, percent) {
  const pct = Math.max(0, Math.min(85, Number(percent) || 0));
  if (!pct) return;
  for (const textNode of walkTextNodes(scope, new Set(["CODE", "PRE"]))) {
    const frag = document.createDocumentFragment();
    let touched = false;
    for (const tok of textNode.nodeValue.split(/(\s+)/)) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) {
        frag.appendChild(document.createTextNode(tok));
        continue;
      }
      const split = splitToken(tok, pct);
      if (!split) {
        frag.appendChild(document.createTextNode(tok));
        continue;
      }
      touched = true;
      if (split.pre) frag.appendChild(document.createTextNode(split.pre));
      const b = document.createElement("b");
      b.className = "rt-b";
      b.textContent = split.bold;
      frag.appendChild(b);
      if (split.rest) frag.appendChild(document.createTextNode(split.rest));
    }
    if (touched && textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
  }
}

/* ---------- syllable dots ---------- */

function applySyllables(scope) {
  for (const textNode of walkTextNodes(scope, new Set(["CODE", "PRE", "H1", "H2", "H3"]))) {
    const frag = document.createDocumentFragment();
    let touched = false;
    for (const tok of textNode.nodeValue.split(/(\s+)/)) {
      if (!tok) {
        continue;
      }
      if (/^\s+$/.test(tok) || tok.length < 4 || !/^[\p{L}]+$/u.test(tok)) {
        frag.appendChild(document.createTextNode(tok));
        continue;
      }
      const parts = syllabify(tok);
      if (parts.length < 2) {
        frag.appendChild(document.createTextNode(tok));
        continue;
      }
      touched = true;
      const wrap = document.createElement("span");
      wrap.className = "rt-syl-wrap";
      parts.forEach((part, i) => {
        wrap.appendChild(document.createTextNode(part));
        if (i < parts.length - 1) {
          const dot = document.createElement("span");
          dot.className = "rt-syl";
          dot.textContent = "·";
          wrap.appendChild(dot);
        }
      });
      frag.appendChild(wrap);
    }
    if (touched && textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
  }
}

/* ---------- sentence wrapping (enables highlight + read-aloud) ---------- */

/* Every block that holds readable text. Table cells are in here deliberately:
   without them read-aloud walks straight past an infobox or a data table while
   the reader's eye is still on it, and the highlight appears to jump. */
const SENTENCE_BLOCKS =
  "p, li, blockquote, h1, h2, h3, h4, h5, h6, dt, dd, figcaption, td, th, caption";

function wrapSentences(root) {
  const blocks = root.querySelectorAll(SENTENCE_BLOCKS);
  for (const block of blocks) {
    if (block.closest("pre")) continue;
    const kids = Array.from(block.childNodes);
    if (!kids.length) continue;
    const frag = document.createDocumentFragment();
    let span = null;
    const newSpan = () => {
      span = document.createElement("span");
      span.className = "rt-s";
      frag.appendChild(span);
    };
    newSpan();
    for (const node of kids) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue;
        const re = /[^.!?…]*[.!?…]+[)"'”’\]]*\s*|[^.!?…]+$/g;
        let m;
        let any = false;
        while ((m = re.exec(text))) {
          if (!m[0]) break;
          any = true;
          span.appendChild(document.createTextNode(m[0]));
          if (/[.!?…]["'”’)\]]*\s*$/.test(m[0]) && re.lastIndex < text.length) newSpan();
        }
        if (!any) span.appendChild(document.createTextNode(text));
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node.matches(SENTENCE_BLOCKS) || node.querySelector(SENTENCE_BLOCKS))
      ) {
        /* A block nested inside another block — <li> holding a <ul>, a <td>
           holding a <p>. It gets its own pass, so hand it through untouched
           rather than folding it into this block's sentence. Wrapping it here
           too would nest .rt-s two deep and count those sentences twice — as
           would folding in a plain <ul> that merely *contains* such blocks; but
           skipping the whole parent (as an earlier attempt did) silently
           dropped the parent's own text — "Parent topic" in a nested list was
           never read aloud at all. */
        if (span && !span.hasChildNodes()) span.remove();
        frag.appendChild(node);
        newSpan();
      } else {
        span.appendChild(node);
      }
    }
    // drop empty trailing span
    if (span && !span.hasChildNodes()) span.remove();
    block.replaceChildren(frag);
  }
  /* Number only now, walking the finished DOM.
     Wrapping an outer block before its nested blocks means indices handed out
     during the walk end up gapped — a span reserved next to a nested list may
     be dropped as empty, and descendants are wrapped after their parent. That
     matters because screen.js addresses sentences by data-i while tts.js
     collects them in DOM order, so a gap makes clicking a sentence start
     speech at a different one. */
  let n = 0;
  for (const span of root.querySelectorAll(".rt-s")) span.dataset.i = String(n++);
  return n;
}

/* ---------- reading stats (Flesch–Kincaid grade) ---------- */

export function computeStats(text) {
  const clean = normalizeText(text);
  const words = clean ? clean.split(/\s+/) : [];
  const sentenceCount = Math.max(1, (clean.match(/[.!?…]+/g) || []).length);
  let syllables = 0;
  for (const w of words) {
    const bare = w.replace(/[^\p{L}]/gu, "");
    if (!bare) continue;
    syllables += Math.max(1, hyphenateWord(bare).length);
  }
  const wc = Math.max(1, words.length);
  const grade = 0.39 * (wc / sentenceCount) + 11.8 * (syllables / wc) - 15.59;
  return {
    words: words.length,
    minutes: Math.max(1, Math.round(words.length / 230)),
    grade: Math.max(1, Math.round(grade)),
    gradeReliable: words.length >= 60 && sentenceCount >= 3,
    sentences: sentenceCount,
  };
}

/* ---------- typography ---------- */

export function applyTypography(host, p) {
  const prof = { ...DEFAULT_PROFILE, ...p };
  host.classList.add("rt-surface");
  host.dataset.rtOverlay = OVERLAYS[prof.overlay] ? prof.overlay : "none";
  host.dataset.rtFont = prof.font;
  host.dataset.rtPacing = prof.pacing || "flow";
  host.dataset.rtHideImages = prof.hideImages ? "true" : "false";
  host.dataset.rtFreeze = prof.freezeMotion ? "true" : "false";
  host.dataset.rtDeitalic = prof.deItalic ? "true" : "false";
  host.dataset.rtFocus = prof.focus || "off";
  host.dataset.rtLineTint = LINE_TINTS[prof.lineTint] ? prof.lineTint : "off";

  const s = host.style;
  s.setProperty("--rt-font-size", `${prof.fontSize}px`);
  s.setProperty("--rt-line-height", String(prof.lineHeight));
  s.setProperty("--rt-letter-spacing", `${prof.letterSpacing}em`);
  s.setProperty("--rt-word-spacing", `${prof.wordSpacing}em`);
  s.setProperty("--rt-para-space", `${prof.paragraphSpacing}em`);
  s.setProperty("--rt-measure", `${prof.columnWidth}ch`);
  s.setProperty("--rt-contrast", String((prof.contrast ?? 100) / 100));
  s.setProperty("--rt-ruler-h", `${prof.rulerHeight || 40}px`);

  /* The line-tint gradient repeats every two lines, so consecutive lines get
     different colours and the return sweep has something to aim at. Sized in
     `lh` so it re-registers automatically when line spacing changes. */
  const tint = LINE_TINTS[prof.lineTint];
  if (tint && tint.stops) {
    /* The stops replace the article's ink outright, so on a dark reading
       surface the dark set drops to about 1:1 contrast and the text vanishes.
       Pick the set that matches the surface actually in use. */
    const overlay = OVERLAYS[prof.overlay] || OVERLAYS.none;
    const surface =
      prof.overlay === "custom" && /^#[0-9a-fA-F]{6}$/.test(prof.customTint || "") ? prof.customTint : overlay.surface;
    const stops = isDarkSurface(surface) ? tint.darkStops || tint.stops : tint.stops;
    s.setProperty("--rt-linetint-a", stops[0]);
    s.setProperty("--rt-linetint-b", stops[1]);
  } else {
    s.removeProperty("--rt-linetint-a");
    s.removeProperty("--rt-linetint-b");
  }

  if (prof.overlay === "custom" && /^#[0-9a-fA-F]{6}$/.test(prof.customTint || "")) {
    const { r, g, b } = hexToRgb(prof.customTint);
    const dark = r * 0.299 + g * 0.587 + b * 0.114 < 140;
    s.setProperty("--rt-surface", prof.customTint);
    s.setProperty("--rt-ink", dark ? "#f2f0ea" : "#1f2430");
    s.setProperty("--rt-faint", `rgba(${dark ? "255,255,255" : "0,0,0"}, 0.14)`);
  } else {
    s.removeProperty("--rt-surface");
    s.removeProperty("--rt-ink");
    s.removeProperty("--rt-faint");
  }
}

export function paintPage(p) {
  const prof = { ...DEFAULT_PROFILE, ...p };
  let bg = (OVERLAYS[prof.overlay] || OVERLAYS.none).surface;
  let ink = (OVERLAYS[prof.overlay] || OVERLAYS.none).ink;
  if (prof.overlay === "custom" && /^#[0-9a-fA-F]{6}$/.test(prof.customTint || "")) bg = prof.customTint;
  document.documentElement.style.setProperty("--rt-page-bg", bg);
  document.documentElement.style.setProperty("--rt-page-ink", ink);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/* ============================================================
   Reading-view controller
   ============================================================ */

export function createReadingView(host) {
  host.classList.add("rt-surface");

  const column = document.createElement("div");
  column.className = "rt-column";

  const docHead = document.createElement("header");
  docHead.className = "rt-doc-head";
  docHead.hidden = true;
  const docHeadTop = document.createElement("div");
  docHeadTop.className = "rt-doc-head-top";
  const docTitle = document.createElement("h1");
  docTitle.className = "rt-doc-title";
  const docActions = document.createElement("div");
  docActions.className = "rt-doc-actions";
  docActions.hidden = true;
  const docMeta = document.createElement("p");
  docMeta.className = "rt-doc-meta";
  docHeadTop.append(docTitle, docActions);
  docHead.append(docHeadTop, docMeta);

  const flow = document.createElement("div");
  flow.className = "rt-article";

  const stage = document.createElement("div");
  stage.className = "rt-chunk-stage";
  const sentenceEl = document.createElement("div");
  sentenceEl.className = "rt-chunk-sentence";
  stage.appendChild(sentenceEl);

  const rsvpStage = document.createElement("div");
  rsvpStage.className = "rt-rsvp-stage";
  const rsvpFrame = document.createElement("div");
  rsvpFrame.className = "rt-rsvp-frame";
  const rsvpWord = document.createElement("span");
  rsvpWord.className = "rt-rsvp-word";
  rsvpFrame.appendChild(rsvpWord);
  const rsvpHint = document.createElement("p");
  rsvpHint.className = "rt-doc-meta";
  rsvpHint.textContent = "Space to play or pause · ← → to step";
  rsvpStage.append(rsvpFrame, rsvpHint);

  column.append(docHead, flow, stage, rsvpStage);
  host.append(column);

  let pristine = document.createDocumentFragment();
  let chunks = [];
  let words = [];
  let idx = 0;
  let rsvpIdx = 0;
  let rsvpTimer = 0;
  let rsvpPlaying = false;
  let profile = { ...DEFAULT_PROFILE };
  let onEvent = () => {};
  let metaTitleText = "";
  let metaParts = [];
  let metaActions = 0;

  const cloneKids = (frag) => Array.from(frag.cloneNode(true).childNodes);

  function syncDocHead() {
    docActions.hidden = metaActions === 0;
    docHead.hidden = !metaTitleText && !metaParts.length && metaActions === 0;
  }

  function renderFlow() {
    flow.replaceChildren(...cloneKids(pristine));
    wrapSentences(flow);
    if (profile.bionic) applyBionic(flow, profile.bionic);
    if (profile.syllables) applySyllables(flow);
    flow.dataset.rtHyphenate = profile.hyphenate ? "true" : "false";
  }

  /* sentence mode */
  function renderSentence() {
    if (!chunks.length) {
      sentenceEl.textContent = "Nothing to show here.";
      return;
    }
    idx = Math.max(0, Math.min(idx, chunks.length - 1));
    const c = chunks[idx];
    sentenceEl.textContent = c.text;
    sentenceEl.classList.toggle("rt-chunk-heading", !!c.heading);
    if (profile.bionic && !c.heading) applyBionic(sentenceEl, profile.bionic);
    if (profile.syllables && !c.heading) applySyllables(sentenceEl);
    onEvent({ type: "progress", value: chunks.length ? idx / (chunks.length - 1 || 1) : 0, label: `${idx + 1} / ${chunks.length}` });
  }

  /* word / RSVP mode */
  function pivotIndex(w) {
    const len = w.replace(/[^\p{L}\p{N}]/gu, "").length;
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    return 3;
  }
  function renderRsvpWord() {
    if (!words.length) {
      rsvpWord.textContent = "—";
      return;
    }
    rsvpIdx = Math.max(0, Math.min(rsvpIdx, words.length - 1));
    const w = words[rsvpIdx];
    const p = Math.min(pivotIndex(w), w.length - 1);
    rsvpWord.replaceChildren(
      document.createTextNode(w.slice(0, p)),
      Object.assign(document.createElement("span"), { className: "rt-rsvp-pivot", textContent: w[p] || "" }),
      document.createTextNode(w.slice(p + 1))
    );
    rsvpFrame.style.setProperty("--rt-rsvp-offset", String(p - w.length / 2 + 0.5));
    onEvent({
      type: "progress",
      value: words.length ? rsvpIdx / (words.length - 1 || 1) : 0,
      label: `${rsvpIdx + 1} / ${words.length}`,
    });
  }
  function rsvpDelay(w) {
    const base = 60000 / Math.max(60, profile.wpm);
    let d = base;
    if (/[.!?…]$/.test(w)) d *= 2.2;
    else if (/[,;:]$/.test(w)) d *= 1.6;
    else if (w.length > 8) d *= 1.25;
    return d;
  }
  function rsvpStep(dir) {
    stopRsvp();
    rsvpIdx += dir;
    renderRsvpWord();
  }
  function playRsvp() {
    if (!words.length) return;
    rsvpPlaying = true;
    onEvent({ type: "playing", value: true });
    const tick = () => {
      if (!rsvpPlaying) return;
      renderRsvpWord();
      if (rsvpIdx >= words.length - 1) {
        stopRsvp();
        return;
      }
      rsvpTimer = setTimeout(() => {
        rsvpIdx++;
        tick();
      }, rsvpDelay(words[rsvpIdx]));
    };
    tick();
  }
  function stopRsvp() {
    rsvpPlaying = false;
    clearTimeout(rsvpTimer);
    onEvent({ type: "playing", value: false });
  }

  function render() {
    const mode = profile.pacing || "flow";
    flow.hidden = !(mode === "flow" || mode === "scroll" || mode === "aloud");
    stage.hidden = mode !== "sentence";
    rsvpStage.hidden = mode !== "word";

    if (!flow.hidden) renderFlow();
    if (mode === "sentence") renderSentence();
    if (mode === "word") {
      words = (pristine.textContent.match(/\S+/g) || []).slice();
      rsvpIdx = Math.min(rsvpIdx, Math.max(0, words.length - 1));
      renderRsvpWord();
    }
    onEvent({ type: "mode", value: mode });
  }

  /* keyboard for sentence + word modes */
  function onKey(e) {
    const mode = profile.pacing;
    if (mode === "sentence" && !stage.hidden) {
      if (e.key === "ArrowRight" || e.key === " ") {
        if (idx < chunks.length - 1) {
          idx++;
          renderSentence();
        }
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        if (idx > 0) {
          idx--;
          renderSentence();
        }
        e.preventDefault();
      }
    } else if (mode === "word" && !rsvpStage.hidden) {
      if (e.key === " ") {
        rsvpPlaying ? stopRsvp() : playRsvp();
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        rsvpStep(1);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        rsvpStep(-1);
        e.preventDefault();
      }
    }
  }
  document.addEventListener("keydown", onKey);

  render();

  return {
    setArticleHtml(rawHtml, baseUrl) {
      const built = buildArticleFragment(rawHtml, baseUrl);
      pristine = built.quality.ok ? built.fragment : document.createDocumentFragment();
      chunks = buildChunks(pristine);
      idx = rsvpIdx = 0;
      render();
      return { extracted: built.extracted, meta: built.meta, quality: built.quality };
    },
    setText(text) {
      pristine = textToFragment(text);
      chunks = buildChunks(pristine);
      idx = rsvpIdx = 0;
      render();
    },
    setMeta({ title = "", parts = [] } = {}) {
      metaTitleText = title || "";
      metaParts = parts.filter(Boolean);
      docTitle.textContent = metaTitleText;
      docMeta.replaceChildren(
        ...metaParts.map((t) => Object.assign(document.createElement("span"), { textContent: t }))
      );
      syncDocHead();
    },
    setActions(actions = []) {
      const list = Array.isArray(actions) ? actions.filter(Boolean) : [];
      metaActions = list.length;

      /* Update in place wherever the shape matches.
         replaceChildren() destroys the node the reader is standing on: a
         keyboard user who tabs to Pause and presses it loses focus the instant
         the label becomes Resume, and can't press it again without navigating
         back. The label is the thing that changes here, not the button. */
      const existing = Array.from(docActions.children);
      const sameShape =
        existing.length === list.length &&
        list.every((a, i) => existing[i].tagName === (a.href ? "A" : "BUTTON"));

      const dress = (node, a) => {
        node.className = "rt-doc-action" + (a.primary ? " rt-doc-action-primary" : "");
        if (node.textContent !== (a.label || "")) node.textContent = a.label || "";
        if (a.title) node.title = a.title;
        else node.removeAttribute("title");
        if (a.href) {
          node.href = a.href;
          node.target = "_blank";
          node.rel = "noopener";
        } else {
          node.type = "button";
          node.__rtClick = typeof a.onClick === "function" ? a.onClick : null;
        }
        if (a.disabled) node.setAttribute("disabled", "");
        else node.removeAttribute("disabled");
        if (a.pressed != null) node.setAttribute("aria-pressed", a.pressed ? "true" : "false");
        else node.removeAttribute("aria-pressed");
      };

      if (sameShape) {
        list.forEach((a, i) => dress(existing[i], a));
      } else {
        docActions.replaceChildren(
          ...list.map((a) => {
            const node = document.createElement(a.href ? "a" : "button");
            /* One listener for the life of the node, so re-dressing it below
               never has to detach and reattach handlers. */
            if (!a.href) node.addEventListener("click", () => node.__rtClick && node.__rtClick());
            dress(node, a);
            return node;
          })
        );
      }
      syncDocHead();
    },
    applyProfile(next) {
      const prev = profile;
      profile = { ...DEFAULT_PROFILE, ...next };
      applyTypography(host, profile);
      const heavyChanged =
        prev.bionic !== profile.bionic ||
        prev.syllables !== profile.syllables ||
        prev.pacing !== profile.pacing ||
        prev.hyphenate !== profile.hyphenate;
      if (heavyChanged) {
        if (prev.pacing === "word" && profile.pacing !== "word") stopRsvp();
        render();
      } else {
        flow.dataset.rtHyphenate = profile.hyphenate ? "true" : "false";
      }
    },
    /* sentence-mode controls */
    step(dir) {
      if (profile.pacing === "sentence") {
        idx = Math.max(0, Math.min(chunks.length - 1, idx + dir));
        renderSentence();
      } else if (profile.pacing === "word") {
        rsvpStep(dir);
      }
    },
    play() {
      if (profile.pacing === "word") playRsvp();
    },
    pause() {
      stopRsvp();
    },
    isPlaying() {
      return rsvpPlaying;
    },
    seek(fraction) {
      if (profile.pacing === "sentence") {
        idx = Math.round(fraction * (chunks.length - 1));
        renderSentence();
      } else if (profile.pacing === "word") {
        stopRsvp();
        rsvpIdx = Math.round(fraction * (words.length - 1));
        renderRsvpWord();
      }
    },
    on(cb) {
      onEvent = typeof cb === "function" ? cb : () => {};
    },
    getFlowEl() {
      return flow;
    },
    /* Whatever the reader is actually looking at. In flow pacing that is the
       article; in sentence and word pacing the flow is hidden and a chunk
       element is on screen instead. Anything anchored to the words a reader
       can see — word lookup, for one — has to ask for this, not the flow. */
    getVisibleTextEl() {
      if (sentenceEl && sentenceEl.isConnected && !sentenceEl.hidden && sentenceEl.offsetParent !== null) return sentenceEl;
      if (rsvpWord && rsvpWord.isConnected && !rsvpWord.hidden && rsvpWord.offsetParent !== null) return rsvpWord;
      return flow;
    },
    isEmpty() {
      return pristine.textContent.trim().length === 0;
    },
    getPlainText() {
      return pristine.textContent.replace(/\s+/g, " ").trim();
    },
    getStats() {
      return computeStats(pristine.textContent);
    },
    destroy() {
      stopRsvp();
      document.removeEventListener("keydown", onKey);
    },
  };
}
