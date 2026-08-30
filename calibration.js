/*
 * ReadTune — calibration test
 *
 * The feature that sets ReadTune apart. Five passages, each rendered a different
 * way. For each we record reading time, a comprehension question, and a 1–5 ease
 * rating, then score every style against this reader's own results — so a
 * naturally slower reader isn't penalised, only which style was relatively
 * better for THEM.
 */

import {
  DEFAULT_PROFILE,
  FONTS,
  writeProfile,
  appendCalibration,
  loadCalibrations,
  describeProfile,
  extUrl,
} from "./shared/settings.js";
import { createReadingView, applyTypography, paintPage } from "./shared/render.js";

const PASSAGES = [
  {
    id: "plain",
    name: "Standard, no bolding",
    text:
      "The public library on Cedar Street keeps a shelf near the entrance for tools instead of books. With the same card they use for novels, visitors can borrow a pressure washer, a sewing machine, or a telescope. The collection began as one drawer of kitchen gadgets and now fills three tall cabinets along the back wall.",
    q: "What did the library's tool collection start as?",
    options: ["One drawer of kitchen gadgets", "A donated set of power tools", "A shelf of repair manuals"],
    answer: 0,
    settings: { font: "sans", fontSize: 19, lineHeight: 1.5, letterSpacing: 0, wordSpacing: 0, paragraphSpacing: 1, bionic: 0, pacing: "flow" },
  },
  {
    id: "bionic-open",
    name: "Bionic bolding + open spacing",
    text:
      "Sea otters often wrap themselves in strands of kelp before they sleep so the current cannot carry them away from the group. A raft of resting otters can drift together for hours. Pups that are too young to dive stay on their mothers' chests, dry and afloat, until their fur grows thick enough to trap air.",
    q: "Why do sea otters wrap themselves in kelp?",
    options: ["To stay warm in cold water", "So the current doesn't carry them off", "To hide from predators below"],
    answer: 1,
    settings: { font: "sans", fontSize: 20, lineHeight: 1.85, letterSpacing: 0.04, wordSpacing: 0.14, paragraphSpacing: 1.2, bionic: 42, pacing: "flow" },
  },
  {
    id: "dyslexic",
    name: "OpenDyslexic font",
    text:
      "A weather balloon let go at dawn will rise for about two hours before the thin air lets it stretch past its limit and burst. The instrument pack then drifts back down under a small parachute, often landing many miles away. Volunteers follow the signal and mail the sensors back to the station to be launched again.",
    q: "What happens to the balloon after about two hours?",
    options: ["It is pulled back down by a line", "It bursts in the thin air", "It floats level until sunset"],
    answer: 1,
    settings: { font: "dyslexic", fontSize: 20, lineHeight: 1.9, letterSpacing: 0.03, wordSpacing: 0.18, paragraphSpacing: 1.2, bionic: 0, pacing: "flow" },
  },
  {
    id: "atkinson",
    name: "Atkinson Hyperlegible font",
    text:
      "The oldest known shoe is a sandal woven from sagebrush bark, found in a cave in Oregon and roughly ten thousand years old. Dozens of similar sandals turned up in the same cave, in a range of sizes. Whoever made them pressed the bark fibres flat and twisted them into cords before weaving the sole.",
    q: "What is the oldest known shoe made from?",
    options: ["Tanned deer hide", "Woven sagebrush bark", "Carved cork and reed"],
    answer: 1,
    settings: { font: "atkinson", fontSize: 20, lineHeight: 1.75, letterSpacing: 0.02, wordSpacing: 0.1, paragraphSpacing: 1.15, bionic: 0, pacing: "flow" },
  },
  {
    id: "bionic-sentence",
    name: "Bionic bolding + one sentence at a time",
    text:
      "One of the oldest known maps of the night sky is carved into a small piece of ivory found in a cave in Germany. Researchers think it is about thirty two thousand years old. The carving seems to show the constellation we now call Orion, with the same three stars in a row that people still point to today.",
    q: "Which constellation does the ivory carving seem to show?",
    options: ["The Big Dipper", "Orion", "Cassiopeia"],
    answer: 1,
    settings: { font: "sans", fontSize: 21, lineHeight: 1.7, letterSpacing: 0.02, wordSpacing: 0.08, paragraphSpacing: 1, bionic: 35, pacing: "sentence" },
  },
];

const PREVIEW_TEXT =
  "This short line shows the settings the test picked for you. Reader View and PDF mode will look like this from now on, and you can fine-tune any of it from the reading settings panel.";

const MIN_READ_MS = 1400;

const $ = (id) => document.getElementById(id);
const screens = {
  intro: $("screen-intro"),
  passage: $("screen-passage"),
  quiz: $("screen-quiz"),
  ease: $("screen-ease"),
  results: $("screen-results"),
};
const progressEl = $("progress");
const passageSurface = $("passage-surface");
const passageView = createReadingView($("passage-view"));

$("p-total").textContent = String(PASSAGES.length);

let step = 0;
let shownAt = 0;
let armedSkip = false;
const results = [];

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  window.scrollTo({ top: 0 });
}

function renderProgress() {
  progressEl.hidden = false;
  progressEl.replaceChildren();
  for (let i = 0; i < PASSAGES.length; i++) {
    const dot = document.createElement("i");
    if (i < step) dot.className = "done";
    else if (i === step) dot.className = "on";
    progressEl.appendChild(dot);
  }
}

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;

