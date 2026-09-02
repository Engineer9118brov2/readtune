# On-device neural read-aloud (Piper) — plan

**Goal:** a free read-aloud voice that sounds genuinely good and runs entirely on
the user's device — no key, no account, no per-sentence network call. This is the
one thing no competitor in the space does (Speechify/NaturalReader paywall their
good voices; Immersive Reader's are cloud; the OS voices are hit-or-miss).

## As shipped (v0.7.2)

Piper is **the only read-aloud engine** (ElevenLabs stays as an optional
bring-your-own-key path). There is no browser-speech fallback: if Piper can't
run, read-aloud shows a clear message rather than a robotic system voice.

- `shared/piper.js` — voice list + `createPiperEngine()`; `shared/piper/worker.js`
  runs ORT + the phonemizer off the main thread.
- **The default voice ships inside the extension.** `lib/piper/voices/en_US-ljspeech-medium.onnx`
  (+ `.onnx.json`). `worker.js` registers a bundled resolver (`setBundledResolver`
  in `piper-tts-web.js`) that serves it from `chrome.runtime.getURL(...)` before
  any network fetch — so first-use read-aloud works offline, with no download and
  no permission prompt.
- **Voice licensing is resolved.** Every offered voice is public domain or CC0
  and safe to bundle/redistribute: **Linden** (`ljspeech`, public domain,
  bundled default), **Joe** (`joe`, CC0, download), **Kristin** (`kristin`,
  public domain / LibriVox, download). The Piper stock defaults (lessac = Blizzard
  research-only; amy = unclear; ryan = CC-BY-NC) are deliberately **not** offered;
  `loadTTSConfig()` migrates anyone previously on them to Linden.
- Extra (non-bundled) voices download once from Hugging Face (~60 MB) and need
  the `huggingface.co` optional permission, requested at that moment.
- **Zip size: ~70 MB** (was 15 MB). The bundled voice is ~63 MB; ORT wasm ~20 MB;
  espeak-ng data ~18 MB. Large but legal, and it buys a fully-offline neural
  voice. Trim paths, in order: drop the non-SIMD `ort-wasm.wasm` (−10 MB),
  English-only espeak rebuild (−16 MB), host the model on our own domain instead
  of bundling (−63 MB, but re-introduces a first-use download).

**Still open:** (1) `espeak-ng` is GPLv3 — see the licensing note at the bottom;
(2) never actually clicked in a loaded extension end to end — the clean-profile
verification the award plan requires; (3) Chromebook / throttled-CPU perf test.

## Status: spike PASSED (2026-08-31)

A throwaway MV3 extension (`scratchpad/piper-spike/ext/`) loaded the whole Piper
pipeline — `@mintplex-labs/piper-tts-web` glue + vendored onnxruntime-web 1.18 +
the `piper_phonemize` (espeak-ng) wasm — inside a real extension page under a
locked-down CSP, downloaded a voice model from Hugging Face, and synthesized
speech.

| Question | Answer |
| --- | --- |
| Runs under MV3 CSP? | **Yes.** `script-src 'self' 'wasm-unsafe-eval'` is enough. No `eval`/`new Function` in the ORT ESM build or the phonemizer glue — only `WebAssembly.instantiate`. |
| WASM from the extension, not a CDN? | **Yes.** `wasmPaths` is configurable → point it at `chrome.runtime.getURL("lib/piper/…")`. |
| Threads? | Forced `numThreads = 1` (extension pages aren't cross-origin-isolated). Single-thread is plenty fast. |
| Speed (Apple Silicon, 1 thread) | **RTF ≈ 0.29** — a 5-second sentence synthesizes in ~1.5 s. With the existing +1-sentence prefetch, latency after sentence 1 is zero. |
| Model | `en_US-amy-low` (16 kHz) downloaded in ~5 s / ~60 MB, then cached in OPFS. |
| Output | 16-bit mono WAV `Blob` — drops straight into the existing `<audio>` + rAF-highlight playback path. |

Sample audio from the spike: `scratchpad/piper-amy-sample.wav`.

## The honest tradeoffs

1. **Extension size: +~30 MB.** onnxruntime-web SIMD wasm (~10.6 MB) + the
   `piper_phonemize` wasm (~0.6 MB) + its espeak-ng data blob (~18 MB) + JS glue.
   The current zip is 0.83 MB. The 18 MB is espeak data for ~100 languages; an
   English-only Emscripten rebuild would cut most of it, but that's a from-source
   build — defer. A ~31 MB extension is still small by modern standards and the
   payoff is large. **Accept for v1, trim later.**
2. **~20–60 MB model download on first use.** One time, then cached. Needs an
   honest progress UI and an **optional** `huggingface.co` host permission
   requested at that moment. This dents "nothing leaves your device" slightly —
   but it's a one-time asset fetch, like downloading a font, not sending reading
   text anywhere. The privacy page and school page each get one added sentence.
3. **First-sentence latency ~1.5 s** on a fast machine, more on a Chromebook.
   Mitigation: play sentence 1 on the browser voice while Piper warms up, then
   swap — the ElevenLabs backend already has this exact "first chunk is slow"
   shape.
4. **Chromebook performance is the real unknown.** RTF 0.29 here could be
   1.0–1.5 on a low-end ARM Chromebook. At RTF > ~0.8 the prefetch falls behind
   on long sentences. Fix: default to a `low` (16 kHz) model, and detect weak
   devices (`navigator.deviceMemory`, `hardwareConcurrency`) to stay there.
   **Phase 3 must test on an actual Chromebook or a throttled profile.**
5. **No true word timings.** VITS `predict()` returns only PCM. Word highlighting
   for Piper is a proportional estimate (char-offset × sentence duration);
   sentence highlighting stays exact because we synthesize one sentence at a time.

## Architecture

Piper slots in as a **third backend** in `shared/tts.js`, beside `browser` and
`elevenlabs`. The ElevenLabs path is the template: it already "fetches an audio
blob per chunk, gets an alignment, plays it through `<audio>`, drives the
highlight with `charIndexAt` on rAF." Piper swaps *fetch-from-API* → *generate
locally in a Worker* and *real alignment* → *proportional alignment*.

```
shared/piper/
  piper-worker.js     Web Worker (module). Loads ORT + phonemizer once, holds the
                      InferenceSession, { synth: text } -> { pcm, sampleRate }.
                      Keeps synthesis off the reader's main thread.
  piper-tts-web.js    vendored @mintplex-labs/piper-tts-web glue, patched:
                        - import("onnxruntime-web/wasm") -> "../../lib/ort/ort.wasm.min.js"
                        - numThreads = 1
  piper-o91UDS6e.js   vendored phonemizer (espeak-ng) JS glue
  voices.js           curated list: id, label, quality, sampleRate, ~MB, locale
shared/piper.js       main-thread client: createPiperEngine()
                        loadVoice(id, onProgress) / synth(text) -> { wavBlob, alignment }
                        model cache (OPFS), pcm->wav, proportional alignment
lib/ort/              vendored onnxruntime-web 1.18 (ort.wasm.min.js + *.wasm)
lib/piper/            piper_phonemize.wasm + piper_phonemize.data
```

`shared/tts.js`:
- `resolveProvider()` → `"piper"` when `cfg.provider === "piper"` and a voice is
  chosen and its model is downloaded
- generalize `fetchChunk` / `elevenPlay` / `driveEleven` → work for any
  `{ url, alignment }` source (rename to `chunkPlay` / `driveChunks`)
- lazy-init the Worker only when provider becomes `piper`

`shared/settings.js`: TTS config gains `provider: "browser" | "elevenlabs" |
"piper"` and `piperVoice: "en_US-amy-low"`.

`manifest.json`:
- `content_security_policy.extension_pages`: `"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"`
- `optional_host_permissions`: add `https://huggingface.co/*` and the
  `https://*.hf.co/*` / `cdn-lfs` hosts the model redirect uses
- `web_accessible_resources`: the worker + wasm, if ever needed from a content
  script (probably not — reader/pdf/lab are extension pages)

UI (`shared/controls.js`, `lab.js`):
- engine picker gains "Piper — natural, on your device"
- Piper voice dropdown (curated en_US / en_GB)
- first-use card: "Piper downloads a ~40 MB voice once, then works offline" +
  progress bar; the `huggingface.co` permission prompt fires here
- recommend `low` vs `medium` by device capability

## Phases (≈4 weeks available, submissions Sep 1 – Oct 2)

- **Phase 0 — spike.** ✅ done. Go.
- **Phase 1 — engine (`shared/piper*.js`), ~4 days.** Worker, ORT+phonemizer load
  from `lib/`, model download + OPFS cache + progress, `pcm2wav`, proportional
  alignment. Harness units: wav encode, alignment math, voice list.
- **Phase 2 — wire into `createTTS`, ~3 days.** Third backend; generalize the
  chunk-play loop; settings; engine picker + voice list + download UI in
  `controls.js` and `lab.js`. Fall back to browser voice on any Piper error.
- **Phase 3 — polish + real-device test, ~4 days.** Chromebook / throttled-CPU
  testing; low-vs-medium auto-recommendation; first-sentence bridge on the
  browser voice; download-failure + corrupt-model + OOM handling; privacy.html /
  school.html copy ("one-time model download from Hugging Face; your reading text
  is never sent anywhere"); `docs/RESEARCH.md` + `store/listing.md` updates.
- **Phase 4 — buffer.** Re-shoot the demo video with Piper as the voice; Devpost
  "how we built it" gets the on-device-neural-TTS story (strong technical +
  innovation points); size-trim spike on the espeak data if time allows.

## Open decisions

- **Default Piper voice.** `en_US-amy-low` (tested, warm, 16 kHz, small) vs
  `en_US-lessac-medium` (22 kHz, clearer, ~63 MB) vs `hfc_female-medium` (the
  package default). Lean: ship `amy-low` as the default download, offer
  `lessac-medium` / `ryan-medium` as "higher quality, larger" options.
- **Bundle a voice, or always download?** Bundling `amy-low` (~20 MB) would make
  Piper work offline on first use with no permission prompt, at the cost of a
  bigger zip. Lean: **don't bundle** — keep the zip lean, download on opt-in,
  cache forever.
- **Worker vs main thread.** Spike ran on main (blocked ~1.5 s/sentence). Ship
  the Worker — the reader must stay smooth.
- **espeak data trim.** 18 MB → English-only is a from-source build. Only if
  Phase 4 has time.

## Vendored files (from the spike, ready to move into `lib/`)

`scratchpad/piper-spike/ext/` has the patched, working set:
`piper-tts-web.js` (patched), `piper-o91UDS6e.js`, `voices_static-*.js`,
`ort/ort.wasm.min.js`, `ort/ort-wasm-simd.wasm`, `ort/ort-wasm.wasm`,
`piper/piper_phonemize.wasm`, `piper/piper_phonemize.data`.
Licenses:
- onnxruntime-web — MIT ✅
- `@mintplex-labs/piper-tts-web` glue — MIT ✅
- Voice models — **Linden** public domain, **Joe** CC0, **Kristin** public
  domain (LibriVox). All safe to bundle and redistribute. ✅
- `piper_phonemize` bundles **espeak-ng — GPLv3.** ⚠️ Unresolved. The extension
  ships this wasm as a black-box phonemizer called through a fixed interface;
  the common reading is "mere aggregation," and ReadTune's own source is public,
  which satisfies the GPL source-offer. But get this confirmed before a real
  Chrome Web Store launch, or swap to a non-GPL g2p. Low-stakes for the hackathon
  submission itself.
