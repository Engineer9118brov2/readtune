/* ReadTune's opt-in, on-device Piper voice client. */

export const PIPER_VOICE = {
  id: "en_US-amy-low",
  label: "Amy — natural, on this device",
  downloadMB: 60,
};

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

export function createPiperEngine({ voiceId = PIPER_VOICE.id, onProgress = () => {} } = {}) {
  let worker = null;
  let ready = null;
  let serial = 0;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("./piper/worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") return onProgress(data);
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
