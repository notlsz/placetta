import { FORMS } from "../forms/registry";

/* ------------------------------------------------------------------ *
 * The official agency registry, as hosts: where a filing, a message to an
 * agency or a link in a reply may point. A host is official when it's a
 * government's own (.gov, .mil, .us, gov.xx and the like) or when it's
 * the host of a form in Placetta's forms library (src/forms/registry.ts),
 * whose every link was copied from the agency's own page. The server's
 * filing destinations (supabase/functions/file/destinations.ts) hold the
 * same line for what is actually sent.
 * ------------------------------------------------------------------ */

export const hostOf = (url: string): string => {
  try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : "https://" + url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") : ""; } catch { return ""; }
};

/** A government's own host: .gov, .mil, .us, a country's gov or gob or gouv second level, a city or county domain
 *  Placetta knows is the agency's own. */
/** .us alone isn't a government's: anyone can register one. Only the locality names under a state's code are
 *  (ci.sanjose.ca.us, co.santa-clara.ca.us, state.ca.us). */
export const governmentHost = (h: string) => /\.(gov|mil)$/i.test(h) || /\.[a-z]{2}\.us$/i.test(h) || /\.(gov|gob|gouv|govt|go|gc)\.[a-z]{2}$/i.test(h) || /(^|\.)(gov\.uk|gov\.cn|gc\.ca|canada\.ca|europa\.eu)$/i.test(h)
  || /(^|\.)(sccgov\.org|acgov\.org|sfgov\.org|nyc\.gov|lacounty\.gov|houstontx\.gov|sanjoseca\.gov)$/i.test(h);

let HOSTS: Set<string> | null = null;
/** Every host the forms library links to (the agencies' portals, PDFs and pages). */
export function agencyHosts(): Set<string> {
  if (HOSTS) return HOSTS;
  const out = new Set<string>();
  for (const f of FORMS) for (const u of [f.url, f.info, (f as { pdf?: string }).pdf]) { const h = u ? hostOf(u) : ""; if (h) out.add(h); }
  return (HOSTS = out);
}

/** On the registry: the host, or a parent of it, is an agency's (a portal's subdomain counts as the portal). */
export function registeredHost(h: string): boolean {
  if (!h) return false;
  const all = agencyHosts();
  for (let x = h; x.includes("."); x = x.slice(x.indexOf(".") + 1)) if (all.has(x)) return true;
  return false;
}

/** Where a filing or an agency's address may point: a government host or one in the registry. */
export const agencyHostOk = (h: string) => !!h && (governmentHost(h) || registeredHost(h));
export const agencyUrlOk = (url: string) => agencyHostOk(hostOf(url));
/** An email address at an agency: its domain is a government host or a registry host. */
export const agencyEmail = (email: string) => agencyHostOk(String(email ?? "").toLowerCase().split("@")[1] ?? "");

/** Placetta's own hosts. */
export const placettaHost = (h: string) => /(^|\.)placetta\.(com|ai|app)$/i.test(h);
