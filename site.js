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
