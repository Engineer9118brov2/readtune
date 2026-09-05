# Premium voice (cloud read-aloud relay)

**Goal:** a higher-quality read-aloud voice that stays *free* and *keyless for
the reader*, without giving up the on-device default. Piper (see `PIPER.md`) is
still the default and the floor; this is an opt-in upgrade in the read-aloud
settings ("Voice source → Premium voice").

## How it works

- **Client:** `shared/speak-cloud.js` — `createCloudEngine({ voice }).synthesize(text, { rate })`
  posts one sentence to `https://readtune.tech/api/speak` and gets back an
  audio blob (MP3 or WAV, depending on the provider). Same interface as
  `piper.js`, so `tts.js` runs it through the exact same sentence loop,
  prefetch, and highlight estimate (`sentenceSpeak` / `synthSentence` /
  `driveEstimate`). Speed is baked in server-side where the provider supports
  it. Each request is bounded by a 20 s client-side timeout, and `destroy()`
  (stop / reload / fall back to Piper) aborts an in-flight synthesis.
- **Relay:** `api/speak.js` + `api/_speak-providers.mjs` (pure, unit-tested).
  Tries each configured provider in order and returns the first that gives
  audio (the whole clip is buffered, then sent — not streamed). Only a
  `413`/`422` (the payload itself is unusable) stops the chain; everything else
  — a provider-specific `400`, a bad key, a missing model, a rate limit, a 5xx
  — falls through to the next provider. `api/speak.js` caps the input length
  before the relay runs. With no provider configured it returns `503` and the
  extension keeps using Piper. Any failure mid-read also drops to Piper
  (`fallbackToPiper` in `tts.js`).
- **Nothing is stored.** Only the sentence currently being spoken is sent — and,
  during prefetch, the one after it — never the whole page. There is a coarse
  shared per-minute rate limit (Redis when configured, a best-effort in-memory
  counter otherwise), same env names as `api/assist.js`.

## Providers & order

| Order | Provider | Endpoint | Free tier | Env key |
| --- | --- | --- | --- | --- |
| 1 | OpenRouter | `openrouter.ai/api/v1/audio/speech` | free TTS models (`deepgram/flux-tts:free`, `fish-audio/s2.1-pro-free:free`) | `OPENROUTER_API_KEY` (shared with Summary) |
| 2 | Groq | `api.groq.com/openai/v1/audio/speech` | Orpheus (Canopy Labs); WAV only, no speed control, ~200-char input cap, no card | `GROQ_API_KEY` |
| 3 | Unreal Speech | `api.v6.unrealspeech.com/stream` | 250,000 chars/month, no card | `UNREALSPEECH_API_KEY` |

Groq's per-request character cap means a longer sentence 400s there and falls
through to Unreal Speech — expected, not an error.

Model/voice per provider are env-overridable so they can be retuned without a
code change:

| Env var | Default |
| --- | --- |
| `SPEAK_OPENROUTER_MODEL` | `deepgram/flux-tts:free` |
| `SPEAK_OPENROUTER_VOICE` | `aura-2-thalia-en` |
| `SPEAK_GROQ_MODEL` | `canopylabs/orpheus-v1-english` |
| `SPEAK_GROQ_VOICE` | `Troy` (also: Autumn, Diana, Hannah, Austin, Daniel) |
| `SPEAK_UNREAL_VOICE` | `Will` |

To change preference order, reorder `BUILDERS` in `api/_speak-providers.mjs`.

## Not conflicting with Summary

Different endpoint (`/api/speak` vs `/api/assist`), different provider APIs
(OpenRouter's audio models vs its chat router), separate rate-limit buckets.
`OPENROUTER_API_KEY` is shared but the two features draw on different model
pools. Setting up one doesn't require the other.

## Privacy

Disclosed as a place where text leaves the device, alongside Summary — see
`privacy.html` / `PRIVACY.md` / `store/listing.md`. The reader chooses it; the
default sends nothing.

## Not in v1

- On-device Kokoro-82M as a second local tier (deferred — its own PR).
- Caching synthesised audio by `(sentence-hash, voice)` so a popular article is
  synthesised once (needs blob storage; flagged, not built).
- Per-character timings for exact word highlighting (the cloud providers don't
  return them; the duration-weight estimate from the Piper path is used).
