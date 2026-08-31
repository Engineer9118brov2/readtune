/*
 * ReadTune — reading-settings panel
 *
 * The slide-in panel for Reader View and PDF mode. Grouped into calm collapsible
 * sections. Every change is reported to onChange() as a patch ({ key: value });
 * a reset is { __reset: true }.
 */

import { RANGES, OVERLAYS, FONTS, PACING } from "./settings.js";
import { READING_MODES, modePatch } from "./reading-modes.js";
import { formatBrowserVoiceLabel, recommendedBrowserVoices } from "./tts.js";
import { RESEARCH_FOUNDATIONS, RESEARCH_EXPERIMENTS, evidenceLevel, researchStarterPatch } from "./research.js";

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
  body.append(
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
  const customInput = el("input", { type: "color", class: "rt-color", value: state.customTint, "aria-label": "Custom tint colour" });
  customInput.addEventListener("input", () => emit({ overlay: "custom", customTint: customInput.value }));
  reg.customInput = customInput;
  secColour.append(field("Reading tint", swatchGrid), field("Custom colour", customInput));
  secColour.append(slider("contrast", SLIDERS.contrast));
  secColour.append(toggle("hideImages", "Hide images"));
  secColour.append(toggle("freezeMotion", "Freeze animations & GIFs"));

  /* ---- Focus ---- */
  const secFocus = section(sectionTitle("Focus", "personal"), false);
  secFocus.append(hint("Focus aids shine when attention drifts, even if your base profile stays simple."));
  secFocus.append(field("Keep my place", segment("focus", FOCUS_OPTS, "Focus mode")));
  const rulerRow = slider("rulerHeight", SLIDERS.rulerHeight);
  secFocus.append(rulerRow);
  reg.rulerRow = rulerRow;

  /* ---- Movement ---- */
  const secMove = section(sectionTitle("Move through the text", "strong", "Read along"), false);
  secMove.append(hint("Read aloud with highlighting is the strongest fallback when the page still feels tiring."));
  secMove.append(field("Mode", segment("pacing", PACING_OPTS, "Reading mode")));
  const wpmRow = slider("wpm", SLIDERS.wpm);
  secMove.append(wpmRow);
  reg.wpmRow = wpmRow;

  /* read-aloud: engine picker + browser voice + ElevenLabs key */
  const ttsState = { provider: "browser", hasKey: false, voices: [], voiceId: "", status: "", error: "" };

  const engineSeg = el("div", { class: "rt-seg rt-seg-wrap", role: "group", "aria-label": "Read-aloud engine" });
  const engineBtns = [
    { val: "browser", label: "Free voice" },
    { val: "elevenlabs", label: "Bring your own" },
  ].map((o) => {
    const b = el("button", { type: "button", "data-val": o.val, "aria-pressed": "false" }, o.label);
    b.addEventListener("click", () => onChange({ __tts: { provider: o.val } }));
    return b;
  });
  engineSeg.append(...engineBtns);
  reg.engineBtns = engineBtns;
  const engineRow = field("Voice source", engineSeg);
  const freeHint = el(
    "p",
    { class: "rt-panel-hint" },
    "Free voice uses your browser's built-in speech. No account, no API bill, nothing sent to our servers."
  );

  const previewBtn = (aria, patchFactory = () => ({ preview: true })) => {
    const b = el("button", { class: "rt-preview", type: "button", "aria-label": aria, title: aria }, "▶");
    b.addEventListener("click", () => onChange({ __tts: patchFactory() }));
    return b;
  };

  const browserVoiceSel = el("select", { class: "rt-select", "aria-label": "Browser voice" });
  browserVoiceSel.append(el("option", { value: "" }, "Use browser default"));
  browserVoiceSel.addEventListener("change", () => emit({ ttsVoice: browserVoiceSel.value }));
  reg.voice = browserVoiceSel;
  const browserVoiceRow = el("div", { class: "rt-field" }, [
    el("span", { class: "rt-field-label" }, "Free voice"),
    el("div", { class: "rt-voice-row" }, [
      browserVoiceSel,
      previewBtn("Preview this voice", () => ({
        preview: true,
        browserVoice: browserVoiceSel.value || browserVoiceSel.dataset.recommended || "",
      })),
    ]),
  ]);
  const browserVoiceNote = el("p", { class: "rt-panel-hint rt-panel-hint-tight" });

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
  const connectedRow = el("div", { class: "rt-field rt-tts-connected" }, [statusLine, forgetBtn]);

  const rateRow = slider("ttsRate", SLIDERS.ttsRate);

  secMove.append(engineRow, freeHint, browserVoiceRow, browserVoiceNote, keyRow, keyHint, elVoiceRow, manualVoiceRow, connectedRow, rateRow);
  Object.assign(reg, {
    engineRow,
    freeHint,
    browserVoiceRow,
    browserVoiceNote,
    keyRow,
    keyHint,
    elVoiceRow,
    manualVoiceRow,
    connectedRow,
    rateRow,
    statusLine,
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
    if (reg.modeButtons) {
      for (const b of reg.modeButtons) {
        const patch = modePatch(b.dataset.mode, state);
        const active = Object.entries(patch).every(([key, value]) => state[key] === value);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      }
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
    const canList = t.hasKey && t.voices.length > 0;
    reg.engineRow.hidden = !aloud;
    reg.freeHint.hidden = !aloud || eleven;
    reg.rateRow.hidden = !aloud;
    reg.browserVoiceRow.hidden = !aloud || eleven;
    reg.browserVoiceNote.hidden = !aloud || eleven;
    reg.keyRow.hidden = !aloud || !eleven || t.hasKey;
    reg.keyHint.hidden = !aloud || !eleven || t.hasKey;
    reg.elVoiceRow.hidden = !aloud || !eleven || !canList;
    reg.manualVoiceRow.hidden = !aloud || !eleven || !t.hasKey || canList;
    reg.connectedRow.hidden = !aloud || !eleven || !t.hasKey;
    for (const b of reg.engineBtns) b.setAttribute("aria-pressed", b.dataset.val === t.provider ? "true" : "false");
    if (t.error) {
      reg.statusLine.textContent = t.error;
      reg.statusLine.dataset.kind = "error";
    } else if (t.status === "checking") {
      reg.statusLine.textContent = "Checking your key…";
      reg.statusLine.dataset.kind = "info";
    } else if (t.note) {
      reg.statusLine.textContent = t.note;
      reg.statusLine.dataset.kind = "info";
    } else if (t.hasKey) {
      reg.statusLine.textContent = canList ? `Connected · ${t.voices.length} voices ready` : "Connected · custom voice ready";
      reg.statusLine.dataset.kind = "ok";
    } else {
      reg.statusLine.textContent = "";
    }
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
    setVoices(voices) {
      const sel = reg.voice;
      const cur = state.ttsVoice;
      const ranked = Array.isArray(voices) ? voices : [];
      const recommended = recommendedBrowserVoices(ranked, 3);
      const recommendedNames = new Set(recommended.map((voice) => voice.name));
      const deviceVoices = ranked.filter((voice) => voice.localService !== false && !recommendedNames.has(voice.name));
      const onlineVoices = ranked.filter((voice) => voice.localService === false && !recommendedNames.has(voice.name));
      sel.replaceChildren(el("option", { value: "" }, "Use browser default"));
      sel.dataset.recommended = recommended[0] ? recommended[0].name : "";

      const appendGroup = (label, items) => {
        if (!items.length) return;
        const group = el("optgroup", { label });
        for (const voice of items) group.append(el("option", { value: voice.name }, formatBrowserVoiceLabel(voice)));
        sel.append(group);
      };

      appendGroup("Best free voices", recommended);
      appendGroup("More on this device", deviceVoices);
      appendGroup("Online voices", onlineVoices);
      sel.value = cur || "";
      if (sel.value !== cur) sel.value = "";

      if (!ranked.length) {
        reg.browserVoiceNote.textContent = "This browser did not expose extra English voices here, so ReadTune will use your default voice.";
        reg.browserVoiceNote.hidden = false;
      } else if (recommended[0]) {
        reg.browserVoiceNote.textContent =
          recommended[0].localService === false
            ? `${recommended[0].name} is the strongest free voice Chrome exposed here. It may use an online engine.`
            : `${recommended[0].name} is the strongest free voice on this device right now. If you install richer system voices, ReadTune will surface them here automatically.`;
      }
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
