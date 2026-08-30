# ReadTune test harness

A browser harness that stubs `chrome.*` and exercises the engine — sanitizing,
Readability, bionic bolding, syllable splitting, pacing modes, PDF extraction,
reading aids, the settings panel, and the calibration scoring.

## Run it

```bash
# from the repo root
python3 -m http.server 8777
```

Then open <http://localhost:8777/test/harness.html>. Green = pass, red = fail;
the last line reports the total. The lower half renders a live article so you can
eyeball the typography.

`reader-sandbox.html` loads the real `reader.js` with a stubbed `chrome` and a
pre-loaded article — useful for poking at Reader View, the panel, read-aloud and
the transport bar without reloading the unpacked extension each time.

Not shipped — `npm run build` excludes this folder.
