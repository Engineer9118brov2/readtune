/*
 * ReadTune — settings & storage
 *
 * One reading "profile" is the single source of truth for how every screen in
 * the extension renders text. It is seeded by the calibration test and can be
 * fine-tuned by hand. Stored with chrome.storage.local so it survives across
 * tabs and restarts, with no login.
 */

import { RESEARCH_STARTER_PROFILE } from "./research.js";

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

export const DEFAULT_PROFILE = { ...RESEARCH_STARTER_PROFILE };

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
  ttsRate: { min: 0.6, max: 1.8, step: 0.1, unit: "×" },
};

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

  p.font = FONTS[p.font] ? p.font : "sans";
  p.overlay = OVERLAYS[p.overlay] ? p.overlay : "none";
  p.pacing = PACING[p.pacing] ? p.pacing : "flow";
  p.focus = ["off", "paragraph", "ruler"].includes(p.focus) ? p.focus : "off";
  p.hyphenate = !!p.hyphenate;
  p.syllables = !!p.syllables;
  p.deItalic = !!p.deItalic;
  p.hideImages = !!p.hideImages;
  p.freezeMotion = !!p.freezeMotion;
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
  p.ttsRate = clampNum(p.ttsRate, 0.5, 2, 1);
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

async function setSiteFlag(origin, flag, on) {
  try {
    const sites = await loadSites();
    if (on) sites[origin] = { ...(sites[origin] || {}), [flag]: true };
    else if (sites[origin]) {
      delete sites[origin][flag];
      if (!Object.keys(sites[origin]).length) delete sites[origin];
    }
    await chrome.storage.local.set({ [SITES_KEY]: sites });
    return sites;
  } catch (err) {
    console.warn(`[ReadTune] setSiteFlag(${flag}) failed:`, err);
    return null;
  }
}

export const setSiteAutoOpen = (origin, on) => setSiteFlag(origin, "autoOpen", on);
export const setSiteAutoStyle = (origin, on) => setSiteFlag(origin, "autoStyle", on);

/* ---- read-aloud engine config (browser voice, or the user's ElevenLabs key) ---- */

export const DEFAULT_TTS = {
  provider: "browser", // "browser" | "elevenlabs"
  apiKey: "", // the user's own ElevenLabs key — stored here only, never in a file or the profile
  voiceId: "", // ElevenLabs voice id
  voiceName: "",
  model: "eleven_flash_v2_5",
  voices: [], // cached [{id,name}] for the picker
};

export async function loadTTSConfig() {
  try {
    const got = await chrome.storage.local.get(TTS_KEY);
    return { ...DEFAULT_TTS, ...(got && got[TTS_KEY] ? got[TTS_KEY] : {}) };
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
      [TTS_KEY]: { ...cur, provider: "browser", apiKey: "", voices: [] },
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
  if (p.focus !== "off") bits.push(`${p.focus} focus`);
  if (p.overlay !== "none") bits.push(`${(OVERLAYS[p.overlay] || {}).label || ""} tint`.trim());
  return bits.filter(Boolean).join(" · ");
}

function persistedProfile(raw) {
  const next = normalizeProfile(raw);
  for (const key of SESSION_ONLY_PROFILE_KEYS) next[key] = DEFAULT_PROFILE[key];
  return next;
}
