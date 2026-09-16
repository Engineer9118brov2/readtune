import { callChat } from "../api/_relay.mjs";
import { callSpeak, relaySpeak } from "../api/_speak-providers.mjs";

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

let timeoutError;
try {
  await callSpeak(
    { name: "timeout-tts", url: "https://provider.invalid/tts", headers: {}, body: { input: "hello" } },
    async () => {
      const error = new Error("simulated timeout");
      error.name = "TimeoutError";
      throw error;
    },
  );
} catch (err) {
  timeoutError = err;
}
assert(timeoutError && timeoutError.status === 504, "TTS provider timeout was not classified as 504");

const providers = [
  { name: "one", url: "https://provider.invalid/1", headers: {}, body: {} },
  { name: "two", url: "https://provider.invalid/2", headers: {}, body: {} },
  { name: "three", url: "https://provider.invalid/3", headers: {}, body: {} },
];
let providerCalls = 0;
const ticks = [0, 0, 9000, 19000];
let budgetError;
try {
  await relaySpeak(
    providers,
    async () => {
      providerCalls += 1;
      return new Response("failed", { status: 500, headers: { "content-type": "text/plain" } });
    },
    { budgetMs: 18000, now: () => ticks.shift() ?? 19000 },
  );
} catch (err) {
  budgetError = err;
}
assert(budgetError && budgetError.status === 504, "hosted voice did not stop when the relay budget expired");
assert(providerCalls === 2, "hosted voice kept trying providers after the relay budget expired");

console.log("✓ public relay errors are sanitized and hosted voice respects its total time budget");
