# Launch & growth plan

Goal: real, reachable users who experience reading friction (or teach/parent
someone who does) — not extension-directory drive-by installs. The wedge is the
same everywhere: **free, local-first, no account, and a quick preference check
that suggests settings to try.**

## Sequence

### Before the Web Store listing is live
- Ship the demo video (see `docs/VIDEO.md`). Nothing below works without it.
- Make sure `readtune.tech`, `/privacy.html`, and `/school.html` are live
  and the bundled fonts load (check the dyslexia-friendly UI toggle actually applies the roomier Atkinson/Lexend chrome).
- Have "load unpacked" instructions ready for people who want it before it's
  approved.

### Week of launch
- Post to the communities below over ~5 days, not all at once. One genuine post
  per community, then reply to every comment.
- Submit to Product Hunt and Hacker News on the same day (different audiences).
- Email the 5–10 people who tried it during the hackathon and ask them to
  install the store version and, if it helped, say so publicly somewhere.

### Ongoing
- Reply to every review and every GitHub issue within a day.
- When someone posts "this helped my kid," ask if you can quote them on the site
  (see "Showing traction" below).

## Communities beyond Reddit

Ranked by fit. Read each group's rules first; several ban anything that looks
like promotion, so lead with the story, not the link.

### Facebook groups (highest yield for the target user)
- **"Parents of Children with Dyslexia"**, **"Decoding Dyslexia"** (national +
  most US states have a chapter group), **"Homeschooling with Dyslexia"**,
  **"Dyslexia — the Gift"**, **"ADHD Parents Support Group"**,
  **"Assistive Technology for Education"**.
- Post as what it is: "I built a free reading extension that offers a small
  preference check and applies its suggested starting setup to articles and
  PDFs. No account is required; optional online features say when they send
  text. Would love feedback from people who experience reading friction." Link
  the site, not the Web Store, so the
  first thing they see is the explanation.
- Parents in these groups share tools aggressively when they're free and private.

### LinkedIn
- Connect with and message people whose title is **Assistive Technology
  Specialist / Coordinator**, **Speech-Language Pathologist**, **Special
  Education Technology**, **Director of Digital Learning / Accessibility**.
- One short message: what it does, that it passes a district review easily
  (link `school.html`), offer a pilot. These people put tools in front of
  hundreds of students.
- A single post on your own feed framed around the equity angle ("the reading
  tools that work are paywalled; here's a free one") travels in ed-tech circles.

### Dyslexia / accessibility organizations
- **r/Dyslexia** is the exception to "beyond Reddit" — small but exactly the
  user. Also **r/ADHD**, **r/dyslexia** wiki resource list.
- Ask **Understood.org**, **Dyslexic Advantage**, **The Dyslexia Initiative**,
  and your **state Parent Training & Information center** to add it to their
  free-tools lists. These lists are what parents actually read.
- **AT vendors' user forums** and the **ATIA** community.

### Developer / maker audiences (for credibility + contributors, not end users)
- **Product Hunt** — lead with "free & private alternative to paywalled reading
  tools," not the tech.
- **Hacker News** (Show HN) — lead with the calibration method and the
  Manifest-V3 "no remote code, all local" architecture; that crowd rewards the
  engineering honesty.
- **Indie Hackers**, **Lobsters**, **r/chrome_extensions**.

### Where NOT to bother
- Generic "best chrome extensions" listicles and SEO farms — installs that never
  open the calibration.
- Buying anything. This product's whole pitch is trust; paid promo undercuts it.

## Post templates

**Facebook / parent groups:**
> I find dense screen text tiring, and I built a free Chrome extension to make
> articles and selectable PDFs easier to shape around a reader's preferences.
> It offers a four-minute preference check with reading time, comprehension
> questions, and an ease rating, then suggests a starting setup from the font,
> spacing, and emphasis settings it tried. You can skip it or change everything
> yourself. No account or subscription is required; optional online features
> clearly say when they send text. It's at readtune.tech. I'd really value
> feedback from people who deal with this.

**Show HN:**
> Show HN: ReadTune – a reading extension that tries reading settings with you
>
> Many reading-accessibility tools begin with a wall of toggles. ReadTune runs
> a short preference check: one setting changes per passage, standard text is
> repeated, and the reader completes a two-word cloze check and rates ease. It
> offers a starting setup, not a clinical result, and the reader can reject it.
> Manifest V3, no build step, no remotely loaded executable code; read-aloud
> defaults to an on-device Piper voice, with clearly optional cloud-voice paths.
> Free and open source. Method write-up and limits are in the repo.

**LinkedIn (to AT specialists):**
> I built a free reading-support extension aimed at students who can't get the
> paid tools. It's designed to clear a district review fast — no accounts, no
> data collection, local storage only ([school.html link]). If you evaluate
> assistive tech, I'd love your read on it, and I'm happy to run a small pilot.

## Showing traction on the site — without adding tracking

The product promise is "no analytics." Keep it. Ways to show real usage anyway:

1. **Chrome Web Store weekly-users count.** Google publishes it on the listing.
   Quote it on the site ("used by N people weekly") and link the listing. No
   tracking involved — Google counts, not you.
2. **GitHub stars / forks** — a public number you can badge.
3. **A testimonial wall.** When someone says it helped, ask permission and put
   the quote (first name + role, e.g. "parent, Ohio") on the site. Ten real
   quotes beat a fake counter.
4. **An opt-in "it helped" button** in the extension that opens a prefilled
   GitHub issue or a plain form — the person chooses to send it, and it carries
   no identifiers you didn't ask for. Count those.
5. **Hackathon / Devpost metrics** — Devpost shows views and likes; fine to cite
   during the event.

Do **not** add a pageview pixel, a "phone home on install" ping, or a silent
counter. It would be a small number and a large breach of the one promise the
whole project is built on — and a judge or a school reviewer who notices it in
the code will weight that heavily.

## During the hackathon specifically

- The single highest-value asset is a **real person using it on camera** saying
  it helped (`docs/VIDEO.md` treats this as priority #1). One genuine 20-second
  clip outweighs every growth tactic above for the social-impact score.
- If any of the launch posts get real engagement before judging, screenshot it
  for the Devpost "traction" section.
- Keep a short log of who tried it and what they said — that's evidence of
  impact, which is 40% of the score.
