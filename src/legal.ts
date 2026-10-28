// Customer-facing legal pages, in English and Simplified Chinese.
// Body markup: blank line between paragraphs, "## " for headings, "- " for bullets, **bold** inside a paragraph or bullet,
// bare URLs and emails only. Keep the "## " headings and the **bold** spans parallel between the two languages.
// The disclaimers, the limitation of liability and the arbitration, class and jury waivers are bold (and ALL CAPS in
// English) so they are conspicuous. UPDATED is also the version people accept: keep it equal to
// public.current_terms_version() in supabase/migrations (scripts/build-legal.mts checks).
// The same text is published as Markdown in /legal and on the website (site/terms.html, privacy.html,
// authorization.html, ai.html). After editing, run: node scripts/build-legal.mts

export type LegalDoc = { id: "terms" | "privacy" | "authorization" | "ai"; title: { en: string; zh: string }; updated: string; body: { en: string; zh: string } };

/** The date of this version. Every document also says it takes effect on this date. */
export const UPDATED = "2026-10-22";

const TERMS_EN = `Effective date: ${UPDATED}. If you accepted an earlier version, this version applies to you from the day you accept it in the app, or from 30 days after we notify you of it by email or in the app if you keep using the service after then, whichever comes first. Until then, the previous version applies.

These terms are an agreement between you and Placetta Inc. ("Placetta", "we", "us"). They cover your use of placetta.com, the Placetta app, and texts and calls with Odelia, Placetta's AI agent (together, the "service"). "You" means the business you represent and the people who use the service for it.

You accept these terms, for the business you represent, by checking the box that says you agree to them and continuing, or by clicking a button that says you accept them. If you do not agree, do not use the service.

**PLEASE READ THESE TERMS CAREFULLY. THEY REQUIRE YOU AND PLACETTA TO RESOLVE DISPUTES BY BINDING INDIVIDUAL ARBITRATION, AND THEY WAIVE CLASS ACTIONS AND JURY TRIALS (SEE "RESOLVING DISPUTES"). YOU CAN OPT OUT OF ARBITRATION WITHIN 30 DAYS. THEY ALSO DISCLAIM WARRANTIES AND LIMIT EACH SIDE'S LIABILITY (SEE "DISCLAIMERS" AND "LIMITATION OF LIABILITY").**

## Who can use Placetta

Placetta is for businesses. To use it, you must:

- be 18 or older
- use it for a business, not for personal, family or household purposes
- have authority to act for that business and to bind it to these terms

## What Placetta does

Placetta helps businesses get the licenses, permits and registrations they need to open and operate locations in the United States. Odelia, our AI agent:

- maps the licenses your business needs
- reads the documents you upload, and the email and files you connect
- fills applications from your information
- tracks deadlines and renewals and reminds you of them
- drafts messages
- answers your texts and calls, if you link a phone
- checks the status of your filings on agency websites and public records every day
- books inspections at a time you approve
- when an agency says no, shows you the official way to appeal and its deadline, and drafts what you may need

Odelia researches requirements on official government websites and cites the agency source.

## Your approval comes first

Odelia never files, pays or sends anything on her own. Every filing and every message needs your approval in the app.

After you approve an application, Placetta's software checks it against the agency's current requirements and submits it on your behalf by email from your connected mailbox, by fax, by certified mail or on the agency's website, using the saved logins you choose to keep with us. When no automatic channel fits, our filing team submits it. Placetta stops and asks you whenever an agency requires a CAPTCHA, an identity check, a payment, a sworn statement or your handwritten signature, and some agencies require an in-person step. You complete those yourself. Placetta never types a card or bank number and never sends a Social Security, ITIN or passport number.

Placetta may decline to submit a filing that we believe in good faith is inaccurate, incomplete, unlawful or not authorized by your business. We will tell you why, so you can correct it.

Our Filing Authorization sets out the limited authority you give us to file for you. It is part of these terms.

## What Placetta may do for you, and when

Odelia and Placetta's filing software and team act for your business only within these limits:

- Without asking each time: read what you upload or connect, look up requirements and fees on official websites, check the status of your filings on agency websites and public records, track deadlines, and prepare drafts for you to review.
- Only after an owner of your workspace approves that exact item in the app: submit a filing, send a message as your business, book an inspection at the time the owner picked, or change something in an app you connected. Each approval covers that one item.
- Saved agency logins are opened only to do something an owner approved, such as submitting a filing or booking an inspection, and each opening is recorded in your audit trail. Placetta's software types the login itself; the AI model never sees the password. Placetta never creates an agency account in your name.
- Never: pay a government fee, type a card or bank number, sign your name, make a sworn statement for you, file an appeal, appear at a hearing or an inspection for you, or send a Social Security, ITIN or passport number.

Only an owner of your workspace can give these approvals. You decide who is an owner, and an owner's approval is your business's approval.

## Monitoring and reminders

Placetta tracks the expiry and renewal dates of the licenses and permits in your workspace, and reminds you by email, in the app and, if you turn them on, by text or call. Monitoring and reminders are a service to help you. They do not replace your own records and calendar.

- Placetta checks the status of each filing with an agency once a day, from the agency's public records, its status page or a lookup by Odelia, and tells you when something changes. What the agency tells you directly controls over what our check shows.
- Your business remains responsible for holding the licenses and permits it needs, for renewing them, and for meeting every agency deadline, whether or not you receive a reminder.
- Placetta will use commercially reasonable efforts to keep the dates in your workspace accurate and to send reminders on time. We do not promise that every requirement, rule change or deadline will be caught, or that every reminder will arrive.
- Dates come from your documents, the agencies and what you tell us. Check them, and tell us if one looks wrong. Agencies can change rules, fees and deadlines without notice.

## Odelia is an AI

Odelia is software, not a person.

- Her output, including license maps, filled applications, answers by text or call, and reminders, can be wrong or incomplete. Review what she prepares, and check the cited source, before you approve it or rely on it.
- On every call, Odelia says that she is an AI and that the call is transcribed.
- Odelia cannot file, pay, send, approve or delete anything by text or call. Those happen only in the app, after your approval.
- If an owner or admin turns on memory (it is off by default), Odelia suggests short notes about your business and an owner or admin approves each one. Each note shows where it came from and when, so you can see why Odelia remembered it. Your team can edit or delete any note at any time. Your records, such as filings and deadlines, win over a note that disagrees with them.
- Placetta checks Odelia's work: every application is checked line by line before you can approve it, and a sample of finished tasks, about 1 in 5, is checked again by fixed rules, without an AI model, so our team can find and fix mistakes. These checks help, but they do not replace your review.
- You are responsible for what you approve.

## AI models and your content

- Placetta does not use your content to train AI models. We choose AI providers whose terms for our account don't allow training on what we send. Our Privacy Policy names each provider, what it receives and where it is based.
- Zero data retention is not in place today. We are asking each AI provider to confirm zero data retention in writing, and Placetta can limit AI processing to providers that have.
- To save cost, a provider may keep the unchanging start of a request in its prompt cache for a short time, from minutes to an hour. It is not used for training.
- What Odelia prepares for you from your content, such as applications, drafts and messages, is yours to use for your business. Similar output may be prepared for others, and Placetta's software, forms and guides stay Placetta's.
- Placetta keeps a technical record of each task: which tools ran, how long they took and what they cost. It holds names and numbers, not your content. We use it to run, fix and price the service.

## Texts and calls

You can link a mobile number in Settings to text and call Odelia. To link it, you confirm a code we text to that number.

By linking a number and confirming the code, you agree to receive texts and calls from Placetta at that number about your workspace, including automated texts and calls that use an AI voice. They include replies when you text or call, and the update texts and urgent calls you turn on in Settings.

- Message frequency varies. Update texts and urgent calls follow the limits shown in Settings. Replies to your own texts and calls are extra.
- Msg & data rates may apply.
- Reply STOP to cancel texts at any time, and START to turn them back on. Reply HELP for help, or email support@placetta.com.
- Your consent is not a condition of any purchase. You can use Placetta without linking a phone.
- Urgent calls are made only if you turn them on.
- We text and call only the number you verified. If you stop using that number, remove it in Settings.
- Placetta does not send update texts or make calls during your quiet hours, which are 9 pm to 8 am in your time zone unless you change them. Odelia still answers when you text or call her.
- Calls are transcribed so Odelia can understand you. Your texts and a record of each call are kept with your account. Our Privacy Policy explains how.
- Carriers are not liable for delayed or undelivered messages.

You confirm that you own the number you link, or are authorized to use it.

## Sharing with headquarters

An owner of a workspace can share its stores' status, read only, with a headquarters email address, such as a franchisor's, in Settings. Someone who signs in to Placetta with that email address, after confirming it, sees the status, and the address gets a summary email each week.

- Headquarters sees the workspace name and brand, and for each store its name, address and stage, how many licenses are current, due within 30 days or overdue, how many applications are pending, and the next item due.
- Headquarters does not see your documents, the contents of applications, agency logins, conversations, or texts and calls with Odelia, or who is on your team. It cannot change or approve anything.
- You are responsible for having the right to share this information with that headquarters, for example under your franchise agreement, and for entering the right email address.
- An owner can stop sharing at any time in Settings. Summary emails already sent cannot be recalled.

## Sharing with a partner who referred you

If your business came to Placetta through a partner's referral code, such as a franchisor, broker, landlord, investor or accountant, Placetta asks you once whether that partner may see your progress.

- If you agree, the partner sees only your business name, your stage, how many permits are approved out of the total, and your opening date. Nothing else.
- You can change this in Settings at any time.
- Placetta may pay the partner a share of what you pay us. It doesn't change your price.

## Professional services

Placetta is not a law firm, a customs broker or an accounting firm. We do not give legal, customs, tax or accounting advice, and using the service does not create an attorney-client relationship with Placetta.

Some steps can legally be done only by a licensed professional, such as an attorney or a licensed customs broker. For those steps:

- Placetta introduces you to an independent professional. You engage that professional directly, under your own agreement with them, and they bill you directly.
- The professional is responsible for their own work and advice. Placetta does not direct or control their professional judgment.
- Placetta does not receive referral fees from attorneys and does not share in the fees you pay an attorney.
- Customs entries are filed by a licensed customs broker, not by Placetta.
- With your approval, Placetta shares with the professional the information in your workspace that they need.

Where a city requires a registered filing representative or permit expediter for a step, that step is handled by someone registered there.

## Appeals and denials

When an agency denies an application, revokes a license or issues a fine, Placetta can show you the official way to challenge it, its deadline, and what is on file. Placetta is not your lawyer.

- Placetta reads the process from the statute, rule or agency page, cites it, and counts the deadline from that rule, showing how it counted. A rule we could not confirm on an official source is marked unconfirmed and is never turned into a date. The deadline in the agency's letter and the law control, and your business is responsible for meeting it.
- Placetta drafts what you may need, such as a letter or a list of evidence, with each rule cited, for you or your attorney to check. A draft is not legal advice and does not state your legal position.
- Placetta never files an appeal, never appears at a hearing for you, never tells you whether you will win, and gives no opinion on your legal rights.
- Where a lawyer is advisable or required, such as for a hearing or a court case, Placetta can prepare one packet for an independent attorney you choose or one we introduce you to: the decision, the deadline and how it was counted, the grounds, the evidence on file and what is missing, and the questions for the attorney. Placetta sends it only with your approval. The attorney works for you under your own agreement, as "Professional services" explains.

## What Placetta is not

- Placetta is not a government agency and is not affiliated with or endorsed by any agency.
- Agencies decide whether to approve an application and how long it takes. We cannot guarantee approval, timing, inspection results, the outcome of an appeal or an opening date. Timelines, deadlines and fees we give you are estimates.

## Government fees

Government, agency and notary fees are at cost. You pay them directly to each agency, using the payment link we send you. Placetta never marks them up and never keeps any part of them. Fees that professionals bill you directly are also separate from Placetta's fees.

## Plans and billing

Placetta's fees are billed through Stripe. The prices below apply to every workspace that was not already a paying Placetta customer when this pricing took effect in October 2026. Settings, Billing shows which pricing your workspace is on. "Plans from before" below covers the workspaces that were.

- Store plan: $149 per store per month, billed yearly in advance ($1,788 per store per year), or $179 per store per month billed month to month, for each store in the workspace. It covers tracking every license and renewal date, renewal monitoring and rule-change alerts, your document vault, Odelia's chat for your team, and every renewal Odelia files on her own.
- New license: $299 for each new license, permit or registration Placetta files, filed and tracked until the agency decides.
- Complex license: $999, only for liquor licenses, building plan review and import permits. No other license costs $999.
- Renewal the store plan doesn't include: $99. A renewal isn't included when it needs Placetta's team, for example because it needs a handwritten signature, can only be mailed, or has no route Odelia can file on her own, or when the store has no store plan.
- 10 or more stores on the store plan: every new license is included too, with no charge per license.
- Never charged: inspections that are part of a permit, steps that belong to a license already priced, and certificates and training your staff earn themselves. Placetta tracks them for free.
- The plan preview, which lists the licenses a store needs with their fees and timelines, is free.
- Government fees are at cost, as "Government fees" explains.
- Custom plans may be set out in an order form that both sides accept. "Order of precedence" under "General terms" explains which controls if they conflict.

Every charge is shown before you approve it. The app shows each license, complex license or renewal fee, in English and Chinese, with the agency's own fee, before an owner approves that filing, and charges it only when the owner approves it, at the price shown. A fee you paid is never charged twice for the same filing. If online payment isn't available for an item, our team sends you a quote, and nothing is charged until you accept it.

Fees do not include taxes. You pay any sales, use or similar taxes that apply, other than taxes on Placetta's income.

If a payment fails, we may pause filing work for the workspace after telling you.

## Renewal and cancellation

- The store plan renews automatically at the same price, every year on yearly billing or every month on monthly billing, until you cancel. Before you pay, the app shows these renewal terms next to the payment button and asks you to agree to them.
- We email the owners 15 to 45 days before each renewal with what it will charge and how to cancel.
- If the price will change at renewal, we will tell you at least 30 days before.
- You can cancel online at any time in Settings, Billing, with one click and no call. Cancelling turns off the next renewal. It takes effect at the end of the current yearly or monthly term, and you keep the service until then.
- New licenses, complex licenses and renewals are charged one at a time, only when an owner approves them, so there is nothing to cancel for them.

## Refunds

- Store plan fees are paid in advance, for the year or the month. Cancelling stops the next renewal; it does not refund the current term, except as "Changes to these terms" says or where the law requires a refund.
- A license, complex license or renewal fee pays for that one filing. Once Placetta has submitted the filing, the fee is earned, whatever the agency decides.
- If Placetta declines to submit a filing you paid for, or cannot submit it, and you don't want us to try again, we refund that filing's fee. Ask at support@placetta.com.
- Government fees are paid to the agency, and any refund of them follows the agency's rules.

## Plans from before

If your workspace was already a paying Placetta customer when the store plan pricing took effect, you keep the plan you bought, at its price, with everything it included, as shown in Settings, Billing and on any order form. The store plan pricing doesn't change it, and we move a workspace to the store plan pricing only with an owner's written agreement. Those plans are:

- Entry plan: $299 per market, paid once. It is credited toward your first year of a location plan if that plan starts within 60 days of paying for the entry plan. After 60 days it is not credited.
- Essentials: $149 per location per month, billed yearly in advance. It covers tracking, filing and renewals for each location.
- Pro: $299 per location per month, billed yearly in advance. It adds inspection readiness: daily logs, mock inspections, staff certificates and a larger Odelia allowance.
- Openings: $3,500 per new retail store and $6,500 per new restaurant or food store, paid once when the store is added while still opening. Openings that need a liquor license or a complex build-out are quoted before any work starts. Opening fees are not credited against a location plan.
- Open-by-date guarantee, only on plans from before: $2,500 per opening, optional. We agree an opening date with you in writing. If a permit Placetta files for you is the reason the store opens after that date, we refund that store's opening fee. It does not apply when the delay comes from the agency's own review time beyond its published times, from steps you or your landlord, contractors or professionals have to complete, from information you gave us that was incomplete or wrong, or from inspections, construction or permits we don't file. The guarantee fee itself is not refunded. The guarantee is not offered with the store plan.
- Headquarters (10 or more locations), US entry for brands from outside the US, modules and multi-year terms are set out in an order form or in Settings, Billing.

A location plan from before renews for another year at the end of each yearly term until you cancel, as "Renewal and cancellation" describes. Its fees are non-refundable, except under the open-by-date guarantee, under "Changes to these terms", or where the law requires a refund.

## Fair use of Odelia

Odelia, Placetta's AI agent, does compliance work for your business: its licenses, permits, registrations, filings, inspections, stores and the documents behind them. She isn't a general-purpose AI assistant.

- Each plan includes an Odelia allowance, shown in Settings, under Billing. On plans from before, Pro's is twice Essentials', and packs ($49 for $25 of allowance) add more and carry over until they're used. When the allowance is used up, deadlines, reminders and filings already in motion carry on; new work for Odelia waits for the next period or, on plans from before, a pack or a larger plan.
- To keep the service fast for everyone, there are limits on how many tasks you can start in an hour and in a day.
- You may not use the service or Odelia's output to build, train or improve another AI model; reach the service with scripts, bots or other automated means except through features we provide; resell or share access to it; or try to get around its limits or instructions.

We may pause Odelia for, or close, a workspace that breaks these rules.

## Your responsibilities

You agree to:

- give us accurate, complete and current information, and update it when it changes
- act only for a business you have authority to represent
- review every application and message before you approve it
- complete the steps an agency requires of you, such as signing, paying or appearing in person
- keep your licenses and permits current and meet agency deadlines
- pay government fees directly to the agencies
- use the service lawfully, and upload or connect only content you have the right to share, including information about other people such as owners and managers
- link only a phone number you own or are authorized to use
- keep your login secure, and tell us at support@placetta.com if you think someone else has accessed your workspace
- keep tokens for AI assistants secret, give each only the access it needs, and revoke one you no longer use

## Your content

Your documents and information stay yours. You give Placetta a limited license to use, copy, store and transmit them only to provide the service to you. That includes sending them to the agencies when you approve a filing, to professionals you engage with your approval, to a headquarters or partner you share with as described in these terms, and to the processors named in our Privacy Policy.

We do not use your content to train AI models. We do not sell it, and we do not use it for advertising.

If you send us suggestions or feedback, we may use them without any obligation to you.

## Placetta's service

Placetta owns the service, including its software, guides and design, but not your content. While you have a workspace, you may use the service for your business under these terms. You may not:

- copy, resell or sublicense the service
- reverse engineer it, or use it to build a competing product
- scrape it, overload it, or try to get around its security or limits
- use it in violation of US export control or sanctions laws, or if you are on a US government list of prohibited or restricted parties

## Connected services

You can choose to connect the services the app offers, such as Gmail, Google Calendar, Google Drive, Outlook Mail, Outlook Calendar, Microsoft Teams, Dropbox, QuickBooks, Slack, Lark, WeCom, DingTalk, and other apps through MCP. We use them only for the tasks you ask for. Reading from a connected app can run on its own; anything that would change data in it waits for an owner's approval. Each is run by its provider under its own terms. You can disconnect any of them in Settings at any time.

## Connecting an AI assistant

An owner or admin can make a token in Settings that lets an AI assistant you use, such as Claude or ChatGPT, read your workspace through Placetta's MCP server.

- Each token reads one workspace, and only the kinds of information chosen for it, such as store status, deadlines, readiness or filings. It is read only: it cannot file, send, pay, approve or change anything.
- The token is shown once, when it is made. Placetta keeps only a fingerprint of it, never the token itself. Treat it like a password.
- Every call made with a token is recorded in your workspace. A token stops working when an owner or admin revokes it in Settings, or when the person who made it is no longer an owner or admin.
- The assistant you connect is run by its provider under its own terms. What it does with the answers it receives is between you and that provider.
- We may limit how often a token is used, and may revoke a token that is misused or that we believe has leaked, and will tell you if we do.

## Security

Placetta protects your information with the measures in our Privacy Policy, under "Security", and on our Trust page, https://placetta.com/trust, which also says what isn't finished yet. Placetta doesn't hold SOC 2 or any other security certification today. If a security incident exposes your workspace's information, we will tell the owners by email without undue delay, and within 72 hours of confirming that their information was involved, unless the law sets a shorter time.

## Ending your use

- You can cancel your plan in Settings, Billing at any time.
- You can revoke your Filing Authorization at any time, as it explains.
- You can download your workspace data, including the audit trail entries shown in the app, in Settings, Privacy and data.
- You can delete your account in Settings, Privacy and data. That deletes the workspaces you own alone, with their documents, filings and audit trail, and removes you from the others. Cancel any paid plan on a workspace you own alone first. You can also ask us to delete a workspace by emailing support@placetta.com.
- We keep records the law requires us to keep, such as billing records.

We may suspend or close a workspace that breaks these terms or the law, or that does not pay. We will tell you first, unless the law or a risk to others does not allow it.

Applications already submitted to an agency stay with that agency. Placetta cannot recall them.

## Disclaimers

**TO THE EXTENT THE LAW ALLOWS, THE SERVICE, INCLUDING ODELIA'S OUTPUT, LICENSE MAPS, FILLED APPLICATIONS, REMINDERS AND FILINGS, IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND. PLACETTA DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED OR STATUTORY, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM A COURSE OF DEALING OR USAGE OF TRADE.**

**PLACETTA DOES NOT PROMISE THAT THE SERVICE WILL BE ACCURATE, COMPLETE, FREE OF ERRORS OR UNINTERRUPTED, THAT THE LICENSES WE MAP ARE COMPLETE, THAT EVERY DEADLINE WILL BE CAUGHT OR EVERY REMINDER WILL ARRIVE, OR THAT ANY AGENCY WILL APPROVE AN APPLICATION.**

This section does not limit a commitment these terms make expressly, such as that Placetta never files, pays or sends anything without your approval.

## Limitation of liability

**TO THE EXTENT THE LAW ALLOWS:**

- **EACH SIDE'S TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE, TOGETHER, IS LIMITED TO THE GREATER OF (A) THE FEES YOU PAID PLACETTA FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT THAT GAVE RISE TO THE CLAIM, AND (B) US$100. GOVERNMENT FEES AND FEES YOU PAID OTHERS ARE NOT INCLUDED.**
- **NEITHER SIDE IS LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, RENT, DATA OR GOODWILL, EVEN IF IT WAS TOLD THEY WERE POSSIBLE.**
- **PLACETTA IS NOT LIABLE FOR THE DECISIONS, ACTIONS OR DELAYS OF ANY AGENCY, FOR AN APPLICATION THAT IS REJECTED OR DELAYED, OR FOR A LICENSE OR PERMIT THAT LAPSES, OR FOR THE FINES, PENALTIES, LATE FEES, CLOSURES OR DELAYED OPENINGS THAT RESULT. WHERE THE LAW DOES NOT ALLOW THIS, THOSE LOSSES ARE SUBJECT TO THE LIMIT ABOVE.**

**THESE LIMITS APPLY TO CLAIMS IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY OR ANY OTHER LEGAL THEORY, AND EVEN IF A LIMITED REMEDY FAILS OF ITS ESSENTIAL PURPOSE.** They do not apply to your obligation to pay fees, to your indemnity obligations, or to your breach of "Placetta's service" or "Fair use of Odelia". They also do not limit liability that the law does not allow to be limited or excluded, such as liability for fraud, gross negligence, willful misconduct, or willful injury to a person or property.

Placetta's fees reflect these limits. They are an essential part of the bargain between you and Placetta.

## Your indemnity

You will defend and indemnify Placetta and its officers, employees and contractors against any third-party claim, including a claim or proceeding by a government agency, and the resulting losses, fines, penalties and reasonable legal fees, to the extent it arises from:

- inaccurate, incomplete or misleading information you gave us or approved
- a filing or message you approved, or asked us to submit, for a business or person you were not authorized to act for
- content you uploaded, connected or shared without the right to do so, or that infringes someone else's rights
- your violation of the law or of these terms

Placetta will tell you promptly about the claim, let you control its defense, and cooperate at your expense. You may not settle a claim in a way that admits fault for Placetta or binds it without Placetta's written consent.

## Governing law

New York law governs these terms and any dispute between you and Placetta, without regard to its conflict of law rules. The Federal Arbitration Act governs the agreement to arbitrate below. The United Nations Convention on Contracts for the International Sale of Goods does not apply.

## Resolving disputes

**PLEASE READ THIS SECTION CAREFULLY. IT REQUIRES YOU AND PLACETTA TO RESOLVE DISPUTES BY BINDING INDIVIDUAL ARBITRATION INSTEAD OF IN COURT, AND IT WAIVES CLASS ACTIONS AND JURY TRIALS. YOU CAN OPT OUT WITHIN 30 DAYS, AS EXPLAINED BELOW.**

Talk to us first. Before starting arbitration or a court case, the side with a claim must send the other a written notice describing the claim and the relief it wants. The notice must name the claimant and be signed by it or its lawyer. Send yours to support@placetta.com and to the mailing address below. We will send ours to the email address on your account. For 30 days after the notice is received, both sides will try in good faith to resolve the dispute informally, and any deadline to bring the claim is paused for those 30 days.

Binding arbitration. If the dispute is not resolved within those 30 days, either side may start arbitration. Any dispute, claim or controversy arising out of or relating to these terms, the service or the relationship between you and Placetta, whether based on contract, tort, statute or any other theory (a "dispute"), will be resolved by binding arbitration administered by the American Arbitration Association ("AAA") under its Commercial Arbitration Rules and, where they apply, its Mass Arbitration Supplementary Rules, as in effect when the arbitration starts, before one arbitrator. The arbitration is seated in New York County, New York, and hearings may be held by video if the arbitrator allows. The arbitrator may award any individual relief a court could award, and will give a reasoned written decision. Judgment on the award may be entered in any court with jurisdiction.

Who decides arbitrability. The arbitrator decides all questions about the interpretation, scope, applicability, validity and enforceability of this agreement to arbitrate, including whether a dispute must be arbitrated. A court decides only whether this agreement to arbitrate was formed, whether the ban on class and representative proceedings below can be enforced, and the matters that "Exceptions" sends to court.

Costs. The AAA's rules decide who pays its filing, administration and arbitrator fees. If you show the arbitrator that those fees would be prohibitively expensive for you compared with a court case, Placetta will pay as much of them as the arbitrator finds necessary to prevent that. Each side pays its own lawyers, unless the arbitrator awards fees under the law or the AAA's rules.

**INDIVIDUAL CLAIMS ONLY. YOU AND PLACETTA MAY BRING CLAIMS AGAINST EACH OTHER ONLY ON AN INDIVIDUAL BASIS, NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS, COLLECTIVE, CONSOLIDATED OR REPRESENTATIVE PROCEEDING. THE ARBITRATOR MAY NOT CONSOLIDATE OR JOIN THE CLAIMS OF MORE THAN ONE CUSTOMER, MAY NOT PRESIDE OVER ANY FORM OF CLASS OR REPRESENTATIVE PROCEEDING, AND MAY AWARD RELIEF ONLY TO THE INDIVIDUAL PARTY SEEKING IT AND ONLY AS FAR AS NEEDED FOR THAT PARTY'S INDIVIDUAL CLAIM.**

Mass arbitration. If 25 or more similar demands for arbitration involving Placetta or a related party are filed by, or with the help of, the same or coordinated lawyers or organizations, the AAA's Mass Arbitration Supplementary Rules apply, and the AAA's process arbitrator decides the procedural questions those rules give it. Unless that process arbitrator decides otherwise:

- the demands are administered in batches of up to 50, with one merits arbitrator and one set of AAA fees for each batch
- each claim in a batch is still decided on its own facts and law, and no decision in one claimant's case binds a claimant who was not a party to it
- the batches proceed at the same time where the AAA can arrange it, and both sides will consider a global mediation in good faith
- any deadline to bring a claim in a later batch is paused until that batch starts
- each demand must meet the notice requirement in "Talk to us first"

Opting out. You may opt out of this agreement to arbitrate within 30 days after you first accept a version of these terms that contains this opt-out. To opt out, email support@placetta.com from the email address on your account, with the subject "Arbitration opt-out", giving your name, your business's name and a clear statement that you opt out of arbitration. Opting out does not affect any other part of these terms or your use of the service. If you opt out, disputes will be decided by the courts named below. An opt-out you sent for an earlier version stays in effect.

Exceptions. Either side may bring an individual claim in small claims court if it qualifies, as long as it stays there. Either side may also ask the state or federal courts in New York County, New York for an injunction or other equitable relief to protect its intellectual property or confidential information, or to stop misuse of the service. If a claim asks for public injunctive relief and the law that applies does not allow that relief to be waived or decided in arbitration, that request will be decided by those courts after the individual claims are arbitrated, and the court case will be paused until then.

**JURY WAIVER. TO THE EXTENT THE LAW ALLOWS, YOU AND PLACETTA EACH WAIVE THE RIGHT TO A JURY TRIAL IN ANY DISPUTE THAT IS DECIDED IN COURT.**

Courts. For any dispute that is not arbitrated, you and Placetta consent to the exclusive jurisdiction of the state and federal courts in New York County, New York.

If the class waiver cannot be enforced. If a court decides, after any appeals, that the ban on class and representative proceedings cannot be enforced for a claim, that claim, and only that claim, will be severed and decided by those courts, not in arbitration, and will be paused until the individual claims are arbitrated. The arbitrator never has power to hear a class or representative proceeding. The rest of this section still applies.

This section continues to apply after your use of the service ends.

## Changes to these terms

We may update these terms. When we do, we will post the new version on placetta.com and in the app with a new date.

- For a material change, we will tell you by email or in the app at least 30 days before it takes effect, with a summary of what changed.
- We will also ask you to review and accept the updated terms in the app. Until you accept them, you can still open and read your workspace, but you cannot approve anything new in the app, such as a filing or a message.
- The updated terms apply to you from the day you accept them in the app, or from the effective date in our notice if you keep using the service after that date, whichever comes first.
- If you do not agree, stop using the service and cancel before the effective date. If you cancel because of a material change that is adverse to you, tell us at support@placetta.com within 30 days after the change takes effect, and we will refund the fees you prepaid for the rest of your term.
- Other changes, such as clarifications, updates for new features, or changes the law requires, take effect when we post them.
- A change to "Resolving disputes" does not apply to a dispute that arose, or that either side gave notice of, before the change took effect. Those disputes stay under the version in effect when they arose.

## Electronic communications and signatures

You agree to do business with Placetta electronically.

- You consent to receive these terms, notices, disclosures, invoices and other communications from Placetta electronically, by email to the address on your account or in the app. They satisfy any legal requirement that they be in writing.
- Checking a box or clicking a button to accept these terms, approving something in the app, and signing in the app are your electronic signature. Each has the same effect as your handwritten signature and is legally binding under the federal Electronic Signatures in Global and National Commerce Act (E-SIGN), New York's Electronic Signatures and Records Act, California's Uniform Electronic Transactions Act and similar laws.
- Placetta keeps an electronic record of each acceptance, including the account, the version, the time and, where available, the IP address and browser. You agree that this record can be used as evidence of your acceptance.
- You can read, download and print the current terms at any time on placetta.com or in the app. You can ask us for a copy of a version you accepted at support@placetta.com.
- To use the service, you need a device with a current web browser and an email account you check. You can withdraw this consent by emailing support@placetta.com, but because Placetta is an online service, withdrawing it ends your use of the service. It does not affect anything done before.

## General terms

- Order of precedence: If these documents conflict, they control in this order: (1) an order form both sides accept, but only for the plan it covers and only where it says expressly which part of these terms it changes; (2) the Filing Authorization, for the scope of Placetta's authority to file for you; (3) these terms, for everything else, including disclaimers, limitation of liability and resolving disputes; (4) the Privacy Policy.
- Assignment: You may not transfer these terms without our written consent, except to a successor to all or most of your business that agrees to them. Placetta may transfer them to an affiliate, or in a merger, acquisition or sale of all or most of its business.
- Entire agreement: These terms, the Filing Authorization, the Privacy Policy and any order form both sides accept are the entire agreement about the service. They replace earlier agreements and proposals about it. Terms in your purchase orders do not apply. Except as described in "Changes to these terms", these terms can be changed only in a writing signed by both sides, which can be signed electronically.
- Severability: If a court or arbitrator finds part of these terms unenforceable, that part is enforced as far as the law allows, and the rest stays in effect. "Resolving disputes" says what happens if the ban on class and representative proceedings cannot be enforced.
- No waiver: If either side does not enforce a right, it does not give that right up.
- Events beyond our control: Neither side is liable for a delay or failure caused by events beyond its reasonable control, such as agency system outages, changes to agency websites, portals or forms, changes in law or agency rules, government shutdowns, failures of carriers, the internet or our providers, natural disasters, epidemics, war or labor disputes. This does not excuse paying fees.
- Independent contractors: Except for the limited authority in the Filing Authorization, neither side is the other's agent, partner, joint venturer or employee.
- No third-party beneficiaries: These terms are for the benefit of you and Placetta only. No one else has rights under them, except the people "Your indemnity" protects.
- Survival: These parts continue after your use of the service ends: fees owed, the feedback license in "Your content", "Placetta's service", "Disclaimers", "Limitation of liability", "Your indemnity", "Governing law", "Resolving disputes", "Electronic communications and signatures", "Notices", these general terms, and any other part that by its nature should continue.
- Headings and interpretation: Headings are for convenience only and do not change the meaning of these terms. "Including" and "such as" mean "including without limitation". "Days" means calendar days. These terms will be read fairly, and not for or against either side because one side wrote them.
- Language: These terms are in English and Chinese. If the two differ, the English version controls.

## Notices

We send notices to the email address on your account or in the app. Keep that email address current. Notices to Placetta go to support@placetta.com. A dispute notice or other legal notice must also be sent by mail to the address below. An email notice is received when it is sent, unless the sender learns that it was not delivered. A notice in the app is received when it is posted.

## Contact

Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States

Email: support@placetta.com

Website: placetta.com`;

