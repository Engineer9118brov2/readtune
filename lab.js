/*
 * ReadTune — Reading Lab
 *
 * Turns calibration history into an explainable dashboard so users can see
 * whether the same signal is repeating or if they should retake the test.
 * It also helps them fit a free read-aloud voice without leaving the lab.
 */

import {
  hasProfile,
  loadProfile,
  loadCalibrations,
  saveProfile,
  loadTTSConfig,
  saveTTSConfig,
  markSetupStep,
  extUrl,
  describeProfile,
  applyDyslexicUi,
  FONTS,
} from "./shared/settings.js";
import { createReadingView, applyTypography, paintPage } from "./shared/render.js";
import { summarizeCalibrations, labelForDimension, buildProfileTitle } from "./shared/calibration-insights.js";
import { PIPER_VOICES, createPiperEngine, piperVoiceById, piperVoiceNeedsDownload, requestPiperPermission } from "./shared/piper.js";
import { RESEARCH_FOUNDATIONS, RESEARCH_EXPERIMENTS, evidenceLevel, researchStarterPatch } from "./shared/research.js";
import { describeAvailability } from "./shared/assist.js";

const PREVIEW_TEXT =
  "This is the profile ReadTune is carrying into articles and PDFs for you right now. The Reading Lab shows whether this signal looks new, emerging, or steady enough to trust as your default.";
const VOICE_SAMPLE =
  "ReadTune can read aloud while you follow along in your calibrated font and spacing. Pick the voice that feels clearest and least tiring for you.";

const $ = (id) => document.getElementById(id);
const launchParams = new URLSearchParams(location.search);
const launchFocus = launchParams.get("focus");
const launchSource = launchParams.get("source");

let profile = null;
let ttsConfig = null;
let previewingVoice = "";
let voiceNotice = "";
let previewRun = 0;
let piperPreview = null;
let piperPreviewAudio = null;
let piperPreviewUrl = "";
let latestInsights = null;
let profilePreviewSurface = null;
let profilePreviewView = null;
let voicePreviewSurface = null;
let voicePreviewView = null;
let starterResetTimer = 0;

function makeTag(text) {
  const node = document.createElement("span");
  node.className = "lab-tag";
  node.textContent = text;
  return node;
}

function makeVoiceChip(text) {
  const node = document.createElement("span");
  node.className = "lab-voice-chip";
  node.textContent = text;
  return node;
}

function makeEvidenceCard(item) {
  const meta = evidenceLevel(item.level);
  const node = document.createElement("article");
  node.className = "lab-evidence-card";
  node.dataset.tone = meta.tone;

  const chip = document.createElement("span");
  chip.className = "lab-evidence-chip";
  chip.dataset.tone = meta.tone;
  chip.textContent = meta.label;

  const title = document.createElement("strong");
  title.textContent = item.title;

  const body = document.createElement("p");
  body.textContent = item.body;

  node.append(chip, title, body);
  return node;
}

function renderEvidence(hostId, items) {
  const host = $(hostId);
  host.replaceChildren(...items.map(makeEvidenceCard));
}

function syncProfileCard() {
  $("lab-profile-title").textContent = buildProfileTitle(profile || {}, (latestInsights && latestInsights.kept) || []);
  $("lab-profile-desc").textContent = profile ? describeProfile(profile) : "";
  renderProfileTags(latestInsights || { kept: [] }, profile);
}

function syncPreviewSurfaces() {
  if (profilePreviewSurface && profilePreviewView) {
    applyTypography(profilePreviewSurface, profile);
    profilePreviewView.applyProfile({ ...profile, pacing: "flow" });
  }
  if (voicePreviewSurface && voicePreviewView) {
    applyTypography(voicePreviewSurface, profile);
    voicePreviewView.applyProfile({ ...profile, pacing: "flow" });
  }
  paintPage(profile);
}

function renderLeaderboard(insights) {
  const host = $("lab-leaderboard");
  host.replaceChildren();
  if (!insights.leaderboard.length) {
    const empty = document.createElement("p");
    empty.className = "lab-empty-copy";
    empty.textContent = "Run the calibration once to start seeing repeated patterns.";
    host.appendChild(empty);
    return;
  }

  for (const item of insights.leaderboard) {
    const row = document.createElement("article");
    row.className = "lab-leader";

    const head = document.createElement("div");
    head.className = "lab-leader-head";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const count = document.createElement("span");
    count.textContent = item.keptRuns
      ? `Kept ${item.keptRuns} time${item.keptRuns === 1 ? "" : "s"}`
      : item.topWins
      ? `Won ${item.topWins} run${item.topWins === 1 ? "" : "s"}`
      : "Still inconclusive";
    head.append(title, count);

    const body = document.createElement("p");
    body.textContent = item.summary;

    const track = document.createElement("div");
    track.className = "lab-track";
    const fill = document.createElement("div");
    fill.className = "lab-fill";
    if (!item.keptRuns) fill.classList.add("lab-fill-muted");
    const width = insights.runs
      ? Math.max(12, Math.round(((item.keptRuns * 2 + item.topWins) / (insights.runs * 2)) * 100))
      : 12;
    fill.style.width = `${Math.min(100, width)}%`;
    track.appendChild(fill);

    row.append(head, body, track);
    host.appendChild(row);
  }
}

