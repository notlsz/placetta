// The rules for a business's own MCP servers, kept free of I/O so they can be tested (mcp_test.ts):
//   who may change them    owners only: connect, refresh, switch a tool off, disconnect, approve or decline a call
//   who may use them       an owner, or the member who connected that server (the same rule as a mailbox or drive)
//   what runs right away   a tool that is on and only reads (mcp.ts readOnly: its own annotation says readOnlyHint,
//                          and its name doesn't say otherwise)
//   what waits             anything else becomes a proposed call that runs once, after an owner approves it in the app
//   outside the app        email, texts, calls, Slack, Lark and WeChat: only tools that read, and none on plain SMS
import { mayRead } from "./access.ts";

export const MCP_OWNER_ACTIONS = ["mcp_connect", "mcp_refresh", "mcp_tool", "mcp_disconnect", "mcp_approve", "mcp_decline"] as const;
export const MCP_MEMBER_ACTIONS = ["mcp_available", "mcp_list", "mcp_tools", "mcp_call", "mcp_propose"] as const;

/** A tool as the server row keeps it. */
export type StoredTool = { name: string; title?: string; description: string; read_only: boolean; input_schema: Record<string, unknown>; headers?: Record<string, string> };
export type ServerLike = { status: string; connected_by: string | null; tools: StoredTool[]; disabled: string[] };

/** A refusal: why, in English and Chinese, and which kind of error it is. */
export type Refusal = { code: "forbidden" | "not_found" | "not_connected" | "bad_request"; en: string; zh: string };
const refuse = (code: Refusal["code"], en: string, zh: string): Refusal => ({ code, en, zh });

/** May this person use this server's tools through Odelia: an owner, or the member who connected it. */
export const mayUse = (access: string, s: { connected_by: string | null }, uid: string) => mayRead(access, s, uid);

/** The tool asked for, on, on a working server; or why not. */
export function toolOf(s: ServerLike, name: unknown, app: string): StoredTool | Refusal {
  if (s.status !== "connected") return refuse("not_connected", `${app} needs to be connected again in Settings.`, `需要在设置中重新连接${app}。`);
  const t = typeof name === "string" ? s.tools.find((x) => x.name === name) : undefined;
  if (!t) return refuse("not_found", `${app} has no tool by that name.`, `${app}没有这个工具。`);
  if (s.disabled.includes(t.name)) return refuse("forbidden", `An owner switched off ${t.name} for Odelia in Settings.`, `所有者已在设置中为 Odelia 关闭了 ${t.name}。`);
  return t;
}

export const isRefusal = (x: unknown): x is Refusal => !!x && typeof x === "object" && "code" in x && "en" in x && !("name" in x);

/** Whether a tool runs without an approval. */
export const runsDirectly = (t: StoredTool) => t.read_only === true;

/** Where a request came from when it wasn't the app: what it may use. */
export function remoteAllows(channel: string, plainSms: boolean, t: StoredTool): Refusal | null {
  if (!channel || channel === "app") return null;
  if (plainSms) return refuse("forbidden", "Connected apps aren't used from a plain text message, which can be forged.", "普通短信可能被伪造，所以不会使用已连接的应用。");
  if (!runsDirectly(t)) return refuse("forbidden", "From outside the app Odelia only reads from connected apps. Make this change in the Placetta app.", "在应用外，Odelia 只读取已连接的应用。请在快哉应用中进行此更改。");
  return null;
}

/** Tool arguments: a plain object, at most 20 KB as JSON. */
export function argsOf(v: unknown): Record<string, unknown> | Refusal {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return refuse("bad_request", "arguments must be an object.", "arguments 必须是对象。");
  let size = 0;
  try { size = JSON.stringify(v).length; } catch { return refuse("bad_request", "arguments must be plain JSON.", "arguments 必须是 JSON。"); }
  if (size > 20_000) return refuse("bad_request", "arguments are too long (at most 20 KB).", "arguments 过长（最多 20 KB）。");
  return v as Record<string, unknown>;
}

/** JSON with every object's keys in order, so two equal values always read the same. */
export const canon = (v: unknown): string =>
  JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** The call an owner approves is the call that was proposed: the same tool with the same inputs as the card they saw. */
export const sameCall = (expect: { tool?: unknown; arguments?: unknown } | null | undefined, stored: { tool: string; arguments: unknown }) =>
  !!expect && expect.tool === stored.tool && canon(expect.arguments ?? {}) === canon(stored.arguments ?? {});

/** A switched-off list kept to the tools that still exist after the server lists them again. */
export const keepDisabled = (disabled: string[], tools: StoredTool[]) => disabled.filter((n) => tools.some((t) => t.name === n));

/** The steps of an approved call, so it runs exactly once: claim it (waiting to running, in one database statement
 *  that only one caller can win), run it, then record how it went. claim returns null when it was already approved,
 *  declined or expired, or the person isn't an owner. */
export type Claimed = { id: string; server_id: string; tool: string; arguments: Record<string, unknown> };
export async function approveOnce<T>(o: {
  claim: () => Promise<Claimed | null>;
  run: (c: Claimed) => Promise<T>;
  settle: (c: Claimed, ok: boolean, note: string) => Promise<void>;
}): Promise<{ ran: true; claimed: Claimed; out: T } | { ran: false }> {
  const c = await o.claim();
  if (!c) return { ran: false };
  try {
    const out = await o.run(c);
    await o.settle(c, true, "ran");
    return { ran: true, claimed: c, out };
  } catch (e) {
    await o.settle(c, false, e instanceof Error ? e.message.slice(0, 300) : "failed");
    throw e;
  }
}
