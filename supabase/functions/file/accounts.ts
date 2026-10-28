// Who may make the account an agency's portal files through ("Odelia gets the login", worker/filer/src/account.ts).
//
//   business    the site registers a business (or its agent) by email and password: under the business's agent
//               authority, Odelia makes the account with the business's own inbox (odelia+<token>@in.placetta.com),
//               verifies it, and saves the login, so the filing (and every later one and every status check) signs in
//   individual  the site signs in with a person's own identity (ID.me, Login.gov, IRS Secure Access): that stays with
//               the owner, who is told why in plain words
//   unknown     not read yet: the Placetta team is asked (a team task), and the owner is never asked to make it
//   none        the portal files without an account (destinations.ts noLogin)
//
// Seeded from what destinations.ts records about each portal: "page" where the agency's own page, quoted in its entry,
// says the site has you create an account by yourself; "platform" where the host is a permitting platform whose
// public sign-up is by email (Accela Citizen Access, Tyler EnerGov Civic Access, HdL, OpenGov, My Health Department).
// A "platform" row is the team's to confirm on the first run; any run that meets an ID.me or Login.gov page on a
// "business" site hands back and opens a team task to change the row (run.ts makeAccount).
import type { Dest } from "./destinations.ts";

export type AccountKind = "business" | "individual" | "unknown" | "none";
export type AccountRow = { kind: Exclude<AccountKind, "none" | "unknown">; basis: "page" | "platform"; why: string };

/** By portal host (logins are matched by host and, on a shared host, the agency's path, so one row covers the host). */
export const PORTAL_ACCOUNTS: Record<string, AccountRow> = {
  // ---- the agency's own page, as quoted in destinations.ts
  "www.businessexpress.ny.gov": { kind: "business", basis: "page", why: "\"needs a NY.gov Business account\"" },
  "a816-hlst.nyc.gov": { kind: "business", basis: "page", why: "\"Create an account with the NYC Online Licensing system\"" },
  "a866-dcwpbp.nyc.gov": { kind: "business", basis: "page", why: "\"a registered account with the City\"" },
  "www.sa.gov": { kind: "business", basis: "page", why: "\"you must register and create a user account\"" },
  "apps.miami.gov": { kind: "business", basis: "page", why: "\"You must apply online through MiamiBiz\", after creating an account" },
  "taxapps.floridarevenue.com": { kind: "business", basis: "page", why: "\"user id and password you created for your online registration profile\"" },
  "kingcountywa-energovweb.tylerhost.net": { kind: "business", basis: "page", why: "\"Register for an account or login to your existing account in the Public Health Permit Center\"" },
  "mtc.dor.state.ma.us": { kind: "business", basis: "page", why: "\"Register your business on MassTaxConnect\"; two-step verification is set up at the first sign-in" },
  "thesource.jfs.ohio.gov": { kind: "business", basis: "page", why: "\"register your account by selecting Employers under Register for an Account\"" },
  "ecorp.sos.ga.gov": { kind: "business", basis: "page", why: "\"Create a user account\"" },
  "egov.maryland.gov": { kind: "business", basis: "page", why: "\"To file online: Create an account with Maryland Business Express\"" },
  "jobs.utah.gov": { kind: "business", basis: "page", why: "\"Create a new UI account for my business\"" },
  "myui.clouduim.cdle.state.co.us": { kind: "business", basis: "page", why: "\"Create an Employer User Account\" in MyUI Employer+" },
  "services.seattle.gov": { kind: "business", basis: "page", why: "\"You will need to create an account\"" },
  "ipi.cityofchicago.org": { kind: "business", basis: "page", why: "\"Applicants will need to create an account\"; the account is the restaurant's own" },
  "energovweb.sugarlandtx.gov": { kind: "business", basis: "page", why: "\"Login or register in at CITIZEN SELF-SERVICE (CSS)\"" },
  "mblsportal.sos.state.mn.us": { kind: "business", basis: "page", why: "\"Step 1: Create an online account with us and login\"" },
  "connect.irs.gov": { kind: "individual", basis: "page", why: "\"Sign in or create an account\" goes through IRS Secure Access (sa.www4.irs.gov), which verifies a person's identity with ID.me" },
  // ---- the platform's public sign-up (the team confirms on the first run)
  "aca-prod.accela.com": { kind: "business", basis: "platform", why: "Accela Citizen Access: \"Register for an Account\" by email; Torrance's page: \"Step 1. Create an online account\"" },
  "plus.fairfaxcounty.gov": { kind: "business", basis: "platform", why: "Accela Citizen Access (PLUS): registration by email" },
  "maricopacountyaz-energovweb.tylerhost.net": { kind: "business", basis: "platform", why: "Tyler EnerGov Civic Access: registration by email" },
  "losangelescountyca-energovweb.tylerhost.net": { kind: "business", basis: "platform", why: "Tyler EnerGov Civic Access: registration by email" },
  "oakland.hdlgov.com": { kind: "business", basis: "platform", why: "HdL Prime: registration by email" },
  "sacramento.hdlgov.com": { kind: "business", basis: "platform", why: "HdL Prime: registration by email" },
  "cupertino.hdlgov.com": { kind: "business", basis: "platform", why: "HdL Prime: registration by email" },
  "milpitas.hdlgov.com": { kind: "business", basis: "platform", why: "HdL Prime: registration by email" },
  "dalycity.hdlgov.com": { kind: "business", basis: "platform", why: "HdL Prime: registration by email" },
  "arcadia.hdlgov.com": { kind: "business", basis: "platform", why: "HdL Prime: registration by email" },
  "myhealthdepartment.com": { kind: "business", basis: "platform", why: "My Health Department: \"Log in to your account\"; sign-up by email" },
  "sanfranciscoca.portal.opengov.com": { kind: "business", basis: "platform", why: "OpenGov: sign-up by email" },
  "quincyma.viewpointcloud.com": { kind: "business", basis: "platform", why: "OpenGov (ViewPoint Cloud): sign-up by email" },
};

