import { B, type Bi } from "./bi";

/* ------------------------------------------------------------------ *
 * Sign once: the electronic records and signature disclosure a signer
 * reads before adopting a signature (src/SignOnce.tsx), and the
 * workspace's copy of what the database recorded (20261105090200_
 * sign_once_paper.sql signer_signatures, signature_mirror).
 *
 * It follows the consent pattern of the ESIGN Act (15 U.S.C. 7001(c))
 * and UETA, as DocuSign, Dropbox Sign and Stripe Atlas present theirs:
 * what records it covers, the right to paper copies, the right to
 * withdraw and what that changes, how to update contact details, the
 * hardware and software needed, then three separate consents. Owners
 * signing for a business aren't consumers under ESIGN, so this is the
 * stricter pattern, not a legal minimum. COUNSEL REVIEW REQUIRED BEFORE
 * THIS SHIPS. The version must match current_esign_disclosure() in the
 * database, which refuses any other.
 * ------------------------------------------------------------------ */

export const DISCLOSURE_VERSION = "2026-11-05";
export const ESIGN_15_USC_7001 = "https://www.law.cornell.edu/uscode/text/15/7001";

export const DISCLOSURE: { title: Bi; parts: { h: Bi; p: Bi }[] } = {
  title: B("Electronic records and signature disclosure", "电子记录与电子签名披露"),
  parts: [
    { h: B("What this covers", "适用范围"),
      p: B("The applications, authorizations and agency forms Placetta prepares for your business, and the notices about them. With your consent, you get them and sign them electronically, here in Placetta.",
        "快哉为您的企业准备的申请、授权和机构表格，以及相关通知。经您同意，您将在快哉中以电子方式接收并签署这些文件。") },
    { h: B("Your signature, once", "您的签名，只需一次"),
      p: B("You adopt one signature now, typed or drawn. Placetta places it on an agency form only when you approve that filing (or your Autopilot authorization covers it), and only where the agency accepts an electronic or reproduced signature. A form the agency wants signed in ink, Placetta mails to you to sign by hand. Every placement is recorded with the filing.",
        "您现在采用一个签名（打字或手写）。只有在您批准该申报（或您的自动驾驶授权涵盖它），且机构接受电子签名或签名复印件时，快哉才会把它放到机构表格上。机构要求亲笔签名的表格，快哉会寄给您手签。每次使用都会随申报记录在案。") },
    { h: B("Paper copies", "纸质副本"),
      p: B("You can download any record from Documents at any time, or ask Placetta for a paper copy. Placetta tells you of any charge before it sends one.",
        "您可随时在“文件”中下载任何记录，也可以向快哉索取纸质副本。如需收费，快哉会在寄出前告知您。") },
    { h: B("Withdrawing consent", "撤回同意"),
      p: B("You can withdraw at any time in Settings, under Signature. Placetta stops placing your signature at once; anything already signed stays signed, and each new filing then asks for your signature in the card or by hand.",
        "您可随时在“设置”的“签名”中撤回。快哉会立即停止使用您的签名；已签署的文件保持有效，此后每份新申报都会请您在卡片中或亲笔签名。") },
    { h: B("Keeping your details current", "保持联系信息最新"),
      p: B("Keep your email address and mailing address current in Settings, so notices and pages to sign reach you.",
        "请在“设置”中保持邮箱和邮寄地址最新，以便通知和待签表格能送达您。") },
    { h: B("What you need", "所需条件"),
      p: B("A current web browser that opens PDF files, and an email address. Opening this disclosure here shows you can read records in this form.",
        "能够打开 PDF 文件的最新版浏览器，以及一个电子邮箱。您能在此打开本披露，即表明您可以读取这种形式的记录。") },
  ],
};

export const CONSENTS: { id: "records" | "sign" | "apply"; label: Bi }[] = [
  { id: "records", label: B("I agree to receive and sign these records electronically.", "我同意以电子方式接收并签署这些记录。") },
  { id: "sign", label: B("I adopt the signature above as my signature, with the intent to sign each record I approve with it.", "我采用上方签名作为本人签名，并有意以此签署我批准的每份记录。") },
  { id: "apply", label: B("Placetta may place it on the agency forms I approve, or that my Autopilot authorization covers, where the agency accepts an electronic or reproduced signature.", "快哉可以把它放在我批准的、或我的自动驾驶授权涵盖的机构表格上，前提是机构接受电子签名或签名复印件。") },
];

/** The workspace's copy of an adopted signature, as the database recorded it (never the image itself). */
export type AdoptedSignature = { id: string; user?: string; by: string; title?: string; kind: "typed" | "drawn"; at: string; version: string; demonstrated?: boolean; withdrawnAt?: string };

/** The adopted signature is live: adopted under the current disclosure and not withdrawn. */
export const signatureLive = (s: AdoptedSignature | undefined | null): s is AdoptedSignature => !!s && !s.withdrawnAt && s.version === DISCLOSURE_VERSION;
