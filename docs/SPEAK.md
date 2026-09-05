# Premium voice (cloud read-aloud relay)

**Goal:** a higher-quality read-aloud voice that stays *free* and *keyless for
the reader*, without giving up the on-device default. Piper (see `PIPER.md`) is
still the default and the floor; this is an opt-in upgrade in the read-aloud
settings ("Voice source → Premium voice").

## How it works

- **Client:** `shared/speak-cloud.js` — `createCloudEngine({ voice }).synthesize(text, { rate })`
  posts one sentence to `https://readtune.tech/api/speak` and gets back an MP3
  blob. Same interface as `piper.js`, so `tts.js` runs it through the exact same
  sentence loop, prefetch, and highlight estimate (`sentenceSpeak` /
  `synthSentence` / `driveEstimate`). Speed is baked in server-side.
- **Relay:** `api/speak.js` + `api/_speak-providers.mjs` (pure, unit-tested).
  Tries each configured provider in order and streams back the first that
  returns audio. A `400`/`413`/`422` (bad request) stops the chain; anything
  else — bad key, missing model, rate limit, 5xx — falls through to the next
  provider. With no provider configured it returns `503` and the extension
  keeps using Piper. Any failure mid-read also drops to Piper (`fallbackToPiper`
  in `tts.js`).
- **Nothing is stored.** Only the sentence currently being spoken is sent — not
  the page. There is a coarse shared per-minute rate limit (no-op without
  Redis), same env names as `api/assist.js`.

## Providers & order

| Order | Provider | Endpoint | Free tier | Env key |
| --- | --- | --- | --- | --- |
| 1 | OpenRouter | `openrouter.ai/api/v1/audio/speech` | free TTS models (`deepgram/flux-tts:free`, `fish-audio/s2.1-pro-free:free`) | `OPENROUTER_API_KEY` (shared with Summary) |
| 2 | Groq | `api.groq.com/openai/v1/audio/speech` | 30 rpm / ~1000+ req-day, no card (PlayAI / Orpheus) | `GROQ_API_KEY` |
| 3 | Unreal Speech | `api.v6.unrealspeech.com/stream` | ~250k–1M chars/month, no card | `UNREALSPEECH_API_KEY` |

Model/voice per provider are env-overridable so they can be retuned without a
code change:

| Env var | Default |
| --- | --- |
| `SPEAK_OPENROUTER_MODEL` | `deepgram/flux-tts:free` |
| `SPEAK_OPENROUTER_VOICE` | `aura-2-thalia-en` |
| `SPEAK_GROQ_MODEL` | `playai-tts` |
| `SPEAK_GROQ_VOICE` | `Celeste-PlayAI` |
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
