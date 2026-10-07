// Customer-facing legal pages, in English and Simplified Chinese.
// Body markup: blank line between paragraphs, "## " for headings, "- " for bullets,
// bare URLs and emails only. The same text is published as Markdown in /legal.

export type LegalDoc = { id: "terms" | "privacy" | "authorization" | "ai"; title: { en: string; zh: string }; updated: string; body: { en: string; zh: string } };

const UPDATED = "2026-10-05";

const TERMS_EN = `These terms are an agreement between you and Placetta Inc. ("Placetta", "we", "us"). They cover your use of placetta.com and the Placetta app (the "service"). By creating a workspace or using the service, you agree to them for the business you represent.

## Who can use Placetta

Placetta is for businesses. To use it, you must:

- be 18 or older
- use it for a business
- have authority to act for that business

## What Placetta does

Placetta helps businesses get the licenses, permits and registrations they need to open and operate locations in the United States. Our AI agent:

- maps the licenses your business needs
- reads the documents you upload
- fills applications from your information
- tracks deadlines and renewals
- drafts messages

The agent researches requirements on official government websites and cites the agency source.

## Your approval comes first

The agent never files, pays or sends anything on its own. Every filing and every message needs your approval in the app.

After you approve an application, Placetta's software checks it against the agency's current requirements and submits it on your behalf by email from your connected mailbox, by fax, by certified mail or on the agency's website, using the saved logins you choose to keep with us. When no automatic channel fits, our filing team submits it. Placetta stops and asks you whenever an agency requires a CAPTCHA, an identity check, a payment or your handwritten signature, and some agencies require an in-person step. You complete those yourself. Placetta never types a card or bank number and never sends a Social Security, ITIN or passport number.

Our Filing Authorization sets out the limited authority you give us to file for you.

## What Placetta is not

- Placetta is not a law firm and does not give legal advice. Using the service does not create an attorney-client relationship.
- Agencies decide whether to approve an application and how long it takes. We cannot guarantee approval or timing.
- AI output can be wrong. You are responsible for reviewing what you approve.

## Government fees

You pay government fees directly to each agency. We send you the agency's payment link. Placetta never charges agency fees.

## Plans and billing

Placetta's fees are billed through Stripe.

- Entry plan: $299 per market, paid once. The $299 is credited toward your first year.
- Monthly plan: from $750 per month. It covers filing by our team, tracking and renewals.

You can cancel the monthly plan at any time. Cancellation takes effect at the end of the current billing period.

Fees are non-refundable, except where the law requires a refund.

## Your responsibilities

You agree to:

- give us accurate information
- act only for a business you have authority to represent
- review every application and message before you approve it
- complete the steps an agency requires of you, such as signing or appearing in person
- pay government fees directly to the agencies
- use the service lawfully and upload only content you have the right to share
- keep your login secure, and tell us at support@placetta.com if you think someone else has accessed your workspace

## Your content

Your documents and information stay yours. You let us use them only to provide the service to you. That includes sending them to the agencies when you approve a filing, and to the processors named in our Privacy Policy.

We do not use your content to train AI models. We do not sell it, and we do not use it for advertising.

## Connected services

You can choose to connect Gmail, Google Calendar, Google Drive, Outlook Mail, Outlook Calendar, Dropbox, QuickBooks and Slack. We use them only for the tasks you ask for. Each is run by its provider under its own terms. You can disconnect any of them in Settings at any time.

## Ending your use

You can cancel your plan and revoke your Filing Authorization at any time. You can download your workspace data from Settings and ask us to delete it by emailing support@placetta.com.

We may suspend or close a workspace that breaks these terms or the law.

Applications already submitted to an agency stay with that agency. Placetta cannot recall them.

## Disclaimers

To the extent the law allows, the service is provided "as is". We do not promise that it will be free of errors or interruptions, or that any agency will approve an application.

## Limitation of liability

To the extent the law allows, Placetta is not liable for indirect, incidental, special or consequential damages, or for lost profits or revenue, arising from your use of the service.

## Changes to these terms

We may update these terms. When we do, we will post the new version on placetta.com with a new date. If you keep using the service after that, the new terms apply.

## Governing law and disputes

New York law governs these terms. If you have a concern, email support@placetta.com first so we can try to resolve it directly.

## Contact

Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States

Email: support@placetta.com

Website: placetta.com`;

