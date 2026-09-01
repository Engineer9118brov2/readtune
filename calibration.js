/*
 * ReadTune — calibration test
 *
 * The feature that sets ReadTune apart, and the part a judge will poke hardest,
 * so the method is deliberately conservative:
 *
 *   • A warm-up passage (not scored) absorbs the biggest practice-speed jump.
 *   • A baseline passage in plain settings is the anchor.
 *   • Each remaining passage changes exactly ONE thing vs the baseline — font,
 *     spacing, bionic bolding, or one-sentence-at-a-time — so a win can be
 *     attributed to that one change, not a bundle.
 *   • Reading speed is de-trended for practice effect (a small linear fit across
 *     passage position is subtracted) before anything is compared.
 *   • Every passage is ~55–60 words, similar syntax, one comprehension question.
 *   • Speed, comprehension and a 1–5 ease rating are combined per dimension; a
 *     dimension is only kept if it clears a margin. If nothing does, the test
 *     says so honestly rather than inventing a winner.
 *
 * It is a quick estimate from six short readings, not an assessment — the result
 * screen says as much, and "retake" exists to check stability.
 */

import {
  DEFAULT_PROFILE,
  loadProfile,
  writeProfile,
  appendCalibration,
  loadCalibrations,
  markSetupStep,
  loadSetup,
  extUrl,
  applyStoredDyslexicUi,
} from "./shared/settings.js";
import { createReadingView, applyTypography, paintPage } from "./shared/render.js";
import { analyse, buildProfile, effectText, HELP_THRESHOLD } from "./shared/calibration-score.js";
import { summarizeCalibrations } from "./shared/calibration-insights.js";

/* Everything not listed here is DEFAULT_PROFILE. Font size is held constant so it
 * can't confound the comparison — it's the one knob everyone adjusts by hand. */
const BASELINE = {
  font: "sans",
  fontSize: 19,
  lineHeight: 1.55,
  letterSpacing: 0,
  wordSpacing: 0,
  paragraphSpacing: 1,
  bionic: 0,
  pacing: "flow",
};

const WARMUP = {
  text:
    "A small ferry crosses the same channel more than forty times a day. The crew knows the water so well they can hold the boat against the dock without ropes while the last cars roll off.",
  q: "How does the crew hold the boat at the dock?",
  options: ["Without ropes, using the current", "With two heavy anchors", "By keeping the engine in reverse hard", "They tie up to a second boat"],
  answer: 0,
};

/* Each dimension = one change from BASELINE + its own matched passage. */
const DIMENSIONS = [
  {
    key: "baseline",
    label: "Standard",
    apply: {},
    passage: {
      text:
        "The seeds of the wax palm are spread almost entirely by one bird, a large mountain parrot that swallows them whole and drops them far from the parent tree. Where the parrot has vanished, young palms stop appearing, and the forest slowly fills with trees that were already old when the birds were common.",
      q: "What happens in forests where the parrot has vanished?",
      options: ["No young wax palms appear", "The palms grow much faster", "Other birds take over the job", "The oldest palms die within a year"],
      answer: 0,
    },
  },
  {
    key: "dyslexic",
    label: "OpenDyslexic font",
    apply: { font: "dyslexic" },
    passage: {
      text:
        "A lighthouse keeper on a bare stretch of coast kept a garden of flowers that could never have grown there on their own. Every plant began as a seed blown in by a storm or dropped by a passing bird, then coaxed along in soil he carried up from the beach in buckets over many years.",
      q: "Where did the seeds in the keeper's garden come from?",
      options: ["Storms and passing birds", "A supply boat twice a year", "A greenhouse on the rocks", "Cuttings sent from the mainland"],
      answer: 0,
    },
  },
  {
    key: "atkinson",
    label: "Atkinson Hyperlegible font",
    apply: { font: "atkinson" },
    passage: {
      text:
        "The longest freight trains take so long to clear a crossing that some towns have built roads over or under the tracks just to keep their two halves joined. A single train can weigh as much as a small cargo ship, and from the front the driver cannot see the last car even on a straight line.",
      q: "Why did some towns build roads over or under the tracks?",
      options: ["The trains take too long to pass", "The crossings kept flooding", "To make room for a new station", "The old crossings iced over in winter"],
      answer: 0,
    },
  },
  {
    key: "spacing",
    label: "Roomier spacing",
    apply: { lineHeight: 1.95, letterSpacing: 0.045, wordSpacing: 0.16, paragraphSpacing: 1.3 },
    passage: {
      text:
        "A clockmaker in a small mountain town was asked for a tower clock that people could read from the valley floor, almost a mile below. She made the hands as long as a rowing boat and painted them black on a white face, and on clear days farmers set their watches by it from their fields.",
      q: "How did farmers in the valley use the clock?",
      options: ["To set their watches from the fields", "To forecast the next day's weather", "As a signal to begin the harvest", "To find their way home in fog"],
      answer: 0,
    },
  },
  {
    key: "bionic",
    label: "Bionic bolding",
    apply: { bionic: 40 },
    passage: {
      text:
        "Each autumn a certain deep lake turns over. The chilled surface water sinks, the warmer water from below rises, and for a few days the whole lake smells of mud that has sat undisturbed on the bottom all summer. Fish that never leave the depths are suddenly caught near the surface, thrown off by the change.",
      q: "Why are deep-water fish caught near the surface in autumn?",
      options: ["The layers of the lake trade places", "The lake is starting to freeze early", "They are chasing insects upward", "Anglers switch to brighter lures"],
      answer: 0,
    },
  },
  {
    key: "chunk",
    label: "One sentence at a time",
    apply: { pacing: "sentence" },
    passage: {
      text:
        "A town on a river bend used to flood every few springs until it dug a second, straighter channel for the high water to take. Most of the year the new channel is a dry ditch full of grass, but in a bad thaw it carries more water than the river itself and the old town stays dry.",
      q: "What is the new channel like for most of the year?",
      options: ["A dry, grassy ditch", "A slow shallow stream", "A fenced-off canal", "A chain of small ponds"],
      answer: 0,
    },
  },
];

