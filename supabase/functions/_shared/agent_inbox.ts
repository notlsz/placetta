// The business's own inbox at Placetta: odelia+<token>@in.placetta.com, one per workspace (agent_inboxes,
// 20261105090000_agent_accounts.sql). When Odelia makes a business's account on an agency's site (worker/filer
// src/account.ts), this is the account's email, so the agency's verification email (a link or a code) comes back to
// Placetta through the same SES inbound flow as Odelia's own mail (odelia-mail), and the worker reads it from there.
//
// Pure and dependency-free: the file functions (Deno) and the portal worker (Node) both import it.

/** A message in the business's inbox, as the database keeps it: who sent it, its links and codes, never its whole body. */
export type InboxMail = {
  id: number | string;
  source: "email" | "owner_sms";
  from_addr: string;
  from_host: string;
  subject: string;
  links: string[];
  codes: string[];
  verified: boolean;
  received_at: string;
};

/** What a run is waiting for: a message from the agency (by its sender or a link to its site) after `since`. */
export type MailWait = { hosts: string[]; since: string; want: "link" | "code" | "any" };
export type Verification = { mail: InboxMail; link?: string; code?: string };

const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** The inbound address for a workspace: the plus address of Odelia's own inbound one ("odelia@in.placetta.com"). */
export function inboxAddress(token: string, base: string): string {
  const [local, domain] = lower(base).split("@");
  if (!local || !domain || !/^[a-z0-9]{6,32}$/.test(token)) throw new Error("inbox address: bad token or base address");
  return `${local.split("+")[0]}+${token}@${domain}`;
}

/** The workspace token a message was sent to, when one of its recipients is a plus address of one of Odelia's own
 *  inbound addresses; null otherwise (the mail is then Odelia's own, handled as before). */
