import { B, same, type Approval, type Audit, type Doc, type Workspace } from "../model";
import type { AgencyLogin, Billing, DocRow, Filing, Integration, Me, Role, TermsStatus } from "./api";
import type { HqRow } from "../hq";
import type { Purchase } from "../spend.ts";

/** Everything a signed-in workspace starts with. */
export type CloudSession = {
  me: Me;
  /** This person's role in this workspace: owners approve, pay, connect and invite. */
  role: Role;
  wsId: string;
  initial: Workspace;
  audit: Audit[];
  billing: Billing | null;
  filings: Filing[];
  docs: DocRow[];
  integrations: Integration[];
  logins: AgencyLogin[];
  workspaces: { id: string; name: string }[];
  /** Franchisees that shared their stores with this account's email: the Headquarters view. */
  hq: HqRow[];
  /** Whether this person accepted the current Terms and Privacy Policy (null: the server doesn't track it yet). */
  terms: TermsStatus | null;
  notice?: string;
  /** An approval to open right away: Odelia's texts link to /app/?ws=...&approval=... */
  approval?: string;
  switchTo(id: string): void;
  newWorkspace(): void;
  signOut(everywhere?: boolean): void;
  /** Load the workspace again (after two-step sign-in changes, or a role change). */
  reopen(): void;
};

export { normalizeState as normalize } from "../core";

const kindOf = (name: string) => (name.split(".").pop()?.toLowerCase() ?? "pdf") as Doc["kind"];
const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * The workspace as the person sees it: the saved state, with what the server knows laid on top.
 * Filings set each application's status and next step, a fee the agency asks for becomes something to pay,
 * and stored files and receipts appear in Documents.
 */
/** A purchase waiting on someone: approve it (asked), or pay it on the agency's page and say so (approved, by link). */
export function purchaseApprovals(purchases: Purchase[]): Approval[] {
  const money$ = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return purchases.filter(p => p.status === "asked" || (p.status === "approved" && p.method === "link")).map(p => p.status === "asked" ? {
    id: "buy-" + p.id, kind: "pay" as const, purchase: p.id, app: p.app, fee: p.amount, url: p.payeeUrl,
    title: B(`Buy: ${money$(p.amount)} to ${p.payee}`, `购买：向 ${p.payee} 支付 ${money$(p.amount)}`), agency: same(p.payee),
    does: [p.why, ...(p.reasons ?? []), B("Approving lets Odelia pay it within your Spending rules. Every purchase is in Settings, Spending.", "批准后 Odelia 将在您的支出规则内付款。每笔购买都记录在“设置 > 支出”中。")],
    action: B("Approve purchase", "批准购买"),
  } : {
    id: "buy-" + p.id, kind: "pay" as const, purchase: p.id, app: p.app, fee: p.amount, url: p.payeeUrl,
    title: B(`Pay ${p.payee} ${money$(p.amount)}`, `向 ${p.payee} 支付 ${money$(p.amount)}`), agency: same(p.payee),
    does: [p.why, B("Approved. Pay it on the agency's own page, then tap the button so Odelia records it.", "已批准。请在机构自己的页面付款，然后点按钮，Odelia 会记录下来。")],
    action: B("I've paid it", "我已付款"),
  });
}

export function withServer(w: Workspace, filings: Filing[], docs: DocRow[], purchases: Purchase[] = []): Workspace {
  const latest = new Map<string, Filing>();
  for (const f of filings) if (f.status !== "canceled" && !latest.has(f.app_id)) latest.set(f.app_id, f);   // newest first
  const pay: Approval[] = [];
  const known = new Set(w.docs.map(d => d.path).filter(Boolean));
  const extra: Doc[] = docs.filter(d => !known.has(d.path)).map(d => ({
    id: "doc-" + d.id, name: d.name, kind: kindOf(d.name), size: d.size, at: d.created_at, app: d.app_id ?? undefined, path: d.path,
    by: d.source === "agency" ? "agency" : d.source === "team" ? "team" : d.source === "agent" ? "agent" : "you",
    tag: d.filing_id ? B("Receipt", "收据") : d.source === "agency" ? B("From the agency", "机构发来") : B("Uploaded", "已上传"),
  }));
  const allDocs = [...extra, ...w.docs];
  const apps = w.apps.map(a => {
    const f = latest.get(a.id);
    if (!f) return a;
    const receipt = f.receipt_path ? allDocs.find(d => d.path === f.receipt_path)?.id : undefined;
    switch (f.status) {
      case "requested": return { ...a, status: "filing" as const, next: B("Placetta is filing it", "快哉正在提交") };
      case "in_progress": return { ...a, status: "filing" as const, next: f.customer_paid_at ? B("Fee paid. Our team is submitting it", "费用已付，团队正在提交") : B("Our team is preparing the submission", "团队正在准备提交") };
      case "needs_info":
        if (f.payment_url) {
          pay.push({
            id: "pay-" + f.id, kind: "pay", app: a.id, filing: f.id, url: f.payment_url, fee: f.fee_paid ?? f.fee_estimate,
            title: B(`Pay the agency fee for the ${a.name.en.toLowerCase()}`, `支付${a.name.zh}的机构费用`), agency: f.agency ?? a.agency,
            does: [B("Pay the agency on its own payment page", "在机构的付款页面直接付款"), B("Then tell us it's paid, and our team submits it", "付款后告诉我们，团队随即提交")],
            action: B("Pay the agency", "去付款"),
          });
          return { ...a, status: "needs" as const, next: B(`Pay the agency fee${f.fee_paid ? ` (${money(f.fee_paid)})` : ""}`, `支付机构费用${f.fee_paid ? `（${money(f.fee_paid)}）` : ""}`) };
        }
        return { ...a, status: "needs" as const, next: f.note ? same(f.note) : B("Our team needs something from you", "团队需要您补充信息") };
      case "submitted": return { ...a, status: "review" as const, next: f.confirmation_number ? B(`Submitted. Confirmation ${f.confirmation_number}`, `已提交，确认号 ${f.confirmation_number}`) : B("Submitted to the agency", "已提交至机构"), receipt: receipt ?? a.receipt };
      case "accepted": return { ...a, status: "approved" as const, next: B("Approved by the agency", "机构已批准"), receipt: receipt ?? a.receipt };
      case "rejected": return { ...a, status: "needs" as const, next: f.note ? same(f.note) : B("Returned by the agency. Our team will tell you what to fix", "被机构退回，团队会告诉您需要修改什么") };
      default: return a;
    }
  });
  const filed = new Set([...latest.keys()]);
  return {
    ...w, apps, docs: allDocs,
    approvals: [...purchaseApprovals(purchases), ...pay, ...w.approvals.filter(a => !(a.kind === "file" && a.app && filed.has(a.app)) && a.kind !== "pay")],
  };
}
