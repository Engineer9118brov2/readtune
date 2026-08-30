/* Browser test harness — not shipped. Stubs chrome.* and exercises the engine. */

const mem = { local: {}, session: {} };
window.chrome = {
  runtime: { getURL: (p) => new URL("../" + p, location.href).href, id: "test" },
  storage: {
    local: {
      async get(k) { return k == null ? { ...mem.local } : { [k]: mem.local[k] }; },
      async set(o) { Object.assign(mem.local, o); },
      async remove(k) { (Array.isArray(k) ? k : [k]).forEach((x) => delete mem.local[x]); },
    },
    session: {
      async get(k) { return k == null ? { ...mem.session } : { [k]: mem.session[k] }; },
      async set(o) { Object.assign(mem.session, o); },
      async remove(k) { delete mem.session[k]; },
    },
  },
  permissions: { contains: async () => false, request: async () => false, remove: async () => true },
};

const log = (msg, ok) => {
  const li = document.createElement("li");
  li.textContent = (ok === undefined ? "· " : ok ? "PASS " : "FAIL ") + msg;
  li.style.color = ok === false ? "crimson" : ok === true ? "green" : "";
  document.getElementById("results").appendChild(li);
  if (ok === false) console.error(msg);
};
const assert = (c, m) => log(m, !!c);

const ARTICLE = `<!doctype html><html><head><title>Tide pools reset twice a day — Shoreline Notes</title><meta property="og:site_name" content="Shoreline Notes"></head><body>
<nav><a href="/">Home</a></nav>
<div class="ad">SALE <a href="javascript:evil()">ad</a></div>
<article>
<h1>Tide pools reset twice a day</h1><p class="byline">By J. Marsh</p>
<p>Twice a day the sea climbs the rocks and then falls back, and every pool left behind becomes a small sealed world for a few hours. The animals in it must tolerate water that heats up and grows saltier under the sun.</p>
<p>When the tide returns it floods the pool with cool fresh seawater in a matter of minutes. Larvae wash in, waste washes out, and the temperature drops back to something the residents can bear.</p>
<script>window.__x=1</script>
<h2>Why the timing shifts</h2>
<ul><li>Spring tides: the biggest swing.</li><li>Neap tides: a gentler one, a week later.</li></ul>
</article><footer>c</footer></body></html>`;

