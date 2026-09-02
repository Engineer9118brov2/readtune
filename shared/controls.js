/*
 * ReadTune — reading-settings panel
 *
 * The slide-in panel for Reader View and PDF mode. Grouped into calm collapsible
 * sections. Every change is reported to onChange() as a patch ({ key: value });
 * a reset is { __reset: true }.
 */

import { RANGES, OVERLAYS, LINE_TINTS, FONTS, PACING, applyDyslexicUi, formatRate } from "./settings.js";
import { READING_MODES, modePatch } from "./reading-modes.js";
import { RULER_LINE_OPTIONS, rulerSpanLabel } from "./ruler.js";
import { RESEARCH_FOUNDATIONS, RESEARCH_EXPERIMENTS, evidenceLevel, researchStarterPatch } from "./research.js";

const FONT_OPTS = Object.entries(FONTS).map(([val, f]) => ({ val, label: f.label }));
const FOCUS_OPTS = [
  { val: "off", label: "Off" },
  { val: "paragraph", label: "Dim other paragraphs" },
  { val: "ruler", label: "Reading ruler" },
];
const RULER_SPAN_OPTS = RULER_LINE_OPTIONS.map((val) => ({ val, label: rulerSpanLabel(val) }));
const PACING_OPTS = Object.entries(PACING).map(([val, label]) => ({ val, label }));
/* Typographic measure, in characters per line. ~66 is the classic target; the
   narrow end helps readers who lose the line on long sweeps. */
/* Pale washes only — a reading tint that competes with the text defeats itself. */
const CUSTOM_TINTS = [
  { hex: "#fdf6e3", label: "Warm sand" }, { hex: "#f7f0e8", label: "Parchment" },
  { hex: "#f4efe6", label: "Oat" },       { hex: "#fdeee4", label: "Peach" },
  { hex: "#fdecec", label: "Rose" },      { hex: "#f7ecfa", label: "Lilac" },
  { hex: "#eaf1fb", label: "Sky" },       { hex: "#e6f2f1", label: "Sea glass" },
  { hex: "#ecf6e9", label: "Mint" },      { hex: "#f0f0f2", label: "Cool grey" },
  { hex: "#20242c", label: "Slate (dark)" }, { hex: "#14161a", label: "Ink (dark)" },
];

const LINE_TINT_OPTS = Object.entries(LINE_TINTS).map(([val, t]) => ({ val, label: t.label }));

const WIDTH_OPTS = [
  { val: 45, label: "Narrow" },
  { val: 58, label: "Comfort" },
  { val: 72, label: "Wide" },
  { val: 92, label: "Full" },
];

const SLIDERS = {
  fontSize: "Text size",
  lineHeight: "Line spacing",
  letterSpacing: "Letter spacing",
  wordSpacing: "Word spacing",
  paragraphSpacing: "Paragraph spacing",
  columnWidth: "Line width",
  bionic: "Bionic bolding",
  contrast: "Contrast",
  rulerHeight: "Ruler size",
  wpm: "Reading speed",
  ttsRate: "Voice speed",
};

function fmt(key, v) {
  const r = RANGES[key] || {};
  if (key === "bionic") return v ? `${Math.round(v)}%` : "Off";
  if (key === "fontSize") return `${Math.round(v)}px`;
  if (key === "columnWidth") return `${Math.round(v)} chars`;
  if (key === "wpm") return `${Math.round(v)} wpm`;
  if (key === "ttsRate") return formatRate(v);
  if (key === "contrast" || key === "rulerHeight") return `${Math.round(v)}${r.unit || ""}`;
  if (key === "lineHeight" || key === "paragraphSpacing") return Number(v).toFixed(2);
  if (r.unit === "em") return `${Number(v).toFixed(2)}em`;
  return String(v);
}

