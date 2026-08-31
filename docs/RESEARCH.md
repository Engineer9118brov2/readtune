# What the evidence actually says

ReadTune's design stance: **individual variation dominates.** What helps one
dyslexic or ADHD reader often does nothing for the next, and some popular aids
don't hold up well in controlled tests. That's the reason ReadTune *measures*
with the calibration test instead of prescribing a fixed "dyslexia mode."

This page is an honest summary of the evidence behind each option, including
where it's weak. If you're presenting ReadTune, **read the primary sources
before citing numbers** — this is a starting map, not a substitute for them.

## How this maps into ReadTune now

The quality pass shipped on **Monday, August 31, 2026** leans the product
toward a moderate research-backed starter before calibration takes over:

- **System Sans**
- **20px text**
- **1.75 line height**
- **0.02em letter spacing**
- **0.08em word spacing**
- **1.5em paragraph spacing**
- **58ch line width**
- **warm off-white with 94% contrast**

That is **not** presented as "the proven best setup." It is the lowest-risk
starter we could justify from the better-supported parts of the literature and
accessible-reading guidance:

- lead with read-aloud + follow-along
- give text more breathing room
- avoid harsh black-on-white when possible
- keep lines shorter and steadier
- treat fonts, tints, and bionic as optional experiments, not promises

---

## Well supported

**Text-to-speech with synchronized highlighting.** Strong, consistent evidence
that hearing text read aloud while the words are highlighted improves reading
comprehension and reduces fatigue for people with dyslexia. This is standard,
widely-recommended assistive technology. ReadTune's read-aloud (browser or
ElevenLabs) is the feature with the firmest ground under it.

**Increased letter, word, and line spacing.** Good evidence that extra spacing
improves reading speed for dyslexic readers, generally attributed to reduced
"visual crowding" (neighbouring letters interfering with recognition). The
often-cited result is Zorzi et al. (2012, *PNAS*) on letter spacing; the broader
crowding literature supports word and line spacing too. This is one of the
better-supported interventions and is why "Roomier spacing" is a single bundled
option in the calibration test.

**Lower contrast / not pure black-on-white.** Reducing brightness and using an
off-white background is generally easier on the eyes over long reading sessions
and has reasonable support, distinct from the coloured-overlay claims below.
ReadTune's reading surface is a warm off-white by default for this reason.

**Shorter line length (the "measure").** Typographic convention of roughly
45–75 characters per line has decent support for reading comfort and speed.

---

## Mixed — helps some people, not reliably measurable

**Dyslexia-specific fonts (OpenDyslexic).** The evidence is mixed to negative.
Several studies have found that OpenDyslexic does **not** reliably improve
reading speed or accuracy compared with good standard sans-serif fonts
(Arial, Verdana, Helvetica have all tested well). Kuster et al. (2018) found no
benefit for Dutch children with dyslexia. Rello & Baeza-Yates (2013) found
standard fonts performed as well or better. **However**, many readers report it
*feels* more comfortable, and comfort affects whether someone keeps reading.
ReadTune's position: offer it, test it per-person, don't claim it's a fix.

**Atkinson Hyperlegible.** Designed by the Braille Institute to disambiguate
easily-confused letterforms (b/d, I/l/1, O/0) for readers with low vision. The
design rationale is sound; independent peer-reviewed efficacy studies are
limited. Offered as a legibility option, not a proven treatment.

**Lexend.** Designed around reading-proficiency research (variable spacing to
reduce "visual stress"). Some efficacy claims exist; independent replication is
limited. Same treatment as Atkinson — an option to test, not a promise.

**Segmenting / one sentence at a time.** Some support for reducing cognitive and
working-memory load by presenting one unit at a time, particularly for readers
with attention difficulties. Trade-off: it removes the ability to glance ahead
or back, which some readers rely on.

---

## Weak or contested — included because readers ask for it, flagged honestly

