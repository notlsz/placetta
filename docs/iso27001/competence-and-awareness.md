# Competence and awareness (clauses 7.2 and 7.3)

| | |
| --- | --- |
| Document | ISMS-10 |
| Version | 0.1 |
| Status | **Draft for approval.** No training has been completed and no record exists yet |
| Owner | Founder (security lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant) |
| Review | Yearly, and when a role is added |
| Clauses and controls | 7.1, 7.2, 7.3; Annex A 6.3, 6.1, 6.2, 6.6 |
| SOC 2 cross-reference | CC1.4a, CC1.4b, CC1.1a, C1.1c |

[personnel-security.md](../soc2/policies/personnel-security.md) sets onboarding, offboarding, background checks and the yearly training. This document adds what ISO/IEC 27001 asks for: the competence each role needs, how it is shown, and the records.

## Competence needed per role

| Role | Competence needed | How it is shown | Gap today and the action |
| --- | --- | --- | --- |
| Founder as ISMS manager and security lead | Running an ISMS; risk assessment; cloud and application security for Supabase, Vercel, Render and GitHub; incident handling | Record of experience (what was built and secured, with the repo as evidence); a course on ISO/IEC 27001 implementation or the SOC 2 criteria; this year's security awareness training | No training record. Action: complete one awareness course and one ISO 27001 foundation or implementer course, record both |
| Staff working the filing queue and support | Handling customer data and saved logins; recognising phishing and social engineering; reporting events | Awareness training at start and yearly; signed policy acknowledgment | Applies from the first hire |
| Engineers and contractors | Secure development (the PR checklist), secrets handling, the AI coding rules | Training plus review of their first pull requests | Applies from the first hire |
| Outside internal auditor | ISO/IEC 27001 audit competence | Lead Auditor certificate or equivalent experience, recorded at engagement | Not engaged |
| AI coding agents | Not people: their output is controlled by review and CI, not by training | | |

## Awareness (clause 7.3)

Everyone who works here knows: the information security policy; how their work contributes to it (approval gates, least privilege, truthful claims); what happens if they don't follow it (information-security.md "Enforcement"); and how to report an event (security@placetta.com). Shown by: the signed acknowledgment, the training record, and the onboarding record.

## Competence and awareness record (one row per person; completed records go in the evidence folder)

| Name | Role | Start date | Policies acknowledged (date) | Training completed (course, date, certificate) | Background check (date or reason not required) | Confidentiality agreement (date) | Competence evidence for the role | Next training due |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | Founder | | | | Founder: not required (record the reason) | Not applicable to the founder | | |

## Acknowledgment text (to sign at start and yearly)

```
I have read Placetta's information security policy (docs/iso27001/information-security-policy.md), the topic policies in
docs/soc2/policies/, and the acceptable use policy. I understand them, I will follow them, and I will report suspected
security events to security@placetta.com.
Name: ______________________  Role: ______________________  Date: __________  Signature: ______________________
```

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder) | | | | |
