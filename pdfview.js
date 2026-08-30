/*
 * ReadTune — PDF mode
 *
 * Chrome's built-in PDF viewer can't be reached by a content script, so this is
 * a separate page: pick a PDF, extract its text with the bundled pdf.js, and
 * pour it into the same reading engine + screen as articles.
 */

import { extUrl } from "./shared/settings.js";
import { createReadingView, computeStats } from "./shared/render.js";
import { extractPdfText } from "./shared/pdftext.js";
import { createReadingScreen } from "./shared/screen.js";
import { showMessage } from "./shared/ui.js";

const pdfjsLib = window.pdfjsLib;

const dropWrap = document.getElementById("drop");
const dropCard = document.getElementById("drop-card");
const pickBtn = document.getElementById("pick");
const fileInput = document.getElementById("file");
const progressEl = document.getElementById("progress");
const errorEl = document.getElementById("error");
const surface = document.getElementById("surface");
const viewHost = document.getElementById("view");
const messageHost = document.getElementById("message");

if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = extUrl("lib/pdf.worker.min.js");
}

async function handleFile(file) {
  errorEl.textContent = "";
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    errorEl.textContent = "That doesn't look like a PDF file.";
    return;
  }
  if (!pdfjsLib) {
    errorEl.textContent = "The PDF engine didn't load. Try reloading this tab.";
    return;
  }

  pickBtn.disabled = true;
  progressEl.textContent = "Reading the file…";

  try {
    const buffer = await file.arrayBuffer();
    const text = await extractPdfText(pdfjsLib, buffer, (n, total) => {
      progressEl.textContent = `Extracting text — page ${n} of ${total}…`;
    });

    if (!text || text.replace(/\s+/g, "").length < 8) {
      progressEl.textContent = "";
      pickBtn.disabled = false;
      showMessage(messageHost, {
        title: "No text to pull out of this PDF",
        body:
          "This file has no selectable text — it's most likely a scan or photos of pages. ReadTune can only reformat PDFs whose text can be selected and copied. Try an OCR'd or exported-from-Word version.",
        actions: [{ label: "Try another PDF", onClick: () => location.reload() }],
      });
      return;
    }

    dropWrap.hidden = true;
    surface.hidden = false;
    const name = file.name.replace(/\.pdf$/i, "");
    document.title = `${name} — ReadTune`;

    const view = createReadingView(viewHost);
    view.setText(text);
    const stats = computeStats(text);
    view.setMeta({
      title: name,
      parts: ["PDF · text extracted locally", `${stats.minutes} min read`, `Grade ${stats.grade} reading level`],
    });

    await createReadingScreen({ surface, view, pageUrl: "" });
  } catch (err) {
    console.error("[ReadTune] PDF extraction failed:", err);
    progressEl.textContent = "";
    pickBtn.disabled = false;
    errorEl.textContent = "Couldn't read that PDF. It may be password-protected or damaged.";
  }
}

pickBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => handleFile(fileInput.files && fileInput.files[0]));

["dragenter", "dragover"].forEach((ev) =>
  dropCard.addEventListener(ev, (e) => {
    e.preventDefault();
    dropCard.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropCard.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "dragleave" && dropCard.contains(e.relatedTarget)) return;
    dropCard.classList.remove("drag");
  })
);
dropCard.addEventListener("drop", (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFile(file);
});
