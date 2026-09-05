/*
 * ReadTune — premium (cloud) read-aloud client
 *
 * The optional voice upgrade. Piper (on-device) stays the default and the
 * fallback; this only runs when the reader picks "Premium voice" in Voice Fit.
 * It posts one sentence at a time to ReadTune's own relay (/api/speak), which
 * forwards to a free cloud TTS provider and streams back MP3. No API key on
 * the reader's side — see api/speak.js.
 *
 * Interface mirrors piper.js's engine so tts.js can treat them the same:
 *   createCloudEngine({ voice, onStatus }).synthesize(text, { rate }) -> Blob
 *
 * Speed is baked in server-side (the provider's own `speed` param), so the
 * clip plays at 1× — same contract as the Piper length_scale path.
 */

const RELAY_URL = "https://readtune.tech/api/speak";

export const CLOUD_VOICES = [
  { id: "aura-2-thalia-en", label: "Thalia", detail: "Warm, unhurried" },
  { id: "aura-2-andromeda-en", label: "Andromeda", detail: "Even and clear" },
  { id: "aura-2-orion-en", label: "Orion", detail: "Low, steady" },
];

export const CLOUD_VOICE = CLOUD_VOICES[0];

export function cloudVoiceById(id) {
  return CLOUD_VOICES.find((v) => v.id === id) || CLOUD_VOICE;
}

export function createCloudEngine({ voice = CLOUD_VOICE.id, onStatus = () => {} } = {}) {
  let announced = false;

  return {
    async synthesize(text, { rate = 1, signal } = {}) {
      const say = String(text || "").trim();
      if (!say) return new Blob([], { type: "audio/mpeg" });
      if (!announced) {
        announced = true;
        onStatus({ kind: "loading", message: "Fetching the premium voice…", percent: null });
      }
      let res;
      try {
        res = await fetch(RELAY_URL, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: say, voice, speed: Number(rate) > 0 ? Number(rate) : 1 }),
        });
      } catch (e) {
        if (e && (e.name === "AbortError" || e.name === "TimeoutError")) throw e;
        throw new Error("Couldn't reach the premium voice.");
      }
      if (!res.ok) {
        let msg = `The premium voice couldn't handle that (${res.status}).`;
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch {
          /* non-JSON error body */
        }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const blob = await res.blob();
      if (!blob || blob.size < 512) throw new Error("The premium voice returned an empty clip.");
      onStatus({ kind: "speaking", message: "Premium voice is reading.", percent: null });
      return blob;
    },
    destroy() {
      /* stateless — nothing to tear down */
    },
  };
}
