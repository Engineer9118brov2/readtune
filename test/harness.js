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

/* A consent modal with no ARIA role — Readability's unlikelyRoles filter misses
   these, so on a page with no long prose the cookie notice becomes "the article".
   Britannica's home page rendered exactly this text in Reader View. */
const CONSENT_PAGE = `<!doctype html><html><head><title>Encyclopedia Britannica | Britannica</title></head><body>
<header><a href="/">Britannica</a><nav><a href="/games">Games</a><a href="/history">History</a></nav></header>
<main><div class="grid"><a href="/t1"><h3>You Gotta Be Kitten Me</h3></a><a href="/t2"><h3>Alternative Energies</h3></a></div></main>
<div id="_evidon-consent-frame" class="evidon-consent-modal">
<a class="evidon-close" href="#">&times;</a><h2>Do not sell my info</h2>
<p>You have chosen to opt-out of the sale or sharing of your information from this site and any of its affiliates. To opt back in please click the "Customize my ad experience" link.</p>
<p>This site collects information through the use of cookies and other tracking tools. Cookies and these tools do not contain any information that personally identifies a user, but personal information that would be stored about you may be linked to the information stored in and obtained from them. This information would be used and shared for Analytics, Ad Serving, Interest Based Advertising, among other purposes.</p>
<p>For more information please visit this site's Privacy Policy.</p>
<a href="#">CANCEL</a><a href="#">CONTINUE</a></div></body></html>`;

/* An article that legitimately discusses cookies and privacy: the overlay
   stripper must not touch it. */
const COOKIE_ARTICLE = `<!doctype html><html><head><title>How cookie banners got so bad</title></head><body><article>
<h1>How cookie banners got so bad</h1>
<p>We use cookies, the banner says, and then it offers you a wall of toggles that nobody reads. The design of consent has drifted a long way from the intent of the law that created it, and the result is a ritual that wastes a little of everyone's attention several times a day.</p>
<p>Researchers who study these interfaces find that the placement of the reject control matters more than the wording of the notice. When accepting takes one click and declining takes four, most people accept, and the recorded consent tells you almost nothing about what they actually wanted.</p>
<p>The fix that regulators keep circling is a machine-readable signal the browser sends once, so the negotiation happens without a modal at all. Several jurisdictions now recognise such a signal, and the banners persist anyway.</p>
</article></body></html>`;

/* A data table: read-aloud has to walk the cells, not step over them. */
const TABLE_PAGE = `<!doctype html><html><head><title>Calabasas</title></head><body><article>
<h1>Calabasas</h1>
<p>Calabasas is a city in Los Angeles County, California, adjacent to the southwestern San Fernando Valley. Situated within the foothills of the Santa Monica mountains, it sits about thirty miles northwest of downtown Los Angeles and keeps a population of roughly twenty three thousand people.</p>
<table><caption>Calabasas, California</caption>
<tr><th>Country</th><td>United States</td></tr>
<tr><th>State</th><td>California</td></tr>
<tr><th>County</th><td>Los Angeles</td></tr>
<tr><th>Incorporated</th><td>April 5, 1991</td></tr>
<tr><th>Elevation</th><td>928 ft</td></tr>
<tr><th>ZIP codes</th><td>91301, 91302</td></tr></table>
<p>The name Calabasas is an archaic Californio spelling of the Spanish word for winter squashes, and the city has used it since well before incorporation.</p>
</article></body></html>`;

const APP_SHELL = `<!doctype html><html><head><title>Grok</title></head><body>
<header><button>Search</button><button>New Chat</button><button>Library</button></header>
<main>
  <section><h1>Grok</h1><p>More ideas</p></section>
  <section><button>Platformer</button><button>World map</button><button>Landing page</button></section>
  <section><p>Build beta</p><p>New Chat</p></section>
</main>
</body></html>`;

