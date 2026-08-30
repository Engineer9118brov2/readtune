/*
 * ReadTune — PDF text extraction
 *
 * Turns a PDF's text layer into plain paragraphs that the shared reading engine
 * can format. Kept separate from render.js so it carries the only dependency on
 * pdf.js, and so the line/paragraph reconstruction can be unit-tested.
 */

/**
 * Rebuild lines from pdf.js text items, then merge lines into paragraphs.
 * Paragraph breaks come from blank lines and from vertical gaps noticeably
 * larger than the page's typical line spacing (PDF has no paragraph concept).
 */
export function itemsToParagraphs(items) {
  const lines = [];
  let cur = { text: "", y: null };
  for (const it of items) {
    if (typeof it.str === "string") cur.text += it.str;
    if (it.transform && typeof it.transform[5] === "number") cur.y = it.transform[5];
    if (it.hasEOL) {
      lines.push(cur);
      cur = { text: "", y: cur.y };
    }
  }
  if (cur.text) lines.push(cur);

  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].y != null && lines[i - 1].y != null) {
      const g = lines[i - 1].y - lines[i].y;
      if (g > 0.5) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  // 30th percentile ≈ the normal line-to-line spacing (paragraph gaps sit above it as outliers).
  const typicalGap = gaps.length >= 3 ? gaps[Math.floor(gaps.length * 0.3)] : 0;

  const paragraphs = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) paragraphs.push(buf.trim());
    buf = "";
  };
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.replace(/\s+/g, " ").trim();
    const bigGap =
      i > 0 &&
      typicalGap > 0 &&
      lines[i].y != null &&
      lines[i - 1].y != null &&
      lines[i - 1].y - lines[i].y > typicalGap * 1.75;
    if (!text) {
      flush();
      continue;
    }
    if (bigGap) flush();
    if (!buf) buf = text;
    else if (/[-‐]$/.test(buf)) buf = buf.replace(/[-‐]$/, "") + text; // de-hyphenate at a line break
    else buf += " " + text;
  }
  flush();
  return paragraphs;
}

/**
 * @param pdfjsLib   the global from lib/pdf.min.js
 * @param data       ArrayBuffer of the PDF
 * @param onProgress (pageNumber, totalPages) => void
 * @returns plain text, pages separated by a blank line
 */
export async function extractPdfText(pdfjsLib, data, onProgress = () => {}) {
  const doc = await pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress(n, doc.numPages);
      const page = await doc.getPage(n);
      try {
        const content = await page.getTextContent();
        pages.push(itemsToParagraphs(content.items).join("\n\n"));
      } finally {
        page.cleanup();
      }
    }
    return pages.filter((p) => p.trim()).join("\n\n\n");
  } finally {
    await doc.destroy();
  }
}
