// Customer-facing legal pages, in English and Simplified Chinese.
// Body markup: blank line between paragraphs, "## " for headings, "- " for bullets,
// bare URLs and emails only. Keep the "## " headings parallel between the two languages.
// The same text is published as Markdown in /legal and on the website (site/terms.html, privacy.html,
// authorization.html, ai.html). After editing, run: node scripts/build-legal.mts

export type LegalDoc = { id: "terms" | "privacy" | "authorization" | "ai"; title: { en: string; zh: string }; updated: string; body: { en: string; zh: string } };

/** The date of this version. Every document also says it takes effect on this date. */
export const UPDATED = "2026-10-13";

const TERMS_EN = `Effective date: ${UPDATED}. If your workspace was created before that date, these terms apply to you 30 days after we notify you of them by email or in the app. Until then, the previous version applies.

These terms are an agreement between you and Placetta Inc. ("Placetta", "we", "us"). They cover your use of placetta.com, the Placetta app, and texts and calls with Odelia, Placetta's AI agent (together, the "service"). By creating a workspace or using the service, you agree to them for the business you represent. "You" means that business and the people who use the service for it.

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

Odelia researches requirements on official government websites and cites the agency source.

## Your approval comes first

Odelia never files, pays or sends anything on her own. Every filing and every message needs your approval in the app.

After you approve an application, Placetta's software checks it against the agency's current requirements and submits it on your behalf by email from your connected mailbox, by fax, by certified mail or on the agency's website, using the saved logins you choose to keep with us. When no automatic channel fits, our filing team submits it. Placetta stops and asks you whenever an agency requires a CAPTCHA, an identity check, a payment, a sworn statement or your handwritten signature, and some agencies require an in-person step. You complete those yourself. Placetta never types a card or bank number and never sends a Social Security, ITIN or passport number.

Placetta may decline to submit a filing that we believe in good faith is inaccurate, incomplete, unlawful or not authorized by your business. We will tell you why, so you can correct it.

Our Filing Authorization sets out the limited authority you give us to file for you. It is part of these terms.

## Monitoring and reminders

Placetta tracks the expiry and renewal dates of the licenses and permits in your workspace, and reminds you by email, in the app and, if you turn them on, by text or call. Monitoring and reminders are a service to help you. They do not replace your own records and calendar.

- Your business remains responsible for holding the licenses and permits it needs, for renewing them, and for meeting every agency deadline, whether or not you receive a reminder.
- Placetta will use commercially reasonable efforts to keep the dates in your workspace accurate and to send reminders on time. We do not promise that every requirement, rule change or deadline will be caught, or that every reminder will arrive.
- Dates come from your documents, the agencies and what you tell us. Check them, and tell us if one looks wrong. Agencies can change rules, fees and deadlines without notice.

## Odelia is an AI

Odelia is software, not a person.

- Her output, including license maps, filled applications, answers by text or call, and reminders, can be wrong or incomplete. Review what she prepares, and check the cited source, before you approve it or rely on it.
- On every call, Odelia says that she is an AI and that the call is transcribed.
- Odelia cannot file, pay, send, approve or delete anything by text or call. Those happen only in the app, after your approval.
- You are responsible for what you approve.

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

## Professional services

Placetta is not a law firm, a customs broker or an accounting firm. We do not give legal, customs, tax or accounting advice, and using the service does not create an attorney-client relationship with Placetta.

Some steps can legally be done only by a licensed professional, such as an attorney or a licensed customs broker. For those steps:

- Placetta introduces you to an independent professional. You engage that professional directly, under your own agreement with them, and they bill you directly.
- The professional is responsible for their own work and advice. Placetta does not direct or control their professional judgment.
- Placetta does not receive referral fees from attorneys and does not share in the fees you pay an attorney.
- Customs entries are filed by a licensed customs broker, not by Placetta.
- With your approval, Placetta shares with the professional the information in your workspace that they need.

Where a city requires a registered filing representative or permit expediter for a step, that step is handled by someone registered there.

## What Placetta is not

- Placetta is not a government agency and is not affiliated with or endorsed by any agency.
- Agencies decide whether to approve an application and how long it takes. We cannot guarantee approval, timing, inspection results or an opening date. Timelines and fees we give you are estimates.

## Government fees

You pay government fees directly to each agency. We send you the agency's payment link. Placetta never charges agency fees. Fees that professionals bill you directly are also separate from Placetta's fees.

## Plans and billing

Placetta's fees are billed through Stripe.

- Entry plan: $299 per market, paid once. The $299 is credited toward your first year of the location plan.
- Location plan: $149 per location per month, billed yearly in advance. It covers tracking, filing and renewals for each location.
- Openings: $3,500 per new store, paid once. It is credited against that store's first year of the location plan.
- Custom plans may be set out in an order form. If an order form you accept conflicts with these terms, the order form controls for that plan.

The location plan renews for another year at the end of each yearly term until you cancel. If its price will change at renewal, we will tell you at least 30 days before. You can cancel at any time in Settings, Billing. Cancellation takes effect at the end of the current billing period, and you keep the service until then.

Fees do not include taxes. You pay any sales, use or similar taxes that apply, other than taxes on Placetta's income.

Fees are non-refundable, except where the law requires a refund. If a payment fails, we may pause filing work for the workspace after telling you.

## Fair use of Odelia

Odelia, Placetta's AI agent, does compliance work for your business: its licenses, permits, registrations, filings, inspections, stores and the documents behind them. She isn't a general-purpose AI assistant.

- Each plan includes an Odelia allowance, shown in Settings, under Billing. Packs add more and carry over until they're used. When the allowance is used up, deadlines, reminders and filings already in motion carry on; new work for Odelia waits for the next period, a pack or a larger plan.
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

## Your content

Your documents and information stay yours. You give Placetta a limited license to use, copy, store and transmit them only to provide the service to you. That includes sending them to the agencies when you approve a filing, to professionals you engage with your approval, to a headquarters you share with as described above, and to the processors named in our Privacy Policy.

We do not use your content to train AI models. We do not sell it, and we do not use it for advertising.

If you send us suggestions or feedback, we may use them without any obligation to you.

## Placetta's service

Placetta owns the service, including its software, guides and design, but not your content. While you have a workspace, you may use the service for your business under these terms. You may not:

- copy, resell or sublicense the service
- reverse engineer it, or use it to build a competing product
- scrape it, overload it, or try to get around its security or limits
- use it in violation of US export control or sanctions laws, or if you are on a US government list of prohibited or restricted parties

## Connected services

You can choose to connect Gmail, Google Calendar, Google Drive, Outlook Mail, Outlook Calendar, Dropbox, QuickBooks and Slack. We use them only for the tasks you ask for. Each is run by its provider under its own terms. You can disconnect any of them in Settings at any time.

## Ending your use

- You can cancel your plan in Settings, Billing at any time.
- You can revoke your Filing Authorization at any time, as it explains.
- You can download your workspace data and export the audit trail in Settings, Privacy and data.
- You can delete your account in Settings, Privacy and data. That deletes the workspaces you own alone, with their documents, filings and audit trail, and removes you from the others. Cancel any paid plan on a workspace you own alone first. You can also ask us to delete a workspace by emailing support@placetta.com.
- We keep records the law requires us to keep, such as billing records.

We may suspend or close a workspace that breaks these terms or the law, or that does not pay. We will tell you first, unless the law or a risk to others does not allow it.

Applications already submitted to an agency stay with that agency. Placetta cannot recall them.

The parts of these terms that by their nature should continue after your use ends will continue, including fees owed, disclaimers, limitation of liability, indemnity and disputes.

## Disclaimers

To the extent the law allows, the service is provided "as is" and "as available". Placetta disclaims all implied warranties, including warranties of merchantability, fitness for a particular purpose and non-infringement. We do not promise that the service will be free of errors or interruptions, that the licenses we map are complete, or that any agency will approve an application.

## Limitation of liability

To the extent the law allows:

- Placetta's total liability for all claims arising out of or relating to these terms or the service is limited to the fees you paid Placetta in the 12 months before the event that gave rise to the claim. Government fees and fees you paid others are not included.
- Placetta is not liable for indirect, incidental, special, consequential, exemplary or punitive damages, or for lost profits, revenue, rent, data or goodwill, even if we were told they were possible.
- Placetta is not liable for the decisions, actions or delays of any agency, for an application that is rejected or delayed, or for a license or permit that lapses, or for the fines, penalties, late fees, closures or delayed openings that result. Where the law does not allow this, those losses are subject to the limit above.

These limits apply to claims in contract, tort or any other legal theory, and even if a remedy fails of its essential purpose. They do not apply where the law forbids limiting liability, such as for fraud, gross negligence or willful misconduct.

## Your indemnity

You will defend and indemnify Placetta and its officers, employees and contractors against any third-party claim, including a claim or proceeding by a government agency, and the resulting losses, fines, penalties and reasonable legal fees, to the extent it arises from:

- inaccurate, incomplete or misleading information you gave us or approved
- a filing or message you approved, or asked us to submit, for a business or person you were not authorized to act for
- content you uploaded, connected or shared without the right to do so, or that infringes someone else's rights
- your violation of the law or of these terms

Placetta will tell you promptly about the claim, let you control its defense, and cooperate at your expense. You may not settle a claim in a way that admits fault for Placetta or binds it without Placetta's written consent.

## Governing law

New York law governs these terms and any dispute between you and Placetta, without regard to its conflict of law rules. The Federal Arbitration Act governs the agreement to arbitrate below.

## Resolving disputes

Talk to us first. Before starting arbitration or a court case, the side with a claim must send the other a written notice describing the claim and the relief it wants. Send yours to support@placetta.com and to the mailing address below. We will send ours to the email address on your account. For 30 days after the notice is received, both sides will try in good faith to resolve the dispute informally.

Binding arbitration. If the dispute is not resolved within those 30 days, either side may start arbitration. Any dispute arising out of or relating to these terms or the service will be resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, before one arbitrator. The arbitration is seated in New York County, New York, and hearings may be held by video if the arbitrator allows. Judgment on the award may be entered in any court with jurisdiction.

Individual claims only. Claims may be brought only on an individual basis, not as a plaintiff or class member in any class, collective, consolidated or representative proceeding. The arbitrator may not combine the claims of more than one customer, or award relief to anyone other than the parties.

Jury waiver. You and Placetta each waive the right to a jury trial.

Exceptions. Either side may bring an individual claim in small claims court if it qualifies. Either side may also ask the state or federal courts in New York County, New York for an injunction or other equitable relief to protect its intellectual property or confidential information. You and Placetta consent to those courts for those cases and for any claim that is not arbitrated.

If the ban on class and representative proceedings is found unenforceable for a claim, that claim will be decided by those courts and not in arbitration, and the rest of this section still applies.

## Changes to these terms

We may update these terms. When we do, we will post the new version on placetta.com and in the app with a new date.

- For a material change, we will tell you by email or in the app. It takes effect 30 days after that notice. If you keep using the service after that, you accept the new terms. If you do not agree, cancel before then.
- Other changes, such as clarifications, updates for new features, or changes the law requires, take effect when we post them.
- A change to "Resolving disputes" does not apply to a dispute that either side gave notice of before the change took effect.

## General terms

- Assignment: You may not transfer these terms without our written consent, except to a successor to all or most of your business that agrees to them. Placetta may transfer them to an affiliate, or in a merger, acquisition or sale of all or most of its business.
- Entire agreement: These terms, the Filing Authorization, the Privacy Policy and any order form you accept are the entire agreement about the service. They replace earlier agreements and proposals about it. Terms in your purchase orders do not apply.
- Severability: If a court or arbitrator finds part of these terms unenforceable, that part is enforced as far as the law allows, and the rest stays in effect.
- No waiver: If either side does not enforce a right, it does not give that right up.
- Events beyond our control: Neither side is liable for a delay or failure caused by events beyond its reasonable control, such as agency system outages, changes to agency websites, portals or forms, changes in law or agency rules, government shutdowns, failures of carriers, the internet or our providers, natural disasters, epidemics, war or labor disputes. This does not excuse paying fees.
- Independent contractors: Except for the limited authority in the Filing Authorization, neither side is the other's agent, partner, joint venturer or employee.
- Language: These terms are in English and Chinese. If the two differ, the English version controls.

## Notices

We send notices to the email address on your account or in the app. Notices to Placetta go to support@placetta.com. A dispute notice or other legal notice must also be sent by mail to the address below. An email notice is received when it is sent, unless the sender learns that it was not delivered.

## Contact

Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States

Email: support@placetta.com

Website: placetta.com`;

