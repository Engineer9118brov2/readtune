# Chrome Web Store — submission pack

Copy-paste, field by field, in dashboard order. Everything the review needs is
here. The extension ID (draft) is `elcekcoadkgmdjboaflcbcbebghpgpn`.

## What still blocks "Submit for review"

1. The **Privacy** tab is empty — fill every field in the "Privacy tab" section
   below and the Submit button unlocks.
2. The **Store listing** Description still holds an older draft — replace it with
   the Description block below (it matches 0.9.5: Piper on-device read-aloud, the
   word-lookup and line-tint additions, and the optional AI helpers).
3. Upload `readtune-0.9.5.zip` (`npm run build`).

---

# Build tab → Package

- Upload `readtune-0.9.5.zip` (run `npm run build`). ~60 MB — the bundled
  Piper voice is most of it; this is expected.
- "Verified CRX uploads": optional. Fine to skip for now.

---

# Store listing tab

## Title
```
ReadTune
```

## Summary  (pulled from the package `description`, ≤132 chars — already set)
```
A quick check suggests reading settings to try, then applies them to any article, PDF, or web page. On-device read-aloud.
```

## Description  (paste this whole block, replacing what's there)

```
ReadTune is a free reading tool. A short check suggests a reading setup worth trying — font, spacing, contrast, pacing — and then applies it to any article, PDF, or web page.

No account. No subscription. No extension analytics. Your reading profile stays on your device, and read-aloud runs on-device by default. It keeps working offline.

————————————————————

THE PROBLEM

Many people find dense digital text tiring or difficult to track, including some readers with dyslexia, ADHD, low vision, or eye strain. ReadTune is built to reduce presentation friction without claiming that one setup works for everyone.

Tools that help do exist: roomier spacing, calmer colour, a cleaner layout, text read aloud. Two problems. First, WHICH of those helps is different for every person, and most tools just hand you twenty toggles and let you guess. Second, the tools that do the most put the useful parts behind a subscription or a school-district licence — so a student who needs this and has no money or school login gets nothing.

————————————————————

WHAT READTUNE DOES DIFFERENTLY

It opens with a short check — a warm-up plus six short passages, about four minutes, or skip it and start reading on a evidence-informed default. Standard text appears twice on different passages; the other four passages each change exactly one thing versus that default: the font, the spacing, or leading-letter bolding. The order is shuffled. For each one it notes your reading time, a fill-in-the-blank check that a skim can't pass, and a 1–5 "how did that feel" rating. Passages don't repeat if you retake it.

Then it compares every change against your own baseline — so a naturally slower reader isn't penalised — allows for the practice speed-up, and keeps only the changes that clear a real margin. If nothing clears the bar, it tells you that instead of inventing a winner.

The result is a reading profile: your font, size, spacing, bolding, tint, and pacing. Reader View, PDF mode, and the in-place page restyle all render through that one profile, so what the check suggested is what you get everywhere.

————————————————————

EVERYTHING IN IT — ALL FREE

Reading and layout
• Fonts chosen for legibility: OpenDyslexic, Atkinson Hyperlegible, Lexend, or your system sans
• Text size; line, letter, word and paragraph spacing; line width; a gentle contrast control
• Leading-letter ("bionic") bolding, adjustable
• Automatic hyphenation, plus real syllable breaks you can show inline (in·for·ma·tion) or pull up one word at a time — double-click any word for its syllables and a "hear it" button
• Nine calm reading tints plus a custom colour; an optional line tint that alternates a faint wash between lines to help you keep your place down the page
• Remove italics, hide images, freeze animated GIFs

Focus and pacing
• An adaptive 1 / 3 / 5-line reading ruler that follows your line and dims the rest
• Paragraph focus — everything but the paragraph you're on is dimmed
• One sentence at a time, stepped with the keyboard or the transport bar
• Speed reader — one word at a time, adjustable words-per-minute
• Auto-scroll at your reading pace

Read aloud
• A natural neural voice (Piper) that runs entirely on your device. The default voice ships inside the extension, so it works offline with nothing to download and no permission prompt
• The current sentence and word are highlighted as it speaks, in your chosen font
• "Voice Fit" in the Reading Lab lets you preview a few on-device voices and keep the clearest; extra voices download a one-time model from Hugging Face and are then cached on your device
• Optional "Premium voice" — a hosted voice through ReadTune's relay, no account and no key. Each sentence as it's read is sent to synthesise it, plus the next one prepared a moment ahead; it falls back to the on-device voice automatically if the relay is busy
• Optional: bring your own ElevenLabs API key for a different voice. Your key is stored only on your device; the passage is sent only to api.elevenlabs.io while reading. Removing the key also returns that optional host permission

Talk to type
• Dictate into normal editable text fields on a page — email, docs, comment boxes — with spoken punctuation ("period", "comma", "new line")
• Password fields are intentionally blocked
• Uses Chrome's own speech recognition, which sends microphone audio to Google to transcribe. ReadTune does not record or store the audio or transcript

Reading help (optional AI)
• Ask AI is available in Reader View and PDF mode for summaries, article/PDF questions, definitions, explanations, and annotations
• Opening the AI rail sends nothing. Where Chrome already has a compatible on-device model ready, ReadTune uses it. Otherwise, only the relevant article text — or relevant text extracted locally from the PDF — and any typed Ask question are sent through ReadTune's AI relay to generate the response
• The PDF file itself is never uploaded
• Only article summaries are eligible for ReadTune's shared 30-day response cache. Typed Ask answers, Define/Explain results, and annotations are not stored in that cache
• Plain-language "Simplify" for a passage you select is on-device only; if the browser has no ready model it says so rather than sending your selection anywhere

Where it works
• Reader View — pulls the article out of any page and re-renders it
• "Restyle this page" — reformats the page you're already on, in place, with a small floating bar; toggle off to restore it exactly
• If the page publishes its own "Listen to this article" narration, ReadTune can surface that source audio rather than reading over it
• PDF mode — extracts selectable text locally from a worksheet or handout and reads it through the same engine; the file itself is not uploaded
• Optional per-site automation: auto-open Reader View, or auto-restyle, on a site you choose (asks for that one site's permission only when you turn it on)

Accessibility of the app itself
• A "dyslexia-friendly menus" switch makes ReadTune's own buttons, sliders and settings roomier and uses the high-legibility Atkinson/Lexend UI stack

Memory
• Your profile and history are saved with the browser's local storage — no account
• The Reading Lab keeps recent checks so you can see what's stable versus a close call
• Reader View remembers where you left off and keeps your highlights, per page

————————————————————

WHAT WE'RE HONEST ABOUT

ReadTune is informed by accessibility research. Read-aloud with follow-along and spacing have stronger support than many visual preference features. Dyslexia-specific fonts, coloured overlays and bionic bolding have mixed or weak evidence — some people clearly prefer them, but that's comfort, not a cure. ReadTune labels each feature by how well it's supported and treats the weaker ones as experiments you opt into. The check is a quick preference estimate from six scored short readings plus a warm-up. It is not a diagnosis, clinical assessment, medical device, or treatment, and it does not guarantee faster reading or better comprehension.

————————————————————

PRIVACY

No account. No extension analytics or telemetry. Nothing is sold. Your reading profile, check history, reading position and highlights are stored with Chrome's local extension storage, on your device. The extension installs asking for activeTab, scripting, storage, and one required host permission for ReadTune's own relay on readtune.tech, used only by explicitly requested cloud AI actions and the optional Premium voice.

Read-aloud uses the bundled on-device Piper voice by default. Optional extra on-device voices download a model file from Hugging Face once; the reading text is not sent for those local voices.

Optional features send data only when you choose them. Talk to type uses Chrome's built-in speech recognition, which sends microphone audio to Google to transcribe; password fields are blocked. ElevenLabs read-aloud, if you add your own key, sends the passage and key directly to your ElevenLabs account. Premium voice sends each sentence as it is spoken to ReadTune's text-to-speech relay, which forwards it to a third-party voice provider and does not store the text or generated audio.

Ask AI is available in Reader View and PDF mode. Opening the panel sends nothing. Where Chrome has compatible on-device AI already ready, it can run locally. Otherwise, the relevant article text — or relevant text extracted locally from a PDF — and any typed Ask question are sent through ReadTune's relay. Current relay infrastructure/providers may include Vercel, Upstash Redis for summary caching/rate limiting, OpenRouter and its configured model providers, and Ollama Cloud when configured. The PDF file itself is never uploaded. Only article summaries are eligible for the shared 30-day response cache; typed Ask answers, Define/Explain results, and annotations are not stored in that cache. The article URL is not sent to the AI relay. For abuse prevention, the relay derives a short pseudonymous rate-limit identifier from the requesting network address; the raw address is not written into ReadTune's Redis rate-limit key.

Free and open source. The full code, Terms, Privacy Policy, and third-party license notices are available from the ReadTune project.
```