function startPassage() {
  const p = PASSAGES[step];
  $("p-num").textContent = String(step + 1);
  renderProgress();
  const combo = { ...DEFAULT_PROFILE, ...p.settings };
  applyTypography(passageSurface, combo);
  paintPage(combo);
  passageView.setText(p.text);
  passageView.applyProfile(combo);
  $("passage-hint").hidden = true;
  armedSkip = false;
  show("passage");
  requestAnimationFrame(() => {
    shownAt = performance.now();
  });
}

function finishPassage() {
  const elapsed = performance.now() - shownAt;
  if (elapsed < MIN_READ_MS && !armedSkip) {
    $("passage-hint").hidden = false;
    armedSkip = true;
    return;
  }
  results[step] = {
    id: PASSAGES[step].id,
    name: PASSAGES[step].name,
    settings: PASSAGES[step].settings,
    ms: Math.max(elapsed, 400),
    words: wordCount(PASSAGES[step].text),
  };
  showQuiz();
}

function showQuiz() {
  const p = PASSAGES[step];
  $("quiz-q").textContent = p.q;
  const box = $("quiz-options");
  box.replaceChildren();
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  for (const oi of order) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cal-option";
    b.textContent = p.options[oi];
    b.addEventListener("click", () => {
      results[step].correct = oi === p.answer;
      show("ease");
    });
    box.appendChild(b);
  }
  show("quiz");
}

function recordEase(v) {
  results[step].ease = v;
  step += 1;
  if (step < PASSAGES.length) startPassage();
  else finish();
}

/* ---- scoring ---- */

function scoreResults(list) {
  const wpm = list.map((r) => r.words / (Math.max(r.ms, MIN_READ_MS) / 60000));
  const minW = Math.min(...wpm);
  const maxW = Math.max(...wpm);
  const meanW = wpm.reduce((a, b) => a + b, 0) / wpm.length;
  const spread = maxW - minW;
  const speedInformative = meanW > 0 && spread / meanW > 0.12;

  return list.map((r, i) => {
    const speedNorm = speedInformative ? (wpm[i] - minW) / spread : 0.5;
    const easeNorm = ((r.ease || 3) - 1) / 4;
    const compNorm = r.correct ? 1 : 0.35; // getting it right matters, but one question is noisy
    // comprehension gates, ease and speed split the rest
    const total = compNorm * (0.34 + (speedInformative ? 0.33 : 0) * speedNorm + (speedInformative ? 0.33 : 0.66) * easeNorm);
    return { ...r, wpm: wpm[i], speedNorm, easeNorm, compNorm, total, speedInformative };
  });
}

const pickWinner = (scored) =>
  [...scored].sort((a, b) => b.total - a.total || (b.ease || 0) - (a.ease || 0))[0];

async function finish() {
  progressEl.hidden = true;
  const scored = scoreResults(results);
  const winner = pickWinner(scored);
  const baseline = scored.find((s) => s.id === "plain") || scored[0];

  const profile = { ...DEFAULT_PROFILE, ...winner.settings, overlay: "none", columnWidth: 64 };
  const saved = (await writeProfile(profile)) || profile;

  const prior = await loadCalibrations();
  await appendCalibration({
    winner: winner.id,
    profile: saved,
    passages: scored.map((s) => ({ id: s.id, ms: Math.round(s.ms), ease: s.ease, correct: !!s.correct, wpm: Math.round(s.wpm) })),
  });

  $("result-desc").textContent = describeProfile(saved);

  // headline: how much better than the plain baseline
  const gain = baseline && baseline.wpm ? Math.round(((winner.wpm - baseline.wpm) / baseline.wpm) * 100) : 0;
  if (winner.id !== baseline.id && gain >= 5) {
    $("result-headline").hidden = false;
    $("result-headline").textContent = `You read about ${gain}% faster with this style than with plain text.`;
  } else if (winner.id !== baseline.id) {
    $("result-headline").hidden = false;
    $("result-headline").textContent = "This style felt clearly easier for you, even at a similar speed.";
  }

  // table
  const rows = $("result-rows");
  rows.replaceChildren();
  for (const s of scored) {
    const tr = document.createElement("tr");
    if (s.id === winner.id) tr.className = "cal-winner";
    tr.innerHTML = "";
    const cells = [
      s.name + (s.id === winner.id ? "  ✓" : ""),
      String(Math.round(s.wpm)),
      s.correct ? "Yes" : "No",
      "★".repeat(s.ease || 0),
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    rows.appendChild(tr);
  }

  // live preview
  applyTypography($("preview-surface"), saved);
  const previewView = createReadingView($("preview-view"));
  previewView.setText(PREVIEW_TEXT);
  previewView.applyProfile({ ...saved, pacing: "flow" });
  paintPage(saved);

  if (prior.length) {
    const last = prior[prior.length - 1];
    if (last && last.profile) {
      $("result-compare").hidden = false;
      $("result-compare").textContent = `Last time the test picked: ${describeProfile(last.profile)}.`;
    }
  }

  show("results");
}

/* ---- wiring ---- */

$("start").addEventListener("click", () => {
  step = 0;
  results.length = 0;
  startPassage();
});
$("done").addEventListener("click", finishPassage);
$("scale").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (b) recordEase(Number(b.dataset.v));
});
$("retake").addEventListener("click", () => location.reload());
$("try-pdf").addEventListener("click", () => {
  location.href = extUrl("pdf.html");
});
$("finish").addEventListener("click", () => window.close());

document.addEventListener("keydown", (e) => {
  if (!screens.ease.hidden && /^[1-5]$/.test(e.key)) recordEase(Number(e.key));
  else if (!screens.passage.hidden && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    finishPassage();
  }
});

show("intro");
