# Reading assistant (Ask AI + Simplify)

**Goal:** the AI helpers that actually earn their place for a struggling
reader — a short "what is this about" before committing to a long article,
answers to the questions the article raises, and a plain-language rewrite of
the one paragraph that won't come together.

**History, briefly:** shipped on-device-only in 0.9.0 (Chrome's built-in
Gemini Nano). Then the bring-your-own-key fallback was removed — pasting a
Google AI Studio key is not a real option for this extension's readers. Then
on-device itself was dropped as the *default* path: real devices are
storage/CPU-limited, and — the disqualifying case — students on shared school
Chromebooks that don't keep a local profile between logins would re-download
the ~2 GB model every single sign-in. ReadTune now never triggers that
download at all.

## As shipped

- **Ask AI** — a docked left rail in Reader View (`shared/assist-sidebar.js`).
  On open it summarises the article (its opening, if it's long — capped at
  ~12k characters). A composer at the bottom takes **freeform questions about
  the article**; quick-ask chips pre-run "Summarise", "Key terms", "Explain
  simply". Each answer gets a Play button. Single-turn — a new question
  replaces the last answer; there's no running transcript yet. Routed to
  on-device AI when it's already ready, otherwise ReadTune's cloud relay
  (see below). `kind: "ask"` sends the article as context plus the typed
  question; the answer budget is larger (`ASK_MAX_TOKENS`, 800) than a
  summary's.
- **Simplify** — a pill that appears over any selection of ~12+ characters
  inside the reading flow. Rewrites that passage and shows it **beside the
  original**, never in its place, under an "AI — may not be exact" line.
  **On-device only for now** — if this browser doesn't already have a ready
  Rewriter/Prompt model, Simplify says so rather than falling back to the
  cloud relay. It isn't disclosed as a cloud feature yet, so it doesn't
  become one silently; that migration (and the UI/UX pass for it) comes
  after Summary's cloud path is verified solid.

Simplify renders in a dismissible card (`shared/assist-ui.js`), modelled on
the word-lookup popup: Escape / click-outside / Cancel, a copy button, and
"Hear it" through the same read-aloud voice. Ask AI lives in the persistent
rail — Escape or its × collapse it, and it does **not** close when you click
the article.

- **Define / Explain (backend only, no UI yet)** — `kind: "define"` and
  `kind: "explain"` exist in `api/assist.js` and `shared/assist.js`
  (`assistant.define(word, context, opts)` / `assistant.explain(passage,
  opts)`), routed the same way as Ask (on-device first when ready, this
  relay otherwise). Define takes a short word/phrase plus its sentence for
  context; Explain takes a selected passage and reads out any figurative
  language, tone, or theme in it. Neither has a selection-trigger pill yet —
  that UI (alongside Highlight and Simplify) and the accompanying
  `PRIVACY.md`/`privacy.html` disclosure land together in the next PR, once
  there's an actual path for a reader's selection to reach either kind. Until
  then these code paths are unreachable from the shipped extension, so
  nothing changes about what leaves the device today.

## How a request is routed (`shared/assist.js`)

1. **On-device, but only if it's already ready.** Chrome's built-in
   `Summarizer`/`Rewriter`/`LanguageModel`, checked via `.availability()`.
   ReadTune only calls `.create()` when the status is already `"available"` —
   never for `"downloadable"` or `"downloading"`. This is the whole point:
   **ReadTune never initiates the one-time download.** If some other feature
   (Chrome's own, or another site's) already triggered it, this path is free,
   instant, and fully private. Otherwise, straight to step 2 — no download,
   no prompt, no "requires a user gesture" dance.
