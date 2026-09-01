# Chrome Web Store — submission pack

Everything you need to paste into the Developer Dashboard.

## Is everything ready to upload? — checklist

| Item | State | Notes |
| --- | --- | --- |
| Extension package | ✅ ready | `npm run build` → `readtune-<version>.zip`, ~0.8 MB, dev files stripped |
| Store icon (128×128 PNG) | ✅ ready | `icons/icon128.png` |
| Toolbar icons (16 / 48 / 128) | ✅ ready | in the package, declared in manifest |
| Screenshots (≥1, 1280×800) | ✅ usable | 4 in `store/assets/`; predate newest features — see note below |
| Small promo tile (440×280) | ✅ ready | `store/assets/promo-small.png` |
| Marquee promo tile (1400×560) | ✅ ready | `store/assets/promo-marquee.png` |
| Privacy policy URL | ✅ live | https://readtune.vercel.app/privacy.html |
| Homepage URL | ✅ live | https://readtune.vercel.app/ |
| Support URL | ✅ | https://github.com/Engineer9118brov2/readtune/issues |
| Short + long description | ✅ ready | below |
| Permission justifications | ✅ ready | below |
| Data-use disclosures | ✅ ready | below |
| $5 developer registration | ⬜ **you must do this** | one-time, any Google account |
| Promo video | ⬜ optional | leave blank until the demo video is up |

Two small cleanups worth doing before upload (neither blocks review):
- `store/assets/01/02/04-*.png` are actually JPEG data with a `.png` name. Re-export as real PNG or rename to `.jpg` so the file type matches.
- The screenshots don't show the Reading Lab, the research-backed starter, or the dyslexia-friendly-menus switch. Fine to launch with; re-shoot when there's time.

## Before you start

1. **Register** at https://chromewebstore.google.com/devconsole — one-time **$5** fee, any Google account. Do this first; it can take a few minutes to activate.
2. **Build the package**: `npm run build` → produces `readtune-<version>.zip` at the repo root, with dev files and licenses' source stripped out. Upload that zip.
3. **Use the hosted pages**: the public homepage is `https://readtune.vercel.app/` and the privacy policy is `https://readtune.vercel.app/privacy.html`.

## Store listing fields

**Name:** ReadTune

**Summary (132 chars max):** — pick one

> Free, private reading assistant: a quick test finds the settings that help you read, then applies them to any article, PDF, or page.

*(128 chars. Alternatives:)*
> Free, private, no account. Measures which reading settings actually help you, then uses them on any article, PDF, or web page. *(126)*
> The free reading tool that tests what helps you read — spacing, fonts, read-aloud — then applies it everywhere. No login, no tracking. *(131)*

**Category:** Accessibility

**Language:** English

---

### Short description (the long one — up to 16,000 chars; this is ~4,600)

Paste this into the "Description" field. It leads with free + private because that
is the wedge: the tools that do the most (Speechify, Immersive Reader, Helperbird)
are paywalled or behind a school login, and ReadTune is neither.

