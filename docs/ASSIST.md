# Reading assistant (Summary + Simplify)

**Goal:** the two AI helpers that actually earn their place for a struggling
reader — a short "what is this about" before committing to a long article, and a
plain-language rewrite of the one paragraph that won't come together.

**History, briefly:** shipped on-device-only in 0.9.0 (Chrome's built-in
Gemini Nano). Then the bring-your-own-key fallback was removed — pasting a
Google AI Studio key is not a real option for this extension's readers. Then
on-device itself was dropped as the *default* path: real devices are
storage/CPU-limited, and — the disqualifying case — students on shared school
Chromebooks that don't keep a local profile between logins would re-download
the ~2 GB model every single sign-in. ReadTune now never triggers that
download at all.

## As shipped (Summary only — Simplify's cloud path is next)

- **Summary** — a header action in Reader View. Key points for the article
  (its opening, if the article is long — capped at ~12k characters). Routed
  to on-device AI when it's already ready, otherwise ReadTune's cloud relay
  (see below).
- **Simplify** — a pill that appears over any selection of ~12+ characters
  inside the reading flow. Rewrites that passage and shows it **beside the
  original**, never in its place, under an "AI — may not be exact" line.
  **On-device only for now** — if this browser doesn't already have a ready
  Rewriter/Prompt model, Simplify says so rather than falling back to the
  cloud relay. It isn't disclosed as a cloud feature yet, so it doesn't
  become one silently; that migration (and the UI/UX pass for it) comes
  after Summary's cloud path is verified solid.

Both render in one dismissible card (`shared/assist-ui.js`), modelled on the
word-lookup popup: Escape / click-outside / Cancel, a copy button, and "Hear
it" through the same read-aloud voice.

## How a request is routed (`shared/assist.js`)

1. **On-device, but only if it's already ready.** Chrome's built-in
   `Summarizer`/`Rewriter`/`LanguageModel`, checked via `.availability()`.
   ReadTune only calls `.create()` when the status is already `"available"` —
   never for `"downloadable"` or `"downloading"`. This is the whole point:
   **ReadTune never initiates the one-time download.** If some other feature
   (Chrome's own, or another site's) already triggered it, this path is free,
   instant, and fully private. Otherwise, straight to step 2 — no download,
   no prompt, no "requires a user gesture" dance.
2. **ReadTune's own relay, Summary only** (`api/assist.js`, deployed
   alongside the marketing site on Vercel) — the article text (and its URL)
   is sent there, which forwards it to a free model on OpenRouter
   (`openrouter/free`, OpenRouter's own free-model router — no model list to
   maintain here) and returns the generated text. **If Redis is configured**,
   responses are cached by normalized article URL (bound to a hash of the
   text, so no one can overwrite another article's cached summary) so a
   popular article is summarized once, ever — every later reader gets the
   cached text instantly, at no extra cost. Without Redis configured, every
   request reaches the model. There's a coarse shared rate limit as an abuse
   guard, not a per-user quota, also a no-op without Redis.
3. **Never a ReadTune-hosted model.** The relay calls a third-party model;
   it doesn't run one itself. **Never for Simplify** — see above.

This is the one place in ReadTune where article text leaves the device by
default. Every other claim ReadTune makes elsewhere — "no ReadTune server",
"nothing leaves your device", "no accounts, no analytics" — should be read
with this one Summary exception; see `privacy.html` / `PRIVACY.md` for the
plain disclosure with that exception spelled out. Every other feature
(calibration, Reader View, Piper read-aloud, PDF mode, and Simplify as
shipped today) still sends nothing anywhere. `describeAvailability()` reports
two modes now:
`"on-device"` (ready, on this browser) and `"cloud"` (routed through the
relay) — both are always `ready: true`, since the assistant always has
somewhere to run.

## What is and isn't claimed

- It is **"an optional plain-language rewrite of the part you pick"** or
  **"the key points of an article"** — not "understand any article", not a
  comprehension guarantee.
- The rewrite prompt tells the model to keep every fact, name and number, add
  nothing, and drop nothing — but a model can still get it wrong, so the
  original is always on screen next to it.
- The summary is "the main points as the text states them", capped to the
  article's opening for a long piece, and labelled when it was clipped.
- Store answer to "do you use remote code?" stays **No**: this sends and
  receives data (article text in, generated text out), it doesn't fetch or
  execute code. The on-device path, where it applies, is part of the browser.

## Not in v1

Freeform "ask about this article" chat. Open Q&A is the shape most likely to
read as "ReadTune understood the article for you". Revisit once
summarize/simplify has real user feedback.
