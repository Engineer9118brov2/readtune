# ReadTune — Devpost writeup

Paste-ready copy for the submission page. Trim to fit; keep the competitor table
and the honesty paragraph.

---

## Tagline

The reading tool that tries the settings *with* you — a quick check suggests a
setup worth keeping, then applies it everywhere. Free, local-first, no account.

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
calibration test — or you skip it and start reading on a research-backed
default. The test is a warm-up, then six short passages in a shuffled order. Standard text appears twice on different passages; the other four passages each change
*exactly one* thing from that research-backed page — the font, the spacing, or
bionic bolding. It times your reading (correcting for the speed-up everyone gets
from practice), runs a **cloze check** (two words blanked in a middle sentence,
pick the missing pair — you can't answer it from the title or a skim), and asks
how each one felt. Passages are drawn from a pool and never repeat on a retake.
Then it scores every change against the average of those standard readings and identifies
which settings are the clearest ones to try:

> *"Roomier spacing was the clearest signal today. Try it as your starting
> setup; the standard font held up just as well as OpenDyslexic."*

That last part — showing which setting was the clearest signal in a short check —
is a different workflow from a wall of manual toggles. The **Reading Lab** keeps a local history of your
retakes so you can see whether spacing, a font, or sentence chunking keeps
winning or whether today's result was just a close call. It's a piece of
self-knowledge, not just a settings blob.

ReadTune extends that same idea into **listening** too. Read-aloud runs a
natural neural voice (Piper) **entirely on the device** — the default voice
ships inside the extension, so it works offline with nothing to download. The
Reading Lab's **Voice Fit** lets you preview a few voices and keep the clearest
one while you read along in your calibrated font and spacing.

There's also **Talk to type** — dictate into any text field on any page, with
spoken punctuation. It uses the browser's own speech recognition.

From then on, **Reader View**, **PDF mode**, and **"Restyle this page"** all use
your profile automatically, and the Reading Lab shows how repeatable the current
result has been. The first-run flow hands off into Voice Fit, so setup finishes
with both a reading profile and a chosen on-device voice.

## How it compares

| | Tries settings with you | Any article + PDF | Read-aloud w/ highlight | Actually free | Local-first by default |
| --- | :---: | :---: | :---: | :---: | :---: |
| Bionic Reading | manual toggles | ✓ | ✕ | freemium | ✕ |
| BeeLine Reader | manual toggles | ✓ | ✕ | freemium | ✕ |
| Helperbird | manual toggles | ✓ | ✓ | ~$4.99/mo+ | ✕ |
| MS Immersive Reader | manual toggles | limited | ✓ | needs MS/school account | ✕ |
| Speechify | manual toggles | ✓ | ✓ | subscription | ✕ |
| **ReadTune** | **a short preference check suggests settings to try** | **✓** | **✓** | **✓ — no login, no paywall** | **✓ — local by default, optional cloud features disclosed** |

## How it works (for the judges who ask)

Chrome extension, Manifest V3. Core reading features run on your device; optional cloud features are disclosed and user-initiated.

- **Reader View** pulls the article out of any page with Mozilla Readability,
  then rebuilds it through a strict allowlist sanitizer (no scripts, no
  `javascript:` URLs, no inline handlers — built with `createElement`, never
  `innerHTML`) and one shared formatting engine.
- **"Restyle this page"** does the same thing *in place* — it injects a scoped
  stylesheet into the page you're on, with a small floating control bar, and
  removes every trace when you toggle it off.
- **PDF mode** extracts the text layer with pdf.js and renders it through the
  same engine.
- **Read-aloud** highlights the sentence and word as it speaks. It runs the
  Piper neural voice on-device via onnxruntime-web + a WebAssembly phonemizer,
  in a Web Worker so the reader stays smooth. The default voice ships in the
  package; other voices download a one-time model. An optional ElevenLabs voice
  works if you bring your own key (stored only in your browser, sent only to
  ElevenLabs, only while reading).
- **Talk to type** injects a content script that runs the browser's speech
  recognition and inserts the transcript at the caret, with spoken-punctuation
  commands.
- Libraries (Readability, pdf.js, hyphenation, fonts, the Piper runtime) are
  bundled — Manifest V3 forbids loading remote code, and it means read-aloud
  and everything else work offline.

The calibration scoring is a small, testable model:
`shared/calibration-score.js`, with unit tests. There's a CI pipeline and a
test harness with hundreds of behavioural assertions.

## What we're honest about

The calibration test is a **quick estimate from six short readings plus a
warm-up, not a clinical assessment**. Two readings use the standard setup and
are averaged as a steadier baseline; each other reading changes one setting.
The results screen offers the standard starter, a retake, and full manual
control. Cloze questions and ease ratings make the signal more useful, but it
remains a *starting point instead of a wall of toggles*, not proof of a best
configuration.

Some of the options ReadTune offers have strong evidence behind them (read-aloud,
increased spacing, lower contrast). Some are contested (coloured tints, bionic
bolding). We include the contested ones because readers ask for them, we flag
them as optional and off by default, and we let the calibration test decide
per-person instead of asserting they work. The full evidence rundown is in
[`docs/RESEARCH.md`](../docs/RESEARCH.md).

"Local by default" has clearly labelled opt-in exceptions. Fonts, spacing,
focus, calibration, highlights, and on-device read-aloud never send reading
text off the device. Ask AI may route article text and a typed question through
ReadTune's relay; Premium voice routes the current sentence through its voice
relay; and ElevenLabs sends a selected passage directly to the reader's own
account. Each is disclosed before use to a judge, school IT admin, and reader:
[`privacy.html`](https://readtune.tech/privacy.html).

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
Readability, pdf.js, Hypher, Piper + onnxruntime-web (on-device neural TTS), the browser's SpeechRecognition for dictation, optionally the ElevenLabs API.
Fonts: OpenDyslexic, Atkinson Hyperlegible, Lexend.
