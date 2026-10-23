# Odelia against the general agents

Written 2026-10-22. Each competitor's strength and weakness comes from a cited page (reviews by third parties, some of them competing vendors, are marked as such). Odelia's side comes from this repository's own tests, not from claims. Scores are Placetta's judgment out of 10 for the job Odelia does, mapping, filing and renewing licenses for stores, not for each product's own job.

## Odelia's baseline, from the tests

| Dimension | Odelia | Evidence in the repo |
|---|---:|---|
| Finishing the job alone | 7 | Maps, fills the agency's own PDFs, puts complete filings up for one-tap approval, then the team or a portal route files them; store bots split a 20-store request (12 a call, 48 a run). Approval is required by design. No live-model eval has run yet (docs/EVAL.md). |
| Accuracy with cited sources | 8 | test:accuracy 100% recall and precision on the gold and held-out sets; every plan row carries its agency page and the date it was read; fees agencies don't publish are left open. Weak spot found: Santa Clara County's health permit is proven by a line on San José's business tax page. |
| Cost transparency | 9 | Every license priced before approval ($299, $999, $99 renewal), cost to open with agency fees, a per-run token cap, and from this pass a failed run isn't charged. No per-run estimate is shown (runs cost about a cent median at the prices re-read 2026-10-22, docs/eval-speed.json and docs/UNIT-ECONOMICS.md). |
| Speed | 7 | Modeled on 60 fixtures: 2.8 s median to done, 23.7 s p95. A 4-market entry is one call (plan_markets) instead of four. No live latency measured. |
| Memory | 8 | Owner-approved memory, recalled across sessions (journeys test), pinned facts from the records survive 200 turns, "don't remember this chat". |
| Live visibility | 8 | Streaming over Realtime with polling fallback, a trace tree per run, the replay of every tool call. |
| Integrations and MCP | 7 | Connected apps over MCP (client), Placetta's own read-only MCP server (compliance status, deadlines, readiness, plan, filings), Gmail, Outlook, Drive, QuickBooks, Square, Toast, WeChat. Fewer connectors than Claude's or Grok's catalogs. |
| Trust and security | 8 | test:redteam 58 of 58 attacks blocked; documents with instructions aimed at an AI quarantined; a policy gate on every tool call; nothing filed, paid or sent without approval; SOC 2 evidence tooling (docs/soc2) but no audit report yet. |
| Domain depth | 9 | 325 US forms and 156 abroad (docs/FILING_COVERAGE.md), 37 markets each on its own jurisdiction's form (docs/MARKET_COVERAGE.md), EN and ZH. |
| **Overall** | **7.9** | |

## The scorecard

Each cell is the competitor's score, then Odelia's, for Odelia's job.

| Competitor | Finish alone | Cited accuracy | Cost transparency | Speed | Memory | Live visibility | Integrations/MCP | Trust and security | Domain depth | Overall (them / Odelia) |
|---|---|---|---|---|---|---|---|---|---|---|
| Perplexity Computer | 6 / 7 | 6 / 8 | 3 / 9 | 7 / 7 | 5 / 8 | 3 / 8 | 6 / 7 | 5 / 8 | 3 / 9 | 4.9 / 7.9 |
| Devin | 5 / 7 | 4 / 8 | 5 / 9 | 5 / 7 | 6 / 8 | 7 / 8 | 6 / 7 | 6 / 8 | 1 / 9 | 5.0 / 7.9 |
| Alven | 6 / 7 | 4 / 8 | 7 / 9 | 6 / 7 | 7 / 8 | 5 / 8 | 6 / 7 | 7 / 8 | 2 / 9 | 5.6 / 7.9 |
| ChatGPT agent | 5 / 7 | 6 / 8 | 5 / 9 | 5 / 7 | 6 / 8 | 7 / 8 | 7 / 7 | 6 / 8 | 3 / 9 | 5.6 / 7.9 |
| OpenAI Dots | 6 / 7 | 5 / 8 | 4 / 9 | 6 / 7 | 7 / 8 | 4 / 8 | 8 / 7 | 4 / 8 | 2 / 9 | 5.1 / 7.9 |
| Grok Bot | 6 / 7 | 4 / 8 | 3 / 9 | 6 / 7 | 5 / 8 | 6 / 8 | 8 / 7 | 4 / 8 | 2 / 9 | 4.9 / 7.9 |
| Meta Muse | 5 / 7 | 4 / 8 | 4 / 9 | 6 / 7 | 6 / 8 | 4 / 8 | 5 / 7 | 4 / 8 | 1 / 9 | 4.3 / 7.9 |
| Instinct | 6 / 7 | 4 / 8 | 4 / 9 | 6 / 7 | 6 / 8 | 4 / 8 | 6 / 7 | 6 / 8 | 1 / 9 | 4.8 / 7.9 |
| Claude apps (projects, memory, connectors) | 4 / 7 | 7 / 8 | 6 / 9 | 8 / 7 | 7 / 8 | 6 / 8 | 9 / 7 | 8 / 8 | 4 / 9 | 6.6 / 7.9 |
| Claude Code and the Agent SDK | 6 / 7 | 6 / 8 | 6 / 9 | 7 / 7 | 6 / 8 | 8 / 8 | 9 / 7 | 8 / 8 | 2 / 9 | 6.4 / 7.9 |
| Claude for Legal | 4 / 7 | 6 / 8 | 6 / 9 | 7 / 7 | 7 / 8 | 6 / 8 | 8 / 7 | 8 / 8 | 5 / 9 | 6.3 / 7.9 |
| Harvey | 5 / 7 | 7 / 8 | 2 / 9 | 6 / 7 | 7 / 8 | 6 / 8 | 7 / 7 | 9 / 8 | 5 / 9 | 6.0 / 7.9 |
| Legora | 5 / 7 | 7 / 8 | 3 / 9 | 6 / 7 | 6 / 8 | 6 / 8 | 8 / 7 | 8 / 8 | 5 / 9 | 6.0 / 7.9 |

Odelia leads overall against every one. She is behind on integrations against Claude, Claude Code, Dots and Grok, and level or behind on speed against Claude apps. Harvey's enterprise security is the one trust score above hers.

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
