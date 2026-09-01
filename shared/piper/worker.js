import { TtsSession } from "./piper-tts-web.js";

let session = null;
let activeVoice = "";

const runtimeUrl = (path) => new URL(`../../${path}`, import.meta.url).href;

function progress(event) {
  const total = Number(event.total) || 0;
  const loaded = Number(event.loaded) || 0;
  postMessage({ type: "progress", loaded, total, phase: String(event.url || "") });
}

async function prepare(voiceId) {
  if (session && activeVoice === voiceId) return;
  postMessage({ type: "status", kind: "loading", message: "Preparing Amy natural voice…" });
  session = await TtsSession.create({
    voiceId,
    progress,
    wasmPaths: {
      onnxWasm: runtimeUrl("lib/ort/"),
      piperData: runtimeUrl("lib/piper/piper_phonemize.data"),
      piperWasm: runtimeUrl("lib/piper/piper_phonemize.wasm"),
    },
  });
  activeVoice = voiceId;
  postMessage({ type: "status", kind: "ready", message: "Amy is ready. Reading stays on this device." });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "prepare") {
      await prepare(data.voiceId);
      postMessage({ id: data.id, type: "ready" });
      return;
    }
    if (data.type === "synthesize") {
      postMessage({ type: "status", kind: "speaking", message: "Amy is reading along." });
      const audio = await session.predict(data.text);
      postMessage({ id: data.id, type: "audio", audio });
    }
  } catch (error) {
    postMessage({ id: data.id, error: error && error.message ? error.message : "Natural voice failed." });
  }
};
