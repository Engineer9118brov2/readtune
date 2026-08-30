/*
 * ReadTune — read aloud
 *
 * Uses the browser's built-in speech synthesis (no API key, no network). Speaks
 * one sentence per utterance (Chrome truncates long ones), highlighting the
 * current sentence and — where the voice reports word boundaries — the current
 * word. Pause is implemented as cancel + remember, which is far more reliable
 * across platforms than SpeechSynthesis.pause().
 */

export function isTTSAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function listVoices() {
  if (!isTTSAvailable()) return [];
  return window.speechSynthesis.getVoices().filter((v) => /^en(-|$)/i.test(v.lang));
}

/** Call cb when the voice list becomes available (Chrome loads it async). */
export function onVoicesReady(cb) {
  if (!isTTSAvailable()) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    cb(listVoices());
    return;
  }
  const handler = () => {
    window.speechSynthesis.removeEventListener("voiceschanged", handler);
    cb(listVoices());
  };
  window.speechSynthesis.addEventListener("voiceschanged", handler);
}

export function createTTS({ getFlow, onState = () => {} }) {
  const synth = window.speechSynthesis;
  let sentences = [];
  let i = 0;
  let playing = false;
  let rate = 1;
  let voiceName = "";

  function collect() {
    const flow = getFlow();
    sentences = [];
    if (!flow) return;
    for (const el of flow.querySelectorAll(".rt-s")) {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (text) sentences.push({ el, text });
    }
  }

  function clearHighlight() {
    const flow = getFlow();
    if (!flow) return;
    flow.querySelectorAll(".rt-speak-sentence").forEach((e) => e.classList.remove("rt-speak-sentence"));
    flow.querySelectorAll(".rt-speak-word").forEach((e) => e.classList.remove("rt-speak-word"));
  }

  /** Wrap each word of a sentence span's own text nodes in <span class="rt-w" data-o=…>. */
  function ensureWordSpans(sentence) {
    if (sentence.wordsReady) return;
    sentence.wordsReady = true;
    let offset = 0;
    const walker = document.createTreeWalker(sentence.el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      if (node.parentElement && node.parentElement.closest("a, code")) {
        offset += node.nodeValue.length;
        continue;
      }
      const frag = document.createDocumentFragment();
      const re = /(\s+)|(\S+)/g;
      let m;
      let local = offset;
      while ((m = re.exec(node.nodeValue))) {
        if (m[1]) {
          frag.appendChild(document.createTextNode(m[1]));
        } else {
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

  function highlightWordAt(sentence, charIndex) {
    ensureWordSpans(sentence);
    const spans = [...sentence.el.querySelectorAll(".rt-w")];
    let target = null;
    for (const s of spans) {
      const o = Number(s.dataset.o);
      if (o <= charIndex) target = s;
      else break;
    }
    sentence.el.querySelectorAll(".rt-speak-word").forEach((e) => e.classList.remove("rt-speak-word"));
    if (target) target.classList.add("rt-speak-word");
  }

  function pickVoice() {
    if (!voiceName) return null;
    return synth.getVoices().find((v) => v.name === voiceName) || null;
  }

  function speakCurrent() {
    if (!playing) return;
    if (i >= sentences.length) {
      finish();
      return;
    }
    const s = sentences[i];
    clearHighlight();
    s.el.classList.add("rt-speak-sentence");
    s.el.scrollIntoView({ block: "center", behavior: "smooth" });
    onState({ playing: true, index: i, total: sentences.length });

    const u = new SpeechSynthesisUtterance(s.text);
    u.rate = rate;
    const v = pickVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.onboundary = (ev) => {
      if (ev.name && ev.name !== "word") return;
      try {
        highlightWordAt(s, ev.charIndex || 0);
      } catch {
        /* ignore */
      }
    };
    u.onend = () => {
      if (!playing) return;
      i += 1;
      speakCurrent();
    };
    u.onerror = () => {
      if (!playing) return;
      i += 1;
      speakCurrent();
    };
    synth.speak(u);
  }

  function finish() {
    playing = false;
    synth.cancel();
    clearHighlight();
    onState({ playing: false, done: true, index: sentences.length, total: sentences.length });
  }

  return {
    start(fromIndex) {
      if (!isTTSAvailable()) return;
      collect();
      if (!sentences.length) return;
      if (typeof fromIndex === "number") i = Math.max(0, Math.min(fromIndex, sentences.length - 1));
      synth.cancel();
      playing = true;
      speakCurrent();
    },
    pause() {
      playing = false;
      synth.cancel();
      onState({ playing: false, index: i, total: sentences.length });
    },
    toggle() {
      if (playing) this.pause();
      else this.start(i);
    },
    stop() {
      i = 0;
      finish();
    },
    step(dir) {
      i = Math.max(0, Math.min(sentences.length - 1, i + dir));
      if (playing) {
        synth.cancel();
        speakCurrent();
      } else {
        clearHighlight();
        const s = sentences[i];
        if (s) {
          s.el.classList.add("rt-speak-sentence");
          s.el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        onState({ playing: false, index: i, total: sentences.length });
      }
    },
    seek(fraction) {
      collect();
      i = Math.round(fraction * (sentences.length - 1 || 0));
      if (playing) {
        synth.cancel();
        speakCurrent();
      }
    },
    setRate(r) {
      rate = Math.max(0.5, Math.min(2, Number(r) || 1));
      if (playing) {
        synth.cancel();
        speakCurrent();
      }
    },
    setVoice(name) {
      voiceName = name || "";
      if (playing) {
        synth.cancel();
        speakCurrent();
      }
    },
    isPlaying() {
      return playing;
    },
    destroy() {
      playing = false;
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      clearHighlight();
    },
  };
}
