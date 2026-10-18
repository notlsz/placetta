## What changes, and why

<!-- One or two sentences a reviewer can check the diff against. Link the issue, incident or risk if there is one. -->

## How it was tested

<!-- The commands you ran, or what you clicked through. CI runs the rest. -->

## Security checklist

Tick what applies; say why for anything left open. docs/soc2/policies/secure-development.md has the reasons.

- [ ] No secret, key, token or customer data in the diff, the tests or the screenshots. Secrets live in Supabase secrets, Render or Vercel settings.
- [ ] A new table has row-level security on, with policies, and grants only what it means to (new objects get no API grants by default).
- [ ] A new `security definer` function has `set search_path = ''` and is revoked from `public` and `anon` unless the browser needs it.
- [ ] A new or changed server function checks who is calling (session, signature or key) before it reads or writes, and its `verify_jwt` setting in `supabase/config.toml` is intended.
- [ ] Anything that files, pays, sends or deletes still waits for an owner's approval, and writes to the audit log.
- [ ] A new subprocessor or AI vendor is added to `site/trust.html` and `docs/soc2/policies/vendor-management.md`, and `vendorOk` in `supabase/functions/_shared/llm.ts` says what it may see.
- [ ] Personal data kept longer than before, or a new kind of it, is reflected in `legal/privacy.md` and `purge_expired()`.
- [ ] A migration is safe to run twice, and the database tests cover the rule it adds.
- [ ] Dependencies added or upgraded are needed, maintained, and pinned in the lockfile.
- [ ] The migration and the function deploy that go with this change are listed below, so they ship together.

## To ship it

<!-- Migrations to apply, functions to deploy, secrets or settings to change, in order. "Nothing" is an answer. -->
