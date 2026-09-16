import { callChat } from "../api/_relay.mjs";
import { callSpeak } from "../api/_speak-providers.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const secret = "upstream-account-secret-model-detail";

let aiError;
try {
  await callChat(
    { name: "private-provider", url: "https://provider.invalid/chat", key: "secret-key", model: "private-model" },
    "system",
    "user",
    async () => new Response(JSON.stringify({ error: { message: secret } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
  );
} catch (err) {
  aiError = err;
}
assert(aiError, "AI provider failure did not throw");
assert(!aiError.message.includes(secret), "AI relay exposed the upstream error body");
assert(!aiError.message.includes("private-provider"), "AI relay exposed the provider name");
assert(!aiError.message.includes("private-model"), "AI relay exposed the provider model");

let voiceError;
try {
  await callSpeak(
    { name: "private-tts", url: "https://provider.invalid/tts", headers: {}, body: { input: "hello" } },
    async () => new Response(secret, {
      status: 500,
      headers: { "content-type": "text/plain" },
    }),
  );
} catch (err) {
  voiceError = err;
}
assert(voiceError, "TTS provider failure did not throw");
assert(!voiceError.message.includes(secret), "TTS relay exposed the upstream error body");
assert(!voiceError.message.includes("private-tts"), "TTS relay exposed the provider name");

console.log("✓ public relay errors do not expose upstream provider details");
