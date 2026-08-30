/*
 * ReadTune — popup
 *
 * Calibration first (that's the point of the product), then Reader View and PDF
 * mode, a one-line profile summary, and an opt-in "auto-open on this site".
 */

import {
  loadProfile,
  hasProfile,
  describeProfile,
  stashArticle,
  loadSites,
  setSiteAutoOpen,
  extUrl,
} from "./shared/settings.js";

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
      console.warn("[ReadTune] page injection failed:", err);
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
    console.warn("[ReadTune] restyle failed:", err);
    setStatus("This page doesn't allow extensions (chrome:// pages and the Web Store are blocked).");
  }
}

$("btn-reader").addEventListener("click", openReader);
$("btn-restyle").addEventListener("click", restylePage);
$("btn-pdf").addEventListener("click", () => openPage("pdf.html"));
$("btn-calibrate").addEventListener("click", () => openPage("calibration.html"));
$("btn-retake").addEventListener("click", () => openPage("calibration.html"));

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
    $("onboard").hidden = has;
    if (has) {
      const profile = await loadProfile();
      $("calibrate-title").textContent = "Retake the calibration test";
      $("calibrate-sub").textContent = "Re-check your settings any time";
      $("profile-desc").textContent = describeProfile(profile);
      $("profile-box").hidden = false;
    }
  } catch (err) {
    console.warn("[ReadTune] popup init failed:", err);
  }
  initAutoOpenRow();
})();
