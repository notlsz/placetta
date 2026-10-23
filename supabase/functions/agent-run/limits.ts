// What one request to agent-run may hold and cost, as plain functions with no database, so the extreme test
// (scripts/extreme-test.ts) checks the same code the server runs. index.ts uses every one of these.
import { teamsServiceOk } from "../_shared/teams.ts";

/** The most a request body may hold. Messages are text; files go through Documents (storage), never inline. */
export const BODY_MAX = 400_000;
/** A request over BODY_MAX, by the size it says it is or by what arrived. */
export const tooLarge = (contentLength: string | null, raw?: string) => Number(contentLength ?? 0) > BODY_MAX || (raw !== undefined && raw.length > BODY_MAX);

/** The same request again within this window (a double tap, a retry, a script) gets the earlier run, not a second bill. */
export const REPEAT_MS = 10 * 60_000;
/** A key for "the same request again": the prompt and the conversation it came with. */
export async function repeatKey(prompt: string, history: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(prompt + "\n" + JSON.stringify(history ?? []));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Which earlier runs count: in the app one still running or done (the app shows its reply); from a text, a call or a
 *  chat only one still running, since the run that finishes is what answers them. */
export const repeatStatuses = (channel: string) => (channel === "app" ? ["running", "done"] : ["running"]);

/** One task's ceiling in US dollars, across every chunk a fresh instance picks up. AI_TASK_LIMIT_USD changes it; a
 *  missing, zero, negative or unreadable value keeps the default, so a typo in a secret can't switch the cap off. */
export const TASK_LIMIT_DEFAULT = 1.5;
export function taskLimit(env: (k: string) => string | undefined): number {
  const n = Number(env("AI_TASK_LIMIT_USD"));
  return Number.isFinite(n) && n > 0 ? n : TASK_LIMIT_DEFAULT;
}
/** One task's ceiling in tokens (prompt, cache and output), across every chunk: a runaway loop on a cheap model that
 *  never reaches the dollar cap still stops cleanly. AI_TASK_TOKEN_LIMIT changes it; a bad value keeps the default. */
export const TOKEN_LIMIT_DEFAULT = 500_000;
export function tokenLimit(env: (k: string) => string | undefined): number {
  const n = Number(env("AI_TASK_TOKEN_LIMIT"));
  return Number.isInteger(n) && n >= 10_000 ? n : TOKEN_LIMIT_DEFAULT;
}
/** A task that has already cost its limit stops before the next model call, whichever instance holds it. */
export const overTaskLimit = (spent: number, limit: number) => spent >= limit;

/** A run that fails for one of these reasons was stopped by its own limits or by the person: its model calls stay
 *  counted (giving them back would let a run past the allowance repeat for free). Any other failure (an upstream error,
 *  a crash, a run that stopped responding) is on Placetta's side or the vendor's: its calls are given back. */
const KEEP_CHARGED = new Set(["cancelled", "task_limit", "over_budget", "plan_required", "entry_ended", "paused", "not_allowed", "trial_used"]);
export const refundable = (code: string | undefined) => !KEEP_CHARGED.has(code ?? "");
/** Said with a failed run whose calls were given back. */
export const NOT_CHARGED_EN = "This run wasn't counted against your allowance.";

/** The most jobs one person may give Odelia from one chat app in an hour (Slack, Lark, WeChat, Teams, Telegram): far
 *  above what a person types, low enough that a stuck script or two bots answering each other stop quickly. The app,
 *  texts and email have their own limits (the allowance, inbound flood control). */
export const CHAT_JOBS_PER_HOUR = 30;
/** What they're told when they reach it, with what to do next. */
export const chatRateLimited = (lang: "en" | "zh") => lang === "zh"
  ? `这一小时您已在这里给 Odelia 派了 ${CHAT_JOBS_PER_HOUR} 项任务。请稍后再试，或在快哉应用中继续。`
  : `That's ${CHAT_JOBS_PER_HOUR} jobs from you here this hour. Try again in a little while, or carry on in the Placetta app.`;

/** Where a chat job's answer may go, checked before a run is made: the right shape for its chat, and for Teams one of
 *  Microsoft's own service addresses (the bot's token is sent there). */
export function chatToOk(to: { kind?: string } & Record<string, unknown>): boolean {
  const s = (k: string, re: RegExp) => typeof to[k] === "string" && re.test(to[k] as string);
  switch (to.kind) {
    case "slack": return s("channel", /^[A-Z0-9]{6,24}$/) && s("thread_ts", /^\d{6,12}\.\d{1,8}$/);
    case "lark": return s("message_id", /^om_[\w-]{6,80}$/);
    case "wechat": return s("openid", /^[A-Za-z0-9_-]{6,64}$/);
    case "telegram": return s("chat_id", /^-?\d{1,20}$/) && s("user", /^\d{3,20}$/) && Number.isInteger(to.message_id) && (to.message_id as number) > 0
      && (to.thread_id === undefined || (Number.isInteger(to.thread_id) && (to.thread_id as number) > 0));
    case "teams": return s("service_url", /^https:\/\//) && teamsServiceOk(to.service_url as string) && s("conversation_id", /^[^\s]{3,400}$/) && s("activity_id", /^[^\s/]{1,200}$/);
    default: return false;
  }
}
