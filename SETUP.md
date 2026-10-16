# Launch checklist

Placetta runs on the Supabase project **Placetta** (`esquxzcfsylffuijvzec`). The database, security rules and server functions are built and tested; going live means bringing the project up to date, adding your keys, configuring sign-in and hosting the app. One command does nearly all of it.

## Go live: the four things only the owner can do

Everything else is built and deployed. These need your accounts, so no one else can do them for you.

1. **Odelia's model key.** console.anthropic.com, API keys, create a key. Then Supabase, Edge Functions, Secrets
   (https://supabase.com/dashboard/project/esquxzcfsylffuijvzec/functions/secrets): add `ANTHROPIC_API_KEY`. Odelia
   answers on the web, by text and by phone as soon as it's saved. `npm run selftest` checks it.
2. **Payments.** Stripe, Developers, API keys: copy the live secret key. Add it in the same Secrets page as
   `STRIPE_SECRET_KEY`. Nothing else: the billing function makes every price (by lookup key) and the webhook (its
   signing secret goes to `stripe_config`) the first time it runs. Then switch payments on:
   `update public.app_settings set payments_on = true;` (until then everyone has early access, free).
3. **The portal worker.** Render, New, Blueprint, this repo (`render.yaml`). Paste the service role key and the
   Anthropic key when it asks. Then add `FILER_ENABLED=1` and `FILER_CHANNELS=email,fax,mail,portal` to the
   Supabase secrets so filings queue for it.
4. **Texts and calls.** iMessage first: start Linq's trial (linqapp.com) and run `npm run launch`; texts work the
   same day, no carrier registration. Telnyx for calls and as the SMS fallback: buy a number and register the 10DLC
   brand and campaign (it needs your EIN and takes a few days). See "Odelia on iMessage (Linq)" and "Text and call
   Odelia (Telnyx)" below.

## The fast way: one command

Unzip `placetta-source.zip`, then in that folder:

```bash
npm install
npm run launch
```

It asks for (typing is hidden, nothing is saved):

| It asks for | Where to get it |
| --- | --- |
| Supabase access token | supabase.com/dashboard/account/tokens |
| App address | Your domain, e.g. `https://app.placetta.com`, or let it deploy to Netlify and use that address |
| Anthropic API key | console.anthropic.com. Turn on web search for the org there too. |
| Azure Speech key and region | Azure portal, Speech service, free tier F0 |
| Stripe secret key | dashboard.stripe.com. Use `sk_test_` first, `sk_live_` when the test filing works. |
| Resend API key and sender | resend.com: add your domain, create a key. Sign-in emails need it. |
| Google and Microsoft sign-in (optional) | See "Sign in with Google or Microsoft" below |
| Telnyx, for texting and calling Odelia (optional) | See "Text and call Odelia" below. It can create the AI Assistant for you. |
| Linq, for Odelia on iMessage (optional) | See "Odelia on iMessage (Linq)" below. It subscribes the webhook and can forward calls for you. |
| Your team's emails | Whoever works the filing queue |

Then it:

1. Brings the database up to date (teams, roles, two-step sign-in, security fixes, production indexes).
2. Deploys every server function, including the new `team` function for invites.
3. Creates the Stripe prices and webhook.
4. Sets every server secret.
5. Sets sign-in: your app address and redirect URLs, the email sender, branded code emails, Google and Microsoft, two-step sign-in.
6. Builds the app and offers to deploy it to Netlify.
7. Adds your team and checks every function.

Left for you after that: turn on the Stripe customer portal, and have each teammate sign in and turn on two-step sign-in (Settings, Security). The filing queue stays locked until they do.

## Accounts and security, as shipped

- **Sign-in**: email code or link, Google, or Microsoft. Each provider button shows only when it's turned on.
- **Two-step sign-in**: any user can turn it on with an authenticator app. Once on, the account reaches nothing until the code is entered. The Placetta team must use it: the queue, customer records and saved logins require it, in the database and in every server function.
- **Teams**: owners invite people by email as owners or members. Invites are accepted when that email signs in.
  - Owners: approve filings and payments, billing, integrations, saved logins, the team.
  - Members: logs, documents, the agent.
  - A workspace always keeps at least one owner. Every team change is in the audit trail.
- **Sessions**: sign out here or everywhere (Settings, Security).
- **Hosting headers** (`vercel.json`): a strict Content Security Policy for the app (scripts only from the app, data only to Supabase), a separate one for the website, no framing, HSTS, and long caching for hashed assets.

## Sign in with Google or Microsoft

Both use one redirect address: `https://esquxzcfsylffuijvzec.supabase.co/auth/v1/callback`

- **Google**: Google Cloud console, APIs and Services, Credentials, Create OAuth client ID, type Web application. Add the redirect address above. Copy the client ID and secret into the launcher. Publish the consent screen (basic profile and email scopes need no review).
- **Microsoft**: Entra ID, App registrations, New registration, "Accounts in any organizational directory and personal Microsoft accounts". Add the redirect address as a Web platform redirect URI. Create a client secret. Copy the application ID and secret into the launcher.

Microsoft can send email addresses it hasn't verified, so an account that only ever signed in with Microsoft never claims an invite or team access by email. Invited people and the Placetta team sign in with an email code or Google the first time.

These are separate from the Gmail, Outlook and Drive integrations below, which use their own apps and scopes.

## By hand, if you'd rather

1. **Database**: in the SQL editor, run any file in `supabase/migrations` the project doesn't have yet (they're safe to run twice). To check them locally first: `scripts/test-db.sh` against any Postgres 15+.
2. **Functions**: `SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy --project-ref esquxzcfsylffuijvzec --use-api`.
3. **Secrets**: the table below, in Edge Functions, Secrets.
4. **Sign-in**:
   - Authentication, URL Configuration: Site URL and Redirect URLs set to your app address.
   - SMTP Settings: your email sender. Without it, sign-in emails only reach your Supabase team.
   - Email Templates: add `{{ .Token }}` to the Magic Link template.
   - Providers: Google and Azure (Microsoft).
