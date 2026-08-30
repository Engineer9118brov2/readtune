/*
 * ReadTune — read aloud
 *
 * Two backends behind one interface:
 *   • "browser"    — the OS speech synthesis. No key, no network. Word
 *                    highlighting where the voice reports boundaries.
 *   • "elevenlabs" — the user's own ElevenLabs key. Sentences are batched into
 *                    short chunks; each chunk's /with-timestamps response gives
 *                    per-character timings, so the spoken word is highlighted
 *                    precisely. Chunks are fetched just-in-time (+1 prefetch) so
 *                    stopping early doesn't spend quota on the rest of the text.
 *
 * Sentence + word highlighting in the page is shared between the two.
 */

import { synthesize, charIndexAt } from "./elevenlabs.js";

export function isTTSAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function listVoices() {
  if (!isTTSAvailable()) return [];
  return window.speechSynthesis.getVoices().filter((v) => /^en(-|$)/i.test(v.lang));
}

export function onVoicesReady(cb) {
  if (!isTTSAvailable()) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return cb(listVoices());
  const handler = () => {
    window.speechSynthesis.removeEventListener("voiceschanged", handler);
    cb(listVoices());
  };
  window.speechSynthesis.addEventListener("voiceschanged", handler);
}

const CHUNK_CHARS = 550;

