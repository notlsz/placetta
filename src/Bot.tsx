import type { ReactNode } from "react";
import { BotAvatar, type BotAvatarType } from "bot-avatars";
import { BorderBeam } from "border-beam";

/* Placetta's agent as a small plush character: a soft Ritz-Carlton-blue cloud with blushed cheeks with a smile (bot-avatars).
   It hops while it works and looks around while it waits. Each background job gets its own little bot. */

const INK = "#04101C";   // near-black navy, so the eyes read on the deep blue
/* Ritz-Carlton blue (#006B95) with soft pink cheeks (#F0ADD3). The plush shader shifts colour, so the base is tuned until the
   rendered body measures about #096C9C. Background-job bots share the blue family. */
const CLOUD = "#007A93";
const BLUSH = "#F0ADD3";
const BLUES = ["#007A93", "#0A86A0", "#006F88", "#1B8FA8", "#00809A"];
(globalThis as unknown as { __botBlush?: string }).__botBlush = BLUSH;   // read by the blush patch (scripts/patch-bot-avatars.mjs)
/* bot-avatars holds every plush bot back (opacity 0) until all of them have baked, up to 4 s on slow devices.
   The first frames are already good, so show each one straight away. */
const SOFT = { shading: "fabric" as const, saturation: 1.5, brightness: 1.45, ink: INK, style: { opacity: 1, transition: "none" } };

export function AgentBot({ size, busy, label = "Placetta", interactive = true }: { size: number; busy?: boolean; label?: string; interactive?: boolean }) {
  return (
    <BotAvatar type="cloud" face="mouth" color={CLOUD} size={size} state={busy ? "working" : "default"} interactive={interactive}
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