export function inboxTokenOf(recipients: string[], bases: string[]): string | null {
  const mine = new Set(bases.map(lower).filter(Boolean));
  for (const r of recipients) {
    const m = /^([a-z0-9._-]+)\+([a-z0-9]{6,32})@([a-z0-9.-]+)$/.exec(lower(r));
    if (m && mine.has(`${m[1]}@${m[3]}`)) return m[2];
  }
  return null;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x3d;|&#61;/gi, "=").replace(/&quot;/g, '"');
/** Every https link in the text and in the HTML's hrefs, in order, each once. */
export function linksIn(text: string, html = ""): string[] {
  const out: string[] = [];
  const add = (u: string) => {
    const clean = decode(u).replace(/[.,;:!?)\]]+$/, "");
    try { const x = new URL(clean); if (x.protocol === "https:" && !x.username && !x.password && !out.includes(x.href)) out.push(x.href); } catch { /* not a link */ }
  };
  for (const m of String(html).matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of String(text).matchAll(/https:\/\/[^\s"'<>]+/gi)) add(m[0]);
  return out.slice(0, 40);
}

/** Codes the message gives, only where it says so ("Your verification code is 482913", "Code: 4829", "482913 is your
 *  code"): a number on its own (a ZIP code, a year, a phone number) is never taken for one. */
export function codesIn(text: string): string[] {
  const t = String(text).replace(/\s+/g, " ");
  const out: string[] = [];
  const add = (c: string) => { if (!out.includes(c)) out.push(c); };
  for (const m of t.matchAll(/\b(?:verification|security|confirmation|access|one[- ]time|activation|sign[- ]?in|login)?\s*(?:code|passcode|pin|otp)\b[^0-9A-Za-z]{0,24}(?:is|:)?\s*([0-9]{4,8})\b/gi)) {
    // a ZIP, area or promo code is not one
    if (/\b(zip|postal|area|country|promo|discount|tracking|naics|sic|tax)\s*$/i.test(t.slice(Math.max(0, (m.index ?? 0) - 12), (m.index ?? 0) + m[0].search(/code|passcode|pin|otp/i)))) continue;
    add(m[1]);
  }
  for (const m of t.matchAll(/\b([0-9]{4,8}) is your (?:[a-z-]+ ){0,2}(?:code|passcode|pin)\b/gi)) add(m[1]);
  return out.slice(0, 5);
}

const labels = (h: string) => lower(h).split(".").filter(Boolean);
/** h is d or one of its subdomains. */
const under = (h: string, d: string) => h === d || h.endsWith("." + d);
/** The hosts' parents a sender may write from: the host itself, and the host without its first label when what's left
 *  is still a named site (bizfileonline.sos.ca.gov sends from sos.ca.gov, never from ca.gov). */
function senderDomains(host: string): string[] {
  const l = labels(host);
  const out = [l.join(".")];
  if (l.length >= 4 || (l.length === 3 && !/^(gov|com|org|net|us)$/.test(l[1]))) out.push(l.slice(1).join("."));
  return out;
}
/** The vendors many agencies' portals run on send from their own domains. */
const PLATFORM_SENDERS: [string, string[]][] = [
  ["accela.com", ["accela.com"]],
  ["tylerhost.net", ["tylertech.com", "tylerhost.net", "tylerportico.com"]],
  ["tylerportico.com", ["tylertech.com", "tylerportico.com"]],
  ["hdlgov.com", ["hdlgov.com", "hdlcompanies.com"]],
  ["opengov.com", ["opengov.com"]],
  ["viewpointcloud.com", ["opengov.com", "viewpointcloud.com"]],
  ["my.site.com", ["salesforce.com", "force.com"]],
];

/** The message is from the agency's site: its sender's domain is the portal's (or its parent's, or its platform's),
 *  or it links to one of the portal's hosts. */
export function fromAgency(m: Pick<InboxMail, "from_addr" | "links">, hosts: string[]): boolean {
  const dom = lower(m.from_addr).split("@")[1] ?? "";
  const hs = hosts.map(lower).filter(Boolean);
  if (dom) {
    for (const h of hs) {
      if (senderDomains(h).some((d) => under(dom, d))) return true;
      for (const [suffix, senders] of PLATFORM_SENDERS) if (under(h, suffix) && senders.some((s) => under(dom, s))) return true;
    }
  }
  return m.links.some((u) => linkOn(u, hs));
}

/** The link is on one of the hosts (or a subdomain). */
export function linkOn(u: string, hosts: string[]): boolean {
  try {
    const x = new URL(u);
    // https only; plain http only on this machine's own address (the worker's test portal: no agency's host is one)
    const ok = x.protocol === "https:" || (x.protocol === "http:" && x.hostname === "127.0.0.1");
    return ok && !x.username && !x.password && hosts.some((h) => under(x.hostname.toLowerCase(), lower(h)));
  } catch { return false; }
}

const VERIFY = /verif|confirm|activat|validat|token|registr|complete|setup|set-up|welcome|account|key=|code=/i;
const NOT_VERIFY = /unsubscribe|privacy|terms|policy|help|faq|support|contact|logo|\.(png|jpe?g|gif|svg|css)(\?|$)/i;

/** The newest message from the agency after `since` that answers what the run waits for: a verification link on the
 *  portal's own hosts (never a link anywhere else, whatever the message says), or a code. A code the owner forwarded
 *  by text counts as a code. */
export function pickVerification(mails: InboxMail[], w: MailWait): Verification | null {
  const since = Date.parse(w.since);
  const fresh = mails
    .filter((m) => !Number.isFinite(since) || Date.parse(m.received_at) >= since - 1000)
    .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
  for (const m of fresh) {
    if (m.source === "owner_sms") {
      if (w.want !== "link" && m.codes[0]) return { mail: m, code: m.codes[0] };
      continue;
    }
    if (!fromAgency(m, w.hosts)) continue;
    const onSite = m.links.filter((u) => linkOn(u, w.hosts) && !NOT_VERIFY.test(u));
    const link = onSite.find((u) => VERIFY.test(u)) ?? onSite[0];
    if (w.want !== "code" && link) return { mail: m, link };
    if (w.want !== "link" && m.codes[0]) return { mail: m, code: m.codes[0] };
  }
  return null;
}

/** A code in a text the owner forwarded to Odelia ("Your City of Dallas code is 482913"), or one sent on its own. */
export function codeInText(text: string): string | null {
  const t = String(text ?? "").trim();
  if (!t || t.length > 400) return null;
  const alone = /^\D{0,12}([0-9]{4,8})\D{0,12}$/.exec(t);
  return alone ? alone[1] : codesIn(t)[0] ?? null;
}
