# Piper runtime notices

ReadTune bundles the following, only to run the on-device Piper read-aloud
voice. No remote JavaScript or WebAssembly is fetched or executed — every
binary here ships in the package.

| Bundled | What it is | Licence |
| --- | --- | --- |
| `lib/ort/` | ONNX Runtime Web 1.18.0 (© Microsoft) | MIT |
| `shared/piper/piper-tts-web.js` | `@mintplex-labs/piper-tts-web` 1.0.5 glue (patched) | MIT |
| `shared/piper/piper-o91UDS6e.js`, `lib/piper/piper_phonemize.*` | the phonemizer — an Emscripten build of **espeak-ng** (via `@diffusionstudio/piper-wasm`). ReadTune ships an English-only subset of the data. | **GPL-3.0-or-later** — full text and a written offer of source in [`lib/piper/espeak-ng.LICENSE.txt`](piper/espeak-ng.LICENSE.txt) |
| `lib/piper/voices/en_US-ljspeech-medium.onnx` (+ `.json`) | the default voice model | Public domain (LJ Speech) |

## The default voice is bundled

`en_US-ljspeech-medium` ships inside the extension, so first-use read-aloud
works offline with no download and no permission prompt. The other voices
offered in the Reading Lab (`joe`, CC0; `kristin`, public domain) download a
one-time model from Hugging Face — only when the user selects one — and are then
cached by the browser. The text being spoken is processed locally and is never
uploaded.

## On the GPLv3 phonemizer

espeak-ng is compiled to a standalone WebAssembly module with its own linear
memory; ReadTune calls it only across that boundary (text in, phoneme string
out) and never links its internals. ReadTune as a whole remains under the MIT
License; this espeak-ng build remains under the GPLv3. See
[`docs/PIPER.md`](../docs/PIPER.md) for the full reasoning and the planned
long-term switch to a permissively licensed grapheme-to-phoneme step.