const TERMS_ZH = `本条款是您与 Placetta Inc.（中文名称“快哉”，下称“快哉”或“我们”）之间的协议，适用于您对 placetta.com 和快哉应用（下称“本服务”）的使用。您创建工作区或使用本服务，即表示您代表所属企业同意本条款。

## 谁可以使用

快哉面向企业。使用本服务，您须：

- 年满 18 周岁
- 为企业使用本服务
- 有权代表该企业行事

## 快哉提供什么服务

快哉帮助企业办理在美国开设和经营门店所需的执照、许可和登记。我们的 AI 智能体会：

- 梳理您的企业需要哪些执照
- 阅读您上传的文件
- 根据您的信息填写申请
- 跟踪截止日期和续期
- 起草消息

智能体在政府官方网站上查询相关要求，并注明所依据的机构来源。

## 一切以您的批准为前提

智能体不会自行提交、付款或发送任何内容。每一份申请、每一条消息，都须经您在应用中批准。

您批准申请后，快哉的申报团队会对照该机构的最新要求进行核对，再代表您在该机构网站上提交。部分机构要求您本人签名或亲自到场办理，这些步骤由您自行完成。

您授予我们代为申报的有限权限，详见《申报授权书》。

## 快哉不是什么

- 快哉不是律师事务所，不提供法律意见。使用本服务不会在您与我们之间建立律师与客户关系。
- 申请能否获批、需要多长时间，由各机构决定。我们无法保证获批，也无法保证办理时间。
- AI 生成的内容可能有误。您批准的内容，由您负责审核。

## 政府规费

政府规费由您直接支付给各机构。我们会把机构的付款链接发给您。快哉从不收取机构费用。

## 套餐与计费

快哉的服务费通过 Stripe 收取。

- 入门套餐：每个市场 299 美元，一次性付费。这 299 美元可抵扣您第一年的费用。
- 月度套餐：每月 750 美元起，包括由我们团队代为申报、进度跟踪和续期。

月度套餐可随时取消，取消在当前计费周期结束时生效。

除法律另有规定外，已付费用不予退还。

## 您的责任

您同意：

- 向我们提供准确的信息
- 仅代表您有权代表的企业行事
- 在批准前审核每一份申请和每一条消息
- 完成机构要求您本人办理的步骤，例如签名或到场
- 直接向各机构支付政府规费
- 合法使用本服务，只上传您有权分享的内容
- 妥善保管登录信息；如怀疑他人进入了您的工作区，请发邮件至 support@placetta.com 告知我们

## 您的内容

您的文件和信息仍归您所有。您允许我们仅为向您提供本服务而使用这些内容，包括在您批准申报时将其提交给相关机构，以及提供给隐私政策中列明的服务提供方。

我们不会用您的内容训练 AI 模型，不会出售您的内容，也不会将其用于广告。

## 连接的服务

您可以自行选择连接 Gmail、Google Calendar、Google Drive、Outlook Mail、Outlook Calendar、Dropbox、QuickBooks 和 Slack。我们只将这些服务用于您要求的任务。这些服务由各自的提供方运营，适用其自身条款。您可以随时在“设置”中断开任何一项连接。

## 停止使用

您可以随时取消套餐，也可以随时撤销申报授权。您可以在“设置”中下载工作区数据，并发邮件至 support@placetta.com 要求删除。

如工作区违反本条款或法律，我们可以暂停或关闭该工作区。

已提交给机构的申请由该机构保存，快哉无法撤回。

## 免责声明

在法律允许的范围内，本服务按“现状”提供。我们不保证服务不会出错或中断，也不保证任何机构会批准申请。

## 责任限制

在法律允许的范围内，对于因使用本服务而产生的间接、附带、特殊或后果性损失，以及利润或收入损失，快哉不承担责任。

## 条款变更

我们可能更新本条款。更新后，我们会在 placetta.com 发布新版本并标注新日期。您在此之后继续使用本服务，即适用新条款。

## 适用法律与争议

本条款受纽约州法律管辖。如有任何疑问或争议，请先发邮件至 support@placetta.com，我们会尽力直接解决。

## 联系我们

Placetta Inc.，9 W 57th St, Fl 48, New York, NY 10019, United States

邮箱：support@placetta.com

网站：placetta.com`;

