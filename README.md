# Placetta Agent

The workspace for Placetta's licensing agent. It opens on the state of your licenses, not on a chat box: every application with its status, what it costs, what's due, and what the agent needs from you. The agent waits in a glowing message box at the bottom of every page; ask it something and its panel opens beside the work, where you can watch each step it takes and the site it's using.

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
- **Settings**: the agency accounts the agent files through and the approval rules.

### The approval rule

The agent prepares on its own but never files, pays or sends a message without you. Every submission opens an approval that shows what the agent will do step by step, the exact data it will submit, the attachments and the fee, with **Approve & file** and **Edit first**. Your answer goes in the audit trail.

## The agent

- **Live in the shared Claude link.** The agent is Claude, on the viewer's own Claude account through the artifact's `sample` capability; the first message asks them to allow it. It reads the workspace and acts through page tools: add an application, fill its fields, change its status, ask for approval to file, draft a message for approval, add a deadline, remember a fact, and list licenses. Find licenses asks Claude for the list for any business and place, and uploaded images and text files are read for real.
- **Live anywhere else with an API key.** Open Settings, paste an Anthropic API key and pick a model. The key stays in the browser and goes only to `api.anthropic.com`.
- **Demo script otherwise.** With neither, the scripted demo answers, so the product can still be walked through.
- **What it can't do here.** It can't browse or reach agency portals, so requirements and fees come from the model's knowledge and are labelled estimates. Approving a filing in this sample workspace simulates it. For production, put the model and the portal integrations behind your own backend and keep the same events (`src/agent.ts`).
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
npm run build        # production build in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

## Voice

- **Talking to it**: the microphone button opens voice mode. The VoiceBeam glow follows your voice, and in Chrome, Edge and Safari what you say is typed for you. The browser only allows the microphone on https, on localhost, or in a file you open from your own computer. Embedded previews (like a shared Claude link) block it; there, voice mode plays a simulated voice so the flow can still be seen.
- **It talking back**: replies to a voice message are read aloud, and every reply has a Listen button. The demo's replies are recorded ahead of time with a natural neural voice (Kokoro, Apache-2.0: `af_heart` in English, `zf_xiaoxiao` in Chinese) and the glow follows the real audio. For a live agent, send each reply to a text-to-speech API (ElevenLabs, OpenAI, or Azure neural voices such as `en-US-AvaMultilingualNeural` and `zh-CN-XiaoxiaoNeural`) and play the audio the same way; `useSpeak` in `src/hooks.ts` already handles playback and the glow.
- To re-record after changing the replies:

```bash
npx esbuild scripts/dump-replies.ts --bundle --platform=node --format=esm --outfile=/tmp/dump.mjs
node /tmp/dump.mjs > replies.json
python3 scripts/make-voices.py replies.json kokoro-v1.0.int8.onnx voices-v1.0.bin   # writes src/voices.generated.ts
```

## Connecting the real agent

The app only needs a stream of events, so replacing the demo is one function in `src/agent.ts`:

```ts
export interface AgentBackend {
  run(req: Request, ctx: { lang, current: Workspace }, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>;
}
// Request    = { text } | { approve: approvalId } | { upload: { app, item, files } } | { match: { what, where } }
// AgentEvent = { type: "step", index, step: { state: OrbState, label: { en, zh }, tool?: "sanjoseca.gov" } }
//            | { type: "update", patch: (w: Workspace) => Workspace }
//            | { type: "reply", reply: { text, chain?, approvals?, apps?, files?, memory?, matches?, next? } }
```

Stream a `step` each time the model starts a tool call, naming the site in `tool` so the person can see where it is working. Anything that files, pays or sends must come back as an approval; the person's answer arrives as `{ approve: id }`. Pick the orb `state` that matches the work: `searching` (looking up rules or statuses), `connecting` (agency portals, dependencies), `solving` (ordering, checking), `weaving` (combining sources), `shaping` (filling a form), `composing` (writing), `working` (anything else).

## Where things are

| File | What it does |
| --- | --- |
| `src/App.tsx` | Layout, workspace state, running the agent, downloads |
| `src/pages.tsx` | Overview, Applications, Documents, Deadlines, Audit trail, Context, Find licenses, Settings |
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

- The sample workspace, its fees and its processing times are made up for the demo. Check every requirement against the issuing agency.
- The footer's data-handling note describes what the app enforces (approvals, the audit trail, cards kept in a vault). It makes no compliance certification claims. Add a SOC 2 or similar badge only once you have the report.
- Receipts and documents downloaded from the demo are stamped "sample" and are not filed with any agency.
