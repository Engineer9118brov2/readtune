/*
 * ReadTune — reading screen wiring
 *
 * Shared glue for Reader View and PDF mode: takes a reading view + its surface,
 * and hooks up the settings panel, the transport bar, read-aloud, the reading
 * aids (ruler / focus / progress), auto-scroll, and (for real URLs) per-page
 * memory. Keeps reader.js / pdfview.js down to "get content, hand it over".
 */

import {
  loadProfile,
  saveProfile,
  writeProfile,
  loadPageMemory,
  savePageMemory,
  DEFAULT_PROFILE,
} from "./settings.js";
import { applyTypography, paintPage } from "./render.js";
import { createReadingAids } from "./aids.js";
import { createTransport } from "./transport.js";
import { createTTS, isTTSAvailable, onVoicesReady } from "./tts.js";
import { buildControls } from "./controls.js";

export async function createReadingScreen({ surface, view, pageUrl = "" }) {
  let profile = await loadProfile();
  let memory = { scroll: 0, highlights: [] };
  let saveTimer = 0;
  let autoRAF = 0;
  let autoScrolling = false;

  const aids = createReadingAids({
    getFlow: () => view.getFlowEl(),
    onSaveScroll: async (y) => {
      if (!pageUrl) return;
      memory.scroll = y;
      await savePageMemory(pageUrl, memory);
    },
    onSaveHighlights: async (list) => {
      if (!pageUrl) return;
      memory.highlights = list;
      await savePageMemory(pageUrl, memory);
    },
  });

  const tts = isTTSAvailable()
    ? createTTS({
        getFlow: () => view.getFlowEl(),
        onState: (st) => {
          if (profile.pacing !== "aloud") return;
          transport.setPlaying(st.playing);
          transport.setProgress(st.total ? st.index / st.total : 0, `${st.index + 1} / ${st.total}`);
          if (st.done) change({ pacing: "flow" });
        },
      })
    : null;

  const transport = createTransport({
    onExit: () => change({ pacing: "flow" }),
    onPlayPause: () => {
      if (profile.pacing === "word") (view.isPlaying() ? view.pause() : view.play());
      else if (profile.pacing === "aloud" && tts) tts.toggle();
      else if (profile.pacing === "scroll") (autoScrolling ? stopAuto() : startAuto());
    },
    onStep: (d) => {
      if (profile.pacing === "aloud" && tts) tts.step(d);
      else view.step(d);
    },
    onStop: () => {
      if (profile.pacing === "aloud" && tts) tts.stop();
      change({ pacing: "flow" });
    },
    onSpeed: () => {
      if (profile.pacing === "aloud") {
        change({ ttsRate: profile.ttsRate >= 1.7 ? 0.7 : Math.round((profile.ttsRate + 0.2) * 10) / 10 });
      } else {
        change({ wpm: profile.wpm >= 650 ? 150 : profile.wpm + 100 });
      }
    },
  });

  const controls = buildControls(profile, change);
  document.body.append(controls.toggle, controls.panel);
  onVoicesReady((voices) => controls.setVoices(voices));

  view.on((ev) => {
    if (ev.type === "progress") transport.setProgress(ev.value, ev.label);
    if (ev.type === "playing") transport.setPlaying(ev.value);
  });

  /* ---- auto-scroll ---- */
  function startAuto() {
    if (autoScrolling) return;
    autoScrolling = true;
    syncTransport();
    const stats = view.getStats();
    const doc = document.documentElement;
    const pxTotal = Math.max(1, doc.scrollHeight - window.innerHeight);
    const seconds = Math.max(20, (stats.words / Math.max(90, profile.wpm)) * 60);
    const pxPerMs = pxTotal / (seconds * 1000);
    let last = performance.now();
    const tick = (now) => {
      if (!autoScrolling) return;
      window.scrollBy(0, pxPerMs * (now - last));
      last = now;
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - 2) return stopAuto();
      autoRAF = requestAnimationFrame(tick);
    };
    autoRAF = requestAnimationFrame(tick);
  }
  function stopAuto() {
    autoScrolling = false;
    cancelAnimationFrame(autoRAF);
    syncTransport();
  }
  ["wheel", "touchstart", "keydown"].forEach((e) =>
    window.addEventListener(e, () => {
      if (autoScrolling) stopAuto();
    }, { passive: true })
  );

  /* ---- apply / change ---- */
  function syncTransport() {
    const mode = profile.pacing === "flow" ? "hidden" : profile.pacing;
    transport.setMode(mode, profile);
    if (profile.pacing === "word") transport.setPlaying(view.isPlaying());
    else if (profile.pacing === "aloud") transport.setPlaying(!!tts && tts.isPlaying());
    else if (profile.pacing === "scroll") transport.setPlaying(autoScrolling);
  }

  function applyAll(p) {
    profile = p;
    applyTypography(surface, p);
    paintPage(p);
    view.applyProfile(p);
    aids.apply(p);
    controls.sync(p);
    if (tts) {
      tts.setRate(p.ttsRate);
      tts.setVoice(p.ttsVoice);
    }
    syncTransport();
  }

  function change(patch) {
    if (patch.__reset) {
      writeProfile({ ...DEFAULT_PROFILE }).then((next) => applyAll(next || { ...DEFAULT_PROFILE }));
      return;
    }
    const prevPacing = profile.pacing;
    profile = { ...profile, ...patch };
    applyTypography(surface, profile);
    paintPage(profile);
    view.applyProfile(profile);
    aids.apply(profile);
    if ("ttsVoice" in patch && tts) tts.setVoice(patch.ttsVoice);
    if ("ttsRate" in patch && tts) tts.setRate(patch.ttsRate);
    controls.sync(profile);

    if (patch.pacing !== undefined && patch.pacing !== prevPacing) {
      stopAuto();
      if (prevPacing === "aloud" && tts) tts.pause();
      window.scrollTo({ top: 0 });
      if (profile.pacing === "aloud" && tts) {
        view.applyProfile(profile);
        tts.setRate(profile.ttsRate);
        tts.setVoice(profile.ttsVoice);
        tts.start(0);
      }
    }
    syncTransport();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProfile(patch), 200);
  }

  applyAll(profile);

  // restore per-page memory
  if (pageUrl) {
    memory = await loadPageMemory(pageUrl);
    if (memory.highlights && memory.highlights.length) aids.restoreHighlights(memory.highlights);
    if (memory.scroll) requestAnimationFrame(() => aids.restoreScroll(memory.scroll));
  }

  // global keys
  document.addEventListener("keydown", (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "l" || e.key === "L") change({ pacing: profile.pacing === "aloud" ? "flow" : "aloud" });
    else if (e.key === "f" || e.key === "F") {
      const order = ["off", "paragraph", "ruler"];
      change({ focus: order[(order.indexOf(profile.focus) + 1) % 3] });
    }
  });

  return {
    getProfile: () => profile,
    destroy() {
      aids.destroy();
      transport.destroy();
      if (tts) tts.destroy();
      view.destroy();
    },
  };
}