const PRIVACY_EN = `This policy explains how Placetta Inc. ("Placetta", "we") handles information when businesses use placetta.com and the Placetta app. Placetta is a service for businesses. The information we handle comes from businesses and the people who act for them.

## What we collect

- Account information: your email address, your name if you sign in with Google or Microsoft (we receive only your basic profile), the workspaces you belong to and your role, and whether two-step sign-in is on.
- Workspace information: details about your business, and about the people in it, that you give us so we can fill applications.
- Documents you upload, and the applications and messages prepared in your workspace.
- Your conversations with the agent and your approvals.
- The audit trail: a record of every action by the agent, by you, by our team and by agencies.
- Agency portal logins you choose to save, encrypted in a vault.
- Payment details, which Stripe handles. We never see full card numbers.
- Information from services you choose to connect, used only for the tasks you ask for.

## How we use it

We use information only to provide Placetta to you:

- map the licenses your business needs and fill applications
- read your documents and track deadlines and renewals
- draft messages for you to approve
- check and submit the applications you approve
- send you agency payment links
- bill you for your plan
- keep your audit trail
- answer your support requests
- meet our legal obligations

We do not sell personal information. We do not use it for advertising. We do not use your content to train AI models.

## Who processes it

Only the following process your information, and only to run the service:

- Supabase stores your workspace, documents and audit log in its US East region.
- Anthropic processes content with its Claude models so the agent can do its work.
- Microsoft Azure turns the agent's replies into speech when the app speaks them.
- Stripe processes payments.
- Placetta checks and submits the applications you approve, by email, fax, certified mail or the agency's website, with our filing team as backup.
- Government agencies receive the applications you approve.
- The services you connect, as described below.

We may also disclose information when the law requires it.

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

## Retention

You can ask us to delete your workspace data at any time by emailing support@placetta.com. We then delete it, except for records the law requires us to keep, such as billing records.

Applications already submitted to an agency are held by that agency under its own rules.

## Security

- Agency portal logins are encrypted in a vault.
- Those logins are opened only to file for you, and each opening is logged.
- The audit trail records every action by the agent, by you, by our team and by agencies.
- Nothing is filed, paid or sent without your approval.

No system is perfectly secure. If you think someone else has accessed your workspace, email support@placetta.com.

## Your choices and rights

- Download your workspace data from Settings.
- Ask us to delete your data by emailing support@placetta.com.
- Disconnect integrations in Settings.
- Revoke your Filing Authorization by emailing support@placetta.com.

## US state privacy rights

Depending on the state you live in, its law may give you rights over your personal information, such as the right to:

- know what we collect and access it
- get a copy in a portable format
- correct it
- delete it
- opt out of its sale, targeted advertising or certain profiling

We do not sell personal information or use it for targeted advertising.

To make a request, email support@placetta.com. We may need to verify your identity first. Where the law allows, someone you authorize can make the request for you. We will not treat you differently for using these rights. If we decline a request, you can appeal by replying to our decision.

## Age

Placetta is only for people 18 or older who act for a business.

## Changes to this policy

When we update this policy, we will post the new version here with a new date.

## Contact

Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States

Email: support@placetta.com`;

