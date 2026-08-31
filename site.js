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
