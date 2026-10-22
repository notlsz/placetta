#!/usr/bin/env node
/* The quarterly access review, pre-filled. Reads an evidence bundle written by scripts/soc2-evidence.mjs (its
   evidence.json) and writes the review worksheet as Markdown: every staff account, GitHub collaborator and function
   secret it found, each with what to decide, flags for what needs a look (no two-step, no sign-in for 90 days, an
   admin who isn't the owner), and the consoles the bundle can't see, to check by hand. The reviewer fills in the
   decisions, signs it, and keeps it in the evidence folder next to the bundle (it names people: never in the repo).
   The blank form is docs/soc2/records/access-review-template.md; the policy is docs/soc2/policies/access-control.md.

   Usage:
     node scripts/access-review.mjs --evidence ~/placetta-evidence/placetta-soc2-evidence-2027-01-08/evidence.json \
       --quarter 2027-Q1 --out ~/placetta-evidence/2027-01-08-access-review.md
     node scripts/access-review.mjs --template                   the blank worksheet, to stdout */
import { readFileSync, writeFileSync } from "node:fs";

const DAY = 86_400_000;
export const OWNER_LOGIN = "notlsz";
/** Consoles an evidence bundle can't list: each is checked by hand, in its own admin page. */
export const CONSOLES = [
  ["Supabase organization", "supabase.com/dashboard, Organization, Team"],
  ["Vercel team", "vercel.com, Team settings, Members"],
  ["Render workspace", "dashboard.render.com, Workspace settings, Members"],
  ["Stripe", "dashboard.stripe.com, Settings, Team and security"],
  ["Anthropic console", "console.anthropic.com, Settings, Members"],
  ["Google Cloud and Gemini", "console.cloud.google.com, IAM"],
  ["Google Workspace or company email", "admin.google.com, Users (2-Step Verification enforcement)"],
  ["Telnyx", "portal.telnyx.com, Account, Users"],
  ["Linq", "Linq dashboard, Team"],
  ["Meta (WhatsApp)", "business.facebook.com, Business settings, People"],
  ["Resend", "resend.com, Team"],
  ["Lob", "dashboard.lob.com, Settings, Users"],
  ["Microsoft Azure (Speech)", "portal.azure.com, Access control (IAM)"],
  ["Browserbase, Groq, Cerebras, OpenRouter", "each console's team or members page"],
  ["Domain registrar and DNS for placetta.com", "the registrar's account users"],
  ["Company password manager", "admin console: members, emergency access"],
  ["AI coding bot identity (placetta-bot)", "github.com/settings/tokens as the bot: token scopes and expiry"],
];

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const row = (cells) => `| ${cells.map(esc).join(" | ")} |`;

/** Flags for one staff account. */
export function staffFlags(s, now) {
  const f = [];
  if (!s.signed_up) f.push("listed as staff but never signed up: remove from staff_emails unless they start soon");
  if (s.signed_up && !s.mfa) f.push("no two-step sign-in: can't reach customer records until it's on");
  if (s.signed_up && (!s.last_sign_in_at || now - Date.parse(s.last_sign_in_at) > 90 * DAY)) f.push("no sign-in for 90 days: still needed?");
  return f;
}

export function collaboratorFlags(c) {
  const f = [];
  if (c.login !== OWNER_LOGIN && (c.admin || c.role === "admin")) f.push("admin who isn't the owner: needs a reason");
  if (/bot/i.test(c.login) && (c.admin || c.role === "admin" || c.role === "maintain")) f.push("bot with more than write access");
  return f;
}

