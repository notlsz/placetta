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
