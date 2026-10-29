// An agency's mail to Odelia's address (or a workspace's own, odelia+w<id>@...): matched to its filing (the thread it
// answers, the confirmation number it prints, or the agency's own domain), classified (approved, deficiency, request for
// information, fee due, inspection scheduled, denied), and acted on the way a portal read is (_shared/carry_run.ts):
// the license stored and shown, a request answered from the workspace as the business's agent, an appeal drafted for the
// owner's tap, an inspection put on Deadlines. Only when the receiving provider vouches for the sender's address; what
// it says is data, held back from any model when it carries instructions aimed at an AI. Nobody gets an email back.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { type InMail, senderVerified } from "../_shared/mail.ts";
import { scoreText } from "../_shared/injection.ts";
import { agencyDomains, asksIn, classifyAgencyMail, dateIn, feeIn, fromDomain, govSender, matchFiling, type Candidate, windowIn, wsTagOf } from "../_shared/carry.ts";
import { actOnNews, type AppLite, type WsState } from "../_shared/carry_run.ts";
import { appealInfo, carryIO, type Start } from "../monitor/carry.ts";
import { DEST } from "../file/destinations.ts";
import { holdMinutes } from "../file/logic.ts";

const header = (m: InMail, k: string) => (m.headers[k] ?? [])[0] ?? "";
const PDF = "application/pdf";