export function worksheet(ev, { quarter, now = Date.now() } = {}) {
  const src = (id) => ev?.sources?.[id];
  const L = [];
  const date = new Date(now).toISOString().slice(0, 10);
  L.push(`# Access review, ${quarter ?? "<quarter>"}`, "");
  L.push(`Pre-filled ${date} by scripts/access-review.mjs from the evidence bundle generated ${ev?.generated_at ?? "<not given>"}.`,
    "Fill in every \"Decision\" (keep, change or remove) and \"Done\" cell, then sign at the end. A flagged row needs a reason to keep it.", "");

  L.push("## Placetta staff (public.staff_emails)", "");
  const st = src("supabase.staff");
  if (st?.status === "ok") {
    L.push(row(["Email", "Name", "Two-step", "Last sign-in", "Flags", "Decision", "Done"]), "| --- | --- | --- | --- | --- | --- | --- |");
    for (const s of st.data.staff) L.push(row([s.email, s.name ?? "", s.mfa ? "on" : "off", s.signed_up ? s.last_sign_in_at ?? "never" : "not signed up", staffFlags(s, now).join("; ") || "none", "", ""]));
    L.push("", `Customer accounts, for context only: ${st.data.all_users?.total ?? "?"} in all, ${st.data.all_users?.with_mfa ?? "?"} with two-step on.`, "");
  } else L.push(`Not in the bundle (${st?.reason ?? st?.status ?? "missing"}): run the evidence script with SUPABASE_SERVICE_ROLE_KEY, or list staff_emails by hand.`, "");

  L.push("## GitHub (notlsz/placetta)", "");
  const co = src("github.collaborators");
  if (co?.status === "ok") {
    L.push(row(["Login", "Role", "Flags", "Decision", "Done"]), "| --- | --- | --- | --- | --- |");
    for (const c of co.data) L.push(row([c.login, c.role ?? (c.admin ? "admin" : "write"), collaboratorFlags(c).join("; ") || "none", "", ""]));
    L.push("");
  } else L.push(`Not in the bundle (${co?.reason ?? co?.status ?? "missing"}): run the evidence script with GITHUB_TOKEN, or check Settings, Collaborators by hand.`, "");
  const bp = src("github.branch_protection");
  if (bp) {
    const d = bp.data;
    const said = bp.status !== "ok" ? bp.reason ?? bp.status
      : !d?.protected ? `off (${d?.reason ?? "not protected"})`
      : d.mismatches?.length ? `on, but differs from .github/branch-protection.json in ${d.mismatches.length} setting(s)` : "on, and matches .github/branch-protection.json";
    L.push(`Branch protection on main: ${said}.`, "");
  }

  L.push("## Server function secrets (names only)", "");
  const sc = src("supabase.secrets");
  if (sc?.status === "ok") {
    L.push("For each: still used by the code? Rotated in the last 12 months, or since anyone with access left?", "");
    L.push(row(["Secret", "Still used", "Last rotated", "Decision"]), "| --- | --- | --- | --- |");
    for (const n of sc.data.names) L.push(row([n, "", "", ""]));
    L.push("");
  } else L.push(`Not in the bundle (${sc?.reason ?? sc?.status ?? "missing"}): run the evidence script with SUPABASE_ACCESS_TOKEN.`, "");

  L.push("## Consoles checked by hand", "", "For each: every member still needs access, roles are the least that works, two-step sign-in (a security key or passkey for admins) is on for everyone.", "");
  L.push(row(["Console", "Where", "Members and roles", "Two-step on for all", "Decision", "Done"]), "| --- | --- | --- | --- | --- | --- |");
  for (const [name, where] of CONSOLES) L.push(row([name, where, "", "", "", ""]));
  L.push("");

  const flagged = [
    ...(st?.status === "ok" ? st.data.staff.filter((s) => staffFlags(s, now).length).map((s) => `staff ${s.email}`) : []),
    ...(co?.status === "ok" ? co.data.filter((c) => collaboratorFlags(c).length).map((c) => `GitHub ${c.login}`) : []),
  ];
  L.push("## Summary", "", `Flagged for a decision: ${flagged.length ? flagged.join(", ") : "nothing"}.`, "",
    "Removed or changed (who, what, when):", "", "Exceptions (what, why, until when, approved by):", "",
    "Reviewed by: ____________________  Date: __________  Signature: ____________________", "");
  return L.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  try {
    if (a.includes("--template")) { process.stdout.write(worksheet({ sources: {} }, { quarter: get("--quarter") })); process.exit(0); }
    const file = get("--evidence");
    if (!file) throw new Error("--evidence <bundle>/evidence.json is required (or --template)");
    const out = worksheet(JSON.parse(readFileSync(file, "utf8")), { quarter: get("--quarter") });
    const dest = get("--out");
    if (dest) { writeFileSync(dest, out); console.log(`access review worksheet written to ${dest}`); } else process.stdout.write(out);
  } catch (e) { console.error(`access-review: ${e.message}`); process.exit(1); }
}
