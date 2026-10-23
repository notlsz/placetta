# Odelia's channels: where owners can reach her, what she does there, what it costs

Checked October 23, 2026. Every channel follows the same three rules, enforced in code, not in the prompt:

1. **Read and answer anywhere.** A linked person can ask anything, start a job, and get the answer back where they asked.
2. **Nothing final happens in a chat, a text or an email.** Filing, paying, sending to an agency, removing a deadline, routines, memory, skills and stores never change from outside the app (`src/serverRun.ts`, `channelRefuses` and `guardPatch`). What needs a decision goes up as an approval, and the answer carries a link to it (a button in Teams and Telegram). No chat button approves anything: the buttons only open the app.
3. **Every refusal says what to do next** ("Remove it in the Placetta app", "Try again in a little while, or carry on in the app"), checked in `npm run test:agent` (Remote channels).

And one conversation per person: a request from any channel but the app starts with that person's last four requests and answers from the last day, from every channel, marked with where each was asked (`supabase/functions/_shared/continuity.ts`). Texts and calls, the easiest to forge, only carry into other texts and calls. Copied from Intercom, whose Fin answers WhatsApp, email and chat from one inbox with the same customer record ([Intercom](https://www.intercom.com/integrations/connectors/whatsapp)).

## The channels

Status: **built and tested** means the code, unit tests, the two-account test and the red team cover it; none of it is live until the founder sets the credentials and deploys. **Customer setup** means the business connects its own account in Settings, Integrations, and Placetta has nothing to set up beyond deploying.

| Channel | Status (before → after this change) | What Odelia can do there | Who sets it up, and what |
| --- | --- | --- | --- |
| Email | built and tested, needs credentials → same, plus forwarded letters fenced and scam letters held back, plus memory across channels | read, answer in the same thread (In-Reply-To and References), start a job, save attached photos and PDFs to Documents (each read through the injection shield), approvals by link | Founder: `ODELIA_EMAIL` on a domain whose MX points at Postmark or Resend, plus `POSTMARK_SERVER_TOKEN` and `POSTMARK_INBOUND_AUTH` (with RawEmailEnabled) or `RESEND_WEBHOOK_SECRET` and `RESEND_API_KEY` (SETUP.md, Email Odelia) |
| SMS | built and tested, needs credentials → same | read, answer in up to three texts, start a job that only reads and drafts (plain SMS can be forged), approvals by link; quiet hours, 3 texts and 1 call a day at most | Founder: a Telnyx number, messaging profile and 10DLC brand and campaign (days to weeks) |
| iMessage | built and tested, needs credentials → same | as SMS, but a full job (iMessage and RCS senders are verified by the carrier), with the typing bubble | Founder: Linq account and lines, `LINQ_API_KEY`, `LINQ_NUMBERS` |
| Phone calls | built and tested, needs credentials → same, plus OpenAI speech to speech over SIP, recordings with consent, transcripts, Calls to listen back, and Odelia calling agencies for a filing's status (Voice, below) | answer from a read-only summary, start a job whose answer is texted, ask the agency by phone, hand to the team; a caller not fully attested must say a texted code first | Founder: Telnyx Call Control app, a SIP connection to OpenAI, the OpenAI webhook (SETUP.md, Voice) |
| Talk in the app | missing → built and tested, needs credentials | a live conversation with barge-in, EN and Mandarin; work she starts lands in the chat like a typed request; Interpreter on the counter; hear an agency call first | Founder: `OPENAI_API_KEY` |
| WhatsApp | built and tested, needs credentials → same (it already uses Meta's own WhatsApp Business Cloud API, no reseller) | read, answer inside the 24-hour window, updates outside it as one approved utility template, photos and PDFs to Documents, typing indicator, start a job, approvals by link | Founder: Meta app, WhatsApp Business Account, a phone number, a System User token, the `odelia_update` template approved in English and Chinese; Meta business verification lifts the 250-a-day cap |
| Slack | built and tested, customer setup → same, plus memory across channels and a per-person job limit | @mention in a channel or DM to start, answers in the thread, sender matched to a Placetta teammate by email, guests and Slack Connect outsiders refused, approvals by link | Customer: creates the app from the manifest Settings gives, pastes the bot token and signing secret |
| Microsoft Teams | partial (outbound updates through a Workflows webhook only) → built and tested, customer setup | personal chat or @mention in a channel or group chat, answers as a reply in the thread, sender matched by work email, other tenants and guests refused, approvals as an Open URL card button | Customer: a bot in the Teams Developer Portal (Tools, Bot management, no Azure subscription), its ID, a client secret and the Microsoft Entra tenant ID pasted into Settings, the app published to the org |
| Lark (Feishu) | built and tested, customer setup → same, plus memory and the job limit | @mention in a group or DM, replies to the message, sender matched by email, other tenants refused, approvals by link | Customer: a custom app with the Bot feature and three permissions, App ID, App Secret, Verification Token (and Encrypt Key) |
| WeChat | built and tested, customer setup → same, plus memory and the job limit | message the business's own Official Account; each teammate links once with a 6-digit code; answers in the chat (customer service messages, within 48 hours of the person's last message); approvals by link | Customer: a verified service account (认证服务号, 300 RMB a year to Tencent), AppID, AppSecret, Token, EncodingAESKey, the server address submitted in WeChat |
| Telegram | missing → built and tested, customer setup | DM the business's own bot, or in a group @mention it, /ask, or reply to it; each teammate links once with a 6-digit code or a t.me link that carries it (codes only in private chats); answers as a reply in the same chat and forum topic; approvals as a link button; typing indicator | Customer: /newbot in @BotFather, paste the token; Placetta sets the webhook with its own secret |
| Discord | missing → skipped (below) | | |

