/* ------------------------------------------------------------------ *
 * The preview backend's stand-ins for status pages (src/cloud/preview.ts
 * hands these calls here). The same rules as the database
 * (20261031160000_trust_pages.sql), on the browser's own copy: only an
 * owner shares, changes or revokes; the token is kept as SHA-256; what a
 * page shows is cut to the owner's choices (trustClean, the database's
 * trust_clean); a revoked, expired or unknown token gets "gone".
 * ------------------------------------------------------------------ */

import type { PreviewKit } from "./previewMore";
import { SHOW_DEFAULT, trustClean, trustView, type TrustShow, type TrustSnapshot } from "../trust";

type Row = Record<string, unknown> & { id?: string | number };
type Claims = { sub: string; aal: string };

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join(""); }
const showOf = (p: unknown): TrustShow => {
  const o = (p ?? {}) as Record<string, unknown>;
  return { address: o.address !== false, agency: o.agency !== false, expiry: o.expiry !== false, verified: o.verified !== false, numbers: o.numbers === true, docs: o.docs === true };
};
const live = (l: Row) => !l.revoked_at && Date.parse(String(l.expires_at)) > Date.now();

export async function trustRpc(fn: string, body: Record<string, unknown>, c: Claims, k: PreviewKit): Promise<Response | null> {
  const links = () => k.t("trust_links"), reqs = () => k.t("trust_requests");
  const ws = String(body.ws ?? "");
  const deny = () => k.pgErr("Only an owner of this workspace can do that.", "42501", 403);
  switch (fn) {
    case "trust_link_create": {
      if (!k.isOwner(ws, c)) return deny();
      const w = k.t("workspaces").find(x => x.id === ws);
      const stores = ((w?.state as { stores?: { id: string }[] } | undefined)?.stores ?? []);
      if (!stores.some(s => s.id === body.p_store)) return k.pgErr("That store isn't in this workspace.", "P0002", 404);
      const token = hex(24), show = showOf(body.p_show), days = Math.min(Math.max(Number(body.p_days) || 90, 1), 366);
      const row: Row = { id: k.uuid(), workspace_id: ws, store_id: body.p_store, label: String(body.p_label ?? "").slice(0, 80), prefix: token.slice(0, 8), token_hash: await sha256(token),
        show, snapshot: trustClean(body.p_snapshot, show), snapshot_at: k.now(), created_at: k.now(), expires_at: new Date(Date.now() + days * 864e5).toISOString(), revoked_at: null, views: 0, last_viewed_at: null };
      links().push(row); k.save();
      k.audit(ws, c.sub, "you", "Shared a status page", "共享了状态页", { en: String(row.prefix), zh: String(row.prefix) });
      return k.json({ id: row.id, prefix: row.prefix, token, expires_at: row.expires_at });
    }
    case "trust_link_list": {
      if (!k.isMember(ws, c) && !k.isOwner(ws, c)) return deny();
      return k.json(links().filter(l => l.workspace_id === ws).map(l => ({ id: l.id, store_id: l.store_id, label: l.label, prefix: l.prefix, show: l.show, snapshot_at: l.snapshot_at, created_at: l.created_at,
        expires_at: l.expires_at, revoked_at: l.revoked_at, views: l.views, last_viewed_at: l.last_viewed_at, open_requests: reqs().filter(q => q.link_id === l.id && q.status === "open").length })));
    }
    case "trust_link_update": case "trust_link_revoke": {
      const l = links().find(x => x.id === body.p_id);
      if (!l || !k.isOwner(String(l.workspace_id), c)) return deny();
      if (fn === "trust_link_revoke") { l.revoked_at = l.revoked_at ?? k.now(); l.snapshot = {}; }
      else { const show = body.p_show ? showOf(body.p_show) : l.show as TrustShow; l.show = show; l.snapshot = trustClean(l.snapshot, show); }
      k.save();
      return k.json(true);
    }
    case "trust_refresh": {
      if (!k.isMember(ws, c)) return deny();
      let n = 0;
      for (const l of links()) if (l.workspace_id === ws && l.store_id === body.p_store && live(l)) { l.snapshot = trustClean(body.p_snapshot, l.show as TrustShow); l.snapshot_at = k.now(); n++; }
      k.save();
      return k.json(n);
    }
    case "trust_requests_for": {
      if (!k.isOwner(ws, c)) return deny();
      return k.json(reqs().filter(q => q.workspace_id === ws).map(q => ({ ...q, prefix: links().find(l => l.id === q.link_id)?.prefix ?? "", label: links().find(l => l.id === q.link_id)?.label ?? "" })));
    }
    case "trust_request_close": {
      const q = reqs().find(x => x.id === body.p_id);
      if (!q || !k.isOwner(String(q.workspace_id), c)) return deny();
      q.status = body.p_status === "sent" ? "sent" : "declined"; k.save();
      return k.json(true);
    }
    case "trust_page": case "trust_request": {
      const tok = String(body.p_token ?? "");
      const h = /^[0-9a-f]{48}$/.test(tok) ? await sha256(tok) : "";
      const l = links().find(x => x.token_hash === h && live(x));
      if (!l) return k.json({ status: "gone" });
      const show = (l.show ?? SHOW_DEFAULT) as TrustShow;
      if (fn === "trust_request") {
        if (!show.docs) return k.pgErr("This page doesn't take document requests.", "42501", 403);
        reqs().push({ id: k.uuid(), workspace_id: l.workspace_id, link_id: l.id, name: String(body.p_name ?? "").slice(0, 120), email: String(body.p_email ?? "").slice(0, 200), org: String(body.p_org ?? "").slice(0, 120), note: String(body.p_note ?? "").slice(0, 1000), status: "open", created_at: k.now() });
        k.save();
        return k.json({ status: "ok" });
      }
      l.views = Number(l.views ?? 0) + 1; l.last_viewed_at = k.now(); k.save();
      const v = trustView(l.snapshot as TrustSnapshot, show, new Date().toISOString().slice(0, 10));
      return k.json({ status: "ok", snapshot_at: l.snapshot_at, expires_at: l.expires_at, ...v });
    }
  }
  return null;
}
