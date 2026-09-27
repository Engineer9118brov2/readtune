/* ReadTune website interactions: mobile navigation, accessibility view, and the reading preview. */

const root = document.documentElement;
const menuButton = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const dysToggle = document.querySelector("#dys-toggle");
const DYS_KEY = "readtune-dys-view";

function setMenu(open) {
  if (!menuButton || !nav) return;
  nav.classList.toggle("is-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
}

menuButton?.addEventListener("click", () => {
  setMenu(menuButton.getAttribute("aria-expanded") !== "true");
});
nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

function setDysMode(on) {
  root.classList.toggle("dys-mode", on);
  dysToggle?.setAttribute("aria-pressed", String(on));
}

let dysOn = root.classList.contains("dys-mode");
try { dysOn = localStorage.getItem(DYS_KEY) === "1"; } catch {}
setDysMode(dysOn);
dysToggle?.addEventListener("click", () => {
  dysOn = dysToggle.getAttribute("aria-pressed") !== "true";
  setDysMode(dysOn);
  try { localStorage.setItem(DYS_KEY, dysOn ? "1" : "0"); } catch {}
});

const reading = document.querySelector("#demo-reading");
if (reading) {
  const buttons = [...document.querySelectorAll("[data-demo-style]")];
  const typeButtons = buttons.filter((button) => ["atkinson", "lexend"].includes(button.dataset.demoStyle));
  let roomier = false;
  let focus = true;

  const setPressed = (button, on) => {
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", String(on));
  };
  const applySettings = () => {
    const type = typeButtons.find((button) => button.getAttribute("aria-pressed") === "true")?.dataset.demoStyle || "atkinson";
    reading.style.fontFamily = type === "lexend" ? '"Lexend", sans-serif' : '"Atkinson Hyperlegible", sans-serif';
    reading.style.lineHeight = roomier ? "1.92" : "1.72";
    reading.style.letterSpacing = roomier ? ".018em" : "0";
    reading.style.wordSpacing = roomier ? ".08em" : "0";
    reading.querySelector(".focus-band")?.toggleAttribute("hidden", !focus);
  };

  buttons.forEach((button) => {
    const kind = button.dataset.demoStyle;
    button.addEventListener("click", () => {
      if (kind === "atkinson" || kind === "lexend") {
        typeButtons.forEach((candidate) => setPressed(candidate, candidate === button));
      } else if (kind === "roomy") {
        roomier = !roomier;
        setPressed(button, roomier);
      } else if (kind === "focus") {
        focus = !focus;
        setPressed(button, focus);
      }
      applySettings();
    });
  });
  applySettings();
}