(async () => {
  const S = await import("../shared/settings.js");
  // Derived, never hardcoded: a literal here silently goes stale the moment
  // the ceiling moves, and then asserts the old ceiling forever.
  const RANGES_MIN = S.RANGES.ttsRate.min, RANGES_MAX = S.RANGES.ttsRate.max;
  const R = await import("../shared/render.js");
  const { buildControls } = await import("../shared/controls.js");
  const { createReadingScreen } = await import("../shared/screen.js");
  const { extractPdfText, itemsToParagraphs } = await import("../shared/pdftext.js");
  const { createReadingAids } = await import("../shared/aids.js");
  const TTS = await import("../shared/tts.js");
  const EL = await import("../shared/elevenlabs.js");
  const IP = await import("../shared/inpage-style.js");
  const RU = await import("../shared/ruler.js");
  const PI = await import("../shared/piper.js");
  const CS = await import("../shared/calibration-score.js");
  const CI = await import("../shared/calibration-insights.js");
  const RM = await import("../shared/reading-modes.js");
  const RS = await import("../shared/research.js");

  /* ---- in-page restyle: run the actual injected script in its isolated sandbox ---- */
  const inpageFrame = document.getElementById("inpage-frame");
  await new Promise((resolve) => {
    if (inpageFrame.contentDocument && inpageFrame.contentDocument.readyState === "complete") resolve();
    else inpageFrame.addEventListener("load", resolve, { once: true });
  });
  const inpageWindow = inpageFrame.contentWindow;
  for (let attempt = 0; attempt < 40 && inpageWindow.__readtuneInpageBootStatus !== "ready"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const inpageDoc = inpageFrame.contentDocument;
  assert(inpageDoc.documentElement.classList.contains("rt-inpage"), "in-page restyle boots in the sandbox");
  assert(inpageDoc.querySelectorAll("rt-bionic").length > 10, "in-page restyle applies bionic anchors");
  assert(!!inpageDoc.getElementById("readtune-ruler"), "in-page restyle creates the reading ruler");
  const inpageBar = inpageDoc.getElementById("readtune-bar-host");
  assert(inpageBar && inpageBar.shadowRoot && inpageBar.shadowRoot.querySelectorAll("button").length >= 8, "in-page restyle renders isolated controls");
  inpageWindow.__readtuneInpage.toggleOff();
  assert(!inpageDoc.documentElement.classList.contains("rt-inpage") && !inpageDoc.getElementById("readtune-bar-host"), "in-page restyle removes itself cleanly");

  // Re-injection is the real toggle path (popup button, Alt+Shift+R). Chrome
  // re-runs inpage.js in the SAME script scope, so a stray top-level `const`
  // would throw "already declared" and the toggle would silently do nothing.
  // A fresh <script> element re-executes classic script source the same way.
  async function reinjectInpage() {
    await new Promise((resolve) => {
      const s = inpageDoc.createElement("script");
      s.src = "../inpage.js";
      s.onload = resolve;
      s.onerror = resolve;
      inpageDoc.body.appendChild(s);
    });
    for (let i = 0; i < 40 && inpageWindow.__readtuneInpageBootStatus === "pending"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  await reinjectInpage();
  assert(
    inpageDoc.documentElement.classList.contains("rt-inpage") && !!inpageDoc.getElementById("readtune-bar-host"),
    "in-page restyle re-injects cleanly after being toggled off",
  );
  await reinjectInpage();
  assert(
    !inpageDoc.documentElement.classList.contains("rt-inpage") && !inpageDoc.getElementById("readtune-bar-host"),
    "in-page restyle toggles back off when re-injected",
  );

  /* ---- Reader View: run the shipped page with a captured article and local speech stub ---- */
  const readerFrame = document.getElementById("reader-frame");
  await new Promise((resolve) => {
    if (readerFrame.contentDocument && readerFrame.contentDocument.readyState === "complete") resolve();
    else readerFrame.addEventListener("load", resolve, { once: true });
  });
  const readerDoc = readerFrame.contentDocument;
  for (let attempt = 0; attempt < 40 && !readerDoc.querySelector(".rt-s"); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(readerDoc.querySelectorAll(".rt-s").length >= 6, "Reader View renders a captured article into readable sentences");
  assert(/Tide pools/i.test(readerFrame.contentWindow.document.title), "Reader View keeps a clean article title");
  assert(!!readerDoc.querySelector(".rt-panel-toggle") && !!readerDoc.querySelector(".rt-doc-action"), "Reader View creates settings and Listen controls");
  readerDoc.querySelector(".rt-doc-action").click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(!readerDoc.querySelector(".rt-transport").hidden && !!readerDoc.querySelector(".rt-speak-sentence"), "Reader View starts read-aloud and highlights the sentence");

  /* ---- Voice Fit Lab: only curated Piper choices may be shown ---- */
  const labFrame = document.getElementById("lab-frame");
  await new Promise((resolve) => {
    if (labFrame.contentDocument && labFrame.contentDocument.readyState === "complete") resolve();
    else labFrame.addEventListener("load", resolve, { once: true });
  });
  const labDoc = labFrame.contentDocument;
  for (let attempt = 0; attempt < 40 && labDoc.querySelectorAll(".lab-voice-card").length !== 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const labVoiceText = labDoc.getElementById("lab-voice-panel").textContent;
  assert(labDoc.querySelectorAll(".lab-voice-card").length === 3, "Voice Fit Lab renders exactly three curated Piper voices");
  assert(/Linden/.test(labVoiceText) && /Joe/.test(labVoiceText) && /Kristin/.test(labVoiceText), "Voice Fit Lab names the Piper choices");
  assert(/Built in/.test(labVoiceText), "Voice Fit Lab marks the bundled default voice as built in");
  assert(!/Browser default|Best free voices|Re-scan/i.test(labVoiceText), "Voice Fit Lab does not surface browser voice clutter");

  /* settings */
  assert(S.DEFAULT_PROFILE.pacing === "flow" && Object.keys(S.FONTS).length === 4, "profile defaults + 4 fonts");
  assert(
    S.FONTS.sans.label === "System Sans" &&
      S.DEFAULT_PROFILE.lineHeight === RS.RESEARCH_STARTER_PROFILE.lineHeight &&
      S.DEFAULT_PROFILE.columnWidth === RS.RESEARCH_STARTER_PROFILE.columnWidth &&
      S.DEFAULT_PROFILE.rulerLines === 1,
    "research-backed starter seeds defaults"
  );
  const mig = S.normalizeProfile({ chunked: true, font: "opendyslexic" });
  assert(mig.pacing === "sentence" && mig.font === "dyslexic", "legacy migration");
  const legacyRuler = S.normalizeProfile({ focus: "ruler", rulerHeight: 76 });
  assert(legacyRuler.rulerLines === 5, "legacy ruler height migrates into a multi-line focus span");
  const cl = S.normalizeProfile({ fontSize: 999, wpm: 5000, bionic: -3, overlay: "??", pacing: "??" });
  assert(cl.fontSize <= 34 && cl.wpm <= 900 && cl.bionic === 0 && cl.overlay === "none" && cl.pacing === "flow", "clamps");
  assert(
    S.DEFAULT_PROFILE.dyslexicUiMode === false &&
      S.normalizeProfile({ dyslexicUiMode: "yes" }).dyslexicUiMode === true &&
      S.normalizeProfile({}).dyslexicUiMode === false,
    "dyslexicUiMode defaults off and coerces to boolean"
  );
  S.applyDyslexicUi(true);
  assert(document.documentElement.classList.contains("rt-ui-dyslexic"), "applyDyslexicUi adds the chrome class");
  S.applyDyslexicUi(false);
  assert(!document.documentElement.classList.contains("rt-ui-dyslexic"), "applyDyslexicUi removes the chrome class");
  await S.writeProfile({ ...S.DEFAULT_PROFILE, font: "atkinson", bionic: 40, syllables: true, dyslexicUiMode: true });
  const lp = await S.loadProfile();
  assert(lp.font === "atkinson" && lp.bionic === 40 && lp.syllables && lp.dyslexicUiMode === true, "profile round-trip");
  const setup0 = await S.loadSetup();
  assert(setup0.calibratedAt === 0 && setup0.voiceFitAt === 0, "setup defaults");
  await S.saveSetup({ calibratedAt: 11 });
  await S.saveSetup({ voiceFitAt: 22 });
  const setup1 = await S.loadSetup();
  assert(setup1.calibratedAt === 11 && setup1.voiceFitAt === 22, "setup progress round-trip");
  await S.writeProfile({ ...S.DEFAULT_PROFILE, pacing: "sentence", font: "lexend" });
  const lp2 = await S.loadProfile();
  assert(lp2.font === "lexend" && lp2.pacing === "flow", "pacing is session-only");
  await S.savePageMemory("https://x.test/a?q=1", { scroll: 1200, highlights: [{ text: "hi", before: "" }] });
  const pm = await S.loadPageMemory("https://x.test/a?q=2");
  assert(pm.scroll === 1200 && pm.highlights.length === 1, "page memory by origin+path");
  await S.setSiteAutoOpen("https://news.test", true);
  assert((await S.loadSites())["https://news.test"].autoOpen === true, "per-site autoOpen");
  await S.setSiteAutomation("https://news.test", "style");
  const siteMode = S.siteAutomationMode((await S.loadSites())["https://news.test"]);
  assert(siteMode === "style" && !(await S.loadSites())["https://news.test"].autoOpen, "site automation mode swaps atomically");

  /* stats */
  const st = R.computeStats("The cat sat. The dog ran fast across the wide green field yesterday afternoon.");
  assert(st.words > 10 && st.grade >= 1 && st.minutes >= 1 && st.gradeReliable === false, "computeStats");

  /* article render + sanitising */
  const host = document.getElementById("reading");
  const view = R.createReadingView(host);
  const { extracted, meta, quality } = view.setArticleHtml(ARTICLE, "https://shoreline.test/tide");
  assert(extracted && quality.ok && /Tide pools/.test(meta.title), "article extracted");
  assert(!/<script|javascript:|SALE/i.test(host.innerHTML), "sanitised (script / js: / ad gone)");
  assert(host.querySelectorAll(".rt-s").length >= 4, "sentences wrapped");
  assert(host.querySelectorAll("li").length === 2, "list kept");

  const shellView = R.createReadingView(document.createElement("div"));
  const shell = shellView.setArticleHtml(APP_SHELL, "https://grok.test");
  assert(!shell.quality.ok && shellView.isEmpty(), "app shell rejected");

  let starterPatch = null;
  const starterControls = buildControls({ ...S.DEFAULT_PROFILE, ttsRate: 1.2, rulerLines: 5, rulerHeight: 76 }, (p) => {
    starterPatch = p;
  });
  assert(/Research-backed starter/.test(starterControls.panel.textContent), "controls surface research-backed starter");
  starterControls.panel.querySelector(".rt-research-btn").click();
  assert(
    starterPatch &&
      starterPatch.lineHeight === RS.RESEARCH_STARTER_PROFILE.lineHeight &&
      starterPatch.columnWidth === RS.RESEARCH_STARTER_PROFILE.columnWidth &&
      starterPatch.rulerLines === 5 &&
      starterPatch.rulerHeight === 76 &&
      starterPatch.ttsRate === 1.2,
    "starter button emits starter profile"
  );

  let uiPatch = null;
  const uiControls = buildControls({ ...S.DEFAULT_PROFILE, dyslexicUiMode: true }, (p) => (uiPatch = p));
  const dysToggle = [...uiControls.panel.querySelectorAll(".rt-toggle")].find((n) =>
    /Dyslexia-friendly menus/.test(n.textContent)
  );
  assert(
    dysToggle && !dysToggle.closest("details"),
    "the dyslexia-friendly menus toggle sits at the top of the panel, not folded inside a section",
  );
  const dysInput = dysToggle && dysToggle.querySelector("input");
  assert(dysInput && dysInput.checked === true, "controls reflect dyslexicUiMode");
  S.applyDyslexicUi(false);
  dysInput.checked = false;
  dysInput.dispatchEvent(new Event("change"));
  assert(
    uiPatch && uiPatch.dyslexicUiMode === false && !document.documentElement.classList.contains("rt-ui-dyslexic"),
    "toggling dyslexic UI in the panel emits and reskins immediately"
  );
  dysInput.checked = true;
  dysInput.dispatchEvent(new Event("change"));
  assert(document.documentElement.classList.contains("rt-ui-dyslexic"), "re-enabling in the panel reskins immediately");
  S.applyDyslexicUi(false);

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
  assert(
    host.style.getPropertyValue("--rt-surface") === "#101014" &&
      host.style.getPropertyValue("--rt-contrast") === "0.85" &&
      host.dataset.rtPacing === "flow",
    "custom tint + contrast vars + pacing dataset"
  );
  view.setActions([{ label: "Listen", title: "Start here", primary: true, onClick: () => {} }]);
  assert(host.querySelectorAll(".rt-doc-action").length === 1 && host.querySelector(".rt-doc-action").title === "Start here", "doc action renders");

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

  assert(typeof TTS.createTTS === "function", "tts exports createTTS");
  assert(
    !("rankBrowserVoices" in TTS) && !("listVoices" in TTS) && !("isTTSAvailable" in TTS),
    "tts.js no longer carries the removed browser-speech surface",
  );
  assert(RU.measuredLineHeight({ lineHeight: "normal", fontSize: "20px" }, 30) === 27, "normal line-height expands from font size");
  assert(RU.adaptiveRulerHeight({ lineHeightPx: 34, fontSizePx: 22, baseHeight: 40 }) > RU.adaptiveRulerHeight({ lineHeightPx: 20, fontSizePx: 14, baseHeight: 40 }), "ruler height tracks text metrics");
  assert(
    RU.adaptiveRulerHeight({ lineHeightPx: 28, fontSizePx: 18, baseHeight: 40, lines: 3 }) >
      RU.adaptiveRulerHeight({ lineHeightPx: 28, fontSizePx: 18, baseHeight: 40, lines: 1 }),
    "ruler height expands with multi-line focus spans"
  );
  assert(RU.inferLegacyRulerLines(52) === 3 && RU.rulerSpanLabel(5) === "5 lines", "ruler helpers map legacy sizes and labels");
  const piperProgress = PI.describePiperProgress({ loaded: 30 * 1024 * 1024, total: 60 * 1024 * 1024, phase: "voice.onnx" });
  assert(piperProgress.percent === 50 && /50%/.test(piperProgress.message), "Piper progress gives a clear percent");
  assert(/Preparing your local voice/.test(PI.describePiperProgress({}).message), "Piper progress explains preparation before byte totals arrive");

  /* ---- calibration scoring (single-change design + practice de-trend) ---- */
  assert(CS.linfit([0, 1, 2], [10, 20, 30]) === 10, "linfit slope");

  // pure practice ramp, no real setting effects: de-trend should wipe out every dimension
  const ramp = [200, 220, 240, 260, 280, 300].map((wpm, p) => ({
    key: p === 0 ? "baseline" : ["spacing", "dyslexic", "atkinson", "bionic", "chunk"][p - 1],
    label: "x", apply: {}, position: p, wpm, correct: true, ease: 3,
  }));
  const rampA = CS.analyse(ramp, "baseline");
  assert(Math.round(rampA.practiceSlope) === 20, "practice slope estimated (" + rampA.practiceSlope.toFixed(1) + ")");
  assert(rampA.dims.every((d) => Math.abs(d.speedDelta) < 0.05), "de-trend removes the practice ramp — no false speed effect");

  // a reader for whom spacing genuinely helps (on top of the ramp) and OpenDyslexic hurts
  const eff = [200, 250, 205, 232, 248, 260].map((wpm, p) => ({
    key: p === 0 ? "baseline" : ["spacing", "dyslexic", "atkinson", "bionic", "chunk"][p - 1],
    label: ["Standard", "Roomier spacing", "OpenDyslexic", "Atkinson", "Bionic", "One sentence"][p],
    apply: [{}, { lineHeight: 1.95 }, { font: "dyslexic" }, { font: "atkinson" }, { bionic: 40 }, { pacing: "sentence" }][p],
    position: p, wpm, correct: p !== 2, ease: [3, 5, 2, 3, 4, 3][p],
  }));
  const an = CS.analyse(eff, "baseline");
  assert(an.dims[0].key === "spacing", "top dimension is the one that helped (" + an.dims[0].key + ")");
  assert(an.dims.find((d) => d.key === "dyslexic").help < 0, "a hurting change scores negative");
  const built = CS.buildProfile({ dims: an.dims, baseline: { font: "sans" }, defaults: S.DEFAULT_PROFILE, fontKeys: new Set(["dyslexic", "atkinson"]), extra: { overlay: "none" } });
  assert(built.kept.includes("spacing") && !built.kept.includes("dyslexic"), "kept the helpful change, dropped the harmful font");
  assert(built.profile.font === "sans", "font stays standard when no font variant helped");

  const flat = CS.analyse(
    [0, 1, 2, 3].map((p) => ({ key: p === 0 ? "baseline" : "d" + p, label: "x", apply: {}, position: p, wpm: 200, correct: true, ease: 3 })),
    "baseline"
  );
  assert(flat.dims.every((d) => Math.abs(d.help) < 0.05), "no signal in → no dimension kept");

  const history = [
    {
      at: 1,
      kept: ["spacing"],
      profile: { ...S.DEFAULT_PROFILE, lineHeight: 1.95, letterSpacing: 0.04, wordSpacing: 0.16 },
      speedInformative: true,
      dims: [
        { key: "spacing", help: 0.19, speedDelta: 0.14 },
        { key: "dyslexic", help: -0.05, speedDelta: -0.02 },
      ],
    },
    {
      at: 2,
      kept: ["spacing"],
      profile: { ...S.DEFAULT_PROFILE, lineHeight: 1.95, letterSpacing: 0.04, wordSpacing: 0.16 },
      speedInformative: true,
      dims: [
        { key: "spacing", help: 0.16, speedDelta: 0.11 },
        { key: "bionic", help: 0.03, speedDelta: 0.01 },
      ],
    },
    {
      at: 3,
      kept: ["spacing", "atkinson"],
      profile: { ...S.DEFAULT_PROFILE, font: "atkinson", lineHeight: 1.95, letterSpacing: 0.04, wordSpacing: 0.16 },
      speedInformative: true,
      dims: [
        { key: "spacing", help: 0.18, speedDelta: 0.12 },
        { key: "atkinson", help: 0.12, speedDelta: 0.06 },
      ],
    },
  ];
  const summary = CI.summarizeCalibrations(history, history[2].profile);
  assert(summary.runs === 3 && summary.stabilityLabel === "Stable", "insights: stable pattern surfaces");
  assert(/spacing/i.test(summary.profileTitle) && summary.useCases.length === 3, "insights: title + use cases");
  const manualSummary = CI.summarizeCalibrations(history, { ...history[2].profile, font: "lexend" });
  assert(manualSummary.profile.font === "lexend" && /Lexend/.test(manualSummary.profileTitle), "insights: current saved profile beats stale history snapshot");
  assert(CI.buildProfileTitle({ font: "atkinson" }, ["spacing", "chunk"]) === "Atkinson Hyperlegible + roomier spacing", "guided pacing stays out of default profile title");

  /* ---- ElevenLabs read-aloud ---- */
  const align = { starts: [0, 0.5, 1.0, 1.6, 2.4], chars: ["a", "b", "c", "d", "e"], ends: [] };
  assert(EL.charIndexAt(align, 0) === 0 && EL.charIndexAt(align, 0.7) === 1 && EL.charIndexAt(align, 2.0) === 3 && EL.charIndexAt(align, 99) === 4, "charIndexAt binary search");
  assert(EL.charIndexAt({ starts: [] }, 1) === -1, "charIndexAt empty alignment");
  assert(EL.ELEVEN_ORIGIN === "https://api.elevenlabs.io/*", "eleven origin constant");

  await S.saveTTSConfig({ provider: "elevenlabs", apiKey: "sk-test-123", voiceId: "v1", voiceName: "Aria" });
  let tc = await S.loadTTSConfig();
  assert(tc.provider === "elevenlabs" && tc.apiKey === "sk-test-123" && tc.voiceId === "v1", "TTS config round-trip");
  tc = await S.saveTTSConfig({ provider: "piper", piperVoice: "en_US-joe-medium" });
  assert(tc.provider === "piper" && tc.piperVoice === "en_US-joe-medium", "Piper TTS config round-trip");
  await S.saveTTSConfig({ provider: "piper", piperVoice: "en_US-lessac-medium" });
  tc = await S.loadTTSConfig();
  assert(tc.piperVoice === "en_US-ljspeech-medium", "retired Piper voice upgrades to the bundled public-domain default");
  await S.forgetTTSKey();
  tc = await S.loadTTSConfig();
  assert(tc.provider === "piper" && !tc.apiKey, "forgetTTSKey clears the ElevenLabs key + reverts to the on-device voice");
  assert(!JSON.stringify(S.DEFAULT_PROFILE).includes("apiKey"), "API key is NOT part of the profile object");

  await S.setSiteAutoStyle("https://blog.test", true);
  assert((await S.loadSites())["https://blog.test"].autoStyle === true, "per-site autoStyle");
  await S.setSiteAutomation("https://blog.test", "off");
  assert(S.siteAutomationMode((await S.loadSites())["https://blog.test"]) === "off", "site automation mode clears cleanly");

  /* ---- in-page stylesheet generation ---- */
  const ipCss = IP.inpageCSS({ ...S.DEFAULT_PROFILE, font: "dyslexic", fontSize: 22, overlay: "cream", bionic: 40, hideImages: true }, "/*ff*/");
  assert(/html\.rt-inpage/.test(ipCss) && /OpenDyslexic/.test(ipCss), "inpageCSS scoped + font applied");
  assert(/22px !important/.test(ipCss), "inpageCSS font-size");
  assert(/#f7f0dc/.test(ipCss) && /display: none !important/.test(ipCss), "inpageCSS tint + hide-images");
  assert(/:not\(svg\)/.test(ipCss), "inpageCSS guards icons/svg");
  assert(/:not\(button\):not\(input\):not\(select\):not\(textarea\):not\(option\)/.test(ipCss), "inpageCSS protects controls from prose spacing");
  assert(/html\.rt-inpage button[^}]+letter-spacing: normal !important/.test(ipCss), "inpageCSS resets control spacing");
  assert(!/nav, aside, header, footer/.test(ipCss), "inpageCSS keeps app chrome backgrounds intact");
  const ipDark = IP.inpageCSS({ ...S.DEFAULT_PROFILE, overlay: "dark" }, "");
  assert(/color-scheme: dark/.test(ipDark) && /-webkit-text-fill-color: var\(--rt-inpage-ink\)/.test(ipDark), "inpageCSS dark tint forces readable text");
  const ipNone = IP.inpageCSS({ ...S.DEFAULT_PROFILE, overlay: "none" }, "");
  assert(!/background: #/.test(ipNone.replace(/#readtune-ruler[^}]+}/g, "")), "inpageCSS overlay=none leaves page colours alone");

  /* ---- controls: read-aloud engine picker (Piper on-device + optional key) ---- */
  let ttsPatch = null;
  const cp = buildControls({ ...S.DEFAULT_PROFILE, pacing: "aloud" }, (p) => (ttsPatch = p));
  document.body.append(cp.panel);
  const engRow = [...cp.panel.querySelectorAll(".rt-field-label")].find((n) => /Voice source/.test(n.textContent));
  assert(engRow && !engRow.closest(".rt-field").hidden, "engine picker visible in aloud mode");
  const engButtons = [...cp.panel.querySelectorAll('.rt-seg[aria-label="Read-aloud engine"] button')].map((b) => b.dataset.val);
  assert(engButtons.includes("piper") && engButtons.includes("elevenlabs") && !engButtons.includes("browser"), "engine picker offers the on-device voice and an optional key, not a browser voice");
  assert(/ships with ReadTune/.test(cp.panel.textContent), "panel explains the default voice is built in");
  cp.panel.querySelector('.rt-seg[aria-label="Read-aloud engine"] button[data-val="elevenlabs"]').click();
  assert(ttsPatch && ttsPatch.__tts && ttsPatch.__tts.provider === "elevenlabs", "engine → __tts patch");
  cp.setTTS({ provider: "elevenlabs", hasKey: true, voices: [{ id: "a", name: "Aria" }, { id: "b", name: "Bill" }], voiceId: "a", status: "ok" });
  assert(cp.panel.querySelector(".rt-tts-connected") && !cp.panel.querySelector(".rt-tts-connected").hidden, "connected row shown when key present");
  const elSel = [...cp.panel.querySelectorAll("select")].find((s) => s.options.length === 2 && s.options[0].textContent === "Aria");
  assert(elSel, "EL voice list populated");
  cp.panel.remove();

  const screenSurface = document.createElement("section");
  const screenHost = document.createElement("div");
  screenSurface.appendChild(screenHost);
  document.body.appendChild(screenSurface);
  await S.writeProfile({ ...S.DEFAULT_PROFILE, focus: "ruler" });
  const screenView = R.createReadingView(screenHost);
  screenView.setArticleHtml(ARTICLE, "https://shoreline.test/tide");
  const screen = await createReadingScreen({ surface: screenSurface, view: screenView, pageUrl: "" });
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(screen.getProfile().pacing === "aloud", "listen shortcut enters aloud mode");
  document.querySelector(".rt-reset").click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(
    screen.getProfile().pacing === "flow" && document.querySelector(".rt-transport").hidden,
    "reset returns to flow and hides the transport"
  );
  screen.destroy();
  assert(!document.querySelector(".rt-panel") && !document.querySelector(".rt-panel-toggle"), "reading screen destroy cleans up controls");
  screenSurface.remove();

  const listenMode = RM.modePatch("listen", S.DEFAULT_PROFILE);
  assert(listenMode.pacing === "aloud" && listenMode.focus === "ruler" && listenMode.rulerLines === 3, "listen mode follows spoken sentence with more context");

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
  controls.sync({ ...S.DEFAULT_PROFILE, focus: "ruler", rulerLines: 1 });
  patch = null;
  controls.panel.querySelector('.rt-seg[aria-label="Reading ruler span"] button[data-val="3"]').click();
  assert(patch.rulerLines === 3, "ruler span segment");
  patch = null;
  controls.panel.querySelector('.rt-mode[data-mode="skim"]').click();
  assert(patch && patch.__mode === "skim", "quick mode emits bundle patch");
  controls.sync({ ...S.DEFAULT_PROFILE, pacing: "sentence", focus: "off", hideImages: true, freezeMotion: true, columnWidth: 52 });
  assert(controls.panel.querySelector('.rt-mode[data-mode="skim"]').getAttribute("aria-pressed") === "true", "quick mode reflects matching profile");
  assert(
    typeof controls.setVoices !== "function" && !controls.panel.querySelector('select[aria-label="Browser voice"]'),
    "controls no longer build a browser-voice picker",
  );

  /* ---- consent / cookie overlays are never the article ---- */
  {
    const h = document.createElement("div");
    document.body.appendChild(h);
    const v = R.createReadingView(h);
    const res = v.setArticleHtml(CONSENT_PAGE, "https://www.britannica.com/");
    const text = h.querySelector(".rt-article").textContent;
    assert(!/do not sell my info/i.test(text), "consent modal never renders as the article");
    assert(!/Interest Based Advertising/i.test(text), "consent body text is stripped before Readability");
    assert(!res.quality.ok, "a page whose only prose is a cookie notice fails the quality gate");

    // the stripper must not eat an article that is *about* cookies
    const h2 = document.createElement("div");
    document.body.appendChild(h2);
    const v2 = R.createReadingView(h2);
    const res2 = v2.setArticleHtml(COOKIE_ARTICLE, "https://example.test/cookie-banners");
    assert(res2.quality.ok, "an article about cookie banners still extracts");
    assert(
      /placement of the reject control/i.test(h2.querySelector(".rt-article").textContent),
      "prose about consent survives the overlay stripper",
    );
    assert(R.consentPhraseHits("We use cookies and this is your privacy choices notice") >= 2, "consent phrases are detected");
    assert(R.consentPhraseHits("The tide pools reset twice a day.") === 0, "ordinary prose trips no consent phrase");
    h.remove();
    h2.remove();
  }

  /* ---- read-aloud reaches table cells, and wraps each block only once ---- */
  {
    const h = document.createElement("div");
    document.body.appendChild(h);
    const v = R.createReadingView(h);
    v.setArticleHtml(TABLE_PAGE, "https://example.test/calabasas");
    v.applyProfile({ ...S.DEFAULT_PROFILE });
    const flow = h.querySelector(".rt-article");
    const cells = [...flow.querySelectorAll("td, th")].filter((c) => c.textContent.trim());
    const unreachable = cells.filter((c) => !c.querySelector(".rt-s") && !c.classList.contains("rt-s"));
    assert(cells.length > 0 && unreachable.length === 0, "every table cell with text is reachable by read-aloud");
    assert(flow.querySelectorAll(".rt-s .rt-s").length === 0, "sentence spans are never nested");
    assert(flow.querySelector("caption .rt-s"), "the table caption is read too");
    h.remove();
  }

  /* ---- the read-aloud word highlight never leaves a trail ---- */
  {
    const h = document.createElement("div");
    document.body.appendChild(h);
    const v = R.createReadingView(h);
    v.setArticleHtml(ARTICLE, "https://shoreline.test/tide");
    v.applyProfile({ ...S.DEFAULT_PROFILE, pacing: "aloud" });
    const flow = h.querySelector(".rt-article");
    const tts = TTS.createTTS({ getFlow: () => flow });
    tts.seek(0);

    /* The playback path: each sentence marks a word as the audio moves through
       it. Before the fix each call cleared only its own sentence, so every
       sentence read left its last word highlighted permanently. */
    const spans = [...flow.querySelectorAll(".rt-s")].slice(0, 4);
    const words = spans.map((s) => {
      const w = document.createElement("span");
      w.className = "rt-w";
      w.textContent = "word";
      s.appendChild(w);
      return w;
    });
    words.forEach((w) => TTS.markWord(flow, w));
    assert(
      flow.querySelectorAll(".rt-speak-word").length === 1,
      "reading through four sentences leaves exactly one word mark, not four",
    );
    assert(words[words.length - 1].classList.contains("rt-speak-word"), "the surviving mark is the current word");

    TTS.markWord(flow, null);
    assert(flow.querySelectorAll(".rt-speak-word").length === 0, "the word mark can be cleared outright");

    tts.step(1);
    assert(flow.querySelectorAll(".rt-speak-sentence").length === 1, "exactly one sentence is marked at a time");

    tts.destroy();
    assert(flow.querySelectorAll(".rt-speak-word, .rt-speak-sentence").length === 0, "stopping clears every highlight");
    h.remove();
  }

  /* ---- the speed pill steps a fixed ladder ---- */
  {
    // The old rule (+0.2, wrap at 1.7) drifted onto a second set of values, so
    // the same button never brought you back to the speed you had.
    const walk = (start, n) => { const out = []; let r = start; for (let k = 0; k < n; k++) { r = S.nextTtsRate(r); out.push(r); } return out; };
    const fromOne = walk(1.0, S.TTS_RATE_STEPS.length);
    const fromElsewhere = walk(1.35, S.TTS_RATE_STEPS.length);
    assert(
      JSON.stringify([...fromOne].sort((a, b) => a - b)) === JSON.stringify([...S.TTS_RATE_STEPS].sort((a, b) => a - b)),
      "cycling the speed visits every rung of the ladder and no other value",
    );
    assert(
      JSON.stringify([...fromElsewhere].sort((a, b) => a - b)) === JSON.stringify([...fromOne].sort((a, b) => a - b)),
      "the speed cycle does not drift with where you started",
    );
    assert(S.nextTtsRate(S.TTS_RATE_STEPS[S.TTS_RATE_STEPS.length - 1]) === S.TTS_RATE_STEPS[0], "the top rung wraps to the bottom");
    assert(S.formatRate(1.35) === "1.35×" && S.formatRate(1.5) === "1.5×", "a rate is never rounded to a value the ladder cannot reach");
    assert(S.TTS_RATE_STEPS.every((r) => r >= RANGES_MIN && r <= RANGES_MAX), "every rung is reachable on the slider too");
    /* normalizeProfile clamps independently of RANGES, so the two can disagree
       and the top of the ladder gets silently thrown away on save/reload. */
    const top = S.TTS_RATE_STEPS[S.TTS_RATE_STEPS.length - 1];
    assert(
      S.normalizeProfile({ ttsRate: top }).ttsRate === top,
      "the fastest rung survives normalizeProfile — the clamp agrees with the ladder",
    );
    assert(
      S.normalizeProfile({ ttsRate: RANGES_MAX + 5 }).ttsRate <= RANGES_MAX,
      "a rate beyond the slider is still clamped",
    );
  }

  /* ---- panel: tint picking without the OS colour panel ---- */
  {
    const c = buildControls({ ...S.DEFAULT_PROFILE }, () => {});
    assert(!c.panel.querySelector('input[type="color"]'), "the panel no longer opens the OS colour picker");
    assert(c.panel.querySelectorAll(".rt-swatches-custom .rt-swatch").length >= 8, "a palette of reading tints is offered instead");
    assert(c.panel.querySelector(".rt-hex"), "a hex field covers anything the palette misses");
    const widths = [...c.panel.querySelectorAll(".rt-seg button")].map((b) => b.textContent);
    assert(widths.includes("Narrow") && widths.includes("Wide"), "line width has named stops, not only a character count");
  }

  /* ---- restyle over a site already in its own dark theme ---- */
  {
    /* Wikipedia in night mode paints .vector-toc, .vector-appearance and
       .infobox-caption dark. Restyle repainted the text dark to match the tint
       and left those fills alone, so three unreadable dark-on-dark patches sat
       in the middle of a cream page. */
    const css = IP.inpageCSS({ font: "sans", fontSize: 19, lineHeight: 1.6, overlay: "cream", contrast: 100 });
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const host = document.createElement("div");
    host.innerHTML =
      '<div class="vector-toc" style="background:#27292d">Contents</div>' +
      '<div class="infobox-caption" style="background:#27292d">Clockwise: aerial view</div>' +
      '<button style="background:#202122">Appearance</button>' +
      '<pre>code block</pre><img alt="" style="background:#27292d">';
    document.documentElement.classList.add("rt-inpage");
    document.body.appendChild(host);

    const opaqueDark = (el) => {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const [r, g, b, a] = m[1].split(",").map(Number);
      if (a === 0) return false;
      return (r * 0.299 + g * 0.587 + b * 0.114) / 255 < 0.35;
    };
    assert(!opaqueDark(host.querySelector(".vector-toc")), "a page's own dark panel is cleared by the tint");
    assert(!opaqueDark(host.querySelector(".infobox-caption")), "a page's own dark caption is cleared by the tint");
    assert(!opaqueDark(host.querySelector("button")), "a dark control gets a readable surface, not dark-on-dark");
    assert(
      getComputedStyle(host.querySelector("pre")).backgroundColor !== "rgba(0, 0, 0, 0)",
      "blocks that mean something by being set apart keep a faint surface",
    );
    assert(getComputedStyle(host.querySelector("img")).backgroundColor !== "rgba(0, 0, 0, 0)", "media keeps its own painting");

    document.documentElement.classList.remove("rt-inpage");
    host.remove();
    style.remove();
  }

  /* ---- review follow-ups (Codex, PR #3) ---- */
  {
    const mk = (inner, url) => {
      const h = document.createElement("div");
      document.body.appendChild(h);
      const v = R.createReadingView(h);
      const res = v.setArticleHtml(
        '<!doctype html><html><head><title>t</title></head><body><article><h1>T</h1>' + inner + "</article></body></html>",
        url,
      );
      v.applyProfile({ ...S.DEFAULT_PROFILE });
      return { h, v, res, flow: h.querySelector(".rt-article") };
    };
    const filler = "<p>" + "Long enough prose to clear the quality gate. ".repeat(12) + "</p>";

    // A block nested in a block: the parent's own text must still be spoken.
    {
      const { h, flow } = mk(filler + "<ul><li>Parent topic<ul><li>Child detail</li></ul></li></ul>", "https://x.test/a");
      const said = [...flow.querySelectorAll(".rt-s")].map((n) => n.textContent.trim());
      assert(said.includes("Parent topic"), "a list item's own label is read, not just its children");
      assert(said.includes("Child detail"), "the nested item is read too");
      assert(flow.querySelectorAll(".rt-s .rt-s").length === 0, "and neither is wrapped twice");
      h.remove();
    }

    // Sentence mode must not concatenate a table into one malformed sentence.
    {
      const { h, v } = mk(
        filler +
          "<table><tr><th>Country</th><td>United States</td></tr><tr><th>State</th><td>California</td></tr>" +
          "<tr><th>County</th><td>Los Angeles</td></tr><tr><th>Zip</th><td>91301</td></tr></table>",
        "https://x.test/b",
      );
      v.applyProfile({ ...S.DEFAULT_PROFILE, pacing: "sentence" });
      const seen = new Set();
      for (let k = 0; k < 40; k++) {
        const t = h.querySelector(".rt-chunk-sentence");
        if (t) seen.add(t.textContent.trim());
        v.step(1);
      }
      const all = [...seen].join(" | ");
      assert(!/CountryUnited States|StatesState/.test(all), "sentence mode never mashes table cells into one run");
      assert(seen.has("Country: United States"), "a table row reads as the row it is");
      h.remove();
    }

    // The overlay stripper must not eat ordinary ids that merely start with "truste".
    {
      const { h, res } = mk(
        '<div id="trusted-experts"><p>' + "Our trusted experts explain the topic in careful detail. ".repeat(10) + "</p></div>",
        "https://x.test/c",
      );
      assert(res.quality.ok && /trusted experts/i.test(h.textContent), "an id beginning \"trusted\" is not mistaken for a consent vendor");
      h.remove();
    }

    // Topic words alone must never discard a real article.
    {
      const para =
        "We use cookies, the banner says, and then it hands you a wall of toggles. You can usually " +
        "manage your preferences from the same panel, though the reject control is buried by design.";
      const { h, res } = mk("<p>" + para + "</p><p>" + para + "</p>", "https://x.test/d");
      assert(R.consentPhraseHits(h.textContent) >= 2, "the fixture really does carry two consent topic phrases");
      assert(R.consentUiHits(h.textContent) === 0, "but none of them is consent-dialog copy");
      assert(res.quality.ok, "a short article about tracking is not thrown away for its topic");
      h.remove();
    }
    assert(
      R.consentUiHits('Do not sell my info. Customize my ad experience.') === 2,
      "consent-dialog copy is still recognised",
    );
  }

  /* ---- restyle: option rows get the control surface ---- */
  {
    const css = IP.inpageCSS({ font: "sans", fontSize: 19, lineHeight: 1.6, overlay: "cream", contrast: 100 });
    assert(/option/.test(css) && /:not\(option\)/.test(css), "option rows are excluded from the transparent sweep and given a surface");
  }

  /* ---- review follow-ups, round two (Codex, PR #3) ---- */
  {
    const mk = (inner, url, prof) => {
      const h = document.createElement("div");
      document.body.appendChild(h);
      const v = R.createReadingView(h);
      const res = v.setArticleHtml(
        '<!doctype html><html><head><title>t</title></head><body><article><h1>T</h1>' + inner + "</article></body></html>",
        url,
      );
      v.applyProfile({ ...S.DEFAULT_PROFILE, ...(prof || {}) });
      return { h, v, res, flow: h.querySelector(".rt-article") };
    };
    const filler = "<p>" + "Long enough prose to clear the quality gate. ".repeat(12) + "</p>";

    // data-i must match DOM order: screen.js addresses sentences by it, tts.js
    // collects them in DOM order, and a gap sends a click to the wrong sentence.
    {
      const { h, flow } = mk(
        filler +
          "<ul><li>Parent topic<ul><li>Child detail one.</li><li>Child detail two.</li></ul></li><li>Sibling item.</li></ul>" +
          "<table><caption>Quick facts table</caption><tr><th>Country</th><td><p>United States</p></td></tr>" +
          "<tr><th>State</th><td>California</td></tr><tr><th>County</th><td>Los Angeles</td></tr>" +
          "<tr><th>Zip</th><td>91301</td></tr></table>",
        "https://x.test/i",
      );
      const spans = [...flow.querySelectorAll(".rt-s")];
      const idx = spans.map((n) => Number(n.dataset.i));
      assert(idx.every((v, i) => v === i), "sentence indices run 0..n-1 in DOM order, with no gaps");
      // and the two addressing schemes agree on the same element
      const pick = spans[Math.floor(spans.length / 2)];
      assert(
        flow.querySelector('.rt-s[data-i="' + pick.dataset.i + '"]') === pick,
        "looking a sentence up by index returns the sentence you clicked",
      );
      h.remove();
    }

    // The folded infobox summary and the table caption are the same words.
    {
      const { h, v } = mk(
        "<table><caption>Quick facts table</caption><tr><th>a</th><td>1</td></tr><tr><th>b</th><td>2</td></tr>" +
          "<tr><th>c</th><td>3</td></tr><tr><th>d</th><td>4</td></tr></table>" + filler,
        "https://x.test/j",
        { pacing: "sentence" },
      );
      const seen = [];
      for (let k = 0; k < 8; k++) {
        const t = h.querySelector(".rt-chunk-sentence");
        if (t) seen.push(t.textContent.trim());
        v.step(1);
      }
      const hits = seen.filter((t) => t === "Quick facts table").length;
      assert(hits <= 1, "a folded table's caption is not read twice in a row");
      h.remove();
    }

    // "strictly necessary cookies" is ordinary prose in a privacy explainer.
    {
      const para =
        "A banner will tell you it is setting strictly necessary cookies, which is the one category " +
        "you cannot refuse. We use cookies here only to remember your reading settings, and nothing else.";
      const { h, res } = mk("<p>" + para + "</p><p>" + para + "</p>", "https://x.test/k");
      assert(res.quality.ok, "an explainer quoting standard banner terminology still extracts");
      h.remove();
    }

    // ...but the banner itself, which is several UI phrases at once, still doesn't.
    assert(
      R.consentUiHits("Do not sell my info. Customize my ad experience.") === 2,
      "two distinct pieces of consent-dialog copy are still recognised together",
    );
    assert(
      R.consentUiHits("The banner mentions strictly necessary cookies.") === 0,
      "banner terminology quoted in prose is not treated as dialog copy",
    );
  }

  /* ---- review follow-ups, round three (Codex, PR #3) ---- */
  {
    const mkv = (inner, url, prof) => {
      const h = document.createElement("div");
      document.body.appendChild(h);
      const v = R.createReadingView(h);
      v.setArticleHtml('<!doctype html><html><head><title>t</title></head><body><article><h1>T</h1>' + inner + "</article></body></html>", url);
      v.applyProfile({ ...S.DEFAULT_PROFILE, ...(prof || {}) });
      return h;
    };
    const prose = "<p>" + "Long enough prose to clear the quality gate and then some more. ".repeat(10) + "</p>";
    const kvTable =
      "<table><caption>Quick facts</caption><tr><th>Country</th><td>United States</td></tr>" +
      "<tr><th>State</th><td>California</td></tr><tr><th>County</th><td>Los Angeles</td></tr>" +
      "<tr><th>Zip</th><td>91301</td></tr><tr><th>Area</th><td>13 sq mi</td></tr></table>";

    // Folding is for a sidebar of facts, not for a table that IS the article.
    {
      const h = mkv(kvTable + prose, "https://x.test/info");
      assert(h.querySelector(".rt-fold"), "a key/value infobox followed by prose still folds");
      h.remove();
    }
    {
      const cmp =
        "<table><tr><th>Plan</th><th>Price</th><th>Seats</th></tr>" +
        "<tr><td>Free</td><td>0</td><td>1</td></tr><tr><td>Team</td><td>10</td><td>5</td></tr>" +
        "<tr><td>Pro</td><td>25</td><td>20</td></tr><tr><td>Max</td><td>60</td><td>99</td></tr></table>";
      const h = mkv(cmp + prose, "https://x.test/cmp");
      assert(!h.querySelector(".rt-fold"), "a comparison table is never hidden behind \"Quick facts\"");
      h.remove();
    }
    {
      const h = mkv(kvTable + "<p>Short.</p>", "https://x.test/tbl");
      assert(!h.querySelector(".rt-fold"), "a table with no article after it is the article, so it stays open");
      h.remove();
    }

    // The word mark runs at ~60Hz; it must not sweep the article every frame.
    {
      const h = document.createElement("div");
      h.innerHTML = '<div class="rt-article"><span class="rt-s"><span class="rt-w">a</span><span class="rt-w">b</span></span></div>';
      document.body.appendChild(h);
      const flow = h.querySelector(".rt-article");
      const words = [...flow.querySelectorAll(".rt-w")];
      let queries = 0;
      const real = flow.querySelectorAll.bind(flow);
      flow.querySelectorAll = (sel) => { queries++; return real(sel); };
      TTS.markWord(flow, words[0]);
      for (let k = 0; k < 60; k++) TTS.markWord(flow, words[0]);
      assert(queries <= 1, "holding on one word for a second costs one DOM query, not sixty");
      TTS.markWord(flow, words[1]);
      assert(flow.getElementsByClassName("rt-speak-word").length === 1, "moving the mark still leaves exactly one");
      assert(words[1].classList.contains("rt-speak-word"), "and it is on the current word");
      h.remove();
    }

    // Rebuilding the header action would drop focus from the button in use.
    {
      const h = document.createElement("div");
      document.body.appendChild(h);
      const v = R.createReadingView(h);
      v.setArticleHtml(ARTICLE, "https://shoreline.test/tide");
      v.setMeta({ title: "T", parts: ["x"] });
      v.setActions([{ label: "Pause", onClick: () => {} }]);
      const button = h.querySelector(".rt-doc-action");
      button.focus();
      v.setActions([{ label: "Resume", onClick: () => {} }]);
      assert(h.querySelector(".rt-doc-action") === button, "the header action is updated in place, not replaced");
      assert(document.activeElement === button, "so a keyboard user keeps focus through a pause/resume");
      assert(button.textContent === "Resume", "and the label still changes");
      h.remove();
    }

    // Overlays need an opaque fill or their text stacks on the page beneath.
    {
      const css = IP.inpageCSS({ font: "sans", fontSize: 19, lineHeight: 1.6, overlay: "cream", contrast: 100 });
      assert(/:not\(\[role="dialog"\]/.test(css), "overlays are exempt from the transparent sweep");
      assert(/\[role="menu"\][\s\S]*background-color: var\(--rt-inpage-bg\)/.test(css), "and are given the tint's own opaque surface");
    }
  }

  /* ---- line tint + word lookup ---- */
  {
    const WL = await import("../shared/wordlook.js");
    const SY = await import("../shared/syllables.js");

    /* The old hyphenation patterns mark safe line-break points, not syllables,
       and split "Calabasas" as "Cal-abasas". These are the splits a reader is
       actually taught, so they are pinned exactly. */
    const known = {
      calabasas: "ca·la·ba·sas", unbelievable: "un·be·lie·va·ble", photography: "pho·to·gra·phy",
      table: "ta·ble", computer: "com·pu·ter", syllable: "syl·la·ble", little: "lit·tle",
      apple: "ap·ple", running: "run·ning", yellow: "yel·low", dictionary: "dic·tio·na·ry",
      remember: "re·mem·ber", important: "im·por·tant", wonderful: "won·der·ful",
    };
    for (const [word, want] of Object.entries(known)) {
      assert(SY.splitWord(word).join("·") === want, `${word} splits as ${want}`);
    }
    // a silent final e is not its own syllable
    assert(SY.splitWord("make").join("·") === "make", "a silent final e does not become a syllable");

    assert(WL.syllablesOf("cat").join("") === "cat", "a one-syllable word survives intact");
    assert(WL.syllablesOf("").length === 0, "an empty word yields no syllables");
    assert(WL.syllablesOf("Calabasas,").join("") === "Calabasas", "trailing punctuation is trimmed before splitting");
    /* Every split must reassemble exactly — a lossy split would show a reader
       a word that is not the word on the page. */
    for (const w of ["photography", "rhythm", "strengths", "onomatopoeia", "queue", "mississippi", "bookkeeper", "the"]) {
      assert(WL.syllablesOf(w).join("") === w, `${w} reassembles from its syllables`);
      assert(SY.splitWord(w).join("") === w || SY.splitWord(w).length === 0, `${w} splits losslessly`);
    }
    // a word we cannot analyse is returned whole rather than mangled
    assert(SY.splitWord("42").length === 0, "a non-word is not split");

    /* Adjacent vowels that are two sounds must split; digraphs must not. */
    const hiatus = { chaos: "cha·os", lion: "li·on", poem: "po·em", poet: "po·et", radio: "ra·di·o", biology: "bi·o·lo·gy" };
    for (const [word, want] of Object.entries(hiatus)) {
      assert(SY.splitWord(word).join("·") === want, `${word} splits its vowel run as ${want}`);
    }
    for (const [word, want] of Object.entries({ field: "field", meat: "meat", queue: "queue" })) {
      assert(SY.splitWord(word).join("·") === want, `${word} keeps its vowel digraph whole`);
    }
    /* -tion / -sion / -cial are one sound: an "i" after t, s, c or x. */
    for (const [word, want] of Object.entries({ dictionary: "dic·tio·na·ry", nation: "na·tion", vision: "vi·sion", special: "spe·cial", precious: "pre·cious" })) {
      assert(SY.splitWord(word).join("·") === want, `${word} keeps its soft-i cluster whole`);
    }

    /* A separator is not a syllable. "don't" is one syllable, not three, and
       the popover renders one dot per element. */
    assert(SY.syllabify("don't").join("") === "don't", "an apostrophe survives the split");
    assert(SY.syllabify("don't").length === 1, "don't counts as one syllable, not three");
    assert(!SY.syllabify("don't").some((p) => /^[-'’]+$/.test(p)), "a separator is never its own element");
    assert(SY.syllabify("mother-in-law").join("") === "mother-in-law", "a hyphenated word reassembles exactly");
    assert(!SY.syllabify("mother-in-law").some((p) => /^[-'’]+$/.test(p)), "hyphens stay attached to their syllable");
    assert(SY.syllabify("o'clock").join("") === "o'clock", "o'clock reassembles exactly");

    /* Three separate rate clamps existed and disagreed; assert they cannot. */
    const TTSMOD = await import("../shared/tts.js");
    assert(typeof TTSMOD.markWord === "function", "tts module loads with the shared range imported");
    assert(
      S.RANGES.ttsRate.max >= S.TTS_RATE_STEPS[S.TTS_RATE_STEPS.length - 1],
      "the shared range covers the whole speed ladder",
    );

    /* A dark reading surface needs the light stops or the text disappears. */
    assert(S.isDarkSurface("#181a1d") && !S.isDarkSurface("#fbfaf7"), "surface darkness is detected");
    assert(
      Object.entries(S.LINE_TINTS).every(([k, t]) => k === "off" || (Array.isArray(t.darkStops) && t.darkStops.length === 2)),
      "every line tint carries a light set for dark surfaces",
    );
    const dh = document.createElement("div");
    document.body.appendChild(dh);
    R.applyTypography(dh, { ...S.DEFAULT_PROFILE, lineTint: "warm", overlay: "dark" });
    const onDark = dh.style.getPropertyValue("--rt-linetint-a").trim();
    R.applyTypography(dh, { ...S.DEFAULT_PROFILE, lineTint: "warm", overlay: "none" });
    const onLight = dh.style.getPropertyValue("--rt-linetint-a").trim();
    assert(onDark && onLight && onDark !== onLight, "the line tint uses different stops on a dark surface than a light one");
    assert(onDark.toLowerCase() === S.LINE_TINTS.warm.darkStops[0].toLowerCase(), "the dark surface gets the light stops");

    /* A mid-tone custom surface has no legible pair: refuse rather than paint
       text the reader cannot see. */
    for (const surface of ["#808080", "#8a7f6e"]) {
      for (const k of Object.keys(S.LINE_TINTS)) {
        if (k === "off") continue;
        assert(S.lineTintStops(k, surface) === null, `${k} is switched off on the unreadable surface ${surface}`);
      }
    }
    /* Wherever it does paint, both stops clear the body-text bar. */
    for (const surface of ["#fbfaf7", "#181a1d", "#f7f0dc", "#404040"]) {
      for (const k of Object.keys(S.LINE_TINTS)) {
        if (k === "off") continue;
        const pair = S.lineTintStops(k, surface);
        assert(
          pair && pair.every((c) => S.contrastRatio(c, surface) >= S.MIN_TINT_CONTRAST),
          `${k} clears ${S.MIN_TINT_CONTRAST}:1 on ${surface}`,
        );
      }
    }
    R.applyTypography(dh, { ...S.DEFAULT_PROFILE, lineTint: "warm", overlay: "custom", customTint: "#808080" });
    assert(
      dh.dataset.rtLineTint === "off" && !dh.style.getPropertyValue("--rt-linetint-a"),
      "an unreadable surface turns the line tint off rather than painting invisible text",
    );
    dh.remove();

    /* Inflected silent-e words are one syllable, not two. */
    for (const [w, want] of Object.entries({ baked: "baked", loved: "loved", makes: "makes", hoped: "hoped", tables: "ta·bles" })) {
      assert(SY.splitWord(w).join("·") === want, `${w} splits as ${want}`);
    }

    assert(S.LINE_TINTS.off.stops === null, "the line tint is off by default and paints nothing");
    assert(
      Object.entries(S.LINE_TINTS).every(([k, t]) => k === "off" || (Array.isArray(t.stops) && t.stops.length === 2)),
      "every line tint defines exactly two stops to cycle between",
    );
    assert(S.normalizeProfile({ lineTint: "nonsense" }).lineTint === "off", "an unknown line tint falls back to off");
    assert(S.normalizeProfile({ lineTint: "warm" }).lineTint === "warm", "a known line tint round-trips");

    const h = document.createElement("div");
    document.body.appendChild(h);
    R.applyTypography(h, { ...S.DEFAULT_PROFILE, lineTint: "cool" });
    assert(h.dataset.rtLineTint === "cool" && h.style.getPropertyValue("--rt-linetint-a"), "applying a line tint sets its stops");
    R.applyTypography(h, { ...S.DEFAULT_PROFILE, lineTint: "off" });
    assert(!h.style.getPropertyValue("--rt-linetint-a"), "turning the line tint off clears its stops");
    h.remove();
  }

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
