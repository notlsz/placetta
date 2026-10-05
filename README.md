# Placetta

Licenses, permits and daily compliance for restaurant and retail chains. The agent researches what each store needs on the agencies' own sites, fills the applications and asks for approval; the Placetta team files them; the customer pays agency fees directly by link. Every store gets an inspection-readiness score and the three numbers that show the value: opened on time, stayed open, no fines.

Two builds come from this repo:

- **The app** (`npm run build` with the Supabase settings): accounts, saved workspaces, billing, the filing queue, integrations. See **SETUP.md** for the launch checklist.
- **The demo** (`npm run build:single` without them): one HTML file with a sample workspace, recorded voice replies and the agent running on the viewer's Claude account or an API key.

## What's in it

- **Overview**: "Here's where your 10 applications stand." Status counts, the approvals waiting for you, the applications that matter most, what's coming up, notes from the agent, what it knows about the business, and what it's running in the background.
- **Applications**: every license from the city up to the federal government, with status, fee, usual processing time and next step. Open one to see:
  - **Checklist**: the documents it needs. Upload one (or use a sample) and the agent reads it and fills the application from it, showing what it pulled out.
  - **Application**: the filled form, exactly as it will be entered on the agency's site. You can edit it.
  - **Fees**: the breakdown, how long the agency usually takes, renewals and the agency's own page.
  - **Receipt**: the receipt once it's filed.
- **Documents**: everything you uploaded, everything the agent prepared and everything the agencies sent back, as file cards with size and download.
- **Deadlines**: due dates, renewals and agency processing estimates, with the action that handles each one.
- **Audit trail**: every action by the agent, by you and by the agencies, timestamped. Export it as CSV.
- **Context**: the facts the agent fills applications from. Edit one and it's committed to memory for the next filing.
- **Find licenses**: say what the business does and where; get the licenses it needs, with fees, timelines and links to each agency.
- **Stores**: an inspection-readiness score per store (permits 35, daily logs 25, staff certificates 20, schedules 10, mock inspection 10), the NYC letter grade, today's food-safety logs, certificates with expiry reminders, NYC Fair Workweek schedule checks (chains with 30 or more locations nationally post 14 days ahead) and a mock inspection with how to fix each miss. Stores still opening are scored on their license progress.
- **Filing queue** (team only): every filing a customer approved, grouped New, Working, Waiting on the customer, With the agency and Done. Saved agency logins (each reveal is logged), the approved fields with copy buttons, attachments, the requirements check, the payment link, the confirmation number and the receipt upload.
- **Settings**: account, plan and billing, integrations (Gmail, Outlook, Google and Outlook calendars, a calendar feed, Google Drive, Dropbox, QuickBooks, Slack; Square and Toast on request), the agency-login vault, approvals, agent and voice, language, data controls, help and legal.

### The approval rule

The agent prepares on its own but never files, pays or sends a message without you. Every submission opens an approval that shows what the agent will do step by step, the exact data it will submit, the attachments and the fee, with **Approve & file** and **Edit first**. Your answer goes in the audit trail.

## The agent

- **Live in the shared Claude link.** The agent is Claude, on the viewer's own Claude account through the artifact's `sample` capability; the first message asks them to allow it. It reads the workspace and acts through page tools: add an application, fill its fields, change its status, ask for approval to file, draft a message for approval, add a deadline, remember a fact, and list licenses. Find licenses asks Claude for the list for any business and place, and uploaded images and text files are read for real.
- **Live anywhere else with an API key.** Open Settings, paste an Anthropic API key and pick a model. The key stays in the browser and goes only to `api.anthropic.com`.
- **Demo script otherwise.** With neither, the scripted demo answers, so the product can still be walked through.
- **In the demo** it can't browse, so requirements and fees come from the model's knowledge and are labelled estimates, and approving a filing simulates it.
- **In the app** the agent runs on the server with web search and web fetch, researches the issuing agency's own pages and cites them. Approving a filing sends it to the team's queue.
- **The rule.** Whatever the model decides, filing, paying and sending only happen after the person approves in the app.

## Effects from Libraries.dev

