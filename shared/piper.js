/* ReadTune's on-device Piper voice client.
 *
 * Read-aloud has one engine: Piper, running locally. The default voice ships
 * inside the extension, so first-use never waits on a download or a network.
 * Every voice here is public domain or CC0 — safe to bundle and redistribute.
 * (The Piper defaults elsewhere — lessac, amy, ryan — are research- or
 * NonCommercial-licensed and are deliberately not offered.)
 */

export const PIPER_VOICES = [
  {
    id: "en_US-ljspeech-medium",
    label: "Linden",
    detail: "Clear narrator",
    bundled: true,
    downloadMB: 0,
    license: "Public domain (LJ Speech)",
  },
  {
    id: "en_US-joe-medium",
    label: "Joe",
    detail: "Low and steady",
    bundled: false,
    downloadMB: 61,
    license: "CC0 (OHF Voice)",
  },
  {
    id: "en_US-kristin-medium",
    label: "Kristin",
    detail: "Warm and even",
    bundled: false,
    downloadMB: 61,
    license: "Public domain (LibriVox)",
  },
];

export const PIPER_VOICE = PIPER_VOICES[0];

export function piperVoiceById(id) {
  return PIPER_VOICES.find((voice) => voice.id === id) || PIPER_VOICE;
}

/** A bundled voice is already on disk; only downloadable voices need the
 *  Hugging Face permission and the one-time model fetch. */
export function piperVoiceNeedsDownload(voiceOrId) {
  const voice = typeof voiceOrId === "string" ? piperVoiceById(voiceOrId) : voiceOrId;
  return !!voice && !voice.bundled;
}

const PIPER_ORIGINS = ["https://huggingface.co/*", "https://*.hf.co/*"];

export async function hasPiperPermission() {
  try {
    return await chrome.permissions.contains({ origins: PIPER_ORIGINS });
  } catch {
    return false;
  }
}

export async function requestPiperPermission() {
  try {
    return await chrome.permissions.request({ origins: PIPER_ORIGINS });
  } catch {
    return false;
  }
}

export function describePiperProgress({ loaded = 0, total = 0, phase = "" } = {}) {
  const loadedBytes = Number(loaded) || 0;
  const totalBytes = Number(total) || 0;
  if (totalBytes > 0) {
    const percent = Math.min(100, Math.max(0, Math.round((loadedBytes / totalBytes) * 100)));
    const totalMB = Math.max(1, Math.round(totalBytes / 1024 / 1024));
    return { message: `Downloading your local voice: ${percent}% of ${totalMB} MB`, percent };
  }
  if (/huggingface|\.onnx|\.json/i.test(String(phase))) {
    return { message: "Downloading your local voice…", percent: null };
  }
  return { message: "Preparing your local voice…", percent: null };
}

export function createPiperEngine({ voiceId = PIPER_VOICE.id, onStatus = () => {} } = {}) {
  let worker = null;
  let ready = null;
  let serial = 0;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("./piper/worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        const progress = describePiperProgress(data);
        onStatus({ kind: "loading", ...progress });
        return;
      }
      if (data.type === "status") {
        onStatus({ kind: data.kind || "info", message: data.message || "Preparing your local voice…", percent: null });
        return;
      }
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The natural voice couldn't start.");
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    };
    return worker;
  }

  function call(type, payload = {}) {
    const id = ++serial;
    ensureWorker().postMessage({ id, type, ...payload });
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  return {
    prepare() {
      if (!ready) ready = call("prepare", { voiceId }).then(() => undefined);
      return ready;
    },
    /* `rate` is baked into synthesis via the model's length_scale (see
       piper/worker.js), not applied as playbackRate afterwards — a resampled
       short clip sounds mushy and doesn't feel like the number on the dial. */
    async synthesize(text, { rate = 1 } = {}) {
      await this.prepare();
      const data = await call("synthesize", { text, rate });
      return data.audio;
    },
    destroy() {
      for (const job of pending.values()) job.reject(new Error("Natural voice stopped."));
      pending.clear();
      if (worker) worker.terminate();
      worker = null;
      ready = null;
    },
  };
}
