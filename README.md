# ReadTune

A free Chrome extension that runs a **short preference check** — times you, asks a comprehension question, asks how it felt — to suggest a reading setup worth trying, then applies that profile to any article or PDF and tracks whether the same result keeps coming up.

No account, no paywall, no analytics; your reading and profile stay on your device. Built for **GatewayHacks 2026** — Accessibility & Health track.

---

## Why it's different

Every other reading tool — Bionic Reading, BeeLine, Helperbird, Speechify, Immersive Reader — gives you manual toggles and leaves you to guess. The ones behind a paywall or a school login gate the useful parts. **None of them try the settings with you first.**

ReadTune opens with a **~4-minute check**: one warm-up plus six short passages, each changing exactly one thing (font, spacing, bolding, or one-sentence-at-a-time). For each it records reading time, a one-question comprehension check, and a 1–5 ease rating, then compares each change against *your own* baseline — so a naturally slower reader isn't penalised — and suggests a starting profile. Reader View and PDF mode use that profile automatically, and the **Reading Lab** shows whether the same result keeps repeating or is still provisional. It's a preference check, not a diagnosis or an assessment, and the results screen says so.

The product now also ships a **research-backed starter** before calibration finishes: calmer spacing, slightly softer contrast, shorter line width, and clear labels for which features are strongly supported versus mostly personal preference.

## What it does

| | |
| --- | --- |
| **Preference check** | 1 warm-up + 5 passages (or skip), timed + cloze-checked + rated, compared against a research-backed baseline to suggest a starting profile — passages don't repeat on a retake |
| **Research-backed starter** | Opens with calmer spacing, softer contrast, shorter lines, and honest evidence labels before you fine-tune anything |
| **Reading Lab** | Shows how repeatable the result has been, retake history, Voice Fit, and which changes keep coming up |
| **Reader View** | Pulls the article out of any page (Mozilla Readability + a strict sanitizer) and re-renders it in your settings |
| **Restyle this page** | Applies your font / spacing / tint / bionic / adaptive line focus to the live page you're on — no new tab — with a small floating bar. Toggle off to restore it exactly |
| **PDF mode** | Extracts text from a PDF worksheet/handout (pdf.js) and renders it through the *same* engine |
| **Talk to type** | Dictate into any text field on any page — email, docs, forms — with spoken punctuation ("period", "new line"). `Alt+Shift+D`. Uses the browser's own speech recognition |
| **Guided setup** | Calibration now hands off into Voice Fit, so first-run users finish with both a reading profile and a free read-aloud voice |
| **Settings panel** | Everything below, live and saved, consistent across articles and PDFs |

### Reading aids

