# Runbook: verify the portal playbooks with supervised first filings

| | |
| --- | --- |
| Who runs it | The founder or a staff member with two-step sign-in, beside a real customer filing (or Placetta's own test entity) |
| Time | About 45 minutes a portal, plus the agency's processing time |
| Cost | The agency's own fee for each real filing (paid by the customer on the agency's page, never by the filer) |
| Closes | The audit's topic 6 gap ("zero verified portal playbooks") |
| Status on 2026-10-22 | **Nothing verified.** All 9 playbooks in [worker/filer/src/playbooks.ts](../../../worker/filer/src/playbooks.ts) have `verified: null`, so the worker refuses them unless `FILER_ALLOW_UNVERIFIED=1` |

The playbooks were written from each portal's published guide because Placetta can't open the portals without real
accounts. They can only be verified by a person watching a real filing. Do the top six first, by registry forms
covered: Accela Citizen Access (4), My Health Department (4), SJPermits (3), BTExpress (3), Denver (3), bizfile
Online (3). Washington CCFS, Georgia eCorp and Virginia CIS follow when a customer needs them.

## Before the first one

1. Have a real filing waiting: an application the customer approved in the app, for a form on that portal, with every
   requirement checked. Never file a made-up application on a government portal.
2. Get the customer's portal account into the vault the usual way (the customer connects it in the app). Staff never
   type or see the password.
3. On Render, check `FILER_ENABLED=1`, then set `FILER_ALLOW_UNVERIFIED=1` on the filer worker **only for the
   session**, and note the time.
4. The filer's sandbox (`worker/filer/src/sandbox.ts`) only lets the browser go to the destination's allowlisted
   hosts. Open the portal's sign-in in your own browser first: if it sends you to another host (a state single
   sign-on page, a payment page), add that host to the destination's `alsoOn` list in `supabase/functions/file/destinations.ts`
   before the session, or the run stops there. A run also has a hard time limit; a portal that needs a long wait
   (an ID check, a callback) is handed back to you, which is expected.

## Each portal

1. In the staff queue, open the filing and choose the portal agent. The worker refuses nothing now, but a supervised
   first run always stops at the agency's review page, whatever the two-key count says.
2. Watch every step's screenshot in the queue. Stop it (Cancel in the queue) the moment a step does something the
   guide didn't say: a different page name, a button the guards don't know, a fee page that isn't flagged.
3. At the review page, compare every value with the approved payload, line by line. Only then press Approve in the
   queue for the final submit. If the portal asks for a payment, the person pays it on the agency's page.
4. Save the receipt. The worker records the real steps as a skill (`agent_skills`) and replays them from then on.
5. In `playbooks.ts`, set that playbook's `verified` to `{ on: "YYYY-MM-DD", by: "<who watched>", filing: "<filing id>" }`,
   fix any step that differed from the guide, run `cd worker/filer && node --experimental-strip-types --test test/replay.test.ts`,
   and open a pull request with the screenshots attached.

## After the session

1. Remove `FILER_ALLOW_UNVERIFIED` from the worker on Render. Verified playbooks no longer need it.
2. If a run had to be stopped, leave `verified: null`, file that one by hand from the staff queue, and write down the
   page where the guide and the portal differ.
