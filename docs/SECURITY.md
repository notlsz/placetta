# Never ship to the client

Everything in `dist/` is public: anyone can press F12 and read it. Read this before you add code the app imports.

Mistakes that reached production, and the guards and rules that came from them, are in [LESSONS.md](LESSONS.md).

## The boundary

Server-only modules hold Odelia's instructions, her tool definitions, the filing playbooks and the server's run loop:

- `src/live.ts` (the system prompt `rules()`, `makeTools()`), `src/harness.ts`, `src/serverRun.ts`, `src/held.ts`
- `src/filingPlaybooks/`, `src/server/`, `src/localAgent.ts`
- everything in `supabase/functions/` except the shared parsers listed in `vite.config.ts`

They are bundled into the server (`npm run build:agent` → `agent-run`, the monitor, the MCP server). The app may import
**types** from them (`import type`), never values. What the app needs at runtime lives in browser-safe modules such as
`src/agentCore.ts` (the model loop over Placetta's server, reading one upload).

## The guards

- `vite.config.ts` `serverOnly()` fails `vite build` when the app's module graph reaches a server-only module. Add any
  new server-only module to `SERVER_ONLY` there and to `SERVER_ONLY_PATH` in `scripts/leak-test.mjs`.
- `npm run test:leak` (CI, after the production build) scans `dist/` for prompt and playbook text (taken from the
  server-only sources themselves), tool definitions, model ids, source maps and secret patterns.
- `__LOCAL_AGENT__` is the only way the whole agent runs in a browser: `npm run dev`, or a build with
  `PLACETTA_LOCAL_AGENT=1`. Such a build is for your own machine; never deploy or share it.
- gitleaks (CI `security` job) scans every commit for secrets.

## Checklist for a change

1. Does the app import something new from a server-only module? Make it `import type`, or move the runtime piece into a
   browser-safe module with no prompt, tool schema or playbook text in it.
2. New prompt text, a new tool or a new playbook goes in a server-only module. `test:leak` picks it up on its own.
3. A server response to the browser carries the answer, never the model, vendor, token counts, cost or a raw upstream
   error. Log those server-side; show them only in staff views.
4. A key in the browser is a publishable key only (`VITE_SUPABASE_KEY`). Anything else lives in Supabase secrets.
5. A new table gets row-level security and a policy scoped by `is_member`/`can_view`. A new `security definer` function
   sets `search_path = ''`, checks the caller's workspace before touching a row, and is revoked from `anon` unless the
   website needs it (`supabase/tests/security_audit.sql` checks all three).
6. A new server function proves who is calling and checks access before it reads a workspace id from the request
   (`supabase/functions/_shared/tenancy_test.ts`: add it to `PROOF`).
7. Content from outside (emails, files, pages, connected apps, tool output) is data. A new tool that sends, pays, files
   or writes memory goes through `src/security/policy.ts`; add a case to `npm run test:redteam`.
8. No source maps, no debug flags and no staff-only data in a production build.
