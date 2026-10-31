# Lessons

Mistakes that reached production, why they got through, what now stops them, and the rules that follow. Read this
before you change the chat, Odelia's bot, or anything that draws on a canvas. Add an entry when something breaks in
production: what happened, why, the guards, the rules.

## 2026-10: a turn of the bot's head took the app to a white page

**What happened.** A person talked to Odelia, she went to work, and the whole app went white. The console showed
`IndexSizeError: Failed to execute 'ellipse' on 'Path2D': The major-axis radius provided (-3.5) is negative`.

**The cause.** The plush bot is a third-party canvas (bot-avatars) that we patch after install
(`scripts/patch-bot-avatars.mjs`) to dress it for each step. The glasses' lens radius was `9.6 * e.sx`, where `e.sx` is
the eye's foreshortening: the cosine of how far the eye has turned. Once the head turns past about 65 degrees (the full
turn in an idle hop, a poke, or a hard turn toward the work) the cosine goes negative, the radius goes negative, and
the browser throws. The body's squash scales (`pose.sx`, `pose.sy`) had no floor either.

**Why it got through.**

- A patched third-party visual: our code ran inside someone else's draw loop, with their numbers, and no one had
  checked what range those numbers take.
- No bounds on the animation math: scales and radii were whatever the formulas produced.
- No error boundary: one throw unmounted the whole React tree, so a broken ornament took the whole app down.
- No browser smoke test: every unit test ran without a real canvas, and a canvas is what throws. Nothing ever drew the
  bot while she worked.

**The guards that now prevent it.**

| Layer | Guard | Where |
|---|---|---|
| Source | The squash scales never go below 0.2, an eye's foreshortening never below 0.02, no radius below 0; the glasses only draw while both eyes face the viewer | `scripts/bot-avatars-math.mjs`, injected by `scripts/patch-bot-avatars.mjs` |
| Canvas | Every `ellipse` radius on `CanvasRenderingContext2D` and `Path2D` is clamped to 0 or more | `src/canvasSafe.ts`, called from `src/Bot.tsx` |
| React | The bot sits in a quiet boundary (it vanishes, the chat carries on); the app root has one that shows a reload message instead of a white page | `src/SafeBoundary.tsx`, `src/Bot.tsx`, `src/main.tsx` |
| Unit test | `npm run test:bot`: the math at and past every edge; the patched animator through minutes of working, done and idle with pokes and hard turns; every outfit through a full turn of the head, on a stand-in canvas that throws on a negative radius just as the browser does; the clamp wrapper turning -3.5 and NaN into 0 | `scripts/bot-crash-test.ts` |
| Browser | `npm run test:crash`: the built app in Chromium at 1440 and 390, Odelia sent five messages and watched for 20 seconds while every bot is poked through full turns; any uncaught error, canvas error or blank `#root` fails. It fails on the old code and passes on the new | `scripts/crash-smoke.mjs`, CI `app` job |

**Rules for the future.**

1. Every third-party visual (a canvas, a chart, an animation library, anything we patch) sits inside a quiet boundary
   (`<Guard quiet>` from `src/SafeBoundary.tsx`). An ornament that breaks disappears; it never takes the page with it.
2. Animation math is clamped where it is computed. Any number that becomes a scale, a radius, a width or an alpha goes
   through a bound (`__pcScale`, `__pcFore`, `__pcRadius`, or one like them) and is tested at its extremes, NaN and
   Infinity included. A cosine of a turn is negative half the time.
3. Any change to the chat, Odelia's bot, `src/Bot.tsx`, `src/tasks.ts` outfits or `scripts/patch-bot-avatars.mjs` must
   pass `npm run test:bot` and `npm run test:crash` before it ships.
4. A patch to a third-party library keeps its new math in a plain module the tests import, so what is tested is exactly
   what is drawn.

## 2026-10: payments were on with no way for a payment to reach the app

**What happened.** Payments were switched on (`app_settings.payments_on = true`) with the six current prices live in
Stripe, but Stripe had no webhook endpoint, `stripe_config` was empty and `stripe_events` had never seen an event. The
webhook was made only inside the billing function, just before a checkout, and the only call to billing that day was a
401. The store plan's prices were looked up by env var only, so without the env vars a checkout fell back to a team
quote; with them, a subscription found by lookup key alone would not have counted its stores.

