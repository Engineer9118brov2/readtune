# Reading assistant (Ask AI + selection tools)

ReadTune's AI tools are reading aids, not a general chatbot. They help a reader get oriented, ask a question about the current text, define a word, explain a passage, or save useful explanations back into the reading workflow.

## Shipped behavior

### Article / PDF chat

The Ask AI rail lives beside the reading surface.

- Opening the rail **does not send a request**.
- The reader explicitly chooses an action or submits a question.
- Closing the rail collapses it without destroying the rendered thread for that reading screen; reopening restores the same conversation.
- Quick actions include Summary, Key terms, Simple, and Annotate.
- Free-form questions support three answer levels: **As written**, **Simpler**, and **Simplest**.
- AI answers can be read aloud through the currently selected ReadTune voice path: Piper by default, or the optional hosted / ElevenLabs voice when configured.
- Useful AI output can be saved back as a highlight/note instead of living only in chat.

PDF extraction itself stays local. The PDF file is never uploaded. If the reader explicitly invokes a cloud-routed AI action in PDF mode, only the extracted text needed for that action can be sent to the relay.

### Selection tools

- **Simplify** rewrites a selected passage in plainer language and keeps the original visible. It remains on-device-only; if Chrome has no ready local model, ReadTune says so instead of silently sending the passage to the relay.
- **Define** appears for a short word/phrase and opens that term in Merriam-Webster instead of spending an AI request on a dictionary lookup.
- **Explain** appears for a longer selection and explains figurative language, tone, theme, or the main idea.
- Explain results can be saved as notes on highlights; dictionary lookups open in a separate tab.
- **Annotate this article** asks the cloud model for a small set of candidate passages, then lets the reader review Apply / Skip before anything is saved.

All AI output is labelled approximate because a model can be wrong.

## Routing (`shared/assist.js`)

ReadTune never triggers Chrome's large on-device model download itself.

1. **Already-ready Chrome built-in AI gets first chance.**
   - `Summarizer`, `Rewriter`, and `LanguageModel` are checked with `.availability()`.
   - ReadTune only creates a local session when Chrome reports the model is already available.
   - A short hedge window prevents a slow local session from making the reader wait indefinitely; cloud-capable actions may race the relay after that head start.

2. **Cloud-capable actions fall back to ReadTune's relay.**
   - Endpoint: `https://readtune.tech/api/assist`.
   - Cloud kinds used by the current UI: `summary`, `ask`, `explain`, `annotate`. The older `define` relay kind remains for compatibility but the selection UI now uses a dictionary link.
   - `simplify` is intentionally excluded.
   - URL query strings and fragments are removed before an article URL is sent.

3. **The relay forwards to configured third-party model providers.**
   - Provider routing lives in `api/_relay.mjs`.
   - Provider failures fall through according to the relay's configured fallback behavior.
   - Upstream provider error details are sanitized before a response reaches the extension.

## Context limits

The client and relay both cap payload sizes so a pathological page cannot wedge the model.

- Summary / annotation article budget: 12,000 characters.
- Ask context budget: 9,000 characters.
- Ask question: 500 characters.
- Define context: 800 characters; selected word/phrase: 80 characters.
- Explain / Simplify selection: 2,400 characters.

Ask uses block-level relevance selection before falling back to a simple article clip, so a question about material later in a long article can still retrieve that section.

Summary currently keeps the existing `clipped` disclosure when a long article exceeds its context budget. Issue #66 tracks improving Summary from head-only clipping to representative beginning / middle / tail context without increasing the 12k payload ceiling.

## Response caching

The current privacy model is deliberately narrow:

- **Only article summaries may be stored in the Redis response cache.**
- Cached summaries expire after 30 days.
- The cache key binds the normalized article URL to a hash of the submitted text, so a different body cannot overwrite another article's cached summary.
- Typed Ask answers, Explain results, annotations, and voice output are **not** persisted in that response cache.
- There is no ReadTune user account attached to a cached summary.

## Relay abuse protection

Both `/api/assist` and `/api/speak` have two layers:

1. a short-lived **per-client pseudonymous bucket**, derived with HMAC so raw client addresses are not written into Redis;
2. a higher shared global ceiling protecting the provider quota.

If Redis is unavailable, each warm serverless instance falls back to a bounded in-memory guard. A throttled request returns HTTP 429 with `Retry-After`.

Relay browser access is also origin-restricted rather than using wildcard CORS. The public ReadTune site and valid Chrome-extension origins can call the endpoints; unrelated web origins are rejected. Server/test calls without an Origin header remain supported.

## Privacy boundary

Core reading behavior does not require ReadTune's AI relay.

Text can leave the device only through an optional path the reader invokes, including:

- cloud-routed AI reading help;
- Premium voice, sentence by sentence through `/api/speak`;
- user-configured ElevenLabs read-aloud;
- Chrome's own speech-recognition service when Talk to type is used.

The default Piper voice, Reader View rendering, Restyle, calibration, highlights, and base PDF extraction are local. Extra on-device Piper voices may download their model file once, but reading text is not uploaded for those voices.

See `PRIVACY.md`, `privacy.html`, and `school.html` for the user/admin-facing wording. Those files should stay aligned with this document whenever a network path changes.

## UI / safety principles

- No AI action should auto-run merely because a rail or screen opened.
- Keep the source text visible whenever an AI transformation is shown.
- Clearly mark approximate/model-generated output.
- Abort in-flight generation and answer playback when the AI rail is collapsed or the reading screen is destroyed.
- Do not turn Simplify into a cloud feature without updating product disclosure and tests in the same change.
- Keep selection-triggered output text-only when rendering; saved notes must not become parsed HTML.

## Configuration

Server-side provider settings live in Vercel environment variables; no provider secret is shipped in the extension.

Common variables include:

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Enables the OpenRouter relay path. |
| `OPENROUTER_MODEL` | Optional model override. |
| `OLLAMA_API_KEY` | Optional additional provider path when supported by `_relay.mjs`. |
| `OLLAMA_MODEL` | Optional Ollama model override. |
| `UPSTASH_REDIS_REST_URL` / token | Enables summary caching plus distributed rate limiting. |
| `READTUNE_RATE_LIMIT_SECRET` | Optional secret used when deriving pseudonymous client identifiers; deployment should set a stable server-side value. |

With no usable AI provider configured, cloud requests fail cleanly rather than exposing provider details.

## What ReadTune claims

ReadTune offers reading assistance: key points, article-grounded questions, definitions, explanations, annotations, and optional plain-language rewrites. It does **not** claim to understand an article for the reader, diagnose a reading condition, or guarantee model accuracy.

Remote AI responses are data returned to the extension, not remote executable code. The Chrome Web Store answer to "Do you use remote code?" remains **No**.