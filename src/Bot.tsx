import type { ReactNode } from "react";
import { BotAvatar, type BotAvatarType } from "bot-avatars";
import { BorderBeam } from "border-beam";

/* Placetta's agent as a small plush character: a soft light-blue cloud with a smile (bot-avatars).
   It hops while it works and looks around while it waits. Each background job gets its own little bot. */

const INK = "#192F47";
const BLUES = ["#B7D8F8", "#C6E0FA", "#A9CFF5", "#BCD9F7", "#CFE4FB"];
const SOFT = { shading: "fabric" as const, saturation: 1.5, brightness: 1.1, ink: INK };

export function AgentBot({ size, busy, label = "Placetta", interactive = true }: { size: number; busy?: boolean; label?: string; interactive?: boolean }) {
  return (
    <BotAvatar type="cloud" face="mouth" color="#B7D8F8" size={size} state={busy ? "working" : "default"} interactive={interactive}
      turn={size < 40 ? 0.5 : 1} jumpEvery={size < 40 ? 0 : 9} aria-label={label} {...SOFT} />
  );
}

const TASK_TYPES: BotAvatarType[] = ["drop", "pebble", "pill", "ghost", "blob", "circle"];
/** A background job's bot: same family, its own shape, picked from the job's id so it stays put. */
export function TaskBot({ id, size = 26, label }: { id: string; size?: number; label: string }) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <BotAvatar type={TASK_TYPES[h % TASK_TYPES.length]} color={BLUES[h % BLUES.length]} size={size} state="working" seed={(h % 100) / 100}
      interactive={false} turn={0.4} jumpEvery={0} aria-label={label} {...SOFT} />
  );
}

/** The light-blue beam that rides the border of anything in progress. Only on while `on`. */
export function Working({ on, size = "sm", children }: { on: boolean; size?: "sm" | "md" | "line"; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return <BorderBeam size={size} theme="light" colorVariant="ice" strength={0.9} className="beam-wrap">{children}</BorderBeam>;
}
