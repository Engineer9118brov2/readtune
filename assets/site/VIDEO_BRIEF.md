# ReadTune website video brief

The site auto-loads the filenames below. Record the real product, not a mockup.
Keep browser chrome visible where it helps prove this is a real extension.

## Global capture spec
- 16:10 preferred (1440x900 or 1280x800); 16:9 is okay.
- 60 fps capture if convenient; export H.264 MP4 at 30 fps.
- Cursor visible, smooth, no frantic movement.
- No music or narration required: every clip must make sense muted.
- Do not burn captions into the video; the website supplies the explanation.
- Keep each clip 10–24 seconds and ideally under 8 MB after compression.
- Start and end on stable frames so autoplay loops do not look like a jump cut.
- Use the same article / visual theme across clips when practical so the site feels like one story.

## 1. `ai-mode.mp4` — PRIORITY / 18–24 sec
Goal: prove AI is integrated into reading, not a generic chatbot bolted on top.

Shot sequence:
1. Start in Reader View with a real article visible and Article chat closed (1–2 sec).
2. Open Article chat. Pause briefly so it is obvious **nothing auto-runs** (1 sec).
3. Click **Summary** or ask a real article question. Show the response beside the article (4–5 sec).
4. Change answer level from **As written → Simpler** and let the answer visibly update (3–4 sec).
5. Select a word / short phrase in the article and use **Define** or **Explain** (3–4 sec).
6. Click **Save as highlight/note** or use **Annotate**, ending with the saved help visible in the article (4–5 sec).

Best final frame: article + AI rail + a saved highlighted explanation all visible together.
Avoid: typing a long question, waiting on a loading spinner, or framing only the chat rail.

## 2. `calibration-flow.mp4` — 14–18 sec
Goal: make the unique differentiator understandable in one loop.

Shot sequence:
1. Show one scored passage in the preference check (2 sec).
2. Finish the passage, answer the two-word cloze question, choose an ease rating (4–5 sec).
3. Use a quick edit/jump to the final result rather than recording every passage (1 sec transition).
4. Land on the result screen with **Provisional** / clearest signal / kept setting visible (5–7 sec).
5. Briefly show the option to keep standard / retake / continue (2 sec).

Best final frame: result screen clearly says this is a starting point, not a diagnosis.

## 3. `reading-lab.mp4` — 12–16 sec
Goal: show that ReadTune learns from repeat use instead of pretending one test is perfect.

Shot sequence:
1. Open Reading Lab and show recent runs / repeatability (4 sec).
2. Scroll or move into the "what repeated" signal area (3 sec).
3. Open Voice Fit and preview one local voice (3–4 sec).
4. End with the chosen profile / repeated signal visible (2–3 sec).

Best final frame: repeated preference signal + Voice Fit in the same visual story.

## 4. `read-aloud.mp4` — 10–14 sec
Goal: sell the follow-along experience, not merely audio playback.

Shot sequence:
1. Start with Reader View in a readable profile (1 sec).
2. Press play (1 sec).
3. Let 1–2 sentences play while sentence + current-word highlighting visibly advances (6–8 sec).
4. Change speed once or pause/resume once (2 sec).

Best final frame: current sentence highlight, current-word highlight, and transport visible.
Avoid: audio-source setup screens or voice download screens in this clip.

## 5. `restyle-page.mp4` — 10–14 sec
Goal: show the magic of keeping the original website while making its text fit the reader.

Shot sequence:
1. Start on a recognizable real article in its original styling (2 sec).
2. Trigger **Restyle this page** (Alt+Shift+R or popup action) (1–2 sec).
3. Hold on the transformed page so font/spacing/tint/focus change is obvious while site chrome stays recognizable (4–5 sec).
4. Change one quick control, then toggle ReadTune off and show the page restore (3–4 sec).

Best final frame: either the readable restyled page or a clean before/after loop point.

## Still images the site also wants
- `reader-settings.png`: Reader View + polished settings rail open.
- `calibration-results.png`: fallback for calibration video.
- `reading-lab.png`: fallback for Reading Lab video.
- `read-aloud.png`: fallback for read-aloud video.
- `restyle-page.png`: fallback for live restyle video.

## Capture hygiene
- Close unrelated tabs / bookmarks with personal information.
- Use a neutral public article that is safe to show publicly.
- Hide DevTools and debug UI.
- Use the production-looking extension icon/name, not a temporary branch label.
- If a model/relay takes variable time, record the successful run first and trim dead waiting time.