export function createTTS({
  getFlow,
  onState = () => {},
  getConfig = () => ({ provider: "browser" }),
  onError = () => {},
}) {
  const synth = isTTSAvailable() ? window.speechSynthesis : null;

  let sentences = [];
  let i = 0;
  let playing = false;
  let rate = 1;
  let voiceName = "";
  let provider = "browser";
  let run = 0; // bumped on every stop/restart; async work checks it

  // ElevenLabs state
  let chunks = [];
  let chunkCache = new Map(); // k -> Promise<{ url, alignment }>
  let audio = null;
  let el = null; // { k, data, chunk } currently playing
  let raf = 0;

  /* ---------- collect sentences + chunk them ---------- */
  function collect() {
    const flow = getFlow();
    sentences = [];
    if (!flow) return;
    for (const node of flow.querySelectorAll(".rt-s")) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (text) sentences.push({ el: node, text });
    }
  }

  function buildChunks() {
    chunks = [];
    let text = "";
    let offsets = [];
    let from = 0;
    for (let s = 0; s < sentences.length; s++) {
      const startChar = text ? text.length + 1 : 0;
      text += (text ? " " : "") + sentences[s].text;
      offsets.push({ s, startChar, endChar: text.length });
      if (text.length >= CHUNK_CHARS || s === sentences.length - 1) {
        chunks.push({ from, to: s, text, offsets });
        text = "";
        offsets = [];
        from = s + 1;
      }
    }
  }

  const chunkOf = (s) => Math.max(0, chunks.findIndex((c) => s >= c.from && s <= c.to));

  /* ---------- highlighting ---------- */
  function clearHighlight() {
    const flow = getFlow();
    if (!flow) return;
    flow.querySelectorAll(".rt-speak-sentence, .rt-speak-word").forEach((e) =>
      e.classList.remove("rt-speak-sentence", "rt-speak-word")
    );
  }

  function markSentence(idx, scroll = true) {
    const flow = getFlow();
    if (!flow) return;
    flow.querySelectorAll(".rt-speak-sentence").forEach((e) => e.classList.remove("rt-speak-sentence"));
    const s = sentences[idx];
    if (!s) return;
    s.el.classList.add("rt-speak-sentence");
    if (scroll) s.el.scrollIntoView({ block: "center", behavior: "smooth" });
    onState({ playing, index: idx, total: sentences.length });
  }

  function ensureWordSpans(sentence) {
    if (sentence.wordsReady) return;
    sentence.wordsReady = true;
    let offset = 0;
    const nodes = [];
    const walker = document.createTreeWalker(sentence.el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      if (node.parentElement && node.parentElement.closest("code")) {
        offset += node.nodeValue.length;
        continue;
      }
      const frag = document.createDocumentFragment();
      const re = /(\s+)|(\S+)/g;
      let m;
      let local = offset;
      while ((m = re.exec(node.nodeValue))) {
        if (m[1]) frag.appendChild(document.createTextNode(m[1]));
        else {
          const w = document.createElement("span");
          w.className = "rt-w";
          w.dataset.o = String(local);
          w.textContent = m[2];
          frag.appendChild(w);
        }
        local += m[0].length;
      }
      offset += node.nodeValue.length;
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    }
  }

  function highlightWord(sentence, charIndex) {
    ensureWordSpans(sentence);
    const spans = [...sentence.el.querySelectorAll(".rt-w")];
    let target = null;
    for (const s of spans) {
      if (Number(s.dataset.o) <= charIndex) target = s;
      else break;
    }
    sentence.el.querySelectorAll(".rt-speak-word").forEach((e) => e.classList.remove("rt-speak-word"));
    if (target) target.classList.add("rt-speak-word");
  }

  /* ---------- browser backend ---------- */
  function browserSpeak() {
    if (!playing) return;
    if (!synth) {
      playing = false;
      onError("Read-aloud isn't available in this browser.");
      onState({ playing: false, done: true, index: 0, total: sentences.length });
      return;
    }
    if (i >= sentences.length) return finish();
    const mine = run;
    const s = sentences[i];
    markSentence(i);
    const u = new SpeechSynthesisUtterance(s.text);
    u.rate = rate;
    if (voiceName && synth) {
      const v = synth.getVoices().find((x) => x.name === voiceName);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
    }
    u.onboundary = (ev) => {
      if (ev.name && ev.name !== "word") return;
      try {
        highlightWord(s, ev.charIndex || 0);
      } catch {}
    };
    u.onend = u.onerror = () => {
      if (!playing || mine !== run) return;
      i += 1;
      browserSpeak();
    };
    synth.speak(u);
  }

  /* ---------- ElevenLabs backend ---------- */
  function fetchChunk(k) {
    if (k < 0 || k >= chunks.length) return null;
    if (chunkCache.has(k)) return chunkCache.get(k);
    const cfg = getConfig();
    const p = synthesize({ apiKey: cfg.apiKey, voiceId: cfg.voiceId, model: cfg.model, text: chunks[k].text }).then(
      (r) => ({ url: URL.createObjectURL(r.audio), alignment: r.alignment })
    );
    chunkCache.set(k, p);
    return p;
  }

  async function elevenPlay(k, sentenceIdx) {
    if (!playing) return;
    const mine = run;
    let data;
    try {
      data = await fetchChunk(k);
      fetchChunk(k + 1);
    } catch (err) {
      if (mine !== run) return;
      onError(err && err.message ? err.message : "ElevenLabs request failed. Using the browser voice.");
      provider = "browser";
      i = sentenceIdx;
      return browserSpeak();
    }
    if (!playing || mine !== run) return;

    const chunk = chunks[k];
    el = { k, data, chunk };
    stopAudioEl();
    audio = new Audio(data.url);
    audio.playbackRate = rate;

    const start = chunk.offsets.find((o) => o.s === sentenceIdx);
    if (start && data.alignment.starts.length) {
      audio.currentTime = data.alignment.starts[Math.min(start.startChar, data.alignment.starts.length - 1)] || 0;
    }

    audio.onended = () => {
      if (!playing || mine !== run) return;
      cancelAnimationFrame(raf);
      if (k + 1 < chunks.length) elevenPlay(k + 1, chunks[k + 1].from);
      else finish();
    };
    audio.onerror = () => {
      if (!playing || mine !== run) return;
      onError("Audio playback failed. Using the browser voice.");
      provider = "browser";
      i = sentenceIdx;
      browserSpeak();
    };

    try {
      await audio.play();
    } catch {}
    driveEleven(mine);
  }

  function driveEleven(mine) {
    cancelAnimationFrame(raf);
    let shown = -1;
    const tick = () => {
      if (!playing || mine !== run || !audio || !el) return;
      const gc = charIndexAt(el.data.alignment, audio.currentTime);
      const off =
        el.chunk.offsets.find((o) => gc >= o.startChar && gc <= o.endChar) ||
        el.chunk.offsets[el.chunk.offsets.length - 1];
      if (off) {
        if (off.s !== shown) {
          shown = off.s;
          i = off.s;
          markSentence(off.s);
        }
        try {
          highlightWord(sentences[off.s], Math.max(0, gc - off.startChar));
        } catch {}
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function stopAudioEl() {
    cancelAnimationFrame(raf);
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause();
      audio = null;
    }
  }

  function releaseUrls() {
    for (const p of chunkCache.values()) {
      Promise.resolve(p).then((d) => d && d.url && URL.revokeObjectURL(d.url)).catch(() => {});
    }
    chunkCache = new Map();
  }

  /* ---------- shared ---------- */
  function speakCurrent() {
    if (provider === "elevenlabs") {
      buildChunks();
      elevenPlay(chunkOf(i), i);
    } else {
      browserSpeak();
    }
  }

  function finish() {
    playing = false;
    run++;
    if (synth) synth.cancel();
    stopAudioEl();
    el = null;
    releaseUrls();
    clearHighlight();
    onState({ playing: false, done: true, index: sentences.length, total: sentences.length });
  }

  function halt() {
    run++;
    if (synth) synth.cancel();
    stopAudioEl();
  }

  function resolveProvider() {
    const cfg = getConfig();
    return cfg.provider === "elevenlabs" && cfg.apiKey && cfg.voiceId ? "elevenlabs" : "browser";
  }

  return {
    start(fromIndex) {
      collect();
      if (!sentences.length) return;
      provider = resolveProvider();
      if (typeof fromIndex === "number") i = Math.max(0, Math.min(fromIndex, sentences.length - 1));
      halt();
      releaseUrls();
      playing = true;
      speakCurrent();
    },
    pause() {
      playing = false;
      if (synth) synth.cancel();
      if (audio) audio.pause();
      cancelAnimationFrame(raf);
      onState({ playing: false, index: i, total: sentences.length });
    },
    toggle() {
      if (playing) return this.pause();
      if (provider === "elevenlabs" && audio && el) {
        playing = true;
        audio.playbackRate = rate;
        audio.play().catch(() => {});
        driveEleven(run);
        onState({ playing: true, index: i, total: sentences.length });
      } else {
        this.start(i);
      }
    },
    stop() {
      i = 0;
      finish();
    },
    step(dir) {
      i = Math.max(0, Math.min(sentences.length - 1, i + dir));
      if (playing) {
        halt();
        playing = true;
        speakCurrent();
      } else {
        clearHighlight();
        markSentence(i, true);
      }
    },
    seek(fraction) {
      collect();
      i = Math.round(fraction * (sentences.length - 1 || 0));
      if (playing) {
        halt();
        playing = true;
        speakCurrent();
      } else {
        markSentence(i);
      }
    },
    setRate(r) {
      rate = Math.max(0.5, Math.min(2, Number(r) || 1));
      if (audio) audio.playbackRate = rate;
      if (playing && provider === "browser" && synth) {
        synth.cancel();
        browserSpeak();
      }
    },
    setVoice(name) {
      voiceName = name || "";
      if (playing && provider === "browser" && synth) {
        synth.cancel();
        browserSpeak();
      }
    },
    /** ElevenLabs key / voice / provider changed. */
    reload() {
      const wasPlaying = playing;
      halt();
      releaseUrls();
      chunks = [];
      el = null;
      if (wasPlaying) {
        playing = true;
        provider = resolveProvider();
        speakCurrent();
      }
    },
    isPlaying() {
      return playing;
    },
    destroy() {
      playing = false;
      halt();
      releaseUrls();
      clearHighlight();
    },
  };
}