export async function agencyMail(admin: SupabaseClient, m: InMail, o: { odelia: string[]; start: Start; env: (k: string) => string | undefined; today?: string }): Promise<Record<string, unknown> | null> {
  if (o.env("CARRY") === "off") return null;
  const tag = wsTagOf(m.to, o.odelia);
  const { data: rows, error } = await admin.from("filings").select("id, workspace_id, app_id, status, confirmation_number, portal_url, provider_ref, official:payload->>official")
    .in("status", ["submitted", "needs_info", "in_progress"]).limit(5000);
  if (error) { console.error("agency mail filings", error.code); return null; }
  // mail to a workspace's own address is about that workspace's filings only
  const list = ((rows ?? []) as { id: string; workspace_id: string; app_id: string; status: string; confirmation_number: string | null; portal_url: string | null; provider_ref: string | null; official: string | null }[])
    .filter((f) => !tag || f.workspace_id.replace(/-/g, "").startsWith(tag));
  if (!list.length) return null;
  const { data: sent } = await admin.from("agency_outbox").select("filing_id, provider_id").in("filing_id", list.map((f) => f.id).slice(0, 1000)).not("provider_id", "is", null);
  const threads = new Map<string, string[]>();
  for (const s of (sent ?? []) as { filing_id: string; provider_id: string }[]) threads.set(s.filing_id, [...(threads.get(s.filing_id) ?? []), s.provider_id]);
  const cands: Candidate[] = list.map((f) => {
    const d = DEST[f.official ?? ""];
    return { id: f.id, workspace_id: f.workspace_id, app_id: f.app_id, status: f.status, confirmation_number: f.confirmation_number,
      domains: agencyDomains({ email: d?.email, portal: d?.portal, urls: [f.portal_url, d?.source] }), threads: [...(threads.get(f.id) ?? []), ...(f.provider_ref ? [f.provider_ref] : [])] };
  });
  const refs = header(m, "references").split(/\s+/).filter(Boolean);
  const hit = matchFiling({ from: m.from, subject: m.subject, text: m.text, inReplyTo: header(m, "in-reply-to") || null, references: refs }, cands);
  if (!hit) return null;   // not about a filing Placetta knows: handled as any other mail
  const verdict = await senderVerified(m);
  if (!verdict.ok) { console.warn("agency mail unverified", verdict.why); return { ok: true, skipped: "agency_unverified" }; }

  const f0 = hit.filing;
  const c = classifyAgencyMail(m.subject, m.text);
  // the agency's newsletter or a notice about something else: tied only by its domain, and saying nothing about a filing
  if (hit.by === "domain" && c.kind === "other") return { ok: true, skipped: "agency_not_about_a_filing" };
  const held = scoreText(`${m.subject}\n${m.text}`).verdict !== "clean";
  const { data: logged, error: le } = await admin.from("agency_mail").insert({ workspace_id: f0.workspace_id, filing_id: f0.id, message_id: m.id.slice(0, 400), from_addr: m.from.slice(0, 320),
    subject: m.subject.slice(0, 300) || null, snippet: held ? "(held back: it carried instructions aimed at an AI)" : m.text.slice(0, 1200), kind: c.kind, matched_by: hit.by, confidence: c.confidence, held }).select("id").maybeSingle();
  if (le) { if (le.code === "23505") return { ok: true, duplicate: true }; console.error("agency mail log", le.code); return null; }

  // its PDFs into the filing's documents, marked as the agency's (the first one, on an approval, is the license)
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const saved: string[] = [];
  for (const file of m.files.slice(0, 5)) {
    if (file.mime !== PDF) continue;
    let bytes = file.bytes;
    if (!bytes && file.url?.startsWith("https://")) { try { const r = await fetch(file.url, { signal: AbortSignal.timeout(20000) }); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch { /* skipped */ } }
    if (!bytes?.length || bytes.length > 20 * 1024 * 1024) continue;
    const name = file.name.replace(/[\r\n]/g, " ").slice(0, 120) || "agency.pdf";
    const path = `${f0.workspace_id}/receipts/${f0.id}-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
    const up = await admin.storage.from("documents").upload(path, new Blob([bytes as BlobPart], { type: PDF }), { contentType: PDF, upsert: false });
    if (up.error) continue;
    const { error: de } = await admin.from("documents").insert({ workspace_id: f0.workspace_id, app_id: f0.app_id, filing_id: f0.id, name, path, size: bytes.length, mime: PDF, source: "agency", uploaded_by: null });
    if (de) { await admin.storage.from("documents").remove([path]); continue; }
    saved.push(path);
  }

  const { data: fr } = await admin.from("filings").select("id, workspace_id, app_id, title, status, channel, confirmation_number, submitted_at, decided_at, agent_auth, official:payload->>official, license_path, license_expires").eq("id", f0.id).maybeSingle();
  const { data: w } = await admin.from("workspaces").select("state").eq("id", f0.workspace_id).maybeSingle();
  if (!fr) return { ok: true, agency: f0.id };
  const f = { ...(fr as Record<string, unknown>), payload: { official: (fr as { official?: string }).official } } as never as Parameters<typeof actOnNews>[0]["f"];
  const st = (w?.state ?? null) as WsState;
  const app = ((st?.apps ?? []) as AppLite[]).find((a) => a?.id === f.app_id);
  const address = (st?.stores ?? []).find((s) => Array.isArray(s?.apps) && s.apps.includes(f.app_id))?.address ?? [st?.meta?.city, st?.meta?.region].filter(Boolean).join(", ");
  const words = held ? undefined : `${m.subject}\n\n${m.text}`.slice(0, 6000);
  const r = await actOnNews({
    f, state: st, kind: c.kind, confidence: c.confidence, by: hit.by, today, now: new Date().toISOString(), holdMinutes: Math.max(1, holdMinutes(o.env("SEND_HOLD_MINUTES"))),
    subject: m.subject, asks: held ? [] : asksIn(m.text), date: dateIn(m.text, today), window: windowIn(m.text), fee: feeIn(m.text),
    replyTo: m.from, replyToAgency: fromDomain(m.from, hit.filing.domains) || govSender(m.from), messageId: header(m, "message-id") || m.id.replace(/^mail:/, ""), source: "odelia", words, held,
    license: c.kind === "approved" ? { path: saved[0] ?? null } : undefined,
    appeal: c.kind === "denied" ? appealInfo(app, address, held ? "" : m.text.slice(0, 2000), today) : undefined,
  }, carryIO(admin, o.start));
  await admin.from("agency_mail").update({ action: `${r.next}${r.route ? `:${r.route}` : ""}${r.status ? ` (${r.status})` : ""}`.slice(0, 300), files: saved.length }).eq("id", (logged as { id: string }).id);
  return { ok: true, agency: f0.id, kind: c.kind, by: hit.by, ...r };
}
