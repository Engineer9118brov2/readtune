# ReadTune — Privacy Policy

_Last updated: September 2026_

ReadTune has no account, analytics, or telemetry. Its optional AI and cloud-voice features handle text only when you choose those features. The AI relay may cache an article **summary** for up to 30 days so the same article does not need to be summarized repeatedly; typed Ask answers, Define/Explain results, annotations, and cloud-voice requests are not stored in that response cache. None of these relays associates content with a ReadTune account.

## What ReadTune stores

- **Your reading profile** (font, spacing, colour, pacing and other settings chosen by the calibration check or by you), your **check history**, your **per-page reading position and highlights**, the **dyslexia-friendly-menus** preference, and the **list of sites you turned on "auto-open" / "auto-restyle" for**.
- If you turn on the optional ElevenLabs voice, **your ElevenLabs API key** is stored here too. It is never written to a file, never included in the project, and never sent anywhere except to ElevenLabs (see below).
- All of it is saved with the browser's local extension storage (`chrome.storage.local`) **on your own computer**.

## What ReadTune reads

- When you open **Reader View** or **"Restyle this page"** (buttons or keyboard shortcuts), ReadTune reads the current tab's text so it can show you a reformatted version. This happens only on your explicit action, only for that one page.
- **PDF mode extracts text locally in your browser. The PDF file itself is never uploaded.** If you later choose a cloud-routed AI action inside PDF mode, only the extracted text needed for that AI action can leave the device, as described below.
- "Auto-open" / "auto-restyle" asks for permission to that one site before it will run there, and you can turn it off at any time.

## What ReadTune sends over the network

- **Almost nothing, and never anything tied to an account.** ReadTune has no accounts, no analytics, no telemetry, and no third-party analytics SDKs. Its core reading tools work locally; the optional network features are listed below. Mozilla Readability, pdf.js, hyphenation patterns, fonts, and the default Piper read-aloud runtime are bundled inside the extension.
- **Read-aloud** uses Piper by default, a neural voice that runs entirely on your device. The default voice ships inside the extension. If you pick one of the other on-device voices in the Reading Lab, its model file is downloaded once from Hugging Face (`huggingface.co`) and cached on your device; the text you have read aloud is never uploaded for those on-device voices.
- **Premium voice (optional):** if you choose the "Premium voice" in the read-aloud settings, each sentence *as it is read to you* is sent to **ReadTune's text-to-speech relay** (`readtune.tech/api/speak`), which forwards it to a third-party voice provider and returns the audio. Only the sentence being spoken — and, prepared a moment ahead, the one after it — is sent; never the whole page. The relay does not store the text or generated audio. If the relay is unavailable, read-aloud falls back to the on-device Piper voice automatically.
- **Talk to type (dictation):** if you use it, ReadTune turns on Chrome's built-in speech recognition. Chrome sends your microphone audio to Google's speech service to transcribe it — this is the browser's own engine, not ReadTune's. The transcribed text is placed into the field you're typing in. ReadTune does not record, store, or transmit the audio or transcript itself. Dictation is disabled for password fields.
- **ElevenLabs voice (optional):** only if you enter your own API key — the passage being read aloud and your key are sent from your browser to `https://api.elevenlabs.io` to generate audio and word timings. ElevenLabs' handling of that request is covered by ElevenLabs' own privacy policy. Choosing **Remove key** also removes ReadTune's optional permission to contact the ElevenLabs API.
- **AI reading help (optional):** the Ask AI rail is available in Reader View and PDF mode. Merely opening the rail sends nothing. When you explicitly request a Summary, Ask, Define, Explain, or Annotate action, ReadTune first uses on-device AI when a compatible Chrome model is already ready. Otherwise, the relevant article text — or relevant **locally extracted PDF text** — is sent to **ReadTune's AI relay**, which forwards it to a third-party AI model and returns the result. A typed Ask question is sent with the selected context. The **PDF file itself is never sent**. A typed question can be more personal than reading text, so only send what you're comfortable sharing.
- **AI response retention:** only generated article **summaries** are eligible for ReadTune's shared 30-day response cache. Typed Ask answers, Define/Explain results, annotations, and other interactive AI responses are not written to that cache. Cached summaries are keyed to a hash of the article content rather than a ReadTune account. ReadTune does not send the article URL to its AI relay.
- **Simplify** (the passage-rewrite pill) is on-device only for now. If your browser does not already have a ready local model, it says so instead of sending the selection to ReadTune's AI relay.

