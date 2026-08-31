/*
 * ReadTune — Reading Lab
 *
 * Turns calibration history into an explainable dashboard so users can see
 * whether the same signal is repeating or if they should retake the test.
 */

import { hasProfile, loadProfile, loadCalibrations, extUrl } from "./shared/settings.js";
import { createReadingView, applyTypography, paintPage } from "./shared/render.js";
import { summarizeCalibrations, labelForDimension } from "./shared/calibration-insights.js";

const PREVIEW_TEXT =
  "This is the profile ReadTune is carrying into articles and PDFs for you right now. The Reading Lab shows whether this signal looks new, emerging, or steady enough to trust as your default.";

const $ = (id) => document.getElementById(id);

function makeTag(text) {
  const node = document.createElement("span");
  node.className = "lab-tag";
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
    const width = insights.runs ? Math.max(12, Math.round(((item.keptRuns * 2 + item.topWins) / (insights.runs * 2)) * 100)) : 12;
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

function renderProfileTags(insights, profile) {
  const host = $("lab-profile-tags");
  host.replaceChildren();
  host.appendChild(makeTag((profile && profile.font && labelForDimension(profile.font)) || "Standard"));
  if (insights.kept.length) {
    for (const key of insights.kept) host.appendChild(makeTag(labelForDimension(key)));
  } else host.appendChild(makeTag("Standard held up best"));
}

function setEmptyState() {
  $("lab-empty").hidden = false;
  $("lab-main").hidden = true;
  $("lab-detail-grid").hidden = true;
  $("lab-history-panel").hidden = true;
  $("lab-trust-panel").hidden = true;
  $("lab-retake").textContent = "Start the calibration";
}

async function init() {
  const has = await hasProfile();
  const profile = await loadProfile();
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
}

$("lab-retake").addEventListener("click", () => {
  location.href = extUrl("calibration.html");
});
$("lab-pdf").addEventListener("click", () => {
  location.href = extUrl("pdf.html");
});
$("lab-close").addEventListener("click", () => window.close());

init().catch((err) => {
  console.error("[ReadTune] Reading Lab failed:", err);
  setEmptyState();
});
