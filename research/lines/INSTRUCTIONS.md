# Map official government forms, line by line

You are researching official US government permit/registration forms for Placetta, a compliance product whose AI agent
fills these forms for restaurant and retail businesses. Your output feeds a forms library: wrong data means a wrong
filing for a real business, so **accuracy beats coverage. Never invent a line, a number or an address.**

Your batch (forms with their current library entry: id, form name, agency, method, known URLs) is in
`/tmp/claude-0/-home-claude/90472e7a-9f6c-5d39-a898-117d8a29fcab/scratchpad/batches.txt` on the line starting with your batch name.

## How to research

- A first pass already found likely official pages for your batch: `/tmp/claude-0/-home-claude/90472e7a-9f6c-5d39-a898-117d8a29fcab/scratchpad/lines/<batch>-urls.json` (form_pdf, instructions, submit_page, notes). Start there, but WebFetch only opens URLs that came back in your own search results, so search for each one first.

- Use WebSearch to find the official source, then WebFetch on URLs that came back in search results (WebFetch only
  opens URLs that appeared in a search result or a previous fetch). Start from the library's `url`/`info` by searching
  for it. PDFs can usually be fetched; ask WebFetch to list every numbered line/field of the form.
- Only official sources: the agency's own site (.gov, nyc.gov, lacounty.gov, sanjoseca.gov, sfgov.org, austintexas.gov,
  dallascityhall.com, houstontx.gov, sos.state.tx.us, comptroller.texas.gov, cdtfa.ca.gov, ftb.ca.gov, edd.ca.gov,
  bizfileonline.sos.ca.gov, irs.gov, fincen.gov, etc.). Third-party sites may help you find the official page but are
  never the source of a value.
- Spend at most ~12 tool calls per form. If you can't find the form's questions, say so and move on.

## What to record per form

1. **fields**: the questions the applicant must answer, in the form's order, as printed (skip "for office use only",
   fee tables, signature boxes). Up to 40. For a PDF use its line numbers/section names; for an online form, the
   questions as the official page or its published instructions/guide list them. If the questions are only visible
   after login and the agency publishes a "what you'll need" list, use that list and set `status: "page_only"`.
2. **attach**: documents the agency says to submit with it.
3. **destination**: how a completed application is actually submitted, only as the agency states it: an email inbox
   that accepts this application, a fax number, a mailing address, and/or the portal host (e.g. `a810-dobnow.nyc.gov`).
   Plus **signature**: `"typed"` or `"drawn"` only if the agency explicitly accepts electronic signatures for this form
   (an official online portal where the applicant attests and submits counts as `"typed"`), `"wet"` if it requires an
   original ink signature or notarization, `"unknown"` otherwise. Quote the sentence that shows it in `evidence`.

## Output

Write ONE JSON file to `/tmp/claude-0/-home-claude/90472e7a-9f6c-5d39-a898-117d8a29fcab/scratchpad/lines/<batch>.json`
(with the Write tool), shaped exactly:

```json
{
  "<form id>": {
    "status": "mapped" | "page_only" | "not_found",
    "form_seen": "exact title and revision/version as printed, e.g. 'DTF-17 (11/23)'",
    "read_on": "2026-10-13",
    "sources": [{ "url": "https://...", "what": "official PDF | application page | instructions" }],
    "fields": [
      { "id": "snake_case_unique", "line": "as printed: '3a', 'Part 2', 'Section B' or '' for online forms",
        "en": "label as printed (trim to 90 chars)", "zh": "natural Simplified Chinese for a Chinese business owner",
        "hint_en": "optional: what goes here, from the form's instructions", "hint_zh": "optional",
        "options": ["optional: checkbox choices as printed"] }
    ],
    "attach": [{ "en": "...", "zh": "..." }],
    "destination": { "email": "", "fax": "+1XXXXXXXXXX", "mail": { "name": "", "line1": "", "line2": "", "city": "", "state": "", "zip": "" },
      "portal": "host only", "signature": "typed|drawn|wet|unknown", "evidence": "quoted sentence", "source": "https://..." },
    "notes": "anything the team should know: fees seen, form recently revised, mismatch with the library entry, etc."
  }
}
```

Leave out any destination key you didn't confirm on an official page. Then reply with a 3-line summary: how many
forms mapped / page_only / not_found, and anything alarming (a form the library names that no longer exists, a wrong
agency, a changed fee).
