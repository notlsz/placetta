/* Never stop at "I can't". When a tool refuses or fails, the result Odelia reads carries a next_path: the one next step
   past the blocker and who takes it, so she does everything up to it herself and hands over only that step. The safety
   refusals stay refusals: a CAPTCHA is never bypassed (the owner solves it in the live view), and nothing is filed, paid
   or sent without the owner's approval (the path is the approval card). Pure, so it is tested directly
   (scripts/next-path-test.ts) and applied to every refused or failed tool result in src/serverRun.ts. */

export type NextPath = { who: "Odelia" | "owner" | "Placetta team" | "attorney" | "agency"; step: string };

const RULES: [RegExp, NextPath][] = [
  [/captcha|human check|verify you'?re (a )?human|bot check/i,
    { who: "owner", step: "Fill every field yourself first, then hand the owner one step: solve the CAPTCHA in the live view (send the live-view link). Never try to get past it." }],
  [/approv|without (the owner'?s|your) (ok|approval)|not approved|needs? (an )?approval/i,
    { who: "owner", step: "Finish the application, then put it up with request_filing_approval so the owner approves it with one tap. Nothing is filed, paid or sent before that." }],
  [/\bpay(ment)?\b|\bcard\b|\bfee\b.*(charge|pay)/i,
    { who: "owner", step: "Prepare everything, then send the owner the agency's own payment link (request_purchase or the approval card); the owner pays the agency directly." }],
  [/mail[- ]only|by mail|certified mail|in person|wet[- ]ink|notar/i,
    { who: "Placetta team", step: "Prepare the packet and the cover letter, then hand_off to the Placetta team to mail it, deliver it in person or get it notarized; the owner signs where a signature is required." }],
  [/unconfirmed|not published|no (current )?(published )?fee|fee (is )?unknown|claim false|couldn'?t confirm/i,
    { who: "Placetta team", step: "Use the agency's last published figure, mark it unconfirmed in the reply, and hand_off a task to the Placetta team to confirm it with the agency." }],
  [/lawyer|attorney|legal (advice|judgment|opinion)|counsel/i,
    { who: "attorney", step: "Build the packet for a licensed attorney (the facts, documents and a short list of questions) with draft_document, and tell the owner it's ready to send." }],
  [/signature|sign(ed)? by|e-?sign/i,
    { who: "owner", step: "Fill the form, then ask the owner for the signature on the approval card (typed or drawn). That is the only step for them." }],
  [/missing|needs? (the |a )?(document|file|upload)|no (document|file)|empty (line|field)|blank/i,
    { who: "Odelia", step: "Look for it yourself first (find_files, read_email, connected apps, city_records, company_profile) and fill it; ask the owner only for what no record holds, in one question." }],
  [/account|log ?in|sign ?in|password|credential/i,
    { who: "owner", step: "Prepare everything that doesn't need the login, then ask the owner once to connect the agency account (they sign in; the password stays in their vault)." }],
  [/not (allowed|available) (on|by|over) (this )?(channel|text|sms|phone|voice)|in the app/i,
    { who: "owner", step: "Do the part this channel allows, then send the owner the app link for the one step that has to happen there." }],
  [/\b(limits?|budget|cap|too many|rate[- ]limit(ed)?)\b/i,
    { who: "Odelia", step: "Finish what fits, then tell the owner in one line what's left and when it continues (the limit resets), or offer to raise the budget in Settings." }],
];

/** The next step past a refusal, from what the tool said. */
export function nextPath(tool: string, said: string): NextPath {
  const hit = RULES.find(([re]) => re.test(said));
  if (hit) return hit[1];
  return { who: "Odelia", step: `Read the error, fix the input and try ${tool} once more; if it still fails, do the rest of the job and hand_off this one step to the Placetta team with what you tried.` };
}

/** A refused or failed tool result with its next_path, once. */
export function withNextPath(tool: string, content: string): string {
  if (/\bnext_path\b/.test(content)) return content;
  const p = nextPath(tool, content);
  return `${content}\n\nnext_path (${p.who}): ${p.step}`;
}