function renderUseCases(insights) {
  const host = $("lab-use-cases");
  host.replaceChildren();
  for (const item of insights.useCases) {
    const card = document.createElement("article");
    card.className = "lab-use-case";
    const tag = document.createElement("span");
    tag.textContent = item.tag;
    const title = document.createElement("strong");
    title.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.body;
    card.append(tag, title, body);
    host.appendChild(card);
  }
}

function renderTimeline(insights) {
  const host = $("lab-timeline");
  host.replaceChildren();
  for (const item of insights.timeline) {
    const row = document.createElement("article");
    row.className = "lab-timeline-item";
    const date = document.createElement("span");
    date.className = "lab-timeline-date";
    date.textContent = item.dateLabel;
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const text = document.createElement("p");
    text.textContent = item.body;
    body.append(title, text);
    row.append(date, body);
    host.appendChild(row);
  }
}

function renderTrustPoints(insights) {
  const host = $("lab-trust-list");
  host.replaceChildren();
  for (const line of insights.trustPoints) {
    const item = document.createElement("li");
    item.textContent = line;
    host.appendChild(item);
  }
}

function renderProfileTags(insights, nextProfile) {
  const host = $("lab-profile-tags");
  host.replaceChildren();
  const fontLabel = nextProfile && nextProfile.font && FONTS[nextProfile.font] ? FONTS[nextProfile.font].label : FONTS.sans.label;
  host.appendChild(makeTag(fontLabel));
  if (insights.kept.length) {
    for (const key of insights.kept) host.appendChild(makeTag(labelForDimension(key)));
  } else host.appendChild(makeTag("Plain baseline held up best"));
}

function setEmptyState() {
  $("lab-empty").hidden = false;
  $("lab-main").hidden = true;
  $("lab-evidence-grid").hidden = true;
  $("lab-detail-grid").hidden = true;
  $("lab-voice-panel").hidden = true;
  $("lab-assist-panel").hidden = true;
  $("lab-history-panel").hidden = true;
  $("lab-trust-panel").hidden = true;
  $("lab-retake").textContent = "Start the calibration";
}

function stopVoicePreview() {
  previewRun += 1;
  previewingVoice = "";
  if (piperPreviewAudio) {
    piperPreviewAudio.onended = piperPreviewAudio.onerror = null;
    piperPreviewAudio.pause();
    piperPreviewAudio = null;
  }
  if (piperPreviewUrl) URL.revokeObjectURL(piperPreviewUrl);
  piperPreviewUrl = "";
  if (piperPreview) piperPreview.destroy();
  piperPreview = null;
}

function currentPiperVoice() {
  return piperVoiceById(ttsConfig && ttsConfig.piperVoice);
}

function currentVoiceBody(voice) {
  const base = `${voice.label} is a ${voice.detail.toLowerCase()} Piper voice that runs on this device`;
  return piperVoiceNeedsDownload(voice)
    ? `${base}. Reader View and PDF mode use it after a one-time ${voice.downloadMB} MB model download.`
    : `${base} — it ships with ReadTune, so Reader View and PDF mode can use it right away with nothing to download.`;
}

function renderVoiceSummary() {
  const activeVoice = currentPiperVoice();
  $("lab-voice-badge").textContent = ttsConfig && ttsConfig.provider === "piper" ? "Piper active" : "Choose Piper";
  $("lab-voice-title").textContent = activeVoice.label;
  $("lab-voice-copy").textContent = voiceNotice || currentVoiceBody(activeVoice);
}

async function applyResearchStarter() {
  const button = $("lab-apply-starter");
  button.disabled = true;
  clearTimeout(starterResetTimer);
  const starter = researchStarterPatch(profile);
  profile = (await saveProfile(starter)) || { ...profile, ...starter };
  syncProfileCard();
  syncPreviewSurfaces();
  button.textContent = "Starter saved";
  starterResetTimer = setTimeout(() => {
    button.textContent = "Use this starter";
    button.disabled = false;
  }, 1800);
}

