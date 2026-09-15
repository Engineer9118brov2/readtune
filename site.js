/* Vercel Web Analytics — the readtune.tech marketing site only.
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

/* Vercel Speed Insights — the readtune.tech marketing site only, same scope
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

document.documentElement.classList.add("js-ready");
const specimen = document.querySelector("#specimen-reading");

/* Reveal long-form sections as they enter the viewport. Content stays visible
   when IntersectionObserver is unavailable or motion is reduced. */
(function revealSections() {
  const items = [...document.querySelectorAll("[data-reveal]")];
  if (!items.length) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries, current) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      current.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px" });
  items.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 45, 180)}ms`;
    observer.observe(item);
  });
})();

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

/* Read this marketing page aloud with the browser's local/system voice. The
   header play button is the accessible control; the O in “Stop” mirrors it as
   a visual mouse/touch shortcut without becoming part of the H1 name. */
(function readPageAloud() {
  const triggers = [...document.querySelectorAll("[data-say]")];
  if (!triggers.length) return;
  const synth = window.speechSynthesis;
  const supported = synth && typeof window.SpeechSynthesisUtterance === "function";
  if (!supported) {
    triggers.forEach((trigger) => trigger.remove());
    return;
  }

  const root = document.querySelector("main") || document.body;
  const skip = '.specimen, .audio-card, .ask-card, .section-label, .eyebrow, .mono-label, .card-label, .hero-proof, .voice-note, [aria-hidden="true"]';
  const cleanText = (node) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
    return clone.textContent.replace(/\s+/g, " ").replace(/([.!?])(?=[A-Za-z])/g, "$1 ").trim();
  };
  const splitSentences = (text) =>
    (text.match(/[^.!?]+[.!?]*\s*/g) || [text]).map((part) => part.trim()).filter(Boolean);
  const lines = [];
  root.querySelectorAll("h1, h2, h3, p, li").forEach((node) => {
    if (node.closest(skip)) return;
    const text = cleanText(node);
    if (text.length < 2) return;
    if (/^H[1-3]$/.test(node.tagName)) lines.push(text);
    else splitSentences(text).forEach((sentence) => lines.push(sentence));
  });
  if (!lines.length) return;

  const progress = document.body.appendChild(Object.assign(document.createElement("div"), { className: "say-progress" }));
  let playing = false;
  let index = 0;
  let run = 0;
  let voice = null;
  let keepAlive = 0;

  const pickVoice = () => {
    const voices = synth.getVoices() || [];
    const english = voices.filter((candidate) => /^en\b/i.test(candidate.lang));
    return english.find((candidate) => candidate.localService && /US|GB/i.test(candidate.lang))
      || english.find((candidate) => candidate.localService)
      || english[0]
      || voices[0]
      || null;
  };
  voice = pickVoice();
  synth.addEventListener?.("voiceschanged", () => { voice = pickVoice(); });

  const paint = () => {
    progress.classList.toggle("is-on", playing);
    progress.style.transform = `scaleX(${playing ? index / lines.length : 0})`;
    triggers.forEach((trigger) => {
      trigger.classList.toggle("is-playing", playing);
      if (trigger.getAttribute("aria-hidden") !== "true") {
        trigger.setAttribute("aria-label", playing ? "Stop reading this page" : "Read this page aloud");
      }
    });
  };

  const stop = () => {
    run += 1;
    playing = false;
    index = 0;
    clearInterval(keepAlive);
    try { synth.cancel(); } catch (e) {}
    paint();
  };

  const step = (mine) => {
    if (!playing || mine !== run) return;
    if (index >= lines.length) { stop(); return; }
    paint();
    const utterance = new SpeechSynthesisUtterance(lines[index]);
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    const advance = () => {
      if (!playing || mine !== run) return;
      index += 1;
      step(mine);
    };
    utterance.onend = advance;
    utterance.onerror = advance;
    try { synth.speak(utterance); } catch (e) { stop(); }
  };

  const start = () => {
    try { synth.cancel(); } catch (e) {}
    run += 1;
    playing = true;
    index = 0;
    clearInterval(keepAlive);
    keepAlive = setInterval(() => {
      try { if (synth.paused && playing) synth.resume(); } catch (e) {}
    }, 5000);
    step(run);
  };

  triggers.forEach((trigger) => trigger.addEventListener("click", () => (playing ? stop() : start())));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && playing) stop();
  });
  window.addEventListener("pagehide", stop);
})();
