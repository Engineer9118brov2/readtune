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
  loadAssistConfig,
  saveAssistConfig,
  applyDyslexicUi,
  nextTtsRate,
  DEFAULT_PROFILE,
} from "./settings.js";
import { applyTypography, paintPage } from "./render.js";
import { createReadingAids } from "./aids.js";
import { createTransport } from "./transport.js";
import { createTTS } from "./tts.js";
import { createWordLookup } from "./wordlook.js";
import { createAssistant, geminiKeyWorks, hasGeminiPermission, requestGeminiPermission } from "./assist.js";
import { createAssistUi } from "./assist-ui.js";
import { fetchVoices, requestElevenPermission, hasElevenPermission, synthesize, keyCanSynthesize } from "./elevenlabs.js";
import { requestPiperPermission, piperVoiceNeedsDownload } from "./piper.js";
import { buildControls } from "./controls.js";
import { modePatch } from "./reading-modes.js";
import { cycleRulerLines, normalizeRulerLines } from "./ruler.js";

export async function createReadingScreen({ surface, view, pageUrl = "" }) {
  let profile = await loadProfile();
  applyDyslexicUi(profile.dyslexicUiMode);
  let ttsConfig = await loadTTSConfig();
  let assistConfig = await loadAssistConfig();
  let memory = { scroll: 0, highlights: [] };
  let saveTimer = 0;
  let autoRAF = 0;
  let autoScrolling = false;
  let pendingAloudIndex = 0;
  let preserveScrollOnPacingChange = false;
  let piperStatus =
    ttsConfig.provider === "piper"
      ? {
          kind: "info",
          message: piperVoiceNeedsDownload(ttsConfig.piperVoice)
            ? "Your local voice is selected. Press Listen to prepare the one-time download."
            : "Your local voice is built in. Press Listen to start.",
          percent: null,
        }
      : { kind: "", message: "", percent: null };

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
    onStatus: (status) => {
      piperStatus = status && status.provider === "piper" ? status : piperStatus;
      if (ttsConfig.provider === "piper") pushTTS();
    },
    onState: (st) => {
      if (profile.pacing !== "aloud") return;
      syncReadAlong(st.index);
      transport.setPlaying(st.playing);
      transport.setProgress(st.total ? st.index / st.total : 0, `${st.index + 1} / ${st.total}`);
      /* The header button reads Pause / Resume from this — but setActions()
         rebuilds the button, so doing it on every sentence transition would
         take focus off Pause from under a keyboard user mid-paragraph. Only
         when the label would actually change. */
      if (st.playing !== lastAloudPlaying) {
        lastAloudPlaying = st.playing;
        syncHeaderActions();
      }
      if (st.done) {
        clearReadAlong();
        change({ pacing: "flow" });
      }
    },
  });

  /* Speak a word or passage on demand (word lookup, the assistant's "Hear it")
     without losing playback position. Duck whatever is running, not just
     narration: RSVP belongs to the view, so tts.isPlaying() is false in word
     pacing and the words kept advancing under the popup while Piper synthesised. */
  async function speakDucked(text, signal) {
    if (!tts || !text) return;
    const narrating = tts.isPlaying();
    const rsvp = typeof view.isPlaying === "function" && view.isPlaying();
    if (narrating) tts.pause();
    if (rsvp) view.pause();
    try {
      await tts.speakOnce(text, { signal });
    } finally {
      if (narrating) tts.toggle();
      if (rsvp) view.play();
    }
  }

  /* Double-click a word for its syllables and how it sounds. Single click is
     already taken by "jump read-aloud to this sentence". */
  const wordLook = createWordLookup({
    /* Sentence and word pacing hide the flow and show a chunk element instead,
       so anchoring lookup to the flow alone silently switched it off in both
       paced modes — the words the reader can actually see are not in it. */
    getFlow: () => view.getVisibleTextEl(),
    speak: speakDucked,
    onError: (m) => toast(m),
  });

  /* Optional AI help: a plain-language rewrite of a passage you select, and a
     "what is this about" for the whole article. On-device (Chrome built-in AI)
     first, the reader's own Gemini key second, nothing ReadTune-hosted ever. */
  const assistant = createAssistant({
    getArticleText: () => view.getPlainText(),
    getConfig: () => assistConfig,
  });
  const assist = createAssistUi({
    assistant,
    getSelectionText: () => {
      const s = window.getSelection();
      return s && !s.isCollapsed ? String(s.toString() || "").trim() : "";
    },
    speak: speakDucked,
    onSaveKey: async (key) => {
      if (!(await hasGeminiPermission())) {
        const granted = await requestGeminiPermission();
        if (!granted) {
          toast("ReadTune needs permission to reach Google to check the key.");
          return false;
        }
      }
      const check = await geminiKeyWorks(key);
      if (!check.ok) {
        toast(check.reason || "That key didn't work.");
        return false;
      }
      assistConfig = (await saveAssistConfig({ key })) || { ...assistConfig, key };
      toast("Gemini key saved — it stays in this browser.");
      return true;
    },
    onError: (m) => toast(m),
  });
  const unmountAssistTrigger = assist.mountSelectionTrigger(() => view.getFlowEl());

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
        change({ ttsRate: nextTtsRate(profile.ttsRate) });
      } else {
        change({ wpm: profile.wpm >= 650 ? 150 : profile.wpm + 100 });
      }
    },
  });

  const controls = buildControls(profile, change);
  document.body.append(controls.toggle, controls.panel);

  let lastAloudPlaying = null;

  function syncHeaderActions() {
    if (typeof view.setActions !== "function") return;
    view.setActions([
      {
        /* Reading aloud is a thing you pause, not a thing you abandon: stopping
           throws away your place, and this button is the one most people reach
           for mid-paragraph. Stop still lives on the transport bar. */
        label:
          profile.pacing !== "aloud"
            ? "Listen here"
            : tts && tts.isPlaying()
              ? "Pause"
              : "Resume",
        primary: profile.pacing === "aloud",
        pressed: profile.pacing === "aloud" && !!tts && tts.isPlaying(),
        title:
          profile.pacing !== "aloud"
            ? "Start from the sentence near the middle of the page. While listening, click any sentence to jump there."
            : tts && tts.isPlaying()
              ? "Pause read-aloud and keep your place."
              : "Carry on from where you paused.",
        onClick: () => {
          if (profile.pacing !== "aloud") {
            startAloudAt(currentSentenceIndex(), { preserveScroll: true });
          } else if (tts) {
            tts.toggle();
            syncTransport();
            lastAloudPlaying = tts.isPlaying();
            syncHeaderActions();
          }
        },
      },
      {
        label: "Summary",
        title:
          "Key points for this article before you commit to it. Runs on your device where the browser supports it; otherwise a free Gemini key (Reading Lab) turns it on. To rewrite one passage in plainer words, select it and use the Simplify button that appears.",
        onClick: () => assist.openSummary(),
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
      tts.start(next);
      syncReadAlong(next);
      syncTransport();
      syncHeaderActions();
      return;
    }
    change({ pacing: "aloud" });
  }

  /* ---- read-aloud engine (on-device Piper, or the user's ElevenLabs key) ---- */
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
      status: extra.status || (ttsConfig.provider === "piper" ? piperStatus.message : ""),
      piperProgress: ttsConfig.provider === "piper" ? piperStatus.percent : null,
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
  }

  function stopTransientMode(pacing = profile.pacing) {
    if (pacing === "scroll") stopAuto();
    if (pacing === "aloud" && tts) {
      tts.pause();
      clearReadAlong();
    }
  }
  // Only the ElevenLabs rows expose a preview button — the on-device Piper
  // voice is chosen and previewed in the Reading Lab's Voice Fit.
  async function previewVoice() {
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
    } else {
      toast("Add your ElevenLabs key to preview that voice, or try voices in the Reading Lab.");
    }
  }

  async function handleTTSPatch(t) {
    if (t.preview) {
      previewVoice();
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
      if (t.provider === "piper" && piperVoiceNeedsDownload(ttsConfig && ttsConfig.piperVoice)) {
        const granted = await requestPiperPermission();
        if (!granted) {
          pushTTS({ error: "ReadTune needs permission to download that one-time natural voice model from Hugging Face." });
          return;
        }
      }
      ttsConfig = await saveTTSConfig({ provider: t.provider });
      piperStatus = t.provider === "piper"
        ? {
            kind: "info",
            message: piperVoiceNeedsDownload(ttsConfig && ttsConfig.piperVoice)
              ? "Your local voice is selected. Press Listen to prepare the one-time download."
              : "Your local voice is selected and built in. Press Listen to start.",
            percent: null,
          }
        : { kind: "", message: "", percent: null };
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

  /* A double-click (to look a word up) is two clicks: the first lands with the
     selection still collapsed, so a bare click handler would seek read-aloud
     before the lookup opened. Hold the seek and drop it when the second click
     lands (ev.detail > 1). The hold is a straight trade — long enough that a
     normal double-click cancels it in time, short enough that a plain click to
     jump still feels immediate. 300ms covers the great majority of real
     double-clicks; a deliberately slow one causes a brief jump before the
     lookup opens, which is harmless (read-aloud simply moved to where you
     clicked). 550ms, the old value, was a perceptible lag on every jump. */
  const DOUBLE_CLICK_GRACE = 300;
  let seekTimer = 0;
  const onFlowClick = (ev) => {
    if (profile.pacing !== "aloud" || !tts || ev.defaultPrevented) return;
    if (ev.detail > 1) { clearTimeout(seekTimer); return; }
    const target = ev.target;
    if (!target) return;
    const owner = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    if (owner && owner.closest("a, button, input, select, textarea, summary")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const idx = sentenceIndexFromNode(target);
    if (idx < 0) return;
    clearTimeout(seekTimer);
    seekTimer = setTimeout(() => startAloudAt(idx, { preserveScroll: true }), DOUBLE_CLICK_GRACE);
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
    if (tts) tts.setRate(p.ttsRate);
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
      wordLook.destroy();
      assist.destroy();
      unmountAssistTrigger();
      transport.destroy();
      if (tts) tts.destroy();
      clearTimeout(seekTimer);
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
