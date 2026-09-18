# ReadTune — Third-Party Notices

ReadTune is distributed under the MIT License, but it includes third-party
software, fonts, model/runtime components, and voice data under their own
licenses. Those licenses continue to govern the corresponding components.

This file is a consolidated index. Full license texts that ship with ReadTune
are kept beside the relevant files under `lib/`.

| Component | Use in ReadTune | License / notice |
| --- | --- | --- |
| Mozilla Readability | Article extraction | Apache-2.0 — `lib/readability.LICENSE.md` |
| PDF.js / pdfjs-dist 3.11.174 | Local PDF text extraction | Apache-2.0 — `lib/pdf.js.LICENSE.txt` |
| Hypher + English hyphenation patterns | Hyphenation | BSD-style license — `lib/hypher.LICENSE.txt` |
| Atkinson Hyperlegible | Bundled font | SIL Open Font License 1.1 — `lib/atkinson-hyperlegible.LICENSE.txt` |
| Lexend | Bundled font | SIL Open Font License 1.1 — `lib/lexend.LICENSE.txt` |
| OpenDyslexic | Bundled font | SIL Open Font License 1.1 — `lib/opendyslexic.LICENSE.txt` |
| ONNX Runtime Web 1.18.0 | Local neural-voice inference runtime | MIT; runtime attribution is summarized in `lib/PIPER-NOTICES.md` |
| @mintplex-labs/piper-tts-web 1.0.5 (patched) | Piper browser glue | MIT; attribution is summarized in `lib/PIPER-NOTICES.md` |
| espeak-ng via @diffusionstudio/piper-wasm | Piper phonemizer WebAssembly/data | GPL-3.0-or-later — full license and source-offer notice in `lib/piper/espeak-ng.LICENSE.txt` |
| Piper voice: en_US-ljspeech-medium (Linden) | Bundled default voice | Public-domain LJ Speech source; see `lib/PIPER-NOTICES.md` |
| Optional Piper voices Joe / Kristin | Download-on-demand local voices | CC0 / public-domain sources as documented in `docs/PIPER.md` |

## GPL phonemizer distribution note

ReadTune ships an espeak-ng-derived WebAssembly phonemizer. The package includes
the full GPLv3-or-later license text, upstream/source information, the build
project reference, ReadTune's English-data modification description, and a
three-year written offer of corresponding source in
`lib/piper/espeak-ng.LICENSE.txt`.

The technical separation between that WebAssembly module and ReadTune's own MIT
code is documented in `lib/PIPER-NOTICES.md` and `docs/PIPER.md`. Those
documents intentionally do **not** claim that the GPL license-scope question is
legally settled. Before relying on that architecture for a commercial or
proprietary licensing decision, obtain qualified open-source-license advice or
replace the GPL phonemizer with a permissively licensed alternative.

## External services

Optional network features may use third-party services. These are services, not
code bundled into the extension, and their own terms/privacy policies apply.
Current routes are documented in `PRIVACY.md` and may include Vercel, Upstash,
OpenRouter, Ollama Cloud, model/voice providers reached through OpenRouter,
Cartesia, ElevenLabs, Hugging Face, and Chrome/Google speech recognition.

For source/licensing questions, open an issue:
https://github.com/Engineer9118brov2/readtune/issues
