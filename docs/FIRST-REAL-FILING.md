# The first real filing: a supervised run on a live agency site

Everything up to this point is proven on copies (worker/filer/test/dryrun.test.ts, nightly in
.github/workflows/filer-dryrun.yml). This is the step that proves it on the real thing. Two things only a person can do
are marked **Founder**; everything else Claude or Odelia does.

## Before

1. **Founder:** on Render, filing service, Environment: set `FILER_DRY_RUN=1` and save (it redeploys). In this mode the
   worker fills every page and stops at the agency's final submit button (worker/filer/src/run.ts, the final-submit
   guard), with a screenshot of the review page.
2. **Founder:** pick one real business and one form with no fee and an online portal (best first choice: a California
   employer registration on edd.ca.gov, or the City of San José business tax certificate). Sign in to the agency's portal
   yourself in the worker's live view when it asks; Placetta never types a password it wasn't given in the vault.
3. Claude: confirm the worker is awake (`filer_status.seen_at` within 10 minutes) and its self-check passes
   (`cd worker/filer && npm run check` in Render's Shell tab).

## The run

4. In the app, the owner asks Odelia to file that form and approves the card. The first 10 filings of every form stop
   at the agency's review page for the Placetta team's check anyway (FILER_TWO_KEY); in dry-run mode nothing is sent.
5. Claude watches the live view and the run's log (filer_runs, filing_events) and checks each page against the approved
   answers.

## After

6. Claude writes up the run: pages, time, every hand-back to a person, the review-page screenshot, what differed from
   the playbook. A difference becomes a playbook fix and a rule in docs/LESSONS.md.
7. **Founder:** to send it for real, unset `FILER_DRY_RUN` and approve again. The confirmation number and receipt PDF land
   in the app.

Pass bar: every page filled with no human edit, the review page matching the approved answers line for line, nothing
sent in dry-run mode.
