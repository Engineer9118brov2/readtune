# ReadTune — Privacy Policy

_Last updated: September 2026_

ReadTune is built so there is nothing to collect. There is no ReadTune account and no ReadTune server.

## What ReadTune stores

- **Your reading profile** (font, spacing, colour, pacing and other settings chosen by the calibration check or by you), your **check history**, your **per-page reading position and highlights**, the **dyslexia-friendly-menus** preference, and the **list of sites you turned on "auto-open" / "auto-restyle" for**.
- If you turn on the optional ElevenLabs voice, **your ElevenLabs API key** is stored here too. It is never written to a file, never included in the project, and never sent anywhere except to ElevenLabs (see below).
- All of it is saved with the browser's local extension storage (`chrome.storage.local`) **on your own computer**.

## What ReadTune reads

- When you open **Reader View** or **"Restyle this page"** (buttons or keyboard shortcuts), ReadTune reads the current tab's text so it can show you a reformatted version. This happens only on your explicit action, only for that one page, and the text stays on your device.
- The PDF you open in PDF mode is read locally in the browser; the file is not uploaded.
- "Auto-open" / "auto-restyle" asks for permission to that one site before it will run there, and you can turn it off at any time.

## What ReadTune sends over the network

- **By default, nothing.** ReadTune has no server, no analytics, no telemetry, no accounts, and no third-party SDKs. It works fully offline. The libraries it uses — Mozilla Readability, pdf.js, hyphenation patterns, fonts, and the entire Piper read-aloud runtime (onnxruntime-web plus a WebAssembly phonemizer) — are bundled inside the extension.
- **Read-aloud** uses Piper, a neural voice that runs entirely on your device. The default voice ships inside the extension. If you pick one of the other voices in the Reading Lab, its model file is downloaded once from Hugging Face (`huggingface.co`) and cached on your device; the text you have read aloud is never uploaded.
- **Talk to type (dictation):** if you use it, ReadTune turns on Chrome's built-in speech recognition. Chrome sends your microphone audio to Google's speech service to transcribe it — this is the browser's own engine, not ReadTune's. The transcribed text is placed into the field you're typing in. ReadTune does not record, store, or transmit the audio or the transcript.
- **ElevenLabs voice (optional):** only if you enter your own API key — the passage being read aloud and your key are sent from your browser to `https://api.elevenlabs.io` to generate audio and word timings. Nothing else is sent, nowhere else. ElevenLabs' handling of that request is covered by ElevenLabs' own privacy policy. Remove the key any time with "Remove key" in the settings panel.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` + `scripting` | To read or reformat the current page's text — and to insert dictated text — only when you ask (Reader View, "Restyle this page", or Talk to type) |
| `storage` | To save your settings and reading position on your device |
| host access to `huggingface.co` (optional) | Only if you select one of the extra on-device voices, to download its model once |
| host access to `api.elevenlabs.io` (optional) | Only if you enable the ElevenLabs voice |
| host access to a specific site (optional) | Only if you turn on "auto-open" / "auto-restyle" for that site |

## What ReadTune does not do

ReadTune does not sell or share data, run analytics, create an account, send your browsing history to its creator, or use data for advertising, creditworthiness, or lending.

## Your control

Remove any saved data with **Reset to defaults** in the settings panel, by turning off "auto-open" / "auto-restyle", or by removing the extension (which clears all its local storage).

## Contact

Questions or bug reports: open an issue at <https://github.com/Engineer9118brov2/readtune/issues>.
