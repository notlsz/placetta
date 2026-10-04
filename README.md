# Placetta Agent

The workspace for Placetta's licensing agent. You give it a goal ("open the San Jose shop by March"), and it maps every license from the city up to the federal government, files what it can on its own, watches agencies for decisions, and comes to you before it pays, signs or sends anything.

- **Agent**: talk or type to the agent. Each step it takes shows a small orb; answers can carry approval cards you act on in place.
- **Filings**: every license with its level (federal, state, county, city), status and next step. The ones on the path to opening day are flagged.
- **Needs you**: the approval queue. Paying fees, signing applications, uploading documents and messaging people always stop here first.
- **Activity**: what the agent is running in the background right now, and a log of every action by the agent, by you and by agencies.
- **Connections**: the agency accounts it files through, your vault (card, documents), and how much it may do on its own: prepare only, ask before submitting, or file on its own while still asking before paying or signing.

Two effects from Libraries.dev are wired in:

- **ThinkingOrb** (`thinking-orbs`): the 64px orb by the agent's name follows what it's doing; background tasks and running steps get 20px orbs.
- **VoiceBeam** (`voice-glow`): wraps the message box. Tap Talk and it follows your voice from the microphone; while the agent works it becomes a travelling beam; when the agent reads its answer aloud, the glow follows its speech.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
npm run build:single # one self-contained HTML file in dist-single/ (used for the shareable preview)
```

The microphone needs a secure context (https or localhost) and is started from the Talk button, as the browser requires. Where the browser has speech recognition (Chrome, Edge, Safari), what you say is typed into the message box.

## Where things are

| File | What it does |
| --- | --- |
| `src/App.tsx` | Layout, the four views (Agent, Filings, Activity, Settings), conversation state, orb states, voice mode |
| `src/agent.ts` | The agent contract (`AgentBackend`), case updates and the scripted demo agent |
| `src/model.ts` | The data the agent keeps per location (filings, running tasks, approvals, activity, connections) and the sample case |
| `src/ui.tsx` | Approval cards, level and status tags, icons |
| `src/i18n.ts` | English and Chinese interface text |
| `src/hooks.ts` | Speech-to-text, reading answers aloud, the simulated voice, the narrow-screen switch |
| `src/Logo.tsx` | The Placetta and 快哉 lockups, traced from the brand artwork |
| `src/styles.css` | Tokens (white and light blue) and all styles |

## Connecting the real agent

The app only needs a stream of events, so replacing the demo is one function:

```ts
export interface AgentBackend {
  run(req: { text: string } | { approve: string; files?: string[] }, ctx: { lang, autonomy, current: Case },
      onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>;
}
// AgentEvent = { type: "step", index, step: { state: OrbState, label: { en, zh } } }
//            | { type: "update", patch: (c: Case) => Case }   // a filing changes status, a log entry, a new approval
//            | { type: "reply", reply: { text, chain?, approvals? } }
```

Have your backend (the model plus its tools: rule lookup, agency portals, form filling) stream a `step` event each time it starts something, then a `reply`. Pick the orb `state` that matches the work:

| Agent is… | Orb state |
| --- | --- |
| looking up rules or statuses | `searching` |
| matching permits to agencies, checking dependencies | `connecting` |
| working out the filing order | `solving` |
| combining material from several sources | `weaving` |
| filling in a form | `shaping` |
| writing the answer | `composing` |
| anything else | `working` |
| idle / hearing the user | `breathing` / `listening` |

Every action that spends money, signs, sends a message or submits (when the autonomy setting says to ask) should come back as an approval first; the person's answer arrives as `{ approve: id }`.

## Notes on the two packages

- The installed `thinking-orbs` (0.3.2) takes `theme="light" | "dark" | "auto"` rather than a `dark` boolean, and accepts `color` to tint the dots. The app is white and light blue in every setting, so it pins `theme="light"` and tints the dots blue.
- `voice-glow` defaults to `theme="dark"`; the app passes `theme="light"` and blue `colors` and `bandColors` so the glow stays in the Placetta blues.
- Embedded previews (like the shared Claude link) can't use the microphone. There, Talk plays a simulated voice and "hears" a sample question, so the whole voice flow can still be seen. On your own https site or localhost the real microphone drives the glow.
- The sample case and the demo agent's answers are scripted examples, not legal advice. Check every rule against the issuing agency before relying on it.