5. **Team**: `insert into public.staff_emails (email) values ('you@placetta.com');`
6. **Hosting**: drag the unzipped `placetta-app.zip` folder onto app.netlify.com/drop, or connect the repo to Vercel or Netlify with the settings below.
   - `VITE_SUPABASE_URL=https://esquxzcfsylffuijvzec.supabase.co`
   - `VITE_SUPABASE_KEY=sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p`
   - Build `npm run build`, output `dist`.

| Secret | What it is |
| --- | --- |
| `ANTHROPIC_API_KEY` | Runs the agent. |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | The voice. Free tier F0 covers 500,000 characters a month. |
| `STRIPE_SECRET_KEY` | Stripe secret key. |
| `STRIPE_PRICE_ENTRY` | One-time price, $299. Quantity is the number of markets. |
| `STRIPE_PRICE_STARTER` | Recurring yearly, $9,000 ($750 a month billed annually). |
| `STRIPE_PRICE_GROWTH` | Recurring yearly, $24,000 ($2,000 a month billed annually). |
| `STRIPE_PRICE_EXTRA_LOCATION` | Optional. Recurring yearly, $1,200 ($100 a month). |
| `STRIPE_WEBHOOK_SECRET` | From the webhook: `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/stripe-webhook`, events `checkout.session.completed` and `customer.subscription.created/updated/deleted`. |
| `APP_ORIGINS` | Your app address. Checkout, invites and integrations only return there. |
| `OAUTH_STATE_SECRET` | Any long random string. |
| `AGENT_DAILY_CALLS`, `TTS_DAILY_CHARS` | Optional caps per workspace a day. Defaults 400 and 20,000. |
| `AGENT_MODEL`, `AGENT_MODEL_DEEP` | Optional. Defaults `claude-sonnet-5-5` and `claude-opus-5-5`. |
| `AGENT_MODEL_PHONE` | Optional. The model for texts and calls; defaults to `AGENT_MODEL`. Set a faster one (e.g. `claude-haiku-4-5-20251001`) if text replies feel slow. |
| `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` | Telnyx API key, and the public key that signs its webhooks. Already used for fax; also texting and calling Odelia. |
| `ODELIA_NUMBER` | Odelia's number in Telnyx, E.164 (`+14155550134`). |
| `TELNYX_MESSAGING_PROFILE_ID` | The messaging profile the number is on. Without it (and the three above), Settings says texting isn't set up yet. |
| `TELNYX_VOICE_CONNECTION_ID`, `TELNYX_ASSISTANT_ID` | The Call Control application the number is on, and the Telnyx AI Assistant that talks. Without them, calls get a short apology and a text. |
| `ODELIA_VOICE_EN`, `ODELIA_VOICE_ZH`, `ODELIA_STT_MODEL`, `ODELIA_VOICE_MODEL` | Optional. Defaults `AWS.Polly.Joanna-Neural`, `AWS.Polly.Zhiyu-Neural`, `deepgram/nova-3`, and the assistant's own model. |

