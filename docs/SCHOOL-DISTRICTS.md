# Getting ReadTune unblocked in a school district

School-managed Chromebooks and Chrome profiles run **allow-list only**: every
extension is blocked unless an admin adds its ID in the Google Admin console.
Speechify, Read&Write, and most reading tools are blocked the same way. This is
the plan to get past that — after ReadTune is on the Chrome Web Store.

## Why this is a realistic path for ReadTune specifically

An IT admin evaluating an extension checks, roughly in order:

1. **Does it collect student data / PII?** ReadTune has no accounts, no
   analytics, no telemetry. The reading profile, calibration history, and
   highlights are stored in `chrome.storage.local` on the device and never
   leave it. Optional Ask AI and cloud-voice routes can send selected text,
   and are disclosed the same way to the admin as to the student.
2. **What can it touch?** It installs with `activeTab`, `scripting`, `storage`
   only. It cannot read a page until the student clicks the button or presses
   the shortcut. Broader access is an *optional* per-site permission the student
   turns on themselves.
3. **Does it phone home?** Not by default. Read-aloud uses a neural voice that
   runs on the device, and the default voice ships inside the extension. Four
   opt-in features send data: **Ask AI** sends the article text (and, for a
   typed question, the question) to ReadTune's own relay to generate a summary
   or answer — only when a student opens the panel and asks, never
   automatically; Premium voice sends the spoken sentence to ReadTune's relay;
   dictation uses Chrome's own speech recognition (audio goes to Google, as it
   does for any site that uses that browser API); and ElevenLabs read-aloud
   needs a personal API key students may choose to provide.
   Selecting an extra read-aloud voice downloads a one-time model file from
   Hugging Face.
4. **What does it cost?** Nothing. No per-seat licence, no quote, no renewal.
5. **Is it a support burden?** No login to reset, no account to provision, works
   offline. The package is larger than a typical extension (~60 MB) because the
   on-device voice is bundled.

That's a genuinely easy approval compared to a paid tool that ships an SSO
integration and a data-processing agreement.

## The three assets

### 1. A public "For school IT" page — `readtune.tech/school.html`

One URL an admin can open and forward. It states, in plain language: no data
collected, the exact permissions and why, the network behaviour, the three
optional network routes, the Web Store ID to allow-list, and a contact. This is `school.html`
in the repo (host it alongside the marketing site). **Do not** make it a PDF —
a URL is easier to forward and can't be "an old version."

### 2. The Admin-console allow-list instructions (put these on that page)

> **To allow ReadTune for your users (Google Admin console):**
> Devices → Chrome → Apps & extensions → Users & browsers → pick the OU →
> "＋" → Add Chrome app or extension by ID → paste `<WEB STORE ID>` →
> set to **Allow install** (or **Force install** for a class set).
> Store URL: `https://chromewebstore.google.com/detail/<WEB STORE ID>`

*(The ID is assigned when the extension is published. Fill it in everywhere in
this doc and on the page once it's live.)*

### 3. Copy-paste request emails

Give students, parents, and teachers a message they can send to the help desk
without writing anything. Volume matters: one request is a ticket, a dozen
requests for the same tool for coursework is a priority.

---

## Email templates

### From a student → school IT / tech help desk

> **Subject:** Requesting an accessibility extension for coursework — ReadTune
>
> Hi,
>
> I'd like to request that the **ReadTune** Chrome extension be allowed on my
> school account. I use assistive reading settings (spacing, a reading ruler,
> and text-to-speech) to get through reading assignments, and ReadTune is a
> free tool that does this without an account.
>
> A summary for IT is here: `https://readtune.tech/school.html`
> Web Store page: `https://chromewebstore.google.com/detail/<WEB STORE ID>`
>
> From what I can tell it collects no personal data, stores everything on the
> device, and installs with minimal permissions. Happy to talk to whoever
> reviews these.
>
> Thank you,
> [Name, grade, student ID if required]

### From a parent/guardian → school or district

> **Subject:** Request to allow a free reading-accessibility extension (ReadTune)
>
> Dear [name / IT department],
>
> My child [name], in [grade] at [school], benefits from assistive reading
> supports — adjustable spacing and fonts, a line-focus guide, and text read
> aloud. **ReadTune** is a free Chrome extension that provides these. Unlike the
> paid options, it needs no account and no subscription.
>
> For your review: `https://readtune.tech/school.html`. In short: it
> collects no student information, transmits nothing to a server, stores
> settings locally on the device, and requests only the permissions it needs
> to reformat a page when the student asks it to.
>
> Could you let me know what the process is to have it added to the approved
> extensions list? I'm glad to provide anything else you need.
>
> Thank you,
> [Name] — [contact]

### From a teacher / SLP / special-ed coordinator → IT

> **Subject:** Approved-extension request: ReadTune (reading accessibility, free)
>
> Hi [IT contact],
>
> I have several students on IEPs/504s with reading goals who would benefit from
> **ReadTune**, a free reading-support Chrome extension (adjustable typography,
> line focus, sentence pacing, text-to-speech with word highlighting).
>
> It's a good fit for a managed environment: no student accounts, no data
> collection, local storage only, `activeTab`/`scripting`/`storage` permissions.
> IT summary: `https://readtune.tech/school.html`.
>
> Can we get it on the allow-list for [OU / grade / building]? I can pilot with
> a small group first if that helps the review.
>
> Thanks,
> [Name, role]

### Short follow-up (if there's no reply in ~1 week)

> Following up on the request below to allow the ReadTune extension for
> [student / my students]. It's needed for daily reading assignments. Is there
> a form or a committee I should route this to? Happy to help move it along.

---

## Outreach to districts directly (once you have a few real users)

Warm intros beat cold email. In order of yield:

1. **A teacher or SLP already using it** asks their own district to formalize it.
   This is the strongest path — it's an internal request, not a vendor pitch.
2. **Special-education / assistive-technology coordinators** — they evaluate
   tools for a living. Find them on district staff directories and LinkedIn
   (titles: "Assistive Technology Specialist", "Coordinator of Special
   Education Technology", "Director of Digital Learning").
3. **State parent-training and information (PTI) centers** and dyslexia
   advocacy groups — they maintain resource lists parents actually read.

Pitch, kept short: *free, private, no account, works offline, here's the IT
page, here's a teacher in [district] already using it.* Attach nothing; link
`school.html`.

## What NOT to claim

- Don't say "COPPA/FERPA certified" or "compliant" as a badge. Say what's true:
  the core reading tools have no account or ReadTune telemetry, while optional
  cloud voice and Ask AI features can transmit selected reading text to their
  disclosed providers. District administrators must decide whether those
  optional services are permitted for their students.
- Don't claim "nothing ever leaves the device, period." The honest line is
  "core reading features stay local; optional Premium voice, ElevenLabs, and
  Ask AI disclose before they send text." Disable or avoid those options where
  a district requires local-only use.
- Don't promise a data-processing agreement or a signed contract you can't
  support. If a large district requires one, that's a real conversation to have
  then, not a claim to make now.
