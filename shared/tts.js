/*
 * ReadTune — read aloud
 *
 * Two backends behind one interface:
 *   • "piper"      — an on-device neural voice (default). The default model
 *                    ships in the extension, so it works offline; other voices
 *                    download once. Runs in a Web Worker. Word highlighting is a
 *                    proportional estimate (the model emits no word timings).
 *   • "elevenlabs" — the user's own ElevenLabs key. Sentences are batched into
 *                    short chunks; each chunk's /with-timestamps response gives
 *                    per-character timings, so the spoken word is highlighted
 *                    precisely. Chunks are fetched just-in-time (+1 prefetch) so
 *                    stopping early doesn't spend quota on the rest of the text.
 *
 * There is no browser-speech (SpeechSynthesis) backend — the plain system
 * voices are the thing users disliked most. If Piper can't start, read-aloud
 * reports it rather than dropping to a robotic voice.
 *
 * Sentence + word highlighting in the page is shared between the two.
 */

import { synthesize, charIndexAt } from "./elevenlabs.js";
import { createPiperEngine } from "./piper.js";
import { RANGES, clampRate } from "./settings.js";

const CHUNK_CHARS = 550;

/* Piper emits no word timings, so for that voice we estimate which word is
 * being spoken. A flat "each word gets an equal slice of the clip" estimate
 * drifts badly — real words vary 3–4× in length and punctuation adds pauses.
 * This gives each word a weight ∝ its length plus a bonus for a trailing
 * mark, normalised to a 0–1 cumulative curve the driver walks against elapsed
 * fraction. Pure + exported for the harness. */