const TERMS_ZH = `生效日期：${UPDATED}。如您已接受过上一版本，本版本自您在应用中接受之日起对您适用；如您在我们通过邮件或应用内通知您满 30 天后继续使用本服务，则自该日起适用，以两者中较早者为准。在此之前，继续适用上一版本。

本条款是您与 Placetta Inc.（中文名称“快哉”，下称“快哉”或“我们”）之间的协议，适用于您对 placetta.com、快哉应用，以及与快哉 AI 智能体 Odelia 之间的短信和通话（合称“本服务”）的使用。“您”指您所代表的企业及代表该企业使用本服务的人员。

您勾选表示同意本条款的复选框并继续，或点击表示接受本条款的按钮，即代表您所代表的企业接受本条款。如您不同意，请勿使用本服务。

**请仔细阅读本条款。本条款要求您与快哉通过具有约束力的个别仲裁解决争议，并放弃集体诉讼和陪审团审判（见“争议解决”）。您可以在 30 天内选择退出仲裁。本条款还排除了各项保证，并限制了双方的责任（见“免责声明”和“责任限制”）。**

## 谁可以使用

快哉面向企业。使用本服务，您须：

- 年满 18 周岁
- 为企业使用本服务，而非用于个人、家庭或家居用途
- 有权代表该企业行事，并有权使该企业受本条款约束

## 快哉提供什么服务

快哉帮助企业办理在美国开设和经营门店所需的执照、许可和登记。我们的 AI 智能体 Odelia 会：

- 梳理您的企业需要哪些执照
- 阅读您上传的文件，以及您连接的邮箱和文件
- 根据您的信息填写申请
- 跟踪截止日期和续期，并提醒您
- 起草消息
- 如您关联了手机，回复您的短信和来电
- 每天在机构网站和公开记录中查询您的申报进度
- 在您批准的时间预约检查
- 机构作出不利决定时，向您说明官方申诉途径及其期限，并起草您可能需要的材料

Odelia 在政府官方网站上查询相关要求，并注明所依据的机构来源。

## 一切以您的批准为前提

Odelia 不会自行提交、付款或发送任何内容。每一份申请、每一条消息，都须经您在应用中批准。

您批准申请后，快哉的软件会对照该机构的最新要求进行核对，再代表您提交：通过您连接的邮箱发送邮件、发送传真、寄送挂号信，或在该机构网站上使用您选择保存在快哉的登录信息提交。没有合适的自动渠道时，由我们的申报团队提交。如机构要求验证码（CAPTCHA）、身份核验、付款、宣誓声明或您的亲笔签名，快哉会暂停并请您处理；部分机构还要求本人到场。这些步骤由您自行完成。快哉从不输入银行卡号或银行账号，也从不发送社会安全号码（SSN）、个人纳税识别号（ITIN）或护照号码。

如我们善意地认为某项申报不准确、不完整、违法，或未经您的企业授权，快哉可以拒绝提交，并会告诉您原因，以便您更正。

您授予我们代为申报的有限权限，详见《申报授权书》。该授权书是本条款的一部分。

## 快哉可以代您做什么，以及何时可以做

Odelia 以及快哉的申报软件和团队，只在以下范围内代表您的企业行事：

- 无需每次询问：阅读您上传或连接的内容，在官方网站上查询要求和费用，在机构网站和公开记录中查询您的申报进度，跟踪截止日期，以及准备草稿供您审核。
- 须经您工作区的所有者在应用中批准该具体事项后才可进行：提交申报、以您企业的名义发送消息、在所有者选定的时间预约检查，或更改您所连接应用中的内容。每次批准只涵盖该一项事项。
- 已保存的机构登录信息，只在执行所有者已批准的事项（例如提交申报或预约检查）时才会打开，每次打开都会记入您的审计记录。登录信息由快哉的软件自行输入，AI 模型看不到密码。快哉绝不以您的名义开设机构账户。
- 绝不：支付政府规费、输入银行卡号或银行账号、代您签名、代您作出宣誓声明、提起申诉、代您出席听证或检查，或发送社会安全号码（SSN）、个人纳税识别号（ITIN）或护照号码。

只有您工作区的所有者才能作出上述批准。由您决定谁是所有者；所有者的批准即为您企业的批准。

## 监控与提醒

快哉会跟踪您工作区中各项执照和许可的到期和续期日期，并通过邮件、应用内通知以及（如您开启）短信或电话提醒您。监控与提醒是一项辅助服务，不能代替您自己的记录和日程。

- 快哉每天查询一次您向各机构提交的每项申报的进度，信息来自机构的公开记录、其进度查询页面或 Odelia 的查询，有变化时会通知您。如机构直接告知您的信息与我们的查询结果不同，以机构告知的为准。
- 无论您是否收到提醒，持有所需执照和许可、按时续期并遵守各机构的每一个截止日期，始终是您企业的责任。
- 快哉将尽商业上合理的努力，保持您工作区中日期的准确，并按时发送提醒。我们不保证能发现每一项要求、规则变化或截止日期，也不保证每一条提醒都能送达。
- 日期来自您的文件、各机构以及您告诉我们的信息。请自行核对；如发现日期有误，请告诉我们。机构可能不经通知即变更规则、费用和截止日期。

## Odelia 是 AI

Odelia 是软件，不是真人。

- 她生成的内容，包括执照清单、填好的申请、短信或电话中的回答以及提醒，可能有误或不完整。批准或依赖这些内容之前，请先审核，并查看所注明的来源。
- 每次通话时，Odelia 都会说明她是 AI，并告知通话会被转录。
- Odelia 不能通过短信或电话提交、付款、发送、批准或删除任何内容。这些操作只能在您批准后于应用中进行。
- 如所有者或管理员开启了记忆功能（默认关闭），Odelia 会提出关于您企业的简短记录，由所有者或管理员逐条批准。每条记录都注明来源和日期，让您了解 Odelia 为什么记住它。您的团队可以随时编辑或删除任何一条记录。如记录与您的申报、截止日期等档案不一致，以档案为准。
- 快哉会检查 Odelia 的工作：每一份申请在您批准前都会逐行核对；已完成的任务中，约五分之一会按固定规则（不使用 AI 模型）再次抽查，以便我们的团队发现并纠正错误。这些检查有帮助，但不能代替您的审核。
- 您批准的内容，由您负责。

## AI 模型与您的内容

- 快哉不会用您的内容训练 AI 模型。我们选择的 AI 提供方，其针对我们账户的条款不允许用我们发送的内容进行训练。我们的隐私政策列明了每家提供方、其接收的内容及其所在地。
- 目前尚未实现零数据保留。我们正在请每家 AI 提供方以书面形式确认零数据保留；快哉可以将 AI 处理限定于已作出确认的提供方。
- 为降低成本，提供方可能会将请求中固定不变的开头部分短暂保存在其提示缓存中，时间从几分钟到一小时不等，不会用于训练。
- Odelia 根据您的内容为您准备的成果，例如申请、草稿和消息，归您用于您的企业。类似的成果也可能为其他客户准备；快哉的软件、表格和指南仍归快哉所有。
- 快哉会为每项任务保留技术记录：运行了哪些工具、用时多久、花费多少。记录只包含名称和数字，不包含您的内容。我们用它来运行、修复本服务并为其定价。

## 短信与电话

您可以在“设置”中关联手机号，用来给 Odelia 发短信和打电话。关联时，您需要输入我们发送到该号码的验证码。

您关联号码并确认验证码，即表示您同意快哉就您的工作区向该号码发送短信和拨打电话，包括自动发送的短信和使用 AI 语音的电话。其中包括您发短信或来电时的回复，以及您在“设置”中开启的更新短信和紧急来电。

- 短信频率不定。更新短信和紧急来电遵守“设置”中显示的上限。回复您主动发来的短信和来电不计入上限。
- 可能产生短信和流量费用。
- 回复 STOP 可随时退订短信，回复 START 可重新开启。回复 HELP 获取帮助，或发邮件至 support@placetta.com。
- 同意接收短信和电话不是购买任何服务的条件。不关联手机也可以使用快哉。
- 紧急来电只有在您开启后才会拨打。
- 我们只向您验证过的号码发短信和打电话。如您不再使用该号码，请在“设置”中将其移除。
- 在您的免打扰时段（默认为您所在时区的晚 9 点至早 8 点，可自行更改），快哉不发送更新短信，也不拨打电话。您主动发短信或来电时，Odelia 仍会回复。
- 通话会被转录，以便 Odelia 理解您的话。您的短信和每次通话的记录随您的账户保存，详见我们的隐私政策。
- 运营商不对短信延迟或未送达负责。

您确认，您关联的号码归您所有，或您有权使用该号码。

## 与总部共享

工作区的所有者可以在“设置”中，以只读方式与总部邮箱（例如特许经营总部的邮箱）共享各门店的状态。用该邮箱登录快哉并完成邮箱验证的人可以查看这些状态，该邮箱每周还会收到一封摘要邮件。

- 总部可以看到工作区名称和品牌，以及每家门店的名称、地址和阶段、有效执照数量、30 天内到期和已逾期的事项数量、办理中的申请数量，以及下一个到期事项。
- 总部看不到您的文件、申请内容、机构登录信息、对话、与 Odelia 的短信或通话，也看不到您的团队成员。总部不能更改或批准任何内容。
- 您须确保自己有权与该总部共享这些信息（例如依据您的特许经营协议），并负责填写正确的邮箱。
- 所有者可以随时在“设置”中停止共享。已发送的摘要邮件无法撤回。

## 与推荐您的合作伙伴共享

如您的企业是通过合作伙伴（例如特许经营总部、经纪人、房东、投资人或会计师）的推荐码来到快哉的，快哉会询问您一次，是否允许该合作伙伴查看您的进展。

- 如您同意，合作伙伴只能看到您的企业名称、所处阶段、已获批许可数与总数，以及开业日期，其他一概看不到。
- 您可以随时在“设置”中更改。
- 快哉可能会将您所付费用的一部分支付给该合作伙伴，但这不会改变您的价格。

## 专业服务

快哉不是律师事务所、报关行或会计师事务所，不提供法律、海关、税务或会计意见。使用本服务不会在您与快哉之间建立律师与客户关系。

有些步骤依法只能由持牌专业人士办理，例如律师或持牌报关行。对于这些步骤：

- 快哉会为您介绍独立执业的专业人士。您直接聘请该专业人士，与其签订您自己的协议，并由其直接向您收费。
- 专业人士对其自身的工作和意见负责。快哉不指挥或控制其专业判断。
- 快哉不向律师收取介绍费，也不分享您支付给律师的任何费用。
- 海关申报由持牌报关行提交，而非快哉。
- 经您批准，快哉会向专业人士提供其所需的工作区信息。

如某城市要求某一步骤须由注册的申报代表或许可代办人办理，该步骤将由在当地注册的人员办理。

## 申诉与不利决定

如机构驳回申请、吊销执照或开出罚单，快哉可以向您说明官方的申诉途径、期限以及已有的材料。快哉不是您的律师。

- 快哉依据法规、规章或机构页面梳理申诉流程，注明出处，并按该规定计算期限，同时说明计算方法。未能在官方来源上确认的规定会标注为“未确认”，绝不会据此推算日期。以机构来函所载期限和法律规定为准，按时办理是您企业的责任。
- 快哉会起草您可能需要的材料，例如信函或证据清单，并注明每条规定的出处，供您或您的律师核对。草稿不是法律意见，也不代表您的法律立场。
- 快哉绝不提起申诉，绝不代您出席听证，绝不告诉您能否胜诉，也不对您的法律权利发表意见。
- 如建议或必须聘请律师（例如听证或法院诉讼），快哉可以为您选择的独立律师或我们为您介绍的律师准备一份材料包：决定内容、期限及其计算方法、申诉理由、已有证据和缺少的材料，以及需要律师解答的问题。材料包只有经您批准才会发送。律师按照您与其签订的协议为您服务，详见“专业服务”。

## 快哉不是什么

- 快哉不是政府机构，与任何政府机构均无隶属关系，也未获其背书。
- 申请能否获批、需要多长时间，由各机构决定。我们无法保证获批、办理时间、检查结果、申诉结果或开业日期。我们提供的时间、期限和费用均为估计。

## 政府规费

政府、机构和公证费用均按实际金额收取。您通过我们发送的付款链接，直接支付给各机构。快哉绝不加价，也绝不从中留取任何部分。专业人士直接向您收取的费用，也与快哉的服务费分开。

## 套餐与计费

快哉的服务费通过 Stripe 收取。以下价格适用于在本定价于 2026 年 10 月生效时尚不是快哉付费客户的所有工作区。您的工作区适用哪种定价，可在“设置”的“账单”中查看。下文“原有套餐”适用于当时已是付费客户的工作区。

- 门店方案：每家门店每月 149 美元，按年预付（每家门店每年 1,788 美元），或按月付费每家门店每月 179 美元，按工作区中的每家门店收取。包括跟踪每一项执照与续期日期、续期监控与规则变化提醒、您的文件库、供全团队使用的 Odelia 聊天，以及 Odelia 自行提交的每一项续期。
- 新执照：快哉提交的每一项新执照、许可或登记 299 美元，提交并跟踪至机构作出决定。
- 复杂执照：999 美元，仅限酒类执照、建筑图纸审查和进口许可。其他执照均不收 999 美元。
- 门店方案不包含的续期：99 美元。续期需要快哉团队处理（例如需要亲笔签名、只能邮寄，或没有 Odelia 可自行提交的渠道），或该门店未开通门店方案时，该续期不包含在方案中。
- 门店方案内有 10 家及以上门店：每一项新执照也都包含在内，不再按执照收费。
- 永不收费：属于某项许可一部分的检查、已计价执照中的步骤，以及员工自行取得的证书和培训。快哉免费跟踪这些事项。
- 计划预览免费，列出门店所需的执照及其费用和办理时间。
- 政府规费按实际金额收取，详见“政府规费”。
- 定制方案可另以双方接受的订单约定。如订单与本条款冲突，以何者为准，见“一般条款”中的“适用顺序”。

每笔费用在您批准前都会显示。应用会在所有者批准该项申报前，以中英文显示每项执照、复杂执照或续期的费用以及机构自身的规费，并且只在所有者批准时按所显示的价格收费。同一项申报绝不重复收费。如某项暂不能在线支付，我们的团队会向您报价，在您接受之前不收取任何费用。

服务费不含税。您须支付适用的销售税、使用税或类似税费，但对快哉所得征收的税除外。

如付款失败，我们在通知您后可以暂停该工作区的申报工作。

## 续费与取消

- 门店方案按相同价格自动续费（按年付费每年续费，按月付费每月续费），直到您取消。付款前，应用会在付款按钮旁显示这些续费条款，并请您同意。
- 每次续费前 15 至 45 天，我们会发邮件告知所有者续费金额和取消方式。
- 如续费时价格有变，我们会至少提前 30 天告知您。
- 您可以随时在“设置”的“账单”中在线取消：点一下即可，无需致电。取消会关闭下一次续费，在当前年度或月度期限结束时生效，在此之前您仍可使用本服务。
- 新执照、复杂执照和续期按项收费，只在所有者批准时收取，因此无需取消。

## 退款

- 门店方案费用按年或按月预付。取消会停止下一次续费，但不退还当期费用，除非“条款变更”另有规定或法律要求退款。
- 每项执照、复杂执照或续期费用对应该项申报。快哉提交该申报后，无论机构作出何种决定，该费用均不退还。
- 如快哉拒绝提交或无法提交您已付费的申报，且您不希望我们再次尝试，我们将退还该项申报的费用。请发邮件至 support@placetta.com 申请。
- 政府规费支付给机构，是否退还按机构的规定办理。

## 原有套餐

如您的工作区在门店方案定价生效时已是快哉的付费客户，您将保留所购买的套餐、价格及其包含的全部内容，以“设置”的“账单”和订单所示为准。门店方案定价不会改变您的套餐；只有经所有者书面同意，我们才会将工作区转为门店方案定价。这些套餐包括：

- 入门套餐：每个市场 299 美元，一次性付费。如您在支付入门套餐后 60 天内开通门店套餐，这笔费用可抵扣第一年的门店套餐费用；超过 60 天则不再抵扣。
- 基础版：每家门店每月 149 美元，按年预付，包括每家门店的跟踪、申报和续期。
- 专业版：每家门店每月 299 美元，按年预付，另含检查准备：每日记录、模拟检查、员工证书，以及更多的 Odelia 额度。
- 新店开业：每家零售新店 3,500 美元，每家餐厅或食品新店 6,500 美元，在门店尚未开业时加入即一次性收取。需要酒类执照或复杂装修的开业项目，在开始工作前单独报价。开业费用不抵扣门店套餐费用。
- 按期开业保障，仅适用于原有套餐：每个开业项目 2,500 美元，可选。我们会与您书面约定开业日期。如因快哉为您提交的许可导致门店晚于该日期开业，我们将退还该门店的开业费用。以下情况不适用：机构审核时间超出其公布时限；需由您或您的房东、承包商、专业人士完成的步骤；您提供的信息不完整或有误；检查、施工，或并非由我们提交的许可。保障费用本身不予退还。门店方案不提供按期开业保障。
- 品牌总部（10 家及以上门店）、海外品牌进入美国、功能模块以及多年期合约，以订单或“设置”的“账单”另行约定。

原有的门店套餐在每个年度期限结束时自动续订一年，直至您取消，详见“续费与取消”。除按期开业保障、“条款变更”的规定或法律要求退款外，其费用不予退还。

## Odelia 的合理使用

Odelia 是快哉的 AI 助理，专门为您的企业处理合规工作：执照、许可、登记、申报、检查、门店以及相关文件。她不是通用型 AI 助手。

- 每个套餐都包含一份 Odelia 额度，可在“设置”的“账单”中查看。在原有套餐中，专业版的额度是基础版的两倍，加量包（49 美元，含 25 美元额度）可增加额度，长期有效直到用完。额度用完后，截止日期、提醒和已在办理的申报照常进行；新的工作需等到下一个周期，或（原有套餐）购买加量包或升级套餐。
- 为保证所有用户的速度，每小时和每天可发起的任务数量有上限。
- 您不得使用本服务或 Odelia 的输出来构建、训练或改进其他 AI 模型；不得通过脚本、机器人或其他自动化方式访问本服务（我们提供的功能除外）；不得转售或共享访问权限；也不得试图绕过其限制或指令。

对违反上述规则的工作区，我们可以暂停其 Odelia 服务或关闭该工作区。

## 您的责任

您同意：

- 向我们提供准确、完整、最新的信息，并在信息变化时及时更新
- 仅代表您有权代表的企业行事
- 在批准前审核每一份申请和每一条消息
- 完成机构要求您本人办理的步骤，例如签名、付款或到场
- 保持执照和许可有效，并遵守各机构的截止日期
- 直接向各机构支付政府规费
- 合法使用本服务，只上传或连接您有权分享的内容，包括企业所有人、经理等他人的信息
- 只关联您拥有或有权使用的手机号
- 妥善保管登录信息；如怀疑他人进入了您的工作区，请发邮件至 support@placetta.com 告知我们
- 对 AI 助手的令牌保密，只给每个令牌所需的权限，并撤销不再使用的令牌

## 您的内容

您的文件和信息仍归您所有。您授予快哉有限许可，仅为向您提供本服务而使用、复制、存储和传输这些内容，包括在您批准申报时将其提交给相关机构，经您批准提供给您聘请的专业人士，按本条款所述提供给您共享的总部或合作伙伴，以及提供给隐私政策中列明的服务提供方。

我们不会用您的内容训练 AI 模型，不会出售您的内容，也不会将其用于广告。

如您向我们提出建议或反馈，我们可以使用，且对您不承担任何义务。

## 快哉的服务

快哉拥有本服务，包括其软件、指南和设计，但不包括您的内容。在您拥有工作区期间，您可以依照本条款为您的企业使用本服务。您不得：

- 复制、转售或再许可本服务
- 对本服务进行逆向工程，或用其开发竞争产品
- 抓取本服务、使其超负荷运行，或试图绕过其安全措施或使用限制
- 违反美国出口管制或制裁法律使用本服务；如您被列入美国政府禁止或限制交易的名单，不得使用本服务

## 连接的服务

您可以自行选择连接应用提供的服务，例如 Gmail、Google Calendar、Google Drive、Outlook Mail、Outlook Calendar、Microsoft Teams、Dropbox、QuickBooks、Slack、飞书、企业微信、钉钉，以及通过 MCP 连接的其他应用。我们只将这些服务用于您要求的任务。从已连接的应用读取信息可以自动进行；任何会更改该应用中数据的操作，都须等待所有者批准。这些服务由各自的提供方运营，适用其自身条款。您可以随时在“设置”中断开任何一项连接。

## 连接 AI 助手

所有者或管理员可以在“设置”中创建令牌，让您使用的 AI 助手（例如 Claude 或 ChatGPT）通过快哉的 MCP 服务器读取您的工作区。

- 每个令牌只能读取一个工作区，且只能读取为其选定的信息类别，例如门店状态、截止日期、准备情况或申报。令牌只读，不能提交、发送、付款、批准或更改任何内容。
- 令牌只在创建时显示一次。快哉只保存令牌的指纹，从不保存令牌本身。请像对待密码一样保管它。
- 用令牌进行的每次调用都会记入您的工作区。所有者或管理员在“设置”中撤销令牌后，或创建令牌的人不再是所有者或管理员时，令牌即失效。
- 您连接的助手由其提供方按其自身条款运营。该助手如何使用其收到的答复，由您与该提供方之间约定。
- 我们可以限制令牌的使用频率，也可以撤销被滥用或我们认为已泄露的令牌，并会告知您。

## 安全

快哉通过隐私政策“安全”一节以及我们的信任与安全页面 https://placetta.com/trust 所述的措施保护您的信息；该页面也列明了尚未完成的事项。快哉目前未持有 SOC 2 或任何其他安全认证。如发生安全事件导致您工作区的信息泄露，我们会在确认相关信息受影响后，及时并在 72 小时内通过邮件告知所有者，法律规定更短期限的，从其规定。

## 停止使用

- 您可以随时在“设置”的“账单”中取消套餐。
- 您可以按《申报授权书》的说明，随时撤销申报授权。
- 您可以在“设置”的“隐私与数据”中下载工作区数据，包括应用中显示的审计记录。
- 您可以在“设置”的“隐私与数据”中删除账户。这会删除您单独拥有的工作区，包括其中的文件、申报和审计记录，并让您退出其他工作区。如您单独拥有的工作区仍有付费套餐，请先取消。您也可以发邮件至 support@placetta.com，要求删除某个工作区。
- 法律要求我们保留的记录（例如账单记录）会继续保留。

如工作区违反本条款或法律，或未付款，我们可以暂停或关闭该工作区。除非法律不允许，或会对他人造成风险，我们会事先通知您。

已提交给机构的申请由该机构保存，快哉无法撤回。

## 免责声明

**在法律允许的范围内，本服务（包括 Odelia 生成的内容、执照清单、填好的申请、提醒和申报）按“现状”和“可用状态”提供，不附带任何形式的保证。快哉排除一切明示、默示或法定的保证，包括对适销性、特定用途适用性、所有权和不侵权的默示保证，以及因交易过程或行业惯例产生的任何保证。**

**快哉不保证本服务准确、完整、不会出错或中断，不保证我们梳理的执照清单完整，不保证能发现每一个截止日期或每一条提醒都能送达，也不保证任何机构会批准申请。**

本节不限制本条款明确作出的承诺，例如未经您批准，快哉绝不提交、付款或发送任何内容。

## 责任限制

**在法律允许的范围内：**

- **对于因本条款或本服务引起或与之相关的全部索赔，任何一方的赔偿责任总额合计不超过以下两者中的较高者：（A）引起索赔的事件发生前 12 个月内您就本服务向快哉支付的费用；（B）100 美元。政府规费和您支付给他人的费用不计算在内。**
- **对于间接、附带、特殊、后果性、惩戒性或惩罚性损失，以及利润、收入、租金、数据或商誉损失，即使一方已被告知可能发生，任何一方均不承担责任。**
- **对于任何机构的决定、行为或延误，申请被驳回或延误，执照或许可失效，以及由此产生的罚款、罚金、滞纳金、停业或延迟开业，快哉不承担责任。法律不允许上述排除的，这些损失适用上述赔偿上限。**

**无论基于合同、侵权（包括过失）、严格责任还是其他法律理论，即使某项有限救济未能实现其根本目的，上述限制均适用。**上述限制不适用于您的付款义务、您的赔偿义务，以及您违反“快哉的服务”或“Odelia 的合理使用”的行为。法律不允许限制或排除的责任（例如欺诈、重大过失、故意不当行为，或故意伤害他人人身或财产的责任），也不受上述限制。

快哉的收费已考虑上述限制。这些限制是您与快哉之间交易的重要基础。

## 您的赔偿责任

对于任何第三方索赔（包括政府机构提出的索赔或程序），以及由此产生的损失、罚款、罚金和合理的律师费，在其因下列情形引起的范围内，您须为快哉及其高级职员、员工和承包商进行抗辩并作出赔偿：

- 您向我们提供或经您批准的信息不准确、不完整或具有误导性
- 您批准或要求我们提交的申报或消息，涉及您无权代表的企业或个人
- 您无权上传、连接或分享的内容，或侵犯他人权利的内容
- 您违反法律或本条款

快哉会及时将索赔告知您，由您主导抗辩，并在您承担费用的前提下予以配合。未经快哉书面同意，您不得以代快哉承认过错或约束快哉的方式和解。

## 适用法律

本条款以及您与快哉之间的任何争议，均受纽约州法律管辖，不适用其冲突法规则。下文的仲裁约定受美国《联邦仲裁法》管辖。《联合国国际货物销售合同公约》不适用。

## 争议解决

**请仔细阅读本节。本节要求您与快哉通过具有约束力的个别仲裁（而非诉讼）解决争议，并放弃集体诉讼和陪审团审判。您可以按下文说明在 30 天内选择退出。**

先与我们沟通。在启动仲裁或诉讼之前，提出索赔的一方须向另一方发出书面通知，说明索赔内容及所要求的救济。通知须写明索赔方，并由索赔方或其律师签署。您的通知请发送至 support@placetta.com，并邮寄至下文地址。我们的通知将发送至您账户的邮箱。自通知送达之日起 30 天内，双方将本着诚意尝试非正式地解决争议；在这 30 天内，提出该索赔的任何期限暂停计算。

具有约束力的仲裁。如争议在这 30 天内未能解决，任何一方均可启动仲裁。因本条款、本服务或您与快哉之间的关系引起或与之相关的任何争议、索赔或纠纷，无论基于合同、侵权、法规还是其他理论（下称“争议”），均通过具有约束力的仲裁解决，由美国仲裁协会（AAA）依据仲裁开始时有效的《商事仲裁规则》以及（在适用时）《大规模仲裁补充规则》管理，由一名仲裁员审理。仲裁地为纽约州纽约县；经仲裁员同意，可以通过视频开庭。仲裁员可以给予法院可给予的任何个别救济，并将作出附理由的书面裁决。对仲裁裁决的判决可由任何有管辖权的法院作出。

由谁决定可仲裁性。有关本仲裁约定的解释、范围、适用、效力和可执行性的一切问题，包括某项争议是否必须仲裁，均由仲裁员决定。法院仅决定本仲裁约定是否成立、下文禁止集体和代表人程序的约定能否执行，以及“例外情形”交由法院处理的事项。

费用。AAA 的立案费、管理费和仲裁员报酬由谁承担，依 AAA 规则确定。如您向仲裁员证明，与诉讼相比，这些费用对您而言过高、难以承受，快哉将承担仲裁员认定为避免这种情况所必需的部分。各方自行承担律师费，但仲裁员依法律或 AAA 规则裁决的除外。

**仅限个别索赔。您和快哉只能以个别方式向对方提出索赔，不得以原告或成员身份参与任何集体诉讼、集合诉讼、合并程序或代表人程序。仲裁员不得合并或并入多个客户的索赔，不得主持任何形式的集体或代表人程序，且只能向寻求救济的个别当事人、并仅在其个别索赔所需的范围内给予救济。**

大规模仲裁。如由相同或相互协调的律师或组织提起或协助提起 25 件或以上涉及快哉或其关联方的类似仲裁申请，则适用 AAA《大规模仲裁补充规则》，并由 AAA 的程序仲裁员决定该规则交其决定的程序问题。除非该程序仲裁员另有决定：

- 申请按每批最多 50 件分批管理，每批由一名实体仲裁员审理，并按一套 AAA 费用收费
- 同一批次中的每项索赔仍根据其自身事实和法律裁决，任何一名索赔方案件中的裁决，均不约束未参与该案的索赔方
- 在 AAA 能够安排的情况下，各批次同时进行，双方将本着诚意考虑整体调解
- 后续批次中索赔的提出期限，在该批次开始前暂停计算
- 每项申请均须满足“先与我们沟通”中的通知要求

选择退出。您可以在首次接受包含本退出条款的本条款版本后 30 天内，选择退出本仲裁约定。退出方式为：用您账户的邮箱发邮件至 support@placetta.com，主题注明“Arbitration opt-out”（退出仲裁），并写明您的姓名、企业名称，以及您选择退出仲裁的明确声明。选择退出不影响本条款的其他内容，也不影响您使用本服务。选择退出后，争议将由下文所列法院裁决。您就上一版本发出的退出通知继续有效。

例外情形。符合条件的个别索赔，任何一方均可向小额索赔法院提起，只要该索赔留在该法院审理。为保护其知识产权或保密信息，或为制止对本服务的滥用，任何一方也可以向纽约州纽约县的州法院或联邦法院申请禁令或其他衡平救济。如某项索赔请求公共禁令救济，而适用的法律不允许放弃该救济或不允许通过仲裁裁决该救济，该请求将在个别索赔仲裁完毕后由上述法院裁决，在此之前法院程序暂停。

**放弃陪审团审判。在法律允许的范围内，对于由法院审理的任何争议，您和快哉均放弃由陪审团审判的权利。**

法院。对于不通过仲裁解决的任何争议，您和快哉同意由纽约州纽约县的州法院和联邦法院专属管辖。

集体程序禁止无法执行时。如法院（在用尽上诉程序后）认定，禁止集体和代表人程序的约定对某项索赔不能执行，则该索赔（且仅限该索赔）将被分离出来，由上述法院审理，而不通过仲裁解决，并在个别索赔仲裁完毕前暂停审理。仲裁员在任何情况下都无权审理集体或代表人程序。本节其余内容仍然适用。

您停止使用本服务后，本节继续适用。

## 条款变更

我们可能更新本条款。更新后，我们会在 placetta.com 和应用中发布新版本并标注新日期。

- 对于重大变更，我们会至少提前 30 天通过邮件或应用内通知告知您，并概述变更内容。
- 我们还会请您在应用中审阅并接受更新后的条款。在您接受之前，您仍可打开和查看您的工作区，但不能在应用中批准任何新的事项，例如申报或消息。
- 更新后的条款自您在应用中接受之日起对您适用；如您在通知所载生效日期之后继续使用本服务，则自该生效日期起适用，以两者中较早者为准。
- 如您不同意，请在生效日期前停止使用本服务并取消套餐。如您因对您不利的重大变更而取消，请在变更生效后 30 天内发邮件至 support@placetta.com 告知我们，我们将退还您为剩余期限预付的费用。
- 其他变更（例如文字澄清、为新功能所作的更新或法律要求的变更）自发布时生效。
- 对“争议解决”一节的变更，不适用于在变更生效前已经产生、或任何一方已发出通知的争议。这些争议继续适用其产生时有效的版本。

## 电子通讯与电子签名

您同意以电子方式与快哉开展业务。

- 您同意快哉以电子方式（发送至您账户的邮箱或在应用中）向您提供本条款、通知、披露、发票及其他通讯。这些电子通讯满足法律关于书面形式的任何要求。
- 勾选复选框或点击按钮接受本条款、在应用中批准事项，以及在应用中签名，均构成您的电子签名，与您的亲笔签名具有同等效力，并依据美国联邦《全球和国内商务电子签名法》（E-SIGN）、纽约州《电子签名和记录法》、加利福尼亚州《统一电子交易法》及类似法律具有法律约束力。
- 快哉会保存每次接受的电子记录，包括账户、版本、时间，以及（如可获得）IP 地址和浏览器信息。您同意该记录可作为您接受本条款的证据。
- 您可以随时在 placetta.com 或应用中阅读、下载和打印现行条款。如需您接受过的某一版本的副本，可发邮件至 support@placetta.com 索取。
- 使用本服务，您需要一台装有最新网页浏览器的设备，以及一个您会查看的邮箱。您可以发邮件至 support@placetta.com 撤回本同意；但由于快哉是在线服务，撤回同意即意味着您将停止使用本服务。撤回不影响此前已完成的事项。

## 一般条款

- 适用顺序：如下列文件相互冲突，按以下顺序适用：（1）双方接受的订单，但仅限于其所涵盖的方案，且仅限于订单明确指出其所变更的本条款内容；（2）《申报授权书》，仅限于快哉代您申报的权限范围；（3）本条款，适用于其他一切事项，包括免责声明、责任限制和争议解决；（4）隐私政策。
- 转让：未经我们书面同意，您不得转让本条款，但转让给承继您全部或大部分业务并同意本条款的继受方除外。快哉可以将本条款转让给其关联方，或在合并、收购或出售其全部或大部分业务时转让。
- 完整协议：本条款、《申报授权书》、隐私政策以及双方接受的任何订单，构成关于本服务的完整协议，取代此前关于本服务的协议和提案。您的采购订单中的条款不适用。除按“条款变更”所述方式外，对本条款的修改须以书面形式作出并经双方签署（可以电子方式签署）。
- 可分割性：如法院或仲裁员认定本条款的某部分不可执行，该部分在法律允许的范围内执行，其余部分继续有效。禁止集体和代表人程序的约定不能执行时如何处理，见“争议解决”一节。
- 不弃权：任何一方未行使某项权利，不代表放弃该权利。
- 不可控事件：因超出其合理控制范围的事件造成的延误或未能履行，任何一方均不承担责任，例如机构系统中断，机构网站、申报平台或表格变更，法律或机构规则变更，政府停摆，运营商、互联网或我们的服务提供方故障，自然灾害，疫情，战争或劳资纠纷。但这不免除付款义务。
- 独立承包方：除《申报授权书》中的有限授权外，任何一方都不是另一方的代理人、合伙人、合营方或雇员。
- 无第三方受益人：本条款仅为您和快哉的利益而订立。除“您的赔偿责任”所保护的人员外，任何其他人均不享有本条款下的权利。
- 持续有效：您停止使用本服务后，以下内容继续有效：欠付的费用，“您的内容”中关于反馈的许可，“快哉的服务”，“免责声明”，“责任限制”，“您的赔偿责任”，“适用法律”，“争议解决”，“电子通讯与电子签名”，“通知”，本一般条款，以及按其性质应继续有效的其他内容。
- 标题与解释：标题仅为方便阅读，不影响本条款的含义。“包括”和“例如”均指“包括但不限于”。“天”指自然日。本条款应公平解释，不因由某一方起草而作出对其有利或不利的解释。
- 语言：本条款有中英文两个版本。如两者不一致，以英文版本为准。

## 通知

我们会向您账户的邮箱或在应用中向您发送通知。请保持该邮箱地址为最新。给快哉的通知请发送至 support@placetta.com。争议通知或其他法律通知还须邮寄至下文地址。邮件通知自发送时视为送达，除非发送方得知其未能送达。应用内通知自发布时视为送达。

## 联系我们

Placetta Inc.，9 W 57th St, Fl 48, New York, NY 10019, United States

邮箱：support@placetta.com

网站：placetta.com`;

