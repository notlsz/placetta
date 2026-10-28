// Approving by text: the words. Each text that asks an owner to approve a filing carries a 4-digit code for that owner
// and that card ("Reply YES 4821 to approve"), and "YES 4821" from their verified number approves it (agent-run
// text_approve, src/textApprove.ts, migration 20261105090900_messaging.sql). A bare "yes" is never an approval: it's
// how people answer Odelia's questions, so it goes to her as usual. The code also means a forged plain SMS (whose sender
// is easy to fake) can't approve anything: the forger never saw the text with the code. Pure; text_approval_test.ts.
import type { Lang } from "./odelia.ts";

const YES = "yes|y|yep|yeah|ok|okay|approve|approved|confirm|go|批准|同意|确认|是|好|可以";

/** "YES 4821", "approve 4821", "批准 4821", "yes, 4821.", "4821 yes": the code. "approve" alone: code null. Else null. */
export function approvalReply(text: unknown): { code: string | null; bare: "yes" | "approve" | null } | null {
  if (typeof text !== "string") return null;
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length > 40) return null;
  const a = new RegExp(`^(?:${YES})[\\s,:：.!！-]*(\\d{4})[\\s.!。！]*$`, "iu").exec(t) ?? new RegExp(`^(\\d{4})[\\s,:：.!！-]+(?:${YES})[\\s.!。！]*$`, "iu").exec(t);
  if (a) return { code: a[1], bare: null };
  if (/^(approve|approved|批准)[\s.!。！]*$/iu.test(t)) return { code: null, bare: "approve" };
  return null;
}

/** The line that ends a text asking for an approval. */
export function approvalAsk(code: string, lang: Lang, what?: string): string {
  const w = what ? what.replace(/[.。]+$/, "").slice(0, 48) : "";
  return lang === "zh" ? `回复 YES ${code} 即可批准${w ? `“${w}”` : ""}。` : `Reply YES ${code} to approve${w ? `: ${w}` : ""}.`;
}

/** Which cards a text may approve (src/textApprove.ts textApprovable, the same rule, which agent-run checks again). */
export function cardByText(card: unknown): boolean {
  const a = (card ?? {}) as { kind?: string; app?: string; autopilot?: unknown; withdrawn?: unknown; purchase?: unknown };
  return a.kind === "file" && !!a.app && !a.autopilot && !a.withdrawn && !a.purchase;
}

export const APPROVE_SAY = {
  wrong: { en: "That code doesn't match a waiting approval. Check the code in my text, or approve in Placetta.", zh: "这个代码与等待中的批准不符。请核对短信中的代码，或在快哉中批准。" },
  locked: { en: "Too many wrong codes today, so approvals by text are paused until tomorrow. Approve in Placetta instead.", zh: "今天错误的代码太多，短信批准暂停到明天。请在快哉中批准。" },
  none: { en: "Nothing is waiting for a code right now. Nothing was approved.", zh: "目前没有等待代码批准的事项。没有批准任何内容。" },
  how: { en: "To approve by text, reply YES and the 4-digit code from my text, like YES 4821. Or approve in Placetta.", zh: "如需通过短信批准，请回复 YES 加上短信里的 4 位代码，例如 YES 4821。也可以在快哉中批准。" },
  held: { en: "I didn't act on that message: it reads like instructions written for an AI, not a question from you. Ask me in your own words, or in Placetta.", zh: "我没有处理这条消息：它像是写给 AI 的指令，而不是您的问题。请用您自己的话问我，或在快哉中操作。" },
};
