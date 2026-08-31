/*
 * ReadTune — background service worker (module)
 *
 * Handles the Alt+R keyboard command and, for sites the user has explicitly
 * opted in, either auto-opens Reader View or auto-restyles the page when it
 * finishes loading. Site automation needs host permission for that site, which
 * the popup requests at opt-in time — the base install only asks for activeTab.
 */

import { stashArticle, loadSites, extUrl } from "./shared/settings.js";

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
  await stashArticle(res);
  const url = extUrl("reader.html");
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
  } catch (err) {
    console.warn(`[ReadTune] command ${command} failed:`, err);
  }
});

// the in-page bar's "open full Reader View" button
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "readtune-open-reader" && sender.tab) {
    openReaderFor(sender.tab);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab || !/^https?:/i.test(tab.url || "")) return;
  if (tab.url.startsWith(extUrl(""))) return; // never act on our own pages

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