const TERMS_ZH = `生效日期：${UPDATED}。如您的工作区创建于该日期之前，本条款自我们通过邮件或应用内通知您之日起满 30 天后对您适用，此前继续适用上一版本。

本条款是您与 Placetta Inc.（中文名称“快哉”，下称“快哉”或“我们”）之间的协议，适用于您对 placetta.com、快哉应用，以及与快哉 AI 智能体 Odelia 之间的短信和通话（合称“本服务”）的使用。您创建工作区或使用本服务，即表示您代表所属企业同意本条款。“您”指该企业及代表该企业使用本服务的人员。

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

Odelia 在政府官方网站上查询相关要求，并注明所依据的机构来源。

## 一切以您的批准为前提

Odelia 不会自行提交、付款或发送任何内容。每一份申请、每一条消息，都须经您在应用中批准。

您批准申请后，快哉的软件会对照该机构的最新要求进行核对，再代表您提交：通过您连接的邮箱发送邮件、发送传真、寄送挂号信，或在该机构网站上使用您选择保存在快哉的登录信息提交。没有合适的自动渠道时，由我们的申报团队提交。如机构要求验证码（CAPTCHA）、身份核验、付款、宣誓声明或您的亲笔签名，快哉会暂停并请您处理；部分机构还要求本人到场。这些步骤由您自行完成。快哉从不输入银行卡号或银行账号，也从不发送社会安全号码（SSN）、个人纳税识别号（ITIN）或护照号码。

如我们善意地认为某项申报不准确、不完整、违法，或未经您的企业授权，快哉可以拒绝提交，并会告诉您原因，以便您更正。

您授予我们代为申报的有限权限，详见《申报授权书》。该授权书是本条款的一部分。

## 监控与提醒

快哉会跟踪您工作区中各项执照和许可的到期和续期日期，并通过邮件、应用内通知以及（如您开启）短信或电话提醒您。监控与提醒是一项辅助服务，不能代替您自己的记录和日程。

- 无论您是否收到提醒，持有所需执照和许可、按时续期并遵守各机构的每一个截止日期，始终是您企业的责任。
- 快哉将尽商业上合理的努力，保持您工作区中日期的准确，并按时发送提醒。我们不保证能发现每一项要求、规则变化或截止日期，也不保证每一条提醒都能送达。
- 日期来自您的文件、各机构以及您告诉我们的信息。请自行核对；如发现日期有误，请告诉我们。机构可能不经通知即变更规则、费用和截止日期。

## Odelia 是 AI

Odelia 是软件，不是真人。

- 她生成的内容，包括执照清单、填好的申请、短信或电话中的回答以及提醒，可能有误或不完整。批准或依赖这些内容之前，请先审核，并查看所注明的来源。
- 每次通话时，Odelia 都会说明她是 AI，并告知通话会被转录。
- Odelia 不能通过短信或电话提交、付款、发送、批准或删除任何内容。这些操作只能在您批准后于应用中进行。
- 您批准的内容，由您负责。

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

## 专业服务

快哉不是律师事务所、报关行或会计师事务所，不提供法律、海关、税务或会计意见。使用本服务不会在您与快哉之间建立律师与客户关系。

有些步骤依法只能由持牌专业人士办理，例如律师或持牌报关行。对于这些步骤：

- 快哉会为您介绍独立执业的专业人士。您直接聘请该专业人士，与其签订您自己的协议，并由其直接向您收费。
- 专业人士对其自身的工作和意见负责。快哉不指挥或控制其专业判断。
- 快哉不向律师收取介绍费，也不分享您支付给律师的任何费用。
- 海关申报由持牌报关行提交，而非快哉。
- 经您批准，快哉会向专业人士提供其所需的工作区信息。

如某城市要求某一步骤须由注册的申报代表或许可代办人办理，该步骤将由在当地注册的人员办理。

## 快哉不是什么

- 快哉不是政府机构，与任何政府机构均无隶属关系，也未获其背书。
- 申请能否获批、需要多长时间，由各机构决定。我们无法保证获批、办理时间、检查结果或开业日期。我们提供的时间和费用均为估计。

## 政府规费

政府规费由您直接支付给各机构。我们会把机构的付款链接发给您。快哉从不收取机构费用。专业人士直接向您收取的费用，也与快哉的服务费分开。

## 套餐与计费

快哉的服务费通过 Stripe 收取。

- 入门套餐：每个市场 299 美元，一次性付费。这 299 美元可抵扣您第一年的门店套餐费用。
- 门店套餐：每家门店每月 149 美元，按年预付，包括每家门店的跟踪、申报和续期。
- 新店开业：每家新店 3,500 美元，一次性付费，可抵扣该门店第一年的门店套餐费用。
- 定制方案可另以订单约定。如您接受的订单与本条款冲突，就该方案而言以订单为准。

门店套餐在每个年度期限结束时自动续订一年，直至您取消。如续订时价格有变，我们会至少提前 30 天告知您。您可以随时在“设置”的“账单”中取消。取消在当前计费周期结束时生效，在此之前您仍可使用本服务。

服务费不含税。您须支付适用的销售税、使用税或类似税费，但对快哉所得征收的税除外。

除法律另有规定外，已付费用不予退还。如付款失败，我们在通知您后可以暂停该工作区的申报工作。

## Odelia 的合理使用

Odelia 是快哉的 AI 助理，专门为您的企业处理合规工作：执照、许可、登记、申报、检查、门店以及相关文件。她不是通用型 AI 助手。

- 每个套餐都包含一份 Odelia 额度，可在“设置”的“账单”中查看。加量包可增加额度，长期有效直到用完。额度用完后，截止日期、提醒和已在办理的申报照常进行；新的工作需等到下一个周期、购买加量包或升级套餐。
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

## 您的内容

您的文件和信息仍归您所有。您授予快哉有限许可，仅为向您提供本服务而使用、复制、存储和传输这些内容，包括在您批准申报时将其提交给相关机构，经您批准提供给您聘请的专业人士，按上文所述提供给您共享的总部，以及提供给隐私政策中列明的服务提供方。

我们不会用您的内容训练 AI 模型，不会出售您的内容，也不会将其用于广告。

如您向我们提出建议或反馈，我们可以使用，且对您不承担任何义务。

## 快哉的服务

快哉拥有本服务，包括其软件、指南和设计，但不包括您的内容。在您拥有工作区期间，您可以依照本条款为您的企业使用本服务。您不得：

- 复制、转售或再许可本服务
- 对本服务进行逆向工程，或用其开发竞争产品
- 抓取本服务、使其超负荷运行，或试图绕过其安全措施或使用限制
- 违反美国出口管制或制裁法律使用本服务；如您被列入美国政府禁止或限制交易的名单，不得使用本服务

## 连接的服务

您可以自行选择连接 Gmail、Google Calendar、Google Drive、Outlook Mail、Outlook Calendar、Dropbox、QuickBooks 和 Slack。我们只将这些服务用于您要求的任务。这些服务由各自的提供方运营，适用其自身条款。您可以随时在“设置”中断开任何一项连接。

## 停止使用

- 您可以随时在“设置”的“账单”中取消套餐。
- 您可以按《申报授权书》的说明，随时撤销申报授权。
- 您可以在“设置”的“隐私与数据”中下载工作区数据并导出审计记录。
- 您可以在“设置”的“隐私与数据”中删除账户。这会删除您单独拥有的工作区，包括其中的文件、申报和审计记录，并让您退出其他工作区。如您单独拥有的工作区仍有付费套餐，请先取消。您也可以发邮件至 support@placetta.com，要求删除某个工作区。
- 法律要求我们保留的记录（例如账单记录）会继续保留。

如工作区违反本条款或法律，或未付款，我们可以暂停或关闭该工作区。除非法律不允许，或会对他人造成风险，我们会事先通知您。

已提交给机构的申请由该机构保存，快哉无法撤回。

本条款中按其性质应在您停止使用后继续有效的部分继续有效，包括欠付的费用、免责声明、责任限制、赔偿和争议解决。

## 免责声明

在法律允许的范围内，本服务按“现状”和“可用状态”提供。快哉不作任何默示保证，包括对适销性、特定用途适用性和不侵权的保证。我们不保证服务不会出错或中断，不保证我们梳理的执照清单完整，也不保证任何机构会批准申请。

## 责任限制

在法律允许的范围内：

- 对于因本条款或本服务引起或与之相关的全部索赔，快哉的赔偿责任总额以引起索赔的事件发生前 12 个月内您向快哉支付的费用为限。政府规费和您支付给他人的费用不计算在内。
- 对于间接、附带、特殊、后果性、惩戒性或惩罚性损失，以及利润、收入、租金、数据或商誉损失，即使我们已被告知可能发生，快哉也不承担责任。
- 对于任何机构的决定、行为或延误，申请被驳回或延误，执照或许可失效，以及由此产生的罚款、罚金、滞纳金、停业或延迟开业，快哉不承担责任。法律不允许上述排除的，这些损失适用上述赔偿上限。

无论基于合同、侵权还是其他法律理论，即使某项救济未能实现其根本目的，上述限制均适用。法律禁止限制责任的情形（例如欺诈、重大过失或故意不当行为）不适用上述限制。

## 您的赔偿责任

对于任何第三方索赔（包括政府机构提出的索赔或程序），以及由此产生的损失、罚款、罚金和合理的律师费，在其因下列情形引起的范围内，您须为快哉及其高级职员、员工和承包商进行抗辩并作出赔偿：

- 您向我们提供或经您批准的信息不准确、不完整或具有误导性
- 您批准或要求我们提交的申报或消息，涉及您无权代表的企业或个人
- 您无权上传、连接或分享的内容，或侵犯他人权利的内容
- 您违反法律或本条款

快哉会及时将索赔告知您，由您主导抗辩，并在您承担费用的前提下予以配合。未经快哉书面同意，您不得以代快哉承认过错或约束快哉的方式和解。

## 适用法律

本条款以及您与快哉之间的任何争议，均受纽约州法律管辖，不适用其冲突法规则。下文的仲裁约定受美国《联邦仲裁法》管辖。

## 争议解决

先与我们沟通。在启动仲裁或诉讼之前，提出索赔的一方须向另一方发出书面通知，说明索赔内容及所要求的救济。您的通知请发送至 support@placetta.com，并邮寄至下文地址。我们的通知将发送至您账户的邮箱。自通知送达之日起 30 天内，双方将本着诚意尝试非正式地解决争议。

具有约束力的仲裁。如争议在这 30 天内未能解决，任何一方均可启动仲裁。因本条款或本服务引起或与之相关的任何争议，均通过具有约束力的仲裁解决，由美国仲裁协会（AAA）依据其《商事仲裁规则》管理，由一名仲裁员审理。仲裁地为纽约州纽约县；经仲裁员同意，可以通过视频开庭。对仲裁裁决的判决可由任何有管辖权的法院作出。

仅限个别索赔。索赔只能以个别方式提出，不得以原告或成员身份参与任何集体诉讼、集合诉讼、合并程序或代表人程序。仲裁员不得合并多个客户的索赔，也不得向当事人以外的任何人给予救济。

放弃陪审团审判。您和快哉均放弃由陪审团审判的权利。

例外情形。符合条件的个别索赔，任何一方均可向小额索赔法院提起。为保护其知识产权或保密信息，任何一方也可以向纽约州纽约县的州法院或联邦法院申请禁令或其他衡平救济。对于此类案件以及任何不通过仲裁解决的索赔，您和快哉同意由上述法院管辖。

如禁止集体和代表人程序的约定对某项索赔被认定为不可执行，该索赔将由上述法院审理，而不通过仲裁解决，本节其余内容仍然适用。

## 条款变更

我们可能更新本条款。更新后，我们会在 placetta.com 和应用中发布新版本并标注新日期。

- 对于重大变更，我们会通过邮件或应用内通知告知您，变更自通知之日起满 30 天后生效。此后您继续使用本服务，即表示您接受新条款。如您不同意，请在此之前取消。
- 其他变更（例如文字澄清、为新功能所作的更新或法律要求的变更）自发布时生效。
- 对“争议解决”一节的变更，不适用于在变更生效前任何一方已发出通知的争议。

## 一般条款

- 转让：未经我们书面同意，您不得转让本条款，但转让给承继您全部或大部分业务并同意本条款的继受方除外。快哉可以将本条款转让给其关联方，或在合并、收购或出售其全部或大部分业务时转让。
- 完整协议：本条款、《申报授权书》、隐私政策以及您接受的任何订单，构成关于本服务的完整协议，取代此前关于本服务的协议和提案。您的采购订单中的条款不适用。
- 可分割性：如法院或仲裁员认定本条款的某部分不可执行，该部分在法律允许的范围内执行，其余部分继续有效。
- 不弃权：任何一方未行使某项权利，不代表放弃该权利。
- 不可控事件：因超出其合理控制范围的事件造成的延误或未能履行，任何一方均不承担责任，例如机构系统中断，机构网站、申报平台或表格变更，法律或机构规则变更，政府停摆，运营商、互联网或我们的服务提供方故障，自然灾害，疫情，战争或劳资纠纷。但这不免除付款义务。
- 独立承包方：除《申报授权书》中的有限授权外，任何一方都不是另一方的代理人、合伙人、合营方或雇员。
- 语言：本条款有中英文两个版本。如两者不一致，以英文版本为准。

## 通知

我们会向您账户的邮箱或在应用中向您发送通知。给快哉的通知请发送至 support@placetta.com。争议通知或其他法律通知还须邮寄至下文地址。邮件通知自发送时视为送达，除非发送方得知其未能送达。

## 联系我们

Placetta Inc.，9 W 57th St, Fl 48, New York, NY 10019, United States

邮箱：support@placetta.com

网站：placetta.com`;

