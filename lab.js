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
  extUrl,
} from "./shared/settings.js";
import { createReadingView, applyTypography, paintPage } from "./shared/render.js";
import { summarizeCalibrations, labelForDimension } from "./shared/calibration-insights.js";
import { onVoicesReady, recommendedBrowserVoices, browserVoiceSource, describeBrowserVoice } from "./shared/tts.js";

const PREVIEW_TEXT =
  "This is the profile ReadTune is carrying into articles and PDFs for you right now. The Reading Lab shows whether this signal looks new, emerging, or steady enough to trust as your default.";
const VOICE_SAMPLE =
  "ReadTune can read aloud while you follow along in your calibrated font and spacing. Pick the voice that feels clearest and least tiring for you.";

const $ = (id) => document.getElementById(id);

let profile = null;
let ttsConfig = null;
let browserVoices = [];
let previewingVoice = "";
let voiceNotice = "";
let previewRun = 0;

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
  host.appendChild(makeTag((nextProfile && nextProfile.font && labelForDimension(nextProfile.font)) || "Standard"));
  if (insights.kept.length) {
    for (const key of insights.kept) host.appendChild(makeTag(labelForDimension(key)));
  } else host.appendChild(makeTag("Standard held up best"));
}

function setEmptyState() {
  $("lab-empty").hidden = false;
  $("lab-main").hidden = true;
  $("lab-detail-grid").hidden = true;
  $("lab-voice-panel").hidden = true;
  $("lab-history-panel").hidden = true;
  $("lab-trust-panel").hidden = true;
  $("lab-retake").textContent = "Start the calibration";
}

function hasSpeechPreview() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function previewKey(name) {
  return name || "__default__";
}

function currentFreeVoice() {
  return profile && profile.ttsVoice ? browserVoices.find((voice) => voice.name === profile.ttsVoice) || null : null;
}

function stopVoicePreview() {
  previewRun += 1;
  previewingVoice = "";
  try {
    window.speechSynthesis && window.speechSynthesis.cancel();
  } catch {}
}

function voiceLead(voice) {
  if (!voice) return "Free default";
  return voice.localService === false ? "Online option" : "Best free pick";
}

function currentVoiceBody(activeVoice) {
  const voiceName = activeVoice ? activeVoice.name : "Browser default";
  const open = `${voiceName} will be used when you tap Listen in Reader View or PDF mode.`;
  if (ttsConfig && ttsConfig.provider === "elevenlabs" && ttsConfig.apiKey) {
    return `${open} Read-aloud is currently set to your own ElevenLabs voice; choosing a free voice here switches you back to the free path.`;
  }
  return `${open} ${activeVoice ? describeBrowserVoice(activeVoice) : describeBrowserVoice(null)}`;
}

function renderVoiceSummary() {
  const activeVoice = currentFreeVoice();
  $("lab-voice-badge").textContent =
    ttsConfig && ttsConfig.provider === "elevenlabs" && ttsConfig.apiKey
      ? "Premium active"
      : activeVoice
      ? browserVoiceSource(activeVoice)
      : "Browser default";
  $("lab-voice-title").textContent = activeVoice ? activeVoice.name : "Browser default";
  $("lab-voice-copy").textContent = voiceNotice || currentVoiceBody(activeVoice);
}

async function saveFreeVoice(name) {
  stopVoicePreview();
  profile = (await saveProfile({ ttsVoice: name })) || { ...profile, ttsVoice: name };
  ttsConfig = (await saveTTSConfig({ provider: "browser" })) || ttsConfig;
  voiceNotice = name
    ? `${name} is now your free read-aloud voice. Reader View and PDFs will use it the next time you press Listen.`
    : "ReadTune is back on your browser's default free voice. Reader View and PDFs will use your system default when you press Listen.";
  renderVoiceSummary();
  renderVoiceCards();
}

