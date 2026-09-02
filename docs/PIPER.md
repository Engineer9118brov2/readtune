# On-device neural read-aloud (Piper)

**Goal:** a free read-aloud voice that sounds genuinely good and runs entirely on
the user's device — no key, no account, no per-sentence network call. This is the
one thing no competitor in the space does (Speechify/NaturalReader paywall their
good voices; Immersive Reader's are cloud; the OS voices are hit-or-miss).

## As shipped (v0.8.0)

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
- **Zip size: ~60 MB** (`readtune-0.8.0.zip` = 60.04 MB). The bundled voice is
  ~63 MB compressed to ~60; ORT SIMD wasm ~10.6 MB; espeak-ng data trimmed to
  ~0.94 MB (English only). Already done: dropped the non-SIMD `ort-wasm.wasm`,
  English-only espeak repack. Remaining trim path: host the model on our own
  domain instead of bundling (−60 MB, but re-introduces a first-use download) —
  not worth losing offline-first for.

**Still open:** (1) Chromebook / throttled-CPU perf test. (2) A future release
should swap espeak-ng for a permissively licensed g2p to retire the GPL question
— see licensing note below; the current bundling is compliant (license text +
written source offer shipped in `lib/piper/espeak-ng.LICENSE.txt`).

**Verified in a loaded extension (2026-09-01, debug Chrome / CDP):** Piper
synthesis with the bundled Linden voice, fully offline, RTF ≈ 0.30; Reader View
+ Listen on a live Wikipedia article; Restyle-this-page (including the
inject/toggle/re-inject cycle — see `fix: in-page restyle silently stopped
toggling off`); PDF mode with the text fixture; dictation panel + command
parsing; calibration start → passage. Zero console errors on popup, lab,
calibration, pdf.

## How it's built (as shipped)

`shared/tts.js` runs Piper as one of two backends (the other is the optional
own-key ElevenLabs path). The ElevenLabs path was the template — "fetch an audio
blob per unit, get an alignment, play it through `<audio>`, drive the highlight
with `charIndexAt` on rAF" — and Piper swaps *fetch-from-API* → *synthesize
locally in a Web Worker*, and *real per-character timings* → *proportional
estimate*.

```
shared/piper.js          main-thread client. PIPER_VOICES list, createPiperEngine()
                         ({ prepare, synthesize, destroy }), permission helpers,
                         progress copy. Spawns the worker as a module Worker.
shared/piper/worker.js    the Web Worker. Registers a bundled-voice resolver, then
                          TtsSession.create({ voiceId, wasmPaths }) -> synthesize.
shared/piper/piper-tts-web.js   vendored @mintplex-labs/piper-tts-web glue, patched:
                          import("onnxruntime-web/wasm") -> ../../lib/ort/ort.wasm.min.js;
                          numThreads = 1 (extension pages aren't cross-origin-isolated);
                          setBundledResolver() so getBlob() serves a bundled model
                          from chrome.runtime.getURL before any network fetch.
shared/piper/piper-o91UDS6e.js  vendored phonemizer (espeak-ng) Emscripten glue,
                          repacked to English-only data (~0.94 MB, was ~18 MB).
lib/ort/                  onnxruntime-web 1.18 — ort.wasm.min.js + ort-wasm-simd.wasm
                          (the non-SIMD wasm was dropped).
lib/piper/                piper_phonemize.wasm + .data + espeak-ng.LICENSE.txt
lib/piper/voices/         en_US-ljspeech-medium.onnx (+ .json) — the bundled default
```

- **Provider resolution** (`resolveProvider()` in `tts.js`): ElevenLabs only when
  a working key + voice are set; otherwise Piper. A Piper failure surfaces an
  honest error — there is no `speechSynthesis` fallback.
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'` is enough. The ORT ESM build
  and the phonemizer glue use `WebAssembly.instantiate` on *bundled* bytes — no
  `eval`, no remote wasm.
- **Speed:** RTF ≈ 0.3 on Apple Silicon, single thread. Prepare (cold phonemizer
  + session) is ~1–2 s once per session; then each sentence is well under
  real-time and the existing +1 prefetch hides it.
- **Word timings:** the VITS model returns only PCM, so the Piper word highlight
  is a proportional estimate (char offset × sentence duration). The sentence
  highlight is exact because synthesis is one sentence at a time.
- **Voices:** `en_US-ljspeech-medium` (public domain) is bundled and is the
  default — offline, no download, no permission. `joe` (CC0) and `kristin`
  (public domain) download a one-time model from Hugging Face via the optional
  `huggingface.co` permission, requested at that moment.

**Still open:** Chromebook / throttled-CPU performance. RTF ≈ 0.3 here could be
~1.0+ on a low-end ARM Chromebook; at RTF > ~0.8 the prefetch falls behind on
long sentences. Mitigation if it bites: detect weak devices
(`navigator.deviceMemory`, `hardwareConcurrency`) and prefer a low-rate model.

## Licensing

- onnxruntime-web — MIT ✅
- `@mintplex-labs/piper-tts-web` glue — MIT ✅
- Voice models — **Linden** public domain, **Joe** CC0, **Kristin** public
  domain (LibriVox). All safe to bundle and redistribute. ✅
- `piper_phonemize` bundles **espeak-ng — GPLv3-or-later.** Handled, with a
  known long-term cleanup:
  - `lib/piper/espeak-ng.LICENSE.txt` ships the full GPLv3 text, a written offer
    of corresponding source (GPLv3 §6), and a plain statement of how espeak-ng
    is combined with ReadTune. This file goes in the store zip (`lib/` ships
    wholesale).
  - **Position:** espeak-ng is compiled to a standalone wasm module with its own
    linear memory; ReadTune calls it only across that boundary (text in, phoneme
    string out — process-over-a-pipe shape), never linking its internals. That
    is aggregation, so ReadTune-the-whole stays MIT and this espeak build stays
    GPLv3. And even under the stricter reading, ReadTune's entire source is
    already public and MIT is GPL-compatible, so no recipient is denied source
    or freedoms — the practical exposure is nil.
  - The only modification is the English-only `.data` repack (dropping the
    non-English language data); the original full `.data` and the repack are
    recoverable from git history.
  - **Cleanup:** a later release should replace espeak-ng with a permissively
    licensed grapheme-to-phoneme step (small English rules-based g2p, or a tiny
    learned model) to remove the question entirely. Not a launch blocker.
