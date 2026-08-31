# Chrome Web Store — submission pack

Everything you need to paste into the Developer Dashboard.

## Before you start

1. **Register** at https://chromewebstore.google.com/devconsole — one-time **$5** fee, any Google account. Do this first; it can take a few minutes to activate.
2. **Build the package**: `npm run build` → produces `readtune-<version>.zip` at the repo root, with dev files and licenses' source stripped out. Upload that zip.
3. **Use the hosted pages**: the public homepage is `https://readtune.vercel.app/` and the privacy policy is `https://readtune.vercel.app/privacy.html`.

## Store listing fields

**Name:** ReadTune

**Summary (132 chars max):**
> Finds the reading settings that help you, then applies them to articles, PDFs, and web pages. Free, private, and login-free.

**Category:** Accessibility

**Description:**
> Most reading tools hand you a pile of toggles and let you guess. Bionic Reading, BeeLine, Helperbird, Speechify, Immersive Reader — you fiddle until something feels okay, and the parts that help most are usually behind a login or a subscription.
>
> ReadTune measures what works instead. A two-minute calibration test shows you five short passages, each formatted a different way. It times your reading, asks a quick comprehension question, and asks how each one felt — then scores every style against your own results and saves the best one. Reader View and PDF mode use it automatically.
>
> WHAT'S IN IT
> • Fonts built for readability: OpenDyslexic, Atkinson Hyperlegible, Lexend
> • Bionic bolding, adjustable spacing, hyphenation, syllable breaks
> • 9 reading tints plus a custom colour, contrast control, hide images, freeze GIFs
> • Reading ruler, paragraph focus, one-sentence-at-a-time, speed reader, auto-scroll
> • Read aloud with the sentence and word highlighted — the browser voice needs no account; an optional ElevenLabs voice is there if you bring your own key
> • Reader View, or "Restyle this page" to reformat the page you're already on
> • Remembers where you left off and keeps your highlights, per page
> • Works on any article and on PDFs with selectable text
>
> PRIVACY
> ReadTune has no server, no account, no analytics. Everything is stored on your device with the browser's local storage. It works offline. The one exception is opt-in: if you enter your own ElevenLabs API key for read-aloud, the passage being read and your key go to api.elevenlabs.io and nowhere else.
>
> Free and open source.

**Screenshots (1280×800 or 640×400, need at least 1, ideally 4–5):**
1. Calibration results screen (the table + "you read X% faster")
2. Reader View with OpenDyslexic + a tint + bionic bolding, settings panel open
3. Read-aloud running (sentence + word highlighted, transport bar)
4. The reading ruler over an article
5. PDF mode showing an extracted worksheet

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
