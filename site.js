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

/* ---- Hear the pitch --------------------------------------------------
   Marketing-site only. Plays one pre-recorded ElevenLabs narration of the
   short pitch (docs/PITCH-SCRIPT.md) — not a live read of the whole page,
   and not the extension's own on-device Piper engine. Two triggers, one
   <audio> element: the nav "Listen" button and the O of "Stop" in the
   hero headline. If the recording isn't there yet, the triggers quietly
   remove themselves rather than offer a button that does nothing. */
(function hearThePitch() {
  const triggers = Array.from(document.querySelectorAll("[data-say]"));
  if (!triggers.length) return;
  const heroO = document.querySelector(".say-o");

  const audio = new Audio("audio/pitch.mp3");
  audio.preload = "none";

  const removeTriggers = () => {
    if (heroO) heroO.replaceWith(document.createTextNode("o")); // keep the word "Stop" whole
    triggers.forEach((t) => t !== heroO && t.remove());
  };
  // No recording yet (404, or the browser can't decode it) — pull the
  // buttons rather than ship a "Listen" that silently does nothing.
  audio.addEventListener("error", removeTriggers, { once: true });

  const bar = document.body.appendChild(Object.assign(document.createElement("div"), { className: "say-progress" }));

  const paint = () => {
    const playing = !audio.paused && !audio.ended;
    bar.classList.toggle("is-on", playing);
    bar.style.transform = `scaleX(${audio.duration ? audio.currentTime / audio.duration : 0})`;
    triggers.forEach((t) => {
      t.classList.toggle("is-playing", playing);
      t.setAttribute("aria-label", playing ? "Stop the pitch" : "Hear the pitch");
    });
  };

  const stop = () => {
    audio.pause();
    audio.currentTime = 0;
    paint();
  };

  audio.addEventListener("timeupdate", paint);
  audio.addEventListener("ended", stop);
  triggers.forEach((t) => t.addEventListener("click", () => (audio.paused ? audio.play().catch(removeTriggers) : stop())));
  document.addEventListener("keydown", (e) => e.key === "Escape" && !audio.paused && stop());
  window.addEventListener("pagehide", stop);
})();
