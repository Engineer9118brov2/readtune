# Getting ReadTune unblocked in a school district

School-managed Chromebooks and Chrome profiles run **allow-list only**: every
extension is blocked unless an admin adds its ID in the Google Admin console.
Speechify, Read&Write, and most reading tools are blocked the same way. This is
the plan to get past that — after ReadTune is on the Chrome Web Store.

## Why this is a realistic path for ReadTune specifically

An IT admin evaluating an extension checks, roughly in order:

1. **Does it collect student data / PII?** ReadTune has no accounts, no server,
   no analytics. Everything is stored in `chrome.storage.local` on the device.
   There is no data collection to review — which is the fastest possible answer.
2. **What can it touch?** It installs with `activeTab`, `scripting`, `storage`
   only. It cannot read a page until the student clicks the button or presses
   the shortcut. Broader access is an *optional* per-site permission the student
   turns on themselves.
3. **Does it phone home?** No — with one opt-in exception (ElevenLabs read-aloud,
   which needs a personal API key students won't have). The default browser
   voice is fully on-device.
4. **What does it cost?** Nothing. No per-seat licence, no quote, no renewal.
5. **Is it a support burden?** It's ~0.8 MB, no login to reset, no account to
   provision, works offline.

That's a genuinely easy approval compared to a paid tool that ships an SSO
integration and a data-processing agreement.

## The three assets

### 1. A public "For school IT" page — `readtune.vercel.app/school.html`

One URL an admin can open and forward. It states, in plain language: no data
collected, the exact permissions and why, the network behaviour, the one opt-in
exception, the Web Store ID to allow-list, and a contact. This is `school.html`
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
> A summary for IT is here: `https://readtune.vercel.app/school.html`
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
> For your review: `https://readtune.vercel.app/school.html`. In short: it
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
> IT summary: `https://readtune.vercel.app/school.html`.
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
  **ReadTune collects, stores, and transmits no student personal information, so
  those regulations have nothing to attach to.** If an admin wants that in
  writing, say so plainly in an email — that's a stronger position than a logo.
- Don't claim "nothing ever leaves the device, period." The honest line is
  "nothing leaves the device unless a student opts into the ElevenLabs voice
  with their own API key — which won't happen on a school account."
- Don't promise a data-processing agreement or a signed contract you can't
  support. If a large district requires one, that's a real conversation to have
  then, not a claim to make now.