**The guards that now prevent it.** The monitor's daily run and staff's Billing health (Check now) make or repair the
webhook as soon as `STRIPE_SECRET_KEY` is set, and report the key, the webhook's events, the signing secret, every
price by lookup key and any legacy price still active (`billingHealth`, `_shared/stripe_catalog.ts`). Prices are found
by env var or lookup key and checked to the cent. The person back from Checkout confirms the session, so the plan shows
even if the webhook is late. Signed sample events test the webhook (`stripe-webhook/handler_test.ts`).

**Rules.** Never switch payments on until Billing health says OK. A Stripe webhook is created by the server, never on a
customer's first visit. Every event the app relies on is in `WEBHOOK_EVENTS` and tested with a signed sample.

## 2026-10: the sample contradicted itself and cited the wrong agencies

**What happened.** An independent review of the sample (2026-10-23) asked Odelia "What permits do I still need for San
Jose and when will we open?" and got "I'm not sure… Placetta's library doesn't have it", with ten San Jose permits in
the workspace. One store showed three opening dates (Feb 9, 2027 on its card, a target of Mar 1, 2027 on Deadlines,
"about 16 weeks" on Permits). Home's badge said 3, "Waiting on you" and the bell 4, and the greeting "3 need you" with the
sign permit first while Home put the staff text first. A San José store's county health permit cited milpitas.gov, two
San José permits cited sjeconomy.com, and the state seller's permit cited San Francisco's guide. An appeal reply read
"Health plan check rejected (California Retail Food Code), heard by The county environmental health agency."

**The causes.**

- Routing order: `question()` sent anything with "permit" and a question mark to the forms library before anything
  looked at the workspace. The library answers what a place requires in general, so it said "not sure".
- Copies of a derived fact: the opening date was computed on the store card, typed by hand into the sample's deadlines
  (`dl-open`) and stored again as a static `projectedOpen`; the count of what needs the owner was `approvals.length` in
  one place, `todos()` in another and a fixed sentence in the greeting.
- A source picked for its sentence, not its agency: a proof's `link` replaced the row's source with whichever page held
  a quotable sentence, even a neighboring city's handout or an economic-development site.
- Labels pasted into a sentence: an appeal route's name and body are labels ("The county …"), spliced mid-clause.

**The guards that now prevent it.**

| Layer | Guard | Where |
|---|---|---|
| Agent | Questions about the business's own permits, stores, dates and what's waiting are answered from the workspace before the library (demo and live rules) | `fromWorkspace` in `src/agent.ts`, `src/live.ts` rules |
| Data | One opening per store: `openingOf`, `workspaceOpening`, `withOpenings`; the store card, the cost line, Deadlines, Home and Odelia all call them; no hand-written opening in the sample | `src/smart.ts` |
| Data | One count of what needs the owner: `todos()` for the badge, "Waiting on you", "Do this next" and the greeting (`standing()`); the bell shows a mark, not a second number | `src/doNext.ts`, `src/feed.ts`, `src/App.tsx` |
| Sources | San José and Santa Clara County rows cite sanjoseca.gov, sjpermits.org and deh.santaclaracounty.gov; the seller's permit cites the CDTFA | `src/forms/proof.ts`, `scripts/eval/proof-log.json` |
| Words | Appeal routes are said by one sentence builder, tested on every route in English and Chinese | `appealSay` in `src/appeals/index.ts` |
| Test | `npm run test:agent` runs the review's checks: phrasings in English and Chinese, one date, one count, the agencies' hosts, every appeal sentence, the denied permit's panel and its deadline, the approval route line, channels | `scripts/review-fixes-test.ts` |

**Rules for the future.**

1. A question about this business is answered from its workspace first; the library is for what a place requires.
2. A fact derived from the workspace (an opening date, a count, a status) has one function, and every screen and answer
   calls it. Never store a copy of it in sample data or a second formula on a page.
3. A source is the issuing agency's own site (the state's for a state permit). Never a neighboring city, an
   economic-development or chamber site, or another city's guide, however good its sentence.
4. Never splice a data label into the middle of a sentence. Write a sentence builder and test it on every value.
5. A button for a channel (voice, the interpreter, calls, texts, iMessage) shows only when the server says it is set up
   (`src/channels.ts`); otherwise it is hidden or says "Coming soon" with nothing to press.

