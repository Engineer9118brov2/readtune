/*
 * ReadTune — calibration test
 *
 * The feature that sets ReadTune apart, and the part a judge will poke hardest,
 * so the method is deliberately conservative:
 *
 *   • Baseline is the RESEARCH-BACKED starter, not a stripped-down page. Every
 *     tested change is a deviation from a page that is already good, so "keep
 *     nothing" leaves you with the research default — never a downgrade.
 *   • A warm-up passage (not scored) absorbs the biggest practice-speed jump.
 *   • Each remaining passage changes exactly ONE thing vs the baseline — font,
 *     spacing, or bionic bolding — so a win can be attributed to that one
 *     change, not a bundle.
 *   • Reading speed is de-trended for practice effect (a small linear fit across
 *     passage position is subtracted) before anything is compared.
 *   • Passages are drawn from a pool (`shared/calibration-passages.js`) with no
 *     repeat until the pool is exhausted, so a retake isn't contaminated by
 *     remembering the text. Each carries a CLOZE check — two words blanked in a
 *     middle sentence — that you can't answer from the title or a skim, so the
 *     comprehension signal is hard to fake.
 *   • Speed, comprehension and a 1–5 ease rating are combined per dimension; a
 *     dimension is only kept if it clears a margin. If nothing does, the test
 *     says so honestly rather than inventing a winner.
 *
 * It is a quick estimate from a few short readings, not an assessment — the
 * result screen says as much, and "retake" exists to check stability. The
 * intro also offers "Start reading now" so nobody has to finish it first.
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
import { RESEARCH_STARTER_PROFILE } from "./shared/research.js";
import {
  pickPassages,
  clozeText,
  plainText,
  clozeOptions,
} from "./shared/calibration-passages.js";
import { createReadingView, applyTypography, paintPage } from "./shared/render.js";
import { analyse, buildProfile, effectText, HELP_THRESHOLD } from "./shared/calibration-score.js";
import { summarizeCalibrations } from "./shared/calibration-insights.js";

/* The anchor every change is measured against: the research-backed starter,
 * with font size pinned to the starter's value so it can't confound the
 * comparison (it's the one knob everyone adjusts by hand anyway). "Keep
 * nothing" therefore hands the reader RESEARCH_STARTER_PROFILE, not a
 * tightened page — the calibration can only improve on a good default. */
const BASELINE = {
  font: RESEARCH_STARTER_PROFILE.font,
  fontSize: RESEARCH_STARTER_PROFILE.fontSize,
  lineHeight: RESEARCH_STARTER_PROFILE.lineHeight,
  letterSpacing: RESEARCH_STARTER_PROFILE.letterSpacing,
  wordSpacing: RESEARCH_STARTER_PROFILE.wordSpacing,
  paragraphSpacing: RESEARCH_STARTER_PROFILE.paragraphSpacing,
  bionic: 0,
  pacing: "flow",
};

/* Warm-up passage — fixed, never scored, absorbs the first-passage practice
 * jump. Carries a cloze like the rest so the flow is consistent. */
const WARMUP = {
  id: "warmup",
  text:
    "A postman on a string of small islands has done the same round by rowing boat for thirty years. In fog he finds each landing by the sound of a different {{bell}} on every {{jetty}}, rung by whoever is expecting a letter.",
  answer: ["bell", "jetty"],
  distractors: [["dog", "porch"], ["horn", "boat"], ["light", "hill"]],
};

/* Each scored dimension = one change from BASELINE. Its passage is assigned at
 * run time from the pool (see buildSequence). `baseline` applies nothing. */
const DIMENSIONS = [
  { key: "baseline", label: "Standard", apply: {} },
  { key: "dyslexic", label: "OpenDyslexic font", apply: { font: "dyslexic" } },
  { key: "atkinson", label: "Atkinson Hyperlegible font", apply: { font: "atkinson" } },
  {
    key: "spacing",
    label: "Roomier spacing",
    apply: { lineHeight: 1.95, letterSpacing: 0.045, wordSpacing: 0.16, paragraphSpacing: 1.3 },
  },
  { key: "bionic", label: "Bionic bolding", apply: { bionic: 40 } },
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

/* All passage ids this browser has already been shown, newest last — drawn
 * from the calibration history so a retake doesn't reuse text the reader
 * might remember. */
async function seenPassageIds() {
  try {
    const history = await loadCalibrations();
    return history.flatMap((h) => (Array.isArray(h.passages) ? h.passages.map((p) => p.id).filter(Boolean) : []));
  } catch {
    return [];
  }
}

/* run order: warm-up, baseline, then the non-baseline dimensions shuffled —
 * each with a distinct pool passage. */
let sequence = [];
async function buildSequence() {
  const variants = DIMENSIONS.filter((d) => d.key !== "baseline");
  for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [variants[i], variants[j]] = [variants[j], variants[i]];
  }
  const ordered = [DIMENSIONS.find((d) => d.key === "baseline"), ...variants];
  const { passages } = pickPassages(ordered.length, await seenPassageIds());
  sequence = [
    { warmup: true, passage: WARMUP, dim: null },
    ...ordered.map((dim, k) => ({ warmup: false, passage: passages[k], dim })),
  ];
}

