/*
 * ReadTune — settings & storage
 *
 * One reading "profile" is the single source of truth for how every screen in
 * the extension renders text. It is seeded by the calibration test and can be
 * fine-tuned by hand. Stored with chrome.storage.local so it survives across
 * tabs and restarts, with no login.
 */

import { RESEARCH_STARTER_PROFILE } from "./research.js";
import { DEFAULT_RULER_LINES, inferLegacyRulerLines, normalizeRulerLines, rulerSpanLabel } from "./ruler.js";

export const PROFILE_KEY = "readtune_profile";
export const HISTORY_KEY = "readtune_calibrations";
export const ARTICLE_KEY = "readtune_article";
export const SITES_KEY = "readtune_sites"; // per-origin: { autoOpen, autoStyle }
export const MARKS_PREFIX = "readtune_mark:"; // per-URL resume + highlights
export const TTS_KEY = "readtune_tts"; // read-aloud engine config (incl. the user's own API key)
export const SETUP_KEY = "readtune_setup"; // lightweight onboarding progress for guided setup

export const FONTS = {
  sans: { label: "System Sans", stack: 'var(--rt-reading-font)' },
  dyslexic: { label: "OpenDyslexic", stack: '"OpenDyslexic", var(--rt-ui-font)' },
  atkinson: { label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible", var(--rt-ui-font)' },
  lexend: { label: "Lexend", stack: '"Lexend", var(--rt-ui-font)' },
};

/** Reading-tint presets. Deliberately low-contrast and calm. */
/* A colour that changes from line to line gives the eye something to follow
   back to the left margin — the return sweep is where a line gets skipped or
   re-read. Popularised by BeeLine Reader. Evidence is real but modest, so this
   ships labelled "mixed", off by default, like the other legibility tools. */
export const LINE_TINTS = {
  off: { label: "Off", stops: null, darkStops: null },
  warm: { label: "Warm", stops: ["#1d2b3a", "#7a3312"], darkStops: ["#cfd9e6", "#f0b183"] },
  cool: { label: "Cool", stops: ["#14313f", "#3c2a63"], darkStops: ["#bfe0ea", "#c3b4ef"] },
  mono: { label: "Grey", stops: ["#1d1f22", "#5c6169"], darkStops: ["#eceef2", "#a8aeb8"] },
};

/** True when a reading surface is dark enough to need the light stops. */
export function isDarkSurface(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(hex || ""))) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 < 140;
}

/* WCAG relative luminance and contrast — the line tint replaces the article's
   ink outright, so its stops have to clear the same bar body text does. */
function relLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a, b) {
  if (!/^#[0-9a-fA-F]{6}$/.test(a) || !/^#[0-9a-fA-F]{6}$/.test(b)) return 1;
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Minimum contrast for normal body text. */
export const MIN_TINT_CONTRAST = 4.5;

/**
 * The stop pair to use on a given surface, or null when neither pair is
 * legible there.
 *
 * A binary dark/light choice is not enough once custom colours are in play: a
 * mid-tone surface like #808080 counts as "dark", and the light pair then sits
 * at about 2.1:1 on it — the gradient makes the article harder to read, which
 * is the opposite of the point. Measure both pairs and refuse rather than
 * hand back something unreadable.
 */
export function lineTintStops(tintKey, surface) {
  const tint = LINE_TINTS[tintKey];
  if (!tint || !tint.stops) return null;
  const candidates = [tint.stops, tint.darkStops].filter(Boolean);
  let best = null;
  for (const pair of candidates) {
    const worst = Math.min(contrastRatio(pair[0], surface), contrastRatio(pair[1], surface));
    if (!best || worst > best.worst) best = { pair, worst };
  }
  return best && best.worst >= MIN_TINT_CONTRAST ? best.pair : null;
}

export const OVERLAYS = {
  none: { label: "None", surface: "#fbfaf7", ink: "#242320", faint: "#e7e4dc" },
  cream: { label: "Cream", surface: "#f7f0dc", ink: "#302a1b", faint: "#e6ddc2" },
  peach: { label: "Peach", surface: "#faeee6", ink: "#3a2b22", faint: "#ecd9cc" },
  yellow: { label: "Yellow", surface: "#fbf3cc", ink: "#332f18", faint: "#efe4a8" },
  green: { label: "Mint", surface: "#e6f1e6", ink: "#20301f", faint: "#cfe2cf" },
  blue: { label: "Blue", surface: "#e3eef6", ink: "#1d2b33", faint: "#cfe0ec" },
  rose: { label: "Rose", surface: "#f7e9ee", ink: "#342029", faint: "#ecd2dc" },
  grey: { label: "Grey", surface: "#eceae6", ink: "#2a2a28", faint: "#dad7d1" },
  dark: { label: "Dark", surface: "#181a1d", ink: "#d9d7d1", faint: "#33363b" },
  custom: { label: "Custom", surface: "#eef3f8", ink: "#1f2937", faint: "#d7e2ec" },
};

export const PACING = {
  flow: "Scroll normally",
  sentence: "One sentence at a time",
  word: "One word at a time (speed reader)",
  scroll: "Auto-scroll",
  aloud: "Read aloud to me",
};

export const DEFAULT_PROFILE = {
  ...RESEARCH_STARTER_PROFILE,
  // Render ReadTune's own chrome (menus, buttons, transport, toasts) in
  // OpenDyslexic, so a reader who needs that font can operate the controls,
  // not only the article text. Kept out of RESEARCH_STARTER_PROFILE so the
  // "research starter" button never flips it.
  dyslexicUiMode: false,
  // BeeLine-style per-line colour cycle. Off by default; see LINE_TINTS.
  lineTint: "off",
};

// Pacing is a mode, not a durable trait. New reading surfaces should always
// open in normal flow unless the user switches mode for that session.
const SESSION_ONLY_PROFILE_KEYS = new Set(["pacing"]);

export const RANGES = {
  fontSize: { min: 15, max: 30, step: 1 },
  lineHeight: { min: 1.3, max: 2.6, step: 0.05 },
  letterSpacing: { min: 0, max: 0.22, step: 0.01, unit: "em" },
  wordSpacing: { min: 0, max: 0.7, step: 0.02, unit: "em" },
  paragraphSpacing: { min: 0.6, max: 2.6, step: 0.1 },
  columnWidth: { min: 40, max: 92, step: 1 },
  bionic: { min: 0, max: 70, step: 5, unit: "%" },
  contrast: { min: 78, max: 100, step: 1, unit: "%" },
  rulerHeight: { min: 24, max: 80, step: 2, unit: "px" },
  wpm: { min: 120, max: 700, step: 10 },
  ttsRate: { min: 0.6, max: 3, step: 0.05, unit: "×" },
};

/* The speed pill steps through these and nothing else.
 *
 * It used to add 0.2 and wrap at 1.7, which drifts: starting from 1.0 you get
 * 1.0 1.2 1.4 1.6 1.8 then 0.7 0.9 1.1 1.3 … so the same button never returns
 * you to the speed you had. The steps are also tighter around 1× where a small
 * change in rate is most audible, and open up higher where it is not. */
export const TTS_RATE_STEPS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5, 1.75, 2.0, 2.5, 3.0];

/** The next rate on the ladder, wrapping — never a drifting offset. */
export function nextTtsRate(current) {
  const now = Number(current) || 1;
  return TTS_RATE_STEPS.find((v) => v > now + 0.001) ?? TTS_RATE_STEPS[0];
}

/** 1.5 → "1.5×", 1.35 → "1.35×" — never round a rate into a number we don't use. */
export function formatRate(v) {
  return `${Number((Number(v) || 1).toFixed(2))}×`;
}

/** The one voice-speed clamp. Every surface that applies a rate — the engine,
 *  the Lab preview, the reading-screen preview — must go through this so the
 *  number the reader sees is the speed they get. */
export const clampRate = (v) => Math.min(RANGES.ttsRate.max, Math.max(RANGES.ttsRate.min, Number(v) || 1));

const clampNum = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Clamp / coerce / migrate an arbitrary object into a valid profile. */
export function normalizeProfile(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const p = { ...DEFAULT_PROFILE, ...src };

  // migrate legacy fields
  if (src.chunked === true && !src.pacing) p.pacing = "sentence";
  if (src.font === "opendyslexic") p.font = "dyslexic";
  if (!("rulerLines" in src) && "rulerHeight" in src) {
    p.rulerLines = inferLegacyRulerLines(src.rulerHeight, DEFAULT_PROFILE.rulerLines || DEFAULT_RULER_LINES);
  }

  p.font = FONTS[p.font] ? p.font : "sans";
  p.overlay = OVERLAYS[p.overlay] ? p.overlay : "none";
  p.pacing = PACING[p.pacing] ? p.pacing : "flow";
  p.focus = ["off", "paragraph", "ruler"].includes(p.focus) ? p.focus : "off";
  p.rulerLines = normalizeRulerLines(p.rulerLines, DEFAULT_PROFILE.rulerLines || DEFAULT_RULER_LINES);
  p.hyphenate = !!p.hyphenate;
  p.syllables = !!p.syllables;
  p.deItalic = !!p.deItalic;
  p.hideImages = !!p.hideImages;
  p.freezeMotion = !!p.freezeMotion;
  p.dyslexicUiMode = !!p.dyslexicUiMode;
  p.lineTint = LINE_TINTS[p.lineTint] ? p.lineTint : "off";
  if (!/^#[0-9a-fA-F]{6}$/.test(String(p.customTint || ""))) p.customTint = DEFAULT_PROFILE.customTint;

  p.fontSize = clampNum(p.fontSize, 13, 34, DEFAULT_PROFILE.fontSize);
  p.lineHeight = clampNum(p.lineHeight, 1.1, 3, DEFAULT_PROFILE.lineHeight);
  p.letterSpacing = clampNum(p.letterSpacing, 0, 0.35, 0);
  p.wordSpacing = clampNum(p.wordSpacing, 0, 1, 0);
  p.paragraphSpacing = clampNum(p.paragraphSpacing, 0.4, 3.2, 1);
  p.columnWidth = clampNum(p.columnWidth, 34, 110, DEFAULT_PROFILE.columnWidth);
  p.contrast = clampNum(p.contrast, 70, 100, 100);
  p.rulerHeight = clampNum(p.rulerHeight, 20, 100, DEFAULT_PROFILE.rulerHeight);
  p.wpm = clampNum(p.wpm, 90, 900, DEFAULT_PROFILE.wpm);
  p.ttsRate = clampNum(p.ttsRate, RANGES.ttsRate.min, RANGES.ttsRate.max, 1);
  const bionic = Number(p.bionic);
  p.bionic = Number.isFinite(bionic) && bionic >= 10 ? Math.min(70, bionic) : 0;

  // keep only known keys
  const out = {};
  for (const k of Object.keys(DEFAULT_PROFILE)) out[k] = p[k];
  return out;
}

export async function loadProfile() {
  try {
    const got = await chrome.storage.local.get(PROFILE_KEY);
    return persistedProfile(got && got[PROFILE_KEY]);
  } catch (err) {
    console.warn("[ReadTune] loadProfile failed — using defaults:", err);
    return { ...DEFAULT_PROFILE };
  }
}

export async function hasProfile() {
  try {
    const got = await chrome.storage.local.get(PROFILE_KEY);
    return !!(got && got[PROFILE_KEY]);
  } catch (err) {
    console.warn("[ReadTune] hasProfile check failed:", err);
    return false;
  }
}

export async function saveProfile(patch) {
  try {
    const current = await loadProfile();
    const next = persistedProfile({ ...current, ...patch });
    await chrome.storage.local.set({ [PROFILE_KEY]: next });
    return next;
  } catch (err) {
    console.warn("[ReadTune] saveProfile failed:", err);
    return null;
  }
}

export async function writeProfile(profile) {
  const next = persistedProfile(profile);
  try {
    await chrome.storage.local.set({ [PROFILE_KEY]: next });
  } catch (err) {
    console.warn("[ReadTune] writeProfile failed:", err);
    return null;
  }
  return next;
}

export async function clearProfile() {
  try {
    await chrome.storage.local.remove(PROFILE_KEY);
    return true;
  } catch (err) {
    console.warn("[ReadTune] clearProfile failed:", err);
    return false;
  }
}

/* ---- calibration history ---- */

export async function appendCalibration(entry) {
  try {
    const got = await chrome.storage.local.get(HISTORY_KEY);
    const list = Array.isArray(got && got[HISTORY_KEY]) ? got[HISTORY_KEY] : [];
    list.push({ at: Date.now(), ...entry });
    await chrome.storage.local.set({ [HISTORY_KEY]: list.slice(-10) });
    return list;
  } catch (err) {
    console.warn("[ReadTune] appendCalibration failed:", err);
    return [];
  }
}

export async function loadCalibrations() {
  try {
    const got = await chrome.storage.local.get(HISTORY_KEY);
    return Array.isArray(got && got[HISTORY_KEY]) ? got[HISTORY_KEY] : [];
  } catch (err) {
    console.warn("[ReadTune] loadCalibrations failed:", err);
    return [];
  }
}

/* ---- per-URL memory: resume position + highlights ---- */

export async function loadPageMemory(url) {
  const key = MARKS_PREFIX + normalizeUrl(url);
  try {
    const got = await chrome.storage.local.get(key);
    return got && got[key] ? got[key] : { scroll: 0, highlights: [] };
  } catch (err) {
    console.warn("[ReadTune] loadPageMemory failed:", err);
    return { scroll: 0, highlights: [] };
  }
}

export async function savePageMemory(url, memory) {
  const key = MARKS_PREFIX + normalizeUrl(url);
  try {
    if (!memory || (!memory.scroll && !(memory.highlights || []).length)) {
      await chrome.storage.local.remove(key);
    } else {
      await chrome.storage.local.set({ [key]: { ...memory, at: Date.now() } });
    }
    return true;
  } catch (err) {
    console.warn("[ReadTune] savePageMemory failed:", err);
    return false;
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).slice(0, 300);
  } catch {
    return String(url || "").slice(0, 300);
  }
}

/* ---- per-site settings (auto-open Reader View / auto-restyle in place) ---- */

export async function loadSites() {
  try {
    const got = await chrome.storage.local.get(SITES_KEY);
    return got && got[SITES_KEY] ? got[SITES_KEY] : {};
  } catch (err) {
    console.warn("[ReadTune] loadSites failed:", err);
    return {};
  }
}

export function siteAutomationMode(site) {
  if (site && site.autoOpen) return "open";
  if (site && site.autoStyle) return "style";
  return "off";
}

async function writeSite(origin, patch = {}) {
  try {
    const sites = await loadSites();
    const current = sites[origin] || {};
    const next = { ...current, ...patch };
    for (const key of Object.keys(next)) {
      if (!next[key]) delete next[key];
    }
    if (Object.keys(next).length) sites[origin] = next;
    else delete sites[origin];
    await chrome.storage.local.set({ [SITES_KEY]: sites });
    return sites;
  } catch (err) {
    console.warn("[ReadTune] writeSite failed:", err);
    return null;
  }
}

export function setSiteAutomation(origin, mode) {
  if (mode === "open") return writeSite(origin, { autoOpen: true, autoStyle: false });
  if (mode === "style") return writeSite(origin, { autoOpen: false, autoStyle: true });
  return writeSite(origin, { autoOpen: false, autoStyle: false });
}

export const setSiteAutoOpen = (origin, on) => writeSite(origin, { autoOpen: !!on });
export const setSiteAutoStyle = (origin, on) => writeSite(origin, { autoStyle: !!on });

/* ---- read-aloud engine config (browser voice, or the user's ElevenLabs key) ---- */

export const DEFAULT_TTS = {
  provider: "piper", // "piper" | "elevenlabs" — Piper (on-device) is the built-in read-aloud engine
  apiKey: "", // the user's own ElevenLabs key — stored here only, never in a file or the profile
  voiceId: "", // ElevenLabs voice id
  voiceName: "",
  model: "eleven_flash_v2_5",
  voices: [], // cached [{id,name}] for the picker
  piperVoice: "en_US-ljspeech-medium", // bundled, public-domain — no download on first use
};

// Voices dropped for licensing (Blizzard research-only / CC-BY-NC) or quality.
const RETIRED_PIPER_VOICES = new Set([
  "en_US-amy-low",
  "en_US-lessac-medium",
  "en_US-amy-medium",
  "en_US-ryan-medium",
]);

export async function loadTTSConfig() {
  try {
    const got = await chrome.storage.local.get(TTS_KEY);
    const config = { ...DEFAULT_TTS, ...(got && got[TTS_KEY] ? got[TTS_KEY] : {}) };
    // Move readers off retired voices onto the bundled public-domain default.
    if (RETIRED_PIPER_VOICES.has(config.piperVoice)) config.piperVoice = DEFAULT_TTS.piperVoice;
    // Read-aloud has one engine now; anything that isn't ElevenLabs is Piper.
    if (config.provider === "browser") config.provider = "piper";
    return config;
  } catch (err) {
    console.warn("[ReadTune] loadTTSConfig failed:", err);
    return { ...DEFAULT_TTS };
  }
}

export async function saveTTSConfig(patch) {
  try {
    const cur = await loadTTSConfig();
    const next = { ...cur, ...patch };
    if (next.provider !== "elevenlabs" && !patch.apiKey && patch.provider) {
      // switching away from ElevenLabs keeps the key so the user doesn't have to re-paste
    }
    await chrome.storage.local.set({ [TTS_KEY]: next });
    return next;
  } catch (err) {
    console.warn("[ReadTune] saveTTSConfig failed:", err);
    return null;
  }
}

export async function forgetTTSKey() {
  try {
    const cur = await loadTTSConfig();
    await chrome.storage.local.set({
      [TTS_KEY]: { ...cur, provider: "piper", apiKey: "", voiceId: "", voiceName: "", voices: [] },
    });
    return true;
  } catch (err) {
    console.warn("[ReadTune] forgetTTSKey failed:", err);
    return false;
  }
}

/* ---- guided setup progress ---- */

export const DEFAULT_SETUP = {
  calibratedAt: 0,
  voiceFitAt: 0,
};

function normalizeSetup(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const clean = {};
  for (const key of Object.keys(DEFAULT_SETUP)) {
    const val = Number(src[key]);
    clean[key] = Number.isFinite(val) && val > 0 ? Math.round(val) : 0;
  }
  return clean;
}

export async function loadSetup() {
  try {
    const got = await chrome.storage.local.get(SETUP_KEY);
    return normalizeSetup(got && got[SETUP_KEY]);
  } catch (err) {
    console.warn("[ReadTune] loadSetup failed:", err);
    return { ...DEFAULT_SETUP };
  }
}

export async function saveSetup(patch) {
  try {
    const current = await loadSetup();
    const next = normalizeSetup({ ...current, ...(patch || {}) });
    await chrome.storage.local.set({ [SETUP_KEY]: next });
    return next;
  } catch (err) {
    console.warn("[ReadTune] saveSetup failed:", err);
    return null;
  }
}

export async function markSetupStep(step) {
  const at = Date.now();
  if (step === "calibrated") return saveSetup({ calibratedAt: at });
  if (step === "voiceFit") return saveSetup({ voiceFitAt: at });
  return loadSetup();
}

/* ---- article hand-off ---- */

export async function stashArticle(payload) {
  try {
    if (chrome.storage.session) {
      await chrome.storage.session.set({ [ARTICLE_KEY]: payload });
      return "session";
    }
  } catch (err) {
    console.warn("[ReadTune] stashArticle(session) failed, trying local:", err);
  }
  try {
    await chrome.storage.local.set({ [ARTICLE_KEY]: payload });
    return "local";
  } catch (err) {
    console.warn("[ReadTune] stashArticle(local) failed:", err);
    return null;
  }
}

export async function takeArticle() {
  for (const area of ["session", "local"]) {
    try {
      const store = chrome.storage[area];
      if (!store) continue;
      const got = await store.get(ARTICLE_KEY);
      if (got && got[ARTICLE_KEY]) {
        await store.remove(ARTICLE_KEY).catch(() => {});
        return got[ARTICLE_KEY];
      }
    } catch (err) {
      console.warn(`[ReadTune] takeArticle(${area}) failed:`, err);
    }
  }
  return null;
}

/* ---- helpers ---- */

/**
 * Toggle the OpenDyslexic UI-chrome class on <html>. theme.css keys the
 * `--rt-ui-font` / `--rt-ui-display` swap off `:root.rt-ui-dyslexic`, so this
 * one line reskins every menu, button, transport bar, and toast on the page.
 */
export function applyDyslexicUi(on) {
  try {
    document.documentElement.classList.toggle("rt-ui-dyslexic", !!on);
  } catch {
    /* no document (tests importing the module head-less) — nothing to do */
  }
}

/** Read the saved preference and apply it. For entry points that don't already
 *  hold a loaded profile (popup, lab, calibration, the reader/PDF landing pages). */
export async function applyStoredDyslexicUi() {
  try {
    const p = await loadProfile();
    applyDyslexicUi(p.dyslexicUiMode);
  } catch {
    /* storage blocked — leave the default (standard UI font) in place */
  }
}

export function extUrl(path) {
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return path;
  }
}

export function describeProfile(p) {
  const bits = [];
  bits.push((FONTS[p.font] || FONTS.sans).label);
  bits.push(`${p.fontSize}px`);
  if (p.bionic) bits.push(`bionic ${p.bionic}%`);
  if (p.hyphenate) bits.push("hyphenated");
  if (p.pacing && p.pacing !== "flow") bits.push(PACING[p.pacing].toLowerCase());
  if (p.focus === "ruler") bits.push(`${rulerSpanLabel(p.rulerLines)} focus`);
  else if (p.focus !== "off") bits.push(`${p.focus} focus`);
  if (p.overlay !== "none") bits.push(`${(OVERLAYS[p.overlay] || {}).label || ""} tint`.trim());
  return bits.filter(Boolean).join(" · ");
}

function persistedProfile(raw) {
  const next = normalizeProfile(raw);
  for (const key of SESSION_ONLY_PROFILE_KEYS) next[key] = DEFAULT_PROFILE[key];
  return next;
}