## 2026-10: two portal rehearsals stopped on guards written against the guide's words, not the live page's

**What happened.** San Francisco's rehearsal stopped on Business Identification with "asks for an SSN": the approved
field "Business Tax ID (SSN, FEIN, or TIN)" names an SSN, so the EIN guard threw the approved EIN out as a person's
number, and the fix's test used the label "FEIN" instead of the real one. CDTFA's rehearsal refused "Register for a
Permit, License, or Account": GenTax draws every menu link as `href="javascript:;"`, which the off-site check read as a
script address.

**The guards that now prevent it.** `approvedEin` takes a field that names the business's number beside an SSN; the
value's NN-NNNNNNN shape keeps a person's number out (`worker/filer/src/guards.ts`). An empty script link
(`inertScriptLink`) is clicked like a button; any other `javascript:` link is still refused (`src/run.ts`). Tests use
the live labels and a GenTax-style link (`test/guards.test.ts`, `test/sandbox.test.ts`, `test/mocks/onlineservices.cdtfa.ca.gov.html`).

**Rule.** A guard's test uses the exact words of the live page and of the approved field, read with the probe, never a
paraphrase.

## 2026-10: the first-run tour came back after Skip

**What happened.** A reviewer pressed Skip on the tour ("Tell Odelia what you need", 1 of 3) and it showed again on the
next page. Skip was also a 28 by 20 pixel word in the corner.

**The cause.** Skip wrote its "seen" mark to localStorage only, inside a try that swallowed the failure. A browser that
reads storage but refuses writes (a full quota, some private modes) kept no mark, so every page load opened the tour.

**The guard.** `src/Walkthrough.tsx` keeps the mark in the tab's memory first, then in localStorage, sessionStorage or
a cookie, whichever takes it, and reads all four. Escape skips too. Skip is a labelled 44px button with a close mark.

**Rule.** A dismissal a person makes must stick even when storage refuses the write: keep it in memory for the visit
and fall back through the other per-viewer stores. Test it with `Storage.prototype.setItem` throwing.

## Everything on a line shares one center (Oct 29 2026)

What broke: the founder found, one screenshot at a time, things sitting at different heights on the same line: "Have
Odelia find all 2" against "Show fewer"; the tour's Back 7px above Next; the chat bar's text 2.6px under its mic on
phones; testimonial logos at four heights; Home's tabs in an old pill style beside underlined ones; download icons
pressed against their words. Each was a row whose items had different heights with nothing centering them
(flex-start or flex-end alignment, one item 4px taller), or two styles for the same control.

Rules:
- In a row, buttons, links, text, numbers, badges and logos share one vertical center. Icons are centered on their
  text's line. Use align-items: center, or give every item the same height when a row must align to its bottom.
- Logos in a set go in equal-height slots, centered.
- One style per control (tabs, pills, small buttons): never two.
- Less is more: whitespace over divider lines; few boxes, no bento grids. Side-by-side cards are the same height.
- Check before showing UI: node scripts/fit-check.mjs --align (its "row" and "icon" checks must report 0).

## 2026-10: twelve pushes went out on a red CI, so the server never got them

**What happened.** From the onboarding commit (Oct 29) to the third UI loop (Oct 30) every CI run on main failed,
and "Deploy server functions" only runs after a green CI, so it skipped every time. The app (Vercel) shipped; the
Supabase functions, including Odelia's new instructions, stayed at the Oct 29 morning build.

