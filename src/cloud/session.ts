import { B, same, type Approval, type Audit, type Doc, type Workspace } from "../model";
import type { AgencyLogin, Billing, DocRow, Filing, Integration } from "./api";

/** Everything a signed-in workspace starts with. */
export type CloudSession = {
  me: { id: string; email: string; staff: boolean };
  wsId: string;
  initial: Workspace;
  audit: Audit[];
  billing: Billing | null;
  filings: Filing[];
  docs: DocRow[];
  integrations: Integration[];
  logins: AgencyLogin[];
  workspaces: { id: string; name: string }[];
  notice?: string;
  switchTo(id: string): void;
  newWorkspace(): void;
  signOut(): void;
};

/** A saved state may be missing lists (older saves, a fresh workspace): fill them in. */
export function normalize(name: string, s: Partial<Workspace>): Workspace {
  return {
    business: s.business ?? same(name), goal: s.goal ?? same(""), locations: s.locations ?? [], apps: s.apps ?? [], docs: s.docs ?? [],
    deadlines: s.deadlines ?? [], nudges: s.nudges ?? [], approvals: s.approvals ?? [], closed: s.closed ?? [], audit: [],
    facts: s.facts ?? [], running: s.running ?? [], connections: s.connections ?? [], stores: s.stores, meta: s.meta,
  };
}

const kindOf = (name: string) => (name.split(".").pop()?.toLowerCase() ?? "pdf") as Doc["kind"];
const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * The workspace as the person sees it: the saved state, with what the server knows laid on top.
 * Filings set each application's status and next step, a fee the agency asks for becomes something to pay,
 * and stored files and receipts appear in Documents.
 */
export function withServer(w: Workspace, filings: Filing[], docs: DocRow[]): Workspace {
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
      case "requested": return { ...a, status: "filing" as const, next: B("With Placetta's filing team", "快哉申报团队已接手") };
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
    approvals: [...pay, ...w.approvals.filter(a => !(a.kind === "file" && a.app && filed.has(a.app)) && a.kind !== "pay")],
  };
}
