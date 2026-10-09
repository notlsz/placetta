import type { ReactNode } from "react";
import { BotAvatar, type BotAvatarType } from "bot-avatars";
import { BorderBeam } from "border-beam";
import cloudPng from "./assets/agent-cloud.png";

/* Placetta's agent as a small plush character: a soft pastel-blue cloud with blushed cheeks with a smile (bot-avatars).
   It hops while it works and looks around while it waits. Each background job gets its own little bot. */

const INK = "#132A55";   // the landing page navy
/* The Ritz-Carlton pastel blue (the soft "memorable" blue from its 2015 identity; no official code is published, so it is
   matched to about #A4C8E1) with pink cheeks (#F0ADD3). The plush shader shifts colour a lot, so these settings were tuned by
   measuring the rendered body. Background-job bots share the family. */
const CLOUD = "#A4C8E1";
const BLUSH = "#F0ADD3";
const BLUES = [CLOUD];   // the shader turns lighter tints grey, so every job bot uses the same blue; shapes tell them apart
(globalThis as unknown as { __botBlush?: string }).__botBlush = BLUSH;   // read by the blush patch (scripts/patch-bot-avatars.mjs)
/* bot-avatars holds every plush bot back (opacity 0) until all of them have baked, up to 4 s on slow devices.
   The first frames are already good, so show each one straight away. */
const SOFT = { shading: "fabric" as const, saturation: 2.3, brightness: 1.6, ink: INK, style: { opacity: 1, transition: "none" } };

export function AgentBot({ size, busy, label = "Odelia", interactive = true }: { size: number; busy?: boolean; label?: string; interactive?: boolean }) {
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

/* Phones (iOS Safari above all) render the live plush canvas with blown-out brightness and flicker, so touch screens get
   a still of the same cloud, rendered from this component, with a gentle CSS float. */
const touch = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || /iP(hone|ad|od)/.test(navigator.userAgent));
export function GateBot({ busy }: { busy?: boolean }) {
  if (!touch) return <AgentBot size={84} busy={busy} />;
  return <img className={"gate-cloud" + (busy ? " busy" : "")} src={cloudPng} width={84} height={72} alt="Placetta" draggable={false} />;
}
