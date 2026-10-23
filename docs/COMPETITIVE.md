# Odelia against the general agents

Written 2026-10-22. Each competitor's strength and weakness comes from a cited page (reviews by third parties, some of them competing vendors, are marked as such). Odelia's side comes from this repository's own tests, not from claims. Scores are Placetta's judgment out of 10 for the job Odelia does, mapping, filing and renewing licenses for stores, not for each product's own job.

## Odelia's baseline, from the tests

| Dimension | Odelia | Evidence in the repo |
|---|---:|---|
| Finishing the job alone | 7.5 | Maps, fills the agency's own PDFs, puts complete filings up for one-tap approval, then the team or a portal route files them; store bots split a 20-store request (12 a call, 48 a run). Approval is required by design. Since the second lifecycle pass: the portal worker heals drifted selectors, waits out a down portal, runs up to 4 filings side by side, and books inspections on 11 agency sites. No live-model eval has run yet (docs/EVAL.md). |
| Accuracy with cited sources | 8 | test:accuracy 100% recall and precision on the gold and held-out sets; every plan row carries its agency page and the date it was read; fees agencies don't publish are left open. Weak spot found: Santa Clara County's health permit was proven by a line on San José's business tax page (fixed in the 9.5 pass). |
| Cost transparency | 9 | Every license priced before approval ($299, $999, $99 renewal), cost to open with agency fees, a per-run token cap, and from this pass a failed run isn't charged. No per-run estimate is shown (runs cost about a cent median at the prices re-read 2026-10-22, docs/eval-speed.json and docs/UNIT-ECONOMICS.md). |
| Speed | 7 | Modeled on 60 fixtures: 2.8 s median to done, 23.7 s p95. A 4-market entry is one call (plan_markets) instead of four. No live latency measured. |
| Memory | 8 | Owner-approved memory, recalled across sessions (journeys test), pinned facts from the records survive 200 turns, "don't remember this chat". |
| Live visibility | 8 | Streaming over Realtime with polling fallback, a trace tree per run, the replay of every tool call. |
| Integrations and MCP | 7 | Connected apps over MCP (client), Placetta's own read-only MCP server (compliance status, deadlines, readiness, plan, filings), Gmail, Outlook, Drive, QuickBooks, Square, Toast, WeChat. Fewer connectors than Claude's or Grok's catalogs. |
| Trust and security | 8 | test:redteam 58 of 58 attacks blocked; documents with instructions aimed at an AI quarantined; a policy gate on every tool call; nothing filed, paid or sent without approval; SOC 2 evidence tooling (docs/soc2) but no audit report yet. |
| Domain depth | 9 | 325 US forms and 156 abroad (docs/FILING_COVERAGE.md), 37 markets each on its own jurisdiction's form (docs/MARKET_COVERAGE.md), EN and ZH. |
| **Overall** | **7.9** | Unchanged at one decimal by the second lifecycle pass (7.94 with finishing at 7.5): the dimensions below 9 wait on a live run, an audit and connectors, not on code (see "What 9.5 needs" at the end). |
| **After the 9.5 pass** | **8.4** | 7.5, 8.5, 9, 7.5, 8.5, 8.5, 8.5, 8.5, 9 in the order above (8.39): see "The 9.5 pass" at the end. |

## The scorecard

Each cell is the competitor's score, then Odelia's, for Odelia's job.

| Competitor | Finish alone | Cited accuracy | Cost transparency | Speed | Memory | Live visibility | Integrations/MCP | Trust and security | Domain depth | Overall (them / Odelia) |
|---|---|---|---|---|---|---|---|---|---|---|
| Perplexity Computer | 6 / 7.5 | 6 / 8.5 | 3 / 9 | 7 / 7.5 | 5 / 8.5 | 3 / 8.5 | 6 / 8.5 | 5 / 8.5 | 3 / 9 | 4.9 / 8.4 |
| Devin | 5 / 7.5 | 4 / 8.5 | 5 / 9 | 5 / 7.5 | 6 / 8.5 | 7 / 8.5 | 6 / 8.5 | 6 / 8.5 | 1 / 9 | 5.0 / 8.4 |
| Alven | 6 / 7.5 | 4 / 8.5 | 7 / 9 | 6 / 7.5 | 7 / 8.5 | 5 / 8.5 | 6 / 8.5 | 7 / 8.5 | 2 / 9 | 5.6 / 8.4 |
| ChatGPT agent | 5 / 7.5 | 6 / 8.5 | 5 / 9 | 5 / 7.5 | 6 / 8.5 | 7 / 8.5 | 7 / 8.5 | 6 / 8.5 | 3 / 9 | 5.6 / 8.4 |
| OpenAI Dots | 6 / 7.5 | 5 / 8.5 | 4 / 9 | 6 / 7.5 | 7 / 8.5 | 4 / 8.5 | 8 / 8.5 | 4 / 8.5 | 2 / 9 | 5.1 / 8.4 |
| Grok Bot | 6 / 7.5 | 4 / 8.5 | 3 / 9 | 6 / 7.5 | 5 / 8.5 | 6 / 8.5 | 8 / 8.5 | 4 / 8.5 | 2 / 9 | 4.9 / 8.4 |
| Meta Muse | 5 / 7.5 | 4 / 8.5 | 4 / 9 | 6 / 7.5 | 6 / 8.5 | 4 / 8.5 | 5 / 8.5 | 4 / 8.5 | 1 / 9 | 4.3 / 8.4 |
| Instinct | 6 / 7.5 | 4 / 8.5 | 4 / 9 | 6 / 7.5 | 6 / 8.5 | 4 / 8.5 | 6 / 8.5 | 6 / 8.5 | 1 / 9 | 4.8 / 8.4 |
| Claude apps (projects, memory, connectors) | 4 / 7.5 | 7 / 8.5 | 6 / 9 | 8 / 7.5 | 7 / 8.5 | 6 / 8.5 | 9 / 8.5 | 8 / 8.5 | 4 / 9 | 6.6 / 8.4 |
| Claude Code and the Agent SDK | 6 / 7.5 | 6 / 8.5 | 6 / 9 | 7 / 7.5 | 6 / 8.5 | 8 / 8.5 | 9 / 8.5 | 8 / 8.5 | 2 / 9 | 6.4 / 8.4 |
| Claude for Legal | 4 / 7.5 | 6 / 8.5 | 6 / 9 | 7 / 7.5 | 7 / 8.5 | 6 / 8.5 | 8 / 8.5 | 8 / 8.5 | 5 / 9 | 6.3 / 8.4 |
| Harvey | 5 / 7.5 | 7 / 8.5 | 2 / 9 | 6 / 7.5 | 7 / 8.5 | 6 / 8.5 | 7 / 8.5 | 9 / 8.5 | 5 / 9 | 6.0 / 8.4 |
| Legora | 5 / 7.5 | 7 / 8.5 | 3 / 9 | 6 / 7.5 | 6 / 8.5 | 6 / 8.5 | 8 / 8.5 | 8 / 8.5 | 5 / 9 | 6.0 / 8.4 |

