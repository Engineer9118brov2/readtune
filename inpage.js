/*
 * ReadTune — restyle this page (in place)
 *
 * Injected on demand (activeTab) by the popup button or Alt+Shift+R. Runs the
 * saved reading profile against the page you're already on — font, spacing,
 * tint, bionic bolding, reading ruler — without leaving it. Injecting again (or
 * the bar's ✕) removes everything cleanly.
 *
 * Not a module (chrome.scripting file injections aren't), so it dynamically
 * imports the shared, web-accessible pieces.
 */

// Chrome runs every executeScript({ files: ["inpage.js"] }) into ONE shared
// script scope in the page's isolated world. Re-injection is how the popup
// button and Alt+Shift+R toggle this off — so a top-level `const` here throws
// "already declared" on the second run and the toggle silently dies. `var` is
// deliberate: it re-binds on each injection instead of colliding. All state that
// has to survive between injections lives on `window`.
var __readtuneToggleOff = !!window.__readtuneInpage;
var __readtuneExistingBoot = window.__readtuneInpageBootStatus === "pending";
var __readtuneBoot = (async () => {
  if (__readtuneToggleOff) {
    window.__readtuneInpage.toggleOff();
    return;
  }
  if (__readtuneExistingBoot) return;
  if (window.__readtuneInpageBoot) {
    delete window.__readtuneInpageBoot;
    delete window.__readtuneInpageBootStatus;
  }

  const S = await import(chrome.runtime.getURL("shared/settings.js"));
  const { inpageCSS } = await import(chrome.runtime.getURL("shared/inpage-style.js"));
  const { measuredLineHeight, adaptiveRulerHeight, normalizeRulerLines, rulerSpanLabel } = await import(
    chrome.runtime.getURL("shared/ruler.js")
  );
  const { findPageNarration, narrationPlaying } = await import(chrome.runtime.getURL("shared/page-audio.js"));

  const FONT_ORDER = ["sans", "dyslexic", "atkinson", "lexend"];
  const FONT_LABEL = { sans: "System Sans", dyslexic: "OpenDyslexic", atkinson: "Atkinson", lexend: "Lexend" };
  const TINT_ORDER = ["none", "cream", "yellow", "blue", "green", "grey", "dark"];

  const fontFace = `
@font-face{font-family:"OpenDyslexic";src:url("${chrome.runtime.getURL("lib/fonts/opendyslexic-400.woff2")}") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"OpenDyslexic";src:url("${chrome.runtime.getURL("lib/fonts/opendyslexic-700.woff2")}") format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Atkinson Hyperlegible";src:url("${chrome.runtime.getURL("lib/fonts/atkinson-400.woff2")}") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Atkinson Hyperlegible";src:url("${chrome.runtime.getURL("lib/fonts/atkinson-700.woff2")}") format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Lexend";src:url("${chrome.runtime.getURL("lib/fonts/lexend-400.woff2")}") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Lexend";src:url("${chrome.runtime.getURL("lib/fonts/lexend-700.woff2")}") format("woff2");font-weight:700;font-display:swap}`;

  let profile = await S.loadProfile();
  let removed = false;

  /* ---------- injected stylesheet ---------- */
  const styleEl = document.createElement("style");
  styleEl.id = "readtune-inpage";
  document.documentElement.appendChild(styleEl);
  document.documentElement.classList.add("rt-inpage");

  function applyStyle() {
    styleEl.textContent = inpageCSS(profile, fontFace);
  }

  /* ---------- bionic bolding ---------- */
  const SKIP = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "KBD", "SAMP", "TEXTAREA",
    "INPUT", "SELECT", "BUTTON", "SVG", "CANVAS", "VIDEO", "AUDIO", "RT-BIONIC",
  ]);

  function removeBionic() {
    document.querySelectorAll("rt-bionic").forEach((w) => {
      const t = document.createTextNode(w.textContent);
      w.parentNode.replaceChild(t, w);
    });
  }

  function applyBionic(pct) {
    removeBionic();
    if (!pct) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue;
        if (!v || !v.trim() || v.length > 2000) return NodeFilter.FILTER_REJECT;
        let el = node.parentNode;
        while (el && el.nodeType === 1 && el !== document.body) {
          if (SKIP.has(el.nodeName) || el.isContentEditable || el.id === "readtune-bar-host") {
            return NodeFilter.FILTER_REJECT;
          }
          el = el.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const tn of nodes.slice(0, 6000)) {
      const frag = document.createDocumentFragment();
      let touched = false;
      for (const tok of tn.nodeValue.split(/(\s+)/)) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) {
          frag.appendChild(document.createTextNode(tok));
          continue;
        }
        const m = tok.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’·-]*)(.*)$/u);
        if (!m) {
          frag.appendChild(document.createTextNode(tok));
          continue;
        }
        touched = true;
        const core = m[2];
        const cut = core.length <= 3 ? 1 : Math.max(1, Math.min(core.length - 1, Math.round((core.length * pct) / 100)));
        const wrap = document.createElement("rt-bionic");
        const b = document.createElement("b");
        b.textContent = core.slice(0, cut);
        wrap.append(document.createTextNode(m[1]), b, document.createTextNode(core.slice(cut) + m[3]));
        frag.appendChild(wrap);
      }
      if (touched) tn.parentNode.replaceChild(frag, tn);
    }
  }

  /* ---------- reading ruler ---------- */
  let ruler = null;
  let rulerX = window.innerWidth / 2;
  let rulerY = window.innerHeight * 0.4;
  function onPointer(e) {
    rulerY = e.clientY;
    rulerX = e.clientX;
    if (ruler) {
      const h = currentRulerHeight();
      ruler.style.height = h + "px";
      ruler.style.top = Math.max(0, e.clientY - h / 2) + "px";
    }
  }
  function currentRulerHeight() {
    const fallback = (Number(profile.fontSize) || 19) * (Number(profile.lineHeight) || 1.6);
    const target = document.elementFromPoint(
      Math.max(8, Math.min(window.innerWidth - 8, rulerX)),
      Math.max(8, Math.min(window.innerHeight - 8, rulerY))
    );
    const style = target ? getComputedStyle(target) : null;
    return adaptiveRulerHeight({
      lineHeightPx: measuredLineHeight(style, fallback),
      fontSizePx: style ? parseFloat(style.fontSize) || Number(profile.fontSize) || 19 : Number(profile.fontSize) || 19,
      baseHeight: Number(profile.rulerHeight) || 40,
      lines: profile.rulerLines,
    });
  }
  function applyRuler(on) {
    if (on && !ruler) {
      ruler = document.createElement("div");
      ruler.id = "readtune-ruler";
      document.documentElement.appendChild(ruler);
      window.addEventListener("pointermove", onPointer, { passive: true });
      onPointer({ clientX: rulerX, clientY: rulerY });
    } else if (on && ruler) {
      onPointer({ clientX: rulerX, clientY: rulerY });
    } else if (!on && ruler) {
      window.removeEventListener("pointermove", onPointer);
      ruler.remove();
      ruler = null;
    }
  }

  /* ---------- control bar (shadow DOM, isolated from page CSS) ---------- */
  const barHost = document.createElement("div");
  barHost.id = "readtune-bar-host";
  barHost.style.cssText = "position:fixed;z-index:2147483647;right:14px;bottom:14px;";
  const root = barHost.attachShadow({ mode: "open" });
  const barCssUrl = chrome.runtime.getURL("inpage.css");
  root.innerHTML =
    `<link rel="stylesheet" href="${barCssUrl}">` +
    `<div class="bar" part="bar" role="toolbar" aria-label="ReadTune">
       <button data-a="font"  title="Change font">Aa&nbsp;<i data-l="font"></i></button>
       <button data-a="size-" title="Smaller text" aria-label="Smaller text">A<span class="sm">−</span></button>
       <button data-a="size+" title="Larger text" aria-label="Larger text">A<span class="lg">+</span></button>
       <button data-a="lead"  title="Line spacing" aria-label="Line spacing"><i data-l="lead"></i></button>
       <button data-a="tint"  title="Reading tint" aria-label="Reading tint"><span class="dot" data-l="tint"></span><span>Tint</span></button>
       <button data-a="bionic" title="Bold the start of each word" aria-label="Bionic bolding">Bionic</button>
       <button data-a="ruler" title="Line guide that follows your cursor" aria-label="Reading ruler">Ruler&nbsp;<i data-l="ruler"></i></button>
       <button data-a="pageaudio" hidden></button>
       <span class="sep"></span>
       <button data-a="reader" title="Open the full Reader View" aria-label="Open Reader View">Reader&nbsp;View</button>
       <button data-a="off"   title="Turn ReadTune off on this page" aria-label="Turn off">Done</button>
     </div>`;
  document.documentElement.appendChild(barHost);

  const leadCycle = [1.55, 1.75, 1.95, 2.2];
  function paintBar() {
    root.querySelector('[data-l="font"]').textContent = FONT_LABEL[profile.font] || "";
    root.querySelector('[data-l="lead"]').textContent = "↕" + (profile.lineHeight || 1.6).toFixed(1);
    const dot = root.querySelector('[data-l="tint"]');
    const t = { none: "#fbfaf7", cream: "#f7f0dc", yellow: "#fbf3cc", blue: "#e3eef6", green: "#e6f1e6", grey: "#eceae6", dark: "#181a1d", peach: "#faeee6", rose: "#f7e9ee", custom: profile.customTint }[profile.overlay];
    dot.style.background = t || "#fbfaf7";
    const rulerLines = normalizeRulerLines(profile.rulerLines);
    const rulerBtn = root.querySelector('[data-a="ruler"]');
    root.querySelector('[data-l="ruler"]').textContent = rulerSpanLabel(rulerLines, { compact: true });
    root.querySelector('[data-a="bionic"]').classList.toggle("on", !!profile.bionic);
    rulerBtn.classList.toggle("on", profile.focus === "ruler");
    rulerBtn.title = `Reading ruler · ${rulerSpanLabel(rulerLines)}`;
    rulerBtn.setAttribute(
      "aria-label",
      profile.focus === "ruler" ? `Reading ruler on, ${rulerSpanLabel(rulerLines)}` : `Turn on reading ruler, ${rulerSpanLabel(rulerLines)}`
    );
  }

  /* ---------- the page's own narration ("Listen to this article") ---------- */
  const pageAudioBtn = root.querySelector('[data-a="pageaudio"]');
  let narration = null; // { kind, el }
  let narrationAudio = null; // the <audio> element we attached listeners to
  let narrationStateObserver = null; // state classes/attrs on third-party players
  const narrationRetries = [];
  let narrationObserver = null;
  let narrationMutationTimer = 0;

  // A real button we can safely fire a synthetic click on. Anchors are
  // scroll-only even when they carry role="button" — clicking one can follow
  // its href and navigate the reader off the article.
  const isClickableControl = (el) =>
    el.tagName !== "A" && el.matches('button, [role="button"], input[type="button"]');

  function paintPageAudio() {
    if (!narration) {
      pageAudioBtn.hidden = true;
      return;
    }
    pageAudioBtn.hidden = false;
    const playing = narrationPlaying(narration);
    if (narration.kind === "audio" || (narration.kind === "control" && isClickableControl(narration.el))) {
      pageAudioBtn.textContent = playing ? "❙❙ Page audio" : "▶ Page audio";
      pageAudioBtn.title = playing ? "Pause the page's own narration" : "Play the page's own narration";
      pageAudioBtn.classList.toggle("on", playing);
    } else if (narration.kind === "embed") {
      pageAudioBtn.textContent = "♪ Podcast";
      pageAudioBtn.title = "This page embeds a podcast — jump to the player";
      pageAudioBtn.classList.remove("on");
    } else if (isClickableControl(narration.el)) {
      pageAudioBtn.textContent = "▶ Page audio";
      pageAudioBtn.title = "This page has its own “Listen” — start the page's player";
      pageAudioBtn.classList.remove("on");
    } else {
      pageAudioBtn.textContent = "♪ Page audio";
      pageAudioBtn.title = "Jump to this page's own “Listen to this article”";
      pageAudioBtn.classList.remove("on");
    }
    pageAudioBtn.setAttribute("aria-label", pageAudioBtn.title);
  }

  function detachNarrationAudio() {
    if (narrationStateObserver) {
      narrationStateObserver.disconnect();
      narrationStateObserver = null;
    }
    if (!narrationAudio) return;
    narrationAudio.removeEventListener("play", paintPageAudio);
    narrationAudio.removeEventListener("pause", paintPageAudio);
    narrationAudio.removeEventListener("ended", paintPageAudio);
    narrationAudio = null;
  }

  function mountNarration() {
    if (removed) return;
    // A client-side route change can swap out the element we locked onto. If
    // ours has left the document, drop it and look again.
    if (narration && !narration.el.isConnected) {
      detachNarrationAudio();
      narration = null;
    }
    if (narration) return;
    let found = null;
    try {
      found = findPageNarration(document);
    } catch {
      found = null;
    }
    if (!found) return;
    narration = found;
    if (narration.kind === "audio") {
      narrationAudio = narration.el;
      narrationAudio.addEventListener("play", paintPageAudio);
      narrationAudio.addEventListener("pause", paintPageAudio);
      narrationAudio.addEventListener("ended", paintPageAudio);
    } else if (narration.kind === "control" && typeof MutationObserver !== "undefined") {
      // Third-party controls expose state through class/data attributes rather
      // than media events. Watch only the small player subtree, not the page.
      let context = narration.el;
      for (let i = 0; i < 3 && context.parentElement; i++) context = context.parentElement;
      narrationStateObserver = new MutationObserver(() => paintPageAudio());
      narrationStateObserver.observe(context, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-pressed", "data-playback-state", "data-controlbar-playing"],
      });
    }
    paintPageAudio();
  }

  function triggerPageAudio() {
    if (narration && !narration.el.isConnected) mountNarration(); // re-find after an SPA nav
    if (!narration) {
      mountNarration();
      if (!narration) return;
    }
    if (narration.kind === "audio") {
      if (narration.el.paused || narration.el.ended) {
        const p = narration.el.play();
        if (p && p.catch) p.catch(() => {});
      } else {
        narration.el.pause();
      }
      paintPageAudio();
      return;
    }
    // embed / control: bring it into view, then hand off to the page's own UI.
    try {
      narration.el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      narration.el.scrollIntoView();
    }
    // Click a real button for the reader; for a link, just reveal it and let
    // them decide — a synthetic click could navigate the whole page away.
    if (narration.kind === "control" && isClickableControl(narration.el)) {
      try {
        narration.el.click();
        // Give page frameworks a chance to flip their playback state, then
        // mirror it in ReadTune even if they do not mutate a watched attribute.
        setTimeout(paintPageAudio, 80);
        setTimeout(paintPageAudio, 260);
      } catch {
        /* the page's handler threw — nothing we can do */
      }
    }
  }

  root.querySelector(".bar").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-a]");
    if (!btn) return;
    const a = btn.dataset.a;
    const patch = {};
    if (a === "font") patch.font = FONT_ORDER[(FONT_ORDER.indexOf(profile.font) + 1) % FONT_ORDER.length];
    else if (a === "size-") patch.fontSize = Math.max(13, profile.fontSize - 1);
    else if (a === "size+") patch.fontSize = Math.min(34, profile.fontSize + 1);
    else if (a === "lead") patch.lineHeight = leadCycle[(leadCycle.findIndex((v) => v >= profile.lineHeight) + 1) % leadCycle.length];
    else if (a === "tint") patch.overlay = TINT_ORDER[(TINT_ORDER.indexOf(profile.overlay) + 1) % TINT_ORDER.length];
    else if (a === "bionic") patch.bionic = profile.bionic ? 0 : 40;
    else if (a === "ruler") {
      const rulerLines = normalizeRulerLines(profile.rulerLines);
      if (profile.focus !== "ruler") {
        patch.focus = "ruler";
        patch.rulerLines = rulerLines;
      } else if (rulerLines === 1) {
        patch.rulerLines = 3;
      } else if (rulerLines === 3) {
        patch.rulerLines = 5;
      } else {
        patch.focus = "off";
        patch.rulerLines = 1;
      }
    }
    else if (a === "pageaudio") {
      triggerPageAudio();
      return;
    } else if (a === "reader") {
      chrome.runtime.sendMessage({ type: "readtune-open-reader" });
      return;
    } else if (a === "off") {
      window.__readtuneInpage.toggleOff();
      return;
    }
    profile = S.normalizeProfile({ ...profile, ...patch });
    reapply(patch);
    selfWrite = JSON.stringify(profile);
    await S.writeProfile(profile); // whole-object write — the bar holds the full profile, avoids read-modify-write races
  });

  /* ---------- apply / react ---------- */
  function reapply(patch = {}) {
    applyStyle();
    if ("bionic" in patch || patch.__full) applyBionic(profile.bionic);
    applyRuler(profile.focus === "ruler");
    paintBar();
  }

  let selfWrite = ""; // JSON of the profile we last wrote, so our own writes don't re-trigger a full reapply
  const onStorage = (changes, area) => {
    if (area !== "local" || !changes[S.PROFILE_KEY]) return;
    const next = S.normalizeProfile(changes[S.PROFILE_KEY].newValue);
    if (JSON.stringify(next) === selfWrite) return;
    profile = next;
    reapply({ __full: true });
  };
  chrome.storage.onChanged.addListener(onStorage);

  function toggleOff() {
    if (removed) return;
    removed = true;
    chrome.storage.onChanged.removeListener(onStorage);
    window.removeEventListener("pointermove", onPointer);
    narrationRetries.forEach((t) => { clearTimeout(t); clearInterval(t); });
    clearTimeout(narrationMutationTimer);
    if (narrationObserver) narrationObserver.disconnect();
    narrationObserver = null;
    detachNarrationAudio();
    removeBionic();
    styleEl.remove();
    barHost.remove();
    if (ruler) ruler.remove();
    document.documentElement.classList.remove("rt-inpage");
    delete window.__readtuneInpage;
    delete window.__readtuneInpageBoot;
    delete window.__readtuneInpageBootStatus;
  }

  window.__readtuneInpage = { toggleOff };

  // first paint
  applyStyle();
  applyBionic(profile.bionic);
  applyRuler(profile.focus === "ruler");
  paintBar();

  // Look for the page's own "Listen to this article" now. Newsroom players
  // are often hydrated after the article itself (CNBC's JW audio player does
  // this), so also watch child insertions instead of relying only on a couple
  // of lucky timeout scans. Debounce the observer: a player can add dozens of
  // nodes while booting and one scan after the burst is enough.
  mountNarration();
  if (typeof MutationObserver !== "undefined" && document.documentElement) {
    narrationObserver = new MutationObserver(() => {
      if (removed) return;
      clearTimeout(narrationMutationTimer);
      narrationMutationTimer = setTimeout(() => mountNarration(), 140);
    });
    narrationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const delay of [1400, 4000, 9000, 18000]) {
    narrationRetries.push(setTimeout(() => {
      if (!removed) mountNarration();
    }, delay));
  }
  // A low-frequency sweep covers player state/SPA changes that do not replace
  // child nodes in a useful way. It is deliberately bounded on pages where no
  // narration ever appears; the MutationObserver remains the cheap late-load
  // path after that.
  let narrationSweeps = 0;
  const narrationWatch = setInterval(() => {
    if (removed) return;
    mountNarration();
    if (!narration && ++narrationSweeps >= 8) clearInterval(narrationWatch);
  }, 4000);
  narrationRetries.push(narrationWatch);
})();

// File injection itself is synchronous; expose the async boot so callers
// (background.js / popup.js) can await imports, fonts, and the first paint
// before reporting success.
if (!__readtuneToggleOff && !__readtuneExistingBoot) {
  window.__readtuneInpageBoot = __readtuneBoot;
  window.__readtuneInpageBootStatus = "pending";
}
__readtuneBoot.then(() => {
  if (window.__readtuneInpageBoot === __readtuneBoot) window.__readtuneInpageBootStatus = "ready";
}, (err) => {
  if (window.__readtuneInpageBoot === __readtuneBoot) {
    window.__readtuneInpageBootStatus = "failed";
    // Drop the handle so a later re-injection can retry from a clean slate.
    delete window.__readtuneInpageBoot;
  }
  console.warn("[ReadTune] in-page restyle failed to initialize:", err);
});
