# Premium voice (cloud read-aloud relay)

ReadTune's default read-aloud voice is bundled Piper and runs on-device. Premium voice is an optional hosted path for readers who prefer a different voice without configuring their own provider key.

## Request flow

- `shared/speak-cloud.js` sends one sentence at a time to `https://readtune.tech/api/speak`.
- The next sentence may be prefetched so playback does not pause between sentences.
- The client bounds each request with a timeout and aborts in-flight work on stop, teardown, or fallback.
- The relay caps input length again server-side before contacting a provider.
- `api/_speak-providers.mjs` builds the configured provider candidates.
- Provider attempts are bounded by the relay's overall fallback/time budget so a long provider chain cannot make one sentence hang indefinitely.
- The first valid audio response wins. If hosted synthesis fails, the read-aloud controller falls back to Piper.

The hosted clip is buffered before being returned; this is not a streaming-audio protocol.

## Privacy boundary

Premium voice is opt-in and only runs while that voice source is selected.

- Only the sentence being spoken, plus at most the next prefetched sentence, is sent.
- The whole article is not uploaded for hosted read-aloud.
- ReadTune's relay does not intentionally persist the submitted sentence or generated audio.
- HTTP responses are marked `no-store` where appropriate.
- The default Piper path sends no reading text to ReadTune's relay.

This is one of several optional network paths in the product. Cloud-routed AI, Premium voice, user-configured ElevenLabs, and Chrome speech recognition for Talk to type each have separate disclosures in `PRIVACY.md` / `privacy.html`.

## Abuse protection

`/api/speak` uses two throttling layers:

1. a short-lived per-client bucket based on a pseudonymous HMAC identifier; raw client addresses are not written into Redis;
2. a higher shared provider ceiling protecting the overall hosted-voice quota.

When Redis is unavailable, a bounded per-instance in-memory guard is used instead. A throttled response returns HTTP 429 and includes `Retry-After`.

The relay no longer exposes wildcard browser CORS. The same central relay-origin policy used by `/api/assist` applies to `/api/speak`; unrelated web origins are rejected while ReadTune/Chrome-extension clients and server-side requests remain supported.

## Provider behavior

Provider configuration lives in `api/_speak-providers.mjs` and Vercel environment variables. Treat that source file as authoritative for the current provider order; provider availability and free-tier behavior can change.

Important invariants:

- never expose provider API keys to the extension;
- sanitize upstream provider errors before returning them to the reader;
- enforce the relay's total provider/fallback time budget;
- stop the provider chain on request-shape errors that cannot be fixed by trying another provider;
- otherwise allow configured fallbacks to take over;
- if no usable provider is configured, return a clean unavailable response and let the client fall back to Piper.

Some hosted providers do not return word-level timestamps. In those cases ReadTune estimates word progress from the actual clip duration, using the same read-aloud UI rather than pretending exact alignment exists.

## Configuration

Common server-side variables include:

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Enables configured OpenRouter speech candidates. |
| `CARTESIA_API_KEY` | Enables the optional direct Cartesia candidate when present in provider configuration. |
| `SPEAK_CARTESIA_MODEL` / `SPEAK_CARTESIA_VOICE` | Optional Cartesia overrides. |
| `UPSTASH_REDIS_REST_URL` / token | Enables distributed per-client + shared relay limits. |
| `READTUNE_RATE_LIMIT_SECRET` | Optional stable server secret for pseudonymous client identifiers. |

Provider-specific model and voice defaults belong in `_speak-providers.mjs`, not in UI code.

## Separation from AI

Hosted voice and AI use different endpoints and different provider surfaces:

- `/api/speak` returns audio;
- `/api/assist` returns generated text.

They have separate rate-limit namespaces even if some deployments reuse a provider account or Redis instance.

## Reader-facing behavior

- Piper remains the default and local fallback.
- Premium voice is explicitly selected by the reader.
- AI-answer Play follows the same selected voice source as normal read-aloud: Piper, Premium voice, or ElevenLabs when configured.
- A hosted-voice failure should never strand the transport in a permanent loading state; playback falls back or reports a bounded error.

## Not currently implemented

- persistent caching of synthesized hosted audio;
- exact per-character timings from providers that do not return alignment data;
- a requirement that hosted voice be available for core read-aloud to work.

Core read-aloud must continue to function with Piper even when every hosted provider is unavailable.