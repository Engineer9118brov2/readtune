# ReadTune — Privacy Policy

_Last updated: September 2026_

ReadTune has no account, analytics, or telemetry. Its optional Ask AI and
Premium voice relays handle text only when you choose those features. Ask AI
may cache a response by article URL and question so a repeated request does not
need another generation; neither relay associates content with a ReadTune
account. The full network boundaries are described below.

## What ReadTune stores

- **Your reading profile** (font, spacing, colour, pacing and other settings chosen by the calibration check or by you), your **check history**, your **per-page reading position and highlights**, the **dyslexia-friendly-menus** preference, and the **list of sites you turned on "auto-open" / "auto-restyle" for**.
- If you turn on the optional ElevenLabs voice, **your ElevenLabs API key** is stored here too. It is never written to a file, never included in the project, and never sent anywhere except to ElevenLabs (see below).
- All of it is saved with the browser's local extension storage (`chrome.storage.local`) **on your own computer**.

## What ReadTune reads

- When you open **Reader View** or **"Restyle this page"** (buttons or keyboard shortcuts), ReadTune reads the current tab's text so it can show you a reformatted version. This happens only on your explicit action, only for that one page, and the text stays on your device.
- The PDF you open in PDF mode is read locally in the browser; the file is not uploaded.
- "Auto-open" / "auto-restyle" asks for permission to that one site before it will run there, and you can turn it off at any time.

## What ReadTune sends over the network

- **Almost nothing, and never anything tied to an account.** ReadTune has no accounts, no analytics, no telemetry, and no third-party SDKs. Its core reading tools work fully offline; the optional network features are listed below. The libraries it uses — Mozilla Readability, pdf.js, hyphenation patterns, fonts, and the entire Piper read-aloud runtime (onnxruntime-web plus a WebAssembly phonemizer) — are bundled inside the extension.
- **Read-aloud** uses Piper by default, a neural voice that runs entirely on your device. The default voice ships inside the extension. If you pick one of the other on-device voices in the Reading Lab, its model file is downloaded once from Hugging Face (`huggingface.co`) and cached on your device; the text you have read aloud is never uploaded.
- **Premium voice (optional):** if you choose the "Premium voice" in the read-aloud settings, each sentence *as it is read to you* is sent to **ReadTune's own text-to-speech relay** (`readtune.tech/api/speak`), which forwards it to a free third-party voice provider and returns the audio. Only the sentence being spoken — and, prepared a moment ahead, the one after it — is sent; never the whole page. Nothing is stored. If the relay is unavailable, read-aloud falls back to the on-device Piper voice automatically. Premium voice, ElevenLabs, and cloud-routed Ask AI are the only features that send reading text off the device, and only while you choose them.
- **Talk to type (dictation):** if you use it, ReadTune turns on Chrome's built-in speech recognition. Chrome sends your microphone audio to Google's speech service to transcribe it — this is the browser's own engine, not ReadTune's. The transcribed text is placed into the field you're typing in. ReadTune does not record, store, or transmit the audio or the transcript.
- **ElevenLabs voice (optional):** only if you enter your own API key — the passage being read aloud and your key are sent from your browser to `https://api.elevenlabs.io` to generate audio and word timings. Nothing else is sent, nowhere else. ElevenLabs' handling of that request is covered by ElevenLabs' own privacy policy. Remove the key any time with "Remove key" in the settings panel.
- **AI reading help:** the "Ask AI" rail in Reader View. It summarises the article, and it answers freeform questions you type about it. Where your browser already has on-device AI ready (Chrome's built-in Summarizer / Rewriter / Prompt API), it runs there — nothing leaves your device. Otherwise, the article text — and, for a question, the question you typed — is sent to **ReadTune's own AI relay**, which forwards it to a third-party AI model and returns the result; this is the one part of ReadTune where article text (and anything you type into that box) leaves the device by default. A typed question can be more personal than article text, so only send what you're comfortable sharing. Where ReadTune has set up caching, the relay may cache a generated summary or answer by the article's URL (an answer also by the question) so a popular one is generated once, not per reader, and keeps no record of who asked. An AI response can be wrong and is labelled as approximate. **"Simplify"** (the passage-rewrite pill) is on-device only for now — it does not use this relay; if your browser doesn't already have a ready model, it says so instead of sending your selection anywhere.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` + `scripting` | To read or reformat the current page's text — and to insert dictated text — only when you ask (Reader View, "Restyle this page", or Talk to type) |
| `storage` | To save your settings and reading position on your device |
| host access to `readtune.tech/api` | "Ask AI" (summary + typed questions) when your browser has no on-device AI ready, and the optional "Premium voice" for read-aloud |
| host access to `huggingface.co` (optional) | Only if you select one of the extra on-device voices, to download its model once |
| host access to `api.elevenlabs.io` (optional) | Only if you enable the ElevenLabs voice |
| host access to a specific site (optional) | Only if you turn on "auto-open" / "auto-restyle" for that site |

## What ReadTune does not do

The extension does not sell or share data, run analytics, create an account, send your browsing history to its creator, or use data for advertising, creditworthiness, or lending.

## The readtune.tech website

The public marketing pages at `readtune.tech` are hosted on Vercel. ReadTune does **not** load a pageview analytics SDK, advertising pixel, or product-tracking script on those pages. Like ordinary web hosting, Vercel may process basic request and security logs needed to deliver the site; ReadTune does not use those logs to build reader profiles or connect website visits to extension activity. **Nothing you read inside the extension is visible to the website.**

## Your control

Remove any saved data with **Reset to defaults** in the settings panel, by turning off "auto-open" / "auto-restyle", or by removing the extension (which clears all its local storage).

## Contact

Questions or bug reports: open an issue at <https://github.com/Engineer9118brov2/readtune/issues>.