## What each message costs

| Channel | Cost per message, from the provider | Fixed cost | Source |
| --- | --- | --- | --- |
| Email | Postmark Pro: $16.50 a month for 10,000 (about $0.0017 each, inbound included); Resend: free for 3,000 a month, then $20 for 50,000 (about $0.0004) | the plan | [Postmark](https://postmarkapp.com/pricing), [Resend](https://resend.com/pricing) |
| SMS | Telnyx: from $0.004 a text plus US carrier fees up to $0.012 | $1 a month a number, 10DLC registration fees | [Telnyx](https://telnyx.com/pricing) |
| iMessage | Linq doesn't charge per message | Hobby free for 20 contacts; Pro from $260 a month | [Linq](https://linqapp.com/s/pricing) |
| Phone calls | all in, $0.046 a minute for an owner's call on gpt-realtime mini, $0.093 for an agency call on gpt-realtime (Voice, below); Telnyx's own engine $0.063 | $1 a month a number | [Telnyx](https://telnyx.com/pricing/voice-api.md), [OpenAI](https://www.forasoft.com/blog/article/openai-realtime-api-pricing) |
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
| Daily digest | Claude Tag posts updates where the team works ([SiliconANGLE](https://siliconangle.com/2026/06/23/anthropic-debuts-claude-tag-capable-ai-teammate-lives-within-slack/)); Ramp's opt-in alerts | already built: a day's updates as one message to the team's Slack, Lark, WeCom, DingTalk or Teams group (`_shared/channels.ts`, `hookDigest`), and texts batched into one |
| Quiet hours | | already built for texts and calls: nothing proactive from 9pm to 8am in the person's time zone; chat answers are replies to someone who just asked, so they go at once |
| A per-channel rate limit | Telegram asks bots for at most one message a second a chat and 20 a minute a group ([Telegram](https://core.telegram.org/bots/faq)) | at most 30 jobs a person an hour from one chat app (`CHAT_JOBS_PER_HOUR`), texts flood-limited per hour, link codes 5 an hour a person and 60 a workspace |

Not copied: Claude Tag's one shared identity for the whole company. Odelia always works as the person who asked, so the audit trail and the approvals say who it was.

## Skipped, and why

- **Discord.** Our customers' staff and HQs don't run their business on Discord, and nobody has asked. A slash command plus a DM bot is about a day of work (the same shape as Telegram, with Ed25519-signed interactions), so it's ready to build the first time a customer asks; until then it's maintenance for no one.
- **WeChat updates after 48 hours.** WeChat only allows customer service messages within 48 hours of the person's last message; Odelia's own alerts outside that window would need subscription or template messages, which need Tencent's category approval per account. The team-chat digest (WeCom) and texts cover alerts meanwhile.
- **Approving from a chat button.** Every reference product that approves in chat (Ramp, Devin's Apply) does it for reversible, low-stakes actions. A government filing or a fee isn't reversible, so it stays in the app, behind sign-in and two-step.
- **A Slack button for the approval link.** A Slack button, even one that only opens a link, sends an interaction to the app's request URL, which would need a new endpoint to acknowledge; a plain link does the same job.
- **Photos and PDFs sent in Teams or Telegram.** Texts, WhatsApp and email already bring documents in; chat users get a note to upload them to Documents. Easy to add later (Telegram getFile, Teams attachments) if asked.
- **Business rules delivering to Teams or Telegram.** The owner's rules can already post to Slack, Lark, WeChat, email and texts, and the team-chat webhook covers Teams groups.

## Voice: talking with Odelia, Odelia calling agencies, interpreting, listening back

Built 2026-10-23; none of it is live until the founder sets the keys (SETUP.md, Voice). Prices were read that day from
the pages linked; per-minute figures for token-priced models are the planning ranges those pages give.

### What was built

| Feature | What it does | Where |
| --- | --- | --- |
| Speech to speech with Odelia | An owner calls Odelia's number, or taps the phone next to the microphone in the app, and talks: sub-second turns, EN and Mandarin, barge-in (she stops when you talk). Real work she starts runs as a job (on the phone, texted back; in the app, in the chat like a typed request). | `odelia-voice` (phone), `voice` (app), `src/Talk.tsx`, `src/voice/realtime.ts` |
| Odelia calls agencies for status | "Have Odelia call the agency" on a filing's timeline, or ask her on a call. She dials the agency's official line in its hours, says first that she's an AI calling for the business, follows the filing's status script (greet, identify by confirmation number, ask the status and what's missing, recap), and writes the answer on the filing's timeline as a phone call. A payment, an admission or a date change goes to the owner as a decision; a denial, a deadline or "can't find it" goes to the team. | `odelia-voice/calls.ts`, `_shared/voice_calls.ts`, `_shared/voice_rules.ts`, `_shared/agency_phones.ts` |
| Hear the call first | "Hear the call first" runs the same agency call live in the browser with you as the clerk: nothing is dialed or written. Retell's and Vapi's "test it in the browser", for our script. | `voice` (`mode: "rehearse"`), `src/Talk.tsx` |
| Live interpreter | In the app ("Interpreter"): the phone on the counter, the top half turned toward the clerk in English, the bottom half toward the owner in Chinese. On the phone: Odelia calls the owner and the agency's official line into one conference and interprets. The bilingual transcript is kept on the filing, each line checked for the trade's terms. | `_shared/interpreter.ts`, `voice`, `odelia-voice/calls.ts` (`interpretCall`) |
| Listen back | Every call: the recording (only with consent), the transcript (each side apart), the summary and what it set in motion; on the filing's timeline ("Listen back") and in Settings, Text and call Odelia, Calls. Signed links last ten minutes and only point into the workspace's own folder. The workspace's retention period clears transcripts, summaries and recordings; with none set, recordings go after a year. | `voice` (`list`, `media`), `src/Calls.tsx`, migration `20261030120000_voice_calls.sql` |

### How it fits together (the founder's architecture)

1. **Telnyx stays the carrier** (Placetta's own account: the same portable number for voice and SMS, 10DLC already planned). Every call is answered or dialed on Telnyx Call Control, where Placetta checks who it is (STIR/SHAKEN "A", or a texted code), the business hours and the official number, and starts the recording. Not Vapi's free numbers (inbound only, can't port out), not xAI's bundled number, no self-hosted telephony.
2. **The voice brain is swappable behind one interface** (`_shared/voice_brain.ts`): the default is OpenAI gpt-realtime over its SIP endpoint. Telnyx dials a second leg to `sip:<project>@sip.api.openai.com;transport=tls` with a signed `X-Placetta-Call` header and bridges it to the caller; OpenAI's `realtime.call.incoming` webhook is accepted with the session Placetta decides ([OpenAI SIP guide](https://developers.openai.com/api/docs/guides/realtime-sip)). Adapters: Telnyx's own engine (live today, the fallback whenever OpenAI isn't set up), Gemini Live and xAI Grok Voice (configs built; on the phone they need a WebSocket media bridge, `VOICE_BRIDGE_URL`, not built).
3. **Placetta's backend keeps control**: identity, history and memory, the tools (served to the brain over MCP at `odelia-voice?mcp=1`, each call with its own signed token; [OpenAI realtime MCP](https://developers.openai.com/api/docs/guides/realtime-mcp)), the approval gates and the handoff to a person. The brain only holds the conversation.

### Two paths, and what a minute costs, all in

Telnyx, a minute ([Telnyx voice API](https://telnyx.com/pricing/voice-api.md)): $0.002 Voice API plus SIP trunking from $0.0032 in, $0.005 out; the bridge to OpenAI is a second leg ($0.002 Voice API, $0.002 SIP interface); recording $0.002; conferencing $0.002 a participant; $1 a month a number. The brain on top:

| Path | Brain and voice | Brain a minute | All in: owner's call | All in: agency call (recorded) | Source |
| --- | --- | ---: | ---: | ---: | --- |
| Speech to speech (default) | OpenAI gpt-realtime mini (owners) | $0.02 to $0.05, $0.035 used | **$0.046** | $0.048 | [Fora Soft, OpenAI's prices](https://www.forasoft.com/blog/article/openai-realtime-api-pricing), [cloudprice](https://cloudprice.net/models/gpt-realtime-mini) |
| Speech to speech (default) | OpenAI gpt-realtime (agencies, interpreting) | $0.06 to $0.11, $0.08 used | $0.091 | **$0.093** | [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-realtime) ($32 and $64 a million audio tokens) |
| Cascaded | Telnyx engine, Telnyx's included voices (Ultra, Qwen3 TTS for Mandarin) | $0.05 engine + about $0.006 model | $0.063 | $0.065 | [Telnyx voice AI](https://telnyx.com/pricing/voice-ai-agents.md) |
| Cascaded | Telnyx engine + ElevenLabs Flash v2.5 (most human) | + about $0.02 (400 characters a minute at about $50 a million) | | $0.085 | [invideo, Aug 2026](https://invideo.io/blog/ai-voice-model-pricing/), [Telnyx ElevenLabs voices](https://developers.telnyx.com/docs/voice/tts/providers/elevenlabs.md) |
| Cascaded | Telnyx engine + ElevenLabs Multilingual v2 | + about $0.04 | | $0.105 | [Retell's rate card](https://www.retellai.com/es/pricing) (Multilingual $0.06 against Flash $0.04 a minute) |
| Cascaded | Telnyx engine + MiniMax Speech 2.8 turbo | + about $0.024 | | $0.089 | [invideo](https://invideo.io/blog/ai-voice-model-pricing/), on [Telnyx's provider list](https://developers.telnyx.com/docs/voice/tts/voices/alternative-providers.md) |
| Cascaded | Cartesia Sonic-3 (fastest) | + about $0.008 (founder's benchmark: $20 a million, 85 ms) | | $0.073 + $0.0035 bridge | not on Telnyx's provider list: needs the media bridge |
| Speech to speech | Google Gemini 3.1 Flash Live | about $0.016 | | about $0.03 + bridge | [ry walker on Gemini Live](https://rywalker.com/research/gemini-live-api) |
| Speech to speech | xAI Grok Voice Think Fast 2.0 | $0.08 flat | | about $0.09 + bridge | [xAI](https://docs.x.ai/developers/models/voice-agent-api) |

In the app there's no telephony: $0.035 a minute to talk (mini), $0.08 to interpret (full model). The founder asked for a
Deepgram pipeline in the comparison: its Voice Agent API is $0.075 a minute standard ([HappyRobot on Deepgram](https://www.happyrobot.ai/hub/deepgram-pricing)) and Aura-2 has no Mandarin voice ([LLM Reference](https://www.llmreference.com/provider/deepgram/aura-2)), so it would need a second TTS for Chinese; Telnyx's engine is the same cascade already wired to our SIP, with Mandarin, for less code.

**Why OpenAI is the default.** Cheapest real speech to speech that speaks SIP natively (mini at $0.046 all in for an owner), about 300 ms to first audio against 600 to 1,100 ms for a cascade ([Fora Soft](https://www.forasoft.com/blog/article/openai-realtime-api-pricing)), barge-in and semantic turn-taking built in, Mandarin good in the founder's own use of ChatGPT voice. Grok is faster than a cascade too (0.70 s, [eesel](https://www.eesel.ai/blog/grok-voice-think-fast-2-pricing)) but costs more, speaks only WebSocket and doesn't name its languages; Gemini Live is cheapest but has no telephony, 15-minute sessions without compression and barge-in that can't be configured.

**Per language.** OpenAI is the default for Mandarin and English, owner calls and agency calls alike (the founder's decision). Every surface and language can be switched with a setting, without a deploy: `VOICE_BRAIN_<SURFACE>_<LANG>` (surfaces: `OWNER_PHONE`, `AGENCY_PHONE`, `INTERPRETER_PHONE`, `APP_TALK`, `APP_INTERPRETER`, `REHEARSE`), `VOICE_BRAIN_<LANG>`, `VOICE_BRAIN` (values `openai`, `openai_mini`, `telnyx`, `gemini`, `grok`), and for the cascaded path's voice `VOICE_TTS_<LANG>` (`elevenlabs_flash`, `elevenlabs_multilingual`, `cartesia_sonic3`, `minimax`, `telnyx_included`). A brain that isn't set up falls back, ending at Telnyx's engine, so a missing key never drops a call.

**Natural turn-taking.** OpenAI: semantic VAD (a turn ends when the words sound finished), `interrupt_response` for barge-in, near-field noise reduction, the business's and the agency's names as transcription hints. Cascaded: Telnyx's turn-taking, plus Odelia told to talk like a person on the phone: short sentences, one thing at a time, no filler, an "mm-hm" while the clerk explains, and stop when they start.

### The Mandarin quality check (a test, not a gate)

No vendor page documents Mandarin quality. The default stays OpenAI meanwhile; the check decides whether a language's default changes.

1. Script: 20 turns from real jobs, half pure Mandarin, half mixed ("我的 health permit 什么时候到期"), with permit numbers, dates, money and the glossary's terms (隔油池, 图纸审查, 41 类酒牌).
2. Run each brain and voice on the same script over a real Telnyx call: OpenAI gpt-realtime and mini; Telnyx engine with Qwen3 TTS, ElevenLabs Multilingual v2, ElevenLabs Flash v2.5, MiniMax; Cartesia Sonic-3 and Grok when the bridge exists.
3. Measure: character error rate of what Odelia heard (against the script); numbers and terms right (each one counts); time to first audio (median and 90th percentile from the end of the caller's turn); barge-in (does she stop within 300 ms); and three native speakers' blind 1 to 5 for naturalness and "sounds like a person from the mainland".
4. Pick per language: the lowest error with every number right wins; naturalness breaks ties; then cost. Set `VOICE_BRAIN_ZH` / `VOICE_TTS_ZH` to the winner and record the scores here.

### What we copied, from whom, their weakness for our job, and how we filled it

| Product | What users love, copied | Its weakness for our job | How Odelia fills it |
| --- | --- | --- | --- |
| xAI Grok Voice Agent | sub-second first audio, tools during the call | WebSocket only (no SIP), languages not named, Think Fast 2.0 costs 60% more than 1.0, us-east-1 only, 10 sessions at once ([eesel](https://www.eesel.ai/blog/grok-voice-think-fast-2-pricing), [xAI](https://docs.x.ai/developers/models/voice-agent-api)) | OpenAI over our own SIP; Grok kept as a switchable brain |
| Retell AI | "test in the browser", knowledge base, PII removal, transfer to a human, post-call summary ([Retell pricing](https://www.retellai.com/es/pricing)) | a generic stack priced in parts ($0.055 infrastructure + model + voice + telephony, PII removal +$0.01, knowledge base +$0.005); the knowledge base is whatever documents you upload | "Hear the call first"; the registry is the knowledge base (each filing's agency, form and confirmation number); secrets never reach the brain at all; `hand_to_team`; the recap on the timeline |
| Vapi | "talk to your assistant" in the dashboard, bring any SIP | a $0.05 platform fee on top of every provider ([Activepieces](https://www.activepieces.com/blog/vapi-pricing-2026-the-real-cost-per-minute.md)); its free numbers are inbound only and can't be ported | Placetta's own portable Telnyx number, the brain behind an interface |
| Bland | call scripts as pathways ([Bland pathways](https://docs.bland.ai/tutorials/pathways)), handoff | $0.11 to $0.14 a minute; reviewers measure 700 to 900 ms, not the 365 ms advertised ([HappyRobot](https://www.happyrobot.ai/hub/bland-ai-reviews-and-pricing)) | the filing's playbook as the call script (greet, identify, ask, recap), in code |
| OpenAI Realtime | the brain itself: speech to speech, barge-in, SIP, MCP tools | a brain, not a product: no numbers, no compliance knowledge, and the whole conversation is re-read every turn, so long calls cost more | the default brain, with Placetta's tools, rules, caps and a 30-minute limit a call |
| ElevenLabs Agents | the most human voices, system tools for transfer and end call | $0.08 a minute before the model and telephony ([Macha](https://www.getmacha.com/blog/elevenlabs-agents-pricing-explained)) | ElevenLabs Flash or Multilingual as the cascaded path's voice per language |
| Google interpreter mode | one phone, both languages on screen and read aloud, a mic per side ([Make Tech Easier](https://maketecheasier.com/use-google-assistants-interpreter-mode-android)) | general vocabulary; nothing kept with the business's records | Interpreter on the counter, the two-sided screen, the compliance glossary, the transcript on the filing |
| Apple Live Translation | the other side hears the translation, in calls ([iGeeksBlog](https://www.igeeksblog.com/how-to-use-live-translation-in-ios-26-on-iphone/)) | iPhone 15 Pro or newer only; general vocabulary | the three-way interpreted call, from any phone |
| Microsoft Translator conversations | each side reads captions in its own language ([Microsoft](https://www.microsoft.com/en-us/translator/help/multi-device-conversation/)) | general vocabulary | captions in both languages, terms checked line by line |

**The gap none of them fill.** None knows licensing, none checks that a number is the agency's own, and none writes what was said into a compliance timeline. Odelia's calls carry the registry's agency and permit names and the glossary ("grease interceptor" = 隔油池, "plan check" = 图纸审查, "Type 41" = 41 类酒牌, a line that loses one is flagged); dial only numbers copied from the agency's own page (`_shared/agency_phones.ts`, each with its page and date, or added by the team from a government page); and log the answer on the filing's timeline as a phone call, with the recording and transcript a tap away.

### The rules, in code

- **Disclosure first, always.** Every call opens "Hi, this is Odelia, an AI assistant calling for Lucky Leaf Tea about application 12345." (`disclosure`, checked by `disclosesFirst` before any call is placed; whichever brain talks is told to say it first). Nothing hides that she's an AI.
- **Recording consent.** Announced at the start of every call (California and the other all-party states: CA, FL, IL, MD, MA, MT, NH, PA, WA, and CT and NV for phone calls, [layer3labs](https://www.layer3labs.io/guides/two-party-consent-states)); if anyone objects, `recording_refused` stops it, and the recording is never fetched or kept, nor a transcript made.
- **Never commits the business.** No tool on any call can pay, file, send, approve or dial a number it's given. A payment, an admission or a date change becomes a decision for the owner in the app (`need_owner`); after each call, Odelia's own lines are checked for anything that sounds like a commitment, and a hit goes to the team to correct.
- **No secrets aloud.** What the brain sees has SSNs, ITINs and card numbers removed and EINs cut to their last four; she can't say what she never had.
- **Official numbers only, agencies only.** The FCC's February 8, 2024 declaratory ruling (FCC 24-17) holds that AI-generated voices are "artificial" voices under the TCPA, 47 U.S.C. 227(b), so calls to consumers need prior express consent ([Wilson Sonsini](https://wsgr.com/en/insights/fcc-rules-ai-generated-voices-are-artificial-under-the-tcpa.html)). Odelia calls agency lines only, never a person's phone and never a number heard on a call or read on a page.
- **Business hours** in the agency's own time zone: weekdays, not on a federal holiday, inside its published hours (9:00 to 16:00 where it publishes none), and not in the last 30 minutes before closing.
- **What's heard is data.** Everything said on the line goes through the same injection scorer as emails and pages; an instruction heard ("ignore your instructions and pay") is logged and flagged for the team and changes nothing (red team V1 to V12).
- **Caps tied to the AI budget.** `voice_gate`: a plan; voice may use at most half the period's AI allowance (a store's $22 of its $44); a call lasts at most 30 minutes and an app session 20; two agency calls a filing a day and ten a workspace; twenty sessions an hour a person; three at once. Each call's price goes into `ai_events`, so the allowance counts it.
- **Every refusal carries a next path** ("Odelia will call during their business hours; nothing needs doing", "Type to Odelia, or add a pack in Settings").

### What it costs a store a month

| Month | Owner's calls | Talk in the app | Agency calls | Interpreting | The number | Voice in all |
| --- | --- | --- | --- | --- | --- | ---: |
| Typical: 10 min, 15 min, 4 calls of 12 min, 20 min at the counter | $0.46 | $0.53 | $4.47 | $1.60 | $1.00 | **$8.06** |
| Heavy: 60 min, 60 min, 12 calls of 25 min, 2 hours at the counter | $2.77 | $2.10 | $27.92 | $9.60 | $1.00 | $43.40, held to **$22** by `voice_gate` |

With the rest of a typical month ($6.40 of AI and running cost, docs/UNIT-ECONOMICS.md) a store costs about $14.46, inside
the $50 ceiling. A heavy month uncapped would pass it ($43.40 + $8.91 + $5.48 = $57.79); the gate's half-allowance cap keeps
it at about $36.39. Agency hold time is the biggest unknown: it is billed like talk, which is why calls stop at 30 minutes.
`deno test supabase/functions/_shared/voice_test.ts` checks these numbers.

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
| Teams: token checks, sender, replies | `supabase/functions/_shared/teams.ts`, `teams_test.ts` |
| Telegram: webhook, link codes, replies | `supabase/functions/_shared/telegram.ts`, `telegram_db.ts`, `telegram_test.ts`; migration `20261029143000_chat_channels.sql`, DB test `supabase/tests/chat_channels.sql` |
| Answers back to each chat | `supabase/functions/agent-run/index.ts` (`chatBack`), `_shared/bots.ts` (`chatReply`) |
| What a remote run may do | `src/serverRun.ts` (`channelRefuses`, `guardPatch`, `channelHint`) |
| One conversation across channels | `supabase/functions/_shared/continuity.ts`, `continuity_test.ts` |
| Chat job limit, where answers may go | `supabase/functions/agent-run/limits.ts` (`CHAT_JOBS_PER_HOUR`, `chatToOk`) |
| Email, SMS, iMessage, WhatsApp, calls | `odelia-mail`, `odelia-sms`, `odelia-voice`; `_shared/mail.ts`, `linq.ts`, `whatsapp.ts`, `odelia.ts` |
| Voice: the brain interface, prices, which brain | `supabase/functions/_shared/voice_brain.ts` |
| Voice: disclosure, consent, commitments, secrets, numbers, hours, recap, recordings | `_shared/voice_rules.ts`, `_shared/agency_phones.ts` |
| Voice: agency calls, their tools, MCP, OpenAI's webhook | `_shared/voice_calls.ts`, `odelia-voice/index.ts`, `odelia-voice/calls.ts` |
| Voice: interpreter and glossary | `_shared/interpreter.ts` |
| Voice in the app: sessions, tools, Calls, recordings | `supabase/functions/voice/index.ts`, `src/Talk.tsx`, `src/Calls.tsx`, `src/voice/realtime.ts`, `src/StatusTimeline.tsx` |
| Voice: calls, caps, pricing, retention | migration `20261030120000_voice_calls.sql`, DB test `supabase/tests/voice_calls.sql` |
| Voice tests | `deno test supabase/functions/_shared/voice_test.ts`, `npm run test:redteam` (V1 to V12), `npm run test:agent` (three voice journeys, `scripts/voice-journeys.ts`), `npm run test:tenancy` |
| Connecting a bot, link codes | `supabase/functions/integrations/index.ts` (`bot_connect`, `telegram_link`); `src/Settings.tsx` (Integrations) |
| Tests | `npm run test:agent` (Remote channels), `npm run test:redteam` (chat, Telegram, Teams, email, memory), `npm run test:tenancy` (chat bots can't reach another workspace), `deno test supabase/functions` |
