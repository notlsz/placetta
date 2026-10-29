import { B, type Bi } from "./bi.ts";

/* Proof of a filing (src/Proof.tsx): what was filed, when, how, the agency's confirmation number, every status change
   with its source, the receipts and the license itself. Copied, in substance, from security testing that proves each
   finding with the evidence (Armadin): a filing isn't "done" on Placetta's word, it's done with the agency's own
   confirmation and the pages that show it. One function builds the facts for both the in-app panel and the shared
   page, so the two never say different things. */

export const PROOF_DAYS = [1, 7, 30] as const;
export type ProofDays = (typeof PROOF_DAYS)[number];

export const CHANNEL_WORDS: Record<string, Bi> = {
  email: B("By email", "通过邮件"), fax: B("By fax", "通过传真"), mail: B("By certified mail", "通过挂号信"),
  portal: B("On the agency's website", "在机构网站上"), team: B("By the business", "由企业自行提交"),
};
export const STATUS_WORDS: Record<string, Bi> = {
  requested: B("Approved, not sent yet", "已批准，尚未提交"), in_progress: B("Being sent", "正在提交"), submitted: B("With the agency", "机构审核中"),
  needs_info: B("The agency asked for more", "机构要求补充材料"), accepted: B("Approved by the agency", "机构已批准"),
  rejected: B("Sent back by the agency", "机构已退回"), canceled: B("Canceled", "已取消"),
};
export const SOURCE_WORDS: Record<string, Bi> = {
  team: B("Placetta team", "快哉团队"), owner: B("The business", "企业"), placetta: B("Placetta", "快哉"), open_data: B("City's open data", "城市公开数据"),
  agency_page: B("Agency's status page", "机构状态页面"), odelia: B("Odelia", "Odelia"), phone_call: B("Call to the agency", "致电机构"),
};

export type ProofFiling = {
  title: Bi; agency?: Bi | null; channel?: string | null; status: string; approved_at?: string | null; submitted_at?: string | null;
  decided_at?: string | null; confirmation_number?: string | null; license_expires?: string | null;
};
export type ProofFact = { k: "status" | "approved" | "sent" | "submitted" | "confirmation" | "decided" | "expires"; label: Bi; value: Bi; mono?: boolean };

/** The facts a proof states, in order, each only when it's known. day: how a date is written. */
export function proofFacts(f: ProofFiling, day: (iso: string) => Bi): ProofFact[] {
  const out: ProofFact[] = [];
  out.push({ k: "status", label: B("Status", "状态"), value: STATUS_WORDS[f.status] ?? B(f.status, f.status) });
  if (f.approved_at) out.push({ k: "approved", label: B("Approved by the business", "企业批准"), value: day(f.approved_at) });
  if (f.channel && CHANNEL_WORDS[f.channel]) out.push({ k: "sent", label: B("Sent", "提交方式"), value: CHANNEL_WORDS[f.channel] });
  if (f.submitted_at) out.push({ k: "submitted", label: B("Submitted to the agency", "提交给机构"), value: day(f.submitted_at) });
  if (f.confirmation_number) out.push({ k: "confirmation", label: B("Agency confirmation", "机构确认号"), value: B(f.confirmation_number, f.confirmation_number), mono: true });
  if (f.decided_at && (f.status === "accepted" || f.status === "rejected")) out.push({ k: "decided", label: f.status === "accepted" ? B("Approved by the agency", "机构批准") : B("Sent back", "被退回"), value: day(f.decided_at) });
  if (f.license_expires) out.push({ k: "expires", label: B("License expires", "执照到期"), value: day(f.license_expires) });
  return out;
}

/** How strong the proof is, in words: the agency's own confirmation is the proof; Placetta's record alone isn't. */
export function proofStrength(f: ProofFiling, hasReceipt: boolean): { level: "agency" | "sent" | "none"; say: Bi } {
  if (f.status === "accepted") return { level: "agency", say: B("The agency approved it.", "机构已批准。") };
  if (f.confirmation_number) return { level: "agency", say: B("The agency confirmed it received it.", "机构已确认收到。") };
  if (f.submitted_at || hasReceipt) return { level: "sent", say: B("Sent, with Placetta's record of sending it. The agency's confirmation shows here when it comes.", "已提交，附快哉的提交记录。机构确认后会显示在这里。") };
  return { level: "none", say: B("Not sent yet.", "尚未提交。") };
}

export type ProofDoc = { name: string; path?: string; mime?: string | null; source: string };
export type DocKind = "form" | "receipt" | "screenshot" | "agency" | "license" | "other";
/** What a kept document is, from where it lives and who made it. */
export function docKindOf(d: ProofDoc, o: { formPath?: string | null; licensePath?: string | null } = {}): DocKind {
  if (o.licensePath && d.path === o.licensePath) return "license";
  if (o.formPath && d.path === o.formPath) return "form";
  if (d.source === "agency") return /licen[cs]e|permit|certificate/i.test(d.name) ? "license" : "agency";
  if ((d.mime ?? "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(d.name)) return "screenshot";
  if (/\/receipts\//.test(d.path ?? "") || /receipt|confirmation|proof/i.test(d.name)) return "receipt";
  return "other";
}
export const DOC_WORDS: Record<DocKind, Bi> = {
  form: B("Filed form", "提交的表格"), receipt: B("Receipt", "回执"), screenshot: B("Agency page", "机构页面截图"),
  agency: B("From the agency", "机构来件"), license: B("License", "执照"), other: B("Document", "文件"),
};
/** Order on the page: the license first, then the agency's own papers, the receipts, the pages, the form. */
export const DOC_ORDER: DocKind[] = ["license", "agency", "receipt", "screenshot", "form", "other"];

/** A shared proof's token from the address (/app/proof/<48 hex>), or null. */
export function proofTokenFromPath(path: string): string | null {
  const m = /\/proof\/([0-9a-f]{48})\/?$/.exec(path);
  return m ? m[1] : null;
}
