/*
 * ReadTune — page capture
 *
 * Not a persistent content script. popup.js injects this file once with
 * chrome.scripting.executeScript (activeTab) when the user clicks "Open Reader
 * View". It grabs the current page's markup and hands it back two ways: as the
 * script's completion value, and on window as a fallback for older Chrome that
 * doesn't return the completion value of file injections. reader.js does the
 * actual Readability parsing.
 */

(() => {
  let payload;
  try {
    const root = document.documentElement.cloneNode(true);
    // Readability doesn't need these and they only bloat / risk the payload.
    root
      .querySelectorAll("script, noscript, template, style, link[rel='stylesheet']")
      .forEach((n) => n.remove());

    payload = {
      ok: true,
      url: location.href,
      title: document.title || "",
      html: "<!doctype html>" + root.outerHTML,
      capturedAt: Date.now(),
    };
  } catch (err) {
    payload = { ok: false, error: String((err && err.message) || err) };
  }

  try {
    window.__readtuneCapture = payload;
  } catch {
    /* ignore */
  }
  return payload;
})();
