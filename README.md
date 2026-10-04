# Placetta Agent

The chat screen for Placetta's compliance agent: people ask about permits and license applications, the agent works through the steps, and the permit plan on the right updates as it goes.

Two effects from Libraries.dev are wired in:

- **ThinkingOrb** (`thinking-orbs`) shows what the agent is doing. The 64px orb next to the agent's name follows the current step; each step in the running list gets a 20px orb, and turns into a check when it's done.
- **VoiceBeam** (`voice-glow`) wraps the message box. It reacts to the microphone while someone talks, and gathers into a travelling beam (`processing`) while the agent is working.

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
| `src/App.tsx` | Layout, conversation state, orb states, VoiceBeam and the microphone |
| `src/agent.ts` | The agent contract (`AgentBackend`), the sample case and the scripted demo agent |
| `src/i18n.ts` | English and Chinese interface text |
| `src/hooks.ts` | Theme detection, speech-to-text, the simulated voice, the narrow-screen switch |
| `src/Logo.tsx` | The Placetta and 快哉 lockups, traced from the brand artwork |
| `src/styles.css` | Tokens (light and dark) and all styles |

## Connecting the real agent

The UI only needs a stream of events, so replacing the demo is one function:

```ts
export interface AgentBackend {
  run(input: string, lang: "en" | "zh", onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>;
}
// AgentEvent = { type: "step", index, step: { state: OrbState, label: { en, zh } } }
//            | { type: "reply", reply: { text, chain?, followUp?, patch? } }
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

`patch` lets a reply update the permit plan (a status change, a note, flagging what sets the opening date).

## Notes on the two packages

- The installed `thinking-orbs` (0.3.2) takes `theme="light" | "dark" | "auto"` rather than a `dark` boolean, and accepts `color` to tint the dots. The app pins the theme and tints the orb navy (light) or pale blue (dark).
- `voice-glow` defaults to `theme="dark"`; the app passes the resolved theme so the glow reads on the light background too. Its colours are tuned toward the Placetta blues with `colors`.
- Embedded previews (like the shared Claude link) can't use the microphone. In that case the Talk button plays a simulated voice level and types a sample question, so the glow and the flow can still be seen. A real microphone is used everywhere else.
- The sample case and the demo agent's answers are scripted examples, not legal advice. Check every rule against the issuing agency before relying on it.
