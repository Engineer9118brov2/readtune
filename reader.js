/*
 * ReadTune — Reader View
 *
 * Takes the page captured by the popup, runs it through the shared engine, then
 * hands off to createReadingScreen for the panel / transport / read-aloud / aids.
 */

import { takeArticle } from "./shared/settings.js";
import { createReadingView } from "./shared/render.js";
import { createReadingScreen } from "./shared/screen.js";
import { showMessage, hideMessage, prettyHost } from "./shared/ui.js";

const surface = document.getElementById("surface");
const viewHost = document.getElementById("view");
const messageHost = document.getElementById("message");

function cleanByline(raw) {
  const line = String(raw || "").replace(/\s+/g, " ").trim();
  if (!line) return "";
  if (line.length > 80) return "";
  if (line.split(/\s+/).length > 12) return "";
  if (/^\d+(?:\.\d+)+(?:\s|$)/.test(line)) return "";
  return line;
}

async function init() {
  const view = createReadingView(viewHost);

  const article = await takeArticle();
  if (!article || !article.ok || !article.html) {
    showMessage(messageHost, {
      title: "Open ReadTune from an article",
      body:
        "Go to a web article or blog post, click the ReadTune icon in the toolbar, then choose “Open Reader View”. This tab only shows the result.",
      actions: [{ label: "Close this tab", onClick: () => window.close() }],
    });
    return;
  }

  const { extracted, meta, quality } = view.setArticleHtml(article.html, article.url);
  if (!extracted || !quality.ok || view.isEmpty()) {
    showMessage(messageHost, {
      title: "This page is better in Restyle mode",
      body:
        "Reader View needs a continuous article or document. This page looks more like a home page, feed, or web app, so use \"Restyle this page\" from the popup instead.",
      actions: [
        { label: "Open the original page", href: article.url },
        { label: "Close this tab", onClick: () => window.close() },
      ],
    });
    return;
  }

  hideMessage(messageHost);
  let title = meta.title || article.title || "Reader View";
  const site = meta.siteName || prettyHost(article.url);
  // trim a trailing " — Site name" / " | Site" that many pages tack onto <title>
  if (site) {
    const re = new RegExp("\\s*[|\\u2013\\u2014\\-:]\\s*" + site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i");
    title = title.replace(re, "").trim() || title;
  }
  document.title = `${title} — ReadTune`;
  const stats = view.getStats();
  const parts = [site, cleanByline(meta.byline), `${stats.minutes} min read`];
  if (stats.gradeReliable) parts.push(`Grade ${stats.grade} reading level`);
  view.setMeta({
    title,
    parts,
  });

  await createReadingScreen({ surface, view, pageUrl: article.url || "" });
}

init().catch((err) => {
  console.error("[ReadTune] Reader View failed:", err);
  showMessage(messageHost, {
    title: "Something went wrong",
    body: String((err && err.message) || err),
    actions: [{ label: "Close this tab", onClick: () => window.close() }],
  });
});
