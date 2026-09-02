# Chrome Web Store — submission pack

Copy-paste, field by field, in dashboard order. Everything the review needs is
here. The extension ID (draft) is `elcekcoadkgmdjboaflcbcbebghpgpn`.

## What still blocks "Submit for review"

The **Privacy** tab is empty. Fill every field in the "Privacy tab" section
below and the Submit button unlocks. The **Store listing** Description currently
holds an older draft (it says "measures which settings actually help you read",
"Nothing leaves your device", and "built-in browser voice") — replace it with
the Description below, which matches the shipped extension (Piper on-device
read-aloud, no browser-speech fallback, honest calibration language).

---

# Build tab → Package

- Upload `readtune-0.7.2.zip` (run `npm run build`). ~60 MB — the bundled
  public-domain Piper voice is most of it; this is expected and allowed.
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

No account. No subscription. No analytics. Your reading and your profile stay on your device, and read-aloud runs on-device too. It keeps working offline.

————————————————————

THE PROBLEM

Between 1 in 5 and 1 in 7 people have dyslexia. About 1 in 15 have ADHD. For many of them — and for anyone with low vision or plain eye strain — a wall of tight text on a bright white screen is slower and more tiring than it needs to be. Not because they can't read, but because the presentation is working against them.

Tools that help do exist: roomier spacing, calmer colour, a cleaner layout, text read aloud. Two problems. First, WHICH of those helps is different for every person, and most tools just hand you twenty toggles and let you guess. Second, the tools that do the most put the useful parts behind a subscription or a school-district licence — so a student who needs this and has no money or school login gets nothing.

————————————————————

WHAT READTUNE DOES DIFFERENTLY

It opens with a short check — one warm-up passage plus six that each take about a minute. Each passage changes exactly one thing versus plain text: the font, the spacing, leading-letter bolding, or showing one sentence at a time. For each one it notes your reading time, a one-question comprehension check, and a 1–5 "how did that feel" rating.

Then it compares every change against your own baseline — so a naturally slower reader isn't penalised — allows for the practice speed-up, and keeps only the changes that clear a real margin. If nothing clears the bar, it tells you that instead of inventing a winner.

The result is a reading profile: your font, size, spacing, bolding, tint, and pacing. Reader View, PDF mode, and the in-place page restyle all render through that one profile, so what the check suggested is what you get everywhere.

————————————————————

EVERYTHING IN IT — ALL FREE

Reading and layout
• Fonts chosen for legibility: OpenDyslexic, Atkinson Hyperlegible, Lexend, or your system sans
• Text size; line, letter, word and paragraph spacing; line width; a gentle contrast control
• Leading-letter ("bionic") bolding, adjustable
• Automatic hyphenation and optional visible syllable breaks (in·for·ma·tion)
• Nine calm reading tints plus a custom colour
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
• "Voice Fit" in the Reading Lab lets you preview a few on-device voices and keep the clearest; extra voices download a one-time model (~60 MB) from Hugging Face and are then cached on your device
• Optional: bring your own ElevenLabs API key for a different voice. Your key is stored only on your device; the passage is sent only to api.elevenlabs.io, only while reading

Talk to type
• Dictate into any text field on any page — email, docs, comment boxes — with spoken punctuation ("period", "comma", "new line")
• Uses Chrome's own speech recognition, which sends the audio to Google to transcribe. ReadTune does not record or store the audio or the text