Odelia's column is after the 9.5 pass (2026-10-22, the section at the end); her baseline column was 7.5, 8, 9, 7, 8, 8, 7, 8, 9 and 7.9 overall. She leads overall against every one. She is still behind Claude apps and Claude Code on integrations (9 against 8.5) and Claude apps on speed (8 against 7.5), and Harvey on trust (9 against 8.5).

## Competitor by competitor

### Perplexity Computer
- **Strongest:** a goal becomes parallel subtasks and one deliverable; in one test it "orchestrated five parallel Claude Sonnet sub-agents" ([LOW/CODE Agency review, updated 2026-09-25](https://www.lowcode.agency/blog/perplexity-computer-review); the reviewer sells development services).
- **Biggest weakness:** cost and opacity: "There is no per-task credit cap and no mid-task cost estimate", failed tasks can drain credits, "you cannot inspect intermediate states", and "Tasks requiring precise numerical accuracy or complex conditional logic produce uneven results" (same review).
- **Odelia copies:** plan_markets (this pass): every market planned side by side in one call, one packet with shared steps filed once, the company formed once and registered as a foreign company in each other state.
- **Odelia beats it:** a per-run token cap, every license priced before approval, failed runs not charged (this pass), the trace tree and replay, and fees taken only from the registry, never estimated.

### Devin (Cognition)
- **Strongest:** unattended work: "Once you trust the task shape, Devin works overnight on your real repo" ([aiagentrank.io, 2026-05-21](https://aiagentrank.io/blog/devin-review-2026)).
- **Biggest weakness:** "If your codebase has unstated rules, Devin doesn't pick those up reliably", and reasoning loops that burn hours (same review).
- **Odelia copies:** the hand-off note and fresh seat for long jobs (already in src/serverRun.ts) and the finish loop that resumes jobs.
- **Odelia beats it:** the unstated rules of a jurisdiction are written down in the registry with a quote and a read date, and a separate checker proves each job against the workspace before it counts as done.

### Alven
- **Strongest:** a vertical "full time AI employee" inside the customer's system of record (added as a user in AppFolio), priced per unit ("$10" a unit a month), that "learns and improves on each note" ([alven.ai](https://alven.ai/), its own marketing page, results unverified).
- **Biggest weakness:** no stated limits or error handling, and its results are unverified claims (same page).
- **Odelia copies:** per-unit pricing is already the store plan ($149 a store); learning from each correction is the network lessons (src/learning.ts).
- **Odelia beats it:** published accuracy tests, every value with its source quote, and approval cards that show exactly what will happen.

### ChatGPT agent (OpenAI)
- **Strongest:** the most polished consumer browser agent; it "pauses for payment confirmations and asks before doing anything dangerous" ([aiagentrank.io, 2026-05-21](https://aiagentrank.io/blog/chatgpt-agent-2026)).
- **Biggest weakness:** "Multi-hour agent runs still fail at ~20–30% rates" and Deep Research runs take "10–30 minute runs per query" (same review).
- **Odelia copies:** confirmation before anything consequential (already: every filing, payment and message).
- **Odelia beats it:** most answers come from the registry in seconds with no browsing; a failed run isn't charged; jobs resume after a crash (MAX_RESUMES) instead of starting over.

### OpenAI Dots
- **Strongest:** an always-reachable personal agent by text or phone that takes actions such as rescheduling and booking, on GPT-6 Astra, for ChatGPT Business and Pro ([SF Standard, 2026-09-29](https://sfstandard.com/2026/09/29/openai-launches-dots/)).
- **Biggest weakness:** trust: OpenAI cancelled GPT-6.1 Astra because in tests it "sometimes lied to users about the actions it took, pushed forward on tasks without permission", and "the same technology" powers agents like Dots (same article).
- **Odelia copies:** reachable by text, call, WeChat, Slack and email (already).
- **Odelia beats it:** Odelia can't claim a filing it didn't make: the checker verifies the done list against the workspace and the agency's proof line, and nothing goes out without the owner's tap.

### Grok Bot (xAI)
- **Strongest:** teams of bots that sign in to company software from a cloud machine, 220 plugins, approval before consequential actions ([VKTR, 2026-08-12](https://www.vktr.com/collaboration-productivity/xai-launches-grok-bot-ai-agents-in-beta/)).
- **Biggest weakness:** every bot on an account shares one machine, its logins and files, "a real blast radius", and no published price (same article).
- **Odelia copies:** store bots side by side (split_job) already.
- **Odelia beats it:** each store bot runs as its own run under the policy gate with the requesting person's role, and the filer runs isolated with least privilege (migration 20261022120000_filer_least_privilege).

### Meta Muse
- **Strongest:** reach: a personal agent in WhatsApp and its own app that can "open a browser, fill out forms, and negotiate" on a user's behalf, from a dedicated VM ([PBS NewsHour/AP, 2026-09-08](https://www.pbs.org/newshour/nation/meta-launches-personal-ai-agent-muse-to-help-with-everyday-tasks)).
- **Biggest weakness:** no detail on how its safety and privacy features work, and nothing on accuracy or approvals (same article).
- **Odelia copies:** chat-app distribution: Odelia already answers on WeChat, WhatsApp and text for Chinese owners.
- **Odelia beats it:** agency-grade forms with line-by-line read-back, and the approval card.

### Instinct
- **Strongest:** a personal agent reached by text or call that makes phone calls for the user, with hallucination detection before an action; $1B raised at a $10B valuation ([VKTR, 2026-09-28](https://www.vktr.com/ai-platforms/instinct-raises-1b-at-10b-valuation-to-scale-its-personal-ai-agent/)).
- **Biggest weakness:** "The company did not publish benchmarks or error rates", and it is still in early access (same article).
- **Odelia copies:** voice and phone (odelia-voice, already) and the pre-action check (the policy gate).
- **Odelia beats it:** its error rates are in the repo (test:accuracy, test:redteam, docs/EVAL.md) and it is available today in a workspace.

### Anthropic: Claude apps with projects, memory and connectors
- **Strongest:** connectors over MCP across every Claude product, prebuilt integrations and a directory of verified and community servers ([claude.com connectors overview](https://claude.com/docs/connectors/overview)).
- **Biggest weakness for this job:** it is a general assistant: no registry of agency forms with dated quotes, no filings, no renewal calendar or system of record for licenses.
- **Odelia copies:** MCP on both sides (already): Odelia uses connected apps, and Placetta's MCP server puts store status inside Claude.
- **Odelia beats it:** see the replace question below.

### Anthropic: Claude Code and the Agent SDK
- **Strongest:** the agent loop, tools, MCP, subagents and permissions as a kit a team can build on (Anthropic's documentation; the SDK page couldn't be fetched in this pass).
- **Biggest weakness for this job:** a kit, not the product: whoever builds on it must build the registry, the forms, the filing routes and the approvals.
- **Odelia copies:** the plan, act, check loop and subagents (store bots) already mirror it.
- **Odelia beats it:** the domain data and the filing routes are the product; the loop is the commodity.

### Anthropic: Claude for Legal
- **Strongest:** connectors to legal tools (Docusign, Thomson Reuters CoCounsel, Microsoft 365) and plugins for 12 practice areas, launched May 2026 ([LegalOn, a competing vendor](https://www.legalontech.com/post/claude-for-legal)).
- **Biggest weakness:** "There is no centralized view of all matters, no status tracking, and no workflow analytics", and without a research connector "citations will be marked [verify]" (same article).
- **Odelia copies:** practice-area plugins are Odelia's playbooks (skills) for permits.
- **Odelia beats it:** the system of record (every license, renewal, store and document with status), and citations that are verified and dated by default.

### Harvey
- **Strongest:** BigLaw distribution and enterprise security: "more than 200,000 lawyers across 2,400+ organizations", "more than 25,000 custom agents", Vault ([Bind, a competing vendor, modified 2026-09-29](https://www.bindlegal.com/resources/comparisons/harvey-pricing-2026/)).
- **Biggest weakness:** "Harvey does not publish pricing", with services and fine-tuning extra, and it runs on others' models: Harvey and Legora "share the same structural vulnerability" ([Implicator, 2026-02-18](https://www.implicator.ai/legora-and-the-260x-question/)).
- **Odelia copies:** enterprise access (SSO, SCIM, roles, audit export) is already shipped.
- **Odelia beats it:** public prices, charged per license after approval.

### Legora
- **Strongest:** the Word sidebar meets lawyers in their tools, "the sharpest differentiator in practical terms", and firm-wide rollouts (Linklaters across 30 offices, White & Case 2,500 seats) (Implicator, above).
- **Biggest weakness:** "The 'last mile' of legal-specific customization is real. Real, but thin", and Anthropic, its supplier, now sells legal tools directly (same article).
- **Odelia copies:** meeting owners where they work: WeChat, text, and Placetta inside Claude or ChatGPT through the MCP server.
- **Odelia beats it:** the layer isn't thin: the registry, the box maps of agency PDFs, the filing routes and the outcomes of filings are data a lab doesn't have.

## Could a team on plain Claude or ChatGPT with connectors replace Odelia?

| Job | Plain Claude or ChatGPT with connectors | Gap for Placetta? |
|---|---|---|
| Answer "which licenses does a milk tea shop in Irvine need?" | Yes, roughly, with web search; without a verified, dated source per row and without failing closed | **Yes: partly replaceable.** Odelia's edge is the dated quote and the abstention, which a casual user may not value |
| Draft a landlord letter, summarize a lease, read email and Drive | Yes, well | **Yes: replaceable.** Not where Placetta should compete |
| Fill the agency's own PDF line by line and read it back | No: no box maps of the forms | No |
| File: route to the agency by portal, email, fax or the team, with the owner's approval and a receipt | No | No |
| Keep the renewal calendar from each agency's approval date and file renewals | Only with a hand-built tracker | No |
| Plan four markets at once, the company formed once, foreign registrations, fees by currency | Partly, by hand, with the numbers to check | No (plan_markets) |
| Know how long each agency really takes and what it rejects | No | No: filing_stats and the network lessons |
| A 20-store franchise's renewal season in one request | No | No (store bots, 12 a call, 48 a run) |

Where the answer is yes (research answers and general documents), Placetta should not try to out-chat the labs: it should be in their apps (the MCP server) and win on the work after the answer.

## Moats, and where each stands

| Moat | Status in the repo | What's missing |
|---|---|---|
| A proprietary, verified rules graph that improves with every filing | Built in part: the registry (481 forms) with dated quotes, filing_stats (measured agency times, rejection rates, from 3 filings a form), network lessons distilled from filing outcomes | Corrections from completed filings don't flow back into the registry yet (a fee that differed, a requirement an agency added): the team updates it by hand |
| Doing and owning the filing | Built: approval cards, box-mapped PDFs, portal playbooks, email and fax routes, the team's queue, receipts | Real filings to prove it at volume |
| System of record for licenses, renewals, entities and documents | Built: stores, applications, renewals from approval dates, entities, the document vault, audit trail | Imports from existing compliance spreadsheets at chain scale |
| Bilingual distribution through franchise headquarters | Built: the brand plan for headquarters, invites, every screen in EN and ZH | Signed headquarters |

## What this pass built from the scorecard

1. plan_markets (Perplexity's strength): one call, about 2,600 tokens instead of four searches at about 13,200 for a 4-city entry.
2. No charge for a failed run (Perplexity's and ChatGPT agent's weakness).
3. A whole plan's forms list their line count, not every label: p95 cost a run $0.0130 to $0.0117 on the fixtures.
4. Twenty stores in one request (12 a call, 48 a run).
5. A document whose instructions were hidden is still read, with the hidden sentence quoted in full to the owner; visible instructions still keep it from any model.

Skipped, by the rule "only if it improves our agent": routing simple rounds to a cheaper model (the cache is per model, so it costs more, measured), and a cost estimate before each run (runs cost about a cent; the price that matters, the license's, is already shown before approval).

## Lifecycle: tracking, corrections, appeals and inspections (added 2026-10-22)

What happens after a filing goes in: knowing where it stands, answering the agency, contesting a no, and getting the
inspector out. Scores are out of 10 for that job, Placetta's judgment from the cited pages (competitors) and this
repository's tests (Odelia). "Before" is Odelia before this pass. Where a competitor's public pages don't describe
something, it scores 1.

| | Tracking | Corrections | Appeals | Inspections | Overall |
|---|---:|---:|---:|---:|---:|
| **Odelia, before** | 4 | 6 | 1 | 3 | 3.5 |
| **Odelia, after** | 8 | 8 | 7 | 7 | 7.5 |
| **Odelia, second pass (2026-10-22)** | 8.5 | 8 | 8.5 | 8 | 8.3 |
| CompuLaw and Clio court-rules calendaring (deadline engines) | 1 | 1 | 5 | 1 | 2.0 |
| Harbor Compliance | 6 | 5 | 1 | 1 | 3.3 |
| LicenseLogix (CT Corporation since 2021) | 5 | 6 | 1 | 1 | 3.3 |
| Wolters Kluwer CT Corporation | 5 | 6 | 1 | 1 | 3.3 |
| Avalara License Management | 6 | 4 | 1 | 1 | 3.0 |
| Permit expediters | 6 | 8 | 4 | 4 | 5.5 |
| Harvey and Legora | 1 | 3 | 7 | 1 | 3.0 |
| Perplexity Computer and ChatGPT agent | 3 | 3 | 4 | 3 | 3.3 |

Odelia before: the weekly background check looked statuses up with the model, the agency's questions became a drafted
answer (agencyAsks), there was no appeals workflow (grep "appeal" found only the legal pages), and inspection_guide
gave prep only. After, each score rests on tests:
- **Tracking 8:** daily checks for every filing with an agency and anything hot (`supabase/functions/monitor/status_checks_test.ts`), free where the city publishes it, a timeline per filing with source, time and confidence, SLA escalation. Not 10: only three cities' building permits are read in code; the rest are Odelia's checks.
- **Corrections 8:** a denial now carries its deadline and both ways forward (`supabase/functions/monitor/appeals_test.ts`, `scripts/agent-test.ts` "Appeals").
- **Appeals 7:** 14 playbooks; 6 deadline rules confirmed on an official page, 3 counted from statute text read on unofficial copies (UNVERIFIED), 5 read from the decision letter (UNVERIFIED). Computed in the deciding body's time zone and calendared at once; never filed by Placetta. Not higher: the UNVERIFIED ones, and counsel handoff is a team task until partner attorneys are signed.
- **Inspections 7:** booking methods for 38 opening inspections in 14 places, portal booking through the worker on four agency sites (LADBS, LAFD, FDNY Business, SJPermits) with the owner's approval of the slot, results tracked, a mock inspection. Not higher: PermitSF and the Texas and Arizona portals are booked by the team until their start pages are confirmed.

### Competitor by competitor

**Harbor Compliance.** Strength copied: every license's status and renewals in one view, with advance reminders: "Track status and renewals of firm and individual licenses", "Custom reminders provide advance notice of deadlines" ([License Manager](https://www.harborcompliance.com/license-manager-software)); Odelia's timeline and "last checked" give that view per filing. Weakness beaten: reviews summarized by Discern, a competitor, cite "complaints about cancellations, renewals, and missed filings" and "Harbor repeatedly failed to complete work they had paid for" ([Discern](https://www.discern.com/resources/harbor-compliance-reviews)). Odelia checks every open filing daily, escalates when nothing moves past the agency's published time, and a job isn't done until the agency's confirmation is on file. Appeals and inspections aren't described. Odelia before / after: 3.5 / 7.5, against 3.3.

**LicenseLogix (part of CT Corporation).** Strength copied: "research, filing and ongoing compliance management" as one service ([Wolters Kluwer, 2021-10-29](https://www.wolterskluwer.com/en/news/wolters-kluwer-acquires-licenselogix)); Odelia now runs the whole lifecycle, from the plan through the appeal and the inspection. Weakness beaten: the public pages show no per-filing status the business can see and nothing after a denial; Odelia's owner sees every event and its source. 3.5 / 7.5, against 3.3.

**Wolters Kluwer CT Corporation.** Strength copied: experts "support your business throughout its life cycle" ([CT Corporation](https://wolterskluwer.com/en/solutions/ct-corporation/faqs/business-license-compliance-software-by-ct-corporation)); Odelia hands the human steps (a phone booking, a stalled agency, counsel) to Placetta's team as tasks with the script and the deadline. Weakness beaten: its license pages describe no status tracking, appeals or inspections. 3.5 / 7.5, against 3.3.

**Avalara License Management.** Strength copied: "Track filings, renewals, and more with an interactive dashboard" and "Receive alerts for upcoming renewals" ([Avalara](https://www.avalara.com/us/en/products/business-licenses/license-management.html)); Odelia's alerts fire only on a real change. Weakness beaten: appeals and inspections aren't described, and it tracks licenses held rather than the agency's decision on a pending one. 3.5 / 7.5, against 3.0.

**Permit expediters.** Strength copied: the expediter is the "strategic liaison" who keeps "tracking its progress and resolving any issues that arise during the plan review" ([PermitPlace](https://permitplace.com/permit-expediter-cost-california/), an expediter); Odelia's escalation drafts that follow-up and the team makes the call. Weakness beaten: cost, "$500 to over $15,000", commercial work "3-8% of total project costs" (same page); Odelia's daily checks cost about $0.54 a store-month (docs/UNIT-ECONOMICS.md). Expediters still lead on corrections in complex plan review. 3.5 / 7.5, against 5.5.

**Harvey and Legora.** Strength copied: cited drafts, and deadline discipline: every rule in the appeal outline cites its source by number for the owner to check, and the deadline is computed by rule from the trigger date, as Clio's court-rules calendaring does ([Clio](https://www.clio.com/blog/track-court-deadlines-court-rules/)). Weakness beaten: they draft for lawyers, without the agencies' appeal bodies, forms, fees and deadlines city by city; Odelia's playbooks hold those, and route to counsel where the appeal body itself advises it. 3.5 / 7.5, against 3.0.

**Perplexity Computer and ChatGPT agent.** Strength copied: live web lookup; Odelia's model check does the same for a filing with no lookup in code, one filing at a time and only when due. Weakness beaten: nothing watches between requests, and a deadline they state has no rule behind it. DoNotPay's "robot lawyer" claims ended in an FTC order ([FTC](https://www.ftc.gov/node/87474)); Odelia never files an appeal, never predicts the outcome, gives no legal opinion, and says Placetta isn't a law firm. 3.5 / 7.5, against 3.3.

### Patterns copied, by feature

| Feature | Copied from | Public page |
|---|---|---|
| Status timeline, newest first, with source and time | UPS and FedEx tracking, Amazon and Shopify order timelines | [Shopify order details](https://help.shopify.com/manual/orders/manage-orders/managing-orders) |
| Daily checks instead of point-in-time ones | Vanta's "automated, hourly tests" | [Vanta](https://www.vanta.com/products/automated-compliance?r_done=1) |
| Change detection by hash; alerts only on a real change | Visualping and Distill.io: "Alerts are change-triggered, not presence-triggered" | [Distill.io](https://distill.io/docs/web-monitor/using-conditions-to-get-alert-on-important-changes/), [Visualping](https://visualping.io/blog/alert-on-error) |
| SLA badge: on track, at risk, past due | Zendesk and Linear SLAs | [Linear](https://linear.app/changelog/2023-03-16-slas), [Zendesk](https://support.zendesk.com/hc/en-us/articles/4408885881498-Troubleshooting-common-SLA-issues) |
| Deadline counted from the decision and calendared at once | Clio Court Rules and CompuLaw | [Clio](https://www.clio.com/blog/track-court-deadlines-court-rules/) |
| Cited appeal drafts | Harvey and Legora | [Harvey](https://help.harvey.ai/en/articles/10580373-getting-started-with-harvey) |
| Offer times, pick one, confirm | Calendly and OpenTable | [Calendly](https://calendly.com/help/how-to-book-meetings-in-real-time) |
| Notify only on change | Stripe and GitHub notifications | [GitHub](https://docs.github.com/en/enterprise/2.17/user/github/receiving-notifications-about-activity-on-github/about-notifications) |

### Jack & Jill (AI recruiting agent), where it helps a licensing agent

From the founder's notes on a jobright.ai review (a competitor's article) and Trustpilot reviews.
- **Their tracker gap is our edge.** Their users are re-shown jobs they applied to or were rejected from. Odelia now reads each filing's agency decision, marks forms already in the workspace or declined by the owner, won't prepare an approved permit again (a renewal says so), and remembers "we don't serve alcohol" or "no outdoor seating" so those licenses stay gone across sessions (`scripts/agent-test.ts`, "The plan reflects each filing's real state").
- **Stale or irrelevant recommendations.** Already guarded: a form is claimed only with a current quote from its page (the sweeper's threshold), places come from the address, and alcohol or outdoor seating appear only when the business says so. test:accuracy: 100% precision, every row sourced. The new journey test adds a Flushing plan holding only New York's forms.
- **Mock interview, as a mock inspection.** Built: `inspection_booking` mock walks the inspector's own checklist one item at a time, with photos, and each gap becomes a fix.
- **Document-first onboarding.** Not built, because it exists: "Upload my lease" is a starter in the composer and the agent panel, and an upload is read into facts the plan fills from.
- **"Forgets context."** Impossible by design, now tested: a job's plan, its handoff notes and the facts are in front of Odelia in a later session without the old conversation (`scripts/agent-test.ts`, "Context persists across sessions").
- **Pay on hire.** Jack & Jill charges employers 10% only on a hire, with a 3-month refund. Placetta's equivalent would be charging a license only once the agency issues it. Not built: pricing is the founder's decision.

## Second lifecycle pass (2026-10-22): every point lost to the best competitor

| Dimension | Best competitor, and the points Odelia lost | Closed in code | Still open |
|---|---|---|---|
| Tracking (8 to 8.5) | Harbor and Avalara (6) lead on nothing; the point lost was Odelia's own: checks needed a model key, and only 3 cities were read in code | Deterministic checks run without any key; 8 new open-data feeds (below) | Most agencies still publish no feed: those checks are the model's. No live pilot has measured the feeds on real filings |
| Corrections (8) | Permit expediters (8) on complex plan review | California plan check: §114380's 20-working-day deemed approval and the rule that a resubmission is reviewed only on the first deficiencies | A person on the phone with a plan checker: the team, as before |
| Appeals (7 to 8.5) | Harvey and Legora (7) on drafting; CompuLaw and Clio on deadline engines | 20 of 23 deadline rules confirmed on official sources with section, trigger and day type; weekend and verified-holiday roll, months, 4:30 cutoffs, a mailing extension only where a rule provides one, time zones; per-claim citations; one counsel packet; 9 new playbooks | 3 rules behind bot checks (below); no attorney has reviewed the playbooks; counsel handoff is a team task until partner attorneys are signed |
| Inspections (7 to 8) | Expediters (4) | Online booking on 11 agency sites (was 4), PermitSF confirmed, AB+C playbook | Every new site's first booking is supervised (unverified until then); Houston and San Antonio stay with the team |

### Appeal deadlines, verified on 2026-10-22

| Playbook | Deadline | Trigger | Days | Section | Status |
|---|---|---|---|---|---|
| CA ABC denial hearing | from the letter | service of the notice of denial | calendar | B&P §§24011, 24012, Gov. §11506 | UNVERIFIED: leginfo.legislature.ca.gov bot check ([24011](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=24011), [24012](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=24012), [11506](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=11506)) |
| CA ABC Appeals Board | 40 (10 if effective immediately) | date of the Department's decision | calendar | B&P §23081 (Board FAQ) | verified |
| TX TABC hearing request | 30 | date on the notice of the denial recommendation | calendar | 16 TAC §33.60(b) (TABC's rules PDF) | verified |
| TX TABC rehearing (new) | 25 | the order is signed | calendar, rolls (Gov't §311.014) | Gov't §§2001.145(a), 2001.146(a) | verified |
| TX TABC court appeal | 30 | order final and appealable | calendar, rolls | AL §11.67(b)(1); §11.43(i) Travis County for permits | verified |
| NY SLA | 4 months | determination final and binding | months, rolls (GCL §§25-a, 30) | CPLR §217(1); ABC Law §121 | verified |
| SF Board of Appeals: building | 15 | day after effective | calendar, by 4:30 p.m. | Board's filing page | verified |
| SF: variance | 10 | day after effective | calendar | Board's filing page | verified |
| SF: ZA determination | 15 (was 30: the page now lists Letters of Determination at 15) | day after effective | calendar | Board's filing page | verified |
| SF: ZA Notice of Violation (new) | 30 | issued | calendar | Board's filing page | verified |
| SF: other permits (new) | 10 at the earliest (10 or 15) | issued | calendar | Board's filing page | verified as a floor |
| LA Planning | 10 at the earliest (10 to 15 by entitlement) | Letter of Determination issued | calendar, 4:30 p.m., weekend roll | LAMC ch. 1A art. 13B, as City Planning states it | verified as a floor |
| LA Building and Safety Commissioners | from the letter | LADBS determination | calendar | LAMC §98.0403.2 | UNVERIFIED: [codelibrary.amlegal.com](https://codelibrary.amlegal.com/codes/los_angeles/latest/lamc/0-0-0-1) bot check; fees verified (P/BC 2026-149) |
| LA business tax: Assessment Review (new) | 45 | service of the assessment | calendar | LAMC §21.16 (Office of Finance) | verified |
| LA business tax: Board of Review (new) | 45 | service of the ARO decision | calendar | LAMC §21.16 (Office of Finance) | verified |
| NYC BSA | 30 | date of the determination | calendar | 2 RCNY §1-06.3(a)(1) | verified |
| NYC DCWP denial (new) | 4 months | final and binding | months, rolls | CPLR §217(1) | verified |
| CA health suspension or revocation | 15 | receipt of the notice | calendar | H&S §114405(b) | verified (Orange County's published code) |
| CA health immediate closure (new) | 15 | service of the notice | calendar | H&S §114409(c) | verified (same) |
| CA health plan check (new) | no appeal clock | resubmit any time | working days for the agency | H&S §114380(e), (f) | verified (same) |
| NYC Health summons (OATH) | hearing date on the summons | the summons | calendar | Health and OATH pages | verified |
| Dallas Board of Appeals (new) | 15 | Notice of Disapproval | calendar, weekend roll, $714 | Dallas City Code ch. 52 §208.1 | verified |
| Business license denial | by city: SF 10 to 15, LA 45, NYC 4 months, Dallas 15 (the routes above); San José and Houston from the letter | | | | UNVERIFIED for San José ([Municode](https://library.municode.com/ca/san_jose/codes/code_of_ordinances?nodeId=TIT4REFI_CH4.76BUTA), [city page](https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration)) and Houston ([Municode](https://library.municode.com/tx/houston/codes/code_of_ordinances)): bot checks |

Copied, and from whom: rule-by-trigger deadlines with the counting shown (CompuLaw, Clio); two dates, the rule's last day and a target that never moves later (Placetta's own rule, kept from the first pass); each claim cited to its own numbered source (Harvey, Legora); one intake packet for the attorney with the evidence on file and missing (Clio). Not copied: CCP §1013's five mailing days, because no rule here was confirmed to take it; the mechanism is in place and tested for a rule that does.

### Status feeds and booking sites added

Open data, each queried live by a real record's number: Chicago building permits and business licenses, Austin permits, Seattle permits, Boston approved permits, Philadelphia permits and business licenses, NYC DCWP license applications. Not used: Dallas (no status column, ends 2018), Denver (residential construction only), NYC DOHMH (inspections, not permit status).

Inspection booking on the agency's own site with the owner's existing login: San Francisco (PermitSF; numeric permits by phone), Austin (AB+C, with a playbook), Dallas, Fort Worth and San Diego (Accela), Irvine, Phoenix (the web inspection key held like a login), alongside LADBS, LAFD, FDNY and SJPermits.

## The filing robot against browser and computer-use agents

Scores out of 10 for filing on agency portals, Placetta's judgment from the cited pages. Odelia's filer: before and after this pass.

| Agent | Strongest (copy it) | Biggest weakness (beat it) | Them | Odelia's filer before / after |
|---|---|---|---|---|
| Perplexity Comet | Acts across the user's own open tabs | Hidden page text ran as instructions; Brave exfiltrated a one-time password, and "We also cannot guarantee that Comet has completely fixed all possible prompt injection attacks" ([The Register](https://www.theregister.com/2025/08/20/perplexity_comet_browser_prompt_injection/)) | 4.6 | 7.7 / 8.4 |
| Claude in Chrome | Site-level permissions and "Claude asks users before taking high-risk actions like publishing, purchasing" ([Anthropic](https://claude.com/resources/articles/claude-for-chrome)) | Attack success 23.6%, 11.2% with mitigations; a Chrome extension on paid plans (same page) | 5.9 | 7.7 / 8.4 |
| Claude computer use | Any desktop app, not just a browser | "Each Computer Use action captures a screenshot, which consumes tokens" ([BestHub, secondary](https://www.besthub.dev/articles/anthropic-makes-four-agent-tools-ga-computer-use-browser-tool-skills-api-and-files-api-83a383f330bf)) | 5.4 | 7.7 / 8.4 |
| Claude Code with Playwright MCP | The accessibility tree, "no vision models required", a ref per element ([Playwright](https://playwright.dev/mcp/introduction)) | A developer's tool: no owner takeover or approval flow of its own | 5.7 | 7.7 / 8.4 |
| ChatGPT agent (now ChatGPT Work) | Takeover of the virtual browser with "screenshots are not captured" while the person types; confirmations for high-impact actions ([OpenAI](https://help.openai.com/en/articles/11752874-chatgpt-agent)) | 40 or 400 runs a month, concurrency limits, and "may need to re-establish the run" after a takeover (same page) | 5.7 | 7.7 / 8.4 |
| Browser Use, Browserbase and Stagehand | DOM first, screenshots "only when visual context is actually necessary" ([Browser Use](https://browser-use.com/posts/speed-matters)); cached actions replayed "with no further LLM calls" and an opt-in self-heal ([Stagehand](https://docs.stagehand.dev/v2/best-practices/caching)) | A kit: confirm-before-submit, payment hand-off and injection rules are the builder's job | 7.1 | 7.7 / 8.4 |
| Google Project Mariner | Cloud VMs, "up to 10 tasks simultaneously" ([TechCrunch](https://techcrunch.com/2025/05/20/google-rolls-out-project-mariner-its-web-browsing-ai-agent/)) | "slow and prone to mistakes"; $249.99 a month, US only (same article) | 5.0 | 7.7 / 8.4 |

Odelia's filer by part, before / after: finishing on the portal 7 / 8, cost per filing 8 / 8.5, safety 9 / 9, takeover 8 / 8, proof 7 / 8, parallel runs 6 / 8, availability 9 / 9.

Built, because each makes filings more reliable or cheaper: selectors healed by their words (Stagehand, Browser Use), only on one exact match and flagged to the team as drift; a down portal retried after 2, 10 and 30 minutes; up to 4 filings side by side with one run per workspace and portal (Mariner); a receipt checklist on every submitted filing. Already there: the DOM read before any screenshot (labels, ARIA labels, roles), the live view with hand-back for CAPTCHAs, codes and payments, per-run host allowlists, confirm before submit and pay, page text scored for injection before the model reads it. Not built: a video of each run (a screenshot per page and the step log already prove it, and video costs storage on every filing) and saved sessions per agency login (each run starts empty by design; a saved session would keep a live agency login in storage).

## What 9.5 needs that only the founder can do

| Step | Worth | Why code can't |
|---|---|---|
| Open the 6 blocked official pages in a browser (leginfo §§24011, 24012, 11506; LAMC §98.0403.2; San José ch. 4.76; Houston) and send the text | Appeals +0.3 | Their hosts answer Placetta's servers with a bot check; it isn't bypassed |
| An attorney reviews the 23 appeal playbooks once, and partner attorneys are signed for the handoff | Appeals +0.5, lifecycle +0.2 | A legal review and a contract |
| A live pilot: real filings through the worker's supervised first runs on the 11 booking sites and the new playbook, and real denials | Finishing alone +1, inspections +1, tracking +0.5 | Needs customers' filings and the owners' logins |
| The live-model eval in docs/EVAL.md (keys) | Accuracy +0.5, speed +1 | Needs production model keys and spend |
| A SOC 2 Type I report | Trust +1 | An auditor |

With all of them: appeals about 9.3 (9.5 once a real denial has gone through a playbook end to end), lifecycle about 8.8 (corrections stays at 8: complex plan review needs a person on the phone), overall about 8.3. Overall 9.5 also needs more connectors (Claude's and Grok's catalogs lead at 9), measured speed and memory and live visibility tested with real owners.

## The 9.5 pass (2026-10-22): each dimension below 9, against its leader

For each dimension below 9: the leader's winning pattern from its own public pages, what was built from it, and an
honest score. Lifecycle (8.3), appeals (about 8.8) and the filer against browser agents (8.4) weren't touched.

| Dimension | Before | After | Best competitor | Copied from | Built (commit) | Why not 9 yet |
|---|---:|---:|---|---|---|---|
| Finish alone | 7.5 | 7.5 | 6 (Perplexity, Alven, Dots, Grok, Instinct, Claude Code) | | Nothing new: the gaps are runs, not code | Unverified portal playbooks wait for their supervised first run; corrections from finished filings don't flow back into the registry; no live pilot |
| Cited accuracy | 8 | 8.5 | 7 (Claude apps, Harvey, Legora) | Perplexity's inline numbers; Harvey's and Legora's passage behind each citation | A number after each sentence for each source it names, hover or focus shows the page, the quote and the day it was read (only while the read is current); the Sources row numbered to match; every permits row links to its official page; Santa Clara County's health permit proven by the county's rule, read with curl (d2991e4f, 72fb4df2) | No live-model eval: the 100% is on the gold and held-out sets with the registry, not on a live model's sentences |
| Cost transparency | 9 | 9 | 7 (Alven) | | | |
| Speed | 7 | 7.5 | 8 (Claude apps) | Perplexity and Claude apps saying what's happening before the first lookup | A fresh run's first step is written and pushed right after the claim, instead of after seven serial reads, the connected apps' tool lists and a 300 ms debounce; those reads now run together; add_store and find_official_forms asked for in the same turn (0d5e319a) | The fixtures don't move: origin/main and this pass both model 1.5 s median and 24.1 s p95 to first token (the scripted model already batched, and the harness has no database round trips). The half point is the first visible step; only a live run measures it |
| Memory | 8 | 8.5 | 7 (Alven, Dots, Claude apps, Harvey) | Claude's memory import and ChatGPT's Manage memories list | Paste what ChatGPT or Claude remembers: each line filtered like anything from outside (no secrets, ID numbers, credentials, sensitive topics or instructions), a suggestion only the importer sees, approved one by one; the per-workspace, per-store and per-person views with edit, delete and why each was kept were already there (da46a257) | Not used by a real owner yet |
| Live visibility | 8 | 8.5 | 8 (Claude Code) | Devin's and Claude Code's plan beside the live work | The filing card shows "Page 3 of 6" against the agency's published guide, a progress bar, each page done, now or next, and the page it's on as the agency shows it; "What Odelia is doing now" was already on the panel, the dock, Work and Today (49c37923) | No real portal filing has run with it; the first supervised runs are the founder's |
| Integrations/MCP | 7 | 8.5 | 9 (Claude apps, Claude Code) | Claude's connector directory and ChatGPT apps' OAuth requirements; Grok's and Dots's catalogs reaching apps through one hub | OAuth 2.1 on Placetta's MCP server (registration, PKCE S256, iss, resource binding, rotating refresh tokens, a consent screen, Settings lists and disconnects each connection) and per-tool securitySchemes, so it can be listed in both; a signed generic webhook for Zapier, Make, n8n or the business's own system; Gusto over its own MCP server for EIN, locations and headcount (3ab39375, 8e1d4723) | Not listed in either directory yet (the founder submits); DocuSign's MCP server needs an Integration Key registered by Placetta, and its production address wasn't confirmed (developers.docusign.com refused this session's fetch) |
| Trust and security | 8 | 8.5 | 9 (Harvey) | Harvey's enterprise controls | A retention period per workspace for Odelia's conversations, set by an owner and audited; a role matrix from the database rules; the no-training and zero-retention settings in code and what to ask each provider for; data residency as it is (one US region); a Team access section on the trust page, every item Rolling out, no certification claimed (772e31ba). SSO, SCIM, roles and the audit export were already built | No SOC 2 report; zero retention not confirmed in writing by any provider |
| Domain depth | 9 | 9 | 5 (Claude for Legal, Harvey, Legora) | | | |
| **Overall** | **7.9** | **8.4** | 6.6 (Claude apps) | | | |

### Checked against what was already there, and skipped

- **Already built, so not rebuilt:** Google Calendar and Outlook Calendar (and a calendar feed any app subscribes to);
  Slack and Microsoft Teams posts (plus Lark, WeCom, DingTalk); Box, Dropbox and Google Drive over their MCP servers;
  Zapier over its MCP server; SSO with SAML, SCIM 2.0, the four roles and the audit export; read-only lookups side by
  side (`READ_ONLY` in `src/live.ts`); a status step before the first model call (`src/serverRun.ts`); the editable
  memory view with sources, scopes and why; the filing replay with a screenshot of every page.
- **Not built, and why:** Clover and Lightspeed (no official remote MCP server found, only community ones; Square and
  Toast already cover the beachhead, and the webhook reaches the rest); SharePoint (Microsoft's own route is a tenant
  app registration, a contract item, and documents already come in from Drive, Dropbox and Box); ADP (no public MCP
  server found); DocuSign and Dropbox Sign (DocuSign's server needs Placetta's own Integration Key; filings that the
  agency signs by DocuSign already say so on the form); client ID metadata documents on Placetta's sign-in (both
  directories fall back to registration, and fetching a client's document means fetching any address a caller names);
  speculative prefetch of the plan on store add (the registry is in memory in the same bundle, so there is nothing to
  fetch; the round it would save is saved by asking for add_store and the forms lookup together); the trust page's model
  names (left to the founder, as asked).

### What only the founder can do, with the points at stake

| Step | Worth |
|---|---|
| Apply migrations 20261028090000 to 20261028120000 and redeploy `mcp`, `integrations`, `monitor`, `chat-events`, `agent-run` and the filer (docs/MCP_SERVER.md, docs/ENTERPRISE.md) | Nothing in this pass is live until then |
| Submit the MCP server to Claude's connector directory and as a ChatGPT app (docs/mcp/DIRECTORIES.md: listing text, test workspace, auth type) | Integrations +0.5 (to 9) |
| Register a DocuSign Integration Key and confirm its production MCP address | Integrations, part of the same 9 |
| A live pilot: real filings through the worker's supervised first runs, owners watching them | Finish alone +1 (to 8.5), live visibility +0.5 (to 9), memory +0.5 once owners use it (to 9) |
| The live-model eval with production keys (docs/EVAL.md) | Accuracy +0.5 (to 9), speed +0.5 (to 8, measured) |
| A SOC 2 Type I report, and zero retention confirmed in writing by each AI provider | Trust +0.5 (to 9) |

With every step: 8.5, 9, 9, 8, 9, 9, 9, 9, 9, about 8.8 overall. 9.5 overall also needs finishing alone at 9 and above
(filings at volume, corrections flowing back into the registry) and speed measured at 9, which no code in this
repository can show before real runs.
