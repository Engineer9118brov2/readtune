# ReadTune — Privacy Policy

_Last updated: 2026_

ReadTune is built so there is nothing to collect.

## What ReadTune stores

- **Your reading profile** (font, spacing, colour, pacing and other settings chosen by the calibration test or by you), your **calibration history**, your **per-page reading position and highlights**, and the **list of sites you turned on "auto-open" for**.
- All of it is saved with the browser's local extension storage (`chrome.storage.local`) **on your own computer**. It is never sent anywhere.

## What ReadTune sends over the network

- **Nothing.** ReadTune has no server, no analytics, no telemetry, no accounts, and no third-party SDKs. It works fully offline.
- The libraries it uses (Mozilla Readability, pdf.js, hyphenation patterns, fonts) are bundled inside the extension — it does not fetch anything at runtime.
- Read-aloud uses your browser's built-in speech engine. On most systems the voices are local; if you choose a voice your operating system marks as "online", that speech is handled by your OS/browser, not by ReadTune.

## What ReadTune reads

- When you click **Open Reader View** (or press Alt+R), ReadTune reads the current tab's page content so it can show you a clean version. This happens only on your explicit action, only for that one page, and the content stays on your device.
- The PDF you open in PDF mode is read locally in the browser; the file is not uploaded.
- "Auto-open on this site" asks for permission to that one site before it will run there, and you can turn it off at any time.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` + `scripting` | To read the current page's text when you ask for Reader View |
| `storage` | To save your settings and reading position on your device |
| host access to a specific site (optional) | Only if you turn on "auto-open" for that site |

## Your control

- Remove any saved data by using **Reset to defaults** in the settings panel, turning off "auto-open", or removing the extension (which clears all its local storage).

## Contact

Questions: open an issue on the project's GitHub repository.
