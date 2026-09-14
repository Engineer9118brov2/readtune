import { TtsSession, setBundledResolver } from "./piper-tts-web.js";

let session = null;
let activeVoice = "";
const SYNTHESIS_TIMEOUT_MS = 60000;

const runtimeUrl = (path) => new URL(`../../${path}`, import.meta.url).href;

/* Voices whose .onnx + .onnx.json ship inside the extension. The default voice
   is bundled so first-use read-aloud never depends on a network download. */
const BUNDLED_VOICES = new Set(["en_US-ljspeech-medium"]);

setBundledResolver(async (url) => {
  const file = String(url).split("/").pop() || "";
  const voiceId = file.replace(/\.onnx(\.json)?$/, "");
  if (!BUNDLED_VOICES.has(voiceId)) return null;
  const res = await fetch(runtimeUrl(`lib/piper/voices/${file}`));
  if (!res.ok) return null;
  return await res.blob();
}, { voiceIds: [...BUNDLED_VOICES] });

function progress(event) {
  const total = Number(event.total) || 0;
  const loaded = Number(event.loaded) || 0;
  postMessage({ type: "progress", loaded, total, phase: String(event.url || "") });
}

function synthesizeWithTimeout(text, rate) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("The natural voice took too long. Try again or choose another voice.")), SYNTHESIS_TIMEOUT_MS);
  });
  return Promise.race([
    session.predict(text, { rate }),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

async function prepare(voiceId) {
  if (session && activeVoice === voiceId) return;
  postMessage({ type: "status", kind: "loading", message: "Preparing the natural voice…" });
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
  postMessage({ type: "status", kind: "ready", message: "Natural voice ready. Reading stays on this device." });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "prepare") {
      await prepare(data.voiceId);
      postMessage({ id: data.id, type: "ready" });
      return;
    }
    if (data.type === "synthesize") {
      postMessage({ type: "status", kind: "speaking", message: "Natural voice is reading along." });
      const audio = await synthesizeWithTimeout(data.text, Number(data.rate) > 0 ? Number(data.rate) : 1);
      postMessage({ id: data.id, type: "audio", audio });
    }
  } catch (error) {
    postMessage({ id: data.id, error: error && error.message ? error.message : "Natural voice failed." });
  }
};
