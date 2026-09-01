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
  const R = await import("../shared/render.js");
  const { buildControls } = await import("../shared/controls.js");
  const { createReadingScreen } = await import("../shared/screen.js");
  const { extractPdfText, itemsToParagraphs } = await import("../shared/pdftext.js");
  const { createReadingAids } = await import("../shared/aids.js");
  const TTS = await import("../shared/tts.js");
  const EL = await import("../shared/elevenlabs.js");
  const IP = await import("../shared/inpage-style.js");
  const RU = await import("../shared/ruler.js");
  const CS = await import("../shared/calibration-score.js");
  const CI = await import("../shared/calibration-insights.js");
  const RM = await import("../shared/reading-modes.js");
  const RS = await import("../shared/research.js");

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
  const starterControls = buildControls({ ...S.DEFAULT_PROFILE, ttsVoice: "Samantha", ttsRate: 1.2, rulerLines: 5, rulerHeight: 76 }, (p) => {
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
      starterPatch.ttsVoice === "Samantha" &&
      starterPatch.ttsRate === 1.2,
    "starter button emits starter profile"
  );

  let uiPatch = null;
  const uiControls = buildControls({ ...S.DEFAULT_PROFILE, dyslexicUiMode: true }, (p) => (uiPatch = p));
  const dysToggle = [...uiControls.panel.querySelectorAll(".rt-toggle")].find((n) =>
    /OpenDyslexic for ReadTune's menus/.test(n.textContent)
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

  assert(typeof TTS.isTTSAvailable === "function" && typeof TTS.createTTS === "function", "tts exports");
  const rankedVoices = TTS.rankBrowserVoices([
    { name: "Cloud Natural", localService: false, lang: "en-US" },
    { name: "Compact Voice", localService: true, lang: "en-US" },
    { name: "Samantha Enhanced", localService: true, lang: "en-US" },
  ]);
  assert(rankedVoices[0].name === "Samantha Enhanced", "local enhanced voice ranks first");
  assert(TTS.recommendedBrowserVoices(rankedVoices, 2)[0].name === "Samantha Enhanced", "recommended browser voice prefers local natural voices");
  assert(TTS.formatBrowserVoiceLabel({ name: "Samantha", localService: true }) === "Samantha (On this device)", "browser voice label explains source");
  assert(/strong free local pick/i.test(TTS.describeBrowserVoice({ name: "Samantha Enhanced", localService: true, lang: "en-US" })), "browser voice copy explains strong local picks");
  assert(
    TTS.hasNaturalVoice([{ name: "Samantha", localService: true }]) === false &&
      TTS.hasNaturalVoice([{ name: "Ava (Premium)", localService: true }]) === true,
    "hasNaturalVoice detects a rich local voice"
  );
  assert(/System Settings/i.test(TTS.osVoiceTip("Mac OS X").text) && TTS.osVoiceTip("Windows NT 10.0").os === "Windows", "osVoiceTip is OS-specific");
  assert(RU.measuredLineHeight({ lineHeight: "normal", fontSize: "20px" }, 30) === 27, "normal line-height expands from font size");
  assert(RU.adaptiveRulerHeight({ lineHeightPx: 34, fontSizePx: 22, baseHeight: 40 }) > RU.adaptiveRulerHeight({ lineHeightPx: 20, fontSizePx: 14, baseHeight: 40 }), "ruler height tracks text metrics");
  assert(
    RU.adaptiveRulerHeight({ lineHeightPx: 28, fontSizePx: 18, baseHeight: 40, lines: 3 }) >
      RU.adaptiveRulerHeight({ lineHeightPx: 28, fontSizePx: 18, baseHeight: 40, lines: 1 }),
    "ruler height expands with multi-line focus spans"
  );
  assert(RU.inferLegacyRulerLines(52) === 3 && RU.rulerSpanLabel(5) === "5 lines", "ruler helpers map legacy sizes and labels");

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
  await S.forgetTTSKey();
  tc = await S.loadTTSConfig();
  assert(tc.provider === "browser" && !tc.apiKey, "forgetTTSKey clears key + reverts to browser");
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

  /* ---- controls: read-aloud engine picker ---- */
  let ttsPatch = null;
  const cp = buildControls({ ...S.DEFAULT_PROFILE, pacing: "aloud" }, (p) => (ttsPatch = p));
  document.body.append(cp.panel);
  const engRow = [...cp.panel.querySelectorAll(".rt-field-label")].find((n) => /Voice source/.test(n.textContent));
  assert(engRow && !engRow.closest(".rt-field").hidden, "engine picker visible in aloud mode");
  assert(/No account, no API bill/.test(cp.panel.textContent), "browser voice is clearly free");
  cp.panel.querySelector('.rt-seg[aria-label="Read-aloud engine"] button[data-val="elevenlabs"]').click();
  assert(ttsPatch && ttsPatch.__tts && ttsPatch.__tts.provider === "elevenlabs", "engine → __tts patch");
  cp.setTTS({ provider: "elevenlabs", hasKey: true, voices: [{ id: "a", name: "Aria" }, { id: "b", name: "Bill" }], voiceId: "a", status: "ok" });
  assert(cp.reg ? true : cp.panel.querySelector(".rt-tts-connected") && !cp.panel.querySelector(".rt-tts-connected").hidden, "connected row shown when key present");
  const elSel = [...cp.panel.querySelectorAll("select")].find((s) => s.options.length === 2 && s.options[0].textContent === "Aria");
  assert(elSel, "EL voice list populated");
  cp.panel.remove();

  const originalSynth = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
  const originalUtterance = Object.getOwnPropertyDescriptor(window, "SpeechSynthesisUtterance");
  let synthCancels = 0;
  let synthSpeaks = 0;
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    getVoices: () => [{ name: "Samantha Enhanced", localService: true, lang: "en-US" }],
    speak: () => { synthSpeaks += 1; },
    cancel: () => { synthCancels += 1; },
    addEventListener: () => {},
    removeEventListener: () => {},
  } });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: function SpeechSynthesisUtterance(text) {
      this.text = text;
      this.rate = 1;
      this.lang = "en-US";
      this.voice = null;
    },
  });

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
  const preview = [...document.querySelectorAll(".rt-preview")].find((btn) => !btn.closest(".rt-field").hidden);
  preview.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(
    synthCancels >= 1 && synthSpeaks >= 2 && document.querySelector(".rt-play").textContent === "▶",
    "voice preview pauses active read-aloud"
  );
  document.querySelector(".rt-reset").click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(
    screen.getProfile().pacing === "flow" && synthCancels >= 1 && document.querySelector(".rt-transport").hidden,
    "reset stops read-aloud cleanly"
  );
  screen.destroy();
  assert(!document.querySelector(".rt-panel") && !document.querySelector(".rt-panel-toggle"), "reading screen destroy cleans up controls");
  screenSurface.remove();
  if (originalSynth) Object.defineProperty(window, "speechSynthesis", originalSynth);
  else delete window.speechSynthesis;
  if (originalUtterance) Object.defineProperty(window, "SpeechSynthesisUtterance", originalUtterance);
  else delete window.SpeechSynthesisUtterance;

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
  controls.setVoices([
    { name: "Compact Voice", localService: true, lang: "en-US" },
    { name: "Samantha Enhanced", localService: true, lang: "en-US" },
    { name: "Cloud Natural", localService: false, lang: "en-US" },
  ]);
  const browserSel = controls.panel.querySelector('select[aria-label="Browser voice"]');
  assert(browserSel && browserSel.options.length === 4, "setVoices populates grouped browser voices");
  assert(browserSel.querySelector('optgroup[label="Best free voices"]'), "browser voices surface recommended free voices first");
  assert(browserSel.dataset.recommended === "Samantha Enhanced", "best free browser voice is exposed for preview");
  assert(/strongest free voice/i.test(controls.panel.textContent), "browser voice guidance explains the recommendation");

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
