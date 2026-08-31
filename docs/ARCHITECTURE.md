# ReadTune — how it's built

A map of the code and, more importantly, *why each part is the way it is*. If you
can explain the decisions on this page, you can answer anything a judge asks.

---

## The one idea everything hangs off

There is a single object — the **profile** — that describes how text should look
and behave: font, size, spacing, bolding, tint, and how you move through it. It
is produced by the calibration test and can be hand-tuned. Every screen —
Reader View, PDF mode, "Restyle this page", each calibration passage — renders
through the *same* function reading the *same* profile. Nothing re-implements
formatting. That's why the calibration result actually means something: what you
calibrated is exactly what you get everywhere.

`shared/settings.js` owns the profile: its shape (`DEFAULT_PROFILE`), the
allowed ranges, `normalizeProfile()` (clamps and migrates anything loaded from
storage), and thin `chrome.storage.local` wrappers with try/catch around every
call so a storage failure degrades to defaults instead of a blank screen.

---

## Why it's a Manifest V3 extension, not a website

The whole point is to reformat **pages you didn't write**. A website can't reach
into another site's DOM; only an extension can. Manifest V3 (the current, and
soon only, extension format) adds two constraints that shape the code:

1. **No remote code.** You can't `<script src>` a CDN. So Readability, pdf.js,
   the hyphenation patterns, and the fonts are downloaded once and committed
   into `lib/`. `scripts/check.mjs` fails the build if any of them go missing.
2. **Minimal permissions, requested late.** The install only asks for
   `activeTab`, `scripting`, `storage`. `activeTab` grants access to the current
   tab *only after you click the toolbar button or press the shortcut* — a user
   gesture. Anything broader (`api.elevenlabs.io`, or a whole site for
   auto-open) is an **optional** permission requested at the moment you opt in,
   and revoked when you opt out.

---

## Reader View — the capture → parse → render pipeline

1. **Capture** (`content.js`). Injected once, on your click, via
   `chrome.scripting.executeScript`. It clones `documentElement`, strips
   `<script>`/`<style>`/stylesheet links (Readability doesn't need them and they
   bloat and endanger the payload), and hands back the HTML string. It is *not*
   a persistent content script — it runs, returns, and is gone.
2. **Hand-off.** The popup writes the captured page to `chrome.storage.session`
   (in-memory, cleared on browser restart, generous quota) and opens
   `reader.html` in a new tab. `takeArticle()` reads it back and immediately
   deletes it, so a refresh doesn't re-render a stale page.
3. **Extract** (`shared/render.js` → `buildArticleFragment`). Mozilla
   Readability finds the article body. A `<base href>` is injected first so
   Readability resolves relative links correctly.
4. **Sanitize** — *this is the security-critical step*. We are about to put
   third-party HTML into an extension-origin page. `cleanNode()` walks the
   parsed tree and rebuilds it from an **allowlist**: only known-safe tags
   survive, everything else is unwrapped to its text; only specific attributes
   per tag are copied (`href`, `src`, `alt`, `colspan`…); every URL goes through
   `safeUrl()`, which rejects `javascript:`, `vbscript:`, `data:text/html`, and
   anything whose protocol isn't http/https/mailto (or `data:image/` for
   `<img>`). We build every node with `document.createElement` +
   `setAttribute` — never `innerHTML` — so there is no parser round-trip for an
   attacker to exploit. Test: *"sanitised (script / js: / ad gone)"*.
5. **Structure + render.** The clean fragment is wrapped so each sentence is a
   `<span class="rt-s" data-i="…">` (needed for read-aloud highlighting and
   click-to-start). Bionic bolding and syllable dots, if on, walk the text nodes
   and wrap letter runs. Typography is CSS custom properties set on the surface
   element from the profile — no per-word inline styles.

If Readability finds nothing (a home page, a feed, an app), you get a clear
message with a link to the original — never a broken half-render.

---

## "Restyle this page" — doing it *in place*