2. **ReadTune's own relay, Summary + Ask** (`api/assist.js`, deployed
   alongside the marketing site on Vercel) — the article text (and its URL,
   and for a question the typed question) is sent there, which forwards it to
   a free chat model and returns the generated text. It goes through
   **OpenRouter** (`api/_relay.mjs`):
   `openai/gpt-oss-120b` as the primary, with `google/gemini-3.5-flash-lite`
   and `mistralai/ministral-8b-2512` in OpenRouter's `models` fallback array.
   Each is served by a provider key you add in OpenRouter's BYOK settings
   (gpt-oss by Cerebras/Groq, the others by their own keys) — free to us as
   long as those keys' "shared capacity" is left disabled — and OpenRouter
   fails over between them itself. The request carries `provider: { zdr: true }`
   so the text is only routed to providers under a zero-data-retention policy
   (no retention, no training). `OLLAMA_API_KEY`, if set, adds Ollama Cloud as a first
   provider ahead of OpenRouter. A provider that errors falls through —
   including a bad key (401/403) or a missing model (404) — so one bad key
   never takes Summary offline. Only a `400`/`413`/`422` (the request itself
   is bad) stops the chain. With no key set the relay returns `503` and
   Summary stays unavailable for cloud-path users.
   **If Redis is configured**,
   responses are cached by normalized article URL (bound to a hash of the
   text, so no one can overwrite another article's cached summary) so a
   popular article is summarized once, ever — every later reader gets the
   cached text instantly, at no extra cost. Without Redis configured, every
   request reaches the model. There's a coarse shared rate limit as an abuse
   guard, not a per-user quota, also a no-op without Redis.
3. **Never a ReadTune-hosted model.** The relay calls a third-party model;
   it doesn't run one itself. **Never for Simplify** — see above.

This is the one place in ReadTune where article text — and anything the
reader types into the Ask box — leaves the device by default. A typed
question can be more personal than article text; the UI and privacy copy say
so. Every other claim ReadTune makes elsewhere — "no ReadTune server",
"nothing leaves your device", "no accounts, no analytics" — should be read
with this one Ask AI exception; see `privacy.html` / `PRIVACY.md` for the
plain disclosure with that exception spelled out. Every other feature
(calibration, Reader View, Piper read-aloud, PDF mode, and Simplify as
shipped today) still sends nothing anywhere. `describeAvailability()` reports
two modes now:
`"on-device"` (ready, on this browser) and `"cloud"` (routed through the
relay) — both are always `ready: true`, since the assistant always has
somewhere to run.

## Configuring the relay (Vercel env)

Server-side only — no extension or manifest change to switch providers.

| Env var | Effect |
| --- | --- |
| `OPENROUTER_API_KEY` | The relay key. BYOK provider keys (Cerebras, Groq, Gemini, Mistral…) are configured inside OpenRouter, not here. |
| `OPENROUTER_MODEL` | Optional; pins one model and drops the `models` fallback list. Default: the 3-model list in `_relay.mjs`. |
| `OLLAMA_API_KEY` | Optional; adds Ollama Cloud as a provider ahead of OpenRouter. |
| `OLLAMA_MODEL` | Optional; defaults to `gpt-oss:20b`. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Optional; enables the cross-reader cache + abuse guard. |

With no provider key set, `/api/assist` returns `503` and the extension keeps
Summary on-device-only. To change preference order, reorder the array in
`providersFromEnv` (`api/_relay.mjs`).

## What is and isn't claimed

- It is **"an optional plain-language rewrite of the part you pick"** or
  **"the key points of an article"** — not "understand any article", not a
  comprehension guarantee.
- The rewrite prompt tells the model to keep every fact, name and number, add
  nothing, and drop nothing — but a model can still get it wrong, so the
  original is always on screen next to it.
- The summary is "the main points as the text states them", capped to the
  article's opening for a long piece, and labelled when it was clipped.
- Ask AI answers **about the article you're reading** — the article is always
  sent as context, and `ASK_SYSTEM` tells the model to stay close to it and
  to flag plainly when the article doesn't cover the question. It is not
  positioned as a general chatbot, and every answer carries the "AI — may not
  be exact" line.
- Store answer to "do you use remote code?" stays **No**: this sends and
  receives data (text in, generated text out), it doesn't fetch or
  execute code. The on-device path, where it applies, is part of the browser.

## Not in v1

A running multi-turn transcript in the Ask rail (each question currently
replaces the last answer). Simplify's cloud path — still on-device-only,
still not disclosed as a cloud feature.