const PRIVACY_EN = `Effective date: ${UPDATED}.

This policy explains how Placetta Inc. ("Placetta", "we") handles information when people visit placetta.com, and when businesses use the Placetta app and text or call Odelia, Placetta's AI agent. Placetta is a service for businesses. Most of the information we handle comes from businesses and the people who act for them.

## What we collect

- Account information: your email address, your name if you sign in with Google or Microsoft (we receive only your basic profile), the workspaces you belong to and your role, and whether two-step sign-in is on.
- Records of your acceptance of our Terms of Service, Privacy Policy and Filing Authorization: which version, when, and the IP address and browser you used.
- Workspace information: details about your business, and about people in it such as owners and managers, that you give us so we can fill applications.
- Documents you upload, and the applications and messages prepared in your workspace.
- Your conversations with Odelia and your approvals, including your signature when you sign a form in the app.
- Agent memory, only if an owner or admin turns it on (it is off by default): short notes about your business that Odelia suggests and your team approves, such as a store's landlord requirements or how owners like to be reached, each with where it came from and when, so you can see why Odelia remembered it. Memory never keeps ID numbers, card or bank numbers, passwords or sensitive details. You can see, edit and delete every note in Settings, and keep a conversation out of memory.
- Texts and calls with Odelia, if you link a phone. See "Texts and calls" below.
- The audit trail: a record of every action by Odelia, by you, by our team and by agencies.
- Agency portal logins you choose to save, encrypted in a vault.
- Filing status records: what an agency's public records or status page showed about your filings, and when we checked.
- Inspection bookings: the times offered, the one an owner approved, and the result.
- Appeal records: the decision you received, the deadline we counted, and drafts prepared for you or your attorney.
- AI assistant tokens: for each token an owner or admin makes, its name, what it may read, who made it and when it was last used, and a record of each call. We keep only a fingerprint of the token, never the token itself.
- Technical records of tasks: which tools ran, how long they took and what they cost. They hold names and numbers, not your content.
- Partner referrals: the partner whose code brought you to Placetta, and whether you agreed to share your progress with them.
- Headquarters email addresses that an owner shares store status with.
- Payment details, which Stripe handles. We never see full card numbers.
- Information from services you choose to connect, used only for the tasks you ask for.
- Plan requests on placetta.com: the market, industry, headquarters country, opening timing and number of locations you enter, your email address or WeChat ID, and, if you add them, your company, website and preferred language.
- Technical information: our hosting and database providers keep standard request logs, such as IP address, browser type and time, for security and troubleshooting. We count views of our guide and help pages per page, not per person. The website remembers your language choice in your browser.

## How we use it

We use information only to provide Placetta to you:

- map the licenses your business needs and fill applications
- read your documents and track deadlines and renewals
- draft messages for you to approve
- check and submit the applications you approve
- check the status of your filings every day, and book the inspections an owner approves
- show the official way to appeal a decision, count its deadline and prepare drafts
- send you agency payment links
- answer your texts and calls, and send the update texts and urgent calls you turn on
- send the weekly headquarters summary an owner sets up
- answer the AI assistants you connect with a token
- bill you for your plan
- keep your audit trail
- check a sample of finished tasks for mistakes, and fix what we find
- measure what the service costs to run, to price it and set fair limits
- reply to plan requests and support requests
- keep the service secure and prevent misuse
- meet our legal obligations

We do not sell personal information. We do not use it for advertising. We do not use your content to train AI models.

## Who processes it

These companies process your information for us, only to run the service. The list is taken from our code. Each line says what the company does for us and where it is based; it may also process information in other countries where it operates, as "International transfers" explains. A company marked "when used" or "if you connect it" receives nothing until that feature is on or you connect it. Our trust page lists the same companies, with more detail: https://placetta.com/trust

- Supabase (United States; your data is stored in its US East region): stores your workspace, documents, texts and audit trail, and runs sign-in and our server functions.
- Vercel (United States): hosts placetta.com and the app.
- Google Fonts (United States): serves the typefaces on placetta.com and in the app. It sees your IP address and browser, nothing else.
- Stripe (United States): processes payments.
- Resend (United States): sends our emails, such as sign-in links, deadline reminders, filing updates and headquarters summaries, and can receive email sent to Odelia.
- Anthropic (United States): processes content with its Claude models: Odelia's work when no other model is set up or can answer, the review of finished work, web research, and filing on agency websites. It may receive your files.
- Google Gemini (United States), when used: processes content with Gemini models for Odelia's work, including your files, only on Google's paid tier.
- Groq (United States), when used: runs a backup open model. It never receives your files.
- Cerebras (United States), when used: runs a backup open model. It never receives your files.
- OpenRouter (United States), when used: runs a backup open model on a host it picks. It never receives your files.
- OpenAI (United States): its models can be switched on, and are off by default.
- DeepSeek (China): its models can be switched on, and are off by default. DeepSeek never receives your files.
- Telnyx (United States), when used: carries texts and calls with Odelia, runs her voice, speech recognition and AI model on calls, and sends the applications we file by fax.
- Linq (United States), when used: carries texts with Odelia over iMessage, with RCS and SMS as fallback.
- Meta (United States), when used: carries messages with Odelia on WhatsApp.
- Postmark (United States), when used in place of Resend: sends and receives email for Odelia.
- Lob (United States), when used: prints and mails the applications we file by mail.
- Microsoft Azure Speech (United States), when used: turns Odelia's replies into speech for the app to read aloud.
- Render (United States; our software runs in its Oregon region), when used: runs the software that files on agency websites and books inspections there.
- Browserbase (United States), when used: provides the web browser that software can use.
- Google (United States), if you connect it: sign-in with Google, Gmail, Google Calendar and Google Drive.
- Microsoft (United States), if you connect it: sign-in with Microsoft, Outlook Mail, Outlook Calendar and Microsoft Teams.
- Dropbox (United States), if you connect it: importing documents.
- Intuit QuickBooks (United States), if you connect it: reading gross receipts for tax registrations.
- Slack (United States), if you connect it: status updates, and asking Odelia in Slack.
- Lark (Singapore) or Feishu (China), if you connect it: status updates, and asking Odelia in Lark.
- WeCom, by Tencent (China), if you connect it: status updates to a group you choose.
- DingTalk, by Alibaba (China), if you connect it: status updates to a group you choose.
- WeChat, by Tencent (China), if you connect your business's own WeChat Official Account: carries your team's messages with Odelia.
- Toast (United States) and Square (United States), if you connect one: we read sales by location and staff schedules and hours, read only, for tax returns, permits whose fee depends on sales, and work-hour rules.
- Other apps you connect through MCP, such as Notion, Airtable, Box, HubSpot, Linear, Asana or Zapier: each receives the requests Odelia sends it, which can include details from your workspace.

We add a company to this list, and to our trust page, before it receives customer information.

Beyond these companies:

- Placetta checks and submits the applications you approve, by email, fax, certified mail or the agency's website, with our filing team as backup.
- Government agencies receive the applications you approve and the inspection requests an owner approves.
- Independent professionals you engage, such as attorneys and customs brokers, receive what they need, with your approval.
- A headquarters an owner shares with sees the store status described below.
- A partner who referred you sees your progress, if you agree, as described below.
- An AI assistant you connect with a token receives the answers to what it asks, under its provider's terms, which you accepted with that provider.
- To check that email sent to Odelia really comes from you, we look up public email signing keys through Cloudflare's and Google's public DNS. They receive only the domain name being looked up.

We may also disclose information when the law requires it, to protect the rights and safety of people or of Placetta, or to a successor in a merger, acquisition or sale of Placetta's business, which must keep honoring this policy.

## AI models

- Placetta doesn't use your content to train AI models, and doesn't sell it.
- We choose AI providers whose terms for our account don't allow training on what we send. Anthropic's commercial terms don't allow it to train on what we send. We use Gemini only on Google's paid tier, whose terms say prompts aren't used to improve Google's products. OpenRouter is asked to use only hosts that don't keep or train on prompts. Written confirmation from each backup provider is in progress, and our trust page shows where it stands.
- Zero data retention is not in place today. We are asking each AI provider to confirm zero data retention in writing, and Placetta can limit AI processing to providers that have.
- To save cost, a provider may keep the unchanging start of a request in its prompt cache for a short time, from minutes to an hour. It is not used for training.
- Automatic checks: every application is checked line by line before an owner can approve it, and a sample of finished tasks, about 1 in 5, is checked again by fixed rules, without an AI model. When a check finds a problem, our team may look at that task to fix the cause.

## Integrations

Integrations are optional. You decide which ones to connect, and we use each only for the tasks you ask for:

- Gmail and Outlook Mail: find agency emails and send messages you approve.
- Google Calendar and Outlook Calendar: add deadlines to your calendar.
- Google Drive and Dropbox: import documents.
- QuickBooks: read gross receipts for tax registrations.
- Slack, Lark, WeCom, DingTalk and Microsoft Teams: post status updates to a group you choose. In Slack and Lark, your team can also ask Odelia for help.

You can disconnect any integration at any time in Settings.

Placetta's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements: https://developers.google.com/terms/api-services-user-data-policy

- We use Gmail, Google Calendar and Google Drive data only to provide the features you use in Placetta, as listed above.
- We don't use it for advertising, and we don't sell it.
- People at Placetta don't read it, except with your permission, for security, or where the law requires.
- We don't use it, or any other customer content, to train or improve AI models. We choose AI providers whose terms for our account don't allow training on what we send, as "AI models" above explains.
- We store Google data in the United States with our hosting provider. Your Google access is deleted when you disconnect. Files and emails you choose to import become documents in your workspace, kept until you delete them or your account.

## Connecting an AI assistant

An owner or admin can make a token in Settings that lets an AI assistant, such as Claude or ChatGPT, read the workspace through Placetta's MCP server. Each token reads one workspace, only the kinds of information chosen for it, and can't change anything. We keep only a fingerprint of the token, and record each call in the workspace. The assistant's provider handles the answers under its own terms and privacy policy. An owner or admin can revoke a token at any time in Settings.

## Agency portal logins

If you save logins for agency websites, they are encrypted in a vault. Placetta's filing software, and our filing team when it takes over, open them only to do what an owner approved, such as filing or booking an inspection, and every opening is recorded in your audit trail. The software types the login itself; the AI model never sees the password.

## Texts and calls

If you link a phone to text and call Odelia, we collect:

- your mobile number, time zone, language and quiet hours, and which texts and calls you turned on
- consent records: when you confirmed the number with the texted code, and when you replied STOP or turned texts or calls off
- the texts you send Odelia and the texts she sends you
- a record of each call: whether you or Odelia called, when, and how long it lasted
- what you ask Odelia to do by text or on a call, which starts work in your workspace like a request in the app, and her answers

Calls use an AI voice and are transcribed as they happen so Odelia can understand you. Telnyx, and the speech services it uses, process the call audio and transcription to run the call. Placetta does not record call audio.

We use this information only to answer you, do what you ask, send the update texts and urgent calls you turned on, check that a caller is you, and keep a record of your consent.

Your texts and call records are kept while your account exists and are deleted when you delete it. Consent records are kept for 5 years, even after you delete your account, so that we can show your consent if it is ever questioned. You can see recent texts and calls in Settings. Removing your number in Settings stops texts and calls to it and cancels any that are waiting.

We do not sell or share mobile numbers or text consent with third parties for their marketing.

## Headquarters sharing

An owner of a workspace can share its stores' status with a headquarters email address in Settings. If they do:

- We store that email address and the brand name the owner enters.
- A person who signs in to Placetta with that email address, after confirming it, sees one read-only line per store, and the address gets a summary email each Monday.
- What is shared: the workspace name and brand, and for each store its name, address and stage, how many licenses are current, due within 30 days or overdue, how many applications are pending, and the next item due with its date.
- What is not shared: documents, the contents of applications, agency logins, conversations, texts and calls with Odelia, Odelia's memory, or who is on the team.
- An owner can stop sharing at any time in Settings. Access ends and the weekly email stops. Emails already sent cannot be recalled.

## Sharing with a partner who referred you

If your business came to Placetta through a partner's referral code, we record that partner and ask you once whether it may see your progress. If you agree, it sees only your business name, your stage, how many permits are approved out of the total, and your opening date. You can change this in Settings at any time, and the partner's view empties when you do.

## International transfers

Placetta is based in the United States. We store your information in the United States, and our processors handle it in the United States and, for some of them, in other countries where they operate. Some of the companies listed above are based outside the United States, as each line says, and receive information only when that feature is on or you connect it. When we configure Odelia to use a model from another provider, that provider may process content in its own country.

If you are in the People's Republic of China, or you give us personal information about people there:

- That information is transferred to Placetta Inc. in the United States and processed as this policy describes. By using the service, you consent to that transfer.
- The overseas recipient is Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States, support@placetta.com. The purposes, methods and kinds of information are those described in this policy.
- Some documents, such as identity documents, contain sensitive personal information. We use it only to prepare the filings you ask for.
- Where PRC law requires it, we rely on the PRC standard contract for the cross-border transfer of personal information.
- You can access, copy, correct or delete that information, or withdraw your consent, by following "Making a privacy request" below. Withdrawing consent does not affect what was done before, but we may no longer be able to provide the service.
- If you give us personal information about other people in China, you are responsible for telling them and for getting any consent PRC law requires.

## Retention

- Workspace information and documents are kept while the workspace exists. They are deleted when the workspace is deleted, including when its only owner deletes their account.
- The audit trail is kept while the workspace exists and, as proof of what was approved and filed, for up to 7 years after the workspace is deleted.
- Filing status records, inspection bookings, appeal records, AI assistant call records and technical records of tasks are kept while the workspace exists, and are deleted with it. A daily cleanup that removes the ones we no longer need sooner, such as Odelia's working notes a year after a task finishes, is rolling out; our trust page shows where it stands.
- Account information, texts and call records are kept while your account exists, and are deleted when you delete it.
- Agent memory is kept until your team deletes it, clears it with Forget all, or the workspace is deleted. Suggestions nobody approves expire after 30 days.
- Records of your acceptance of our terms and policies are kept for 6 years after your account ends, and consent records for texts and calls for 5 years, even after you delete your account, as proof of the agreement and of your consent.
- Plan requests from placetta.com are kept while we need them to follow up, or until you ask us to delete them.
- We keep records the law requires us to keep, such as billing records, for as long as it requires.

Applications already submitted to an agency are held by that agency under its own rules.

## Security

Placetta doesn't hold SOC 2 or any other security certification today. What we do:

- Information is encrypted in transit, and encrypted at rest by our hosting and database providers.
- Agency portal logins are encrypted in a vault. They are opened only to do what an owner approved, and each opening is logged. The AI model never sees the password.
- Tokens for AI assistants are kept only as a fingerprint, are read only, and can be revoked at any time.
- You can turn on two-step sign-in, and a PIN for sensitive settings, in Settings. Placetta's team must use two-step sign-in to reach customer records and saved logins.
- Card numbers are handled by Stripe. We never see full card numbers.
- The audit trail records every action by Odelia, by you, by our team and by agencies.
- Nothing is filed, paid or sent without your approval.
- If a security incident exposes your workspace's information, we tell the owners by email without undue delay, and within 72 hours of confirming that their information was involved, unless the law sets a shorter time.

No system is perfectly secure. If you think someone else has accessed your workspace, email support@placetta.com. Our trust page says what is in place and what isn't finished yet: https://placetta.com/trust

## Your choices and rights

- Download your workspace data, including the audit trail entries shown in the app, in Settings, Privacy and data.
- Delete your account in Settings, Privacy and data. This deletes the workspaces you own alone. You can also ask us to delete a workspace or your data by emailing support@placetta.com.
- Disconnect integrations, and revoke tokens for AI assistants, in Settings.
- Turn agent memory off, or delete what it holds, in Settings.
- Turn texts or calls off, change quiet hours or remove your number in Settings, or reply STOP.
- Stop sharing with headquarters, or with a partner who referred you, in Settings.
- Revoke your Filing Authorization, as it explains.

## US state privacy rights

Depending on the state you live in, such as California, its law may give you rights over your personal information, such as the right to:

- know what we collect and access it
- get a copy in a portable format
- correct it
- delete it
- opt out of its sale or sharing, targeted advertising or certain profiling
- limit the use of sensitive personal information

What California law asks us to tell you, for the last 12 months:

- Categories we collect: identifiers (such as name, email address, phone number and IP address); commercial information (such as your plan and payments); internet activity on our website and app; professional information about the business and the people in it; audio of calls, transcribed as they happen and not recorded; and sensitive personal information: agency account logins you save, and government ID numbers or documents that appear in what you upload.
- Sources: you and your team, the documents and services you connect, agencies' public records, and the partner who referred you.
- Purposes: those in "How we use it".
- Disclosed for a business purpose to: the companies in "Who processes it", agencies when an owner approves a filing, and the professionals, headquarters and partners described above.
- We do not sell or share personal information, as California law uses those words, and we did not in the last 12 months. Our website and app have no advertising or cross-site tracking cookies. We do not use personal information for targeted advertising or for profiling that has legal or similarly significant effects. We use sensitive personal information only to provide the service you ask for.
- How long we keep each category: see "Retention".

We will not treat you differently for using these rights.

## People in the EEA, UK and Switzerland

If you are in the European Economic Area, the United Kingdom or Switzerland, or your business has stores there:

- For information a business puts in its workspace, that business decides what is processed and why, and Placetta processes it for the business. For account, website and billing information, Placetta Inc. decides, and is responsible for it.
- We rely on these legal bases: performing our contract with your business; our legitimate interests in keeping the service secure, fixing problems and preventing misuse; meeting legal obligations; and your consent, for texts and calls and for anything else we ask your consent for. You can withdraw consent at any time.
- You have the rights to access, correct, delete, restrict, object to and get a portable copy of your personal information, and to complain to your data protection authority.
- Your information is transferred to the United States and to the other countries named in "Who processes it".

## Making a privacy request

- Email support@placetta.com with "Privacy request" in the subject, or write to the address below. Say what you are asking for and which account or business it concerns. Requests are free.
- We may need to verify your identity first, usually by confirming the email address on your account. Where the law allows, someone you authorize can make the request for you, with proof of that authority.
- We confirm that we received your request within 10 business days, and respond within 45 days. If we need more time, we will tell you why and take up to 45 more days. Where the law that applies to you sets a shorter time, we meet it.
- If the request is about information a business put in its workspace, such as an application that names you, we may refer it to that business, which controls that information, and help it respond.
- If we decline a request, we will tell you why. You can appeal by replying to our decision, and we will answer within 60 days. If we deny your appeal, you can contact your state attorney general.

## Age

Placetta is only for people 18 or older who act for a business.

## Changes to this policy

When we update this policy, we will post the new version here with a new date. For a material change, we will also tell you by email or in the app before it takes effect.

## Contact

Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States

Email: support@placetta.com`;

