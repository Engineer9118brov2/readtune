/*
 * ReadTune — transport bar
 *
 * The floating bottom pill for the modes that "play": one sentence at a time,
 * word-by-word (RSVP), auto-scroll, and read-aloud. Reader View / PDF mode own
 * the actual playback; this is just the controls.
 */

import { formatRate } from "./settings.js";

const SPEED_LABEL = {
  word: (p) => `${p.wpm} wpm`,
  scroll: (p) => `${p.wpm} wpm`,
  aloud: (p) => formatRate(p.ttsRate),
};

export function createTransport(handlers = {}) {
  const bar = document.createElement("div");
  bar.className = "rt-transport";
  bar.hidden = true;
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Reading controls");

  const mk = (label, txt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.textContent = txt;
    return b;
  };

  const exitBtn = mk("Back to scrolling", "✕");
  const prevBtn = mk("Previous", "‹");
  const playBtn = mk("Play or pause", "▶");
  playBtn.classList.add("rt-play");
  const nextBtn = mk("Next", "›");
  const stopBtn = mk("Stop", "■");
  const label = document.createElement("span");
  label.className = "rt-transport-label";
  const speedBtn = document.createElement("button");
  speedBtn.type = "button";
  speedBtn.className = "rt-transport-speed";
  speedBtn.setAttribute("aria-label", "Reading speed");

  bar.append(exitBtn, prevBtn, playBtn, nextBtn, stopBtn, speedBtn, label);
  document.body.appendChild(bar);

  let mode = "hidden";
  let playing = false;

  exitBtn.addEventListener("click", () => handlers.onExit && handlers.onExit());
  prevBtn.addEventListener("click", () => handlers.onStep && handlers.onStep(-1));
  nextBtn.addEventListener("click", () => handlers.onStep && handlers.onStep(1));
  playBtn.addEventListener("click", () => handlers.onPlayPause && handlers.onPlayPause());
  stopBtn.addEventListener("click", () => handlers.onStop && handlers.onStop());
  speedBtn.addEventListener("click", () => handlers.onSpeed && handlers.onSpeed());

  function layout() {
    bar.hidden = mode === "hidden";
    const isPlayer = mode === "word" || mode === "scroll" || mode === "aloud";
    const isStepper = mode === "sentence" || mode === "word" || mode === "aloud";
    playBtn.hidden = mode === "sentence";
    prevBtn.hidden = !isStepper;
    nextBtn.hidden = !isStepper;
    stopBtn.hidden = mode !== "aloud";
    speedBtn.hidden = !isPlayer;
    playBtn.textContent = playing ? "❚❚" : "▶";
  }

  return {
    el: bar,
    setMode(m, profile) {
      mode = m || "hidden";
      if (profile && SPEED_LABEL[mode]) speedBtn.textContent = SPEED_LABEL[mode](profile);
      layout();
    },
    setPlaying(v) {
      playing = !!v;
      playBtn.textContent = playing ? "❚❚" : "▶";
    },
    setProgress(fraction, text) {
      label.textContent = text || "";
    },
    setSpeed(profile) {
      if (SPEED_LABEL[mode]) speedBtn.textContent = SPEED_LABEL[mode](profile);
    },
    destroy() {
      bar.remove();
    },
  };
}
