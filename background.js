/*
 * ReadTune — background service worker (module)
 *
 * Handles the Alt+R keyboard command and, for sites the user has explicitly
 * opted in, either auto-opens Reader View or auto-restyles the page when it
 * finishes loading. Site automation needs host permission for that site, which
 * the popup requests at opt-in time — the base install only asks for activeTab.
 */

import { stashArticle, loadSites, extUrl } from "./shared/settings.js";
import { pageAudioBridge } from "./shared/page-audio-bridge.js";

const ARTICLE_HANDOFF_PREFIX = "readtune_article:";
const ARTICLE_TTL_MS = 10 * 60 * 1000;

async function pruneExpiredLocalArticleHandoffs() {
  try {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const stale = Object.entries(all || {})
      .filter(([key, value]) =>
        key.startsWith(ARTICLE_HANDOFF_PREFIX) &&
        (!Number(value && value.capturedAt) || now - Number(value.capturedAt) > ARTICLE_TTL_MS)
      )
      .map(([key]) => key);
    if (stale.length) await chrome.storage.local.remove(stale);
  } catch (err) {
    console.warn("[ReadTune] stale article handoff cleanup failed:", err);
  }
}

// Session storage is the normal handoff path. This cleans only the resilience
// fallback in local storage so abandoned captured HTML never lingers across
// browser restarts beyond the intended ten-minute window.
pruneExpiredLocalArticleHandoffs();

async function capturePage(tabId) {
  try {
    const [inj] = await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    let res = inj && inj.result;
    if (!res) {
      const [i2] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__readtuneCapture,
      });
      res = i2 && i2.result;
    }
    return res;
  } catch (err) {
    console.warn("[ReadTune] capturePage failed:", err);
    return null;
  }
}

async function openReaderFor(tab, { sameTab = false } = {}) {
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) return;
  const res = await capturePage(tab.id);
  if (!res || !res.ok || !res.html) return;

  // Page-audio controls only work while the source tab remains alive. Auto-open
  // replaces that tab with reader.html, so carrying its tab id/narration would
  // create a control that can never reach the original page.
  if (!sameTab) {
    res.tabId = tab.id;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: pageAudioBridge,
        args: ["detect"],
      });
      const narration = results && results[0] && results[0].result;
      if (narration && narration.ok) res.narration = { kind: narration.kind };
    } catch (err) {
      console.warn("[ReadTune] page-audio detect failed:", err);
    }
  } else {
    delete res.tabId;
    delete res.narration;
  }

  const handoffId = await stashArticle(res);
  if (!handoffId) return;
  const url = `${extUrl("reader.html")}?article=${encodeURIComponent(handoffId)}`;
  if (sameTab) await chrome.tabs.update(tab.id, { url });
  else await chrome.tabs.create({ url });
}

async function toggleInpage(tab) {
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["inpage.js"] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (window.__readtuneInpageBoot) await window.__readtuneInpageBoot;
        return true;
      },
    });
  } catch (err) {
    console.warn("[ReadTune] toggle-inpage failed:", err);
  }
}

async function toggleDictation(tab) {
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dictate.js"] });
  } catch (err) {
    console.warn("[ReadTune] toggle-dictation failed:", err);
  }
}

async function ensureInpage(tab) {
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) return;
  try {
    const [check] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (window.__readtuneInpageBoot) {
          try {
            await window.__readtuneInpageBoot;
          } catch {
            /* retry below */
          }
        }
        return !!window.__readtuneInpage;
      },
    });
    if (check && check.result) return;
  } catch {
    /* page not ready yet, fall through to a fresh inject */
  }
  await toggleInpage(tab);
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (command === "open-reader") await openReaderFor(tab);
    else if (command === "toggle-inpage") await toggleInpage(tab);
    else if (command === "toggle-dictation") await toggleDictation(tab);
  } catch (err) {
    console.warn(`[ReadTune] command ${command} failed:`, err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "readtune-open-reader" && sender.tab) {
    openReaderFor(sender.tab);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab || !/^https?:/i.test(tab.url || "")) return;
  if (tab.url.startsWith(extUrl(""))) return;

  let origin;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    return;
  }

  const sites = await loadSites();
  const site = sites[origin];
  if (!site || (!site.autoOpen && !site.autoStyle)) return;

  const allowed = await chrome.permissions
    .contains({ origins: [origin + "/*"] })
    .catch(() => false);
  if (!allowed) return;

  if (site.autoOpen) {
    await openReaderFor(tab, { sameTab: true });
    return;
  }

  if (site.autoStyle) await ensureInpage(tab);
});
