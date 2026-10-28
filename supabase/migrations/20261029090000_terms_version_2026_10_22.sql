-- The Terms of Service, Privacy Policy, Filing Authorization and AI page of 2026-10-22 (src/legal.ts UPDATED): the store
-- plan pricing with the plans from before kept as they were, the open-by-date guarantee limited to those plans, what
-- Placetta may do for a business and when, appeals and the attorney packet, AI models and training, AI assistant
-- tokens (MCP), security and breach notice, subprocessors with where each is based, retention, and the California and
-- EEA disclosures. docs/LEGAL-CHANGES.md lists every change. COUNSEL REVIEW REQUIRED BEFORE THIS SHIPS.
--
-- Only the version changes. accept_terms refuses any other version, so everyone who accepted 2026-10-13 is asked to
-- review and accept again in the app (terms_status), and the Terms' 30-day notice applies to them. Nothing else here.
-- Safe to run twice: create or replace keeps the existing grants.
create or replace function public.current_terms_version() returns text
language sql immutable set search_path = '' as $$ select '2026-10-22'::text $$;
