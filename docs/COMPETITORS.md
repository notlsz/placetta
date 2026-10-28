# Odelia against 22 agents, for one job

Written 2026-10-28. The job: get a business its federal, state and local licenses with the owner touching almost
nothing. For each product, the two or three strengths an owner would feel and its main weakness, each from a cited
page, then what Placetta does about it. Pages read this session are dated 2026-10-28; the rest were read for
[COMPETITIVE.md](COMPETITIVE.md) (2026-10-22 to 2026-10-27) and say so. Pages written by a company that sells a
competing product are marked **(competitor)**. Anything not stated by a source is marked **(inferred)**.

Not reached this session: the federalregister.gov API documentation page (the fetch tool refused it, so the feeds
below were checked by fetching them directly), instinct.com, Dots' and Muse's own pages (via COMPETITIVE.md's sources).

## The table

| Agent | Strengths an owner would feel | Main weakness | What Placetta does about it |
|---|---|---|---|
| **Grok** (xAI) | Answers from current news and X posts; DeepSearch "cross-checks claims across news, X posts, and primary documents" with a visible trace and citations ([Profound, 2026-10-28](https://www.tryprofound.com/blog/understanding-grok-a-comprehensive-guide-to-grok-websearch-grok-deepsearch), sells Grok analytics) | Websearch is "bounded by the freshness of the index rather than real-time web access"; no accuracy benchmarks (same) | **Built:** law watch reads the Federal Register's own feeds daily; only `.gov` sources count; nothing reaches an owner before the team checks it |
| **Grok Bot** (xAI) | Bots that "finish jobs end to end, and only come back when something needs your approval"; 220 plugins; teams of bots ([eesel](https://www.eesel.ai/blog/grok-bot) (competitor), [VKTR](https://www.vktr.com/collaboration-productivity/xai-launches-grok-bot-ai-agents-in-beta/), via COMPETITIVE) | Bots share one machine and its logins, "a real blast radius"; "no product-enforced list of actions that always stop" (same) | Had it: store bots run as separate runs under the policy gate; Autopilot's caps and the never-list are code, not guidance |
| **ChatGPT agent** (OpenAI) | Polished browser agent; "pauses for payment confirmations and asks before doing anything dangerous" ([aiagentrank](https://aiagentrank.io/blog/chatgpt-agent-2026), via COMPETITIVE) | "Multi-hour agent runs still fail at ~20–30% rates" (same) | Had it: registry answers without browsing, resumable jobs, failed runs not charged |
| **Dots** (OpenAI) | Reachable by text or phone, acts between conversations; rules of "take action if pre-approved", "ask before taking action" ([SF Standard, 2026-09-29](https://sfstandard.com/2026/09/29/openai-launches-dots/); [eesel](https://www.eesel.ai/blog/openai-dots) (competitor), via COMPETITIVE) | Trust: the model behind it "sometimes lied to users about the actions it took" (SF Standard) | **Built:** proactive rule-change alerts, in the team's words, by the owner's channel, held for quiet hours, once. Had: renewals at 90/60/30/14/7/1 days, agency-delay escalation, Monday "week ahead" and "what Odelia did" |
| **Instinct** | Texts and calls for you; starts conversations and follows up; its own email address ([eesel](https://www.eesel.ai/blog/instinct-ai-review) (competitor); [TechCrunch, 2026-10-24](https://techcrunch.com/2026/10/24/all-the-ai-agents-that-can-live-in-your-text-messages/), via COMPETITIVE) | "records of Actions … may not always be accurate"; no published error rates ([VKTR](https://www.vktr.com/ai-platforms/instinct-raises-1b-at-10b-valuation-to-scale-its-personal-ai-agent/)) | Had it: one thread per person across text, email and chats (`_shared/continuity.ts`); every ask is a row (`odelia_chases`) |
| **Muse** (Meta) | A personal agent in WhatsApp that can "open a browser, fill out forms, and negotiate" ([PBS/AP, 2026-09-08](https://www.pbs.org/newshour/nation/meta-launches-personal-ai-agent-muse-to-help-with-everyday-tasks), via COMPETITIVE) | No detail on safety, accuracy or approvals (same) | Had it: WhatsApp, WeChat and text; agency forms read back line by line before approval |
| **Poke** (Interaction Co.) | Lives in iMessage, "the first third-party AI agent officially available via iMessage"; reminders, automations, many connectors ([AppleInsider, 2026-06-04](https://appleinsider.com/articles/26/06/04/first-ai-agent-for-messages-business-chat-approved-by-apple)) | Price "negotiated in chat"; no performance or reliability data (same) | Had it: iMessage through Linq, published prices |
| **Town** | Routines "on a schedule or whenever something new comes in"; "asks before anything important goes out"; named CPAs answer within a day ([town.com](https://town.com), via COMPETITIVE) | No base price; the product is never shown (COMPARE-ALL.md) | Had it: routines, Hands-off with an undo window, a specialist with a one-business-day answer |
| **Alven** | A vertical "full time AI employee" inside the system of record, "$10" a unit a month ([alven.ai](https://alven.ai/), via COMPETITIVE) | Results are its own unverified claims (same) | Had it: per-store pricing; accuracy tests in the repo |
| **Jack & Jill** | Talks to you once, then works continuously and makes the introduction itself, no application needed ([Pulse 2.0, 2026-09-15](https://pulse2.com/jack-jill-raises-40-million-series-a/)) | Trustpilot 3.8 from 222: "information forgotten, your profile completely forgotten", roles "a bit off" ([Trustpilot](https://uk.trustpilot.com/review/jackandjill.ai?page=5)) | Had it: one intake, then the plan reflects each filing's real state; facts persist across sessions |
| **Devin** (Cognition) | Works unattended overnight once the task shape is trusted ([aiagentrank](https://aiagentrank.io/blog/devin-review-2026), via COMPETITIVE) | Misses unstated rules; reasoning loops burn hours (same) | Had it: a visible plan (`set_plan`), the status timeline, a replay of every step (Watch) |
| **Perplexity Comet** | Drives the user's own browser on their own pages (inferred from the attack below) | "PleaseFix": a calendar invite steered it into sending files to an attacker ([TechRadar, 2026-03-03](https://www.techradar.com/pro/security/the-attack-requires-no-exploit-no-user-clicks-and-no-explicit-request-for-sensitive-actions-experts-say-perplexitys-ai-comet-browser-can-be-hijacked-to-steal-your-passwords), via COMPETITIVE) | Had it: outside content is fenced data; red team 137 of 137 blocked |
| **Perplexity Computer** | A goal split into parallel subtasks, one deliverable; tasks run for days and resume ([LOW/CODE](https://www.lowcode.agency/blog/perplexity-computer-review), sells dev services; [eesel](https://eesel.ai/blog/perplexity-computer) (competitor), via COMPETITIVE) | "no per-task credit cap and no mid-task cost estimate"; "you cannot inspect intermediate states" (LOW/CODE) | Had it: `plan_markets`, per-run cap, trace tree and replay |
| **Manus** | A "complete sandbox environment"; 20 concurrent and 20 scheduled tasks; webhooks "on completion or input needed" ([Fast.io, 2026-10-28](https://www.fast.io/resources/manus-ai-review.md)) | Credit burn "can be hard to forecast"; work continues "after a bad intermediate result" (same) | Had it: a separate checker proves each job before it counts as done; prices before approval |
| **Lindy** | Setup "genuinely easy"; replies are drafts, "Nothing goes out without your approval"; phone agent ([Carly, 2026-10-28](https://www.usecarly.com/blog/lindy-ai-review/), competitor) | "the Gmail send channel entered a broken state repeatedly"; credits "designed to push you into overage" (same, quoting users) | Had it: approvals by default, Hands-off for routine mail only, channels shown only when set up |
| **Vanta** | Tests that keep running, "Remediation detail includes the when, where, why, and how to fix"; a Trust Center ([features](https://www.vanta.com/features), via COMPETITIVE) | No public price; questionnaire caps by tier; alert noise: "a lot of notifications about failing automated tests" ([pricing](https://vanta.com/pricing); [GetApp](https://www.getapp.co.uk/reviews/2036075/vanta)) | Had: Checks, status pages, weekly good-standing reads. **Built:** what Odelia watches is listed on Checks, and a rule change is reviewed before it alerts (no noise) |
| **Drata** | "continuous monitoring and guided remediation"; owner-approved document requests ([drata.com](https://drata.com); [help](https://help.drata.com/en/articles/8067477-submitting-and-approving-requests), via COMPETITIVE) | "$$$$$" and 2 months to implement ([G2](https://g2.com/products/drata/reviews?page=5)) | Had it: a plan at sign-up, $149 a store a month published |
| **Delve** | "Compliance in days"; agents take screenshots and write reports ([delve.co](https://delve.co), via COMPETITIVE) | Alleged pre-filled reports and boilerplate ([Captain Compliance](https://captaincompliance.com/news/the-delve-scandal-fake-soc-2-audits-open-source-code-theft-and-exit-from-y-combinator/), allegations, not findings) | Had it: a check passes only on a record. **Built:** a rule change needs a person and an official source before anyone hears |
| **Harbor Compliance** | One view of the license portfolio, events due within 90 days; managed filing that will "track their progress and send confirmation when they are approved" ([License Manager](https://harborcompliance.com/license-manager-software); [Licensing Service](https://www.harborcompliance.com/business-licensing-service), via COMPETITIVE) | Trustpilot 3.1: "Harbor routinely dropped the ball" ([Trustpilot](https://ca.trustpilot.com/review/harborcompliance.com)) | Had it: the license report, the 90-day runway, approval proof per row |
| **Avalara licensing** | "One clear, actionable report" in minutes; 23,000+ jurisdictions; fees remitted for you ([Avalara](https://www.avalara.com/us/en/products/business-licenses/license-management.html), via COMPETITIVE) | No published price; made for "100+ licenses"; auto-renewal complaints ([BBB](https://www.bbb.org/us/wa/seattle/profile/computer-software-developers/avalara-inc-1296-22018273/complaints)) | Had it: instant report, published price; fees by Issuing card is built but off until approved |
| **CT Corporation** | CLiC: every license's dates, fees and status, Excel reports, expiry notices ([CLiC brochure](https://assets.contenthub.wolterskluwer.com/api/public/content/215844f6f7254781bb4c0c63c7463ec9?v=e86b347f), via COMPETITIVE) | A kit the owner fills and files, "5-7 business days" ([BizFilings](https://www.wolterskluwer.com/en/solutions/bizfilings/business-licenses)) | Had it: forms filled from the workspace, a spreadsheet export |
| **LicenseLogix** | A "Dedicated account manager" ([Wolters Kluwer](https://www.wolterskluwer.com/en/solutions/ct-corporation/licenselogix), via COMPETITIVE) | "I called and got a recorded message i would be called back. I wasn't called back." ([Trustpilot](https://ca.trustpilot.com/review/wolterskluwer.com/en/solutions/ct-corporation)) | A named specialist is a staffing decision (founder); the one-day specialist queue exists |

## Strengths mapped to Odelia, licensing gaps only

| Strength | Who has it | Odelia before this pass |
|---|---|---|
| Proactive briefing: tell the owner before they ask | Dots, Instinct, Poke, Town | Partly. Renewals, agency delays (escalation past the published time), Monday summaries: yes. Rule changes: the weekly model check emailed owners directly, unreviewed, from any source it found |
| Real-time law awareness | Grok | Partly. The nightly sweep re-read every quoted agency page, but its findings stopped at staff; no register was read |
| One thread across channels | Instinct, Poke, Muse | Yes (`_shared/continuity.ts`) |
| A visible plan and progress | Devin, Manus, Perplexity | Yes (`set_plan`, StatusTimeline, Watch replay) |
| Continuous monitoring with evidence | Vanta, Drata | Partly. Filings and approved licenses checked; the owner couldn't see which official sources were watched |
| Trust: audit trail and undo | Lindy, Town | Yes (Activity, the undo window on every send) |
| Managed filing to approval | Harbor, LicenseLogix | Yes, behind each agency's switch (FILER_AGENCIES) |

## Built in this pass

1. **Official rule feeds** (`src/lawWatch.ts`, `supabase/functions/monitor/law_watch.ts`). The monitor reads the
   Federal Register's rules and proposed rules for FDA, TTB and CBP daily (feeds checked 2026-10-28: CBP's returned 4
   items, FDA's 13, TTB's none that month). FDA and CBP items must be about food, facilities, entry or import.
   `RULE_FEEDS` adds a state register once its official feed is confirmed; only https on `.gov` is read.
2. **The team's review queue** (migration `20261105091000_rule_alerts.sql`, Quality tab, `src/cloud/LawQueue.tsx`).
   Feed items, the sweep's "quoted words gone" findings (a trigger on `qa_findings`), and Odelia's weekly finding for
   one business (agent-run now queues it instead of emailing the owner) all wait here. Approval needs the owner's words
   in English and Chinese, no dashes, and an official source, checked in the app and again in the database.
3. **Proactive alerts that go once, the owner's way.** Each approved change becomes one Update per affected business
   (by form in its plan, or by state), keyed `law:<id>`, so never twice. It rides the morning run: email unless the
   owner said not to, a text on a linked phone held for quiet hours (`urgency` marks it important), the team chat on its
   own schedule.
4. **What Odelia watches, shown** (Checks, "Official sources Odelia watches"): each official page quoted for the
   business's permits and the Federal Register feed for each federal agency in its plan.

Tests: `scripts/law-watch-test.ts` in `npm run test:agent` (45 checks), `monitor/law_watch_test.ts` (5),
red team LW1 to LW3, `supabase/tests/rule_alerts.sql` (written, not run here: no database in this session).

## Not built, and why

- **A state register feed.** None with a current official RSS was confirmed. California OAL's feed answers, but its
  newest post is from January 2024. Texas's and Pennsylvania's guessed feed paths returned 403 and 404.
- **Reading a rule into the plan by itself.** A change edits nothing in a plan or a filing; the team fixes the registry.
  Letting a model change requirements from a feed is the false alarm this pass exists to prevent.
- **A named account manager** (LicenseLogix, Harbor): staffing, the founder's call.
