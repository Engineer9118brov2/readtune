# Chrome Web Store — submission pack

Everything you need to paste into the Developer Dashboard.

## Before you start

1. **Register** at https://chromewebstore.google.com/devconsole — one-time **$5** fee, any Google account. Do this first; it can take a few minutes to activate.
2. **Build the package**: `npm run build` → produces `readtune-<version>.zip` at the repo root, with dev files and licenses' source stripped out. Upload that zip.
3. **Host the privacy policy**: point the dashboard's "Privacy policy URL" at the raw `PRIVACY.md` in your repo (e.g. `https://github.com/<you>/readtune/blob/main/PRIVACY.md`) or a GitHub Pages copy.

## Store listing fields

**Name:** ReadTune

**Summary (132 chars max):**
> Finds the reading settings that actually work for you with a 2-minute test, then applies them to any article or PDF. Free, private.

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
> • Read aloud with the sentence and word highlighted — no account, no API key
> • Remembers where you left off and keeps your highlights, per page
> • Works on any article and on PDFs with selectable text
>
> PRIVACY
> ReadTune has no server, no account, no analytics. Everything is stored on your device with the browser's local storage and nothing is ever sent anywhere. It works offline.
>
> Free and open source.

**Screenshots (1280×800 or 640×400, need at least 1, ideally 4–5):**
1. Calibration results screen (the table + "you read X% faster")
2. Reader View with OpenDyslexic + a tint + bionic bolding, settings panel open
3. Read-aloud running (sentence + word highlighted, transport bar)
4. The reading ruler over an article
5. PDF mode showing an extracted worksheet

## Permission justifications (paste into the dashboard)

**activeTab:**
> Used only when the user clicks "Open Reader View" or presses the shortcut. It lets the extension read the current tab's article text once so it can display a reformatted, accessible version. No page access is retained.

**scripting:**
> Required to inject the one-off capture script into the active tab (with activeTab) that reads the article's markup for Reader View.

**storage:**
> Stores the user's reading profile, calibration history, per-page reading position and highlights, locally on the user's device. Nothing is transmitted.

**Optional host permissions (`*://*/*`):**
> Not requested at install. Requested only if the user turns on "auto-open in ReadTune" for a specific site, and scoped to that site, so pages on that site open in Reader View automatically.

**Remote code:** None. All libraries (Readability, pdf.js, hyphenation, fonts) are bundled in the package.

**Data usage disclosures:** Check "does not collect or use" for every category. ReadTune does not collect, transmit, or sell any user data.

## After submitting

- First review for a new developer + low-permission extension is usually **1–3 business days**; budget up to two weeks.
- If rejected, the email names the exact policy — fix and resubmit (each resubmit is a fresh review, usually faster).
- For an Oct 2 deadline, submit by ~**Sept 20**. You do not need the store to demo — load unpacked is fine.
