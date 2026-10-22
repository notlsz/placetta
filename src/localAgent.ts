/* The whole agent in this browser: Odelia's instructions, tools and playbooks (src/live.ts), driven by the viewer's own
   Claude or an API key the developer enters, and held changes made here (src/held.ts).

   For local development only. The app loads this file with import() behind __LOCAL_AGENT__ (vite.config.ts), which is
   false in every production build, so the bundler drops it and none of it ships: anyone could read it with F12.
   Customers' conversations run on Placetta's server (agent-run); visitors get the scripted sample (src/agent.ts).
   npm run test:leak fails the build if any of it is found in dist/. */
export { apiModel, API_MODELS, claudeModel, liveAgent } from "./live";
export { applyHeldHere } from "./held";