const PRIVACY_ZH = `生效日期：${UPDATED}。

本政策说明访客浏览 placetta.com，以及企业使用快哉应用、给快哉的 AI 智能体 Odelia 发短信或打电话时，Placetta Inc.（下称“快哉”或“我们”）如何处理相关信息。快哉是面向企业的服务，我们处理的信息大多来自企业及代表企业行事的人员。

## 我们收集哪些信息

- 账户信息：您的邮箱地址；若使用 Google 或 Microsoft 登录，还包括您的姓名（我们只获取基本资料）；您所属的工作区和角色；以及是否开启了两步登录。
- 您接受我们的《服务条款》、隐私政策和《申报授权书》的记录：接受的版本、时间，以及您使用的 IP 地址和浏览器。
- 工作区信息：为填写申请，您向我们提供的企业信息，以及企业所有人、经理等相关人员的信息。
- 您上传的文件，以及在您工作区中准备的申请和消息。
- 您与 Odelia 的对话和您的批准记录，包括您在应用中签署表格时的签名。
- 助理记忆，仅在所有者或管理员开启后才会使用（默认关闭）：由 Odelia 提出、经您的团队批准的关于企业的简短记录，例如门店房东的要求或所有者偏好的联系方式，每条都注明来源和日期，让您了解 Odelia 为什么记住它。记忆不会保存证件号、卡号、银行账号、密码或敏感信息。您可以在“设置”中查看、编辑和删除每一条记录，也可以让某次对话不被记住。
- 如您关联了手机，您与 Odelia 之间的短信和通话，详见下文“短信与电话”。
- 审计记录：Odelia、您、我们的团队和各机构的每一项操作。
- 您选择保存的机构网站登录信息，加密存放在保险库中。
- 申报进度记录：机构的公开记录或进度查询页面显示的您的申报情况，以及我们查询的时间。
- 检查预约：提供的可选时间、所有者批准的时间以及检查结果。
- 申诉记录：您收到的决定、我们计算的期限，以及为您或您的律师准备的草稿。
- AI 助手令牌：所有者或管理员创建的每个令牌的名称、可读取的内容、创建人和最近使用时间，以及每次调用的记录。我们只保存令牌的指纹，从不保存令牌本身。
- 任务技术记录：运行了哪些工具、用时多久、花费多少。记录只包含名称和数字，不包含您的内容。
- 合作伙伴推荐：通过其推荐码将您带到快哉的合作伙伴，以及您是否同意与其共享进展。
- 所有者与之共享门店状态的总部邮箱地址。
- 付款信息，由 Stripe 处理。我们看不到完整卡号。
- 您选择连接的服务中的信息，仅用于您要求的任务。
- 在 placetta.com 提交的方案申请：您填写的市场、行业、总部所在国家或地区、开业时间和门店数量，您的邮箱地址或微信号，以及（如您填写）公司名称、网站和偏好语言。
- 技术信息：我们的托管和数据库服务提供方会保存标准的访问日志，例如 IP 地址、浏览器类型和时间，用于安全和排查问题。我们按页面（而非按人）统计指南和帮助页面的浏览次数。网站会在您的浏览器中记住您选择的语言。

## 我们如何使用这些信息

我们只为向您提供快哉服务而使用这些信息：

- 梳理您的企业所需的执照，并填写申请
- 阅读您的文件，跟踪截止日期和续期
- 起草消息供您批准
- 核对并提交您批准的申请
- 每天查询您的申报进度，并预约所有者批准的检查
- 说明对不利决定的官方申诉途径，计算其期限并准备草稿
- 向您发送机构付款链接
- 回复您的短信和来电，并发送您开启的更新短信和紧急来电
- 发送所有者设置的每周总部摘要
- 答复您用令牌连接的 AI 助手
- 收取套餐费用
- 保存您的审计记录
- 抽查已完成的任务，发现并纠正错误
- 衡量运行本服务的成本，用于定价和设定合理的使用上限
- 回复方案申请和支持请求
- 保障服务安全，防止滥用
- 履行我们的法定义务

我们不出售个人信息，不将其用于广告，也不用您的内容训练 AI 模型。

## 谁会处理这些信息

以下公司代我们处理您的信息，且仅为运行本服务。这份名单取自我们的代码。每一行都说明该公司为我们做什么以及其所在地；该公司也可能在其运营所在的其他国家处理信息，详见“跨境传输”。标注“按需使用”或“您连接后”的公司，在该功能开启或您连接之前不会收到任何内容。我们的信任与安全页面列出了同样的公司，并有更多说明：https://placetta.com/trust

- Supabase（美国；您的数据存储在其美国东部区域）：存储您的工作区、文件、短信和审计记录，并提供登录服务和我们的服务器功能。
- Vercel（美国）：托管 placetta.com 和快哉应用。
- Google Fonts（美国）：为 placetta.com 和快哉应用提供字体。它只能看到您的 IP 地址和浏览器信息。
- Stripe（美国）：处理付款。
- Resend（美国）：发送我们发出的邮件，例如登录链接、截止日期提醒、申报进展和总部摘要，也可以接收发给 Odelia 的邮件。
- Anthropic（美国）：通过其 Claude 模型处理内容：在没有设置其他模型或其他模型无法回答时承担 Odelia 的工作，复核已完成的工作，进行网络调研，以及在机构网站上代为申报。它可能会收到您的文件。
- Google Gemini（美国）（按需使用）：通过 Gemini 模型处理 Odelia 的工作，包括您的文件，仅限 Google 付费层级。
- Groq（美国）（按需使用）：运行备用开源模型，从不接收您的文件。
- Cerebras（美国）（按需使用）：运行备用开源模型，从不接收您的文件。
- OpenRouter（美国）（按需使用）：在其选定的主机上运行备用开源模型，从不接收您的文件。
- OpenAI（美国）：其模型可以开启，默认关闭。
- DeepSeek（中国）：其模型可以开启，默认关闭。DeepSeek 从不接收您的文件。
- Telnyx（美国）（按需使用）：传送您与 Odelia 之间的短信和通话，运行通话中 Odelia 的语音、语音识别和 AI 模型，并以传真方式发送我们提交的申请。
- Linq（美国）（按需使用）：通过 iMessage 传送您与 Odelia 之间的消息，必要时改用 RCS 或短信。
- Meta（美国）（按需使用）：在 WhatsApp 上传送您与 Odelia 之间的消息。
- Postmark（美国）（在我们用它代替 Resend 时）：为 Odelia 收发邮件。
- Lob（美国）（按需使用）：打印并邮寄我们以邮寄方式提交的申请。
- Microsoft Azure Speech（美国）（按需使用）：将 Odelia 的回复转换为语音，供应用朗读。
- Render（美国；我们的软件运行在其俄勒冈区域）（按需使用）：运行在机构网站上代为申报和预约检查的软件。
- Browserbase（美国）（按需使用）：为该软件提供可用的网页浏览器。
- Google（美国）（您连接后）：使用 Google 登录、Gmail、Google Calendar 和 Google Drive。
- Microsoft（美国）（您连接后）：使用 Microsoft 登录、Outlook 邮件、Outlook 日历和 Microsoft Teams。
- Dropbox（美国）（您连接后）：导入文件。
- Intuit QuickBooks（美国）（您连接后）：读取营业总收入，用于税务登记。
- Slack（美国）（您连接后）：进度更新，以及在 Slack 中向 Odelia 提问。
- Lark（新加坡）或飞书（中国）（您连接后）：进度更新，以及在飞书中向 Odelia 提问。
- 企业微信，腾讯旗下（中国）（您连接后）：向您选择的群发送进度更新。
- 钉钉，阿里巴巴旗下（中国）（您连接后）：向您选择的群发送进度更新。
- 微信，腾讯旗下（中国）（您连接企业自己的微信公众号后）：传送您的团队与 Odelia 之间的消息。
- Toast（美国）和 Square（美国）（您连接其一后）：以只读方式读取各门店的销售额以及员工排班和工时，用于纳税申报、按销售额计费的许可以及工时规定。
- 您通过 MCP 连接的其他应用，例如 Notion、Airtable、Box、HubSpot、Linear、Asana 或 Zapier：各自接收 Odelia 发送的请求，其中可能包含您工作区的信息。

在任何公司接收客户信息之前，我们都会先将其加入这份名单和我们的信任与安全页面。

除上述公司外：

- 快哉：核对并提交您批准的申请，方式包括邮件、传真、挂号信或机构网站，并由我们的申报团队作为后备。
- 政府机构：接收您批准的申请以及所有者批准的检查预约。
- 您聘请的独立专业人士（例如律师和报关行）：经您批准，接收其所需的信息。
- 所有者与之共享的总部：查看下文所述的门店状态。
- 推荐您的合作伙伴：如您同意，按下文所述查看您的进展。
- 您用令牌连接的 AI 助手：接收其所提问题的答复，适用其提供方的条款，即您与该提供方之间接受的条款。
- 为核实发给 Odelia 的邮件确实来自您，我们会通过 Cloudflare 和 Google 的公共 DNS 查询公开的邮件签名密钥。它们只会收到所查询的域名。

在法律要求时，为保护他人或快哉的权利和安全，或在快哉发生合并、收购或业务出售时向继受方，我们也可能披露信息；继受方须继续遵守本政策。

## AI 模型

- 快哉不会用您的内容训练 AI 模型，也不会出售您的内容。
- 我们选择的 AI 提供方，其针对我们账户的条款不允许用我们发送的内容进行训练。Anthropic 的商业条款不允许其用我们发送的内容进行训练。我们只在 Google 付费层级使用 Gemini，其条款规定提示内容不会用于改进 Google 的产品。我们要求 OpenRouter 只使用不保留、不用提示内容训练的主机。各备用提供方的书面确认正在办理中，进展见我们的信任与安全页面。
- 目前尚未实现零数据保留。我们正在请每家 AI 提供方以书面形式确认零数据保留；快哉可以将 AI 处理限定于已作出确认的提供方。
- 为降低成本，提供方可能会将请求中固定不变的开头部分短暂保存在其提示缓存中，时间从几分钟到一小时不等，不会用于训练。
- 自动检查：每一份申请在所有者批准前都会逐行核对；已完成的任务中，约五分之一会按固定规则（不使用 AI 模型）再次抽查。检查发现问题时，我们的团队可能会查看该任务，以纠正问题根源。

## 集成

所有集成均为可选，由您决定连接哪些。我们只将每项集成用于您要求的任务：

- Gmail 和 Outlook Mail：查找机构邮件，发送您批准的消息。
- Google Calendar 和 Outlook Calendar：把截止日期添加到日历。
- Google Drive 和 Dropbox：导入文件。
- QuickBooks：读取营业总收入，用于税务登记。
- Slack、飞书、企业微信、钉钉和 Microsoft Teams：向您选择的群发布进度更新。在 Slack 和飞书中，您的团队还可以向 Odelia 寻求帮助。

您可以随时在“设置”中断开任何一项集成。

快哉对从 Google API 获得的信息的使用及向其他应用的传输，将遵守《Google API 服务用户数据政策》，包括其中的“有限使用”要求：https://developers.google.com/terms/api-services-user-data-policy

- 我们只将 Gmail、Google Calendar 和 Google Drive 的数据用于提供您在快哉中使用的上述功能。
- 我们不将其用于广告，也不出售。
- 除非获得您的许可、出于安全需要或法律要求，快哉的人员不会查看这些数据。
- 我们不使用这些数据或任何其他客户内容训练或改进 AI 模型。我们选择的 AI 提供方，其针对我们账户的条款不允许用我们发送的内容进行训练，详见上文“AI 模型”。
- 我们将 Google 数据存储在美国的托管服务商处。断开集成时，我们会删除对您 Google 账户的访问授权。您选择导入的文件和邮件会成为工作区中的文件，保留至您删除它们或删除账户为止。

## 连接 AI 助手

所有者或管理员可以在“设置”中创建令牌，让 AI 助手（例如 Claude 或 ChatGPT）通过快哉的 MCP 服务器读取工作区。每个令牌只能读取一个工作区，且只能读取为其选定的信息类别，不能更改任何内容。我们只保存令牌的指纹，并在工作区中记录每次调用。助手的提供方按其自身条款和隐私政策处理答复。所有者或管理员可以随时在“设置”中撤销令牌。

## 机构网站登录信息

如您保存了机构网站的登录信息，这些信息会加密存放在保险库中。快哉的申报软件，以及接手处理时的申报团队，只会在执行所有者已批准的事项（例如申报或预约检查）时打开这些信息，每次打开都会记入您的审计记录。登录信息由软件自行输入，AI 模型看不到密码。

## 短信与电话

如您关联手机，用来给 Odelia 发短信和打电话，我们会收集：

- 您的手机号、时区、语言和免打扰时段，以及您开启了哪些短信和来电
- 同意记录：您用短信验证码确认号码的时间，以及您回复 STOP 或关闭短信、来电的时间
- 您发给 Odelia 的短信，以及她发给您的短信
- 每次通话的记录：是您来电还是 Odelia 来电、通话时间和时长
- 您通过短信或电话请 Odelia 办理的事项（这会像在应用中提出请求一样，在您的工作区中开始办理），以及她的回复

通话使用 AI 语音，并在通话过程中实时转录，以便 Odelia 理解您的话。Telnyx 及其使用的语音服务会处理通话音频和转录内容，以完成通话。快哉不录制通话音频。

我们使用这些信息，仅为回复您、办理您要求的事项、发送您开启的更新短信和紧急来电、核实来电者是您本人，以及保存您的同意记录。

您的短信和通话记录在您的账户存续期间保存，并在您删除账户时一并删除。同意记录保存 5 年，即使您删除账户也会保留，以便在您的同意受到质疑时予以证明。您可以在“设置”中查看最近的短信和通话。在“设置”中移除号码后，我们将不再向该号码发短信或打电话，尚未发出的也会取消。

我们不会出于第三方营销目的，向第三方出售或共享手机号或短信同意。

## 与总部共享

工作区的所有者可以在“设置”中与总部邮箱共享各门店的状态。如果共享：

- 我们会保存该邮箱地址和所有者填写的品牌名称。
- 用该邮箱登录快哉并完成邮箱验证的人，可以看到每家门店的一行只读信息，该邮箱每周一还会收到一封摘要邮件。
- 共享的内容：工作区名称和品牌，以及每家门店的名称、地址和阶段、有效执照数量、30 天内到期和已逾期的事项数量、办理中的申请数量，以及下一个到期事项及其日期。
- 不共享的内容：文件、申请内容、机构登录信息、对话、与 Odelia 的短信和通话、Odelia 的记忆，以及团队成员。
- 所有者可以随时在“设置”中停止共享。停止后，总部将无法查看，每周邮件也会停止。已发送的邮件无法撤回。

## 与推荐您的合作伙伴共享

如您的企业是通过合作伙伴的推荐码来到快哉的，我们会记录该合作伙伴，并询问您一次是否允许其查看您的进展。如您同意，该合作伙伴只能看到您的企业名称、所处阶段、已获批许可数与总数，以及开业日期。您可以随时在“设置”中更改；更改后，合作伙伴看到的内容会随即清空。

## 跨境传输

快哉位于美国。我们在美国存储您的信息；我们的服务提供方在美国处理这些信息，其中部分提供方也会在其运营所在的其他国家处理。上文所列的部分公司位于美国以外（见各行说明），只有在相关功能开启或您连接后才会收到信息。我们将 Odelia 配置为使用其他提供方的模型时，该提供方可能在其所在国家处理相关内容。

如您位于中华人民共和国，或您向我们提供了位于中国境内的人员的个人信息：

- 这些信息会传输至美国的 Placetta Inc.，并按本政策所述进行处理。您使用本服务，即表示您同意此项传输。
- 境外接收方为 Placetta Inc.，地址：9 W 57th St, Fl 48, New York, NY 10019, United States，联系邮箱：support@placetta.com。处理目的、处理方式和个人信息种类，均如本政策所述。
- 部分文件（例如身份证件）包含敏感个人信息。我们仅为准备您要求的申报而使用这些信息。
- 在中国法律要求的情况下，我们依据中国个人信息出境标准合同进行传输。
- 您可以按下文“如何提出隐私请求”的说明，查阅、复制、更正或删除这些信息，或撤回您的同意。撤回同意不影响此前已进行的处理，但我们可能因此无法继续提供服务。
- 如您向我们提供了中国境内其他人员的个人信息，您须负责告知他们，并取得中国法律要求的同意。

## 保存期限

- 工作区信息和文件在工作区存续期间保存，并在工作区被删除时删除，包括其唯一所有者删除账户的情形。
- 审计记录在工作区存续期间保存；工作区删除后，作为批准和申报事项的证明，最多再保存 7 年。
- 申报进度记录、检查预约、申诉记录、AI 助手调用记录和任务技术记录在工作区存续期间保存，并随工作区一并删除。我们正在逐步启用每日清理，更早删除不再需要的记录，例如任务完成一年后的 Odelia 工作笔记；进展见我们的信任与安全页面。
- 账户信息、短信和通话记录在您的账户存续期间保存，并在您删除账户时删除。
- 助理记忆会一直保存，直到您的团队删除、使用“全部忘记”清空，或工作区被删除。无人批准的建议在 30 天后失效。
- 您接受我们的条款和政策的记录在您的账户终止后保存 6 年，短信和电话的同意记录保存 5 年，即使您删除账户也会保留，用于证明协议和您的同意。
- 在 placetta.com 提交的方案申请，在我们跟进所需期间保存，或保存至您要求删除为止。
- 法律要求我们保留的记录（例如账单记录），按法律要求的期限保存。

已提交给机构的申请，由该机构按其自身规定保存。

## 安全

快哉目前未持有 SOC 2 或任何其他安全认证。我们采取的措施包括：

- 信息在传输过程中加密，并由我们的托管和数据库服务提供方进行静态加密。
- 机构网站登录信息加密存放在保险库中，只在执行所有者已批准的事项时打开，每次打开都有记录。AI 模型看不到密码。
- AI 助手的令牌只以指纹形式保存，只读，并可随时撤销。
- 您可以在“设置”中开启两步登录，以及用于敏感设置的 PIN。快哉团队成员必须开启两步登录，才能访问客户记录和已保存的登录信息。
- 银行卡号由 Stripe 处理。我们看不到完整卡号。
- 审计记录会记下 Odelia、您、我们的团队和各机构的每一项操作。
- 未经您批准，不会提交、付款或发送任何内容。
- 如发生安全事件导致您工作区的信息泄露，我们会在确认相关信息受影响后，及时并在 72 小时内通过邮件告知所有者，法律规定更短期限的，从其规定。

任何系统都无法做到绝对安全。如您认为他人可能进入了您的工作区，请发邮件至 support@placetta.com。我们的信任与安全页面列明了已落实和尚未完成的事项：https://placetta.com/trust

## 您的选择和权利

- 在“设置”的“隐私与数据”中下载工作区数据，包括应用中显示的审计记录。
- 在“设置”的“隐私与数据”中删除账户。这会删除您单独拥有的工作区。您也可以发邮件至 support@placetta.com，要求删除某个工作区或您的数据。
- 在“设置”中断开集成，以及撤销 AI 助手的令牌。
- 在“设置”中关闭助理记忆，或删除其中的内容。
- 在“设置”中关闭短信或来电、更改免打扰时段或移除号码，或回复 STOP。
- 在“设置”中停止与总部或推荐您的合作伙伴共享。
- 按《申报授权书》的说明，撤销申报授权。

## 美国各州的隐私权利

根据您所在州（例如加利福尼亚州）的法律，您可能对自己的个人信息享有以下权利：

- 了解我们收集了哪些信息，并查阅这些信息
- 以便于转移的格式获取副本
- 更正信息
- 删除信息
- 拒绝出售或共享、定向广告或特定类型的画像分析
- 限制对敏感个人信息的使用

加州法律要求我们告知您的以下信息（针对过去 12 个月）：

- 我们收集的信息类别：身份标识（例如姓名、邮箱地址、电话号码和 IP 地址）；商业信息（例如您的套餐和付款）；在我们网站和应用上的网络活动；关于企业及其人员的职业信息；通话音频（实时转录，不录音）；以及敏感个人信息：您保存的机构账户登录信息，以及您上传的内容中出现的政府证件号码或证件。
- 来源：您和您的团队、您连接的文件和服务、机构的公开记录，以及推荐您的合作伙伴。
- 目的：见“我们如何使用这些信息”。
- 为业务目的披露给：“谁会处理这些信息”中列出的公司、所有者批准申报时的相关机构，以及上文所述的专业人士、总部和合作伙伴。
- 我们不会出售或共享（按加州法律对这两个词的定义）个人信息，过去 12 个月也没有这样做。我们的网站和应用没有广告或跨站跟踪 Cookie。我们不会将个人信息用于定向广告或会产生法律效力或类似重大影响的画像分析。我们仅为提供您要求的服务而使用敏感个人信息。
- 各类信息的保存期限：见“保存期限”。

您不会因行使这些权利而受到差别对待。

## 欧洲经济区、英国和瑞士的用户

如您位于欧洲经济区、英国或瑞士，或您的企业在当地有门店：

- 对于企业放入其工作区的信息，由该企业决定处理哪些信息以及处理目的，快哉代该企业处理。对于账户、网站和账单信息，由 Placetta Inc. 决定并负责。
- 我们依据以下法律基础处理信息：履行我们与您企业之间的合同；我们在保障服务安全、修复问题和防止滥用方面的正当利益；履行法定义务；以及您的同意（适用于短信和电话，以及我们征求您同意的其他事项）。您可以随时撤回同意。
- 您有权查阅、更正、删除、限制处理、反对处理您的个人信息，以及获取可转移的副本，并有权向您所在地的数据保护机构投诉。
- 您的信息会传输至美国，以及“谁会处理这些信息”中列明的其他国家。

## 如何提出隐私请求

- 发邮件至 support@placetta.com，并在主题中注明“Privacy request”（隐私请求），或寄信至下文地址。请说明您的请求内容，以及涉及哪个账户或企业。提出请求不收取费用。
- 我们可能需要先核实您的身份，通常是确认您账户的邮箱地址。在法律允许的情况下，您可以委托他人代为提出请求，但须提供授权证明。
- 我们会在 10 个工作日内确认收到您的请求，并在 45 天内答复。如需更多时间，我们会告知原因，并最多再延长 45 天。如适用于您的法律规定了更短的期限，我们将遵守该期限。
- 如请求涉及企业放入其工作区的信息（例如提及您的申请），我们可能会将请求转给控制这些信息的企业，并协助其答复。
- 如我们拒绝请求，会告诉您原因。您可以直接回复我们的决定提出申诉，我们会在 60 天内答复。如申诉被驳回，您可以联系您所在州的总检察长。

## 年龄要求

快哉仅供年满 18 周岁、代表企业行事的人使用。

## 政策变更

本政策更新时，我们会在此发布新版本并标注新日期。如有重大变更，我们还会在变更生效前通过邮件或应用内通知告知您。

## 联系我们

Placetta Inc.，9 W 57th St, Fl 48, New York, NY 10019, United States

邮箱：support@placetta.com`;