## Category
```
Accessibility
```

## Language
```
English (United States)
```

---

# Store listing tab → Graphic assets

- **Store icon (128×128):** upload `icons/icon128.png`.
- **Screenshots (1280×800 PNG, need ≥1, up to 5).** Suggested set, most-persuasive first:
  1. Calibration result — the clearest signal / kept settings
  2. Reader View with the polished settings rail open
  3. Ask AI running beside a real article
  4. Read-aloud running — sentence and current-word highlight visible
  5. Reading Lab / repeatability view
  (Save as real PNG — some older files in `store/assets/` may be JPEG data with a `.png` name, which the dashboard rejects.)
- **Small promo tile (440×280):** `store/assets/promo-small.png`
- **Marquee promo tile (1400×560):** `store/assets/promo-marquee.png`
- **Global promo video:** add the final demo video when ready.

---

# Store listing tab → Additional fields

| Field | Value |
| --- | --- |
| Official URL | `https://readtune.tech/` (only if Search Console verification is done; otherwise leave **None**) |
| Homepage URL | `https://readtune.tech/` |
| Support URL | `https://github.com/Engineer9118brov2/readtune/issues` |
| Mature content | No |

---

# Distribution tab

- Visibility: **Public**
- Regions: **All regions**
- Pricing: **Free**