function speakVoicePreview(voice) {
  if (!hasSpeechPreview()) return;
  const key = previewKey(voice ? voice.name : "");
  if (previewingVoice === key) {
    stopVoicePreview();
    renderVoiceCards();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(VOICE_SAMPLE);
  utterance.rate = Math.max(0.75, Math.min(1.3, (profile && profile.ttsRate) || 1));
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  previewRun += 1;
  const run = previewRun;
  previewingVoice = key;
  utterance.onend = utterance.onerror = () => {
    if (run !== previewRun) return;
    previewingVoice = "";
    renderVoiceCards();
  };
  try {
    window.speechSynthesis.cancel();
  } catch {}
  window.speechSynthesis.speak(utterance);
  renderVoiceCards();
}

function voiceCard(voice, lead) {
  const article = document.createElement("article");
  article.className = "lab-voice-card";
  article.dataset.active = profile && profile.ttsVoice === (voice ? voice.name : "") ? "true" : "false";
  article.dataset.playing = previewingVoice === previewKey(voice ? voice.name : "") ? "true" : "false";

  const head = document.createElement("div");
  head.className = "lab-voice-card-head";
  const copy = document.createElement("div");
  const overline = document.createElement("span");
  overline.className = "lab-overline";
  overline.textContent = lead;
  const title = document.createElement("strong");
  title.textContent = voice ? voice.name : "Browser default";
  copy.append(overline, title);
  head.append(copy);
  if (article.dataset.active === "true") head.appendChild(makeVoiceChip("Saved"));

  const meta = document.createElement("div");
  meta.className = "lab-voice-meta";
  meta.append(
    makeVoiceChip(voice ? browserVoiceSource(voice) : "Uses device default"),
    makeVoiceChip(voice ? "Free voice" : "Simple setup")
  );
  if (voice && voice.default) meta.appendChild(makeVoiceChip("System default"));

  const body = document.createElement("p");
  body.textContent = voice ? describeBrowserVoice(voice) : describeBrowserVoice(null);

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
  use.addEventListener("click", () => saveFreeVoice(voice ? voice.name : ""));

  actions.append(preview, use);
  article.append(head, meta, body, actions);
  return article;
}

function renderVoiceCards() {
  const host = $("lab-voice-list");
  host.replaceChildren();

  if (!hasSpeechPreview()) {
    const empty = document.createElement("div");
    empty.className = "lab-voice-empty";
    const title = document.createElement("strong");
    title.textContent = "Voice Fit needs browser speech support";
    const body = document.createElement("p");
    body.textContent = "This browser did not expose read-aloud voices here, so ReadTune cannot preview free voices on this screen.";
    empty.append(title, body);
    host.appendChild(empty);
    renderVoiceSummary();
    return;
  }

  const recommended = recommendedBrowserVoices(browserVoices, 3);
  const current = currentFreeVoice();
  const cards = [voiceCard(null, "Free default")];
  const seen = new Set();

  for (const voice of recommended) {
    if (!voice || seen.has(voice.name)) continue;
    seen.add(voice.name);
    cards.push(voiceCard(voice, voiceLead(voice)));
  }
  if (current && !seen.has(current.name)) cards.push(voiceCard(current, "Current saved voice"));

  if (cards.length === 1 && !browserVoices.length) {
    const empty = document.createElement("div");
    empty.className = "lab-voice-empty";
    const title = document.createElement("strong");
    title.textContent = "No extra English voices showed up here";
    const body = document.createElement("p");
    body.textContent = "ReadTune will still use your browser default voice. If you install richer system voices later, they will appear here automatically.";
    empty.append(title, body);
    host.append(cards[0], empty);
  } else {
    host.append(...cards);
  }

  renderVoiceSummary();
}

function initVoiceFit() {
  const voiceSurface = $("lab-voice-surface");
  const previewView = createReadingView($("lab-voice-preview-view"));
  applyTypography(voiceSurface, profile);
  previewView.setText(VOICE_SAMPLE);
  previewView.applyProfile({ ...profile, pacing: "flow" });
  renderVoiceCards();
  onVoicesReady((voices) => {
    browserVoices = Array.isArray(voices) ? voices : [];
    voiceNotice = "";
    renderVoiceCards();
  });
}

async function init() {
  const has = await hasProfile();
  profile = await loadProfile();
  ttsConfig = await loadTTSConfig();
  const history = await loadCalibrations();

  if (!has && !history.length) {
    setEmptyState();
    return;
  }

  const insights = summarizeCalibrations(history, profile);
  $("lab-hero-title").textContent = insights.signalTitle;
  $("lab-hero-body").textContent = insights.signalBody;
  $("lab-confidence-label").textContent = insights.confidenceLabel;
  $("lab-confidence-body").textContent = insights.confidenceBody;
  $("lab-stability-label").textContent = insights.stabilityLabel;
  $("lab-stability-body").textContent = insights.stabilityBody;
  $("lab-runs-label").textContent = String(insights.runs);
  $("lab-runs-body").textContent =
    insights.runs > 1 ? `Last run: ${insights.lastDateLabel}.` : "Retake once or twice to see what repeats.";

  $("lab-profile-title").textContent = insights.profileTitle;
  $("lab-profile-desc").textContent = insights.profileSummary;
  $("lab-last-tested").textContent = insights.lastDateLabel || "Recent";
  $("lab-signal-title").textContent = insights.signalTitle;
  $("lab-signal-body").textContent = insights.signalBody;
  $("lab-next-title").textContent = insights.nextStepTitle;
  $("lab-next-body").textContent = insights.nextStepBody;

  renderProfileTags(insights, profile);
  renderLeaderboard(insights);
  renderUseCases(insights);
  renderTimeline(insights);
  renderTrustPoints(insights);

  const previewSurface = $("lab-preview-surface");
  const previewView = createReadingView($("lab-preview-view"));
  applyTypography(previewSurface, profile);
  previewView.setText(PREVIEW_TEXT);
  previewView.applyProfile({ ...profile, pacing: "flow" });
  paintPage(profile);

  initVoiceFit();
}

$("lab-retake").addEventListener("click", () => {
  location.href = extUrl("calibration.html");
});
$("lab-pdf").addEventListener("click", () => {
  location.href = extUrl("pdf.html");
});
$("lab-close").addEventListener("click", () => window.close());
window.addEventListener("beforeunload", stopVoicePreview);

init().catch((err) => {
  console.error("[ReadTune] Reading Lab failed:", err);
  setEmptyState();
});
