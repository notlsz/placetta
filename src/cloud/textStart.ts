import { supabase, type ApiError } from "./api";

/* A plan Odelia texted to a business that isn't on Placetta yet (supabase/functions/_shared/text_start.ts) arrives as a
   link to /app/?s=<token>. The token is kept in this browser through sign-in (an email link or Google's sign-in leaves
   the page and comes back without it), then claimed once: the plan becomes the person's workspace and the phone it was
   texted to is linked (text_start_claim). Nothing here is secret beyond the link itself, which only that phone got. */

const KEY = "placetta-text-start";
const DAYS = 7;
const TOKEN = /^[A-Za-z0-9]{10}\.\d{9,11}\.[A-Za-z0-9_-]{16}$/;

export type StartPeek = {
  status: "ok" | "used" | "expired" | "invalid";
  what?: string; place?: string; place_zh?: string | null; permits?: number; lang?: "en" | "zh";
  channel?: "sms" | "imessage" | "whatsapp" | "wechat"; phone_last4?: string | null; expires_at?: string;
  /** set when the signed-in person already claimed it: the workspace it became */
  workspace_id?: string | null;
};
export type StartClaim = { workspace_id: string; phone: "linked" | "kept" | "taken" | "declined" | "pin_required" | "none"; number?: string | null };

const read = (): string | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { token?: string; at?: number } | null;
    return v?.token && TOKEN.test(v.token) && Date.now() - Number(v.at ?? 0) < DAYS * 864e5 ? v.token : null;
  } catch { return null; }
};

/** The link's token, taken off the address (so it isn't left in the history or shared by accident) and kept until it's
 *  claimed; or the one kept from before. null when there's none. */
export function captureStart(): string | null {
  try {
    const q = new URLSearchParams(location.search), s = q.get("s");
    if (s !== null) {
      q.delete("s");
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
      if (TOKEN.test(s.trim())) { try { localStorage.setItem(KEY, JSON.stringify({ token: s.trim(), at: Date.now() })); } catch { return s.trim(); } }
    }
  } catch { /* no address to read */ }
  return read();
}
export const pendingStart = read;
export const clearStart = () => { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

/** What the link is for (anyone holding it can ask): the business, the place, how many permits, and whether it can
 *  still be claimed. */
export async function peekStart(token: string): Promise<StartPeek> {
  const { data, error } = await supabase().rpc("text_start_peek", { p_token: token });
  if (error) throw { code: error.code ?? "db_error", message: error.message ?? "" } as ApiError;
  return (data ?? { status: "invalid" }) as StartPeek;
}

/** Claim it as the signed-in person: the workspace id, and what happened with the phone. */
export async function claimStart(token: string, linkPhone: boolean): Promise<StartClaim> {
  const { data, error } = await supabase().rpc("text_start_claim", { p_token: token, p_link_phone: linkPhone });
  if (error) {
    const code = /start_used|start_expired|start_invalid|mfa_required/.exec(error.message ?? "")?.[0] ?? error.code ?? "db_error";
    throw { code, message: error.message ?? "" } as ApiError;
  }
  return data as StartClaim;
}
