/* Vercel Web Analytics — the readtune.app marketing site only.
   site.js is loaded by index/privacy/school.html and by nothing inside the
   extension, so no page the extension renders ever reaches this code.
   The script path is served by Vercel at runtime; off Vercel it 404s and the
   queue below is simply never drained. */
(function () {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  const s = document.createElement("script");
  s.defer = true;
  s.src = "/_vercel/insights/script.js";
  document.head.appendChild(s);
})();

/* Vercel Speed Insights — the readtune.app marketing site only, same scope
   and same reasoning as the Web Analytics loader above. */
(function () {
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  const s = document.createElement("script");
  s.defer = true;
  s.src = "/_vercel/speed-insights/script.js";
  s.dataset.sdkn = "@vercel/speed-insights";
  s.dataset.sdkv = "2.0.0";
  document.head.appendChild(s);
})();

/* Dyslexia-friendly view — OpenDyslexic + roomier spacing across the whole site.
   Persisted per browser; applied pre-paint by the inline <head> script. */
const DYS_KEY = "readtune-dys-view";
const dysToggle = document.querySelector("#dys-toggle");
if (dysToggle) {
  const setDys = (on) => {
    document.documentElement.classList.toggle("dys-mode", on);
    dysToggle.setAttribute("aria-pressed", on ? "true" : "false");
  };
  let dysOn = false;
  try { dysOn = localStorage.getItem(DYS_KEY) === "1"; } catch (e) {}
  setDys(dysOn);
  dysToggle.addEventListener("click", () => {
    dysOn = dysToggle.getAttribute("aria-pressed") !== "true";
    setDys(dysOn);
    try { localStorage.setItem(DYS_KEY, dysOn ? "1" : "0"); } catch (e) {}
  });
}

const specimen = document.querySelector("#specimen-reading");

document.querySelectorAll("[data-demo-font]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-demo-font]").forEach((item) => item.classList.toggle("is-active", item === button));
    specimen.dataset.demoFont = button.dataset.demoFont;
    const fonts = {
      atkinson: '"Atkinson Hyperlegible", sans-serif',
      dyslexic: '"OpenDyslexic", sans-serif',
      lexend: '"Lexend", sans-serif',
    };
    specimen.style.fontFamily = fonts[button.dataset.demoFont] || fonts.atkinson;
  });
});

document.querySelector("[data-demo-focus]")?.addEventListener("click", (button) => {
  const active = button.currentTarget;
  const rule = specimen.querySelector(".reading-rule");
  const isWide = active.dataset.demoFocus === "3";
  active.dataset.demoFocus = isWide ? "5" : "3";
  active.textContent = isWide ? "5-line focus" : "3-line focus";
  rule.style.height = isWide ? "134px" : "86px";
  rule.style.top = isWide ? "83px" : "105px";
});

document.querySelector(".play-button")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const playing = button.classList.toggle("is-playing");
  button.setAttribute("aria-label", playing ? "Pause preview" : "Play preview");
  button.innerHTML = playing ? "<span class=\"pause-icon\"></span>" : "<span></span>";
});

/* ---- Read this page aloud ------------------------------------------------
   Marketing-site only. Drives window.speechSynthesis — a browser/system voice,
   not the extension's on-device Piper engine. Two triggers, one controller:
   the nav "Listen" button and the O of "Stop" in the hero headline. */
(function readAloud() {
  const triggers = Array.from(document.querySelectorAll("[data-say]"));
  if (!triggers.length) return;

  const synth = window.speechSynthesis;
  const heroO = document.querySelector(".say-o");
  if (!synth || typeof window.SpeechSynthesisUtterance !== "function") {
    if (heroO) heroO.replaceWith(document.createTextNode("o")); // keep the word "Stop" whole
    triggers.forEach((t) => t !== heroO && t.remove());
    return;
  }

  // Build the reading list from the page's real prose, in document order.
  const root = document.querySelector("main") || document.body;
  const SKIP = '.specimen, .audio-card, .section-label, .eyebrow, .mono-label, .card-label, .hero-proof, .voice-note, [aria-hidden="true"]';
  const readText = (node) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(" ")); // <br> is a word break, not a join
    return clone.textContent.replace(/\s+/g, " ").replace(/([.!?])(?=[A-Za-z])/g, "$1 ").trim();
  };
  // "one. two." -> ["one.", "two."] without a lookbehind (Safari < 16.4)
  const sentences = (t) => (t.match(/[^.!?]+[.!?]*\s*/g) || [t]).map((s) => s.trim()).filter(Boolean);
  const lines = [];
  root.querySelectorAll("h1, h2, h3, p, li").forEach((node) => {
    if (node.closest(SKIP)) return;
    const text = readText(node);
    if (text.length < 2) return;
    // Headings read whole; body text splits on sentence ends so no single
    // utterance is long enough to trip Chrome's ~15s speechSynthesis cut-off.
    if (/^H[1-3]$/.test(node.tagName)) lines.push(text);
    else sentences(text).forEach((s) => lines.push(s));
  });
  if (!lines.length) return;

  const bar = document.body.appendChild(Object.assign(document.createElement("div"), { className: "say-progress" }));

  let playing = false;
  let at = 0;
  let run = 0;
  let voice = null;
  let keepAlive = 0;

  const pickVoice = () => {
    const all = synth.getVoices() || [];
    const en = all.filter((v) => /^en\b/i.test(v.lang));
    return en.find((v) => v.localService && /US|GB/i.test(v.lang)) || en.find((v) => v.localService) || en[0] || all[0] || null;
  };
  voice = pickVoice();
  synth.addEventListener && synth.addEventListener("voiceschanged", () => { voice = pickVoice(); });

  const paint = () => {
    bar.classList.toggle("is-on", playing);
    bar.style.transform = `scaleX(${playing ? at / lines.length : 0})`;
    triggers.forEach((t) => {
      t.classList.toggle("is-playing", playing);
      t.setAttribute("aria-label", playing ? "Stop reading this page" : "Read this page aloud");
    });
  };

  const stop = () => {
    run++;
    playing = false;
    at = 0;
    clearInterval(keepAlive);
    try { synth.cancel(); } catch (e) { /* ignore */ }
    paint();
  };

  const step = (mine) => {
    if (!playing || mine !== run) return;
    if (at >= lines.length) { stop(); return; }
    paint();
    const u = new SpeechSynthesisUtterance(lines[at]);
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onend = () => { if (playing && mine === run) { at += 1; step(mine); } };
    u.onerror = () => { if (playing && mine === run) { at += 1; step(mine); } };
    try { synth.speak(u); } catch (e) { stop(); }
  };

  const start = () => {
    try { synth.cancel(); } catch (e) { /* ignore */ }
    run++;
    playing = true;
    at = 0;
    // Chrome quietly pauses synthesis after ~15s; nudge it back if that happens.
    clearInterval(keepAlive);
    keepAlive = setInterval(() => {
      try { if (synth.paused && playing) synth.resume(); } catch (e) { /* ignore */ }
    }, 5000);
    step(run);
  };

  triggers.forEach((t) => t.addEventListener("click", () => (playing ? stop() : start())));
  document.addEventListener("keydown", (e) => e.key === "Escape" && playing && stop());
  window.addEventListener("pagehide", stop);
})();