const AUTH_EN = `Effective date: ${UPDATED}.

This authorization sets out the limited authority you give Placetta Inc. ("Placetta") to file license, permit and registration applications for your business. You grant it when you create a workspace. It is part of our Terms of Service.

## What you authorize

You appoint Placetta as your authorized agent for one limited purpose:

- to prepare license, permit and registration applications for your business
- to submit the applications you approve, on your behalf, by email from your connected mailbox, by fax, by certified mail or on the agency's website
- to follow up with the agency on those applications, such as checking their status
- to book the inspections those permits need, at the time an owner approves, on the agency's website with your saved login or by the agency's phone or email

This authority covers only the filings and inspection bookings an owner approves in the app, exactly as approved. Each approval covers that one filing or booking. It covers nothing else. It is not a general power of attorney.

## How a filing happens

- Odelia prepares the application from your information and documents.
- You review it in the app. If the form needs a signature, you sign it yourself, in the app or by hand.
- You decide whether to approve it.
- Placetta checks it against the agency's current requirements.
- Placetta's software submits exactly what you approved, by email, fax, certified mail or the agency's website, or our filing team does when no automatic channel fits.
- Every step is recorded in your audit trail.

## Signatures

- You sign every application yourself. Placetta places your signature only on the form you signed and approved.
- Placetta never signs your name, and never signs or makes a statement, affidavit or certification for you, including any made under penalty of perjury.
- If an agency website asks for a certification or attestation in your name that you have not signed, Placetta stops and asks you to complete it.

## What we never do

- We never submit an application you have not approved in the app.
- We never pay government fees. You pay each agency directly, using the payment link we send you.
- We never appear in person for you where an agency requires you to. You do that yourself.
- We never create an agency account in your name.
- We never file an appeal or appear at a hearing for you.

## We may decline a filing

Placetta may refuse to submit a filing that we believe in good faith is inaccurate, incomplete, unlawful or not authorized by your business. We will tell you why, so you can correct it and approve it again.

## What you confirm

By granting this authorization, and each time you approve a filing, you confirm that:

- the information in it is true, accurate and complete, to the best of your knowledge
- you have authority to act and sign for the business
- you reviewed the filing before approving it

## Agency portal logins

If you save logins for agency websites, they are encrypted in a vault. Placetta's filing software, and our filing team when it takes over, open them only to submit a filing or book an inspection an owner approved, and every opening is recorded in your audit trail. The software types the login itself; the AI model never sees the password. When an agency website asks for a CAPTCHA or an identity check, Placetta stops and asks you to complete it.

## Agencies decide

Agencies decide approvals and timelines. Placetta cannot guarantee that an application will be approved, or when.

## Revoking this authorization

You can revoke this authorization at any time in writing, by emailing support@placetta.com from the email address on your account. Deleting your account in Settings also revokes it for the workspaces that are deleted. Revocation takes effect when we receive it. After that, we will not submit any further applications for you, including approved ones not yet submitted.

Applications already submitted to an agency cannot be recalled by Placetta. To withdraw one, contact the agency.

## Contact

Email: support@placetta.com`;