const PRIVACY_ZH = `本政策说明企业使用 placetta.com 和快哉应用时，Placetta Inc.（下称“快哉”或“我们”）如何处理相关信息。快哉是面向企业的服务，我们处理的信息来自企业及代表企业行事的人员。

## 我们收集哪些信息

- 账户信息：您的邮箱地址；若使用 Google 或 Microsoft 登录，还包括您的姓名（我们只获取基本资料）；您所属的工作区和角色；以及是否开启了两步登录。
- 工作区信息：为填写申请，您向我们提供的企业信息及企业相关人员信息。
- 您上传的文件，以及在您工作区中准备的申请和消息。
- 您与智能体的对话，以及您的批准记录。
- 审计记录：智能体、您、我们的团队和各机构的每一项操作。
- 您选择保存的机构网站登录信息，加密存放在保险库中。
- 付款信息，由 Stripe 处理。我们看不到完整卡号。
- 您选择连接的服务中的信息，仅用于您要求的任务。

## 我们如何使用这些信息

我们只为向您提供快哉服务而使用这些信息：

- 梳理您的企业所需的执照，并填写申请
- 阅读您的文件，跟踪截止日期和续期
- 起草消息供您批准
- 核对并提交您批准的申请
- 向您发送机构付款链接
- 收取套餐费用
- 保存您的审计记录
- 回复您的支持请求
- 履行我们的法定义务

我们不出售个人信息，不将其用于广告，也不用您的内容训练 AI 模型。

## 谁会处理这些信息

只有以下各方会处理您的信息，且仅为运行本服务：

- Supabase：在其美国东部区域存储您的工作区、文件和审计记录。
- Anthropic：通过其 Claude 模型处理内容，使智能体能够完成工作。
- Microsoft Azure：应用朗读回复时，将智能体的回复转换为语音。
- Stripe：处理付款。
- 我们的申报团队：核对并提交您批准的申请。
- 政府机构：接收您批准的申请。
- 您连接的服务：详见下文“集成”。

在法律要求时，我们也可能披露信息。

## 集成

所有集成均为可选，由您决定连接哪些。我们只将每项集成用于您要求的任务：

- Gmail 和 Outlook Mail：查找机构邮件，发送您批准的消息。
- Google Calendar 和 Outlook Calendar：把截止日期添加到日历。
- Google Drive 和 Dropbox：导入文件。
- QuickBooks：读取营业总收入，用于税务登记。
- Slack：发布进度更新。

您可以随时在“设置”中断开任何一项集成。

## 机构网站登录信息

如您保存了机构网站的登录信息，这些信息会加密存放在保险库中。申报团队只会在为您办理申报时打开，每次打开都会记入您的审计记录。

## 保存期限

您可以随时发邮件至 support@placetta.com，要求删除您的工作区数据。我们会予以删除，但法律要求我们保留的记录除外，例如账单记录。

已提交给机构的申请，由该机构按其自身规定保存。

## 安全

- 机构网站登录信息加密存放在保险库中。
- 这些登录信息只在为您申报时打开，每次打开都有记录。
- 审计记录会记下智能体、您、我们的团队和各机构的每一项操作。
- 未经您批准，不会提交、付款或发送任何内容。

任何系统都无法做到绝对安全。如您认为他人可能进入了您的工作区，请发邮件至 support@placetta.com。

## 您的选择和权利

- 在“设置”中下载您的工作区数据。
- 发邮件至 support@placetta.com，要求删除您的数据。
- 在“设置”中断开集成。
- 发邮件至 support@placetta.com，撤销申报授权。

## 美国各州的隐私权利

根据您所在州的法律，您可能对自己的个人信息享有以下权利：

- 了解我们收集了哪些信息，并查阅这些信息
- 以便于转移的格式获取副本
- 更正信息
- 删除信息
- 拒绝出售、定向广告或特定类型的画像分析

我们不出售个人信息，也不将其用于定向广告。

如需提出请求，请发邮件至 support@placetta.com。我们可能需要先核实您的身份。在法律允许的情况下，您可以委托他人代为提出请求。您不会因行使这些权利而受到差别对待。如我们拒绝您的请求，您可以直接回复我们的决定提出申诉。

## 年龄要求

快哉仅供年满 18 周岁、代表企业行事的人使用。

## 政策变更

本政策更新时，我们会在此发布新版本并标注新日期。

## 联系我们

Placetta Inc.，9 W 57th St, Fl 48, New York, NY 10019, United States

邮箱：support@placetta.com`;

const AUTH_EN = `This authorization sets out the limited authority you give Placetta Inc. ("Placetta") to file license, permit and registration applications for your business. You grant it when you create a workspace.

## What you authorize

You appoint Placetta as your authorized agent for one limited purpose:

- to prepare license, permit and registration applications for your business
- to submit the applications you approve on each agency's website, on your behalf

It covers nothing else. It is not a general power of attorney.

## How a filing happens

- The agent prepares the application from your information and documents.
- You review it in the app and decide whether to approve it.
- Placetta checks it against the agency's current requirements.
- Placetta's software submits exactly what you approved, by email, fax, certified mail or the agency's website, or our filing team does when no automatic channel fits.
- Every step is recorded in your audit trail.

## What we never do

- We never submit an application you have not approved in the app.
- We never pay government fees. You pay each agency directly, using the payment link we send you.
- We never sign or appear for you where an agency requires your own signature or an in-person step. You do those yourself.

## What you confirm

By granting this authorization, you confirm that:

- the information you provide is accurate
- you have authority to act for the business

## Agency portal logins

If you save logins for agency websites, they are encrypted in a vault. Placetta's filing software, and our filing team when it takes over, open them only to file for you, and every opening is recorded in your audit trail.

## Agencies decide

Agencies decide approvals and timelines. Placetta cannot guarantee that an application will be approved, or when.

## Revoking this authorization

You can revoke this authorization at any time by emailing support@placetta.com. After that, we will not submit any further applications for you.

Applications already submitted to an agency cannot be recalled by Placetta. To withdraw one, contact the agency.

## Contact

Email: support@placetta.com`;

