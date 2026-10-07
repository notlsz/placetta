# The weekly growth run

What the scheduled growth task does every week, and the rules it keeps. The goal: more pages that answer what
people opening a business search for, each with just enough to be useful and a reason to get the plan for their
exact address. Run it in a Claude Code session on this repo.

## 1. Find what people ask
- Look for real questions from brands opening stores: Google "People also ask" and autocomplete, Reddit (r/smallbusiness,
  r/restaurateur, r/Entrepreneur), Quora, Zhihu and Xiaohongshu, agency FAQ pages, and the questions in
  `plan_requests` (Supabase) if you can read them.
- Prefer questions with buying intent: costs, timelines, "do I need", "how to get", a form number, a city.
- Skip anything already answered in `scripts/guides-answers.mts`.

## 2. Add up to 5 answers
- Add them to `scripts/guides-answers.mts` in English and Simplified Chinese.
- Every fact must come from a form already in `src/forms/registry.ts` or `src/forms/world.ts`, or from an official
  government page you opened this run. If you add a form, give it `checked: "page"` and the agency's own URLs.
- Short answer first, two to four sentences, no em dashes, no " · ", no invented numbers, no testimonials.

## 3. Add one or two cities where brands are expanding
- Check recent news for markets food, beverage and retail brands are entering (the monitor feed in `site/index.html`
  is a good start).
- Add the city to `CITIES` in `src/forms/world.ts` with `guide: true` only if you can add at least two local steps with
  official URLs you opened. Otherwise add it with `guide: false` so the national steps apply.

## 4. Build and check
```
npm run guides && npx tsc -b && npm run build
```
Then the site test (`sitetest.py`) if it's available, and open two new pages in a browser to check them.

## 5. Ship it for review
- Commit on a branch `growth/<date>` and open a pull request. Never push straight to main: a person reviews
  government facts before they go live.
- In the PR description: the questions added and where you found them, the cities added, and 10 outreach targets:
  sites that would link to these pages (chambers of commerce, franchise consultants, commercial brokers, restaurant
  supplier blogs, local business associations), each with its URL, the page to pitch and a one-line angle.
- Never send outreach emails, post on forums or create accounts. Draft; people send.

## 6. After the merge is deployed
```
node scripts/indexnow.mjs
```