async function savePiperVoice(voice) {
  stopVoicePreview();
  if (piperVoiceNeedsDownload(voice)) {
    const granted = await requestPiperPermission();
    if (!granted) {
      voiceNotice = "Allow the one-time Hugging Face download to use this local voice.";
      renderVoiceSummary();
      return;
    }
  }
  ttsConfig = (await saveTTSConfig({ provider: "piper", piperVoice: voice.id })) || ttsConfig;
  await markSetupStep("voiceFit");
  voiceNotice = piperVoiceNeedsDownload(voice)
    ? `${voice.label} is now your local read-aloud voice. Press Listen to download it once, then it stays on this device.`
    : `${voice.label} is now your local read-aloud voice. It ships with ReadTune, so Listen works right away.`;
  if (launchFocus === "voice" && (launchSource === "calibration" || launchSource === "setup")) {
    voiceNotice += " Setup complete. Next, try Listen on a real page or PDF.";
  }
  renderVoiceSummary();
  renderVoiceCards();
}

async function speakVoicePreview(voice) {
  if (previewingVoice === voice.id) {
    stopVoicePreview();
    renderVoiceCards();
    return;
  }
  if (piperVoiceNeedsDownload(voice)) {
    const granted = await requestPiperPermission();
    if (!granted) {
      voiceNotice = "Allow the one-time Hugging Face download to preview this local Piper voice.";
      renderVoiceSummary();
      return;
    }
  }
  stopVoicePreview();
  previewRun += 1;
  const run = previewRun;
  previewingVoice = voice.id;
  voiceNotice = `Preparing ${voice.label}…`;
  renderVoiceCards();
  try {
    piperPreview = createPiperEngine({
      voiceId: voice.id,
      onStatus: (status) => {
        if (run !== previewRun) return;
        voiceNotice = status.message;
        renderVoiceSummary();
      },
    });
    const blob = await piperPreview.synthesize(VOICE_SAMPLE);
    if (run !== previewRun) return;
    piperPreviewUrl = URL.createObjectURL(blob);
    piperPreviewAudio = new Audio(piperPreviewUrl);
    piperPreviewAudio.playbackRate = Math.max(0.75, Math.min(1.3, (profile && profile.ttsRate) || 1));
    piperPreviewAudio.onended = piperPreviewAudio.onerror = () => {
      if (run !== previewRun) return;
      stopVoicePreview();
      renderVoiceCards();
    };
    await piperPreviewAudio.play();
  } catch (error) {
    if (run !== previewRun) return;
    stopVoicePreview();
    voiceNotice = error && error.message ? `Preview couldn't start: ${error.message}` : "Preview couldn't start. Try again or choose another voice.";
    renderVoiceCards();
  }
}

function voiceCard(voice) {
  const article = document.createElement("article");
  article.className = "lab-voice-card";
  article.dataset.active = ttsConfig && ttsConfig.provider === "piper" && ttsConfig.piperVoice === voice.id ? "true" : "false";
  article.dataset.playing = previewingVoice === voice.id ? "true" : "false";

  const head = document.createElement("div");
  head.className = "lab-voice-card-head";
  const copy = document.createElement("div");
  const overline = document.createElement("span");
  overline.className = "lab-overline";
  overline.textContent = voice.detail;
  const title = document.createElement("strong");
  title.textContent = voice.label;
  copy.append(overline, title);
  head.append(copy);
  if (article.dataset.active === "true") head.appendChild(makeVoiceChip("Saved"));

  const meta = document.createElement("div");
  meta.className = "lab-voice-meta";
  meta.append(
    makeVoiceChip("Piper local"),
    makeVoiceChip(piperVoiceNeedsDownload(voice) ? `${voice.downloadMB} MB once` : "Built in"),
    makeVoiceChip(voice.license)
  );

  const body = document.createElement("p");
  body.textContent = piperVoiceNeedsDownload(voice)
    ? "Free, no account, and no reading text is uploaded. The voice model downloads once when you first preview or listen."
    : "Free, no account, and no reading text is uploaded. This voice ships with ReadTune and works offline right away.";

  const actions = document.createElement("div");
  actions.className = "lab-voice-actions";

  const preview = document.createElement("button");
  preview.className = "rt-btn";
  preview.type = "button";
  preview.textContent = article.dataset.playing === "true" ? "Stop preview" : "Preview";
  preview.addEventListener("click", () => speakVoicePreview(voice));

  const use = document.createElement("button");
  use.className = `rt-btn${article.dataset.active === "true" ? "" : " rt-primary"}`;
  use.type = "button";
  use.textContent = article.dataset.active === "true" ? "Using this voice" : "Use this voice";
  use.disabled = article.dataset.active === "true";
  use.addEventListener("click", () => savePiperVoice(voice));

  actions.append(preview, use);
  article.append(head, meta, body, actions);
  return article;
}

