# Feedback → change log

Every change ReadTune makes in response to a real person's feedback is recorded
here, in the open. The format is deliberate:

**Signal** (what more than one person ran into) → **Decision** (what we chose to
do and why) → **Change** (the commit / version it shipped in) → **Response** (if
we could re-check with the people who raised it).

One-off requests that we *didn't* act on are logged too, with the reason. The
point is a visible, honest trail — not a highlight reel.

Feedback comes in through GitHub issues
(<https://github.com/Engineer9118brov2/readtune/issues>) and post-launch
usability sessions (protocol in [`USER-RESEARCH.md`](USER-RESEARCH.md)). ReadTune
collects nothing on its own — there is no analytics, no telemetry, no "phone
home." If it's in this file, a person told us directly.

---

## Open signals (heard, not yet acted on)

_None logged yet — the extension hasn't launched. This section fills in after the
Web Store listing is live and the first sessions happen._

---

## Shipped changes

### Template (copy for each entry)

> **YYYY-MM-DD — short title**
> **Signal.** Who raised it (P-code or issue link), how many, what they hit.
> **Decision.** What we changed and what we deliberately didn't. Any claim or
> privacy implication considered.
> **Change.** `commit` / v0.x.y.
> **Response.** What the people who raised it said after, if we could re-check.

_First real entry lands after launch feedback. Target for the hackathon
submission: **at least two** entries here, each traceable to repeated feedback._

---

## Changes made pre-launch from informal review

These predate structured sessions — internal review, the award-readiness pass,
and early looks from people close to the project. Logged for completeness; they
are **not** counted as participant evidence.

> **2026-08-31 — controls were buried under marketing copy**
> **Signal.** Early viewers of the popup and the Reading Lab scrolled past the
> actual toggles because research/marketing panels came first. "I couldn't find
> where to turn it on."
> **Decision.** Move the dyslexia-friendly-menus switch directly under the popup
> header; move the proof/research panel below the action buttons; lift Voice Fit
> above the evidence grid in the Lab; make the Lab action bar sticky.
> **Change.** `7a41279`, v0.7.x.
> **Response.** Re-review found the primary actions now visible without
> scrolling.

> **2026-08-31 — the read-aloud voice sounded robotic**
> **Signal.** Consistent dislike of the browser's built-in speech voices — "the
> voice ruins it."
> **Decision.** Replace the browser speech engine entirely with Piper, an
> on-device neural voice, and bundle a public-domain default so it works with no
> download and no network. No browser-speech fallback.
> **Change.** `d549807`, v0.7.x. Voice licensing worked through in
> [`PIPER.md`](PIPER.md).
> **Response.** Pending real-user check post-launch.

> **2026-09-01 — overclaiming in the copy**
> **Signal.** Award-readiness review flagged language that promised more than a
> six-passage check can deliver ("measures what actually helps you read", "your
> best setup", blanket "nothing leaves your device").
> **Decision.** Systematic wording pass: the calibration "suggests a setup worth
> trying", results describe "how consistent this was", privacy language names the
> two features that do send data (dictation → Google's recognizer, optional
> ElevenLabs voice → the user's own account).
> **Change.** `270e399`, v0.7.2.
> **Response.** n/a (internal).
