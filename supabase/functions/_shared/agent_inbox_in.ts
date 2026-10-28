// odelia-mail's side of the business's inbox (agent_inbox.ts): a message to odelia+<token>@in.placetta.com becomes one
// agent_inbox_mail row: who sent it, whether the receiving provider vouches for that sender, its subject, its https
// links (from the HTML's hrefs too, which the text part may not carry) and its codes. Never its whole body, and never
// a reply: an agency's no-reply mail is exactly what this inbox is for, so it isn't filtered as automated.
import { codesIn, linksIn } from "./agent_inbox.ts";
import type { InMail } from "./mail.ts";
import { parseMime } from "./mime.ts";

export type InboxRow = { p_token: string; p_provider_id: string; p_from: string; p_subject: string; p_links: string[]; p_codes: string[]; p_verified: boolean };

/** The raw message's HTML, when the provider handed us the raw message (SES, Postmark with RawEmailEnabled). */
function htmlOf(m: InMail): string {
  const raw = m.auth.provider === "ses" || m.auth.provider === "postmark" ? m.auth.raw : null;
  if (!raw) return "";
  try { return parseMime(raw).html; } catch { return ""; }
}

export function inboxRow(m: InMail, token: string, verified: boolean): InboxRow {
  const html = htmlOf(m);
  return {
    p_token: token,
    p_provider_id: m.id.slice(0, 300),
    p_from: m.from.slice(0, 320),
    p_subject: m.subject.replace(/[\r\n]+/g, " ").slice(0, 300),
    p_links: linksIn(m.text, html),
    p_codes: codesIn(`${m.subject}\n${m.text}`),
    p_verified: verified,
  };
}