- **Fonts** — System Sans, [OpenDyslexic](https://opendyslexic.org/), [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/), [Lexend](https://www.lexend.com/)
- **Typography** — text size, line / letter / word / paragraph spacing, line width, contrast
- **Bionic bolding** — adjustable leading-letter emphasis
- **Hyphenation** — no ragged right-edge gaps; optional visible syllable breaks (`in·for·ma·tion`)
- **Reading tints** — 9 low-contrast presets + a custom colour picker
- **Remove italics**, **hide images**, **freeze animations & GIFs**

### Focus & pacing

- **Reading ruler** — an adaptive 1 / 3 / 5-line focus band that follows your line, dimming the rest
- **Paragraph focus** — dims every paragraph except the one you're on
- **One sentence at a time** — step through with the keyboard or the transport bar
- **Speed reader (RSVP)** — one word at a time at an adjustable words-per-minute, with pivot-letter alignment
- **Auto-scroll** — the page scrolls itself at your reading pace
- **Read aloud** — the current sentence and word are highlighted as it speaks:
  - **Piper natural voice** (default) — a neural voice that runs entirely on your device. The default voice (**Linden**, public domain) ships inside the extension, so it works offline with nothing to download and no permission prompt. The text being read is never uploaded
  - **ElevenLabs** (optional) — paste your own API key in the panel for a different voice with tight word timing. The key is stored only in `chrome.storage.local`; text is sent only to `api.elevenlabs.io`, only while reading. Free tier ≈ 10k characters/month; ElevenLabs accounts are 18+ (13+ with a parent)
  - There is no browser-speech fallback — if Piper can't start, read-aloud says so rather than dropping to a robotic system voice
- **Voice Fit** — the Reading Lab lets you preview the other on-device voices (**Joe**, CC0; **Kristin**, public domain) and keep the clearest. Extra voices download a one-time model (~60 MB) from Hugging Face and are cached locally

### Memory

- Your profile is saved with `chrome.storage.local` — no account
- The Reading Lab keeps your last 10 calibration runs locally so you can see what is stable vs. noisy
- Reader View **remembers where you left off** and **keeps your highlights** per page
- Optional **auto-open** or **auto-restyle** on a site you choose (asks for that site's permission only when you turn it on)

## Load it in Chrome (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and pick this folder
4. Pin **ReadTune** from the puzzle-piece menu
5. Click the icon → **Find my reading settings** to calibrate, then open an article and press **Alt+R** (Reader View) or **Alt+Shift+R** (restyle in place)

"Load unpacked" is the normal way to demo a hackathon project — no Web Store submission needed.

## Getting on the Chrome Web Store

Everything for submission is prepared: [`PRIVACY.md`](PRIVACY.md) (host it as a URL), [`store/listing.md`](store/listing.md) (description + permission justifications), and `npm run build` (writes a clean `readtune-<version>.zip` with no dev files). One-time $5 developer registration; review is typically 1–3 business days for a low-permission extension like this one. See [`store/listing.md`](store/listing.md) for the full checklist.

## Project layout

```
manifest.json          Manifest V3 — activeTab, scripting, storage; optional host perms
background.js           Service worker: Alt+R / Alt+Shift+R commands + per-site auto-open/restyle
content.js              Injected on demand to capture the current page for Reader View
inpage.js / inpage.css  "Restyle this page" — content script + its shadow-DOM control bar
popup.*                 Entry points, profile summary, and per-site automation mode chooser
lab.*                   Reading Lab — repeatability, stability, retake history
reader.* / pdf.*        Reader View / PDF mode (thin — most logic is shared/)
calibration.*           The calibration test + scoring
shared/
  settings.js           Profile schema, defaults, storage wrappers, per-page + per-site memory,
                        read-aloud config (including optional voice credentials — local storage only)
  render.js             The one formatting engine: sanitize → structure → typography → bionic →
                        syllables → sentence-wrap → pacing (flow / sentence / RSVP)
  inpage-style.js       Generates the CSS the in-page restyle injects (scoped to html.rt-inpage)
  aids.js               Ruler, progress bar, paragraph focus, resume position, highlights
  tts.js                Read-aloud: Piper (default) + ElevenLabs (own-key) backends,
                        sentence + word highlighting
  piper.js / piper/     On-device neural voice — client, Web Worker, voice list
  elevenlabs.js         ElevenLabs API (voices, /with-timestamps synth, alignment → word index)
  transport.js          The floating playback bar
  controls.js           The settings panel
  screen.js             Wires a reading view to the panel / transport / tts / aids
  pdftext.js            PDF text-layer → paragraphs
  theme.css / controls.css
lib/                    Bundled third-party code (Manifest V3 forbids remote scripts)
test/                   Browser test harness (not shipped)
```

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it's built and *why each part is the way it is*
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — the evidence behind each reading aid, including where it's weak
- [`docs/DEVPOST.md`](docs/DEVPOST.md) / [`docs/VIDEO.md`](docs/VIDEO.md) / [`docs/VIDEO_PLAN.md`](docs/VIDEO_PLAN.md) — submission writeup, demo script, and participant-video production plan
- [`docs/JUDGE_PROMPT.md`](docs/JUDGE_PROMPT.md) — reviewer prompts to paste into a fresh session
- [`docs/LAUNCH.md`](docs/LAUNCH.md) — post-launch growth plan and community list
- [`docs/PIPER.md`](docs/PIPER.md) — plan for on-device neural read-aloud (spike passed)
- [`docs/SCHOOL-DISTRICTS.md`](docs/SCHOOL-DISTRICTS.md) — getting unblocked in a managed school environment
- [`store/listing.md`](store/listing.md) — Chrome Web Store submission pack (checklist, long description, permission justifications)

## Tests

```
npm run check     # syntax, manifest, asset references
npm run harness   # ~110 behavioural assertions in headless Chrome
npm test          # both
npm run build     # clean Web Store zip
```

CI runs all of the above on every push (`.github/workflows/ci.yml`).

## Bundled libraries

Manifest V3 blocks remote scripts, so these are committed into `lib/`:

- **[Mozilla Readability](https://github.com/mozilla/readability)** — Apache-2.0
- **[pdf.js](https://github.com/mozilla/pdf.js)** (`pdfjs-dist` 3.11.174) — Apache-2.0
- **[Hypher](https://github.com/bramstein/hypher)** + en-US TeX patterns (hyphenation) — BSD
- **OpenDyslexic**, **Atkinson Hyperlegible**, **Lexend** fonts — SIL Open Font License 1.1
- **[onnxruntime-web](https://github.com/microsoft/onnxruntime)** 1.18 + **[@mintplex-labs/piper-tts-web](https://github.com/Mintplex-Labs/piper-tts-web)** glue (Piper runtime) — MIT
- **[espeak-ng](https://github.com/espeak-ng/espeak-ng)** as a WebAssembly phonemizer (`piper_phonemize`) — **GPL-3.0-or-later**; license text and a written source offer are in [`lib/piper/espeak-ng.LICENSE.txt`](lib/piper/espeak-ng.LICENSE.txt). It runs as an isolated wasm module (text in, phonemes out); ReadTune as a whole stays MIT. See [`docs/PIPER.md`](docs/PIPER.md).
- Bundled **Piper voices** — Linden / Joe / Kristin, all public domain or CC0

License texts are in `lib/`.

## Notes & limits

- Reader View needs a real article — home pages, feeds and web apps show a clear message, not a broken page.
- PDF mode needs selectable text. Scans (images of pages) show a "no text to pull out" message.
- Sentence splitting, syllable breaks, and PDF paragraph reconstruction are heuristic — they handle the common cases well, not every edge case.
- Piper's word highlight is a proportional estimate because its local model does not emit word timestamps; sentence highlighting stays exact.
- `chrome://` pages and the Chrome Web Store block all extensions, including this one.

## License

MIT — see [LICENSE](LICENSE). Bundled libraries keep their own licenses.