export function wordDurationWeights(words) {
  const last = words.length - 1;
  const raw = words.map((w, idx) => {
    const s = String(w || "");
    const letters = Math.max(1, s.replace(/[^A-Za-z0-9À-ɏ']/g, "").length || s.length);
    let pause = 0;
    /* A pause bonus only matters *between* words. The last word is held to the
       end of the clip regardless, so giving it one just inflates the total and
       pulls every earlier boundary forward — the mark would lead the voice.
       (trimSilence removes its trailing silence anyway.) */
    if (idx < last) {
      if (/[.!?…]["')\]]?$/.test(s)) pause = 6;
      else if (/[,;:—–)]["']?$/.test(s)) pause = 3;
    }
    return letters + 1 + pause; // +1 so a bare "a"/"I" still has some duration
  });
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  // cumulative fraction at the END of each word
  return raw.map((v) => (acc += v) / total);
}

/** Given the cumulative end-fractions and the fraction of the clip elapsed,
 *  the index of the word currently being spoken. */
export function wordAtFraction(cumEnds, fraction) {
  for (let k = 0; k < cumEnds.length; k++) if (fraction <= cumEnds[k]) return k;
  return cumEnds.length - 1;
}

/* The read-aloud word mark.
 *
 * There is exactly one at a time, anywhere in the flow. Clearing only inside
 * the current sentence is what left a trail of stale green marks behind the
 * reader — every sentence kept its last highlighted word forever. */
let markedWord = null;

export function markWord(flow, target) {
  if (!flow) return null;
  /* This runs from a requestAnimationFrame loop, so it is called at ~60Hz with
     the same target for most of a word's duration. Sweeping the whole flow
     every frame made highlighting cost scale with the length of the article.
     Hold on to the marked node and touch the DOM only when it actually moves. */
  if (markedWord === target && (!target || target.isConnected)) return target;
  if (markedWord && markedWord.isConnected) markedWord.classList.remove("rt-speak-word");
  /* One full sweep whenever we've lost track — first mark of a run, or after a
     re-render — so a stray mark can never survive. */
  if (!markedWord) flow.querySelectorAll(".rt-speak-word").forEach((e) => e.classList.remove("rt-speak-word"));
  if (target) target.classList.add("rt-speak-word");
  markedWord = target || null;
  return markedWord;
}

export function createTTS({
  getFlow,
  onState = () => {},
  onStatus = () => {},
  getConfig = () => ({ provider: "piper" }),
  onError = () => {},
}) {
  let sentences = [];
  let i = 0;
  let playing = false;
  let rate = 1;
  let provider = "piper";
  let run = 0; // bumped on every stop/restart; async work checks it

  // ElevenLabs state
  let chunks = [];
  let chunkCache = new Map(); // k -> Promise<{ url, alignment }>
  let audio = null;
  let el = null; // { k, data, chunk } currently playing
  let raf = 0;
  let piper = null;
  let piperUrl = "";
  let piperSentence = null;
  let piperPrefetch = new Map(); // sentence index -> Promise<Blob>, synthesised one ahead
  let piperPrefetchRate = 1; // the rate those blobs were synthesised at

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
    markedWord = null;
    flow.querySelectorAll(".rt-speak-sentence, .rt-speak-word").forEach((e) =>
      e.classList.remove("rt-speak-sentence", "rt-speak-word")
    );
  }

  function markSentence(idx, scroll = true) {
    const flow = getFlow();
    if (!flow) return;
    flow.querySelectorAll(".rt-speak-sentence").forEach((e) => e.classList.remove("rt-speak-sentence"));
    markWord(flow, null);
    const s = sentences[idx];
    if (!s) return;
    s.el.classList.add("rt-speak-sentence");
    /* A folded infobox must open when reading reaches it — otherwise playback
       carries on inside a collapsed <details> with nothing visible to follow. */
    for (let d = s.el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
    if (scroll) s.el.scrollIntoView({ block: "center", behavior: "smooth" });
    onState({ playing, index: idx, total: sentences.length });
  }

  function ensureWordSpans(sentence) {
    if (sentence.wordsReady) return;
    sentence.wordsReady = true;
    let offset = 0;
    /* Every spoken token in order, with the span to light for it (null = Piper
       says it but it gets no visible mark, e.g. inline code). drivePiper builds
       its timing curve from this so a code fragment still costs its share of
       the clip and the highlight after it doesn't run ahead of the voice. */
    const speech = [];
    const nodes = [];
    const walker = document.createTreeWalker(sentence.el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const isCode = node.parentElement && node.parentElement.closest("code");
      if (isCode) {
        for (const word of node.nodeValue.split(/\s+/)) {
          if (word) speech.push({ text: word, span: null });
        }
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
          speech.push({ text: m[2], span: w });
        }
        local += m[0].length;
      }
      offset += node.nodeValue.length;
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    }
    sentence.speech = speech;
  }

  function highlightWord(sentence, charIndex) {
    ensureWordSpans(sentence);
    const spans = [...sentence.el.querySelectorAll(".rt-w")];
    let target = null;
    for (const s of spans) {
      if (Number(s.dataset.o) <= charIndex) target = s;
      else break;
    }
    markWord(getFlow() || sentence.el, target);
  }

  /* Read-aloud has one on-device engine (Piper). If it can't run, the honest
     answer is a clear message — never a fall back to a robotic system voice. */
  function readAloudFailed(message) {
    playing = false;
    run++;
    stopAudioEl();
    stopPiperAudio();
    clearHighlight();
    onError(message || "Read-aloud couldn't start on this device.");
    onState({ playing: false, done: true, index: i, total: sentences.length });
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
      onError(err && err.message ? err.message : "ElevenLabs request failed. Switching to the on-device voice.");
      provider = "piper";
      i = sentenceIdx;
      return piperSpeak();
    }
    if (!playing || mine !== run) return;

    const chunk = chunks[k];
    el = { k, data, chunk };
    stopAudioEl();
    audio = new Audio(data.url);
    /* ElevenLabs has a synth-time speed knob (voice_settings.speed) we could
       use for exact tempo like Piper's length_scale; until then it's a live
       playbackRate stretch on ~550-char chunks (long enough that the
       pitch-preserving stretch holds up). */
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
      onError("Audio playback failed. Switching to the on-device voice.");
      provider = "piper";
      i = sentenceIdx;
      piperSpeak();
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

  function stopPiperAudio() {
    cancelAnimationFrame(raf);
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause();
      audio = null;
    }
    if (piperUrl) URL.revokeObjectURL(piperUrl);
    piperUrl = "";
    piperSentence = null;
  }

  function drivePiper(mine, sentence = piperSentence) {
    cancelAnimationFrame(raf);
    /* Word position estimate. Silence is trimmed at synthesis (piper-tts-web
       patch) so audio.duration is the speech duration, and the cumulative
       weight curve accounts for word length + punctuation pauses — far closer
       than "elapsed fraction × character count", which trailed the voice. */
    ensureWordSpans(sentence);
    const speech = sentence.speech || [];
    const cumEnds = wordDurationWeights(speech.map((t) => t.text));
    const flow = getFlow() || sentence.el;
    const tick = () => {
      if (!playing || mine !== run || !audio || !sentence) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0 && speech.length) {
        const frac = Math.min(1, audio.currentTime / audio.duration);
        try {
          const tok = speech[wordAtFraction(cumEnds, frac)];
          markWord(flow, (tok && tok.span) || null);
        } catch {}
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function ensurePiper() {
    if (!piper) {
      piper = createPiperEngine({
        voiceId: getConfig().piperVoice,
        onStatus: (status) => onStatus({ provider: "piper", ...status }),
      });
    }
    return piper;
  }

  /* Synthesise a sentence at the current rate, reusing the one-ahead prefetch
     when it's for the right index and rate. */
  function synthPiper(idx) {
    if (idx < 0 || idx >= sentences.length) return null;
    const cached = piperPrefetch.get(idx);
    if (cached && piperPrefetchRate === rate) return cached;
    const p = ensurePiper().synthesize(sentences[idx].text, { rate });
    piperPrefetch.set(idx, p);
    piperPrefetchRate = rate;
    return p;
  }

  /* Drop the one-ahead cache. `keep` (a sentence index) survives if its blob
     is still in flight and at the current rate — stepping straight to a
     sentence we were already prefetching shouldn't launch a duplicate
     inference on the single-threaded worker. */
  function clearPiperPrefetch(keep) {
    const kept = keep != null ? piperPrefetch.get(keep) : null;
    piperPrefetch = new Map();
    if (kept && piperPrefetchRate === rate) piperPrefetch.set(keep, kept);
  }

  async function piperSpeak() {
    if (!playing) return;
    if (i >= sentences.length) return finish();
    const mine = run;
    const sentence = sentences[i];
    markSentence(i);
    try {
      ensurePiper();
      /* Re-synthesise until the blob's rate matches the current setting: the
         reader can nudge the speed (any number of times) while this sentence
         is still being prepared, and playback hasn't started yet, so it should
         open at the rate that's on the dial now — not whatever it was when the
         first synth kicked off. setRate clears the prefetch map on each change,
         so each pass here re-synthesises at the latest rate. */
      let blob;
      let atRate;
      do {
        atRate = rate;
        blob = await synthPiper(i);
        if (!playing || mine !== run) return;
      } while (rate !== atRate);
      piperPrefetch.delete(i);
      stopPiperAudio();
      piperUrl = URL.createObjectURL(blob);
      audio = new Audio(piperUrl);
      piperSentence = sentence;
      /* Rate is baked into synthesis (length_scale), so playback is 1×. */
      audio.onended = () => {
        if (!playing || mine !== run) return;
        i += 1;
        piperSpeak();
      };
      audio.onerror = () => {
        if (!playing || mine !== run) return;
        const message = "The on-device voice couldn't play this sentence.";
        onStatus({ provider: "piper", kind: "error", message, percent: null });
        readAloudFailed(message);
      };
      await audio.play();
      drivePiper(mine, sentence);
      /* Warm the next sentence while this one plays, so the highlight doesn't
         stall at the end of a sentence waiting on synthesis. */
      if (i + 1 < sentences.length) { const p = synthPiper(i + 1); if (p) p.catch(() => {}); }
    } catch (err) {
      if (!playing || mine !== run) return;
      const message = err && err.message ? err.message : "The on-device voice couldn't start.";
      onStatus({ provider: "piper", kind: "error", message, percent: null });
      readAloudFailed(message);
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
      piperSpeak();
    }
  }

  function finish() {
    playing = false;
    run++;
    stopAudioEl();
    stopPiperAudio();
    clearPiperPrefetch();
    el = null;
    releaseUrls();
    clearHighlight();
    onState({ playing: false, done: true, index: sentences.length, total: sentences.length });
  }

  function halt(keepPrefetch) {
    run++;
    stopAudioEl();
    stopPiperAudio();
    clearPiperPrefetch(keepPrefetch);
  }

  function resolveProvider() {
    const cfg = getConfig();
    return cfg.provider === "elevenlabs" && cfg.apiKey && cfg.voiceId ? "elevenlabs" : "piper";
  }

  return {
    /* Speak one word or phrase without disturbing playback position.
       Reuses the engine read-aloud already has, so looking a word up doesn't
       spin a second Piper worker or re-load the voice model. Pass a `signal`
       to stop it early — the assistant's "Hear it" does when its card closes,
       so a minute-long summary read doesn't outlive the card. */
    async speakOnce(text, { signal } = {}) {
      const say = String(text || "").trim();
      if (!say || (signal && signal.aborted)) return;
      if (!piper) {
        piper = createPiperEngine({
          voiceId: getConfig().piperVoice,
          onStatus: (status) => onStatus({ provider: "piper", ...status }),
        });
      }
      /* The caller ducks narration around this and restores it in a finally,
         and the "Hear it" button re-enables itself the same way, so this must
         always settle. A synth that never resolves, an <audio> that never
         fires ended/error, or a caller that walks away would otherwise freeze
         read-aloud permanently. One abort listener for the whole call, removed
         in the finally below; each withTimeout also races a per-step stall. */
      let onAbort;
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new DOMException("Aborted", "AbortError"));
      });
      aborted.catch(() => {}); // a racer — may settle between the two races below
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      const withTimeout = (p, ms, onExpire) => {
        let timer;
        const expiry = new Promise((_, reject) => {
          timer = setTimeout(() => {
            if (onExpire) onExpire();
            reject(new Error("speakOnce timed out"));
          }, ms);
        });
        return Promise.race([p, expiry, aborted]).finally(() => clearTimeout(timer));
      };
      /* The ceilings scale with length. A word lookup keeps the old 30 s / 15 s
         floors; a whole summary or a simplified paragraph from the assistant
         needs room to synthesise and play in full. They still exist to break a
         wedged synth or a stalled <audio>, not to cut a long passage off —
         ~11 chars/s of speech, with generous slack and a hard cap. */
      const audioMs = (say.length / 11) * 1000;
      const synthMs = Math.min(Math.max(30000, audioMs * 1.5 + 5000), 240000);
      const playMs = Math.min(Math.max(15000, audioMs * 1.5), 300000);
      let url;
      let one;
      try {
        /* A looked-up word is for clarity, not pace — never faster than 1×,
           but honour a reader who has slowed everything down. Baked into
           synthesis so it stays crisp. */
        const blob = await withTimeout(piper.synthesize(say, { rate: Math.min(rate, 1) }), synthMs);
        url = URL.createObjectURL(blob);
        one = new Audio(url);
        /* play() resolves when playback *starts*; the caller ducks narration
           around this call, so settle on ended/error instead. */
        await withTimeout(
          new Promise((resolve) => {
            const finish = () => resolve();
            one.onended = finish;
            one.onerror = finish;
            one.play().catch(finish);
          }),
          playMs,
          () => { try { one.pause(); } catch {} },
        );
        return one;
      } catch {
        /* a silent "Hear it" beats one stuck on "…" */
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
        if (one) { try { one.pause(); } catch {} } // stop a timed-out / aborted read
        if (url) URL.revokeObjectURL(url);
      }
    },
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
      } else if (provider === "piper" && audio && piperSentence) {
        playing = true;
        audio.play().then(() => drivePiper(run, piperSentence)).catch(() => {
          playing = false;
          onError("Couldn't resume the local voice. Press Play to try that sentence again.");
        });
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
        halt(i); // a one-ahead prefetch for exactly this sentence is still good
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
        halt(i);
        playing = true;
        speakCurrent();
      } else {
        markSentence(i);
      }
    },
    setRate(r) {
      /* One clamp for the whole app — see clampRate in settings.js. There used
         to be three that disagreed, so playback pinned at 2× while the UI
         reported 3×. */
      const next = clampRate(r);
      if (next === rate) return;
      rate = next;
      /* Piper bakes rate into synthesis (length_scale), so the prefetched blob
         is now stale — drop it and re-synth the next sentence at the new rate.
         The sentence already playing finishes at its old rate. ElevenLabs has
         no synth-time speed knob here, so it still resamples live. */
      if (provider === "piper") clearPiperPrefetch();
      else if (audio) audio.playbackRate = rate;
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
      if (piper) piper.destroy();
      piper = null;
      clearHighlight();
    },
  };
}