## Stripe

- The $299 entry credit toward the first year: create a promotion code. Checkout accepts codes.
- Turn on the customer portal so people can change cards and download invoices.
- Scale ($5,000+) is sold by email; give that workspace access with `update billing set comped = true where workspace_id = '...'`.

## Integrations (only the ones you want live)

Every provider uses one redirect address: `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/oauth-callback`

| Provider | Secrets | Note |
| --- | --- | --- |
| Google (Gmail, Calendar, Drive) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail read and Drive read are restricted scopes: Google verification plus a CASA security assessment before the public can connect. Calendar needs standard verification. Up to 100 test users work before that. |
| Microsoft (Outlook Mail, Calendar) | `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT=common` | Register in Entra ID; publisher verification recommended. |
| Dropbox | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | Enable `files.metadata.read` and `files.content.read`. |
| QuickBooks | `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_ENV=production` | Intuit app review before production keys. |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Incoming webhook only. |

The calendar feed needs nothing. Square and Toast show as "Request" until a partner integration exists.

## Text and call Odelia (Telnyx)

Owners link their phone in Settings, Text and call Odelia (a 6-digit code proves it's theirs), then text or call Odelia's number like a coworker. She answers from their workspace, starts work in the background and texts the result, and texts (or calls, if they opted in) first when something needs them: at most 3 texts and 1 call a day, never in their quiet hours (9pm to 8am theirs by default). Nothing is filed, paid, sent or deleted by text or voice: the text links to the exact approval in the app.

In Telnyx (portal.telnyx.com):

1. **Number**: buy a US number with SMS and voice. That's `ODELIA_NUMBER`.
2. **Messaging profile**: create one, inbound webhook `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-sms` (API v2), and put the number on it. Its ID is `TELNYX_MESSAGING_PROFILE_ID`. Optional: auto-responses for STOP, START and HELP on the profile (`/v2/messaging_profiles/{id}/autoresp_configs`); without them `odelia-sms` sends the replies itself.
3. **Carrier registration, before anything is delivered**: US carriers block application texts from unregistered numbers. For a local number, register a 10DLC brand and campaign (Messaging, 10DLC) and assign the number to the campaign; for a toll-free number, complete toll-free verification. Describe the use case as account notifications and customer care, and the opt-in as: the account holder enters their number in Settings and confirms a texted code; STOP opts out, HELP gets help. Approval takes days to a few weeks.
4. **Calls**: create a Call Control application (Voice, Programmable Voice) with webhook `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-voice` (API v2) and an outbound voice profile that allows the US, and put the number on it. Its ID is `TELNYX_VOICE_CONNECTION_ID`.
5. **AI Assistant**: the launcher creates one named Odelia if you leave its ID blank (or create it under AI, Assistants). Each call sends its own instructions, greeting, voice, speech recognition and tools, so it needs nothing else. Its ID is `TELNYX_ASSISTANT_ID`.
6. **Public key**: Account, Keys and credentials, Public key. That's `TELNYX_PUBLIC_KEY` (already set if fax is on).

Then run the migration (`20261013000000_odelia_phone.sql`) and deploy `odelia-sms` and `odelia-voice` (the launcher does both). A pg_cron job sends the outbox every 10 minutes while anything is waiting.

How it stays safe: Telnyx webhooks are checked against the public key and refused if older than five minutes. A number is linked to one person only, and linking needs the settings PIN when it's on. Texts start the agent as that person, with the same member and plan checks as the app, and answers only ever go to the verified number. A call whose caller ID isn't fully attested (STIR/SHAKEN "A") gets a 4-digit code texted to the number on file, and Odelia says nothing about the account until the caller says it.

## Odelia on iMessage (Linq)

Linq (linqapp.com) gives Odelia real iMessage lines, the provider Poke, Lindy and Instinct use. Messages go as blue bubbles to iPhones and fall back to RCS or SMS for Android, and none of it waits on 10DLC. Plans: free for up to 20 contacts (enough to test), Pro from $260 a month with a 7-day trial, zero data retention and SOC 2. Don't turn zero data retention on for Odelia's lines: Linq then leaves the words out of the webhook, and Odelia has nothing to read.

1. Start the trial and add one or more iMessage lines in Linq's dashboard. Create an API key.
2. `npm run launch` asks for the key, lists the lines, subscribes `odelia-sms` to `message.received` (Linq shows the signing secret once; it goes straight to `LINQ_WEBHOOK_SECRET`), sets `LINQ_API_KEY` and `LINQ_NUMBERS`, and can forward each line's calls to `ODELIA_NUMBER` (`LINQ_FORWARDS_CALLS=1`) so people save one number. By hand: webhook `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-sms?version=2026-02-03`, event `message.received`.
3. Run the migration `20261016060000_odelia_imessage.sql` and deploy `odelia-sms`, `odelia-voice` and `agent-run`.

With Linq set, every text goes by iMessage (codes, answers, updates); Telnyx keeps calls and is the fallback when no line can send. Settings shows each person their own line.

How the lines stay healthy (Apple banned Lindy's self-run iMessage account after 10,000 messages in 12 hours, so these are its lessons):

- People spread across lines (`LINQ_NUMBERS` can list several), and each keeps theirs, so it stays one conversation.
- Odelia only opens a conversation with the verification code, at most 25 new ones a line a day; everything else is a reply or an update to someone who has already written.
- Linq's line reputation is read every 10 minutes into `odelia_lines`. On CRITICAL, updates move to a healthy line (replies still go back on the line they wrote to); the team gets a `line_health` task when a line slips. A line Linq restricts (2027) is skipped for the next one at once.
- `select * from odelia_line_traffic(7)` shows sent against received per line. Mostly-sent, rarely-answered is the pattern that gets a line flagged.
- STOP: Linq blocks the person on every line; Odelia sends the one confirmation (`override_optout`) and nothing else until START.

Webhooks are checked against the signing secret (Standard Webhooks, five minutes either way) and deduplicated on Linq's message id. Group chats, our own echoes, late recoveries and other lines on the account are ignored.

## Odelia on WhatsApp (Meta Cloud API)

Owners who live on WhatsApp text Odelia there and hear back there. It's Meta's own Cloud API, with no reseller in between: since October 1, 2026 the first 1,000 replies a month per number are free, then about $0.0034 each in the US; updates outside the 24-hour window go out as one utility template at about $0.0034. Meta doesn't deliver marketing templates to US numbers at all, so Odelia's template is utility only: account notices, never promotion. Meta's January 2026 rule bars general-purpose AI assistants; Odelia is a business's own service for its own customers, which Meta says the rule doesn't touch. Keep her on compliance.

1. Meta for Developers: create an app, add WhatsApp, add the business phone number, and make a System User with a permanent token (`whatsapp_business_messaging`, `whatsapp_business_management`).
2. `npm run launch` asks for the token, phone number ID, WhatsApp Business Account ID, app secret and number; submits the `odelia_update` template in English and Chinese for review; subscribes the app; and prints the webhook to paste in the app's WhatsApp configuration: `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-sms`, with its verify token, field `messages`.
3. Run `20261016090000_odelia_whatsapp.sql` and deploy `odelia-sms`, `odelia-voice` and `agent-run`.
4. Business verification is optional to start (250 people a day outside the window until it's done).

How it behaves: a linked phone that writes on WhatsApp is answered on WhatsApp, in one message, with the typing indicator; texting by iMessage or SMS again moves the conversation back. Photos and PDFs come in through Meta's media links. Webhooks are checked with the app secret (X-Hub-Signature-256) and deduplicated, since Meta retries for a week. Linking works the same way: the code from Settings, sent on WhatsApp.

## Email Odelia (Postmark or Resend)

Owners write to Odelia, or forward an agency's letter, from the address they sign in with; she answers in the same thread and saves attached photos and PDFs in Documents. Postmark is the better way in ($16.50 a month on Pro for 10,000 emails, inbound included, and it strips the quoted reply). Resend is the free one (3,000 a month, counting both ways) and already sends sign-in mail. Both feed `odelia-mail`; replies go out through Postmark when its token is set, else Resend.

1. Pick the address (for example `odelia@placetta.com`) on a domain whose MX points at the provider: `inbound.postmarkapp.com` for Postmark, or turn on receiving for the domain in Resend.
2. `npm run launch` sets `ODELIA_EMAIL`, then either points Postmark's inbound webhook at `odelia-mail` with a random password in the URL (`POSTMARK_SERVER_TOKEN`, `POSTMARK_INBOUND_AUTH`), or creates Resend's signed `email.received` webhook (`RESEND_WEBHOOK_SECRET`).
3. Run `20261016100000_odelia_email.sql` and deploy `odelia-mail` and `agent-run`.

Email's From line can be forged, and so can any header the sender writes (Authentication-Results, ARC, X-Spam-Tests), so Odelia trusts only what the receiving provider itself establishes. With Resend, that's the `authentication` result Resend's own servers attach (DMARC pass, or DKIM pass for the From domain). With Postmark, `odelia-mail` verifies the DKIM signature on the raw message itself, so the inbound server must have **Include raw email content in JSON payload** on (`RawEmailEnabled`, which `npm run launch` sets); without it every email is treated as unverified. A signature counts only from the From address's own domain or a parent of it (Gmail, Outlook and Google Workspace with DKIM set up all qualify). Anything else gets one note a day saying it couldn't be verified, and nothing is done. Mail from addresses with no account gets nothing back, and auto-replies, bounces and lists are dropped.

## Which provider for what (checked October 2026)

| Channel | Use | Free way in | Why |
| --- | --- | --- | --- |
| iMessage | Linq, Pro from $260 a month | Linq Hobby, free for 20 contacts (they text first, which is how linking works) | What Poke, Lindy and Instinct run on; signed webhooks, SOC 2, line health. Sendblue ($100 a line) only answers people who wrote first and its webhooks aren't signed. |
| Plain texts (SMS) | Telnyx, $0.004 a text | none for real traffic | Half Twilio's price; Twilio's API answers faster but at our volume the gap is about $10 a month. Codes go here. |
| Calls | Telnyx AI Assistants, about $0.06 a minute | Telnyx's $25 trial credit | Cheapest managed option and the lowest measured caller-side latency; HIPAA on every plan. Mandarin calls use Soniox and Qwen3 voices (Deepgram Flux has no Chinese). |
| WhatsApp | Meta Cloud API, direct | 1,000 replies a month per number | No reseller fee; Twilio adds $0.005 a message. |
| Email | Postmark Pro, $16.50 a month | Resend, 3,000 a month | Postmark parses replies cleanly and includes inbound; Resend is free and already sends sign-in mail. Both are wired. |
| WeChat | not built | none | Needs an overseas Service Account (about $99 a year, Tencent's verification), replies only within 48 hours and 5 messages, and AI content rules. |
| Telegram | not built | free | Blocked in mainland China and rare among these owners. |

## Before the first paying customer

- A lawyer reviews Terms, Privacy, Filing Authorization and the AI disclosure (`legal/`), and the rules for permit expediters in each city you file in (NYC Buildings, for example, requires a registered filing representative).
- Run one full filing in Stripe test mode:
  - Sign up and invite a teammate.
  - Buy the entry plan and ask the agent.
  - Approve a filing as an owner, then work it in the queue with two-step on.
  - Send a payment link, mark it submitted and upload the receipt.
- Switch Stripe to live keys.
- Don't add SOC 2 or similar badges until you have the report.

## How a filing flows

1. The customer asks the agent. It researches the agency's own pages, fills the application and asks for approval.
2. An owner approves. A filing request lands in the team's queue with the exact fields and files.
3. The team checks it against the agency's current requirements, submits it on the agency site and records the confirmation number.
4. If there's a government fee, the team sends the agency's payment link. The customer pays the agency directly.
5. The team uploads the receipt or approval. It appears in the customer's documents and audit trail.

Nothing is filed, paid or sent without an owner's approval, and every step is written to an append-only audit trail.