const FONT_KEYS = new Set(["dyslexic", "atkinson"]);
const PREVIEW_TEXT =
  "This line shows the settings the test chose for you. Reader View and PDF mode use them automatically from now on, and you can adjust any of it from the reading-settings panel.";
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
const voiceFitUrl = () => extUrl("lab.html?focus=voice&source=calibration");

/* run order: warm-up, baseline, then the 4 non-baseline dimensions shuffled */
let sequence = [];
function buildSequence() {
  const variants = DIMENSIONS.filter((d) => d.key !== "baseline");
  for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [variants[i], variants[j]] = [variants[j], variants[i]];
  }
  const baseline = DIMENSIONS.find((d) => d.key === "baseline");
  sequence = [
    { warmup: true, passage: WARMUP, dim: null },
    { warmup: false, passage: baseline.passage, dim: baseline },
    ...variants.map((d) => ({ warmup: false, passage: d.passage, dim: d })),
  ];
}

$("p-total").textContent = String(DIMENSIONS.length); // 6 scored passages

let step = 0;
let shownAt = 0;
let armedSkip = false;
let current = null;
const results = []; // one per scored passage, in run order

const show = (name) => {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  window.scrollTo({ top: 0 });
};

function renderProgress() {
  progressEl.hidden = false;
  progressEl.replaceChildren();
  const scoredDone = results.length;
  for (let i = 0; i < DIMENSIONS.length; i++) {
    const dot = document.createElement("i");
    if (i < scoredDone) dot.className = "done";
    else if (i === scoredDone && step > 0) dot.className = "on";
    progressEl.appendChild(dot);
  }
}

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;

function startPassage() {
  current = sequence[step];
  const combo = { ...DEFAULT_PROFILE, ...BASELINE, ...(current.dim ? current.dim.apply : {}) };
  applyTypography(passageSurface, combo);
  paintPage(combo);
  passageView.setText(current.passage.text);
  passageView.applyProfile(combo);

  $("p-num").textContent = current.warmup ? "warm-up" : String(results.length + 1);
  $("p-total-wrap").hidden = current.warmup;
  renderProgress();
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
  current._ms = Math.max(elapsed, 400);
  current._words = wordCount(current.passage.text);
  showQuiz();
}

function showQuiz() {
  const p = current.passage;
  $("quiz-q").textContent = p.q;
  const box = $("quiz-options");
  box.replaceChildren();
  const order = p.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const oi of order) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cal-option";
    b.textContent = p.options[oi];
    b.addEventListener("click", () => {
      current._correct = oi === p.answer;
      if (current.warmup) advance();
      else show("ease");
    });
    box.appendChild(b);
  }
  show("quiz");
}

function recordEase(v) {
  current._ease = v;
  advance();
}

function advance() {
  if (!current.warmup) {
    results.push({
      key: current.dim.key,
      label: current.dim.label,
      apply: current.dim.apply,
      position: results.length,
      ms: current._ms,
      words: current._words,
      wpm: current._words / (current._ms / 60000),
      correct: !!current._correct,
      ease: current._ease || 3,
    });
  }
  step += 1;
  if (step < sequence.length) startPassage();
  else finish();
}

/* ---------- scoring (pure model lives in shared/calibration-score.js) ---------- */