(async () => {
  const S = await import("../shared/settings.js");
  const R = await import("../shared/render.js");
  const { buildControls } = await import("../shared/controls.js");
  const { extractPdfText, itemsToParagraphs } = await import("../shared/pdftext.js");
  const { createReadingAids } = await import("../shared/aids.js");
  const TTS = await import("../shared/tts.js");

  /* settings */
  assert(S.DEFAULT_PROFILE.pacing === "flow" && Object.keys(S.FONTS).length === 4, "profile defaults + 4 fonts");
  const mig = S.normalizeProfile({ chunked: true, font: "opendyslexic" });
  assert(mig.pacing === "sentence" && mig.font === "dyslexic", "legacy migration");
  const cl = S.normalizeProfile({ fontSize: 999, wpm: 5000, bionic: -3, overlay: "??", pacing: "??" });
  assert(cl.fontSize <= 34 && cl.wpm <= 900 && cl.bionic === 0 && cl.overlay === "none" && cl.pacing === "flow", "clamps");
  await S.writeProfile({ ...S.DEFAULT_PROFILE, font: "atkinson", bionic: 40, syllables: true });
  const lp = await S.loadProfile();
  assert(lp.font === "atkinson" && lp.bionic === 40 && lp.syllables, "profile round-trip");
  await S.savePageMemory("https://x.test/a?q=1", { scroll: 1200, highlights: [{ text: "hi", before: "" }] });
  const pm = await S.loadPageMemory("https://x.test/a?q=2");
  assert(pm.scroll === 1200 && pm.highlights.length === 1, "page memory by origin+path");
  await S.setSiteAutoOpen("https://news.test", true);
  assert((await S.loadSites())["https://news.test"].autoOpen === true, "per-site autoOpen");

  /* stats */
  const st = R.computeStats("The cat sat. The dog ran fast across the wide green field yesterday afternoon.");
  assert(st.words > 10 && st.grade >= 1 && st.minutes >= 1, "computeStats");

  /* article render + sanitising */
  const host = document.getElementById("reading");
  const view = R.createReadingView(host);
  const { extracted, meta } = view.setArticleHtml(ARTICLE, "https://shoreline.test/tide");
  assert(extracted && /Tide pools/.test(meta.title), "article extracted");
  assert(!/<script|javascript:|SALE/i.test(host.innerHTML), "sanitised (script / js: / ad gone)");
  assert(host.querySelectorAll(".rt-s").length >= 4, "sentences wrapped");
  assert(host.querySelectorAll("li").length === 2, "list kept");

  view.applyProfile({ ...S.DEFAULT_PROFILE, bionic: 45 });
  assert(host.querySelectorAll("b.rt-b").length > 8, "bionic");
  view.applyProfile({ ...S.DEFAULT_PROFILE, syllables: true });
  assert(host.querySelectorAll(".rt-syl").length > 5, "syllable dots");
  view.applyProfile({ ...S.DEFAULT_PROFILE, hyphenate: true });
  assert(view.getFlowEl().dataset.rtHyphenate === "true", "hyphenate attr");
  view.applyProfile({ ...S.DEFAULT_PROFILE, pacing: "sentence" });
  assert(!host.querySelector(".rt-chunk-stage").hidden && host.querySelector(".rt-article").hidden, "sentence mode");
  view.applyProfile({ ...S.DEFAULT_PROFILE, pacing: "word" });
  assert(!host.querySelector(".rt-rsvp-stage").hidden, "word mode");
  view.step(1);
  assert(/\S/.test(host.querySelector(".rt-rsvp-word").textContent), "rsvp word shows");
  view.applyProfile({ ...S.DEFAULT_PROFILE });

  R.applyTypography(host, { ...S.DEFAULT_PROFILE, overlay: "custom", customTint: "#101014", contrast: 85 });
  assert(host.style.getPropertyValue("--rt-surface") === "#101014" && host.style.getPropertyValue("--rt-contrast") === "0.85", "custom tint + contrast vars");

  /* pdftext */
  const p1 = itemsToParagraphs([
    { str: "Line one of para one.", hasEOL: true }, { str: "line two.", hasEOL: true },
    { str: "", hasEOL: true }, { str: "New para.", hasEOL: true },
  ]);
  assert(p1.length === 2, "itemsToParagraphs blank-line split");
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../lib/pdf.worker.min.js", location.href).href;
    const buf = await fetch("fixtures/sample.pdf").then((r) => r.arrayBuffer());
    const text = await extractPdfText(window.pdfjsLib, buf);
    assert(/Photosynthesis/.test(text) && /leaves are usually green/.test(text), "PDF: both pages extracted");
    const scan = await fetch("fixtures/scan-no-text.pdf").then((r) => r.arrayBuffer());
    assert((await extractPdfText(window.pdfjsLib, scan)).replace(/\s+/g, "").length < 8, "PDF: image-only yields no text");
  } else log("pdfjsLib missing", false);

  /* aids */
  const aids = createReadingAids({ getFlow: () => view.getFlowEl(), onSaveScroll: () => {}, onSaveHighlights: () => {} });
  aids.apply({ ...S.DEFAULT_PROFILE, focus: "ruler" });
  assert(!document.querySelector(".rt-ruler").hidden, "ruler shown for focus=ruler (flow)");
  aids.apply({ ...S.DEFAULT_PROFILE, focus: "ruler", pacing: "word" });
  assert(document.querySelector(".rt-ruler").hidden, "ruler hidden in word mode");
  aids.destroy();

  assert(typeof TTS.isTTSAvailable === "function" && typeof TTS.createTTS === "function", "tts exports");

  /* controls */
  let patch = null;
  const controls = buildControls(S.DEFAULT_PROFILE, (p) => (patch = p));
  document.getElementById("panel-slot").append(controls.toggle, controls.panel);
  assert(controls.panel.querySelectorAll(".rt-sec").length >= 4, "panel sections");
  controls.panel.querySelector('.rt-seg[aria-label="Font"] button[data-val="atkinson"]').click();
  assert(patch.font === "atkinson", "font segment");
  controls.panel.querySelector('.rt-swatch[data-val="blue"]').click();
  assert(patch.overlay === "blue", "tint swatch");
  controls.panel.querySelector('.rt-seg[aria-label="Reading mode"] button[data-val="word"]').click();
  assert(patch.pacing === "word", "pacing segment");
  controls.setVoices([{ name: "Test", localService: true }]);
  assert(controls.panel.querySelector(".rt-select").options.length === 2, "setVoices");

  /* showcase */
  host.replaceChildren();
  const sc = R.createReadingView(host);
  const r2 = sc.setArticleHtml(ARTICLE, "https://shoreline.test/tide");
  sc.setMeta({ title: r2.meta.title, parts: ["Shoreline Notes", "By J. Marsh", "3 min read", "Grade 7 reading level"] });
  const prof = { ...S.DEFAULT_PROFILE, font: "atkinson", fontSize: 20, lineHeight: 1.8, wordSpacing: 0.12, bionic: 38, overlay: "cream", hyphenate: true, paragraphSpacing: 1.3 };
  R.applyTypography(host, prof); R.paintPage(prof); sc.applyProfile(prof);
  assert(!host.querySelector(".rt-doc-head").hidden && host.querySelector(".rt-article").getBoundingClientRect().height > 100, "showcase renders");

  const fails = [...document.querySelectorAll("#results li")].filter((l) => l.textContent.startsWith("FAIL")).length;
  log(`— done — ${fails ? fails + " FAILED" : "ALL PASS"}`);
  window.__DONE = true;
  window.__FAILS = fails;
})().catch((e) => {
  log("HARNESS CRASH: " + ((e && e.stack) || e), false);
  window.__DONE = true;
  window.__FAILS = 99;
});