- **Bot avatars** (`bot-avatars`): the agent is an original plush light-blue cloud (`src/Bot.tsx`) that looks around while it waits and hops while it works; each background job has its own small bot.
- **Orb** (`thinking-orbs`): inline thinking states for each step the agent takes.
- **Voice** (`voice-glow`): the glow around the message box and along the bottom of voice mode.
- **Beam** (`border-beam`): rides the border of things in progress only: the live step list, the overview's live line, a file being read, a license search, and applications Placetta is preparing.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # the whole site in dist/: the website at /, the app at /app/
npm run build:single # the app as one self-contained HTML file in dist-single/
```

### One site: website and app

The website (`site/`: landing page, privacy and terms) and the app ship as one Vercel project on one domain, the way
Vanta runs vanta.com and its app. **Log in** in the website's header opens the app. **Get my plan** saves the request to
`public.plan_requests`, then (for email contacts) hands the answers to the app through localStorage on the same
origin: sign-in opens with the email filled in, onboarding with the business, market, what it sells and when, and the
agent starts mapping licenses as soon as the workspace exists. WeChat contacts get the team follow-up instead.
`vercel.json` gives each half its own Content Security Policy (the website has inline scripts; the app has none).

## Voice

- **Talking to it**: the microphone button opens voice mode. The VoiceBeam glow follows your voice, and in Chrome, Edge and Safari what you say is typed for you. The browser only allows the microphone on https, on localhost, or in a file you open from your own computer. Embedded previews (like a shared Claude link) block it; there, voice mode plays a simulated voice so the flow can still be seen.
- **It talking back**: replies to a voice message are read aloud, and every reply has a Listen button. The demo's replies are recorded ahead of time with a natural neural voice, tuned to sound like a young woman of about 21 (Kokoro, Apache-2.0: `af_heart` raised two semitones with formants kept, so it stays natural, in English; a 60/40 blend of `zf_xiaoxiao` and `zf_xiaoyi` in Chinese; both a touch quicker than default). The glow follows the real audio. Live replies use the browser's own voice, preferring young natural ones (Edge's Emma, Ava and Xiaoyi). For a live agent in production, send each reply to a text-to-speech API (ElevenLabs, OpenAI, or Azure neural voices such as `en-US-AvaMultilingualNeural` and `zh-CN-XiaoxiaoNeural`) and play the audio the same way; `useSpeak` in `src/hooks.ts` already handles playback and the glow.
- To re-record after changing the replies:

```bash
npx esbuild scripts/dump-replies.ts --bundle --platform=node --format=esm --outfile=/tmp/dump.mjs
node /tmp/dump.mjs > replies.json
python3 scripts/make-voices.py replies.json kokoro-v1.0.int8.onnx voices-v1.0.bin   # writes src/voices.generated.ts
```

## The backend (Supabase project Placetta)

| Piece | What it does |
| --- | --- |
| `supabase/migrations` | Workspaces, members, billing, filings, documents, the append-only audit trail, integrations, agency logins (passwords in Vault), row-level security on everything |
| `functions/agent` | Runs Claude with web search and web fetch, cites agency pages, checks the plan and a daily cap |
| `functions/tts` | Azure neural voice for replies |
| `functions/billing`, `functions/stripe-webhook` | Stripe Checkout and the customer portal; the webhook turns plans on and off |
| `functions/integrations`, `functions/oauth-callback`, `functions/calendar-feed` | Email, calendar, files, books and Slack, plus an ICS feed of deadlines |
| `functions/logins` | Saves agency logins to Vault (owners); only staff signed in with two-step can reveal one, and each reveal is audited |
| `functions/team` | Invites teammates by email; the invite is accepted when that email signs in |

Accounts: sign in with an email code, Google or Microsoft; optional two-step sign-in with an authenticator app (required for the Placetta team); owners and members per workspace. The database enforces all of it: someone with two-step on reaches nothing until they enter the code, only owners approve, pay, connect accounts and invite, and staff need two-step for any customer record.

Tests: `scripts/test-db.sh` applies every migration to a local Postgres and checks roles, invites and two-step as each kind of user.

The database enforces the approval rule: customers can only request a filing or cancel a request, a filing can't be marked submitted until the requirements are checked, and every change writes an audit row.

## Where things are

| File | What it does |
| --- | --- |
| `src/App.tsx` | Layout, workspace state, running the agent, downloads |
| `src/cloud/` | Sign-in, onboarding, the API client, plans and the filing queue |
| `src/Stores.tsx`, `src/stores.ts` | Stores, readiness score and the value numbers |
| `src/Settings.tsx`, `src/Legal.tsx`, `src/legal.ts` | Settings and the legal pages |
| `src/pages.tsx` | Overview, Applications, Documents, Deadlines, Audit trail, Context, Find licenses |
| `src/Drawer.tsx` | An application opened (checklist, filled form, fees, receipt) and the approval dialog |
| `src/AgentPanel.tsx` | The agent panel: live steps, replies with files, approvals and memories |
| `src/Composer.tsx` | The message box with the VoiceBeam glow, and voice mode |
| `src/live.ts` | The live agent: Claude through the viewer or the API, the workspace prompt and the page tools |
| `src/Bot.tsx` | The plush agent bot, the background-job bots and the in-progress beam |
| `src/agent.ts` | The agent contract, workspace patches and the scripted demo agent |
| `src/model.ts` | Workspace types and the sample workspace |
| `src/files.ts` | Receipts and filled applications as PDF, the audit trail as CSV, saving files |
| `src/hooks.ts` | Speech to text, reading replies aloud, the simulated voice |
| `src/i18n.ts`, `src/time.ts` | English and Chinese text, dates and money |
| `src/styles.css` | Tokens (white and light blue, one warm accent for what needs you) and all styles |

## Before launch

Run `npm run launch` (keys, Stripe prices and webhook, secrets, build, Netlify deploy, checks), then follow **SETUP.md** for the three dashboard steps. By hand: host the app, set the sign-in URLs and an email sender, add staff, add the secrets, create the Stripe prices and webhook, and have a lawyer review the legal pages. The sample workspace's fees and timelines are estimates for the demo. No compliance certification is claimed.
