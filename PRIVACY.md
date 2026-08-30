# ReadTune — Privacy Policy

_Last updated: 2026_

ReadTune is built so there is nothing to collect.

## What ReadTune stores

- **Your reading profile** (font, spacing, colour, pacing and other settings chosen by the calibration test or by you), your **calibration history**, your **per-page reading position and highlights**, and the **list of sites you turned on "auto-open" / "auto-restyle" for**.
- If you turn on the optional ElevenLabs voice, **your ElevenLabs API key** is stored here too. It is never written to a file, never included in the project, and never sent anywhere except to ElevenLabs (see below).
- All of it is saved with the browser's local extension storage (`chrome.storage.local`) **on your own computer**.

## What ReadTune sends over the network

- **By default, nothing.** ReadTune has no server, no analytics, no telemetry, no accounts, and no third-party SDKs. It works fully offline. The libraries it uses (Mozilla Readability, pdf.js, hyphenation patterns, fonts) are bundled inside the extension.
- Default read-aloud uses your browser's built-in speech engine. On most systems the voices are local; if you choose a voice your OS marks as "online", that speech is handled by your OS/browser, not by ReadTune.
- **Only if you choose the ElevenLabs voice and enter your own API key:** the text of the passage being read aloud and your API key are sent to `https://api.elevenlabs.io` to generate the audio and the word timings. Nothing else is sent, and nothing is sent anywhere else. ElevenLabs' handling of that request is covered by ElevenLabs' own privacy policy. Remove the key any time with "Remove key" in the settings panel to stop this entirely.

## What ReadTune reads

- When you click **Open Reader View** (or press Alt+R), ReadTune reads the current tab's page content so it can show you a clean version. This happens only on your explicit action, only for that one page, and the content stays on your device.
- The PDF you open in PDF mode is read locally in the browser; the file is not uploaded.
- "Auto-open on this site" asks for permission to that one site before it will run there, and you can turn it off at any time.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` + `scripting` | To read / restyle the current page's text when you ask for Reader View or "Restyle this page" |
| `storage` | To save your settings and reading position on your device |
| host access to `api.elevenlabs.io` (optional) | Only if you enable the ElevenLabs voice |
| host access to a specific site (optional) | Only if you turn on "auto-open" / "auto-restyle" for that site |

## Your control

- Remove any saved data by using **Reset to defaults** in the settings panel, turning off "auto-open", or removing the extension (which clears all its local storage).

## Contact

Questions: open an issue on the project's GitHub repository.
