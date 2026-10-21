// sso: the parts of single sign-on that need the network. The settings themselves (the domain, enforcing it) are
// changed by owners and admins through the database (sso_set_domain, sso_set_enforced), which checks who may.
//   status  what Supabase Auth has turned on (SAML, Google, Microsoft, a custom OIDC provider) and whether a SAML
//           identity provider is registered for the workspace's domain (`supabase sso add ... --domains`)
//   verify  looks up the TXT record _placetta-verify.<domain> over DNS-over-HTTPS (Cloudflare, then Google) and, when
//           it holds the workspace's token, marks the domain verified (sso_mark_verified, service role)

type Fetch = typeof fetch;

/** TXT records from a DNS-over-HTTPS JSON answer (RFC 8484's JSON form, as Cloudflare and Google serve it). A record
 *  split into several quoted strings is joined, as DNS does. */
export function txtValues(answer: unknown): string[] {
  const a = (answer as { Answer?: { type?: number; data?: unknown }[] })?.Answer;
  if (!Array.isArray(a)) return [];
  return a.filter((r) => r?.type === 16 && typeof r.data === "string").map((r) => {
    const d = (r.data as string).trim();
    const parts = [...d.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
    return parts.length ? parts.join("") : d;
  });
}

const RESOLVERS = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];

/** The TXT records at a name: from the first resolver that answers. null when none answered. */
export async function lookupTxt(name: string, f: Fetch = fetch): Promise<string[] | null> {
  for (const r of RESOLVERS) {
    try {
      const res = await f(`${r}?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: "application/dns-json" } });
      if (!res.ok) continue;
      const j = await res.json() as { Status?: number };
      // NOERROR or NXDOMAIN are answers (none found); anything else, try the next resolver
      if (j.Status === 0 || j.Status === 3) return txtValues(j);
    } catch { /* next resolver */ }
  }
  return null;
}

export type Verify = { verified: true } | { verified: false; reason: "not_found" | "dns_unavailable"; found: string[] };

/** Whether the TXT record holds the token. */
export async function verifyTxt(name: string, token: string, f: Fetch = fetch): Promise<Verify> {
  const v = await lookupTxt(name, f);
  if (v === null) return { verified: false, reason: "dns_unavailable", found: [] };
  if (v.some((x) => x.trim() === token)) return { verified: true };
  return { verified: false, reason: "not_found", found: v.slice(0, 5).map((x) => x.slice(0, 120)) };
}

export type AuthStatus = {
  /** Supabase Auth's public settings: is SAML on, and which OAuth providers. null when they couldn't be read. */
  saml_enabled: boolean | null;
  providers: Record<string, boolean> | null;
  /** A SAML identity provider registered for this domain: true, false, or null when Placetta couldn't check. */
  saml_registered: boolean | null;
};

/** What Supabase Auth has on, from /auth/v1/settings (public) and /auth/v1/admin/sso/providers (service role). */
export async function authStatus(url: string, anonKey: string, serviceKey: string, domain: string | null, f: Fetch = fetch): Promise<AuthStatus> {
  const out: AuthStatus = { saml_enabled: null, providers: null, saml_registered: null };
  try {
    const r = await f(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    if (r.ok) {
      const j = await r.json() as { external?: Record<string, unknown>; saml_enabled?: unknown };
      out.providers = Object.fromEntries(Object.entries(j.external ?? {}).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>;
      out.saml_enabled = typeof j.saml_enabled === "boolean" ? j.saml_enabled : null;
    }
  } catch { /* unknown */ }
  if (domain && out.saml_enabled !== false) {
    try {
      const r = await f(`${url}/auth/v1/admin/sso/providers`, { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } });
      if (r.ok) {
        const j = await r.json() as { items?: { domains?: { domain?: string }[] }[] };
        out.saml_registered = (j.items ?? []).some((p) => (p.domains ?? []).some((d) => (d.domain ?? "").toLowerCase() === domain.toLowerCase()));
      }
    } catch { /* unknown */ }
  } else if (out.saml_enabled === false) out.saml_registered = false;
  return out;
}
