/*
 * ReadTune — popup
 *
 * First-run users start with calibration; returning users are pushed straight
 * into Reader View and can inspect their confidence in the Reading Lab.
 */

import {
  loadProfile,
  saveProfile,
  describeProfile,
  loadCalibrations,
  loadSetup,
  stashArticle,
  loadSites,
  setSiteAutomation,
  siteAutomationMode,
  applyDyslexicUi,
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

function renderSetupList(items) {
  const host = $("setup-list");
  host.replaceChildren();
  for (const item of items) {
    const row = document.createElement("article");
    row.className = "pop-check";
    row.dataset.state = item.state;
    const badge = document.createElement("b");
    badge.textContent = item.state === "done" ? "✓" : item.state === "active" ? "2" : "3";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const body = document.createElement("span");
    body.textContent = item.body;
    copy.append(title, body);
    row.append(badge, copy);
    host.appendChild(row);
  }
}

function configureSetupBox(show) {
  $("setup-box").hidden = !show;
  if (!show) return;
  $("setup-pill").textContent = "Step 2 of 3";
  $("setup-title").textContent = "Choose your local voice";
  $("setup-desc").textContent =
    "Your reading profile is ready. One fast step is left: choose a local Piper voice so Listen feels like yours too.";
  renderSetupList([
    {
      state: "done",
      title: "Reading profile ready",
      body: "The calibration found the settings ReadTune should carry into articles and PDFs.",
    },
    {
      state: "active",
      title: "Choose your local voice",
      body: "Preview local Piper voices and save the clearest one for read-aloud.",
    },
    {
      state: "next",
      title: "Try it on a real page",
      body: "Open Reader View or a PDF and use Listen while following along.",
    },
  ]);
}

function configureFirstRun() {
  $("tagline").textContent = "Start with research-backed reading defaults, then try a quick preference check for settings to explore.";
  $("onboard").hidden = false;
  $("profile-box").hidden = true;
  $("setup-box").hidden = true;
  $("proof-box").hidden = false;
  $("btn-lab").hidden = true;
  $("btn-calibrate").classList.add("rt-primary");
  $("btn-reader").classList.remove("rt-primary");
  $("calibrate-title").textContent = "Run the reading calibration";
  $("calibrate-sub").textContent = "6 short passages · about 4 minutes";
  $("btn-reader").querySelector(".rt-btn-title").textContent = "Open Reader View";
  $("btn-reader").querySelector(".rt-btn-sub").textContent = "Pull the current article into a calmer page · Alt+R";
  setActionOrder(["calibrate", "reader", "pdf", "restyle", "dictate"]);
}

function configureReturningUser(profile, insights) {
  $("tagline").textContent = "Your profile is ready. ReadTune starts from the strongest supports, then keeps tuning text and voice to you over time.";
  $("onboard").hidden = true;
  $("profile-box").hidden = false;
  $("proof-box").hidden = true;
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
  $("btn-lab").querySelector(".rt-btn-sub").textContent = "See stability, repeated patterns, and choose your local voice";
  setActionOrder(["reader", "restyle", "dictate", "pdf", "lab", "calibrate"]);
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
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (window.__readtuneInpageBoot) await window.__readtuneInpageBoot;
        return true;
      },
    });
    window.close();
  } catch (err) {
    const blocked = isExpectedPageBlock(err);
    if (!blocked) console.warn("[ReadTune] restyle failed:", err);
    setStatus(
      blocked
        ? "This page doesn't allow extensions (chrome:// pages and the Web Store are blocked)."
        : "ReadTune couldn't restyle this page. Refresh the page and try again."
    );
  }
}

async function startDictation() {
  setStatus("");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
      setStatus("Open the page with the text field first, then click this again.");
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dictate.js"] });
    window.close();
  } catch (err) {
    const blocked = isExpectedPageBlock(err);
    if (!blocked) console.warn("[ReadTune] dictation failed:", err);
    setStatus(
      blocked
        ? "This page doesn't allow extensions (chrome:// pages and the Web Store are blocked)."
        : "ReadTune couldn't start dictation here. Refresh the page and try again."
    );
  }
}