> **ReadTune is a free reading tool that measures which settings actually help *you* read — then applies them everywhere.**
>
> No account. No subscription. No analytics. Nothing leaves your device. It keeps working offline.
>
> ---
>
> **THE PROBLEM**
>
> Between 1 in 5 and 1 in 7 people have dyslexia. About 1 in 15 have ADHD. For all of them, a wall of tight text on a bright white screen is slower and more tiring than it needs to be — not because they can't read, but because the presentation is working against them.
>
> Tools that help do exist: roomier spacing, calmer colour, a cleaner layout, text read aloud. Two problems. First, *which* of those helps is different for every person, and most tools just hand you twenty toggles and let you guess. Second, the tools that do the most put the useful parts behind a subscription or a school-district licence — so a student who needs this and doesn't have money or a school login gets nothing.
>
> ---
>
> **WHAT READTUNE DOES DIFFERENTLY**
>
> It opens with a short calibration test — one warm-up plus six ~1-minute passages. Each passage changes exactly one thing versus plain text: the font, the spacing, leading-letter bolding, or showing one sentence at a time. For each one it records your reading time, a one-question comprehension check, and a 1–5 "how did that feel" rating.
>
> Then it scores every change against *your own* baseline — so a naturally slower reader isn't penalised — de-trends the practice speed-up, and keeps only the changes that clear a real margin. If nothing clears the bar, it tells you that honestly instead of inventing a winner.
>
> The result is a reading profile: your font, size, spacing, bolding, tint, and pacing. Reader View, PDF mode, and the in-place page restyle all render through that one profile, so what you calibrated is exactly what you get everywhere.
>
> ---
>
> **EVERYTHING IN IT — ALL FREE**
>
> Reading & layout
> • Fonts chosen for legibility: OpenDyslexic, Atkinson Hyperlegible, Lexend, or your system sans
> • Text size, line / letter / word / paragraph spacing, line width, and a gentle contrast control
> • Leading-letter ("bionic") bolding, adjustable
> • Automatic hyphenation and optional visible syllable breaks (in·for·ma·tion)
> • Nine calm reading tints plus a custom colour
> • Remove italics, hide images, freeze animated GIFs
>
> Focus & pacing
> • An adaptive 1 / 3 / 5-line reading ruler that follows your line and dims the rest
> • Paragraph focus — everything but the paragraph you're on is dimmed
> • One sentence at a time, stepped with the keyboard or the transport bar
> • Speed reader (one word at a time, adjustable words-per-minute)
> • Auto-scroll at your reading pace
>
> Read aloud
> • The current sentence and word are highlighted as it speaks, in your chosen font
> • The built-in browser voice needs no account and no network
> • Optional: bring your own ElevenLabs API key for higher-quality voices with tight word timing. Your key is stored only on your device; text is sent only to api.elevenlabs.io, only while reading
> • "Voice Fit" surfaces the clearest free voices on your device and lets you preview them fast
>
> Where it works
> • Reader View — pulls the article out of any page and re-renders it
> • "Restyle this page" — reformats the page you're already on, in place, with a small floating bar; toggle off to restore it exactly
> • PDF mode — extracts text from a worksheet or handout and reads it through the same engine
> • Optional per-site automation: auto-open Reader View, or auto-restyle, on a site you choose (asks for that one site's permission only when you turn it on)
>
> Accessibility of the app itself
> • A "dyslexia-friendly menus" switch renders ReadTune's own buttons, sliders, and settings in OpenDyslexic — so the person who needs that font can read the controls, not only the article
>
> Memory
> • Your profile and history are saved with the browser's local storage — no account
> • The Reading Lab keeps your last ~10 calibration runs so you can see what's stable versus noisy
> • Reader View remembers where you left off and keeps your highlights, per page
>
> ---
>
> **WHAT WE'RE HONEST ABOUT**
>
> Read-aloud with follow-along, roomier spacing, and softer contrast have the strongest research support. Dyslexia-specific fonts, coloured overlays, and bionic bolding have mixed or weak evidence — some people clearly prefer them, but that's comfort, not a cure. ReadTune labels each feature by how well it's supported and treats the weaker ones as experiments you opt into. The calibration is a quick estimate from six short readings, not a clinical assessment, and it says so.
>
> ---
>
> **PRIVACY**
>
> No server. No account. No analytics or telemetry. No selling data — there is no data to sell. Your reading profile, calibration history, reading position, and highlights are stored with the browser's local extension storage, on your device. The extension installs asking only for activeTab, scripting, and storage.
>
> The one time anything leaves your device is fully opt-in: if you enter your own ElevenLabs API key, the passage you ask to have read aloud and your key are sent to your own ElevenLabs account (api.elevenlabs.io) to generate audio. Nothing else, nowhere else.
>
> Free and open source. The full code is on GitHub.

**Screenshots (1280×800 or 640×400, need at least 1, ideally 4–5):**
1. Reader View with OpenDyslexic + a tint, settings panel open — `01-reader-view.png`
2. The adaptive reading ruler over an article — `02-focus-ruler.png`
3. Read-aloud running (sentence + word highlighted, transport bar) — `03-read-along.png`
4. "Restyle this page" in place with the floating bar — `04-restyle-page.png`
5. *(nice-to-add)* the calibration result screen — "what each change did for you" with the KEPT tags

*Note: the current PNGs predate the Reading Lab, the research-backed starter, and the dyslexia-friendly-menus switch. They're fine to launch with; re-shoot when there's time, ideally one showing the dyslexic UI mode since it's a strong accessibility story.*

## Exact dashboard map

**Product details**
- Description: paste the Description above.
- Category: `Accessibility`
- Language: `English`
- Distribution: `All regions` / worldwide.

**Graphic assets**
- Store icon: upload the packaged `icons/icon128.png`.

**Global assets**
- Screenshots: upload `store/assets/01-reader-view.png`, `02-focus-ruler.png`, `03-read-along.png`, and `04-restyle-page.png`.
- Small promo tile: upload `store/assets/promo-small.png` (440×280).
- Marquee promo tile: upload `store/assets/promo-marquee.png` (1400×560).
- Global promo video: leave blank until the demo video is published.

**Additional fields**
- Official URL: `https://readtune.vercel.app/` if Google Search Console verification is complete; otherwise leave `None`.
- Homepage URL: `https://readtune.vercel.app/`
- Support URL: `https://github.com/Engineer9118brov2/readtune/issues`
- Privacy policy URL: `https://readtune.vercel.app/privacy.html`

The Vercel homepage is the public product page. It is intentionally separate from the extension upload and does not expose the extension's local test profile or package build files.

## Permission justifications (paste into the dashboard)

**activeTab:**
> Used only when the user clicks "Open Reader View" or presses the shortcut. It lets the extension read the current tab's article text once so it can display a reformatted, accessible version. No page access is retained.

**scripting:**
> Required to inject, on the user's explicit action (with activeTab), the one-off script that reads the article markup for Reader View, or the "Restyle this page" script that reformats the current page in place.

**storage:**
> Stores the user's reading profile, calibration history, per-page reading position and highlights locally on the user's device. Also stores the user's own ElevenLabs API key locally if they choose to enable that optional voice. Nothing is transmitted except as described under host permissions.

**Optional host permissions — `https://api.elevenlabs.io/*`:**
> Not requested at install. Requested only when the user enters their own ElevenLabs API key to use ElevenLabs voices for read-aloud. Used only to send the passage being read aloud and generate word timings.

**Optional host permissions — `*://*/*`:**
> Not requested at install. Requested only if the user turns on "auto-open" / "auto-restyle in ReadTune" for a specific site, scoped to that site, so its pages open in Reader View (or restyle) automatically.

**Remote code:** None. All libraries (Readability, pdf.js, hyphenation, fonts) are bundled in the package. The optional ElevenLabs feature only calls the documented REST API — no remote code is loaded or executed.

**Data usage disclosures:** ReadTune does not collect analytics or sell data. If you enable the optional ElevenLabs voice, disclose under "Web history / User activity" that the text the user chooses to have read aloud is transmitted to the user's own ElevenLabs account to generate audio, at the user's initiation.

## After submitting

- First review for a new developer + low-permission extension is usually **1–3 business days**; budget up to two weeks.
- If rejected, the email names the exact policy — fix and resubmit (each resubmit is a fresh review, usually faster).
- For an Oct 2 deadline, submit by ~**Sept 20**. You do not need the store to demo — load unpacked is fine.
