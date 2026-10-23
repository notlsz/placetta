# Odelia's channels: where owners can reach her, what she does there, what it costs

Checked October 23, 2026, and again for the channels pass the same day (Slack beyond the mention, files in Teams and Telegram, digest schedules). Every channel follows the same three rules, enforced in code, not in the prompt:

1. **Read and answer anywhere.** A linked person can ask anything, start a job, and get the answer back where they asked.
2. **Nothing final happens in a chat, a text or an email.** Filing, paying, sending to an agency, removing a deadline, routines, memory, skills and stores never change from outside the app (`src/serverRun.ts`, `channelRefuses` and `guardPatch`). What needs a decision goes up as an approval, and the answer carries a link to it (a button in Teams and Telegram). No chat button approves anything: a button opens the app, assigns an application to the person who pressed it, or reminds them later (`chat_item_action`).
3. **Every refusal says what to do next** ("Remove it in the Placetta app", "Try again in a little while, or carry on in the app"), checked in `npm run test:agent` (Remote channels).

And one conversation per person: a request from any channel but the app starts with that person's last four requests and answers from the last day, from every channel, marked with where each was asked (`supabase/functions/_shared/continuity.ts`). Texts and calls, the easiest to forge, only carry into other texts and calls. Copied from Intercom, whose Fin answers WhatsApp, email and chat from one inbox with the same customer record ([Intercom](https://www.intercom.com/integrations/connectors/whatsapp)).

## The channels

Status: **built and tested** means the code, unit tests, the two-account test and the red team cover it; none of it is live until the founder sets the credentials and deploys. **Customer setup** means the business connects its own account in Settings, Integrations, and Placetta has nothing to set up beyond deploying.

| Channel | Status (before → after this change) | What Odelia can do there | Who sets it up, and what |
| --- | --- | --- | --- |
| Email | built and tested, needs credentials → same, plus forwarded letters fenced and scam letters held back, plus memory across channels | read, answer in the same thread (In-Reply-To and References), start a job, save attached photos and PDFs to Documents (each read through the injection shield), approvals by link | Founder: `ODELIA_EMAIL` on a domain whose MX points at Postmark or Resend, plus `POSTMARK_SERVER_TOKEN` and `POSTMARK_INBOUND_AUTH` (with RawEmailEnabled) or `RESEND_WEBHOOK_SECRET` and `RESEND_API_KEY` (SETUP.md, Email Odelia) |
| SMS | built and tested, needs credentials → same | read, answer in up to three texts, start a job that only reads and drafts (plain SMS can be forged), approvals by link; quiet hours, 3 texts and 1 call a day at most | Founder: a Telnyx number, messaging profile and 10DLC brand and campaign (days to weeks) |
| iMessage | built and tested, needs credentials → same, now behind the `LINQ_ENABLED` flag (off by default; Telnyx SMS carries texts until it is on) | as SMS, but a full job (iMessage and RCS senders are verified by the carrier), with the typing bubble | Founder: Linq account and lines, `LINQ_API_KEY`, `LINQ_NUMBERS`, then `LINQ_ENABLED=1` |
| Phone calls | built and tested, needs credentials → same | answer from a read-only summary, start a job whose answer is texted; a caller not fully attested must say a texted code first | Founder: Telnyx Call Control app and AI Assistant |
| WhatsApp | built and tested, needs credentials → same (it already uses Meta's own WhatsApp Business Cloud API, no reseller) | read, answer inside the 24-hour window, updates outside it as one approved utility template, photos and PDFs to Documents, typing indicator, start a job, approvals by link | Founder: Meta app, WhatsApp Business Account, a phone number, a System User token, the `odelia_update` template approved in English and Chinese; Meta business verification lifts the 250-a-day cap |
| Slack | built and tested, customer setup → same, plus /odelia, the Make it a task shortcut, buttons (open, assign, remind), the thread before a mention as context, photos and PDFs, and an opt-in ambient check (2026-10-23) | @mention in a channel or DM to start, or /odelia anywhere; answers in the thread with buttons; reads the thread before the mention; sender matched to a Placetta teammate by email, guests and Slack Connect outsiders refused; in a channel the approval link goes only to the asker | Customer: creates the app from the manifest Settings gives, pastes the bot token and signing secret |
| Microsoft Teams | built and tested, customer setup → same, plus photos and PDFs sent in a personal chat saved to Documents (2026-10-23) | personal chat or @mention in a channel or group chat, answers as a reply in the thread, sender matched by work email, other tenants and guests refused, approvals as an Open URL card button | Customer: a bot in the Teams Developer Portal (Tools, Bot management, no Azure subscription), its ID, a client secret and the Microsoft Entra tenant ID pasted into Settings, the app published to the org |
| Lark (Feishu) | built and tested, customer setup → same, plus memory and the job limit | @mention in a group or DM, replies to the message, sender matched by email, other tenants refused, approvals by link | Customer: a custom app with the Bot feature and three permissions, App ID, App Secret, Verification Token (and Encrypt Key) |
| WeChat | built and tested, customer setup → same, plus memory and the job limit | message the business's own Official Account; each teammate links once with a 6-digit code; answers in the chat (customer service messages, within 48 hours of the person's last message); approvals by link | Customer: a verified service account (认证服务号, 300 RMB a year to Tencent), AppID, AppSecret, Token, EncodingAESKey, the server address submitted in WeChat |
| Telegram | built and tested, customer setup → same, plus photos and PDFs saved to Documents (2026-10-23) | DM the business's own bot, or in a group @mention it, /ask, or reply to it; each teammate links once with a 6-digit code or a t.me link that carries it (codes only in private chats); answers as a reply in the same chat and forum topic; approvals as a link button; typing indicator | Customer: /newbot in @BotFather, paste the token; Placetta sets the webhook with its own secret |
| Discord | missing → skipped (below) | | |