**Coloured overlays / reading tints ("Irlen" / Meares-Irlen / visual stress").**
A subset of people consistently report that a specific colour tint reduces
visual distortion and effort. But the scientific consensus is that the evidence
for coloured overlays *as a treatment for dyslexia* is weak — a 2009 joint
statement by the American Academy of Pediatrics and American Academy of
Ophthalmology, among others, concluded there's insufficient evidence to support
them, and dyslexia is a language-based, not vision-based, condition. ReadTune
includes tints because (a) some users genuinely prefer them, (b) reduced
contrast/brightness *is* supported, and (c) they cost nothing to offer. They are
**not** presented as a dyslexia treatment, and the calibration test holds the
tint constant so it can't skew the result.

**Bionic Reading / fixation bolding (bolding the first letters of each word).**
Popular, and some readers say it helps them focus. But the controlled evidence
is thin-to-negative: independent tests have generally found **no** improvement
in reading speed or comprehension, and occasionally slight harm, and the
technique's own supporting material is not peer-reviewed. ReadTune includes it
as an adjustable option and lets the calibration test decide per person —
several testers do read measurably faster with it, several read slower. It is
not on by default and not claimed as evidence-based.

**RSVP / speed-reading (one word at a time at high words-per-minute).** RSVP can
push raw words-per-minute up, but comprehension falls off at high speeds and it
removes regressions (re-reading a phrase), which dyslexic readers rely on more
than average. ReadTune offers it as a **focus tool** — a way to stop your eyes
wandering — not as a way to read faster with equal understanding.

---

## The through-line

The features with the best evidence — read-aloud, spacing, lower contrast — are
prominent and, where sensible, lean toward being on. The contested ones —
tints, bionic, RSVP — are optional, off by default, and decided per person by
the calibration test rather than asserted. The honest version of ReadTune's
pitch is: *"most reading tools pick a side in these debates and make you live
with it; ReadTune runs the experiment on you and tells you what your own eyes
did."*

## Competitor lessons we kept

These are product lessons, not scientific sources:

- **Speechify** taught us that voice quality matters, but its own pricing page
  makes the free tier look intentionally weak. ReadTune stays free-first and
  treats premium voices as optional bring-your-own extras.
- **Microsoft Immersive Reader** taught us that line focus, text spacing, and
  synchronized read-aloud feel trustworthy when the experience is simple and
  calm.
- **Helperbird** taught us that breadth is useful, but a wall of tools can feel
  like work. ReadTune now leads with a starter and explains what usually helps
  before it asks the user to tune anything.
- **BeeLine** and **Bionic Reading** taught us the value of a sharp story, but
  we intentionally refuse to present one branded visual trick as a universal
  answer.

## Primary sources and product references

Primary sources behind this page:

- [W3C WCAG 2.1: Understanding Success Criterion 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG21/Understanding/text-spacing)
- [Zorzi et al. (2012), *Extra-large letter spacing improves reading in dyslexia*](https://www.pnas.org/doi/10.1073/pnas.1205566109)
- [Wood et al. (2018), meta-analysis of text-to-speech and read-aloud tools](https://pmc.ncbi.nlm.nih.gov/articles/PMC5494021/)
- [Wery & Diliberto (2017), OpenDyslexic study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5629233/)
- [Kuster et al. (2018), *Dyslexie font does not benefit reading in children with or without dyslexia*](https://pmc.ncbi.nlm.nih.gov/articles/PMC5934461/)
- [Joint statement from the American Academy of Pediatrics and American Academy of Ophthalmology on learning disabilities, dyslexia, and vision](https://www.aao.org/education/clinical-statement/joint-statement-learning-disabilities-dyslexia-vis)
- [International Dyslexia Association: Do special fonts help people with dyslexia?](https://dyslexiaida.org/do-special-fonts-help-people-with-dyslexia/)

Official product pages reviewed for positioning:

- [Speechify pricing](https://speechify.com/pricing/)
- [Microsoft Immersive Reader in Edge](https://support.microsoft.com/en-us/education/learning-accelerators/use-immersive-reader-in-microsoft-edge)
- [Helperbird for Chrome](https://www.helperbird.com/products/chrome/)
- [BeeLine Reader](https://www.beelinereader.com/)