## Service providers and infrastructure

When an optional network feature is used, the current service path may involve:

- **Vercel** — hosts `readtune.tech` and the ReadTune AI / Premium voice relays.
- **Upstash Redis** — when configured, stores shared article-summary cache entries and short-lived rate-limit counters. Interactive Ask/Define/Explain/Annotate responses and Premium voice audio/text are not stored in that response cache.
- **OpenRouter** — one route for AI and Premium voice requests; OpenRouter may route the request to the configured model or voice provider under the relay's provider settings.
- **Ollama Cloud** — an optional AI-provider route when configured.
- **Deepgram and Fish Audio through OpenRouter, and Cartesia directly** — current Premium voice provider routes when configured/available.
- **ElevenLabs** — only when you add your own key and choose ElevenLabs read-aloud.
- **Hugging Face** — only to download an optional on-device voice model; reading text is not sent with that download.
- **Google/Chrome speech recognition** — only when you use Talk to type.

Provider availability and routing can change as upstream services change. ReadTune's code and this policy should be updated before a materially different data-sharing route is shipped.

## Abuse prevention and request metadata

ReadTune's relays use the requesting network address only to derive a short
pseudonymous HMAC fingerprint for per-client rate limiting. The raw address is
not written into ReadTune's Redis rate-limit key. Minute-level counters expire
automatically. Vercel and other infrastructure providers may separately process
ordinary request, security, and network logs as part of operating their
services.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` + `scripting` | To read or reformat the current page's text — and to insert dictated text — only when you ask (Reader View, "Restyle this page", or Talk to type) |
| `storage` | To save your settings and reading position on your device |
| host access to `readtune.tech/api` | Optional cloud-routed AI actions and the optional Premium voice |
| host access to `huggingface.co` (optional) | Only if you select one of the extra on-device voices, to download its model once |
| host access to `api.elevenlabs.io` (optional) | Only if you enable the ElevenLabs voice; removed when you remove the key |
| host access to a specific site (optional) | Only if you turn on "auto-open" / "auto-restyle" for that site |

## Chrome Web Store Limited Use

ReadTune's use of information is limited to providing or improving its disclosed reading-accessibility features and related security/operational purposes. ReadTune does not sell user data, use it for advertising, creditworthiness, or lending, or transfer it for unrelated purposes. The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## What ReadTune does not do

The extension does not sell or share data, run analytics, create an account, send your browsing history to its creator, or use data for advertising, creditworthiness, or lending.

## The readtune.tech website

The public marketing pages at `readtune.tech` are hosted on Vercel. ReadTune's optional relay endpoints are hosted there as well. ReadTune does **not** load a pageview analytics SDK, advertising pixel, or product-tracking script on those pages. Like ordinary web hosting, Vercel may process basic request and security logs needed to deliver the site; ReadTune does not use those logs to build reader profiles or connect website visits to extension activity. **Nothing you read inside the extension is visible to the marketing website.**

## Your control

Remove saved data with **Reset to defaults** in the settings panel, turn off "auto-open" / "auto-restyle" to return optional site permissions, remove an ElevenLabs key to return that optional host permission, or remove the extension to clear its local extension storage.

## Contact

Questions or bug reports: open an issue at <https://github.com/Engineer9118brov2/readtune/issues>.