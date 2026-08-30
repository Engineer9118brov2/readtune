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
  const voiceSel = el("select", { class: "rt-select", "aria-label": "Voice" });
  voiceSel.append(el("option", { value: "" }, "Default voice"));
  voiceSel.addEventListener("change", () => emit({ ttsVoice: voiceSel.value }));
  reg.voice = voiceSel;
  const voiceRow = field("Voice", voiceSel);
  const rateRow = slider("ttsRate", SLIDERS.ttsRate);
  secMove.append(voiceRow, rateRow);
  reg.voiceRow = voiceRow;
  reg.rateRow = rateRow;

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
    reg.voiceRow.hidden = state.pacing !== "aloud";
    reg.rateRow.hidden = state.pacing !== "aloud";
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
  };
}
