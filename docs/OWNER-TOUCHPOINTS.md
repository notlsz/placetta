# When Placetta reaches the owner

Odelia does everything she can herself. The owner is reached personally (an email or a text) only for what nobody else
can do, a clock running on them, or the result they're paying for. Everything else is in the app's timeline (Updates)
and in any team chat they linked. A new kind of Update reaches the owner until it's listed here as quiet: missing an ask
is worse than one extra line.

The code: `supabase/functions/monitor/quiet.ts` (what's quiet), `monitor/stage.ts` (`pushed`: what's sent the moment
it happens), the morning email `digest` in `monitor/index.ts`, and Odelia's rule on questions in `src/live.ts`.

## Reaches the owner (19 kinds before, 8 after)

| Trigger | Channel | Why only the owner |
|---|---|---|
| A step on the agency's own page (a CAPTCHA, a code, an ID check, the agency's fee), after the Placetta team when it's a CAPTCHA | At once: text or email, one tap opens the filing; the page waits with everything else filled | Only a person may answer a human check; only the business pays its fee |
| A form that needs an ink signature, an owner-only form, or a filing no channel can send | At once: the packet in Documents and one button ("I've sent it") | The signature and owner-only submissions are the business's by law |
| The agency asks for something (needs info) | At once | The agency's clock is running on the business |
| The agency returns it (denied) | At once | The appeal deadline starts |
| Approval of a filing, or one standing authorization (Autopilot) | In the app; the morning email lists what's waiting | Nothing is filed without the owner's say |
| A deadline or renewal within 7 days, an overdue item, a lapsed permit, an inspection result | Morning email; a text or call when urgent | A fine, a closure or a missed opening |
| Approved by the agency, a license in hand | Morning email, after what needs them | The result they pay for |
| The yearly plan's renewal notice | Email, 15 to 45 days before | Required by law (Cal. Bus. & Prof. Code § 17602) |

## Now quiet: in the timeline only (were sent by email or text)

| Trigger | Was | Now |
|---|---|---|
| Placetta starts filing | Instant email or text | Timeline and team chat |
| Submitted to the agency | Instant email or text | Timeline and team chat |
| Approved by the agency | Instant email or text | Morning email |
| Mailed by certified mail | Morning email | Timeline |
| The agency's page changed | Morning email | Timeline (Odelia reads it; an ask becomes its own Update) |
| Monday's week ahead | Morning email | Timeline |
| The week's list of what Odelia did | Morning email | Timeline |
| A payment or refund went through | Morning email | Timeline |
| A deadline, renewal or permit more than 7 days out | Morning email | Timeline (Odelia starts renewals 60 to 90 days out herself) |
| The city's posting for the record | Morning email | Timeline |
| A call Odelia made, an interpreted conversation | Morning email | Timeline |
| Everything above, for owners who asked for texts only | Every one by text | Only what reaches the owner |

## Asking questions

Odelia asks only for an approval or signature, an agency fee, a step on the agency's page, the owner's own agency login,
or a real business decision. Before asking she looks in the workspace, memory, documents, connected apps, the registry and
the agency's own page; each answer is saved (remember) so it's never asked twice; all of it comes in one question at the
end of her work. Retries and reroutes are never announced.

## Agency CAPTCHAs

Placetta never solves or gets around a CAPTCHA, and never calls a solving service. When an agency's site shows one, the
Placetta team gets it first (worker/filer `staffFirst`); otherwise the owner gets one text or email, one tap opens the
filing, "Open the step" opens the waiting page, and Odelia carries on by herself the moment the page moves on (the session
stays open, so it's one CAPTCHA per filing). Where the agency's own guide shows a CAPTCHA (`Dest.captcha`) and the agency
also takes the form by email, fax or mail, Placetta sends it that way instead (`pick` in `file/logic.ts`).
