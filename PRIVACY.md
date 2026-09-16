# ReadTune — Privacy Policy

_Last updated: September 2026_

ReadTune has no account, analytics, or telemetry. Its optional Ask AI and
Premium voice relays handle text only when you choose those features. Where
server-side caching is configured, only article/document **summaries** may be
cached for up to 30 days so the same public reading does not need another
generation. Free-form Ask answers are not stored in that response cache. Neither
relay associates content with a ReadTune account. The full network boundaries
are described below.

## What ReadTune stores

- **Your reading profile** (font, spacing, colour, pacing and other settings chosen by the calibration check or by you), your **check history**, your **per-page reading position and highlights**, the **dyslexia-friendly-menus** preference, and the **list of sites you turned on "auto-open" / "auto-restyle" for**.
- If you turn on the optional ElevenLabs voice, **your ElevenLabs API key** is stored here too. It is never written to a file, never included in the project, and never sent anywhere except to ElevenLabs (see below). Choosing **Remove key** also returns ReadTune's optional ElevenLabs host permission.
- All of it is saved with the browser's local extension storage (`chrome.storage.local`) **on your own computer**.
- Reader View uses a short-lived handoff for captured page content. It normally uses Chrome's session-only extension storage; a resilience fallback is also time-limited and expired handoffs are rejected and cleaned up.

## What ReadTune reads

- When you open **Reader View** or **"Restyle this page"** (buttons or keyboard shortcuts), ReadTune reads the current tab's text so it can show you a reformatted version. This happens only on your explicit action, only for that one page, and the text stays on your device unless you later choose one of the optional network features below.
- The **PDF file** you open in PDF mode is parsed and its text is extracted locally in the browser. The PDF file itself is not uploaded. If you later explicitly use Ask AI on that PDF, the relevant extracted text can follow the Ask AI network path described below.
- "Auto-open" / "auto-restyle" asks for permission to that one site before it will run there, and you can turn it off at any time.

## What ReadTune sends over the network

- **Almost nothing, and never anything tied to an account.** ReadTune has no accounts, no analytics, no telemetry, and no third-party SDKs. Its core reading tools work fully offline; the optional network features are listed below. The libraries it uses — Mozilla Readability, pdf.js, hyphenation patterns, fonts, and the entire Piper read-aloud runtime (onnxruntime-web plus a WebAssembly phonemizer) — are bundled inside the extension.
- **Read-aloud** uses Piper by default, a neural voice that runs entirely on your device. The default voice ships inside the extension. If you pick one of the other on-device voices in the Reading Lab, its model file is downloaded once from Hugging Face (`huggingface.co`) and cached on your device; the text you have read aloud is never uploaded.
- **Premium voice (optional):** if you choose the "Premium voice" in the read-aloud settings, each sentence *as it is read to you* is sent to **ReadTune's own text-to-speech relay** (`readtune.tech/api/speak`), which forwards it to a third-party voice provider and returns the audio. Only the sentence being spoken — and, prepared a moment ahead, the one after it — is sent; never the whole page. Nothing is stored. If the relay is unavailable, read-aloud falls back to the on-device Piper voice automatically.
- **Talk to type (dictation):** if you use it, ReadTune turns on Chrome's built-in speech recognition. Chrome sends your microphone audio to Google's speech service to transcribe it — this is the browser's own engine, not ReadTune's. The transcribed text is placed into the field you're typing in. ReadTune does not record, store, or transmit the audio or the transcript. Dictation is disabled for password fields.
- **ElevenLabs voice (optional):** only if you enter your own API key — the passage being read aloud and your key are sent from your browser to `https://api.elevenlabs.io` to generate audio and word timings. Nothing else is sent, nowhere else. ElevenLabs' handling of that request is covered by ElevenLabs' own privacy policy. Remove the key any time with "Remove key" in the settings panel.
- **AI reading help:** the **Ask AI** rail is available in Reader View and PDF mode. Merely opening the rail sends nothing. When you explicitly choose Summary, Key terms, Simple, Annotate, or submit a question, ReadTune first uses Chrome's built-in AI when the required on-device model is already ready. If the action needs the cloud path, the article text or relevant **locally extracted PDF text** needed for that request — and, for a free-form question, the question you typed — is sent to **ReadTune's own AI relay**, which forwards it to a third-party AI model and returns the result. The PDF file itself is never uploaded. A typed question can be more personal than reading text, so only send what you're comfortable sharing. Where server-side caching is configured, only generated summaries may be cached for up to 30 days using a content/URL-derived key; typed Ask answers and the other interactive AI responses are not stored in that response cache. An AI response can be wrong and is labelled as approximate. **"Simplify"** (the passage-rewrite pill) is on-device only for now — it does not use this relay; if your browser doesn't already have a ready model, it says so instead of sending your selection anywhere.

Premium voice, ElevenLabs, cloud-routed Ask AI, optional voice-model downloads, and Chrome's dictation service are the disclosed network paths. Core reading/reformatting and PDF extraction remain local.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` + `scripting` | To read or reformat the current page's text — and to insert dictated text — only when you ask (Reader View, "Restyle this page", or Talk to type) |
| `storage` | To save your settings and reading position on your device |
| host access to `readtune.tech/api` | Ask AI when a requested action cannot use ready on-device AI, and the optional Premium voice for read-aloud |
| host access to `huggingface.co` (optional) | Only if you select one of the extra on-device voices, to download its model once |
| host access to `api.elevenlabs.io` (optional) | Only if you enable the ElevenLabs voice; returned when you explicitly remove the key |
| host access to a specific site (optional) | Only if you turn on "auto-open" / "auto-restyle" for that site |

## What ReadTune does not do

The extension does not sell or share data, run analytics, create an account, send your browsing history to its creator, or use data for advertising, creditworthiness, or lending.

## The readtune.tech website

The public marketing pages at `readtune.tech` are hosted on Vercel. ReadTune does **not** load a pageview analytics SDK, advertising pixel, or product-tracking script on those pages. Like ordinary web hosting, Vercel may process basic request and security logs needed to deliver the site; ReadTune does not use those logs to build reader profiles or connect website visits to extension activity. **Nothing you read inside the extension is visible to the marketing website just because you visit it.** The optional relay requests described above are separate, user-invoked feature requests.

## Your control

Remove saved preferences with **Reset to defaults**, turn off "auto-open" / "auto-restyle" to return that site's optional permission, use **Remove key** to clear the ElevenLabs integration and its optional host permission, or remove the extension to clear its local extension storage.

## Contact

Questions or bug reports: open an issue at <https://github.com/Engineer9118brov2/readtune/issues>.