Where it works
• Reader View — pulls the article out of any page and re-renders it
• "Restyle this page" — reformats the page you're already on, in place, with a small floating bar; toggle off to restore it exactly
• PDF mode — extracts text from a worksheet or handout and reads it through the same engine
• Optional per-site automation: auto-open Reader View, or auto-restyle, on a site you choose (asks for that one site's permission only when you turn it on)

Accessibility of the app itself
• A "dyslexia-friendly menus" switch renders ReadTune's own buttons, sliders and settings in OpenDyslexic — so the person who needs that font can read the controls, not only the article

Memory
• Your profile and history are saved with the browser's local storage — no account
• The Reading Lab keeps your last ~10 checks so you can see what's stable versus a close call
• Reader View remembers where you left off and keeps your highlights, per page

————————————————————

WHAT WE'RE HONEST ABOUT

Read-aloud with follow-along, roomier spacing, and softer contrast have the strongest research support. Dyslexia-specific fonts, coloured overlays and bionic bolding have mixed or weak evidence — some people clearly prefer them, but that's comfort, not a cure. ReadTune labels each feature by how well it's supported and treats the weaker ones as experiments you opt into. The check is a quick estimate from six short readings, not a clinical assessment, and it says so on the results screen.

————————————————————

PRIVACY

No ReadTune server. No account. No analytics or telemetry. Nothing is sold or shared. Your reading profile, check history, reading position and highlights are stored with Chrome's local extension storage, on your device. The extension installs asking only for activeTab, scripting, and storage.

Read-aloud runs on your device: the default voice ships inside the extension, so it needs no network. If you pick one of the other voices, its model is downloaded once from Hugging Face and cached locally — the text you read is never sent anywhere.

Two optional features send data, and only when you turn them on: Talk to type uses Chrome's built-in speech recognition, which sends your microphone audio to Google to transcribe (that is Chrome's engine, not ReadTune's). ElevenLabs read-aloud, if you add your own key, sends the passage you ask to hear and your key to your own ElevenLabs account. Nothing else, nowhere else.

Free and open source. The full code is at github.com/Engineer9118brov2/readtune
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
  1. Reader View on a real article — OpenDyslexic + a tint, the settings panel open
  2. The check's result screen — "what each change did for you", with the KEPT tags
  3. Read-aloud running — the sentence and word highlighted, transport bar visible
  4. "Restyle this page" in place — the original page reformatted, floating bar bottom-right
  5. The Reading Lab — Voice Fit + the "what repeated" timeline (shows the newest work)
  (Save as real PNG — some of the existing files in `store/assets/` are JPEG with a
  `.png` name, which the dashboard rejects.)
- **Small promo tile (440×280):** `store/assets/promo-small.png`
- **Marquee promo tile (1400×560):** `store/assets/promo-marquee.png`
- **Global promo video:** leave blank until the demo video is up.

---

# Store listing tab → Additional fields

| Field | Value |
| --- | --- |
| Official URL | `https://readtune.vercel.app/` (only if Search Console verification is done; otherwise leave **None**) |
| Homepage URL | `https://readtune.vercel.app/` |
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
ReadTune adapts how on-screen text is presented so that people who find digital reading slow or tiring — readers with dyslexia, ADHD, low vision, or eye strain — can read it more comfortably. A short built-in check suggests font, spacing, contrast and pacing settings, and the extension then applies that one reading profile wherever the user reads: a cleaned-up Reader View, PDFs, or the current web page reformatted in place. It can also read the text aloud with a voice that runs on the user's device, and, for users who find typing as hard as reading, let them enter text by voice. Every feature serves the single goal of reducing the friction between a person and the text they are trying to read or write.
```

## Permission justifications

**activeTab**
```
Used only when the user invokes ReadTune on the current tab — clicking one of its toolbar actions (Open Reader View, Restyle this page, Talk to type) or pressing its keyboard shortcut. It lets ReadTune read the current page's text once to reformat it into an accessible view, restyle it in place with the user's saved reading settings, or insert dictated text into the focused field. Access ends when the user navigates away. Nothing about the page is stored or transmitted.
```

**scripting**
```
Used together with activeTab to inject ReadTune's own content scripts on the user's explicit action: the article-extraction script (reads page markup so Reader View can rebuild it), the in-place restyle script (applies the saved reading profile to the current page and adds a small floating control bar), and the dictation script (inserts spoken text at the cursor). All scripts are bundled in the package; none are fetched or evaluated from a remote source.
```

**storage**
```
Stores, on the user's own device only: the reading profile and check history, per-page reading position and highlights, the dyslexia-friendly-menus preference, and — only if the user enables the optional ElevenLabs voice — their own API key. None of this is sent to the developer or any server.
```

**Optional host permission — https://api.elevenlabs.io/***
```
Not requested at install. Requested only if the user enters their own ElevenLabs API key to use an ElevenLabs voice for read-aloud. Used only to send the passage being read aloud, from the user's browser to the user's own ElevenLabs account, and to get back audio with word timings.
```

**Optional host permission — https://huggingface.co/* and https://*.hf.co/***
```
Not requested at install. Requested only if the user selects one of the optional extra on-device voices in the Reading Lab. Used once to download that voice's model file (neural network weights — data, not executable code), which is then cached on the device. The default voice ships inside the extension and needs no network. The text being read aloud is never transmitted.
```

**Optional host permission — *://*/***
```
Not requested at install. Requested only if the user turns on "automatically open Reader View" or "automatically restyle" for a specific site, and is scoped to that site, so its pages are reformatted on load without the user clicking each time.
```

## Are you using remote code?

**Answer: No, I am not using remote code.**

Reasoning (keep for your reference; not pasted anywhere): every piece of
executable code — all JavaScript, and all WebAssembly (`piper_phonemize.wasm`,
`ort-wasm-simd.wasm`) — ships inside the package. Nothing is loaded with a
remote `<script>`, a remote dynamic `import()`, or `eval()` of fetched text. The
`wasm-unsafe-eval` CSP entry is for instantiating the *bundled* wasm and does
not by itself count as remote code. The only files fetched at runtime are
optional neural-voice model weights from Hugging Face — a data file the bundled
runtime reads, not code — and they are covered under the huggingface.co host
permission above.

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
ReadTune processes the text of the page or file the user chooses to read, on the user's device, to reformat it — this is not sent to the developer. Two optional, user-initiated features transmit content off the device: "Talk to type" turns on Chrome's built-in speech recognition, which sends microphone audio to Google's speech service to transcribe (Chrome's engine, not ReadTune's); "ElevenLabs read-aloud", if the user adds their own API key, sends the passage to be spoken and that key from the user's browser to the user's own ElevenLabs account. The API key is stored only in local storage on the device. ReadTune operates no server and receives none of this data.
```

## Certifications — check all three (all true)

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL
```
https://readtune.vercel.app/privacy.html
```

---

# Notes for later (do not block submission)

- **espeak-ng (GPLv3)** is bundled inside the phonemizer wasm. `lib/piper/espeak-ng.LICENSE.txt` (shipped in the zip) carries the full licence text and a written offer of source. ReadTune's position — it runs as an isolated wasm module, so ReadTune stays MIT — is written up in `docs/PIPER.md`. Not a store-policy issue; noted for completeness.
- The **screenshots** in `store/assets/` predate the Reading Lab, Piper Voice Fit, the dyslexia-friendly-menus switch, and dictation. Re-shoot before submitting (see the suggested set above).
- **Timing:** first review for a new developer is usually 1–3 business days, occasionally up to a few weeks. For an Oct 2 deadline, submit by ~Sept 20. You do not need the store to demo — Load Unpacked works.
- If rejected, the email names the exact policy. Fix and resubmit; each resubmit is a fresh (usually faster) review.
