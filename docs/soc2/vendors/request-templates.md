# Vendor request templates

Send from the company address (security@placetta.com or the founder's `@placetta.com` address), never a personal one. Fill in the brackets. Record each request and answer in the tracker ([README.md](README.md)). Don't promise anything about Placetta's own certifications: Placetta has no SOC 2 report or ISO certificate today.

## A. SOC 2 report (and certificate) request

```
Subject: SOC 2 report request from Placetta Inc. (customer, account [account or project ID])

Hello [Vendor] security team,

Placetta Inc. uses [service, e.g. "Supabase database, storage and auth for project esquxzcfsylffuijvzec"] and is
preparing for its own SOC 2 examination, in which [Vendor] is a subservice organization (carve-out method).

Could you send us, under NDA if needed:
1. Your most recent SOC 2 Type 2 report covering [the service we use], including the period it covers;
2. A bridge letter if that period ended more than three months ago;
3. Your ISO/IEC 27001 certificate and its scope statement, if you hold one;
4. Your data processing agreement (or a link to accept it for our account).

If the report is only available on a higher plan, please tell us whether it can be shared under NDA with customers
on our current plan.

Thank you,
[Name], [Title], Placetta Inc.
[email] | security contact: security@placetta.com
```

## B. Bridge letter request

```
Subject: Bridge letter for your SOC 2 report ending [period end]

Hello [Vendor] security team,

Thank you for the SOC 2 Type 2 report for [period start] to [period end]. Our examination's date is [as-of date].
Could you send a bridge (gap) letter confirming whether there have been material changes to the system or the
controls described in that report between [period end] and today, and when the next report is expected?

Thank you,
[Name], Placetta Inc.
```

## C. AI and data-use confirmation (model vendors, speech and voice providers)

```
Subject: Written confirmation of data use and retention for Placetta Inc.'s account [org or account ID]

Hello [Vendor] team,

Placetta Inc. sends [what: e.g. "text of customer requests, never files" / "call audio and transcripts" / "full
requests including documents"] to [endpoint or product, e.g. "the GroqCloud API, model gpt-oss-120b"] through our
account [ID]. Our customers ask us to state in writing how their data is used. Could you confirm, for our account
and that product:

1. Whether any of our inputs or outputs are used to train or improve models, and under which terms;
2. How long inputs, outputs and logs are retained, and where;
3. Whether a zero data retention mode is available, whether it is enabled on our account, and which features it
   covers or excludes (for example, abuse monitoring, file uploads, batch or caching features);
4. Which subprocessors handle our data, and in which countries;
5. Where your SOC 2 report or other attestation for this product can be obtained.

A reply on your letterhead or from an official support channel is fine. We will keep it with our vendor records.

Thank you,
[Name], [Title], Placetta Inc.
```

## D. Security questionnaire for a vendor without a report

```
Subject: Short security questionnaire from Placetta Inc.

Hello [Vendor] team,

[Vendor] receives [data] from Placetta Inc. Since you don't have a SOC 2 report or ISO 27001 certificate, could you
answer these briefly?

1. Where is our data stored and processed (provider, region)? Is that provider SOC 2 or ISO 27001 attested?
2. Is our data encrypted in transit and at rest? How are keys managed?
3. Who on your team can access our data, and is two-factor authentication required for them?
4. How long do you keep our data and logs, and how is it deleted when we leave?
5. How and how fast would you notify us of a breach involving our data?
6. Do you have a data processing agreement we can accept?
7. When was your last independent penetration test?

Thank you,
[Name], Placetta Inc.
```

## E. Data processing agreement request

```
Subject: Data processing agreement for Placetta Inc. (account [ID])

Hello [Vendor] team,

Please send the data processing agreement (or the link to accept it) that applies to our account [ID], including
your current subprocessor list and your breach notification commitment. We process personal information of US
residents and, for some customers, of people in China.

Thank you,
[Name], Placetta Inc.
```