function renderVoiceCards() {
  const host = $("lab-voice-list");
  host.replaceChildren();

  host.append(...PIPER_VOICES.map(voiceCard));

  renderVoiceSummary();
}

function initVoiceFit() {
  voicePreviewSurface = $("lab-voice-surface");
  voicePreviewView = createReadingView($("lab-voice-preview-view"));
  applyTypography(voicePreviewSurface, profile);
  voicePreviewView.setText(VOICE_SAMPLE);
  voicePreviewView.applyProfile({ ...profile, pacing: "flow" });
  renderVoiceCards();
}

async function initAssist() {
  const status = $("lab-assist-status");
  const badge = $("lab-assist-badge");
  if (!status || !badge) return;

  let where;
  try {
    where = await describeAvailability();
  } catch {
    where = { mode: "cloud", text: "" };
  }
  status.textContent = where.text || "";
  badge.textContent = where.mode === "on-device" ? "On device" : "Free AI helper";
}

function applyLaunchState() {
  if (launchFocus !== "voice") return;
  const voicePanel = $("lab-voice-panel");
  voicePanel.classList.add("lab-panel-focus");
  $("lab-close").textContent = launchSource === "calibration" || launchSource === "setup" ? "Done with setup" : "Done";

  if (launchSource === "calibration") {
    $("lab-hero-title").textContent = "Your reading profile is ready. Choose your local voice.";
    $("lab-hero-body").textContent =
      "Preview the local Piper voices, keep the clearest one, and then use Listen while following along in your saved font and spacing.";
    $("lab-voice-body").textContent =
      "This is the fastest next step after calibration. Pick the local voice that feels clearest so ReadTune personalizes listening as well as text.";
  } else if (launchSource === "setup") {
    $("lab-hero-title").textContent = "One setup step left: choose your local voice.";
    $("lab-hero-body").textContent =
      "Your reading profile is already doing the heavy lifting. Now choose the local voice that sounds calmest for read-aloud.";
    $("lab-voice-body").textContent =
      "Preview the three Piper voices, save the clearest one, and then try Listen on a real article or PDF.";
  }

  requestAnimationFrame(() => {
    voicePanel.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

async function init() {
  const has = await hasProfile();
  profile = await loadProfile();
  applyDyslexicUi(profile.dyslexicUiMode);
  ttsConfig = await loadTTSConfig();
  const history = await loadCalibrations();

  if (!has && !history.length) {
    setEmptyState();
    return;
  }

  const insights = summarizeCalibrations(history, profile);
  latestInsights = insights;
  $("lab-hero-title").textContent = insights.signalTitle;
  $("lab-hero-body").textContent = insights.signalBody;
  $("lab-confidence-label").textContent = insights.confidenceLabel;
  $("lab-confidence-body").textContent = insights.confidenceBody;
  $("lab-stability-label").textContent = insights.stabilityLabel;
  $("lab-stability-body").textContent = insights.stabilityBody;
  $("lab-runs-label").textContent = String(insights.runs);
  $("lab-runs-body").textContent =
    insights.runs > 1 ? `Last run: ${insights.lastDateLabel}.` : "Retake once or twice to see what repeats.";
  $("lab-evidence-grid").hidden = false;

  $("lab-last-tested").textContent = insights.lastDateLabel || "Recent";
  $("lab-signal-title").textContent = insights.signalTitle;
  $("lab-signal-body").textContent = insights.signalBody;
  $("lab-next-title").textContent = insights.nextStepTitle;
  $("lab-next-body").textContent = insights.nextStepBody;

  syncProfileCard();
  renderLeaderboard(insights);
  renderUseCases(insights);
  renderTimeline(insights);
  renderTrustPoints(insights);
  renderEvidence("lab-foundations", RESEARCH_FOUNDATIONS);
  renderEvidence("lab-experiments", RESEARCH_EXPERIMENTS);

  profilePreviewSurface = $("lab-preview-surface");
  profilePreviewView = createReadingView($("lab-preview-view"));
  applyTypography(profilePreviewSurface, profile);
  profilePreviewView.setText(PREVIEW_TEXT);
  profilePreviewView.applyProfile({ ...profile, pacing: "flow" });
  paintPage(profile);

  initVoiceFit();
  void initAssist(); // paints itself when the availability check resolves; nothing waits on it
  applyLaunchState();
}

$("lab-retake").addEventListener("click", () => {
  location.href = extUrl("calibration.html");
});
$("lab-pdf").addEventListener("click", () => {
  location.href = extUrl("pdf.html");
});
$("lab-apply-starter").addEventListener("click", applyResearchStarter);
$("lab-close").addEventListener("click", () => window.close());
window.addEventListener("beforeunload", stopVoicePreview);

init().catch((err) => {
  console.error("[ReadTune] Reading Lab failed:", err);
  setEmptyState();
});
