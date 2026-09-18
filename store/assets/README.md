# Chrome Web Store assets

These files map directly to the Chrome Web Store Developer Dashboard:

| Dashboard field | File | Notes |
| --- | --- | --- |
| Screenshots | `01-reader-view.png` | Reader View with the settings panel and evidence-informed starter |
| Screenshots | `02-focus-ruler.png` | Reader View with the adaptive reading guide |
| Screenshots | `03-read-along.png` | Read-aloud screen with sentence/word follow-along |
| Screenshots | `04-restyle-page.png` | Restyle this page in place with the floating control bar |
| Small promo tile | `promo-small.png` | 440 x 280 PNG |
| Marquee promo tile | `promo-marquee.png` | 1400 x 560 PNG |

Chrome Web Store screenshots should be 1280 x 800 or 640 x 400. Use the four PNGs above; do not upload screenshots with red annotations, browser error pages, or the Developer Dashboard visible.

The SVG files are the editable sources for the two promo tiles. The PNGs are the upload versions.

## Before submission — replace the legacy visual set

The old screenshots are placeholders only. Capture a fresh 1280×800 set from
the final build:

1. Reader View + Reading Settings open.
2. Article Chat with a successful Summary/Ask response.
3. Read-aloud with active sentence/word follow-along.
4. Restyle running on a normal webpage.
5. Reading Lab / Voice Fit after the wide comparison-grid update.

Do not use screenshots containing visible error states, private user data, or
third-party branding as the dominant promotional element. Run `npm run prestore`
after replacing the images. Promo tiles are optional; if supplied, use real PNG
files at 440×280 and 1400×560.