**The cause.** Two checks failed that the local runs before each push didn't cover: the filer worker's typecheck
(`worker/filer` `tsc`, a test's `Mem.login()` no longer matched `Store.login(f)` after another change) and
`npm run seo` (a landing change left `site/index.html`, `site/sitemap.xml` and `site/sitemaps/pages.xml` stale).
Nobody looked at CI after pushing.

**The rules.**

- After every push to main, check the CI run (`gh run list --workflow CI --limit 1`) and fix a red one before anything
  else. A push isn't done until CI is green and "Deploy server functions" ran.
- Before pushing a change to `site/`, run `npm run seo`. Before pushing a change near the worker, run
  `(cd worker/filer && npx tsc -p tsconfig.json)`.

## 2026-10: the daily production probe failed for a week and nobody read it

**What happened.** The probe that files 30 real licenses end to end against production failed every day from Oct 23.
First the age gate refused its accounts (so nothing past sign-in was tested at all); once that was fixed, 27 of 29
licenses stopped short of an approval card.

**The causes.** The probe's accounts never confirmed their age. Two pre-approval checks refused right answers: a name
and a phone under Florida DR-1's "Email Communication" section read as bad emails, and "No" to SS-4 line 18 ("ever
received an EIN") read as a bad EIN; the card can't go up past an error, so Odelia waited on a specialist. And Odelia
held cards for optional lines (a DBA, a fax, an inspection language) instead of writing "None" and putting the card up.

**The rules.**

- Read the production probe every day (`gh run list --workflow probe.yml --limit 1`); a red probe is the first task.
- A check that refuses a value must look at what the line asks, not a word in its section's heading.
- Optional lines never hold an approval: "None" is an answer.

## 2026-10: a screenshot script "broke" the app by deleting a node React owned

**What happened.** Checking the approval card, every permit drawer showed "Something on this page broke". The app was
fine: the screenshot script had removed the tour's popup with `element.remove()`, and React then failed to insert next
to a node it no longer had (`insertBefore ... not a child of this node`).

**The rule.** A test or screenshot never edits the DOM React renders. Dismiss things the way a person does, or set the
state before load (`page.addInitScript(() => localStorage.setItem("placetta-tour-1", "1"))` skips the tour).

## 2026-10: the probe's last 18 stops: lines that ask for several things, twin labels, and a silent "Done."

**What happened.** 18 of 45 probe cases ended with no approval card. The causes, each found in the replies:

- A line that asks for several things was checked as if it asked for one. DTF-17 line K ("name, title, SSN or ITIN,
  address") with "SSN by hand" read as a malformed SSN, and the street number and ZIP added up to nine digits, which
  read as a bare SSN. Hawaii BB-1's owner line with a phone and a home address counted the address digits as the phone.
- Houston's form has two lines with the same label; every fill landed on the first, so the second stayed empty.
- Los Angeles lists "the completed application" as an attachment; it was a missing document on the checklist.
- A line Odelia added by mistake couldn't be removed, so a clean copy of the application was made and the card went up
  on the copy.
- A run that ended with no words while its job was open replied "Done.".
- The probe stopped where a real owner wouldn't: documents only the owner has were never uploaded, and its answers
  said "no account number yet" to forms that need one.

**The rules.**

- A check reads the whole line's question: on a line that asks for several things, find the part it checks inside it.
- Two lines with the same label are two lines: fills take them in order, the empty one first.
- The application itself is never a document to wait for.
- "Done." is never said over open work: a run without words on an open job is sent back once, and its reply says what's open.
- A test plays the customer fully (uploads, numbers they'd have) before it calls a stop a failure.

## 2026-10: probe run 6: honest stops, a silent reply, and a timeout that failed a run

**What happened.** 33 of 45 cases passed (from 27). Most of the rest were Odelia correctly refusing to make up a
number only an agency issues; the probe's owner had never given it. Three were real: the Texas sales tax run replied
"Done." three times with nothing behind it (no job, no words); a Boston run failed on a save that hit a statement
timeout (57014) while 45 runs wrote at once; Dallas's food permit went in by its form number without the library's
id, so it had no lines.

**The rules.**

- A run never ends on no words: it's sent back once, and if it's still silent it says so plainly, never "Done.".
- A save that times out or deadlocks is tried again on the newest state; only a real error fails a run.
- A form named by its number is the library's form when exactly one form carries that number.
- A refusal to invent an identity number is correct. When a test stops there, the test's owner is missing a fact.

## 2026-10: a stylesheet edit deleted six unrelated blocks

**What happened.** To remove one CSS block I cut the file from that block's comment to the next comment I expected.
Five other blocks had been appended in between, so Home's phone list, the phone Licenses links, the Stores row styles
and the Settings spacing all went with it. A screenshot caught it before it shipped.

**The rule.** Remove a block by its own exact text, never by cutting between two markers in a file that grows by
appending. After any CSS edit, `git diff --stat` the file: a deletion count larger than the change is a red flag.

## 2026-10: probe run 7: an account number the owner typed reached Odelia as "[hidden]"

**What happened.** 39 of 45 cases passed. Two stopped because the owner's "SF business account number 1234567" and a
13-digit Florida sales tax certificate number were hidden by the bank and card filters before Odelia read them, so she
asked for numbers she had been given. Three stopped on a pick-one line whose choices didn't fit the business (a patio
line with no "no patio" box) and the form refused anything but its choices.

**The rules.**

- Hide a bank's account and routing numbers and real card numbers (Luhn), never an agency's account or certificate
  number: the owner gives those so they go on forms.
- A pick-one line where no choice fits takes its own negative choice, or "Not applicable", which ticks nothing.

## 2026-10: probe runs 8 and 9: forms that wouldn't take a right answer

**What happened.** 41 of 45 passed. Denver's equipment counts never reached the form: Odelia named the line by the
start of its long label, which matched nothing, so each fill became a new unprinted field; and counts written "2, 0, 1"
filled only the first box. San Francisco's plan check ticked "Other" over "Restaurant" whenever its "Other" line had any
answer, even "None", and refused "No" on a box that only ticks for yes.

**The rules.**

- A line named by the start of its own label is that line, when exactly one label starts that way.
- Boxes that take one number per line read a comma list as lines.
- A box ticked by a companion line ("Other: ____") ticks only when that line has a real answer.
- "No" on a yes-only box is an answer: it ticks nothing.
- "No" on a yes-only box must pass the read-back too, not just the fill: change both sides of a check together.
- A form Odelia names by its title in a city the library covers is the library's form, when one form there shares
  clearly more of its words than any other (Boston's food permit went in as a bare row, probe run 11).
- A line named with its section in front ("Section II cooking equipment counts") still finds its line.

## 2026-10: every silent run had spent its turn thinking

**What happened.** The new log line ("run ended without words") showed the send-back never fired: each silent run had
ended on max_tokens with no text, and the send-back skipped max_tokens on purpose. A workspace read also timed out
(57014) under load and failed a run, and the probe's own sign-in hit a gateway timeout.

**The rules.**

- Log the case you're guarding before you trust the guard: the first look at real data showed the guard was dead code.
- A turn with no words gets a second chance whatever its stop reason.
- Reads retry on a timeout the same way saves do; the probe retries its sign-in.

## 2026-10: Odelia now learns from her own slips (src/selfLearn.ts)

**Why.** Every probe round we found a slip by hand (a choice the line didn't have, a format the check refused, a label
that matched nothing), fixed it in code, and the next run could still make a cousin of it. The network only learned
what agencies require, from finished jobs; nothing recorded how a refusal got fixed.

**What it does now.** Every tool call is watched. A refusal (not one of the choices, an address the agency doesn't
take, a line the check before approval stops on, a tool error) is a slip; a later call in the same run that gets that
line or tool through is its fix. The pair becomes a live "fix" lesson keyed by the form or the tool, in Placetta's own
words (the form's label and choices, the checker's note, the value's shape only, quoted ids stripped), and every run
for every business starts from the fixes for its forms and its tools, "here and on any line that works the same way".
Fixes retire when businesses contradict them or they keep losing. The twelve fixes found by hand today are seeded.

**The rule.** When a probe or a customer run shows a slip, the fix goes in twice: in code when it's a bug, and as a
lesson (seeded, or learned on its own) so the agent itself knows the pattern.
- A migration that redefines a function starts from the newest definition of it (grep every migration), never from the
  first: the fix-lessons migration briefly undid the security rule that one business can't make a lesson live.
- Learning has to be reinforced, not just recorded: each fix lesson a run started from is judged at the end (its slip
  didn't recur: a win; it did: a loss), so the ones that work rank first and the ones that don't retire. And every
  form's fix is also kept as a pattern for any form ("a line refused as X was accepted as Y"), so a slip on a new form
  that works like an old one is caught the first time.

## 2026-10-30: a pattern lesson split into one copy per answer; three dots read as "still typing"

- What broke: production wrote four copies of the same "Any form" pattern, because the lesson's text carried the shape
  of the answer that worked ("Xxx", "Xx xxxxxxx"). A pattern that is meant to collect confirmations across forms can't
  contain anything that varies per form. Rule: a pattern lesson's text is built only from the reason and the kind of
  fix; test that two different answers produce the identical text (scripts/self-learn-test.ts).
- UI, panel 3: all three reviewers read the "…" menu under Odelia's finished answer as a typing indicator, and saw page
  rows through the floating message box. Rules: a control under a finished message says what it is in a word ("More"),
  never an ellipsis; the fade under the message box turns solid before the box begins; list icons sit on the page's
  one left edge, not inset by row padding.

## 2026-10-30: the probe starved production

- What broke: during the 18:40 probe, owners' own writes to filings hit statement timeouts, the minute-by-minute cron
  jobs could not start, and even a count of cron history timed out. Connections were few; the database was simply out of
  headroom while five probe cases each made an account, uploaded documents and filed at once. Cancelling the probe let
  it recover. Rules: the probe runs three cases at a time by default and waits whenever a trivial query takes over 3
  seconds (scripts/probe/run.ts, breathe()); a probe that fails on timeouts is a capacity finding, not a product one,
  so read the database's logs before changing the product.
- Why the database had no headroom (found after): pg_cron opens a new connection for every job it starts, and four
  jobs ran every minute, each leaving a row in cron.job_run_details that nothing deleted. On a small instance the
  connection setup alone is real load, and once the probe drained the disk budget, every new connection timed out
  ("job startup timeout"). Rules: one per-minute job that calls each sweep only while it has something due
  (public.minute_sweep, migration 20261108090000); cron history kept 3 days; a new every-minute job is added to
  minute_sweep, never scheduled on its own.
- The bigger cause was me: four full probes (all 45 cases) ran against production in one afternoon to verify fixes,
  each making accounts, uploading files and filing. On a small instance that spends the disk's burst budget, and once
  it is spent even an idle database crawls (a checkpoint of 26 buffers took 29 seconds; PostgREST couldn't load its
  schema cache) until the budget refills. Rule: verify a fix with `--slice` or `--only` on the cases it touches; a full
  probe runs only on its own Sunday schedule.

## 2026-10-30: copying Muse, and what not to copy

- Muse's Ideas work because every offer carries the fact behind it ("I found an email from the airline confirming your
  canceled flight on October 14"). Odelia's Ideas (src/ideas.ts) follow that rule strictly: every number is one the
  records hold, the fee count is the same one the cost line shows, and a business with no records gets no offers rather
  than invented ones (scripts/ideas-test.ts). An idea never acts: tapping it asks her, and anything filed, sent or paid
  still waits for approval.
- A total repeated right above the buttons duplicated the fee section's own Total; the fee section already ends at the
  decision, so only "Not now" was added. Check a borrowed pattern against what the screen already says before adding it.

## 2026-10-30: a tilted stamp broke the one-axis rule

- A reviewer's "tilt the stamp like a real rubber stamp" went in and fit-check failed at every width: rotated text sits
  off its column's center and overlaps the check. The founder's rule (everything in a row on one y axis, icons centered
  with their text) outranks a reviewer's wit. Rule: run fit-check before every push, and never take a suggestion that
  rotates or offsets content; find the personality in words and color instead.

## 2026-10-30 (evening): the database stayed slow for hours, and it was CPU

- After the probes stopped, the database stayed slow: the REST API answered 503 (its schema cache load timed out) and
  cron jobs failed to start. It held only 88 MB, ran no queries, and every page was in memory, yet a 9,000-row catalog
  join took 2.5 seconds instead of milliseconds. That is CPU throttling: the instance's burstable CPU was spent by the
  day's full probe runs, and it refills only while idle, which a job connecting every minute prevents.
- Rules: never run full probes back to back on production (see above); keep cron on a small instance at a few minutes,
  not every minute (migration 20261108100000); when the database is slow, measure a catalog query with every buffer a
  hit before blaming load, disk or size.

## 2026-10-31: a layout choice flip-flopped between review rounds

What broke: where a short Odelia chat sits (top of the panel, or on the message box) changed in round 14, back in
round 20, and reviewers flagged the gap again in panel 14. Each round followed whichever reviewer spoke loudest.
Why: the choice was made by vote, not by copying a product that already works.
Rule: a contested layout choice is settled once by the closest working product (here Poke and iMessage: the
conversation sits on the box), written in the CSS comment, and not reopened unless that product changes.