/** Sites that are a person's own identity, never a business's account. */
export const IDENTITY_HOSTS = /(^|\.)(id\.me|login\.gov|sa\.www4\.irs\.gov)$/i;

/** Who may make this destination's account. */
export function accountOf(d: Pick<Dest, "portal" | "noLogin"> & { account?: AccountKind } | undefined): AccountKind {
  if (!d?.portal) return "none";
  if (d.noLogin) return "none";
  if (d.account) return d.account;
  return PORTAL_ACCOUNTS[d.portal.toLowerCase()]?.kind ?? "unknown";
}

/** What the owner reads when the account is theirs to make, or the team is still checking. */
export const ACCOUNT_SAY = {
  individual: { en: "This agency's site signs in with a person's own identity (ID.me or Login.gov), so only you can make that account: Placetta never makes or uses one in your name. Make it once, save the login in Settings, and Odelia files from then on.",
    zh: "该机构网站要用个人身份（ID.me 或 Login.gov）登录，只有您本人可以开设：快哉从不以您的名义开设或使用这类账户。请开设一次，并在“设置”中保存登录信息，之后由 Odelia 办理。" },
  authority: { en: "This agency's site needs an account. Odelia makes one for the business when you've signed Placetta as your agent (Settings, Placetta as your agent); until then, save a login you already have in Settings.",
    zh: "该机构网站需要账户。您签署“快哉作为您的代理人”（设置中）后，Odelia 会为企业开设账户；在此之前，可在“设置”中保存您已有的登录信息。" },
  unknown: { en: "This agency's site needs an account, and the Placetta team is checking whether Odelia may make it for the business. If you'd rather not wait, send it with the packet in Documents.",
    zh: "该机构网站需要账户，快哉团队正在确认 Odelia 能否为企业开设。如不想等待，可用“文件”中的材料包自行提交。" },
};

/** Every reason the table can't ship (CI, logic_test). */
export function accountProblems(rows: Record<string, AccountRow> = PORTAL_ACCOUNTS, portals: string[] = []): string[] {
  const out: string[] = [];
  for (const [h, r] of Object.entries(rows)) {
    if (h !== h.toLowerCase() || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) out.push(`${h}: an account row is keyed by a bare host name`);
    if (!["business", "individual"].includes(r.kind)) out.push(`${h}: kind must be business or individual`);
    if (!["page", "platform"].includes(r.basis)) out.push(`${h}: basis must be page or platform`);
    if (r.why.trim().length < 10) out.push(`${h}: say why`);
    if (portals.length && !portals.includes(h)) out.push(`${h}: no destination files on this host`);
  }
  return out;
}