const PRIVACY_EN = `Effective date: ${UPDATED}.

This policy explains how Placetta Inc. ("Placetta", "we") handles information when people visit placetta.com, and when businesses use the Placetta app and text or call Odelia, Placetta's AI agent. Placetta is a service for businesses. Most of the information we handle comes from businesses and the people who act for them.

## What we collect

- Account information: your email address, your name if you sign in with Google or Microsoft (we receive only your basic profile), the workspaces you belong to and your role, and whether two-step sign-in is on.
- Workspace information: details about your business, and about people in it such as owners and managers, that you give us so we can fill applications.
- Documents you upload, and the applications and messages prepared in your workspace.
- Your conversations with Odelia and your approvals, including your signature when you sign a form in the app.
- Texts and calls with Odelia, if you link a phone. See "Texts and calls" below.
- The audit trail: a record of every action by Odelia, by you, by our team and by agencies.
- Agency portal logins you choose to save, encrypted in a vault.
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
- send you agency payment links
- answer your texts and calls, and send the update texts and urgent calls you turn on
- send the weekly headquarters summary an owner sets up
- bill you for your plan
- keep your audit trail
- reply to plan requests and support requests
- keep the service secure and prevent misuse
- meet our legal obligations

We do not sell personal information. We do not use it for advertising. We do not use your content to train AI models.

## Who processes it

Only the following process your information, and only to run the service:

- Supabase stores your workspace, documents, texts and audit log, and runs sign-in, in its US East region.
- Vercel hosts placetta.com and the app.
- Anthropic processes content with its Claude models so Odelia can do her work. Where we configure it, some of that work goes instead to models from OpenAI, Google (Gemini), DeepSeek, OpenRouter or Groq.
- Microsoft Azure Speech turns Odelia's replies into speech when the app speaks them.
- Telnyx carries texts and calls with Odelia, runs her voice and the transcription of calls through the speech services it uses, and sends the applications we file by fax.
- Stripe processes payments.
- Resend delivers the emails we send, such as deadline reminders, filing updates and headquarters summaries.
- Lob prints and mails the applications we file by mail.
- Google and Microsoft, when you sign in with them or connect their services.
- Placetta checks and submits the applications you approve, by email, fax, certified mail or the agency's website, with our filing team as backup.
- Government agencies receive the applications you approve.
- Independent professionals you engage, such as attorneys and customs brokers, receive what they need, with your approval.
- A headquarters an owner shares with sees the store status described below.
- The services you connect, as described below.

We may also disclose information when the law requires it, to protect the rights and safety of people or of Placetta, or to a successor in a merger, acquisition or sale of Placetta's business, which must keep honoring this policy.

## Integrations

Integrations are optional. You decide which ones to connect, and we use each only for the tasks you ask for:

- Gmail and Outlook Mail: find agency emails and send messages you approve.
- Google Calendar and Outlook Calendar: add deadlines to your calendar.
- Google Drive and Dropbox: import documents.
- QuickBooks: read gross receipts for tax registrations.
- Slack: post status updates.

You can disconnect any integration at any time in Settings.

## Agency portal logins

If you save logins for agency websites, they are encrypted in a vault. Placetta's filing software, and our filing team when it takes over, open them only to file for you, and every opening is recorded in your audit trail.

## Texts and calls

If you link a phone to text and call Odelia, we collect:

- your mobile number, time zone, language and quiet hours, and which texts and calls you turned on
- consent records: when you confirmed the number with the texted code, and when you replied STOP or turned texts or calls off
- the texts you send Odelia and the texts she sends you
- a record of each call: whether you or Odelia called, when, and how long it lasted
- what you ask Odelia to do by text or on a call, which starts work in your workspace like a request in the app, and her answers

Calls use an AI voice and are transcribed as they happen so Odelia can understand you. Telnyx, and the speech services it uses, process the call audio and transcription to run the call. Placetta does not record call audio.

We use this information only to answer you, do what you ask, send the update texts and urgent calls you turned on, check that a caller is you, and keep a record of your consent.

Your texts, call records and consent records are kept while your account exists and are deleted when you delete it. You can see recent texts and calls in Settings. Removing your number in Settings stops texts and calls to it and cancels any that are waiting.

We do not sell or share mobile numbers or text consent with third parties for their marketing.

## Headquarters sharing

An owner of a workspace can share its stores' status with a headquarters email address in Settings. If they do:

- We store that email address and the brand name the owner enters.
- A person who signs in to Placetta with that email address, after confirming it, sees one read-only line per store, and the address gets a summary email each Monday.
- What is shared: the workspace name and brand, and for each store its name, address and stage, how many licenses are current, due within 30 days or overdue, how many applications are pending, and the next item due with its date.
- What is not shared: documents, the contents of applications, agency logins, conversations, texts and calls with Odelia, Odelia's memory, or who is on the team.
- An owner can stop sharing at any time in Settings. Access ends and the weekly email stops. Emails already sent cannot be recalled.

## International transfers

Placetta is based in the United States. We store your information in the United States, and our processors handle it in the United States and, for some of them, in other countries where they operate. When we configure Odelia to use a model from another provider, that provider may process content in its own country.

If you are in the People's Republic of China, or you give us personal information about people there:

- That information is transferred to Placetta Inc. in the United States and processed as this policy describes. By using the service, you consent to that transfer.
- The overseas recipient is Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States, support@placetta.com. The purposes, methods and kinds of information are those described in this policy.
- Some documents, such as identity documents, contain sensitive personal information. We use it only to prepare the filings you ask for.
- Where PRC law requires it, we rely on the PRC standard contract for the cross-border transfer of personal information.
- You can access, copy, correct or delete that information, or withdraw your consent, by following "Making a privacy request" below. Withdrawing consent does not affect what was done before, but we may no longer be able to provide the service.
- If you give us personal information about other people in China, you are responsible for telling them and for getting any consent PRC law requires.

## Retention

- Workspace information, documents and the audit trail are kept while the workspace exists. They are deleted when the workspace is deleted, including when its only owner deletes their account.
- Account information, texts and call records are kept while your account exists, and are deleted when you delete it.
- Plan requests from placetta.com are kept while we need them to follow up, or until you ask us to delete them.
- We keep records the law requires us to keep, such as billing records, for as long as it requires.
- Deleted information can remain in encrypted backups for a short time until those backups are replaced.

Applications already submitted to an agency are held by that agency under its own rules.

## Security

- Information is encrypted in transit, and encrypted at rest by our hosting and database providers.
- Agency portal logins are encrypted in a vault. They are opened only to file for you, and each opening is logged.
- You can turn on two-step sign-in, and a PIN for sensitive settings, in Settings. Placetta's team must use two-step sign-in to reach customer records and saved logins.
- Card numbers are handled by Stripe. We never see full card numbers.
- The audit trail records every action by Odelia, by you, by our team and by agencies.
- Nothing is filed, paid or sent without your approval.

No system is perfectly secure. If you think someone else has accessed your workspace, email support@placetta.com.

## Your choices and rights

- Download your workspace data and export the audit trail in Settings, Privacy and data.
- Delete your account in Settings, Privacy and data. This deletes the workspaces you own alone. You can also ask us to delete a workspace or your data by emailing support@placetta.com.
- Disconnect integrations in Settings.
- Turn texts or calls off, change quiet hours or remove your number in Settings, or reply STOP.
- Stop sharing with headquarters in Settings.
- Revoke your Filing Authorization, as it explains.

## US state privacy rights

Depending on the state you live in, such as California, its law may give you rights over your personal information, such as the right to:

- know what we collect and access it
- get a copy in a portable format
- correct it
- delete it
- opt out of its sale or sharing, targeted advertising or certain profiling
- limit the use of sensitive personal information

We do not sell or share personal information, as California law uses those words, and we do not use it for targeted advertising or for profiling that has legal or similarly significant effects. We use sensitive personal information only to provide the service you ask for.

We will not treat you differently for using these rights.

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
- 工作区信息：为填写申请，您向我们提供的企业信息，以及企业所有人、经理等相关人员的信息。
- 您上传的文件，以及在您工作区中准备的申请和消息。
- 您与 Odelia 的对话和您的批准记录，包括您在应用中签署表格时的签名。
- 如您关联了手机，您与 Odelia 之间的短信和通话，详见下文“短信与电话”。
- 审计记录：Odelia、您、我们的团队和各机构的每一项操作。
- 您选择保存的机构网站登录信息，加密存放在保险库中。
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
- 向您发送机构付款链接
- 回复您的短信和来电，并发送您开启的更新短信和紧急来电
- 发送所有者设置的每周总部摘要
- 收取套餐费用
- 保存您的审计记录
- 回复方案申请和支持请求
- 保障服务安全，防止滥用
- 履行我们的法定义务

我们不出售个人信息，不将其用于广告，也不用您的内容训练 AI 模型。

## 谁会处理这些信息

只有以下各方会处理您的信息，且仅为运行本服务：

- Supabase：在其美国东部区域存储您的工作区、文件、短信和审计记录，并提供登录服务。
- Vercel：托管 placetta.com 和快哉应用。
- Anthropic：通过其 Claude 模型处理内容，使 Odelia 能够完成工作。在我们配置的情况下，部分工作改由 OpenAI、Google（Gemini）、DeepSeek、OpenRouter 或 Groq 的模型处理。
- Microsoft Azure Speech：应用朗读回复时，将 Odelia 的回复转换为语音。
- Telnyx：传送您与 Odelia 之间的短信和通话，通过其使用的语音服务提供 Odelia 的语音和通话转录，并以传真方式发送我们提交的申请。
- Stripe：处理付款。
- Resend：发送我们发出的邮件，例如截止日期提醒、申报进展和总部摘要。
- Lob：打印并邮寄我们以邮寄方式提交的申请。
- Google 和 Microsoft：在您使用其账户登录或连接其服务时。
- 快哉：核对并提交您批准的申请，方式包括邮件、传真、挂号信或机构网站，并由我们的申报团队作为后备。
- 政府机构：接收您批准的申请。
- 您聘请的独立专业人士（例如律师和报关行）：经您批准，接收其所需的信息。
- 所有者与之共享的总部：查看下文所述的门店状态。
- 您连接的服务：详见下文“集成”。

在法律要求时，为保护他人或快哉的权利和安全，或在快哉发生合并、收购或业务出售时向继受方，我们也可能披露信息；继受方须继续遵守本政策。

## 集成

所有集成均为可选，由您决定连接哪些。我们只将每项集成用于您要求的任务：

- Gmail 和 Outlook Mail：查找机构邮件，发送您批准的消息。
- Google Calendar 和 Outlook Calendar：把截止日期添加到日历。
- Google Drive 和 Dropbox：导入文件。
- QuickBooks：读取营业总收入，用于税务登记。
- Slack：发布进度更新。

您可以随时在“设置”中断开任何一项集成。

## 机构网站登录信息

如您保存了机构网站的登录信息，这些信息会加密存放在保险库中。快哉的申报软件，以及接手处理时的申报团队，只会在为您办理申报时打开这些信息，每次打开都会记入您的审计记录。

## 短信与电话

如您关联手机，用来给 Odelia 发短信和打电话，我们会收集：

- 您的手机号、时区、语言和免打扰时段，以及您开启了哪些短信和来电
- 同意记录：您用短信验证码确认号码的时间，以及您回复 STOP 或关闭短信、来电的时间
- 您发给 Odelia 的短信，以及她发给您的短信
- 每次通话的记录：是您来电还是 Odelia 来电、通话时间和时长
- 您通过短信或电话请 Odelia 办理的事项（这会像在应用中提出请求一样，在您的工作区中开始办理），以及她的回复

通话使用 AI 语音，并在通话过程中实时转录，以便 Odelia 理解您的话。Telnyx 及其使用的语音服务会处理通话音频和转录内容，以完成通话。快哉不录制通话音频。

我们使用这些信息，仅为回复您、办理您要求的事项、发送您开启的更新短信和紧急来电、核实来电者是您本人，以及保存您的同意记录。

您的短信、通话记录和同意记录在您的账户存续期间保存，并在您删除账户时一并删除。您可以在“设置”中查看最近的短信和通话。在“设置”中移除号码后，我们将不再向该号码发短信或打电话，尚未发出的也会取消。

我们不会出于第三方营销目的，向第三方出售或共享手机号或短信同意。

## 与总部共享

工作区的所有者可以在“设置”中与总部邮箱共享各门店的状态。如果共享：

- 我们会保存该邮箱地址和所有者填写的品牌名称。
- 用该邮箱登录快哉并完成邮箱验证的人，可以看到每家门店的一行只读信息，该邮箱每周一还会收到一封摘要邮件。
- 共享的内容：工作区名称和品牌，以及每家门店的名称、地址和阶段、有效执照数量、30 天内到期和已逾期的事项数量、办理中的申请数量，以及下一个到期事项及其日期。
- 不共享的内容：文件、申请内容、机构登录信息、对话、与 Odelia 的短信和通话、Odelia 的记忆，以及团队成员。
- 所有者可以随时在“设置”中停止共享。停止后，总部将无法查看，每周邮件也会停止。已发送的邮件无法撤回。

## 跨境传输

快哉位于美国。我们在美国存储您的信息；我们的服务提供方在美国处理这些信息，其中部分提供方也会在其运营所在的其他国家处理。我们将 Odelia 配置为使用其他提供方的模型时，该提供方可能在其所在国家处理相关内容。

如您位于中华人民共和国，或您向我们提供了位于中国境内的人员的个人信息：

- 这些信息会传输至美国的 Placetta Inc.，并按本政策所述进行处理。您使用本服务，即表示您同意此项传输。
- 境外接收方为 Placetta Inc.，地址：9 W 57th St, Fl 48, New York, NY 10019, United States，联系邮箱：support@placetta.com。处理目的、处理方式和个人信息种类，均如本政策所述。
- 部分文件（例如身份证件）包含敏感个人信息。我们仅为准备您要求的申报而使用这些信息。
- 在中国法律要求的情况下，我们依据中国个人信息出境标准合同进行传输。
- 您可以按下文“如何提出隐私请求”的说明，查阅、复制、更正或删除这些信息，或撤回您的同意。撤回同意不影响此前已进行的处理，但我们可能因此无法继续提供服务。
- 如您向我们提供了中国境内其他人员的个人信息，您须负责告知他们，并取得中国法律要求的同意。

## 保存期限

- 工作区信息、文件和审计记录在工作区存续期间保存，并在工作区被删除时删除，包括其唯一所有者删除账户的情形。
- 账户信息、短信和通话记录在您的账户存续期间保存，并在您删除账户时删除。
- 在 placetta.com 提交的方案申请，在我们跟进所需期间保存，或保存至您要求删除为止。
- 法律要求我们保留的记录（例如账单记录），按法律要求的期限保存。
- 已删除的信息可能会在加密备份中短暂保留，直至这些备份被替换。

已提交给机构的申请，由该机构按其自身规定保存。

## 安全

- 信息在传输过程中加密，并由我们的托管和数据库服务提供方进行静态加密。
- 机构网站登录信息加密存放在保险库中，只在为您申报时打开，每次打开都有记录。
- 您可以在“设置”中开启两步登录，以及用于敏感设置的 PIN。快哉团队成员必须开启两步登录，才能访问客户记录和已保存的登录信息。
- 银行卡号由 Stripe 处理。我们看不到完整卡号。
- 审计记录会记下 Odelia、您、我们的团队和各机构的每一项操作。
- 未经您批准，不会提交、付款或发送任何内容。

任何系统都无法做到绝对安全。如您认为他人可能进入了您的工作区，请发邮件至 support@placetta.com。

## 您的选择和权利

- 在“设置”的“隐私与数据”中下载工作区数据并导出审计记录。
- 在“设置”的“隐私与数据”中删除账户。这会删除您单独拥有的工作区。您也可以发邮件至 support@placetta.com，要求删除某个工作区或您的数据。
- 在“设置”中断开集成。
- 在“设置”中关闭短信或来电、更改免打扰时段或移除号码，或回复 STOP。
- 在“设置”中停止与总部共享。
- 按《申报授权书》的说明，撤销申报授权。

## 美国各州的隐私权利

根据您所在州（例如加利福尼亚州）的法律，您可能对自己的个人信息享有以下权利：

- 了解我们收集了哪些信息，并查阅这些信息
- 以便于转移的格式获取副本
- 更正信息
- 删除信息
- 拒绝出售或共享、定向广告或特定类型的画像分析
- 限制对敏感个人信息的使用

我们不会出售或共享（按加州法律对这两个词的定义）个人信息，也不会将其用于定向广告或会产生法律效力或类似重大影响的画像分析。我们仅为提供您要求的服务而使用敏感个人信息。

您不会因行使这些权利而受到差别对待。

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

This authority covers only the filings you approve in the app, exactly as you approved them. Each approval covers that one filing. It covers nothing else. It is not a general power of attorney.

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

## We may decline a filing

Placetta may refuse to submit a filing that we believe in good faith is inaccurate, incomplete, unlawful or not authorized by your business. We will tell you why, so you can correct it and approve it again.

## What you confirm

By granting this authorization, and each time you approve a filing, you confirm that:

- the information in it is true, accurate and complete, to the best of your knowledge
- you have authority to act and sign for the business
- you reviewed the filing before approving it

## Agency portal logins

If you save logins for agency websites, they are encrypted in a vault. Placetta's filing software, and our filing team when it takes over, open them only to file for you, and every opening is recorded in your audit trail.

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

本授权仅涵盖您在应用中批准的申报，且以您批准的内容为准。每次批准只涵盖该项申报。本授权不涵盖其他任何事项，也不是一般性的授权委托书。

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

## 我们可以拒绝申报

如我们善意地认为某项申报不准确、不完整、违法，或未经您的企业授权，快哉可以拒绝提交，并会告诉您原因，以便您更正后重新批准。

## 您确认的事项

授予本授权以及每次批准申报时，即表示您确认：

- 据您所知，其中的信息真实、准确、完整
- 您有权代表该企业行事和签署
- 您已在批准前审核该项申报

## 机构网站登录信息

如您保存了机构网站的登录信息，这些信息会加密存放在保险库中。快哉的申报软件，以及接手处理时的申报团队，只会在为您办理申报时打开这些信息，每次打开都会记入您的审计记录。

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

## Where its answers come from

Odelia researches requirements on official government websites and cites the agency source, so you can check it.

## What it never does on its own

Odelia never files, pays or sends anything by herself. Every filing and every message needs your approval in the app.

After you approve a filing, Placetta checks it against the agency's current requirements before submitting it. You always pay government fees yourself, directly to the agency.

## It can be wrong

AI output can be wrong. Review every application and message before you approve it, and read the cited source when something looks off. Reminders help you, but your business remains responsible for its deadlines. Placetta is not a law firm and does not give legal advice.

## Texts and calls

- Odelia is an AI. Every call opens with her saying so, and saying that the call is transcribed.
- Calls use an AI voice and are transcribed as they happen so she can understand you. Placetta does not record call audio.
- Your texts, and a record of each call, are kept with your account. You can see recent ones in Settings.
- By text or call, Odelia can answer from your workspace and start work, but she never files, pays, sends, approves or deletes anything that way. She texts you a link to the approval in the app.
- She texts or calls you first only if you turned that on in Settings, and never during your quiet hours. Reply STOP to stop texts, or HELP for help.

## Models and your data

- Odelia runs on Claude models from Anthropic. Where we configure it, some work runs on models from OpenAI, Google (Gemini), DeepSeek, OpenRouter or Groq instead.
- Spoken replies in the app are generated with Microsoft Azure text to speech.
- On calls, Odelia's voice and speech recognition run through Telnyx.
- We do not use your content to train AI models.

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

## 信息从哪里来

Odelia 在政府官方网站上查询相关要求，并注明机构来源，方便您核实。

## 未经批准，它不会做什么

Odelia 不会自行提交、付款或发送任何内容。每一份申请、每一条消息，都须经您在应用中批准。

您批准申请后，快哉会先对照机构的最新要求进行核对，再行提交。政府规费始终由您本人直接支付给机构。

## 它可能出错

AI 生成的内容可能有误。批准前，请审核每一份申请和每一条消息；如有疑问，请查看所注明的来源。提醒只是辅助，按时办理仍是您企业的责任。快哉不是律师事务所，不提供法律意见。

## 短信与电话

- Odelia 是 AI。每次通话开始时，她都会说明这一点，并告知通话会被转录。
- 通话使用 AI 语音，并在通话过程中实时转录，以便她理解您的话。快哉不录制通话音频。
- 您的短信和每次通话的记录随您的账户保存。您可以在“设置”中查看最近的记录。
- 通过短信或电话，Odelia 可以根据您的工作区回答问题并开始办理，但绝不会以这种方式提交、付款、发送、批准或删除任何内容。她会把应用中的批准链接用短信发给您。
- 只有在您于“设置”中开启后，她才会主动给您发短信或打电话，并且不会在您的免打扰时段联系您。回复 STOP 可退订短信，回复 HELP 获取帮助。

## 模型与您的数据

- Odelia 基于 Anthropic 的 Claude 模型运行。在我们配置的情况下，部分工作改由 OpenAI、Google（Gemini）、DeepSeek、OpenRouter 或 Groq 的模型处理。
- 应用中的语音回复由 Microsoft Azure 文字转语音服务生成。
- 通话中，Odelia 的语音和语音识别通过 Telnyx 提供。
- 我们不会用您的内容训练 AI 模型。

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