function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const c of kids == null ? [] : Array.isArray(kids) ? kids : [kids]) {
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export function buildControls(profile, onChange) {
  const state = { ...profile };
  const reg = { seg: {}, slider: {}, toggle: {}, swatch: null, voice: null };

  const toggleBtn = el(
    "button",
    { class: "rt-panel-toggle", type: "button", "aria-expanded": "false", "aria-controls": "rt-panel" },
    "Aa  Reading settings"
  );
  const panel = el("aside", { class: "rt-panel", id: "rt-panel", "aria-label": "Reading settings", hidden: true });
  const closeBtn = el("button", { class: "rt-panel-close", type: "button" }, "Done");
  const body = el("div", { class: "rt-panel-body" });
  panel.append(el("div", { class: "rt-panel-head" }, [el("b", {}, "Reading settings"), closeBtn]), body);

  const section = (title, open) => {
    const d = el("details", { class: "rt-sec", open: !!open });
    d.append(el("summary", {}, title));
    const inner = el("div", { class: "rt-sec-body" });
    d.append(inner);
    body.append(d);
    return inner;
  };

  const field = (labelNode, control) =>
    el("div", { class: "rt-field" }, [el("span", { class: "rt-field-label" }, labelNode), control]);

  const hint = (text, extraClass = "") => el("p", { class: `rt-panel-hint${extraClass ? " " + extraClass : ""}` }, text);

  function evidenceChip(level, label = "") {
    const meta = evidenceLevel(level);
    return el("span", { class: `rt-evidence-chip rt-evidence-chip-${meta.tone}` }, label || meta.label);
  }

  function sectionTitle(title, level, label = "") {
    return el("span", { class: "rt-sec-title" }, [el("span", {}, title), evidenceChip(level, label)]);
  }

  function researchCard(item) {
    return el("article", { class: "rt-research-card" }, [
      evidenceChip(item.level),
      el("strong", {}, item.title),
      el("p", {}, item.body),
    ]);
  }

  function segment(key, opts, aria) {
    const group = el("div", { class: "rt-seg rt-seg-wrap", role: "group", "aria-label": aria });
    reg.seg[key] = opts.map((o) => {
      const b = el("button", { type: "button", "data-val": o.val, "aria-pressed": "false" }, o.label);
      b.addEventListener("click", () => emit({ [key]: o.val }));
      return b;
    });
    group.append(...reg.seg[key]);
    return group;
  }

  function toggle(key, labelText) {
    const input = el("input", { type: "checkbox" });
    input.addEventListener("change", () => emit({ [key]: input.checked }));
    reg.toggle[key] = input;
    return el("label", { class: "rt-field rt-toggle" }, [
      el("span", { class: "rt-field-label" }, labelText),
      input,
      el("span", { class: "rt-switch", "aria-hidden": "true" }),
    ]);
  }

  function slider(key, labelText) {
    const r = RANGES[key];
    const valEl = el("i", { class: "rt-val" }, fmt(key, state[key]));
    const input = el("input", {
      type: "range",
      min: r.min,
      max: r.max,
      step: r.step,
      value: state[key],
      "aria-label": labelText,
    });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      valEl.textContent = fmt(key, v);
      emit({ [key]: v });
    });
    reg.slider[key] = { input, valEl };
    return el("div", { class: "rt-field" }, [
      el("span", { class: "rt-field-label" }, [document.createTextNode(labelText + " "), valEl]),
      input,
    ]);
  }

  function modeButtons() {
    const wrap = el("div", { class: "rt-mode-grid", role: "group", "aria-label": "Quick reading modes" });
    reg.modeButtons = READING_MODES.map((mode) => {
      const b = el("button", { class: "rt-mode", type: "button", "data-mode": mode.key }, [
        el("strong", {}, mode.label),
        el("span", {}, mode.blurb),
      ]);
      b.addEventListener("click", () => onChange({ __mode: mode.key }));
      wrap.appendChild(b);
      return b;
    });
    return wrap;
  }

  const researchButton = el("button", { class: "rt-btn rt-primary rt-research-btn", type: "button" }, "Use this starter");
  researchButton.addEventListener("click", () => emit(researchStarterPatch(state)));
  /* Settings people actually reach for come first. The research explainer is
     worth having and worth *reading once* — it does not need to be the first
     half-screen of the panel every single time. */
  body.append(toggle("dyslexicUiMode", "Dyslexia-friendly menus"));

  const researchDetails = el("details", { class: "rt-research-fold" });
  researchDetails.append(
    el("summary", {}, [evidenceChip("strong", "Research-backed starter"), " What tends to help most"]),
  );
  body.append(researchDetails);
  researchDetails.append(
    el("section", { class: "rt-research-box" }, [
      el("div", { class: "rt-research-top" }, [
        el("div", {}, [
          evidenceChip("strong", "Research-backed starter"),
          el("strong", { class: "rt-research-title" }, "Start with the changes that tend to help most"),
        ]),
        researchButton,
      ]),
      hint(
        "ReadTune leans on spacing, calmer contrast, shorter lines, and follow-along listening first. Fonts, tints, and bionic stay optional because the evidence there is mixed.",
        "rt-panel-hint-tight"
      ),
      el("div", { class: "rt-research-grid" }, RESEARCH_FOUNDATIONS.map(researchCard)),
      el("div", { class: "rt-research-subtle" }, [
        el("strong", {}, "Still worth testing"),
        el(
          "p",
          {},
          "Fonts, tints, bionic, and focus tools can still matter a lot for comfort. We just label them honestly instead of pretending they are universal wins."
        ),
      ]),
    ])
  );

  /* ---- Quick modes ---- */
  const secQuick = section(sectionTitle("Quick modes", "supported", "Task presets"), true);
  secQuick.append(
    hint("One click for the job you are doing right now. Your calibrated profile stays underneath.", "rt-panel-hint-tight"),
    modeButtons()
  );

  /* ---- Text ---- */
  const secText = section(sectionTitle("Text", "strong"), false);
  secText.append(hint("Spacing and line width are some of the safest levers to reach for first."));
  secText.append(field("Font", segment("font", FONT_OPTS, "Font")));
  /* Named stops first, then the slider for anything in between. Reading for
     a measure is easier than reading for a character count. */
  secText.append(field("Line width", segment("columnWidth", WIDTH_OPTS, "Line width")));
  for (const k of ["fontSize", "lineHeight", "letterSpacing", "wordSpacing", "paragraphSpacing", "columnWidth"]) {
    secText.append(slider(k, SLIDERS[k]));
  }

  /* ---- Legibility ---- */
  const secLeg = section(sectionTitle("Legibility", "mixed"), false);
  secLeg.append(hint("Helpful for some readers, but these are better treated as experiments than defaults."));
  secLeg.append(slider("bionic", SLIDERS.bionic));
  secLeg.append(toggle("hyphenate", "Hyphenate long words"));
  secLeg.append(toggle("syllables", "Show syllable breaks"));
  secLeg.append(toggle("deItalic", "Remove italics"));
  secLeg.append(field("Line tint", segment("lineTint", LINE_TINT_OPTS, "Line tint")));
  secLeg.append(
    hint(
      "Colour that shifts from line to line, so your eye has something to follow back to the left margin. " +
        "Reader View and PDFs only — it needs to repaint the text itself, which is not safe to do on a live page.",
      "rt-panel-hint-tight",
    ),
  );

  /* ---- Colour ---- */
  const secColour = section(sectionTitle("Colour & distractions", "supported", "Comfort first"), false);
  secColour.append(hint("Softer contrast is widely useful. Specific tints are more personal, so keep them optional."));
  const swatchGrid = el("div", { class: "rt-swatches", role: "group", "aria-label": "Reading tint" });
  reg.swatch = Object.entries(OVERLAYS).map(([val, o]) => {
    const b = el("button", {
      type: "button",
      class: "rt-swatch",
      "data-val": val,
      "aria-pressed": "false",
      title: o.label,
      style: `--sw:${o.surface}`,
    });
    if (val === "custom") b.textContent = "＋";
    b.addEventListener("click", () => emit({ overlay: val }));
    return b;
  });
  swatchGrid.append(...reg.swatch);
  /* Custom tint: our own soft palette plus a hex box.
     <input type="color"> handed the reader the OS colour panel — a saturated
     picker aimed at choosing paint, in the middle of a reading-comfort setting,
     where every usable answer is a pale wash. */
  const customGrid = el("div", { class: "rt-swatches rt-swatches-custom", role: "group", "aria-label": "Custom tint colour" });
  reg.customSwatch = CUSTOM_TINTS.map(({ hex, label }) => {
    const b = el("button", { type: "button", class: "rt-swatch", "data-hex": hex, "aria-pressed": "false", title: label, style: `--sw:${hex}` });
    b.addEventListener("click", () => emit({ overlay: "custom", customTint: hex }));
    return b;
  });
  customGrid.append(...reg.customSwatch);

  const hexInput = el("input", {
    type: "text", class: "rt-hex", value: state.customTint, spellcheck: "false",
    maxlength: "7", inputmode: "text", "aria-label": "Custom tint hex code", placeholder: "#eef3f8",
  });
  const commitHex = () => {
    const v = hexInput.value.trim().replace(/^#?/, "#");
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      hexInput.setAttribute("aria-invalid", "false");
      emit({ overlay: "custom", customTint: v.toLowerCase() });
    } else {
      hexInput.setAttribute("aria-invalid", "true");
    }
  };
  hexInput.addEventListener("change", commitHex);
  hexInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commitHex(); } });
  reg.customInput = hexInput;
  secColour.append(
    field("Reading tint", swatchGrid),
    field("Custom colour", customGrid),
    field("Hex code", hexInput),
  );
  secColour.append(slider("contrast", SLIDERS.contrast));
  secColour.append(toggle("hideImages", "Hide images"));
  secColour.append(toggle("freezeMotion", "Freeze animations & GIFs"));

  /* ---- Focus ---- */
  const secFocus = section(sectionTitle("Focus", "personal"), false);
  secFocus.append(hint("Focus aids shine when attention drifts, even if your base profile stays simple."));
  secFocus.append(field("Keep my place", segment("focus", FOCUS_OPTS, "Focus mode")));
  const rulerLinesRow = field("Guide span", segment("rulerLines", RULER_SPAN_OPTS, "Reading ruler span"));
  const rulerLinesHint = hint(
    "Use one line for tight tracking. Use three or five lines when you want more context without losing your place.",
    "rt-panel-hint-tight"
  );
  secFocus.append(rulerLinesRow, rulerLinesHint);
  reg.rulerLinesRow = rulerLinesRow;
  reg.rulerLinesHint = rulerLinesHint;

  /* ---- Movement ---- */
  const secMove = section(sectionTitle("Move through the text", "strong", "Read along"), false);
  secMove.append(hint("Read aloud with highlighting is the strongest fallback when the page still feels tiring."));
  secMove.append(field("Mode", segment("pacing", PACING_OPTS, "Reading mode")));
  const wpmRow = slider("wpm", SLIDERS.wpm);
  secMove.append(wpmRow);
  reg.wpmRow = wpmRow;

  /* read-aloud: engine picker + browser voice + ElevenLabs key */
  const ttsState = { provider: "piper", hasKey: false, voices: [], voiceId: "", status: "", error: "", piperProgress: null };

  const engineSeg = el("div", { class: "rt-seg rt-seg-wrap", role: "group", "aria-label": "Read-aloud engine" });
  const engineBtns = [
    { val: "piper", label: "On-device voice" },
    { val: "elevenlabs", label: "Bring your own key" },
  ].map((o) => {
    const b = el("button", { type: "button", "data-val": o.val, "aria-pressed": "false" }, o.label);
    b.addEventListener("click", () => onChange({ __tts: { provider: o.val } }));
    return b;
  });
  engineSeg.append(...engineBtns);
  reg.engineBtns = engineBtns;
  const engineRow = field("Voice source", engineSeg);
  const piperHint = el(
    "p",
    { class: "rt-panel-hint" },
    "Read-aloud uses a natural voice that runs on your device. The default voice ships with ReadTune, so it works right away and offline. Extra voices in the Reading Lab download once (~60 MB). The text you read is never uploaded."
  );

  const previewBtn = (aria, patchFactory = () => ({ preview: true })) => {
    const b = el("button", { class: "rt-preview", type: "button", "aria-label": aria, title: aria }, "▶");
    b.addEventListener("click", () => onChange({ __tts: patchFactory() }));
    return b;
  };

  const keyInput = el("input", {
    type: "password",
    class: "rt-input",
    placeholder: "Optional premium key",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Optional premium key",
  });
  const keySave = el("button", { class: "rt-btn", type: "button", style: "width:auto" }, "Save key");
  keySave.addEventListener("click", () => {
    const v = keyInput.value.trim();
    if (v) onChange({ __tts: { apiKey: v } });
    keyInput.value = "";
  });
  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") keySave.click();
  });
  const keyRow = el("div", { class: "rt-field" }, [
    el("span", { class: "rt-field-label" }, "Optional premium key"),
    el("div", { class: "rt-key-row" }, [keyInput, keySave]),
  ]);
  const keyHint = el(
    "p",
    { class: "rt-panel-hint" },
    "Optional: connect your own ElevenLabs key for a different voice. ReadTune stays free without it. The key is stored only in this browser and sent only to ElevenLabs while reading."
  );

  const elVoiceSel = el("select", { class: "rt-select", "aria-label": "ElevenLabs voice" });
  elVoiceSel.addEventListener("change", () => {
    const opt = elVoiceSel.selectedOptions[0];
    onChange({ __tts: { voiceId: elVoiceSel.value, voiceName: opt ? opt.textContent : "" } });
  });
  reg.elVoice = elVoiceSel;
  const elVoiceRow = el("div", { class: "rt-field" }, [
    el("span", { class: "rt-field-label" }, "Voice"),
    el("div", { class: "rt-voice-row" }, [elVoiceSel, previewBtn("Preview this voice")]),
  ]);

  // fallback for keys that can't list voices (missing voices_read, or free plan)
  const manualId = el("input", { type: "text", class: "rt-input", placeholder: "Voice ID", spellcheck: "false", "aria-label": "ElevenLabs voice ID" });
  const manualApply = el("button", { class: "rt-btn", type: "button", style: "width:auto" }, "Use");
  manualApply.addEventListener("click", () => {
    const v = manualId.value.trim();
    if (v) onChange({ __tts: { voiceId: v, voiceName: "Voice " + v.slice(0, 6) } });
  });
  reg.manualId = manualId;
  const manualVoiceRow = el("div", { class: "rt-field" }, [
    el("span", { class: "rt-field-label" }, "Voice ID"),
    el("div", { class: "rt-key-row" }, [manualId, manualApply, previewBtn("Preview this voice")]),
  ]);

  const forgetBtn = el("button", { class: "rt-link", type: "button" }, "Remove key");
  forgetBtn.addEventListener("click", () => onChange({ __tts: { forget: true } }));
  const statusLine = el("p", { class: "rt-tts-status", role: "status" });
  const piperProgress = el("progress", { class: "rt-tts-progress", max: "100", value: "0", hidden: true, "aria-label": "Local natural voice download progress" });
  const connectedRow = el("div", { class: "rt-field rt-tts-connected" }, [statusLine, piperProgress, forgetBtn]);

  const rateRow = slider("ttsRate", SLIDERS.ttsRate);

  secMove.append(engineRow, piperHint, keyRow, keyHint, elVoiceRow, manualVoiceRow, connectedRow, rateRow);
  Object.assign(reg, {
    engineRow,
    piperHint,
    keyRow,
    keyHint,
    elVoiceRow,
    manualVoiceRow,
    connectedRow,
    rateRow,
    statusLine,
    piperProgress,
    forgetBtn,
    ttsState,
  });

  body.append(
    hint("Everything saves automatically and applies across ReadTune."),
    el("div", { class: "rt-research-mini" }, RESEARCH_EXPERIMENTS.map(researchCard))
  );
  const resetBtn = el("button", { class: "rt-link rt-reset", type: "button" }, "Reset to defaults");
  resetBtn.addEventListener("click", () => onChange({ __reset: true }));
  body.append(resetBtn);

  /* ---- open / close ---- */
  const open = () => {
    panel.hidden = false;
    toggleBtn.setAttribute("aria-expanded", "true");
    closeBtn.focus();
  };
  const close = () => {
    panel.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.focus();
  };
  toggleBtn.addEventListener("click", () => (panel.hidden ? open() : close()));
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) close();
  });

  function emit(patch) {
    Object.assign(state, patch);
    if ("dyslexicUiMode" in patch) applyDyslexicUi(patch.dyslexicUiMode);
    paint();
    onChange(patch);
  }

  function paint() {
    for (const [key, btns] of Object.entries(reg.seg)) {
      for (const b of btns) b.setAttribute("aria-pressed", b.dataset.val === String(state[key]) ? "true" : "false");
    }
    for (const b of reg.swatch) b.setAttribute("aria-pressed", b.dataset.val === state.overlay ? "true" : "false");
    reg.customInput.value = state.customTint || "#eef3f8";
    reg.customInput.setAttribute("aria-invalid", "false");
    for (const b of reg.customSwatch) {
      b.setAttribute("aria-pressed", state.overlay === "custom" && b.dataset.hex === state.customTint ? "true" : "false");
    }
    for (const [key, input] of Object.entries(reg.toggle)) input.checked = !!state[key];
    for (const [key, { input, valEl }] of Object.entries(reg.slider)) {
      input.value = String(state[key]);
      valEl.textContent = fmt(key, state[key]);
    }
    if (reg.modeButtons) {
      for (const b of reg.modeButtons) {
        const patch = modePatch(b.dataset.mode, state);
        const active = Object.entries(patch).every(([key, value]) => state[key] === value);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
    // contextual rows
    reg.rulerLinesRow.hidden = state.focus !== "ruler";
    reg.rulerLinesHint.hidden = state.focus !== "ruler";
    const isPaced = state.pacing === "word" || state.pacing === "scroll";
    reg.wpmRow.hidden = !isPaced;
    paintTTS();
  }

  function paintTTS() {
    const t = reg.ttsState;
    const aloud = state.pacing === "aloud";
    const eleven = t.provider === "elevenlabs";
    const piper = t.provider === "piper";
    const canList = t.hasKey && t.voices.length > 0;
    reg.engineRow.hidden = !aloud;
    reg.piperHint.hidden = !aloud || !piper;
    reg.rateRow.hidden = !aloud;
    reg.keyRow.hidden = !aloud || !eleven || t.hasKey;
    reg.keyHint.hidden = !aloud || !eleven || t.hasKey;
    reg.elVoiceRow.hidden = !aloud || !eleven || !canList;
    reg.manualVoiceRow.hidden = !aloud || !eleven || !t.hasKey || canList;
    reg.connectedRow.hidden = !aloud || (!piper && (!eleven || !t.hasKey));
    reg.forgetBtn.hidden = !eleven;
    for (const b of reg.engineBtns) b.setAttribute("aria-pressed", b.dataset.val === t.provider ? "true" : "false");
    if (t.error) {
      reg.statusLine.textContent = t.error;
      reg.statusLine.dataset.kind = "error";
    } else if (t.status === "checking") {
      reg.statusLine.textContent = "Checking your key…";
      reg.statusLine.dataset.kind = "info";
    } else if (t.status) {
      reg.statusLine.textContent = t.status;
      reg.statusLine.dataset.kind = t.piperProgress === null ? "info" : "loading";
    } else if (t.note) {
      reg.statusLine.textContent = t.note;
      reg.statusLine.dataset.kind = "info";
    } else if (piper) {
      reg.statusLine.textContent = "On-device voice selected. The default voice is built into ReadTune.";
      reg.statusLine.dataset.kind = "info";
    } else if (t.hasKey) {
      reg.statusLine.textContent = canList ? `Connected · ${t.voices.length} voices ready` : "Connected · custom voice ready";
      reg.statusLine.dataset.kind = "ok";
    } else {
      reg.statusLine.textContent = "";
    }
    const showProgress = piper && Number.isFinite(t.piperProgress);
    reg.piperProgress.hidden = !showProgress;
    if (showProgress) reg.piperProgress.value = t.piperProgress;
    if (canList) {
      const cur = t.voiceId || reg.elVoice.value;
      reg.elVoice.replaceChildren(...t.voices.map((v) => el("option", { value: v.id }, v.name)));
      reg.elVoice.value = cur || t.voices[0].id;
    }
    if (t.hasKey && !canList && t.voiceId && reg.manualId.value !== t.voiceId) reg.manualId.value = t.voiceId;
  }

  paint();

  return {
    toggle: toggleBtn,
    panel,
    open,
    close,
    sync(next) {
      Object.assign(state, next);
      paint();
    },
    /** screen.js pushes ElevenLabs state here: { provider, hasKey, voices, voiceId, status, error, note }. */
    setTTS(next) {
      reg.ttsState.error = "";
      reg.ttsState.note = "";
      reg.ttsState.status = "";
      Object.assign(reg.ttsState, next);
      paintTTS();
    },
  };
}