const AUTH_ZH = `生效日期：${UPDATED}。

本授权书说明您授予 Placetta Inc.（下称“快哉”）的有限权限，用于为您的企业申报执照、许可和登记。您在创建工作区时即授予本授权。本授权书是我们《服务条款》的一部分。

## 您授权的内容

您指定快哉作为您的授权代理人，仅限于以下用途：

- 为您的企业准备执照、许可和登记申请
- 代表您提交经您批准的申请，方式包括通过您连接的邮箱发送邮件、发送传真、寄送挂号信，或在机构网站上提交
- 就这些申请与机构跟进，例如查询办理状态
- 在所有者批准的时间，为这些许可预约所需的检查，方式为使用您保存的登录信息在机构网站上预约，或通过机构的电话或邮件预约

本授权仅涵盖所有者在应用中批准的申报和检查预约，且以批准的内容为准。每次批准只涵盖该项申报或预约。本授权不涵盖其他任何事项，也不是一般性的授权委托书。

## 申报流程

- Odelia 根据您的信息和文件准备申请。
- 您在应用中审核。如表格需要签名，由您本人在应用中签署，或亲笔签署。
- 您决定是否批准。
- 快哉对照该机构的最新要求进行核对。
- 快哉的软件按您批准的内容原样提交，方式包括邮件、传真、挂号信或机构网站；没有合适的自动渠道时，由我们的申报团队提交。
- 每一步都会记入您的审计记录。

## 签名

- 每一份申请都由您本人签署。快哉只会将您的签名用于您签署并批准的那份表格。
- 快哉绝不代您签名，也绝不代您签署或作出任何声明、宣誓书或证明，包括任何以伪证罪处罚为前提作出的声明。
- 如机构网站要求以您的名义作出您未签署的证明或声明，快哉会暂停并请您本人完成。

## 我们绝不会做的事

- 绝不提交未经您在应用中批准的申请。
- 绝不代付政府规费。您通过我们发送的付款链接，直接向各机构付款。
- 机构要求您本人到场时，绝不代您到场。这些步骤由您自行完成。
- 绝不以您的名义开设机构账户。
- 绝不代您提起申诉或出席听证。

## 我们可以拒绝申报

如我们善意地认为某项申报不准确、不完整、违法，或未经您的企业授权，快哉可以拒绝提交，并会告诉您原因，以便您更正后重新批准。

## 您确认的事项

授予本授权以及每次批准申报时，即表示您确认：

- 据您所知，其中的信息真实、准确、完整
- 您有权代表该企业行事和签署
- 您已在批准前审核该项申报

## 机构网站登录信息

如您保存了机构网站的登录信息，这些信息会加密存放在保险库中。快哉的申报软件，以及接手处理时的申报团队，只会在提交所有者已批准的申报或预约所有者已批准的检查时打开这些信息，每次打开都会记入您的审计记录。登录信息由软件自行输入，AI 模型看不到密码。如机构网站要求验证码（CAPTCHA）或身份核验，快哉会暂停并请您本人完成。

## 审批由机构决定

是否批准、何时办结，均由各机构决定。快哉无法保证申请获批，也无法保证办理时间。

## 撤销授权

您可以随时以书面方式撤销本授权，方式是用您账户的邮箱发邮件至 support@placetta.com。在“设置”中删除账户，也会撤销对被删除工作区的授权。撤销自我们收到时生效。撤销后，我们不会再为您提交任何申请，包括已批准但尚未提交的申请。

已提交给机构的申请，快哉无法撤回。如需撤回，请直接联系该机构。

## 联系我们

邮箱：support@placetta.com`;

