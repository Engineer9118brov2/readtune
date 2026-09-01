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
  loadTTSConfig,
  saveTTSConfig,
  forgetTTSKey,
  applyDyslexicUi,
  DEFAULT_PROFILE,
} from "./settings.js";
import { applyTypography, paintPage } from "./render.js";
import { createReadingAids } from "./aids.js";
import { createTransport } from "./transport.js";
import { createTTS, isTTSAvailable, onVoicesReady, listVoices } from "./tts.js";
import { fetchVoices, requestElevenPermission, hasElevenPermission, synthesize, keyCanSynthesize } from "./elevenlabs.js";
import { buildControls } from "./controls.js";
import { modePatch } from "./reading-modes.js";
import { cycleRulerLines, normalizeRulerLines } from "./ruler.js";

export async function createReadingScreen({ surface, view, pageUrl = "" }) {
  let profile = await loadProfile();
  applyDyslexicUi(profile.dyslexicUiMode);
  let ttsConfig = await loadTTSConfig();
  let memory = { scroll: 0, highlights: [] };
  let saveTimer = 0;
  let autoRAF = 0;
  let autoScrolling = false;
  let pendingAloudIndex = 0;
  let preserveScrollOnPacingChange = false;

  const toast = makeToast();

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

  const tts = createTTS({
    getFlow: () => view.getFlowEl(),
    getConfig: () => ttsConfig,
    onError: (msg) => toast(msg),
    onState: (st) => {
      if (profile.pacing !== "aloud") return;
      syncReadAlong(st.index);
      transport.setPlaying(st.playing);
      transport.setProgress(st.total ? st.index / st.total : 0, `${st.index + 1} / ${st.total}`);
      if (st.done) {
        clearReadAlong();
        change({ pacing: "flow" });
      }
    },
  });

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

  function syncHeaderActions() {
    if (typeof view.setActions !== "function") return;
    const ttsReady = isTTSAvailable();
    view.setActions([
      {
        label: profile.pacing === "aloud" ? "Stop listening" : "Listen here",
        primary: profile.pacing === "aloud",
        pressed: profile.pacing === "aloud",
        disabled: !ttsReady,
        title:
          profile.pacing === "aloud"
            ? "Stop read-aloud."
            : "Start from the sentence near the middle of the page. While listening, click any sentence to jump there.",
        onClick: () => {
          if (!ttsReady) return;
          if (profile.pacing === "aloud") change({ pacing: "flow" });
          else startAloudAt(currentSentenceIndex(), { preserveScroll: true });
        },
      },
    ]);
  }

  function sentenceIndexFromNode(node) {
    const flow = view.getFlowEl();
    if (!flow) return -1;
    const el =
      node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement ? node.parentElement : null;
    const sentence = el && typeof el.closest === "function" ? el.closest(".rt-s") : null;
    if (!sentence || !flow.contains(sentence)) return -1;
    return Math.max(0, Number(sentence.dataset.i) || 0);
  }

  function sentenceEl(index) {
    return view.getFlowEl().querySelector(`.rt-s[data-i="${Math.max(0, Number(index) || 0)}"]`);
  }

  function syncReadAlong(index) {
    if (profile.focus !== "ruler") {
      aids.clearRulerTracking();
      return;
    }
    const el = sentenceEl(index);
    if (el) aids.trackRulerTo(el);
  }

  function clearReadAlong() {
    aids.clearRulerTracking();
  }

  function selectedSentenceIndex() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return -1;
    const range = sel.getRangeAt(0);
    const flow = view.getFlowEl();
    if (!flow || !flow.contains(range.commonAncestorContainer)) return -1;
    return sentenceIndexFromNode(range.startContainer);
  }

  function currentSentenceIndex() {
    const selected = selectedSentenceIndex();
    if (selected >= 0) return selected;
    const flow = view.getFlowEl();
    if (!flow) return 0;
    const sentences = [...flow.querySelectorAll(".rt-s")];
    if (!sentences.length) return 0;

    const eyeLine = window.innerHeight * 0.35;
    let best = -1;
    let bestDist = Infinity;

    for (const el of sentences) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const center = rect.top + Math.min(rect.height, 72) / 2;
      const dist = Math.abs(center - eyeLine);
      if (dist < bestDist) {
        bestDist = dist;
        best = Number(el.dataset.i) || 0;
      }
    }

    if (best >= 0) return best;

    const firstBelow = sentences.find((el) => el.getBoundingClientRect().bottom >= 0);
    return firstBelow ? Number(firstBelow.dataset.i) || 0 : 0;
  }

  function startAloudAt(index = 0, { preserveScroll = false } = {}) {
    stopPreview();
    const next = Math.max(0, Number(index) || 0);
    pendingAloudIndex = next;
    preserveScrollOnPacingChange = !!preserveScroll;
    if (profile.pacing === "aloud") {
      tts.setRate(profile.ttsRate);
      tts.setVoice(profile.ttsVoice);
      tts.start(next);
      syncReadAlong(next);
      syncTransport();
      syncHeaderActions();
      return;
    }
    change({ pacing: "aloud" });
  }

  /* ---- read-aloud engine (browser voice, or the user's ElevenLabs key) ---- */
  function pushTTS(extra = {}) {
    const hasKey = !!ttsConfig.apiKey;
    const canList = hasKey && (ttsConfig.voices || []).length > 0;
    let note = extra.note || "";
    if (!note && hasKey && !canList && ttsConfig.provider === "elevenlabs" && !extra.error && extra.status !== "checking") {
      note = "This key can't list your voices — paste a voice ID from your ElevenLabs account (Voices → the voice → ID).";
    }
    controls.setTTS({
      provider: ttsConfig.provider,
      hasKey,
      voices: ttsConfig.voices || [],
      voiceId: ttsConfig.voiceId || "",
      note,
      error: extra.error || "",
      status: extra.status || "",
    });
  }
  pushTTS();
  if (ttsConfig.provider === "elevenlabs" && ttsConfig.apiKey) {
    hasElevenPermission().then((ok) => {
      if (!ok) return;
      fetchVoices(ttsConfig.apiKey)
        .then(async (voices) => {
          ttsConfig = await saveTTSConfig({ voices });
          pushTTS();
        })
        .catch(() => pushTTS()); // key may lack voices_read; keep whatever's stored, pushTTS shows the note
    });
  }

  let previewAudio = null;
  let previewAudioUrl = "";

  function stopPreview() {
    if (previewAudio) {
      previewAudio.onended = null;
      previewAudio.onerror = null;
      previewAudio.pause();
      previewAudio.src = "";
      previewAudio = null;
    }
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      previewAudioUrl = "";
    }
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch {}
  }

  function stopTransientMode(pacing = profile.pacing) {
    if (pacing === "scroll") stopAuto();
    if (pacing === "aloud" && tts) {
      tts.pause();
      clearReadAlong();
    }
  }
  async function previewVoice(browserVoice = "") {
    const line = "Hi — this is the voice ReadTune will use to read to you.";
    if (tts && tts.isPlaying()) {
      tts.pause();
      clearReadAlong();
      transport.setPlaying(false);
    }
    stopPreview();
    if (ttsConfig.provider === "elevenlabs" && ttsConfig.apiKey && ttsConfig.voiceId) {
      try {
        const { audio } = await synthesize({
          apiKey: ttsConfig.apiKey,
          voiceId: ttsConfig.voiceId,
          model: ttsConfig.model,
          text: line,
        });
        previewAudioUrl = URL.createObjectURL(audio);
        previewAudio = new Audio(previewAudioUrl);
        previewAudio.playbackRate = profile.ttsRate;
        previewAudio.onended = previewAudio.onerror = () => stopPreview();
        previewAudio.play().catch(() => {});
      } catch (e) {
        toast(e && e.message ? e.message : "Couldn't play a preview.");
      }
    } else if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(line);
      u.rate = profile.ttsRate;
      const activeVoice = browserVoice || profile.ttsVoice;
      if (activeVoice) {
        const v = window.speechSynthesis.getVoices().find((x) => x.name === activeVoice);
        if (v) {
          u.voice = v;
          u.lang = v.lang;
        }
      }
      window.speechSynthesis.speak(u);
    } else {
      toast("Read-aloud isn't available in this browser.");
    }
  }

  async function handleTTSPatch(t) {
    if (t.preview) {
      previewVoice(typeof t.browserVoice === "string" ? t.browserVoice : "");
      return;
    }
    if (t.rescan) {
      controls.setVoices(listVoices());
      return;
    }
    stopPreview();
    if (t.forget) {
      await forgetTTSKey();
      ttsConfig = await loadTTSConfig();
      pushTTS({ status: "" });
      tts.reload();
      return;
    }
    if (t.provider && t.provider !== ttsConfig.provider) {
      ttsConfig = await saveTTSConfig({ provider: t.provider });
      pushTTS();
      tts.reload();
    }
    if (typeof t.apiKey === "string" && t.apiKey) {
      pushTTS({ status: "checking" });
      const granted = await requestElevenPermission();
      if (!granted) {
        pushTTS({ error: "ReadTune needs permission to reach api.elevenlabs.io." });
        return;
      }
      let voices = [];
      let note = "";
      try {
        voices = await fetchVoices(t.apiKey);
      } catch (e) {
        // key may just lack voices_read, or the account is free-plan — check it can still synthesize
        const chk = await keyCanSynthesize(t.apiKey);
        if (!chk.ok) {
          pushTTS({ error: chk.reason || e.message || "Couldn't verify that key." });
          return;
        }
        note =
          chk.note === "free-plan"
            ? "Key accepted. ElevenLabs' free plan can't use its shared voices over the API — paste the ID of a voice you created or cloned."
            : "Key accepted, but it can't list your voices. Paste a voice ID from your ElevenLabs account.";
      }
      ttsConfig = await saveTTSConfig({
        provider: "elevenlabs",
        apiKey: t.apiKey,
        voices,
        voiceId: ttsConfig.voiceId || (voices[0] && voices[0].id) || "",
        voiceName: ttsConfig.voiceName || (voices[0] && voices[0].name) || "",
      });
      pushTTS(note ? { note } : { status: "ok" });
      tts.reload();
    }
    if (t.voiceId) {
      ttsConfig = await saveTTSConfig({ voiceId: t.voiceId, voiceName: t.voiceName || "" });
      pushTTS();
      tts.reload();
    }
  }

  view.on((ev) => {
    if (ev.type === "progress") transport.setProgress(ev.value, ev.label);
    if (ev.type === "playing") transport.setPlaying(ev.value);
  });

  const onFlowClick = (ev) => {
    if (profile.pacing !== "aloud" || !tts || ev.defaultPrevented) return;
    const target = ev.target;
    if (!target) return;
    const owner = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    if (owner && owner.closest("a, button, input, select, textarea, summary")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const idx = sentenceIndexFromNode(target);
    if (idx < 0) return;
    startAloudAt(idx, { preserveScroll: true });
  };
  view.getFlowEl().addEventListener("click", onFlowClick);

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
    applyDyslexicUi(p.dyslexicUiMode);
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
    syncHeaderActions();
  }

  function change(patch) {
    if (patch.__reset) {
      stopPreview();
      stopTransientMode(profile.pacing);
      pendingAloudIndex = 0;
      preserveScrollOnPacingChange = false;
      writeProfile({ ...DEFAULT_PROFILE }).then((next) => applyAll(next || { ...DEFAULT_PROFILE }));
      return;
    }
    if (patch.__tts) {
      handleTTSPatch(patch.__tts);
      return;
    }
    if (patch.__mode) {
      change(modePatch(patch.__mode, profile));
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
      stopPreview();
      stopTransientMode(prevPacing);
      const stageMode = profile.pacing === "sentence" || profile.pacing === "word";
      if (stageMode && !preserveScrollOnPacingChange) window.scrollTo({ top: 0 });
      if (profile.pacing === "aloud" && tts) {
        view.applyProfile(profile);
        tts.setRate(profile.ttsRate);
        tts.setVoice(profile.ttsVoice);
        tts.start(pendingAloudIndex);
        syncReadAlong(pendingAloudIndex);
      }
      pendingAloudIndex = 0;
      preserveScrollOnPacingChange = false;
    }
    syncTransport();
    syncHeaderActions();
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
  const onKeyDown = (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "l" || e.key === "L") {
      if (profile.pacing === "aloud") change({ pacing: "flow" });
      else startAloudAt(currentSentenceIndex(), { preserveScroll: true });
    }
    else if (e.key === "f" || e.key === "F") {
      if (e.shiftKey && profile.focus === "ruler") {
        change({ rulerLines: cycleRulerLines(profile.rulerLines) });
      } else {
        const order = ["off", "paragraph", "ruler"];
        const nextFocus = order[(order.indexOf(profile.focus) + 1) % 3];
        const patch = { focus: nextFocus };
        if (nextFocus === "ruler") patch.rulerLines = normalizeRulerLines(profile.rulerLines);
        change(patch);
      }
    }
  };
  document.addEventListener("keydown", onKeyDown);

  return {
    getProfile: () => profile,
    destroy() {
      stopPreview();
      toast.destroy();
      aids.destroy();
      transport.destroy();
      if (tts) tts.destroy();
      document.removeEventListener("keydown", onKeyDown);
      view.getFlowEl().removeEventListener("click", onFlowClick);
      controls.toggle.remove();
      controls.panel.remove();
      view.destroy();
    },
  };
}

/** Small transient status line (read-aloud fell back, key rejected, …). */
function makeToast() {
  const el = document.createElement("div");
  el.className = "rt-toast";
  el.setAttribute("role", "status");
  el.hidden = true;
  document.body.appendChild(el);
  let timer = 0;
  const fn = (msg) => {
    if (!msg) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => (el.hidden = true), 5200);
  };
  fn.destroy = () => {
    clearTimeout(timer);
    el.remove();
  };
  return fn;
}
