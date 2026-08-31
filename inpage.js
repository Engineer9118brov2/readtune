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

const __readtuneToggleOff = !!window.__readtuneInpage;
const __readtuneExistingBoot = !!window.__readtuneInpageBoot && window.__readtuneInpageBootStatus !== "failed";
const __readtuneBoot = (async () => {
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
    else if (a === "reader") {
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
})();

// File injection itself is synchronous; expose the async boot so callers can
// wait for imports, fonts, and the first paint before reporting success.
if (!__readtuneToggleOff && !__readtuneExistingBoot) {
  window.__readtuneInpageBoot = __readtuneBoot;
  window.__readtuneInpageBootStatus = "pending";
}
__readtuneBoot.then(() => {
  if (window.__readtuneInpageBoot === __readtuneBoot) window.__readtuneInpageBootStatus = "ready";
}, (err) => {
  if (window.__readtuneInpageBoot === __readtuneBoot) window.__readtuneInpageBootStatus = "failed";
  console.warn("[ReadTune] in-page restyle failed to initialize:", err);
});