const AI_EN = `Effective date: ${UPDATED}.

Placetta uses an AI agent, Odelia, to handle the paperwork of getting licenses, permits and registrations. This page explains what she does and where her limits are.

## What the agent does

- Maps the licenses, permits and registrations your business needs.
- Reads the documents you upload.
- Fills applications from your information.
- Tracks deadlines and renewals, and reminds you of them.
- Drafts messages for you to review.
- Answers your texts and calls, if you link a phone.
- Checks the status of your filings every day.
- Books inspections at a time you approve.
- When an agency says no, shows the official way to appeal, counts the deadline from the rule, and drafts what you may need with each rule cited. She never files an appeal and gives no legal opinion.

## Where its answers come from

Odelia researches requirements on official government websites and cites the agency source, so you can check it.

## What it never does on its own

Odelia never files, pays or sends anything by herself. Every filing and every message needs your approval in the app.

After you approve a filing, Placetta checks it against the agency's current requirements before submitting it. You always pay government fees yourself, directly to the agency.

## It can be wrong

AI output can be wrong. Review every application and message before you approve it, and read the cited source when something looks off. Reminders help you, but your business remains responsible for its deadlines. Placetta is not a law firm and does not give legal advice.

Placetta checks her work too: every application is checked line by line before you can approve it, and about 1 in 5 finished tasks is checked again by fixed rules, without an AI model, so our team can fix mistakes. These checks don't replace your review.

## Texts and calls

- Odelia is an AI. Every call opens with her saying so, and saying that the call is transcribed.
- Calls use an AI voice and are transcribed as they happen so she can understand you. Placetta does not record call audio.
- Your texts, and a record of each call, are kept with your account. You can see recent ones in Settings.
- By text or call, Odelia can answer from your workspace and start work, but she never files, pays, sends, approves or deletes anything that way. She texts you a link to the approval in the app.
- She texts or calls you first only if you turned that on in Settings, and never during your quiet hours. Reply STOP to stop texts, or HELP for help.

## Models and your data

- Odelia runs on Claude models from Anthropic and, when our paid Google account is on, Gemini models from Google. If those can't answer, a backup open model on Groq, Cerebras or OpenRouter answers, without your files. Models from OpenAI and DeepSeek can be switched on, and are off by default. Every company that processes your information is listed at https://placetta.com/trust
- Spoken replies in the app are generated with Microsoft Azure text to speech.
- On calls, Odelia's voice and speech recognition run through Telnyx.
- We do not use your content to train AI models, and we choose providers whose terms for our account don't allow training on what we send.
- Zero data retention is not in place today. We are asking each AI provider to confirm it in writing, and Placetta can limit AI processing to providers that have.
- Memory is off until an owner or admin turns it on. Odelia then suggests short notes about your business, an owner or admin approves each one, and each shows where it came from and when, so you can see why she remembered it.

## Every action is recorded

The audit trail records every action by Odelia, by you, by our team and by agencies.

## Questions

Email: support@placetta.com`;

