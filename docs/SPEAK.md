# Premium voice (cloud read-aloud relay)

**Goal:** a higher-quality read-aloud voice that stays *free* and *keyless for
the reader*, without giving up the on-device default. Piper (see `PIPER.md`) is
still the default and the floor; this is an opt-in upgrade in the read-aloud
settings ("Voice source → Premium voice").

## How it works

- **Client:** `shared/speak-cloud.js` — `createCloudEngine({ voice }).synthesize(text, { rate })`
  posts one sentence to `https://readtune.tech/api/speak` and gets back an
  audio blob (MP3). Same interface as `piper.js`, so `tts.js` runs it through
  the exact same sentence loop, prefetch, and highlight estimate
  (`sentenceSpeak` / `synthSentence` / `driveEstimate`). Each request is
  bounded by a 20 s client-side timeout, and `destroy()` (stop / reload / fall
  back to Piper) aborts an in-flight synthesis.
- **Relay:** `api/speak.js` + `api/_speak-providers.mjs` (pure, unit-tested).
  Tries each model in order and returns the first that gives audio (the whole
  clip is buffered, then sent — not streamed). Only a `413`/`422` (the payload
  itself is unusable) stops the chain; everything else — a `400`, a rate limit,
  a 5xx — falls through. `api/speak.js` caps the input length first. With
  nothing configured it returns `503` and the extension keeps using Piper. Any
  failure mid-read also drops to Piper (`fallbackToPiper` in `tts.js`).
- **Nothing is stored.** Only the sentence being spoken is sent — and, during
  prefetch, the one after it — never the whole page. Every OpenRouter speech
  request carries `provider: { zdr: true }`, so it's only routed to providers
  under a zero-data-retention policy (no retention, no training on the text).
  Coarse per-minute rate limit (Redis when configured, an in-memory counter
  otherwise).

## Providers & order

Almost everything runs through OpenRouter's one speech endpoint
(`/api/v1/audio/speech`, OpenAI-shaped) so there's a single key and a single
code path. The model list is tried top to bottom:

| Order | Model (OpenRouter) | Cost to us | Notes |
| --- | --- | --- | --- |
| 1 | `deepgram/aura-2` | free via a **BYOK Deepgram key** (add it in OpenRouter → Settings → Integrations) | best quality; honours `speed`; voices `aura-2-thalia-en` / `-andromeda-en` / `-orion-en` |
| 2 | `deepgram/flux-tts:free` | free (no credits) | voice `flux-alexis-en` |
| 3 | `fish-audio/s2.1-pro-free:free` | free (no credits) | voice `alloy` |
| 4 | Cartesia `sonic-2` (direct) | free credits on the Cartesia key | OpenRouter can't BYOK Cartesia, so it's a direct call; UUID voice id; no `speed` on this endpoint |
| — | on-device Piper | — | the floor, always available |

Models 2–3 have no speed control, so the clip plays at 1× and the highlight
estimate adapts to the real duration.

## Env vars

| Env var | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | the one relay key (shared with Summary); BYOK keys for Deepgram etc. are configured inside OpenRouter, not here |
| `CARTESIA_API_KEY` | optional — the direct Cartesia fallback |
| `SPEAK_CARTESIA_MODEL` / `SPEAK_CARTESIA_VOICE` | optional overrides (defaults `sonic-2` / a stock voice id) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | optional — shared rate limit |

To retune the OpenRouter model list or its voices, edit `OPENROUTER_SPEECH` in
`api/_speak-providers.mjs`.

## Not conflicting with Summary

Different endpoint (`/api/speak` vs `/api/assist`), different OpenRouter surface
(the audio endpoint vs chat completions), separate rate-limit buckets. The
shared `OPENROUTER_API_KEY` draws on different model pools. Setting up one
doesn't require the other.

## Privacy

Disclosed as a place where text leaves the device, alongside Summary — see
`privacy.html` / `PRIVACY.md` / `store/listing.md`. The reader chooses it; the
default sends nothing.

## Not in v1

- On-device Kokoro-82M as a second local tier (deferred — its own PR).
- Caching synthesised audio by `(sentence-hash, voice)` so a popular article is
  synthesised once (needs blob storage; flagged, not built).
- Per-character timings for exact word highlighting (the providers don't return
  them; the duration-weight estimate from the Piper path is used).
