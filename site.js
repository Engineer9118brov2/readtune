/* ReadTune marketing site — intentionally dependency-free.
   Core product claims live in the extension/docs; this file only handles
   presentation: navigation, accessibility view, restrained motion, the small
   hero preview, and screenshot slots. No analytics or telemetry. */

const root = document.documentElement;
const header = document.querySelector("[data-site-header]");
const menuButton = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const dysToggle = document.querySelector("#dys-toggle");
const DYS_KEY = "readtune-dys-view";
root.classList.add("js-ready");
if (location.hash) {
  requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ block: "start" }));
}

/* Header state */
const paintHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 10);
paintHeader();
window.addEventListener("scroll", paintHeader, { passive: true });

/* Mobile navigation */
function setMenu(open) {
  if (!menuButton || !nav) return;
  nav.classList.toggle("is-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
}
menuButton?.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

/* Dyslexia-friendly chrome.
   This mirrors the extension's current approach: Atkinson/Lexend + calmer
   spacing, not a blanket OpenDyslexic replacement that can squeeze controls. */
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

/* Reveal motion. The CSS leaves everything visible when JS is absent; once JS
   is live, only elements waiting for the observer are staged. */
(function reveal() {
  const items = [...document.querySelectorAll("[data-reveal]")];
  if (!items.length) return;
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) {
      if (target.matches?.("[data-reveal]")) target.classList.add("is-visible");
      target.querySelectorAll?.("[data-reveal]").forEach((item) => item.classList.add("is-visible"));
    }
  }
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries, current) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      current.unobserve(entry.target);
    }
  }, { threshold: 0.08, rootMargin: "0px 0px -50px" });
  items.forEach((item) => observer.observe(item));
})();

/* Hero reading-profile specimen. Typeface choices are mutually exclusive;
   roomier spacing and focus can be toggled independently. */
(function profileDemo() {
  const reading = document.querySelector("#demo-reading");
  if (!reading) return;
  const buttons = [...document.querySelectorAll("[data-demo-style]")];
  const typeButtons = buttons.filter((button) => ["atkinson", "lexend"].includes(button.dataset.demoStyle));
  let roomier = false;
  let focus = true;

  const setPressed = (button, on) => {
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", String(on));
  };
  const apply = () => {
    const type = typeButtons.find((button) => button.getAttribute("aria-pressed") === "true")?.dataset.demoStyle || "atkinson";
    reading.style.fontFamily = type === "lexend" ? '"Lexend", sans-serif' : '"Atkinson Hyperlegible", sans-serif';
    reading.style.lineHeight = roomier ? "1.92" : "1.72";
    reading.style.letterSpacing = roomier ? ".018em" : "0";
    reading.style.wordSpacing = roomier ? ".08em" : "0";
    reading.querySelector(".focus-band")?.toggleAttribute("hidden", !focus);
  };

  buttons.forEach((button) => {
    const kind = button.dataset.demoStyle;
    if (kind === "focus") setPressed(button, true);
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
      apply();
    });
  });
  apply();
})();

/* Media slots. Asset availability comes from a tiny manifest rather than
   probing every reserved filename. Missing capture placeholders therefore cost
   one small successful request instead of a row of expected 404s in production. */
(async function hydrateMediaSlots() {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let available = new Set();
  try {
    const response = await fetch("/assets/site/media.json", { cache: "no-cache" });
    if (response.ok) {
      const manifest = await response.json();
      available = new Set(Array.isArray(manifest?.files) ? manifest.files : []);
    }
  } catch {
    // Placeholders remain visible when the manifest cannot be read.
  }

  const promoteImage = (figure, slot) => {
    const filename = slot ? `${slot}.png` : "";
    if (!filename || !available.has(filename) || figure.classList.contains("has-video")) return;
    const image = new Image();
    image.alt = figure.querySelector("strong")?.textContent || "ReadTune product screenshot";
    image.decoding = "async";
    image.loading = "lazy";
    image.className = "slot-image";
    image.addEventListener("load", () => {
      if (figure.classList.contains("has-video")) return;
      figure.querySelector(".media-placeholder-inner")?.setAttribute("hidden", "");
      figure.classList.add("has-image");
      figure.insertBefore(image, figure.querySelector("figcaption"));
    }, { once: true });
    image.src = `/assets/site/${filename}`;
  };

  document.querySelectorAll("[data-video-slot], [data-image-slot]").forEach((figure) => {
    const videoSlot = figure.dataset.videoSlot;
    const imageSlot = figure.dataset.imageSlot;
    const videoFile = videoSlot ? `${videoSlot}.mp4` : "";
    if (!videoFile || !available.has(videoFile)) {
      promoteImage(figure, imageSlot);
      return;
    }

    const video = document.createElement("video");
    video.className = "slot-video";
    video.controls = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", figure.querySelector("strong")?.textContent || "ReadTune feature video");
    if (!reduced) video.autoplay = true;
    const source = document.createElement("source");
    source.src = `/assets/site/${videoFile}`;
    source.type = "video/mp4";
    video.append(source);
    video.addEventListener("loadeddata", () => {
      figure.querySelector(".media-placeholder-inner")?.setAttribute("hidden", "");
      figure.querySelector(".slot-image")?.remove();
      figure.classList.remove("has-image");
      figure.classList.add("has-video");
      figure.insertBefore(video, figure.querySelector("figcaption"));
      if (!reduced) video.play().catch(() => {});
    }, { once: true });
    video.addEventListener("error", () => promoteImage(figure, imageSlot), { once: true });
    video.load();
  });
})();

