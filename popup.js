/*
 * ReadTune — popup
 *
 * First-run users start with calibration; returning users are pushed straight
 * into Reader View and can inspect their confidence in the Reading Lab.
 */

import {
  loadProfile,
  hasProfile,
  describeProfile,
  loadCalibrations,
  stashArticle,
  loadSites,
  setSiteAutoOpen,
  extUrl,
} from "./shared/settings.js";
import { summarizeCalibrations } from "./shared/calibration-insights.js";

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind = "warn") {
  const s = $("status");
  if (!msg) {
    s.hidden = true;
    return;
  }
  s.hidden = false;
  s.textContent = msg;
  s.dataset.kind = kind;
}

function openPage(page) {
  chrome.tabs.create({ url: extUrl(page) });
  window.close();
}

function isExpectedPageBlock(err) {
  const msg = String((err && err.message) || err || "");
  return /extensions gallery cannot be scripted|cannot access contents of url|cannot be scripted/i.test(msg);
}

function setActionOrder(ids) {
  const box = $("actions");
  for (const id of ids) {
    const node = $("btn-" + id);
    if (node) box.appendChild(node);
  }
}

function renderMetrics(items) {
  const host = $("profile-metrics");
  host.replaceChildren();
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "pop-metric";
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("strong");
    value.textContent = item.value;
    card.append(label, value);
    host.appendChild(card);
  }
}

function configureFirstRun() {
  $("tagline").textContent = "Measure what actually helps you read, then use it everywhere.";
  $("onboard").hidden = false;
  $("profile-box").hidden = true;
  $("btn-lab").hidden = true;
  $("btn-calibrate").classList.add("rt-primary");
  $("btn-reader").classList.remove("rt-primary");
  $("calibrate-title").textContent = "Run the reading calibration";
  $("calibrate-sub").textContent = "6 short passages · about 4 minutes";
  $("btn-reader").querySelector(".rt-btn-title").textContent = "Open Reader View";
  $("btn-reader").querySelector(".rt-btn-sub").textContent = "Pull the current article into a calmer page · Alt+R";
  setActionOrder(["calibrate", "reader", "pdf", "restyle"]);
}

function configureReturningUser(profile, insights) {
  $("tagline").textContent = "Your profile is ready. Use it on this page, in PDFs, or keep tuning it over time.";
  $("onboard").hidden = true;
  $("profile-box").hidden = false;
  $("btn-lab").hidden = false;

  $("profile-title").textContent = insights.profileTitle || "Your reading profile";
  $("profile-desc").textContent = insights.profileSummary || describeProfile(profile);
  $("confidence-pill").textContent = insights.confidenceLabel;
  $("profile-signal-title").textContent = insights.signalTitle;
  $("profile-signal-body").textContent = insights.signalBody;
  renderMetrics([
    { label: "Runs", value: String(insights.runs || 1) },
    { label: "Stability", value: insights.stabilityLabel },
    { label: "Last test", value: insights.lastDateLabel || "Recent" },
  ]);

  $("btn-calibrate").classList.remove("rt-primary");
  $("btn-reader").classList.add("rt-primary");
  $("btn-reader").querySelector(".rt-btn-title").textContent = "Read this page now";
  $("btn-reader").querySelector(".rt-btn-sub").textContent = "Open the current article in your saved profile · Alt+R";
  $("calibrate-title").textContent = "Retake the calibration";
  $("calibrate-sub").textContent = "See whether the result stays consistent";
  setActionOrder(["reader", "restyle", "pdf", "lab", "calibrate"]);
}

async function openReader() {
  setStatus("");
  const btn = $("btn-reader");
  btn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
      setStatus("Open a web article first, then click this again.");
      btn.disabled = false;
      return;
    }
    let result;
    try {
      const [inj] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      result = inj && inj.result;
      if (!result) {
        const [inj2] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.__readtuneCapture,
        });
        result = inj2 && inj2.result;
      }
    } catch (err) {
      if (!isExpectedPageBlock(err)) console.warn("[ReadTune] page injection failed:", err);
      setStatus("This page doesn't allow extensions (Chrome Web Store and chrome:// pages are blocked).");
      btn.disabled = false;
      return;
    }
    if (!result || !result.ok || !result.html) {
      setStatus("Couldn't read this page. Try a normal article.");
      btn.disabled = false;
      return;
    }
    if (!(await stashArticle(result))) {
      setStatus("Couldn't hand the article to Reader View (storage blocked).");
      btn.disabled = false;
      return;
    }
    openPage("reader.html");
  } catch (err) {
    console.warn("[ReadTune] openReader error:", err);
    setStatus("Something went wrong opening Reader View.");
    btn.disabled = false;
  }
}

async function restylePage() {
  setStatus("");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
      setStatus("Open a normal web page first, then click this again.");
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["inpage.js"] });
    window.close();
  } catch (err) {
    if (!isExpectedPageBlock(err)) console.warn("[ReadTune] restyle failed:", err);
    setStatus("This page doesn't allow extensions (chrome:// pages and the Web Store are blocked).");
  }
}

$("btn-reader").addEventListener("click", openReader);
$("btn-restyle").addEventListener("click", restylePage);
$("btn-pdf").addEventListener("click", () => openPage("pdf.html"));
$("btn-calibrate").addEventListener("click", () => openPage("calibration.html"));
$("btn-retake").addEventListener("click", () => openPage("calibration.html"));
$("btn-lab").addEventListener("click", () => openPage("lab.html"));

async function initAutoOpenRow() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/i.test(tab.url || "")) return;
    const origin = new URL(tab.url).origin;
    const host = new URL(tab.url).hostname.replace(/^www\./, "");
    $("auto-host").textContent = host;
    $("auto-row").hidden = false;

    const sites = await loadSites();
    const on = !!(sites[origin] && sites[origin].autoOpen);
    $("auto-toggle").checked = on;

    $("auto-toggle").addEventListener("change", async (e) => {
      const want = e.target.checked;
      if (want) {
        const granted = await chrome.permissions.request({ origins: [origin + "/*"] }).catch(() => false);
        if (!granted) {
          e.target.checked = false;
          setStatus("ReadTune needs permission for this site to auto-open.", "info");
          return;
        }
        await setSiteAutoOpen(origin, true);
        setStatus(`ReadTune will open automatically on ${host}.`, "info");
      } else {
        await setSiteAutoOpen(origin, false);
        chrome.permissions.remove({ origins: [origin + "/*"] }).catch(() => {});
      }
    });
  } catch (err) {
    console.warn("[ReadTune] auto-open row failed:", err);
  }
}

(async function init() {
  try {
    const has = await hasProfile();
    if (has) {
      const profile = await loadProfile();
      const history = await loadCalibrations();
      configureReturningUser(profile, summarizeCalibrations(history, profile));
    } else configureFirstRun();
  } catch (err) {
    console.warn("[ReadTune] popup init failed:", err);
    configureFirstRun();
  }
  initAutoOpenRow();
})();
