# Reading assistant (Summary + Simplify)

**Goal:** the two AI helpers that actually earn their place for a struggling
reader — a short "what is this about" before committing to a long article, and a
plain-language rewrite of the one paragraph that won't come together — while
keeping ReadTune's wedge intact: free, no account, private, offline where the
browser allows it.

## As shipped (v0.9.0)

Two entry points in Reader View:

- **Summary** — a header action. Key points for the article (its opening, if the
  article is long — capped at ~12k characters).
- **Simplify** — a pill that appears over any selection of ~12+ characters inside
  the reading flow. Rewrites that passage and shows it **beside the original**,
  never in its place, under an "AI — may not be exact" line.

Both render in one dismissible card (`shared/assist-ui.js`), modelled on the
word-lookup popup: Escape / click-outside / Cancel, a copy button, and "Hear it"
through the same read-aloud voice.

## How a request is routed (`shared/assist.js`)

1. **A task-specific on-device API**, if the browser has one: `Summarizer` for a
   summary, `Rewriter` for a rewrite. `create()` is the first `await` after the
   click, because Chrome refuses to start the one-time model download unless a
   user gesture is still live.
2. **The Prompt API** (`LanguageModel`) as the on-device fallback — this is the
   path today, since Chrome 152 ships `Summarizer` and `LanguageModel` but not
   `Rewriter` yet.
3. **The reader's own Gemini key** — a free Google AI Studio key, stored in
   `chrome.storage.local` under `readtune_assist` (mirrors the ElevenLabs
   `readtune_tts` pattern), sent with the request straight from the browser to
   `generativelanguage.googleapis.com`. The key form appears in the failure
   card, and proactively in the Reading Lab, only when there is nothing else to
   run on. Gated behind a `chrome.permissions.request` for that one origin.
4. **Never a ReadTune-hosted model.** A proxy would put the text you are reading
   on a server, and add cost, rate-limiting and an abuse surface. The whole
   point of the on-device-first design is that it doesn't.

On-device models are downloaded and cached by Chrome, shared across every site —
so the ~GB download happens at most once per browser, not once per extension.

## What is and isn't claimed

- It is **"an optional plain-language rewrite of the part you pick, generated on
  your device"** — not "understand any article", not a comprehension guarantee.
- The rewrite prompt tells the model to keep every fact, name and number, add
  nothing, and drop nothing — but a model can still get it wrong, so the
  original is always on screen next to it.
- The summary is "the main points as the text states them", capped to the
  article's opening for a long piece, and labelled when it was clipped.
- Store answer to "do you use remote code?" stays **No**: the built-in AI is part
  of the browser, and a Gemini request is data sent to the user's own account,
  not fetched code.

## Not in v1

Freeform "ask about this article" chat. The Prompt API is less widely available
than the task APIs, and open Q&A is the shape most likely to read as "ReadTune
understood the article for you". Revisit once the summarize/simplify path has
real user feedback.