const AI_ZH = `生效日期：${UPDATED}。

快哉使用 AI 智能体 Odelia，处理办理执照、许可和登记过程中的文书工作。本页说明她能做什么，以及她的局限在哪里。

## 智能体做什么

- 梳理您的企业需要哪些执照、许可和登记。
- 阅读您上传的文件。
- 根据您的信息填写申请。
- 跟踪截止日期和续期，并提醒您。
- 起草消息供您审核。
- 如您关联了手机，回复您的短信和来电。
- 每天查询您的申报进度。
- 在您批准的时间预约检查。
- 机构作出不利决定时，说明官方申诉途径，按规定计算期限，并起草您可能需要的材料，注明每条规定的出处。她绝不提起申诉，也不提供法律意见。

## 信息从哪里来

Odelia 在政府官方网站上查询相关要求，并注明机构来源，方便您核实。

## 未经批准，它不会做什么

Odelia 不会自行提交、付款或发送任何内容。每一份申请、每一条消息，都须经您在应用中批准。

您批准申请后，快哉会先对照机构的最新要求进行核对，再行提交。政府规费始终由您本人直接支付给机构。

## 它可能出错

AI 生成的内容可能有误。批准前，请审核每一份申请和每一条消息；如有疑问，请查看所注明的来源。提醒只是辅助，按时办理仍是您企业的责任。快哉不是律师事务所，不提供法律意见。

快哉也会检查她的工作：每一份申请在您批准前都会逐行核对；已完成的任务中，约五分之一会按固定规则（不使用 AI 模型）再次抽查，以便我们的团队纠正错误。这些检查不能代替您的审核。

## 短信与电话

- Odelia 是 AI。每次通话开始时，她都会说明这一点，并告知通话会被转录。
- 通话使用 AI 语音，并在通话过程中实时转录，以便她理解您的话。快哉不录制通话音频。
- 您的短信和每次通话的记录随您的账户保存。您可以在“设置”中查看最近的记录。
- 通过短信或电话，Odelia 可以根据您的工作区回答问题并开始办理，但绝不会以这种方式提交、付款、发送、批准或删除任何内容。她会把应用中的批准链接用短信发给您。
- 只有在您于“设置”中开启后，她才会主动给您发短信或打电话，并且不会在您的免打扰时段联系您。回复 STOP 可退订短信，回复 HELP 获取帮助。

## 模型与您的数据

- Odelia 基于 Anthropic 的 Claude 模型运行；我们的 Google 付费账户开启时，也使用 Google 的 Gemini 模型。如果它们无法回答，会改由 Groq、Cerebras 或 OpenRouter 上的备用开源模型回答，且不会收到您的文件。OpenAI 和 DeepSeek 的模型可以开启，默认关闭。处理您信息的每一家公司都列在 https://placetta.com/trust
- 应用中的语音回复由 Microsoft Azure 文字转语音服务生成。
- 通话中，Odelia 的语音和语音识别通过 Telnyx 提供。
- 我们不会用您的内容训练 AI 模型；我们选择的提供方，其针对我们账户的条款不允许用我们发送的内容进行训练。
- 目前尚未实现零数据保留。我们正在请每家 AI 提供方以书面形式确认；快哉可以将 AI 处理限定于已作出确认的提供方。
- 记忆功能默认关闭，须由所有者或管理员开启。开启后，Odelia 会提出关于您企业的简短记录，由所有者或管理员逐条批准；每条记录都注明来源和日期，让您了解她为什么记住它。

## 每项操作都有记录

审计记录会记下 Odelia、您、我们的团队和各机构的每一项操作。

## 联系我们

邮箱：support@placetta.com`;

export const LEGAL: LegalDoc[] = [
  { id: "terms", title: { en: "Terms of Service", zh: "服务条款" }, updated: UPDATED, body: { en: TERMS_EN, zh: TERMS_ZH } },
  { id: "privacy", title: { en: "Privacy Policy", zh: "隐私政策" }, updated: UPDATED, body: { en: PRIVACY_EN, zh: PRIVACY_ZH } },
  { id: "authorization", title: { en: "Filing Authorization", zh: "申报授权书" }, updated: UPDATED, body: { en: AUTH_EN, zh: AUTH_ZH } },
  { id: "ai", title: { en: "How Placetta's AI works", zh: "快哉的 AI 如何工作" }, updated: UPDATED, body: { en: AI_EN, zh: AI_ZH } },
];
