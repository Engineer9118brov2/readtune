/*
 * ReadTune — page audio, from Reader View
 *
 * Reader View reads a captured *snapshot* of the article in its own isolated
 * extension tab — by the time the reader presses Play there, it has no live
 * DOM connection back to the page they opened it from. Without this, that
 * meant Reader View could never see a site's own free "Listen to this
 * article" player and always fell back to ReadTune's own voice (Piper, or
 * the cloud relay when Piper can't run) — burning cloud usage on pages that
 * already had free narration sitting right there.
 *
 * pageAudioBridge runs findPageNarration (shared/page-audio.js) *in the
 * source tab*, via chrome.scripting.executeScript with a `func:` injection —
 * not a persistent content-script listener, so it doesn't care whether that
 * tab reloaded or navigated between calls; it just looks fresh each time and
 * reports failure if the page or the extension's access to it is gone.
 *
 * Must stay a fully self-contained function: `func:` injection serializes it
 * to source text and runs it in the target tab's page context, so it can only
 * reference true globals (document, chrome, import()) — never anything from
 * this module's closure.
 */
export async function pageAudioBridge(action) {
  try {
    const { findPageNarration } = await import(chrome.runtime.getURL("shared/page-audio.js"));
    const found = findPageNarration(document);
    if (!found) return { ok: false, reason: "not-found" };
    if (action === "detect") return { ok: true, kind: found.kind };

    if (found.kind === "audio") {
      if (found.el.paused || found.el.ended) {
        const p = found.el.play();
        if (p && p.catch) p.catch(() => {});
      } else {
        found.el.pause();
      }
      return { ok: true, kind: "audio", playing: !found.el.paused && !found.el.ended };
    }

    // embed / control: bring it into view, then hand off to the page's own UI.
    try {
      found.el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      found.el.scrollIntoView();
    }
    // A real button is safe to fire a synthetic click on; an anchor (even
    // role="button") could navigate the reader off the article.
    const clickable = found.el.tagName !== "A" && found.el.matches('button, [role="button"], input[type="button"]');
    if (found.kind === "control" && clickable) {
      try {
        found.el.click();
      } catch {
        /* the page's own handler threw — nothing we can do from here */
      }
    }
    return { ok: true, kind: found.kind };
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  }
}

/** Runs pageAudioBridge in `tabId`'s page and returns its result, or
    `{ ok: false, reason }` if the tab is gone or the extension no longer has
    access to it (navigated away, closed, activeTab grant expired). */
export async function callPageAudioBridge(tabId, action) {
  if (!tabId) return { ok: false, reason: "no-tab" };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: pageAudioBridge,
      args: [action],
    });
    const r = results && results[0] && results[0].result;
    return r || { ok: false, reason: "no-result" };
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  }
}
