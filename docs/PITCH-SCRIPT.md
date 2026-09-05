# ReadTune — pitch narration script

Read by the "Listen" button in the nav and the "o" of "Stop" in the hero
headline on readtune.tech. One recording, played back as a static file — not a
live read of the whole page. Condensed from the hero copy (`index.html`) and
the tagline/problem framing in `docs/DEVPOST.md`.

**Target length:** ~30–40 seconds at a natural pace (about 90 words).

## Script

> Most reading tools hand you a pile of toggles and let you guess. ReadTune
> runs the experiment on you instead.
>
> A four-minute check compares real settings, side by side — spacing,
> contrast, line length, read-aloud — and finds what actually helps you read,
> not what helps on average. Then it carries that profile into articles,
> PDFs, and the rest of the web.
>
> No account. Nothing leaves your device by default. Free, open source, and
> built for the moment a page should feel possible again.
>
> This is ReadTune.

## Recording it

1. Generate the audio through ElevenLabs (an account is required — the Text
   to Speech tool at [elevenlabs.io](https://elevenlabs.io/app/speech-synthesis)
   works fine for a one-off clip like this). A calm, clear, moderate-pace
   voice fits the product's tone best — nothing hyped or salesy.
2. Export as MP3.
3. Save the file as `audio/pitch.mp3` in this repo (create the `audio/`
   folder if it doesn't exist yet).
4. That's the whole integration: `site.js`'s "Hear the pitch" trigger already
   points at that exact path and activates automatically the moment the file
   exists — nothing else to wire up. Until the file is there, the "Listen"
   button and the hero "o" quietly remove themselves rather than sit there
   doing nothing.
