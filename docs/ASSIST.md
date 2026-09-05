# Reading assistant (Summary + Simplify)

**Goal:** the two AI helpers that actually earn their place for a struggling
reader — a short "what is this about" before committing to a long article, and a
plain-language rewrite of the one paragraph that won't come together — while
keeping ReadTune's wedge intact: free, no account, private, offline where the
browser allows it.

**Removed:** the "bring your own Gemini key" fallback shipped in 0.9.0 and was
removed shortly after. Rationale: the extension's own readers are people who
find text hard to work with, not people comfortable creating a Google AI
Studio project and pasting an API key — a key-entry form was never a real
fallback for this audience, just a UI that looked like one.

## As shipped

Two entry points in Reader View:

- **Summary** — a header action. Key points for the article (its opening, if the
  article is long — capped at ~12k characters).
- **Simplify** — a pill that appears over any selection of ~12+ characters inside
  the reading flow. Rewrites that passage and shows it **beside the original**,
  never in its place, under an "AI — may not be exact" line.

**Download consent:** the on-device model is a one-time ~2 GB download, kept by
Chrome and shared across every site — but it lives on *this* device, not synced
to a reader's other devices, and it's real storage cost on a device that may
not have much to spare. So the first time a reader hits Summary/Simplify on a
browser where the model is "downloadable" (offered, not yet started), the card
shows a plain "Set it up" / "Not now" choice instead of silently starting a
multi-GB download. `create()` — the call that actually starts it — only runs
after "Set it up" is clicked, which is itself a fresh user gesture, so the
"requires a live gesture" rule below still holds. Already-downloading or
already-available skips straight through; there's nothing new to ask.

Both render in one dismissible card (`shared/assist-ui.js`), modelled on the
word-lookup popup: Escape / click-outside / Cancel, a copy button, and "Hear it"
through the same read-aloud voice.

## How a request is routed (`shared/assist.js`)

On-device only, in this order:

1. **A task-specific on-device API**, if the browser has one: `Summarizer` for a
   summary, `Rewriter` for a rewrite. `create()` is the first `await` after the
   click, because Chrome refuses to start the one-time model download unless a
   user gesture is still live.
2. **The Prompt API** (`LanguageModel`) as the on-device fallback — this is the
   path today, since Chrome 152 ships `Summarizer` and `LanguageModel` but not
   `Rewriter` yet.
3. **If neither is available, the feature just isn't.** There used to be a
   "bring your own Gemini key" third tier here. It's gone — pasting a Google AI
   Studio key is not a real fallback for the readers this extension is for, so a
   browser with no on-device AI gets an honest "not available here" instead of a
   form nobody in the target audience can actually fill out. `describeAvailability()`
   reports only two modes now: `"on-device"` (ready or downloading) and `"none"`.
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
  of the browser; ReadTune makes no network request for this feature at all.

## Not in v1

Freeform "ask about this article" chat. The Prompt API is less widely available
than the task APIs, and open Q&A is the shape most likely to read as "ReadTune
understood the article for you". Revisit once the summarize/simplify path has
real user feedback.