const AUTH_ZH = `本授权书说明您授予 Placetta Inc.（下称“快哉”）的有限权限，用于为您的企业申报执照、许可和登记。您在创建工作区时即授予本授权。

## 您授权的内容

您指定快哉作为您的授权代理人，仅限于以下用途：

- 为您的企业准备执照、许可和登记申请
- 代表您在各机构网站上提交经您批准的申请

本授权不涵盖其他任何事项，也不是一般性的授权委托书。

## 申报流程

- 智能体根据您的信息和文件准备申请。
- 您在应用中审核，并决定是否批准。
- 申报团队对照该机构的最新要求进行核对。
- 申报团队代表您在该机构网站上提交。
- 每一步都会记入您的审计记录。

## 我们绝不会做的事

- 绝不提交未经您在应用中批准的申请。
- 绝不代付政府规费。您通过我们发送的付款链接，直接向各机构付款。
- 机构要求您本人签名或亲自到场时，绝不代您签名或到场。这些步骤由您自行完成。

## 您确认的事项

授予本授权，即表示您确认：

- 您提供的信息准确无误
- 您有权代表该企业行事

## 机构网站登录信息

如您保存了机构网站的登录信息，这些信息会加密存放在保险库中。申报团队只会在为您办理申报时打开，每次打开都会记入您的审计记录。

## 审批由机构决定

是否批准、何时办结，均由各机构决定。快哉无法保证申请获批，也无法保证办理时间。

## 撤销授权

您可以随时发邮件至 support@placetta.com 撤销本授权。撤销后，我们不会再为您提交任何新的申请。

已提交给机构的申请，快哉无法撤回。如需撤回，请直接联系该机构。

## 联系我们

邮箱：support@placetta.com`;

const AI_EN = `Placetta uses an AI agent to handle the paperwork of getting licenses, permits and registrations. This page explains what it does and where its limits are.

## What the agent does

- Maps the licenses, permits and registrations your business needs.
- Reads the documents you upload.
- Fills applications from your information.
- Tracks deadlines and renewals.
- Drafts messages for you to review.

## Where its answers come from

The agent researches requirements on official government websites and cites the agency source, so you can check it.

## What it never does on its own

The agent never files, pays or sends anything by itself. Every filing and every message needs your approval in the app.

After you approve a filing, Placetta checks it against the agency's current requirements before submitting it. You always pay government fees yourself, directly to the agency.

## It can be wrong

AI output can be wrong. Review every application and message before you approve it, and read the cited source when something looks off. Placetta is not a law firm and does not give legal advice.

## Models and your data

- The agent runs on Claude models from Anthropic.
- Spoken replies are generated with Microsoft Azure text to speech.
- We do not use your content to train AI models.

## Every action is recorded

The audit trail records every action by the agent, by you, by our team and by agencies.

## Questions

Email: support@placetta.com`;

const AI_ZH = `快哉使用 AI 智能体，处理办理执照、许可和登记过程中的文书工作。本页说明它能做什么，以及它的局限在哪里。

## 智能体做什么

- 梳理您的企业需要哪些执照、许可和登记。
- 阅读您上传的文件。
- 根据您的信息填写申请。
- 跟踪截止日期和续期。
- 起草消息供您审核。

## 信息从哪里来

智能体在政府官方网站上查询相关要求，并注明机构来源，方便您核实。

## 未经批准，它不会做什么

智能体不会自行提交、付款或发送任何内容。每一份申请、每一条消息，都须经您在应用中批准。

您批准申请后，申报团队会先对照机构的最新要求进行核对，再行提交。政府规费始终由您本人直接支付给机构。

## 它可能出错

AI 生成的内容可能有误。批准前，请审核每一份申请和每一条消息；如有疑问，请查看所注明的来源。快哉不是律师事务所，不提供法律意见。

## 模型与您的数据

- 智能体基于 Anthropic 的 Claude 模型运行。
- 语音回复由 Microsoft Azure 文字转语音服务生成。
- 我们不会用您的内容训练 AI 模型。

## 每项操作都有记录

审计记录会记下智能体、您、我们的团队和各机构的每一项操作。

## 联系我们

邮箱：support@placetta.com`;

export const LEGAL: LegalDoc[] = [
  { id: "terms", title: { en: "Terms of Service", zh: "服务条款" }, updated: UPDATED, body: { en: TERMS_EN, zh: TERMS_ZH } },
  { id: "privacy", title: { en: "Privacy Policy", zh: "隐私政策" }, updated: UPDATED, body: { en: PRIVACY_EN, zh: PRIVACY_ZH } },
  { id: "authorization", title: { en: "Filing Authorization", zh: "申报授权书" }, updated: UPDATED, body: { en: AUTH_EN, zh: AUTH_ZH } },
  { id: "ai", title: { en: "How Placetta's AI works", zh: "快哉的 AI 如何工作" }, updated: UPDATED, body: { en: AI_EN, zh: AI_ZH } },
];
