# Judge / reviewer prompts

Paste one of these into a **fresh** Claude or Codex session that has the ReadTune
repo checked out. They're written for *this* codebase — vanilla JS, Manifest V3,
no build step, no framework — so ignore any advice a model gives that assumes
React, a bundler, or a hosted TTS model. ReadTune's read-aloud is the Web Speech
API plus an optional user-supplied ElevenLabs key, and that is deliberate.

---

## Prompt 1 — Hackathon judge (social impact + technical + innovation + design)

```
You are judging ReadTune for GatewayHacks 2026, Accessibility & Health track.
The rubric is 40% social impact, 30% technical execution, 20% innovation,
10% design. You have the full repository. Do not summarize the project back
to me — assess it.

Read at least: manifest.json, shared/settings.js, shared/render.js,
shared/calibration-score.js, calibration.js, shared/screen.js, shared/tts.js,
shared/elevenlabs.js, inpage.js, shared/inpage-style.js, docs/RESEARCH.md,
docs/ARCHITECTURE.md, and the test harness (test/harness.js + scripts/).

Then give me:

1. SCORE each rubric dimension out of its weight, with a one-paragraph
   justification per dimension. Be a hard grader — assume strong competition.

2. The three weakest things a judge would notice in a 5-minute demo, in
   priority order, each with a concrete fix that's realistic before the
   Oct 2 deadline.

3. The single most defensible claim this project can make, and the single
   claim most likely to get picked apart — with how I should respond when it is.

4. Whether the calibration test is methodologically sound enough to survive a
   judge who knows statistics. Point to the exact code. Name every shortcut.

5. Is anything here overclaimed relative to docs/RESEARCH.md? Flag copy in the
   popup, calibration results screen, the marketing site (index.html), or the
   store listing that a careful reader would call an overstatement.

Skip praise unless it's load-bearing for a score. I want the critique.
```

---

## Prompt 2 — Senior engineer / security & accessibility audit

```
Act as a senior front-end engineer and security reviewer auditing ReadTune, a
Manifest V3 Chrome extension written in plain ES modules with no build step.
You have the whole repo. Produce a findings list, highest severity first, each
with file:line and a concrete patch. No summary of the project.

Focus areas:

1. UNTRUSTED HTML. Reader View injects third-party page HTML into an
   extension-origin page. Audit shared/render.js — cleanNode(), safeUrl(), the
   allowlist, and the DOMParser usage. Can anything reach innerHTML, a live
   javascript:/data: URL, an <iframe>, an inline handler, or a <base> that
   redirects a form? Try to defeat it.

2. THE ELEVENLABS PATH. shared/elevenlabs.js + the key handling in
   shared/settings.js / shared/screen.js. Is the API key ever written anywhere
   but chrome.storage.local? Ever logged, ever put in a URL, ever sent to a
   host other than api.elevenlabs.io? What happens on a malformed API
   response? Does aborting playback actually stop the fetches?

3. IN-PAGE RESTYLE (inpage.js + shared/inpage-style.js). It runs in the page's
   world and mutates the live DOM. Does toggling it off restore the DOM
   exactly (attributes, event listeners, bionic wrappers, injected <style>,
   the shadow-DOM bar)? Any way a hostile page CSS-attacks the control bar
   through the shadow boundary? Any lost-update race on the profile write?

4. MANIFEST / CSP / PERMISSIONS. Is anything requested that isn't used? Could
   the optional host permissions be narrower? Any remote-code risk that would
   fail Chrome Web Store review?

5. RESILIENCE. Every chrome.* call — is a rejected promise or a thrown
   exception handled so the user gets a message instead of a blank screen?
   Check storage-blocked, offline, speechSynthesis-unavailable, PDF-worker-
   failed, Readability-returns-nothing.

6. ACCESSIBILITY of the extension's own UI (WCAG 2.2 AA): focus order and
   visible focus in the popup and the settings panel; the reading ruler and
   transport bar with a keyboard; prefers-reduced-motion; the new
   "dyslexicUiMode" (does the OpenDyslexic swap clip any control or fail
   contrast?); every control reachable without a mouse.

For each finding: severity (critical/high/medium/low), the failure scenario
with concrete inputs, and the fix.
```

---

## Prompt 3 — "Try to break the demo" (product QA)

```
You have the ReadTune repo and can load it unpacked in Chrome (chrome://
extensions → Developer mode → Load unpacked). Act as a hostile QA tester an
hour before the demo. Your job is to find the thing that breaks on stage.

Run the calibration end to end. Open Reader View on: a normal news article, a
paywalled article, a single-page-app news homepage, a Google Doc, a Reddit
thread, a PDF link, a page in a foreign language, and a very long article.
Try "Restyle this page" on a heavy web app (Gmail, Notion, Twitter). Turn on
read-aloud and spam play/pause/stop/skip. Toggle the dyslexia-friendly menus
mid-session. Open two reader tabs at once. Resize to a phone width.

Report every dead end, wrong message, layout break, console error, and moment
where a first-time user wouldn't know what to do next — with repro steps and
which file is responsible.
```

---

## What to do with the output

- Findings that are real and fixable before Oct 2 → fix them, commit each with a
  message that names the reviewer prompt.
- Overclaim flags → fix the copy immediately; that's the cheapest points in the
  rubric.
- "Weakest in a demo" items → decide fix vs. cut vs. pre-empt in the video
  narration.
- Anything the reviewer got wrong because it assumed a framework or a hosted
  model → ignore, and note it here so the next reviewer isn't sent down the
  same path.
