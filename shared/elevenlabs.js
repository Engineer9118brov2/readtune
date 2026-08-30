/*
 * ReadTune — ElevenLabs API
 *
 * Optional, opt-in read-aloud backend. The user pastes their OWN ElevenLabs API
 * key into ReadTune's settings; it is stored only in chrome.storage.local and
 * sent only to api.elevenlabs.io. Nothing here runs unless the user chooses the
 * ElevenLabs voice — the default read-aloud uses the browser's built-in speech
 * and makes no network requests.
 *
 * The /with-timestamps endpoint returns per-character start times, which is what
 * lets ReadTune highlight the exact word as the audio plays.
 */

const API = "https://api.elevenlabs.io/v1";
export const ELEVEN_ORIGIN = "https://api.elevenlabs.io/*";

/** True once the user has granted ReadTune permission to reach the API host. */
export async function hasElevenPermission() {
  try {
    return await chrome.permissions.contains({ origins: [ELEVEN_ORIGIN] });
  } catch {
    return false;
  }
}

export async function requestElevenPermission() {
  try {
    return await chrome.permissions.request({ origins: [ELEVEN_ORIGIN] });
  } catch (err) {
    console.warn("[ReadTune] ElevenLabs permission request failed:", err);
    return false;
  }
}

async function apiError(res, fallback) {
  let detail = "";
  try {
    const body = await res.json();
    detail = (body && body.detail && (body.detail.message || body.detail)) || "";
  } catch {
    /* ignore */
  }
  const s = res.status;
  let msg;
  if (s === 401 && /permission/i.test(detail)) msg = `Key is missing a permission: ${detail}`;
  else if (s === 401) msg = "That API key was rejected. Check it and paste it again.";
  else if (s === 402) msg = detail || "ElevenLabs needs a paid plan for this. Using the browser voice.";
  else if (s === 429) msg = "ElevenLabs quota used up for now. Using the browser voice.";
  else if (s === 422) msg = "ElevenLabs couldn't read that passage. Using the browser voice.";
  else msg = detail ? `ElevenLabs: ${detail}` : fallback || `ElevenLabs error (${s}).`;
  const err = new Error(msg);
  err.status = s;
  err.detail = detail;
  return err;
}

/** Validate a key and return its available voices: [{ id, name, preview }]. */
export async function fetchVoices(apiKey) {
  if (!apiKey) throw new Error("No API key");
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) throw await apiError(res, "Couldn't list your ElevenLabs voices.");
  const data = await res.json();
  return (data.voices || []).map((v) => ({
    id: v.voice_id,
    name: v.name || v.voice_id,
    preview: v.preview_url || "",
  }));
}

/** Lightweight key check that doesn't need voices_read — returns true if the key can do TTS. */
export async function keyCanSynthesize(apiKey) {
  if (!apiKey) return { ok: false, reason: "No API key." };
  // a deliberately tiny request to a premade voice id; 402 still means the key authenticates
  const res = await fetch(`${API}/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_22050_32`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ text: "ok", model_id: "eleven_flash_v2_5" }),
  }).catch(() => null);
  if (!res) return { ok: false, reason: "Couldn't reach ElevenLabs." };
  if (res.ok) return { ok: true };
  if (res.status === 402) return { ok: true, note: "free-plan" }; // authenticates, but library voices need a paid plan
  const err = await apiError(res);
  return { ok: false, reason: err.message };
}

/**
 * Synthesize one chunk of text.
 * @returns { audio: Blob, alignment: { chars: string[], starts: number[], ends: number[] } }
 */
export async function synthesize({ apiKey, voiceId, model = "eleven_flash_v2_5", text, signal }) {
  const res = await fetch(
    `${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      signal,
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1 },
      }),
    }
  );
  if (!res.ok) throw await apiError(res, "ElevenLabs couldn't generate that audio.");
  const data = await res.json();
  const bytes = base64ToBytes(data.audio_base64 || "");
  const a = data.alignment || data.normalized_alignment || {};
  return {
    audio: new Blob([bytes], { type: "audio/mpeg" }),
    alignment: {
      chars: a.characters || [],
      starts: a.character_start_times_seconds || [],
      ends: a.character_end_times_seconds || [],
    },
  };
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Binary-search the alignment for the character index playing at `t` seconds. */
export function charIndexAt(alignment, t) {
  const starts = alignment.starts;
  if (!starts || !starts.length) return -1;
  let lo = 0;
  let hi = starts.length - 1;
  if (t <= starts[0]) return 0;
  if (t >= starts[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