`inpage.js` is injected on `Alt+Shift+R` / the popup button. It is a classic
script (file injections can't be ES modules), so it `import()`s the shared
pieces it needs by `chrome.runtime.getURL` — which is why `shared/settings.js`,
`shared/inpage-style.js`, `inpage.css`, and the fonts are listed in
`web_accessible_resources`.

- `shared/inpage-style.js` generates a stylesheet **scoped to `html.rt-inpage`**
  and injected into `<head>`. It uses `!important` because it's competing with
  the site's own CSS, and a `:not(...)` guard to skip elements that are usually
  icon-font glyphs, not prose (forcing our font on a Font Awesome `<i>` renders
  a tofu box). Colours are only overridden if you've chosen a tint — otherwise
  the page keeps its own palette (this is how Readable behaves too).
- Bionic bolding on a live page wraps each word in a custom `<rt-bionic>`
  element. Removal replaces each wrapper with a plain text node, so toggling off
  restores the DOM exactly. Test verifies `htmlClass`, injected style, the bar,
  and bionic-span count all return to zero after a second toggle.
- The control bar lives in a **shadow DOM** so the page's CSS can't touch it and
  ours can't leak out.
- **The one race worth knowing about:** the bar holds the whole profile locally
  and writes it with `writeProfile()` (a whole-object `set`), *not*
  `saveProfile()` (a read-modify-write). Two bar clicks ~1 ms apart with
  read-modify-write would lose the first update. A `selfWrite` guard also stops
  our own `storage.onChanged` event from triggering a redundant full re-render.

---

## The calibration test — the part to defend hardest

Design choices, each with its reason:

| Choice | Why |
| --- | --- |
| Each passage changes **exactly one** thing vs a plain baseline | If a passage changed font *and* spacing *and* size and it won, you'd have no idea which change helped. One variable per passage means a win is attributable. |
| A **warm-up passage** that isn't scored | The biggest reading speed-up is from passage 1 → 2, regardless of settings. The warm-up absorbs it. |
| Reading speed is **de-trended for practice** | You keep speeding up as you go. `shared/calibration-score.js` fits a line of words-per-minute against passage position and subtracts it before comparing anything. Test: *"de-trend removes the practice ramp — no false speed effect"*. |
| Passages are matched (~55–60 words, similar syntax, Grade ~6–7) | So the comparison is about the formatting, not the text. |
| Font size is held **constant** across all passages | Bigger text helps almost everyone a little — testing it would just add noise. It's the one knob everyone adjusts by hand anyway. |
| Score = comprehension + de-trended speed + 1–5 ease, combined | One signal is too noisy. If speed carries no signal (you read them all at the same pace), it drops out and the decision leans on ease + comprehension. |
| A change is only **kept** if it clears a margin (`HELP_THRESHOLD`) | Small differences are noise. Nothing clears the bar → the result says "standard settings worked as well as anything for you," which is a real finding, not a failure. |
| The result screen says **"a rough estimate from six short readings, not a formal assessment"** and offers *retake* | Because that's true. Judges reward saying so; they punish overclaiming. |

The scoring is pure functions in `shared/calibration-score.js` with unit tests,
and `shared/calibration-insights.js` turns the raw history into the Reading Lab
view: confidence, stability, repeated wins, and "worth retaking?" signals.

**What it does that no competitor does:** it tells you *which dimension* mattered
for you — "Roomier spacing helped you most, +22%. OpenDyslexic didn't help you."
That's a piece of self-knowledge, not just a settings blob.

**Honest limitations** (say these before a judge does): six ~20-second readings
is a small sample; one comprehension question per passage is a noisy measure;
the passages, while matched, aren't perfectly equal in difficulty; it measures a
first impression, not adaptation over weeks. It's a *starting point that beats a
wall of toggles*, and that's the claim.

---

## Read-aloud — two backends, one highlighter

`shared/tts.js` exposes one interface (`start/pause/step/seek/…`) over two
engines:

- **Browser** (`speechSynthesis`) — default, no key, no network. One utterance
  per sentence because Chrome truncates long ones. "Pause" is
  `cancel()` + remembered index, because `SpeechSynthesis.pause()` is unreliable
  across platforms. Word highlighting rides the `onboundary` event where the
  voice fires it.
- **ElevenLabs** (`shared/elevenlabs.js`) — optional, your own key. Sentences
  are batched into ~550-char chunks; each chunk's `/with-timestamps` response
  returns per-character start times, and `charIndexAt()` binary-searches them on
  every animation frame to highlight the exact word. Chunks are fetched
  just-in-time with one prefetch ahead, so stopping early doesn't spend quota on
  the rest of the article. Any API error (bad key, quota, offline) shows a toast
  and finishes the article on the browser voice.

The key lives **only** in `chrome.storage.local` under its own key
(`readtune_tts`), never in the profile object, never in a file, never in git.
ElevenLabs' free plan can't use its shared voices over the API, so the panel
handles a key that can't list voices by letting you paste a voice ID and telling
you why.

---

## File map

```
manifest.json         MV3. activeTab + scripting + storage; optional api.elevenlabs.io & <all_urls>
background.js          Service worker — Alt+R / Alt+Shift+R commands, per-site auto-open
content.js             One-shot page capture for Reader View
inpage.js / .css       "Restyle this page" — content script + shadow-DOM bar
popup.*                Three entry points + profile summary + per-site toggle
lab.*                  Reading Lab — confidence, stability, repeated wins
reader.* / pdf.*       Thin — hand content to shared/screen.js
calibration.*          The test UI; scoring is in shared/calibration-score.js
shared/
  settings.js          Profile shape, ranges, normalize/migrate, storage wrappers, TTS config
  render.js            THE formatting engine: sanitize → structure → typography → bionic → pacing
  calibration-score.js Pure scoring model (de-trend, per-dimension deltas, threshold) — unit-tested
  inpage-style.js      Generates the html.rt-inpage stylesheet — unit-tested
  aids.js              Ruler, progress bar, paragraph focus, resume position, highlights
  tts.js               Read-aloud: browser + ElevenLabs backends + shared highlighter
  elevenlabs.js        The API: voices, /with-timestamps synth, alignment → word index
  transport.js         The floating playback bar
  controls.js          The settings panel
  screen.js            Wires a reading view to panel / transport / tts / aids / per-page memory
  pdftext.js           PDF text layer → paragraphs (gap-based paragraph detection) — unit-tested
lib/                   Vendored, no remote code
test/harness.html      Open in a browser — ~50 assertions, stubs chrome.*
scripts/check.mjs      Syntax + manifest + asset-reference check (npm run check)
scripts/build.mjs      Clean Web Store zip (npm run build)
```

## Running the checks

```
npm run check     # every JS parses, manifest valid, every referenced path exists
npm run build     # writes readtune-<version>.zip with only shipped files
```

Open `test/harness.html` in Chrome for the behavioural tests (it stubs
`chrome.*` and exercises the real modules).
