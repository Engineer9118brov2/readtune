# ReadTune — Devpost writeup

Paste-ready copy for the submission page. Trim to fit; keep the competitor table
and the honesty paragraph.

---

## Tagline

The reading tool that measures what actually helps *you*, checks whether the
result stays consistent, then applies it everywhere. Free, private, no account.

## The problem

Somewhere between 1 in 5 and 1 in 7 people have dyslexia. Roughly 1 in 15 have
ADHD. For all of them, reading a wall of dense text on a bright white screen is
slower and more tiring than it needs to be — not because they can't read, but
because the *presentation* is working against them.

There are tools that help: bigger spacing, calmer colours, a cleaner layout,
text read aloud. The problem is **which** ones help is different for every
person, and every existing tool handles this the same way — it hands you a pile
of toggles and lets you guess, or it picks one "dyslexia mode" and makes you
live with it. The tools that do the most (Speechify, Microsoft Immersive Reader,
Helperbird) put the useful parts behind a subscription or a school-district
login. A kid who needs this and doesn't have money or a school licence gets
nothing.

## What ReadTune does differently

**It runs the experiment on you.** The first thing you do is a ~4-minute
calibration test: a warm-up, then six short passages. Each passage changes
*exactly one* thing from plain text — the font, the spacing, bionic bolding, or
showing one sentence at a time. It times your reading (correcting for the
speed-up everyone gets from practice), asks one comprehension question, and asks
how each one felt. Then it scores every change against *your own* baseline and
tells you which ones helped:

> *"Roomier spacing helped you most — about 22% faster. OpenDyslexic didn't help
> you. We turned spacing up and left the font standard."*

That last part — telling you *which dimension mattered* — is something no other
reading tool does. And now the **Reading Lab** keeps a local history of your
retakes so you can see whether spacing, a font, or sentence chunking keeps
winning or whether today's result was just a close call. It's a piece of
self-knowledge, not just a settings blob.

ReadTune now extends that same idea into **listening** too. Instead of dropping
you into a flat voice picker, the Reading Lab surfaces the strongest free
voices your device already has, lets you preview them quickly, and saves the
one that feels clearest while you read along in your calibrated font and
spacing.

From then on, **Reader View**, **PDF mode**, and **"Restyle this page"** all use
that profile automatically, and the Reading Lab explains how confident ReadTune
is in the current result.

## How it compares

| | Personalises to you | Any article + PDF | Read-aloud w/ highlight | Actually free | Nothing leaves your device |
| --- | :---: | :---: | :---: | :---: | :---: |
| Bionic Reading | manual toggles | ✓ | ✕ | freemium | ✕ |
| BeeLine Reader | manual toggles | ✓ | ✕ | freemium | ✕ |
| Helperbird | manual toggles | ✓ | ✓ | ~$4.99/mo+ | ✕ |
| MS Immersive Reader | manual toggles | limited | ✓ | needs MS/school account | ✕ |
| Speechify | manual toggles | ✓ | ✓ | subscription | ✕ |
| **ReadTune** | **a test finds your settings** | **✓** | **✓** | **✓ — no login, no paywall** | **✓ — no server at all** |

## How it works (for the judges who ask)

Chrome extension, Manifest V3. Everything runs on your device.

- **Reader View** pulls the article out of any page with Mozilla Readability,
  then rebuilds it through a strict allowlist sanitizer (no scripts, no
  `javascript:` URLs, no inline handlers — built with `createElement`, never
  `innerHTML`) and one shared formatting engine.
- **"Restyle this page"** does the same thing *in place* — it injects a scoped
  stylesheet into the page you're on, with a small floating control bar, and
  removes every trace when you toggle it off.
- **PDF mode** extracts the text layer with pdf.js and renders it through the
  same engine.
- **Read-aloud** highlights the sentence and word as it speaks. The browser
  voice needs no account; there's an optional ElevenLabs voice if you bring your
  own key (stored only in your browser, sent only to ElevenLabs, only while
  reading).
- Libraries (Readability, pdf.js, hyphenation, fonts) are bundled — Manifest V3
  forbids loading remote code, and it means the extension works offline.

The calibration scoring is a small, testable model:
`shared/calibration-score.js`, with unit tests. There's a CI pipeline and a
~50-assertion test harness.

## What we're honest about

The calibration test is a **quick estimate from six short readings, not a
clinical assessment** — the results screen says exactly that and offers a
retake. One comprehension question per passage is a noisy measure; six
20-second readings is a small sample. It's a *starting point that beats a wall
of toggles*, and that's the claim we're making.

Some of the options ReadTune offers have strong evidence behind them (read-aloud,
increased spacing, lower contrast). Some are contested (coloured tints, bionic
bolding). We include the contested ones because readers ask for them, we flag
them as optional and off by default, and we let the calibration test decide
per-person instead of asserting they work. The full evidence rundown is in
[`docs/RESEARCH.md`](../docs/RESEARCH.md).

## What's next

- A real study: get ReadTune in front of 20+ dyslexic and ADHD readers, compare
  calibrated vs. plain on a standard reading measure, publish what we find.
- Retake-over-time: show whether your profile is stable week to week.
- Offline dictionary lookup on tap.
- Chrome Web Store listing (everything for submission is prepared).

## Try it

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → pick the
folder. Then click the icon → **Find my reading settings**. Code and a full
architecture writeup are in the repo.

## Built with

JavaScript (no framework, no build step), Chrome Extensions Manifest V3, Mozilla
Readability, pdf.js, Hypher, the Web Speech API, optionally the ElevenLabs API.
Fonts: OpenDyslexic, Atkinson Hyperlegible, Lexend.