---

# Privacy tab  ← this is what unblocks Submit

## Single purpose description
```
ReadTune adapts how on-screen text is presented so that people who find digital reading slow or tiring — readers with dyslexia, ADHD, low vision, or eye strain — can read it more comfortably. A short built-in check suggests font, spacing, contrast and pacing settings, and the extension then applies that one reading profile wherever the user reads: a cleaned-up Reader View, PDFs, or the current web page reformatted in place. It can also read the text aloud with a voice that runs on the user's device and provide optional reading help. Every feature serves the single goal of reducing the friction between a person and the text they are trying to read or write.
```

## Permission justifications

**activeTab**
```
Used only when the user invokes ReadTune on the current tab — clicking one of its toolbar actions (Open Reader View, Restyle this page, Talk to type) or pressing its keyboard shortcut. It lets ReadTune read the current page's text once to reformat it into an accessible view, restyle it in place with the user's saved reading settings, or insert dictated text into the focused non-password field. Access ends when the user navigates away. Optional AI network behavior is separately disclosed below.
```

**scripting**
```
Used together with activeTab to inject ReadTune's own content scripts on the user's explicit action: the article-extraction script, the in-place restyle script, and the dictation script. All scripts are bundled in the package; none are fetched or evaluated from a remote source.
```

**storage**
```
Stores, on the user's own device: the reading profile and check history, per-page reading position and highlights, the dyslexia-friendly-menus preference, short-lived Reader handoffs when session storage is unavailable, and — only if the user enables it — their own ElevenLabs API key. The stored reading profile/history is not sent to the developer.
```

**Required host permission — https://readtune.tech/api/***
```
Used by two optional, user-selected features, only when their request is made:

1. AI reading help (Reader View and PDF mode). Opening the AI panel sends nothing. Where the browser already has compatible on-device AI ready, ReadTune can run locally. Otherwise, the relevant article text — or relevant text extracted locally from a PDF — is sent to this ReadTune-operated endpoint, together with a typed Ask question when applicable. The endpoint forwards that content to a third-party AI model and returns generated text. The PDF file itself is never uploaded. Only article summaries are eligible for a shared 30-day response cache; typed Ask answers, Define/Explain results, and annotations are not stored in that cache.

2. Premium voice for read-aloud (off by default; the bundled on-device voice is the default). When selected, each sentence as it is read aloud is sent to a ReadTune-operated endpoint that forwards it to a third-party text-to-speech provider and returns audio. Only the sentence currently being spoken — and the next one prepared ahead — is sent; not the whole page. The relay does not store the text or generated audio. If the endpoint is unavailable the extension falls back to the on-device voice automatically.

No ReadTune account is required for either feature.
```