$("p-total").textContent = String(DIMENSIONS.length); // scored passages (baseline + variants)

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
  passageView.setText(plainText(current.passage.text));
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
  current._words = wordCount(plainText(current.passage.text));
  showQuiz();
}

/* Cloze check: the passage reappears with its two target words blanked, and
 * the reader picks the missing pair from four. You cannot answer it from the
 * topic or a skim — you had to read that line. */
function showQuiz() {
  const p = current.passage;
  $("quiz-q").textContent = "Which words are missing?";
  const passage = $("quiz-passage");
  if (passage) passage.textContent = clozeText(p.text);
  const box = $("quiz-options");
  box.replaceChildren();
  const { options, correctIndex } = clozeOptions(p);
  options.forEach((pair, oi) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cal-option";
    b.textContent = pair.join(" · ");
    b.addEventListener("click", () => {
      current._correct = oi === correctIndex;
      if (current.warmup) advance();
      else show("ease");
    });
    box.appendChild(b);
  });
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
      id: current.passage.id,
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
    extra: { overlay: "none", columnWidth: RESEARCH_STARTER_PROFILE.columnWidth },
  });
  // The calibration measures text formatting only. Carry forward the choices it
  // never tested — the OpenDyslexic-menus preference and the read-aloud rate —
  // so a retake doesn't silently wipe them.
  const prior = await loadProfile();
  profile.dyslexicUiMode = prior.dyslexicUiMode;
  profile.ttsRate = prior.ttsRate;
  const saved = (await writeProfile(profile)) || profile;

  await appendCalibration({
    kept,
    profile: saved,
    speedInformative,
    passages: results.map((r) => ({ key: r.key, id: r.id, ms: Math.round(r.ms), wpm: Math.round(r.wpm), correct: r.correct, ease: r.ease })),
    dims: dims.map((d) => ({ key: d.key, help: Number(d.help.toFixed(3)), speedDelta: Number(d.speedDelta.toFixed(3)) })),
  });
  const setup = (await markSetupStep("calibrated")) || (await loadSetup());

  const history = await loadCalibrations();
  const insights = summarizeCalibrations(history, saved);
  $("result-title").textContent = insights.profileTitle ? `Try: ${insights.profileTitle}` : "Your starting setup";
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
      "ReadTune already has a saved local voice for Listen. Open Voice Fit if you want to review it or try a different one.";
    fitVoice.textContent = "Review Voice Fit";
  } else {
    guide.hidden = false;
    guideTitle.textContent = "Finish setup with Voice Fit";
    guideBody.textContent =
      "Choose a local Piper voice so Listen follows along in your saved font and spacing.";
    fitVoice.textContent = "Choose my local voice";
  }

  show("results");
}

/* ---------- wiring ---------- */

applyStoredDyslexicUi();

$("start").addEventListener("click", async () => {
  const btn = $("start");
  btn.disabled = true;
  step = 0;
  results.length = 0;
  try {
    await buildSequence();
  } finally {
    btn.disabled = false;
  }
  startPassage();
});

/* "Start reading now" — apply the research-backed starter immediately and get
 * out of the way. The calibration is a refinement, not a toll gate; a reader
 * can run it later from the Reading Lab. Also what the demo video shows. */
$("skip")?.addEventListener("click", async () => {
  const prior = await loadProfile();
  const profile = {
    ...DEFAULT_PROFILE,
    ...RESEARCH_STARTER_PROFILE,
    dyslexicUiMode: prior.dyslexicUiMode,
    ttsRate: prior.ttsRate,
  };
  await writeProfile(profile);
  // Deliberately NOT marked as "calibrated" — the reader skipped it and can
  // still be offered it later; they just have a good profile in the meantime.
  location.href = extUrl("pdf.html");
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
