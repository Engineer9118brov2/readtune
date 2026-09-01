/* ReadTune's opt-in, on-device Piper voice client. */

export const PIPER_VOICES = [
  { id: "en_US-lessac-medium", label: "Lessac", detail: "Clear and balanced", downloadMB: 60 },
  { id: "en_US-amy-medium", label: "Amy", detail: "Softer and measured", downloadMB: 60 },
  { id: "en_US-ryan-medium", label: "Ryan", detail: "Lower and steady", downloadMB: 60 },
];

export const PIPER_VOICE = PIPER_VOICES[0];

export function piperVoiceById(id) {
  return PIPER_VOICES.find((voice) => voice.id === id) || PIPER_VOICE;
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
    async synthesize(text) {
      await this.prepare();
      const data = await call("synthesize", { text });
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
