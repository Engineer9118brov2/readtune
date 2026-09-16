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
    // Readability doesn't need executable/embedded content, form controls, or
    // editable drafting surfaces. Keeping any of those in the temporary handoff
    // can capture hidden form values, signed iframe URLs, unsent comments, or
    // other page-specific state that Reader View will never use. Remove them
    // before serialising the clone, not only later when the extracted article
    // is sanitised.
    root
      .querySelectorAll(
        "script, noscript, template, style, link[rel='stylesheet'], input, textarea, select, button, iframe, object, embed, [contenteditable]:not([contenteditable='false']), [role='textbox']",
      )
      .forEach((n) => n.remove());

    // Strip attributes that can carry per-session state but are irrelevant to
    // Readability. Lazy-image data attributes are intentionally left alone so
    // article images still have a chance to survive extraction.
    root.querySelectorAll("*").forEach((el) => {
      for (const name of ["value", "action", "formaction", "srcdoc", "nonce"]) {
        if (el.hasAttribute(name)) el.removeAttribute(name);
      }
    });

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