/* Page journey rail — a quiet map of the product story on wide screens. */
(function journeyRail() {
  const items = [
    ["method", "Preference check"],
    ["reading", "Reading surfaces"],
    ["ai-mode", "AI mode"],
    ["lab", "Reading Lab"],
    ["listen", "Read aloud"],
    ["privacy", "Privacy"],
  ].map(([id, label]) => ({ id, label, node: document.getElementById(id) })).filter((item) => item.node);
  if (!items.length) return;
  const rail = document.createElement("nav");
  rail.className = "journey-rail";
  rail.setAttribute("aria-label", "Page journey");
  const buttons = new Map();
  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", item.label);
    button.addEventListener("click", () => item.node.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (index === 0) button.classList.add("is-active");
    rail.append(button);
    buttons.set(item.id, button);
  });
  document.body.append(rail);
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    buttons.forEach((button, id) => button.classList.toggle("is-active", id === visible.target.id));
  }, { rootMargin: "-30% 0px -55%", threshold: [0, .15, .35, .6] });
  items.forEach((item) => observer.observe(item.node));
})();

/* Alt+K opens a tiny product map. It doubles as an easter egg and a useful
   reminder of the extension's real keyboard shortcuts. */
(function commandMap() {
  if (!document.getElementById("method")) return;
  const backdrop = document.createElement("div");
  backdrop.className = "command-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.inert = true;
  backdrop.innerHTML = `
    <div class="command-panel" role="dialog" aria-modal="true" aria-labelledby="command-title">
      <div class="command-head"><strong id="command-title">ReadTune map</strong><button type="button" aria-label="Close map" data-command-close>×</button></div>
      <div class="command-body">
        <div class="command-label">Jump around this page</div>
        <a class="command-link" href="#method"><span><b>Preference check</b><small>How ReadTune finds a starting point</small></span><kbd class="command-key">01</kbd></a>
        <a class="command-link" href="#ai-mode"><span><b>AI mode</b><small>Understand, simplify, annotate, keep the answer</small></span><kbd class="command-key">03</kbd></a>
        <a class="command-link" href="#lab"><span><b>Reading Lab</b><small>See whether the same signal repeats</small></span><kbd class="command-key">04</kbd></a>
        <div class="command-divider"></div>
        <div class="command-label">Inside the extension</div>
        <div class="command-row"><span><b>Open Reader View</b><small>Clean article + your profile</small></span><kbd class="command-key">Alt R</kbd></div>
        <div class="command-row"><span><b>Restyle this page</b><small>Keep the site, change the reading</small></span><kbd class="command-key">Alt ⇧ R</kbd></div>
        <div class="command-row"><span><b>Talk to type</b><small>Dictate into the focused field</small></span><kbd class="command-key">Alt ⇧ D</kbd></div>
      </div>
      <div class="command-foot">Alt+K opens this map · Esc closes it · nothing here sends a network request.</div>
    </div>`;
  document.body.append(backdrop);
  const closeButton = backdrop.querySelector("[data-command-close]");
  let returnFocus = null;
  const open = (source) => {
    returnFocus = source || document.activeElement;
    backdrop.inert = false;
    backdrop.setAttribute("aria-hidden", "false");
    backdrop.classList.add("is-open");
    closeButton?.focus();
  };
  const close = () => {
    if (!backdrop.classList.contains("is-open")) return;
    backdrop.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.inert = true;
    returnFocus?.focus?.();
  };
  document.querySelectorAll("[data-open-command]").forEach((button) => button.addEventListener("click", () => open(button)));
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
  closeButton?.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key.toLowerCase() === "k") { event.preventDefault(); backdrop.classList.contains("is-open") ? close() : open(); }
    else if (event.key === "Escape") close();
  });
})();

/* Tiny local-first easter egg: triple-click the logo. */
(function localFirstEgg() {
  const brand = document.querySelector(".site-header .brand");
  if (!brand) return;
  const toast = document.createElement("div");
  toast.className = "site-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.append(toast);
  let clicks = [];
  let timer = 0;
  brand.addEventListener("click", (event) => {
    const now = performance.now();
    clicks = clicks.filter((time) => now - time < 900);
    clicks.push(now);
    if (clicks.length < 3) return;
    event.preventDefault();
    clicks = [];
    toast.textContent = "LOCAL-FIRST LAYER FOUND · no account created · no extension telemetry · no request sent";
    toast.classList.add("is-on");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("is-on"), 3600);
  });
})();

/* Subtle depth, only for precise pointers and only when motion is allowed. */
(function subtleDepth() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !window.matchMedia?.("(pointer: fine)").matches) return;
  const surfaces = [...document.querySelectorAll(".video-card, .media-card")].slice(0, 4);
  surfaces.forEach((surface) => {
    surface.classList.add("tilt-surface");
    surface.addEventListener("pointermove", (event) => {
      const rect = surface.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      surface.classList.remove("is-resting");
      surface.style.setProperty("--tilt-x", `${(-y * 1.2).toFixed(2)}deg`);
      surface.style.setProperty("--tilt-y", `${(x * 1.4).toFixed(2)}deg`);
    });
    surface.addEventListener("pointerleave", () => {
      surface.classList.add("is-resting");
      surface.style.setProperty("--tilt-x", "0deg");
      surface.style.setProperty("--tilt-y", "0deg");
    });
  });
})();
