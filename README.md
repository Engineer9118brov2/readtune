# ReadTune

A free Chrome extension that **measures which reading settings actually work for you** — a short calibration test that times you, checks comprehension, and asks how it felt — then applies the winning combination to any article or PDF.

No login, no paywall, nothing leaves your device. Built for **GatewayHacks 2026** — Accessibility & Health track.

---

## Why it's different

Every other reading tool — Bionic Reading, BeeLine, Helperbird, Speechify, Immersive Reader — gives you manual toggles and leaves you to guess. The ones behind a paywall or a school login gate the useful parts. **None of them test what actually helps you read.**

ReadTune opens with a **~2-minute calibration test**: five short passages, each shown a different way (font, spacing, bolding, one-sentence-at-a-time). For each it records reading time, a one-question comprehension check, and a 1–5 ease rating, then scores every style against *your own* results — so a naturally slower reader isn't penalised — and saves the winner. Reader View and PDF mode use that profile automatically, and the results screen shows the proof ("you read ~20% faster with this style").

## What it does

| | |
| --- | --- |
| **Calibration test** | 5 passages, timed + comprehension-checked + rated, scored to pick your profile |
| **Reader View** | Pulls the article out of any page (Mozilla Readability + a strict sanitizer) and re-renders it in your settings |
| **Restyle this page** | Applies your font / spacing / tint / bionic / ruler to the live page you're on — no new tab — with a small floating bar. Toggle off to restore it exactly |
| **PDF mode** | Extracts text from a PDF worksheet/handout (pdf.js) and renders it through the *same* engine |
| **Settings panel** | Everything below, live and saved, consistent across articles and PDFs |

### Reading aids

- **Fonts** — Standard, [OpenDyslexic](https://opendyslexic.org/), [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/), [Lexend](https://www.lexend.com/)
- **Typography** — text size, line / letter / word / paragraph spacing, line width, contrast
- **Bionic bolding** — adjustable leading-letter emphasis
- **Hyphenation** — no ragged right-edge gaps; optional visible syllable breaks (`in·for·ma·tion`)
- **Reading tints** — 9 low-contrast presets + a custom colour picker
- **Remove italics**, **hide images**, **freeze animations & GIFs**

### Focus & pacing

- **Reading ruler** — a highlight band that follows your line, dimming the rest
- **Paragraph focus** — dims every paragraph except the one you're on
- **One sentence at a time** — step through with the keyboard or the transport bar
- **Speed reader (RSVP)** — one word at a time at an adjustable words-per-minute, with pivot-letter alignment
- **Auto-scroll** — the page scrolls itself at your reading pace
- **Read aloud** — the current sentence and word are highlighted as it speaks. Two voices:
  - **Browser voice** (default) — your OS speech engine, no key, no network
  - **ElevenLabs** (optional) — paste your own API key in the panel for much better voices with tight word timing. The key is stored only in `chrome.storage.local`; text is sent only to `api.elevenlabs.io`, only while reading. Free tier ≈ 10k characters/month; ElevenLabs accounts are 18+ (13+ with a parent)

### Memory

- Your profile is saved with `chrome.storage.local` — no account
- Reader View **remembers where you left off** and **keeps your highlights** per page
- Optional **auto-open on a site** you choose (asks for that site's permission only when you turn it on)

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
background.js           Service worker: Alt+R / Alt+Shift+R commands + per-site auto-open
content.js              Injected on demand to capture the current page for Reader View
inpage.js / inpage.css  "Restyle this page" — content script + its shadow-DOM control bar
popup.*                 Entry points, profile summary, per-site auto-open toggle
reader.* / pdf.*        Reader View / PDF mode (thin — most logic is shared/)
calibration.*           The calibration test + scoring
shared/
  settings.js           Profile schema, defaults, storage wrappers, per-page + per-site memory,
                        read-aloud config (incl. the ElevenLabs key — local storage only)
  render.js             The one formatting engine: sanitize → structure → typography → bionic →
                        syllables → sentence-wrap → pacing (flow / sentence / RSVP)
  inpage-style.js       Generates the CSS the in-page restyle injects (scoped to html.rt-inpage)
  aids.js               Ruler, progress bar, paragraph focus, resume position, highlights
  tts.js                Read-aloud: browser + ElevenLabs backends, sentence + word highlighting
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
- [`docs/DEVPOST.md`](docs/DEVPOST.md) / [`docs/VIDEO.md`](docs/VIDEO.md) — submission writeup + demo script

## Tests

```
npm run check     # syntax, manifest, asset references
npm run harness   # ~50 behavioural assertions in headless Chrome
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

License texts are in `lib/`.

## Notes & limits

- Reader View needs a real article — home pages, feeds and web apps show a clear message, not a broken page.
- PDF mode needs selectable text. Scans (images of pages) show a "no text to pull out" message.
- Sentence splitting, syllable breaks, and PDF paragraph reconstruction are heuristic — they handle the common cases well, not every edge case.
- Read-aloud uses whatever voices your browser/OS provides; word-level highlighting depends on the voice reporting word boundaries (most local voices do).
- `chrome://` pages and the Chrome Web Store block all extensions, including this one.

## License

MIT — see [LICENSE](LICENSE). Bundled libraries keep their own licenses.
