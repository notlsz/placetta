# Browser comparison: the same rehearsal filings on each browser

Nobody publishes how cloud browsers do on government sites, so we measure it ourselves: the same rehearsal filings,
once per browser, compared on how far Odelia got, how long it took and what it cost. Rehearsals only: the "Test
Business" workspace is synthetic, every value is test data, and every run stops before submit and payment.

## How a run is pinned to one browser

A rehearsal filing whose payload has `bench_browser` (`browserbase`, `steel` or `local`) opens on that browser and no
other (worker/filer/src/run.ts `benchBrowser`, browsers.ts `orderFor`). Real filings ignore the field. The California
rule still holds: a run that may not be recorded never opens on Steel, so California forms are compared on Browserbase
and local Chromium only.

## Queue a round

One copy per form per browser, each with its own `app_id` (one open filing per `app_id`):

```sql
insert into filings (workspace_id, app_id, title, agency, portal_url, fee_estimate, payload, status, approved_by,
  approved_at, requirements_checked, note, channel, agent_state, approved_via)
select workspace_id, 'bench-' || b || '-' || substr(app_id, 11), title, agency, portal_url, fee_estimate,
  payload || jsonb_build_object('bench_browser', b), 'in_progress', approved_by, now(), requirements_checked,
  'Browser comparison: test data, never submitted, never paid', channel, 'queued', approved_via
from filings, unnest(array['browserbase', 'steel']) b
where workspace_id = '230e673f-58ca-43b3-b1ed-baa5f62b27b9' and app_id like 'rehearsal-%' and status = 'in_progress';
```

## Read the result

```sql
select f.payload->>'bench_browser' as browser, count(distinct f.id) as filings, count(r.*) as runs,
  count(*) filter (where f.agent_state in ('needs_you', 'held') and f.agent_log::text ~ '"kind": ?"(need_person|review|pay)"') as reached_a_person_step,
  count(*) filter (where f.agent_log::text ~ 'portal_failed|own tools') as failed_on_our_side,
  round(avg(extract(epoch from r.ended_at - r.issued_at))) as avg_seconds,
  round(sum(r.ai_usd), 4) as ai_usd
from filings f left join filer_runs r on r.filing_id = f.id
where f.app_id like 'bench-%'
group by 1 order by 1;
```

Twenty filings per browser is enough to see a difference. Cancel the copies afterwards
(`update filings set status = 'canceled' where app_id like 'bench-%'`).