## What each message costs

| Channel | Cost per message, from the provider | Fixed cost | Source |
| --- | --- | --- | --- |
| Email | Postmark Pro: $16.50 a month for 10,000 (about $0.0017 each, inbound included); Resend: free for 3,000 a month, then $20 for 50,000 (about $0.0004) | the plan | [Postmark](https://postmarkapp.com/pricing), [Resend](https://resend.com/pricing) |
| SMS | Telnyx: from $0.004 a text plus US carrier fees up to $0.012 | $1 a month a number, 10DLC registration fees | [Telnyx](https://telnyx.com/pricing) |
| iMessage | Linq doesn't charge per message | Hobby free for 20 contacts; Pro from $260 a month | [Linq](https://linqapp.com/s/pricing) |
| Phone calls | Telnyx AI Assistants: about $0.06 a minute | the number | [Telnyx](https://telnyx.com/pricing) |
| WhatsApp | service replies inside the 24-hour window: the first 1,000 a month per number free; utility templates (Odelia's updates): $0.0034 each to a US number, charged inside the window too since October 1, 2026; marketing templates: $0.025, and not delivered to US numbers. Abroad, utility: Mexico $0.0085, Brazil $0.0068, UK $0.022, Germany $0.055, Indonesia $0.025 | none | [Meta](https://developers.facebook.com/docs/whatsapp/pricing) (model, free tier, the October 2026 change); rates as listed on Meta's calculator, compiled by [Kanal, Oct 2026](https://getkanal.com/blog/whatsapp-vs-sms-pricing-by-country.md) |
| Slack | $0 (the Web API has no message fee) | none | the business's own Slack |
| Microsoft Teams | $0: Teams is a standard channel, unlimited messages on the free tier | none (no Azure resources needed with a Developer Portal bot) | [Azure Bot Service](https://azure.microsoft.com/en-us/pricing/details/bot-service/) |
| Lark (Feishu) | $0 for a custom app's bot | none | the business's own Lark |
| WeChat | $0 per customer service message | 300 RMB a year verification, paid by the business | [36Kr on WeChat verification](https://www.36kr.com/p/1641796239361) |
| Telegram | $0: bots message users free (paid broadcasts only above 30 messages a second, which Odelia never reaches) | none | [Telegram Bot FAQ](https://core.telegram.org/bots/faq) |
| Discord | $0 | none | |

The model's cost per answer is the same wherever the question came from (docs/UNIT-ECONOMICS.md); the channel adds at most a fraction of a cent.

## The value for our customers

Our customers are Chinese F&B and furniture brands opening in the US and abroad, and the franchise HQs behind them.

- **WeChat** is where Chinese owners and their store managers already work, in China and abroad. Highest value for the owner and the store; the business needs a verified service account, which most brands already have.
- **WhatsApp** is the default chat for their staff, landlords and contractors in Latin America, Southeast Asia, Europe and the Middle East, and for many immigrant owners in the US. High value for brands opening abroad; low per-message cost; the 24-hour window means Odelia's own alerts (a renewal due, an agency asking for something) go as the approved utility template.
- **Slack and Microsoft Teams** are where franchise HQs, and the corporate buyers of furniture brands, run their day. Teams matters most for larger HQs on Microsoft 365, which is why it's now two-way and not only an update feed.
- **Lark (Feishu)** is the HQ tool for many Chinese brands' head offices.
- **Email** is where agency letters arrive: forwarding one to Odelia is the most common first job.
- **iMessage and SMS** reach a US store manager who uses no chat app at work.
- **Telegram** matters for a smaller set: teams in Russia, Central Asia, the Middle East, Eastern Europe and parts of Southeast Asia, and some overseas Chinese staff. It's built because it cost almost nothing (no review, no fee, no founder setup) and reuses the WeChat link-code pattern; Telegram is blocked in mainland China, so it never replaces WeChat.

## What we copied, and from whom

| Pattern | Who does it | How Odelia does it |
| --- | --- | --- |
| Mention or DM to start | Claude in Slack: mention @Claude in a channel or open it in DMs ([Slack help](https://slack.com/help/articles/53532192117267-Use-Claude-in-Slack)); Devin: tag @Devin ([Devin docs](https://docs.devin.ai/integrations/slack)) | Slack, Lark, Teams: @mention or DM; Telegram: @mention, /ask, reply, or DM; WeChat and texts: any message |
| Thread replies | Claude in Slack replies in the thread and reads the thread before the mention; Devin works in the session's thread | every chat answers in the thread or as a reply to the message that asked (Telegram keeps forum topics) |
| Link the sender to their account | Devin matches the Slack user to the Devin account by email; Claude in Slack links each person's account from the app's Home tab | Slack, Lark, Teams: by email, members of the business's own tenant only, guests and outsiders refused; WeChat and Telegram (which share no email): a 6-digit code from Settings, sent once from the person's own account; texts: the verified phone; email: the sign-in address, with DKIM or DMARC proof |
| Approvals that open the app, never secrets in chat | Ramp approves spend in Slack ([Ramp](https://ramp.com/integrations/slack)); Lindy: actions that write or send wait for a person's approval ([Lindy](https://lindy.ai/llms.txt)); Devin puts an Apply button on proposed changes | the answer links to the exact approval (a button in Teams and Telegram), but the approval itself only happens in the app, after sign-in and two-step: a chat account can be shared, borrowed or taken over, and a filing or a payment is not undoable. Odelia never asks for SSNs, bank or card numbers in a chat or text |
| Typing while she works | WhatsApp's typing indicator; iMessage's typing bubble | WhatsApp, iMessage and Telegram show typing while the job starts |
| One history per person across channels | Intercom: every channel in one inbox, handoff without losing context ([Intercom](https://www.intercom.com/integrations/connectors/whatsapp)); Zendesk: one agent built once and deployed to every channel ([Zendesk](https://www.zendesk.com/service/messaging/)) | `continuity.ts`: the person's recent requests and answers from every channel come along, marked with where they were asked |
| Daily digest | Claude Tag posts updates where the team works ([SiliconANGLE](https://siliconangle.com/2026/06/23/anthropic-debuts-claude-tag-capable-ai-teammate-lives-within-slack/)); Ramp's opt-in alerts | checked 2026-10-23: a linked group got every sweep's new updates as one message, not a daily one. Now each linked group chooses, in Settings, Integrations: each update as it comes (the default, as before) or one digest a day at the hour it picks, with everything since the last (`_shared/channels.ts` `hookPlan`, the monitor, `hook_schedule`) |
| Quiet hours | | checked 2026-10-23: built for texts and calls only. Now a linked group can turn on quiet hours too: 9pm to 8am where the business is, updates held and sent as one message in the morning. Chat answers are replies to someone who just asked, so they still go at once; the ambient offer goes only to the person who just wrote |
| Read the thread before answering | Claude in Slack "will use any messages in a thread before it was mentioned as context", the 50 most recent replies ([Slack help](https://slack.com/help/articles/53532192117267-Use-Claude-in-Slack)) | a mention inside a thread brings the thread's earlier messages (`conversations.replies`, 50), fenced as other people's words; a thread carrying instructions aimed at an AI is held back whole, as a forwarded email is (`_shared/slack.ts` `threadContext`, red team K1, K2) |
| A slash command | Slack's own way to call an app anywhere | `/odelia <question>` posts the question in the channel as theirs and answers in its thread, as them; `/odelia status`; `/odelia ambient on|off` (owners and admins) |
| Turn a thread into a task | Claude Tag works a request in stages and answers in the thread ([Anthropic](https://www.anthropic.com/news/introducing-claude-tag)) | the "Make it a task" message shortcut: the thread becomes a job in Work with its plan and any date, answered in the thread |
| Proactive suggestions | Claude Tag's ambient mode: "Claude will proactively keep you updated about whatever it thinks you might need to know" (same page) | off until an owner or admin turns it on for a channel; a message there about an inspection, a violation, a permit or a deadline (a word list, no model reads every message) gets one offer, seen only by its author, once a thread: Make it a task, or Not now |
| Buttons in chat | Slack's interactive blocks | on an answer about one application: Open in Placetta, Assign to me, Remind me tomorrow, Remind me next week (`chat_item_action`, service role only, audited). Nothing files, pays, sends or approves from a button (red team K3) |
| One bot in a group thread, approvals one to one | Grok Bot: "Approval requests, secret and login requests, and email or Slack drafts do not appear in a group" ([xAI](https://docs.x.ai/grok-bot/chat-and-collaboration)) | each teammate's mention in a thread is their own job, as them; in a channel the approval link goes only to the person who asked (`chat.postEphemeral`); a personal or admins-only memory never reaches a shared thread (red team K4) |
| Files in chat become documents | Claude in Slack analyzes files shared with it | photos and PDFs sent in Slack (`files:read`), Teams (a personal chat's file, an inline image) and Telegram (documents, photos) are saved to Documents and read through the injection shield (`_shared/chat_files.ts`); a stranger's are never fetched (red team K5) |
| A per-channel rate limit | Telegram asks bots for at most one message a second a chat and 20 a minute a group ([Telegram](https://core.telegram.org/bots/faq)) | at most 30 jobs a person an hour from one chat app (`CHAT_JOBS_PER_HOUR`), texts flood-limited per hour, link codes 5 an hour a person and 60 a workspace |

Not copied: Claude Tag's one shared identity for the whole company. Odelia always works as the person who asked, so the audit trail and the approvals say who it was.

## Skipped, and why

- **Discord.** Our customers' staff and HQs don't run their business on Discord, and nobody has asked. A slash command plus a DM bot is about a day of work (the same shape as Telegram, with Ed25519-signed interactions), so it's ready to build the first time a customer asks; until then it's maintenance for no one.
- **WeChat updates after 48 hours.** WeChat only allows customer service messages within 48 hours of the person's last message; Odelia's own alerts outside that window would need subscription or template messages, which need Tencent's category approval per account. The team-chat digest (WeCom) and texts cover alerts meanwhile.
- **Approving from a chat button.** Every reference product that approves in chat (Ramp, Devin's Apply) does it for reversible, low-stakes actions. A government filing or a fee isn't reversible, so it stays in the app, behind sign-in and two-step. The buttons built on 2026-10-23 only open the app, assign, or remind.
- **Files shared in a Teams channel.** A channel's file is a SharePoint link that needs Microsoft Graph and the tenant admin's consent; a personal chat's file and an inline photo work. Lark files aren't read either (its message-resource API is a separate permission no customer has asked for).
- **Answering a thread reply without a mention.** In Slack every message in a thread would become a job while teammates talk among themselves; Grok's group "Reply" is an explicit reply to the bot, which Slack threads don't have. A mention, a DM, /odelia or the shortcut start a job. Telegram's reply-to-bot already works.
- **Business rules delivering to Teams or Telegram.** The owner's rules can already post to Slack, Lark, WeChat, email and texts, and the team-chat webhook covers Teams groups.

## Email: what the founder must have in DNS

- **Receiving**: the MX of `ODELIA_EMAIL`'s domain points at Postmark (`inbound.postmarkapp.com`) or Resend.
- **Sending**: the sending domain needs SPF and DKIM for Postmark or Resend, and a DMARC record. Gmail requires SPF or DKIM from every sender, and SPF, DKIM and DMARC aligned with the From domain from anyone sending 5,000 or more a day to Gmail ([Google](https://support.google.com/mail/answer/81126)). Start DMARC at `p=none` with a reporting address, then move to `quarantine`.
- **Who can email Odelia**: only mail whose sender the receiving provider can vouch for (Resend's own DMARC or DKIM result; for Postmark, a DKIM signature by the From domain that `odelia-mail` checks on the raw message). Gmail, Outlook and Google Workspace sign with DKIM; a company domain with no DKIM gets one note a day explaining why nothing happened.
- **Threading**: answers carry `In-Reply-To` and `References` set to the person's Message-ID and the same subject with "Re:", so every mail client keeps them in one thread.
- **Forwarded letters**: the owner's own words go to Odelia as theirs; the forwarded letter goes fenced as someone else's words (the fence can't be closed from inside it); a forwarded letter carrying instructions aimed at an AI is held back entirely and Odelia warns it may be a scam (`mailAsk` in `_shared/mail.ts`, red team E11 and E12).

## Where the code is

| Piece | File |
| --- | --- |
| Chat bots in (Slack, Lark, WeChat, Teams, Telegram) | `supabase/functions/chat-events/index.ts` |
| Slack beyond the mention: /odelia, buttons, the shortcut, thread context, ambient | `supabase/functions/_shared/slack.ts`, `slack_test.ts`; migration `20261031151800_chat_actions.sql`, DB test `supabase/tests/chat_actions.sql` |
| Photos and PDFs from Slack, Teams and Telegram | `supabase/functions/_shared/chat_files.ts`; `teams.ts` `teamsFiles`; `telegram.ts` `tgFiles`, `tgDownload` |
| When a linked group hears (daily digest, quiet hours) | `supabase/functions/_shared/channels.ts` `hookPlan`, `channels_schedule_test.ts`; the monitor; `integrations` `hook_schedule`; Settings `HookWhen` |
| Teams: token checks, sender, replies | `supabase/functions/_shared/teams.ts`, `teams_test.ts` |
| Telegram: webhook, link codes, replies | `supabase/functions/_shared/telegram.ts`, `telegram_db.ts`, `telegram_test.ts`; migration `20261029143000_chat_channels.sql`, DB test `supabase/tests/chat_channels.sql` |
| Answers back to each chat | `supabase/functions/agent-run/index.ts` (`chatBack`), `_shared/bots.ts` (`chatReply`) |
| What a remote run may do | `src/serverRun.ts` (`channelRefuses`, `guardPatch`, `channelHint`) |
| One conversation across channels | `supabase/functions/_shared/continuity.ts`, `continuity_test.ts` |
| Chat job limit, where answers may go | `supabase/functions/agent-run/limits.ts` (`CHAT_JOBS_PER_HOUR`, `chatToOk`) |
| Email, SMS, iMessage, WhatsApp, calls | `odelia-mail`, `odelia-sms`, `odelia-voice`; `_shared/mail.ts`, `linq.ts`, `whatsapp.ts`, `odelia.ts` |
| Connecting a bot, link codes | `supabase/functions/integrations/index.ts` (`bot_connect`, `telegram_link`); `src/Settings.tsx` (Integrations) |
| Tests | `npm run test:agent` (Remote channels), `npm run test:redteam` (chat, Telegram, Teams, email, memory), `npm run test:tenancy` (chat bots can't reach another workspace), `deno test supabase/functions` |