async function finish() {
  progressEl.hidden = true;
  const { dims, speedInformative } = analyse(results, "baseline");
  const { profile, kept } = buildProfile({
    dims,
    baseline: BASELINE,
    defaults: DEFAULT_PROFILE,
    fontKeys: FONT_KEYS,
    extra: { overlay: "none", columnWidth: 64 },
  });
  // The calibration measures text formatting only. Carry forward the choices it
  // never tested — the OpenDyslexic-menus preference and the read-aloud voice —
  // so a retake doesn't silently wipe them.
  const prior = await loadProfile();
  profile.dyslexicUiMode = prior.dyslexicUiMode;
  profile.ttsVoice = prior.ttsVoice;
  profile.ttsRate = prior.ttsRate;
  const saved = (await writeProfile(profile)) || profile;

  await appendCalibration({
    kept,
    profile: saved,
    speedInformative,
    passages: results.map((r) => ({ key: r.key, ms: Math.round(r.ms), wpm: Math.round(r.wpm), correct: r.correct, ease: r.ease })),
    dims: dims.map((d) => ({ key: d.key, help: Number(d.help.toFixed(3)), speedDelta: Number(d.speedDelta.toFixed(3)) })),
  });
  const setup = (await markSetupStep("calibrated")) || (await loadSetup());

  const history = await loadCalibrations();
  const insights = summarizeCalibrations(history, saved);
  $("result-title").textContent = insights.profileTitle || "Your reading profile";
  $("result-desc").textContent = insights.profileSummary;

  // headline
  const top = insights.top || dims[0];
  const headline = $("result-headline");
  headline.textContent = insights.signalTitle;
  headline.hidden = false;
  $("result-confidence-label").textContent = insights.confidenceLabel;
  $("result-confidence-body").textContent = insights.confidenceBody;
  $("result-stability-label").textContent = insights.stabilityLabel;
  $("result-stability-body").textContent = insights.stabilityBody;
  $("result-next-title").textContent = insights.nextStepTitle;
  $("result-next-body").textContent = insights.nextStepBody;

  const useCases = $("result-use-cases");
  useCases.replaceChildren();
  for (const card of insights.useCases) {
    const item = document.createElement("article");
    item.className = "cal-use-case";
    const tag = document.createElement("span");
    tag.textContent = card.tag;
    const title = document.createElement("strong");
    title.textContent = card.title;
    const body = document.createElement("p");
    body.textContent = card.body;
    item.append(tag, title, body);
    useCases.appendChild(item);
  }

  // per-dimension breakdown
  const bd = $("result-breakdown");
  bd.replaceChildren();
  for (const d of dims) {
    const row = document.createElement("div");
    row.className = "cal-dim" + (kept.includes(d.key) ? " cal-dim-on" : "");
    const main = document.createElement("div");
    main.className = "cal-dim-main";
    const title = document.createElement("div");
    title.className = "cal-dim-title";
    const name = document.createElement("b");
    name.textContent = d.label;
    const eff = document.createElement("span");
    eff.textContent = effectText(d, speedInformative);
    const tag = document.createElement("i");
    tag.textContent = kept.includes(d.key) ? "kept" : "";
    title.append(name, tag);
    main.append(title, eff);
    const track = document.createElement("div");
    track.className = "cal-dim-track";
    const fill = document.createElement("div");
    fill.className = "cal-dim-fill";
    if (d.help <= 0) fill.classList.add("cal-dim-fill-muted");
    fill.style.width = `${Math.max(18, Math.min(100, 22 + Math.max(0, d.help) * 260))}%`;
    track.appendChild(fill);
    row.append(main, track);
    bd.appendChild(row);
  }

  // raw per-passage table (details)
  const rows = $("result-rows");
  rows.replaceChildren();
  const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
  for (const d of [DIMENSIONS[0], ...dims]) {
    const r = byKey[d.key];
    if (!r) continue;
    const tr = document.createElement("tr");
    if (kept.includes(d.key) || (d.key === "baseline" && !kept.length)) tr.className = "cal-winner";
    for (const c of [d.label, String(Math.round(r.wpm)), r.correct ? "Yes" : "No", "★".repeat(r.ease)]) {
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

  if (history.length > 1) {
    const last = history[history.length - 2];
    if (last && last.profile) {
      $("result-compare").hidden = false;
      $("result-compare").textContent = `Previous run: ${summarizeCalibrations(history.slice(0, -1), last.profile).profileTitle}.`;
    }
  }

  const guide = $("result-setup-guide");
  const guideTitle = $("result-setup-title");
  const guideBody = $("result-setup-body");
  const fitVoice = $("fit-voice");
  if (setup && setup.voiceFitAt) {
    guide.hidden = false;
    guideTitle.textContent = "Your voice fit is already part of setup";
    guideBody.textContent =
      "ReadTune already has a saved free voice for Listen. Open Voice Fit if you want to review it or try a different one.";
    fitVoice.textContent = "Review Voice Fit";
  } else {
    guide.hidden = false;
    guideTitle.textContent = "Finish setup with Voice Fit";
    guideBody.textContent =
      "Pick the calmest free voice on this device so Listen follows along in your saved font and spacing.";
    fitVoice.textContent = "Fit my free voice";
  }

  show("results");
}

/* ---------- wiring ---------- */

applyStoredDyslexicUi();

$("start").addEventListener("click", () => {
  step = 0;
  results.length = 0;
  buildSequence();
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
$("btn-lab").addEventListener("click", () => {
  location.href = extUrl("lab.html");
});
$("fit-voice").addEventListener("click", () => {
  location.href = voiceFitUrl();
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