$("btn-reader").addEventListener("click", openReader);
$("btn-restyle").addEventListener("click", restylePage);
$("btn-dictate").addEventListener("click", startDictation);
$("btn-pdf").addEventListener("click", () => openPage("pdf.html"));
$("btn-calibrate").addEventListener("click", () => openPage("calibration.html"));
$("btn-retake").addEventListener("click", () => openPage("calibration.html"));
$("btn-lab").addEventListener("click", () => openPage("lab.html"));
$("btn-setup-voice").addEventListener("click", () => openPage("lab.html?focus=voice&source=setup"));

function wireDyslexicToggle(initial) {
  const btn = $("btn-dys");
  if (!btn) return;
  let on = !!initial;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.addEventListener("click", async () => {
    on = !on;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    applyDyslexicUi(on);
    await saveProfile({ dyslexicUiMode: on });
  });
}

async function initSiteAutomationRows() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/i.test(tab.url || "")) return;
    const origin = new URL(tab.url).origin;
    const host = new URL(tab.url).hostname.replace(/^www\./, "");
    $("auto-host").textContent = host;
    $("site-box").hidden = false;

    const modeInputs = [...document.querySelectorAll('input[name="site-mode"]')];
    const setBusy = (busy) => modeInputs.forEach((input) => (input.disabled = busy));

    async function syncToggles() {
      const nextSites = await loadSites();
      const mode = siteAutomationMode(nextSites[origin] || {});
      for (const input of modeInputs) input.checked = input.value === mode;
      return mode;
    }

    await syncToggles();

    async function ensurePermission() {
      const alreadyGranted = await chrome.permissions.contains({ origins: [origin + "/*"] }).catch(() => false);
      if (alreadyGranted) return true;
      const granted = await chrome.permissions.request({ origins: [origin + "/*"] }).catch(() => false);
      if (!granted) setStatus("ReadTune needs permission for this site before it can automate it.", "info");
      return granted;
    }

    async function releasePermissionIfUnused() {
      const mode = await syncToggles();
      if (mode !== "off") return;
      chrome.permissions.remove({ origins: [origin + "/*"] }).catch(() => {});
    }

    async function enableAuto(mode) {
      if (!(await ensurePermission())) {
        await syncToggles();
        return;
      }
      const result = await setSiteAutomation(origin, mode);
      const nextMode = await syncToggles();
      if (!result) {
        setStatus("ReadTune couldn't save that site automation setting.", "warn");
        return;
      }
      setStatus(
        nextMode === "open"
          ? `ReadTune will open Reader View automatically on ${host}.`
          : nextMode === "style"
            ? `ReadTune will restyle ${host} automatically in place.`
            : `Automatic ReadTune is off on ${host}.`,
        "info"
      );
    }

    async function disableAuto() {
      const result = await setSiteAutomation(origin, "off");
      if (!result) {
        await syncToggles();
        setStatus("ReadTune couldn't update that site automation setting.", "warn");
        return;
      }
      const mode = await syncToggles();
      await releasePermissionIfUnused();
      setStatus(
        mode !== "off"
          ? mode === "open"
            ? `Reader View auto-open stays on for ${host}.`
            : `Auto-restyle stays on for ${host}.`
          : `Automatic ReadTune is off on ${host}.`,
        "info"
      );
    }

    for (const input of modeInputs) {
      input.addEventListener("change", async (e) => {
        if (!e.target.checked) return;
        setBusy(true);
        try {
          if (e.target.value === "off") await disableAuto();
          else await enableAuto(e.target.value);
        } finally {
          setBusy(false);
        }
      });
    }
  } catch (err) {
    console.warn("[ReadTune] site automation rows failed:", err);
  }
}

(async function init() {
  try {
    const [profile, history, setup] = await Promise.all([loadProfile(), loadCalibrations(), loadSetup()]);
    applyDyslexicUi(profile.dyslexicUiMode);
    wireDyslexicToggle(profile.dyslexicUiMode);
    // "Returning" means they've actually calibrated — not merely that a profile
    // blob exists (toggling a preference here would otherwise create one).
    if (history.length > 0 || setup.calibratedAt) {
      configureReturningUser(profile, summarizeCalibrations(history, profile));
      configureSetupBox(!setup.voiceFitAt);
    } else {
      configureFirstRun();
    }
  } catch (err) {
    console.warn("[ReadTune] popup init failed:", err);
    configureFirstRun();
  }
  initSiteAutomationRows();
})();
