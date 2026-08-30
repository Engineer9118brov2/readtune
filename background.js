/*
 * ReadTune — background service worker (module)
 *
 * Handles the Alt+R keyboard command and, for sites the user has explicitly
 * opted in, auto-opens Reader View when a page finishes loading. Auto-open needs
 * host permission for that site, which the popup requests at opt-in time — the
 * base install only asks for activeTab.
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

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-reader") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await openReaderFor(tab);
  } catch (err) {
    console.warn("[ReadTune] open-reader command failed:", err);
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
  if (!sites[origin] || !sites[origin].autoOpen) return;

  const allowed = await chrome.permissions
    .contains({ origins: [origin + "/*"] })
    .catch(() => false);
  if (!allowed) return;

  await openReaderFor(tab, { sameTab: true });
});
