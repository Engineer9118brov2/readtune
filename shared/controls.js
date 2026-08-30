/*
 * ReadTune — reading-settings panel
 *
 * The slide-in panel for Reader View and PDF mode. Grouped into calm collapsible
 * sections. Every change is reported to onChange() as a patch ({ key: value });
 * a reset is { __reset: true }.
 */

import { RANGES, OVERLAYS, FONTS, PACING } from "./settings.js";

const FONT_OPTS = Object.entries(FONTS).map(([val, f]) => ({ val, label: f.label }));
const FOCUS_OPTS = [
  { val: "off", label: "Off" },
  { val: "paragraph", label: "Dim other paragraphs" },
  { val: "ruler", label: "Reading ruler" },
];
const PACING_OPTS = Object.entries(PACING).map(([val, label]) => ({ val, label }));

const SLIDERS = {
  fontSize: "Text size",
  lineHeight: "Line spacing",
  letterSpacing: "Letter spacing",
  wordSpacing: "Word spacing",
  paragraphSpacing: "Paragraph spacing",
  columnWidth: "Line width",
  bionic: "Bionic bolding",
  contrast: "Contrast",
  rulerHeight: "Ruler height",
  wpm: "Reading speed",
  ttsRate: "Voice speed",
};

function fmt(key, v) {
  const r = RANGES[key] || {};
  if (key === "bionic") return v ? `${Math.round(v)}%` : "Off";
  if (key === "fontSize") return `${Math.round(v)}px`;
  if (key === "columnWidth") return `${Math.round(v)} chars`;
  if (key === "wpm") return `${Math.round(v)} wpm`;
  if (key === "ttsRate") return `${Number(v).toFixed(1)}×`;
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

  /* ---- Text ---- */
  const secText = section("Text", true);
  secText.append(field("Font", segment("font", FONT_OPTS, "Font")));
  for (const k of ["fontSize", "lineHeight", "letterSpacing", "wordSpacing", "paragraphSpacing", "columnWidth"]) {
    secText.append(slider(k, SLIDERS[k]));
  }

  /* ---- Legibility ---- */
  const secLeg = section("Legibility");
  secLeg.append(slider("bionic", SLIDERS.bionic));
  secLeg.append(toggle("hyphenate", "Hyphenate long words"));
  secLeg.append(toggle("syllables", "Show syllable breaks"));
  secLeg.append(toggle("deItalic", "Remove italics"));

  /* ---- Colour ---- */
  const secColour = section("Colour & distractions");
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
  const customInput = el("input", { type: "color", class: "rt-color", value: state.customTint, "aria-label": "Custom tint colour" });
  customInput.addEventListener("input", () => emit({ overlay: "custom", customTint: customInput.value }));
  reg.customInput = customInput;
  secColour.append(field("Reading tint", swatchGrid), field("Custom colour", customInput));
  secColour.append(slider("contrast", SLIDERS.contrast));
  secColour.append(toggle("hideImages", "Hide images"));
  secColour.append(toggle("freezeMotion", "Freeze animations & GIFs"));

  /* ---- Focus ---- */
  const secFocus = section("Focus");
  secFocus.append(field("Keep my place", segment("focus", FOCUS_OPTS, "Focus mode")));
  const rulerRow = slider("rulerHeight", SLIDERS.rulerHeight);
  secFocus.append(rulerRow);
  reg.rulerRow = rulerRow;

  /* ---- Movement ---- */
  const secMove = section("Move through the text");
  secMove.append(field("Mode", segment("pacing", PACING_OPTS, "Reading mode")));
  const wpmRow = slider("wpm", SLIDERS.wpm);
  secMove.append(wpmRow);
  reg.wpmRow = wpmRow;

  /* read-aloud: engine picker + browser voice + ElevenLabs key */
  const ttsState = { provider: "browser", hasKey: false, voices: [], voiceId: "", status: "", error: "" };

  const engineSeg = el("div", { class: "rt-seg rt-seg-wrap", role: "group", "aria-label": "Read-aloud engine" });
  const engineBtns = [
    { val: "browser", label: "Browser voice" },
    { val: "elevenlabs", label: "ElevenLabs" },
  ].map((o) => {
    const b = el("button", { type: "button", "data-val": o.val, "aria-pressed": "false" }, o.label);
    b.addEventListener("click", () => onChange({ __tts: { provider: o.val } }));
    return b;
  });
  engineSeg.append(...engineBtns);
  reg.engineBtns = engineBtns;
  const engineRow = field("Read-aloud voice", engineSeg);

  const previewBtn = (aria) => {
    const b = el("button", { class: "rt-preview", type: "button", "aria-label": aria, title: aria }, "▶");
    b.addEventListener("click", () => onChange({ __tts: { preview: true } }));
    return b;
  };

  const browserVoiceSel = el("select", { class: "rt-select", "aria-label": "Browser voice" });
  browserVoiceSel.append(el("option", { value: "" }, "Default voice"));
  browserVoiceSel.addEventListener("change", () => emit({ ttsVoice: browserVoiceSel.value }));
  reg.voice = browserVoiceSel;
  const browserVoiceRow = el("div", { class: "rt-field" }, [
    el("span", { class: "rt-field-label" }, "Voice"),
    el("div", { class: "rt-voice-row" }, [browserVoiceSel, previewBtn("Preview this voice")]),
  ]);

  const keyInput = el("input", {
    type: "password",
    class: "rt-input",
    placeholder: "ElevenLabs API key",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "ElevenLabs API key",
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
    el("span", { class: "rt-field-label" }, "ElevenLabs API key"),
    el("div", { class: "rt-key-row" }, [keyInput, keySave]),
  ]);
  const keyHint = el(
    "p",
    { class: "rt-panel-hint" },
    "Your key is stored only in this browser and sent only to ElevenLabs. Free tier ≈ 10k characters / month. ElevenLabs accounts are 18+ (13+ with a parent)."
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

  const forgetBtn = el("button", { class: "rt-link", type: "button" }, "Remove key");
  forgetBtn.addEventListener("click", () => onChange({ __tts: { forget: true } }));
  const statusLine = el("p", { class: "rt-tts-status", role: "status" });
  const connectedRow = el("div", { class: "rt-field rt-tts-connected" }, [statusLine, forgetBtn]);

  const rateRow = slider("ttsRate", SLIDERS.ttsRate);

  secMove.append(engineRow, browserVoiceRow, keyRow, keyHint, elVoiceRow, connectedRow, rateRow);
  Object.assign(reg, {
    engineRow, browserVoiceRow, keyRow, keyHint, elVoiceRow, connectedRow, rateRow, statusLine, ttsState,
  });

  body.append(el("p", { class: "rt-panel-hint" }, "Everything saves automatically and applies across ReadTune."));
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
    paint();
    onChange(patch);
  }

  function paint() {
    for (const [key, btns] of Object.entries(reg.seg)) {
      for (const b of btns) b.setAttribute("aria-pressed", b.dataset.val === state[key] ? "true" : "false");
    }
    for (const b of reg.swatch) b.setAttribute("aria-pressed", b.dataset.val === state.overlay ? "true" : "false");
    reg.customInput.value = state.customTint || "#eef3f8";
    for (const [key, input] of Object.entries(reg.toggle)) input.checked = !!state[key];
    for (const [key, { input, valEl }] of Object.entries(reg.slider)) {
      input.value = String(state[key]);
      valEl.textContent = fmt(key, state[key]);
    }
    // contextual rows
    reg.rulerRow.hidden = state.focus !== "ruler";
    const isPaced = state.pacing === "word" || state.pacing === "scroll";
    reg.wpmRow.hidden = !isPaced;
    paintTTS();
  }

  function paintTTS() {
    const t = reg.ttsState;
    const aloud = state.pacing === "aloud";
    const eleven = t.provider === "elevenlabs";
    reg.engineRow.hidden = !aloud;
    reg.rateRow.hidden = !aloud;
    reg.browserVoiceRow.hidden = !aloud || eleven;
    reg.keyRow.hidden = !aloud || !eleven || t.hasKey;
    reg.keyHint.hidden = !aloud || !eleven || t.hasKey;
    reg.elVoiceRow.hidden = !aloud || !eleven || !t.hasKey;
    reg.connectedRow.hidden = !aloud || !eleven || !t.hasKey;
    for (const b of reg.engineBtns) b.setAttribute("aria-pressed", b.dataset.val === t.provider ? "true" : "false");
    if (t.error) {
      reg.statusLine.textContent = t.error;
      reg.statusLine.dataset.kind = "error";
    } else if (t.status === "checking") {
      reg.statusLine.textContent = "Checking your key…";
      reg.statusLine.dataset.kind = "info";
    } else if (t.hasKey) {
      reg.statusLine.textContent = `Connected · ${t.voices.length} voices`;
      reg.statusLine.dataset.kind = "ok";
    } else {
      reg.statusLine.textContent = "";
    }
    if (eleven && t.voices.length) {
      const cur = t.voiceId || reg.elVoice.value;
      reg.elVoice.replaceChildren(...t.voices.map((v) => el("option", { value: v.id }, v.name)));
      reg.elVoice.value = cur || t.voices[0].id;
    }
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
    setVoices(voices) {
      const sel = reg.voice;
      const cur = state.ttsVoice;
      sel.replaceChildren(el("option", { value: "" }, "Default voice"));
      for (const v of voices) sel.append(el("option", { value: v.name }, `${v.name}${v.localService ? "" : " (online)"}`));
      sel.value = cur || "";
    },
    /** screen.js pushes ElevenLabs state here: { provider, hasKey, voices, voiceId, status, error }. */
    setTTS(next) {
      Object.assign(reg.ttsState, next);
      if ("error" in next && !next.error) reg.ttsState.error = "";
      if (next.status === "ok") reg.ttsState.error = "";
      paintTTS();
    },
  };
}