**Optional host permission — https://api.elevenlabs.io/***
```
Not requested at install. Requested only if the user enters their own ElevenLabs API key for read-aloud. Used to send the passage being read aloud and the key from the user's browser to the user's ElevenLabs account, then receive audio and word timings. ReadTune returns this optional host permission when the user removes the key.
```

**Optional host permission — https://huggingface.co/* and https://*.hf.co/***
```
Not requested at install. Requested only if the user selects one of the optional extra on-device voices in the Reading Lab. Used once to download that voice's model weights, which are then cached on the device. The default voice ships inside the extension and needs no network. The text being read aloud is never transmitted for these on-device voices.
```

**Optional host permission — *://*/***
```
Not requested at install. Requested only if the user turns on "automatically open Reader View" or "automatically restyle" for a specific site, and is scoped to that site. The permission is returned when the user disables automation for that origin.
```

## Are you using remote code?

**Answer: No, I am not using remote code.**

Reasoning (keep for your reference; not pasted anywhere): every piece of
executable code — all JavaScript, and all WebAssembly (`piper_phonemize.wasm`,
`ort-wasm-simd.wasm`) — ships inside the package. Nothing is loaded with a
remote `<script>`, a remote dynamic `import()`, or `eval()` of fetched text. The
`wasm-unsafe-eval` CSP entry is for instantiating bundled wasm and does not by
itself count as remote code. Files fetched at runtime are data, not application
code: optional neural-voice model weights from Hugging Face. ReadTune's AI and
Premium voice endpoints exchange JSON/text/audio, never executable code.

*If a reviewer pushes back and you want to switch the answer to "Yes", paste
this as the justification:*
```
The only content fetched at runtime is an optional neural text-to-speech voice model (ONNX weights) downloaded once from Hugging Face when the user selects a non-default voice, and cached locally. It is data consumed by the bundled onnxruntime-web engine, not executable JavaScript or WebAssembly. All application code and all wasm binaries are included in the package. No remote scripts, remote modules, or eval() of remote strings are used.
```

## Data usage — which boxes to check

Check **exactly these two**:

- ☑ **Website content** — "text, images, sounds, videos, or hyperlinks"
- ☑ **Authentication information** — (covers the optional ElevenLabs API key)

Leave every other box unchecked (no PII, no health info, no financial info, no
personal communications, no location, no web history, no user activity).

If the dashboard gives a free-text box for the disclosure, use:
```
ReadTune processes the text of the page or PDF the user chooses to read on the user's device to reformat it. The PDF file itself is never uploaded. Optional user-initiated features can transmit content off the device: Talk to type uses Chrome's built-in speech recognition, which sends microphone audio to Google's speech service to transcribe (password fields are blocked); ElevenLabs read-aloud, if the user adds their own key, sends the passage and key directly to their ElevenLabs account; Premium voice sends each sentence being spoken to a ReadTune-operated relay, which forwards it to a third-party text-to-speech provider and does not store the text or audio; and cloud-routed AI actions send only the relevant article text or locally extracted PDF text, plus a typed Ask question when applicable, to a ReadTune-operated relay which forwards it to a third-party AI model. Opening the AI panel sends nothing. Only article summaries are eligible for a shared 30-day response cache; typed Ask answers, Define/Explain results, and annotations are not stored in that cache. The default read-aloud voice is on-device.
```

## Certifications — check all three (all true)

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL
```
https://readtune.tech/privacy.html
```

---

# Notes for later (do not block submission)

- **espeak-ng (GPLv3)** is bundled inside the phonemizer wasm. `lib/piper/espeak-ng.LICENSE.txt` carries the full license text and a source-offer notice. Its treatment for a commercial distribution should receive legal review; `docs/PIPER.md` records the technical integration and replacement plan.
- Re-shoot the **screenshots** after the final UI/media pass using the suggested set above.
- **Timing:** review timing varies. Submit early enough to leave room for a rejection/fix/resubmit cycle.
- If rejected, the email should identify the policy area to address; fix it and resubmit.