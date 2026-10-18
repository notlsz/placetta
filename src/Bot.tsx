import type { ReactNode } from "react";
import { BotAvatar, type BotAvatarType } from "bot-avatars";
import { BorderBeam } from "border-beam";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { TASKS } from "./tasks";
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
/** The orbs' ink: Placetta's blue (INK in pages.tsx). */
const ORB_INK = "#4D73A3";

export function AgentBot({ size, busy, label = "Odelia", interactive = true, task }: { size: number; busy?: boolean; label?: string; interactive?: boolean; task?: OrbState }) {
  const k = task ? TASKS[task] : undefined;
  // thinking is the one quiet task: it stays put and breathes slowly instead of hopping
  return (
    <BotAvatar type="cloud" face="mouth" color={CLOUD} size={size} state={busy && !k?.still ? "working" : "default"} interactive={interactive}
      turn={size < 40 ? 0.5 : 1} jumpEvery={size < 40 ? 0 : 9} speed={k?.still ? 0.6 : 1} accessoryColor={INK} {...k?.gear} aria-label={label} {...SOFT} />
  );
}

const TASK_TYPES: BotAvatarType[] = ["drop", "pebble", "pill", "ghost", "blob", "circle"];
/** A background job's bot: same family, its own shape, picked from the job's id so it stays put. */
export function TaskBot({ id, size = 26, label, busy = true }: { id: string; size?: number; label: string; busy?: boolean }) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <BotAvatar type={TASK_TYPES[h % TASK_TYPES.length]} color={BLUES[h % BLUES.length]} size={size} state={busy ? "working" : "default"} seed={(h % 100) / 100}
      interactive={false} turn={0.4} jumpEvery={0} aria-label={label} {...SOFT} />
  );
}

/** A store's own bot: Odelia for that one store, in the same family, with a shape of its own picked from the store's
 *  id (so each store keeps its bot everywhere: Work, Home, Stores and the replay). It hops while it works. */
export function StoreBot({ id, size = 26, label, busy }: { id: string; size?: number; label: string; busy?: boolean }) {
  return <TaskBot id={"store:" + id} size={size} label={label} busy={busy} />;
}
/** The bot behind a replay's moment: the main Odelia, or a store's bot. */
export function BotOf({ bot, size, label }: { bot?: string; size: number; label: string }) {
  return !bot || bot === "odelia" ? <AgentBot size={size} interactive={false} label={label} /> : <StoreBot id={bot} size={size} label={label} busy={false} />;
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

/**
 * Odelia at work: the cloud dressed for the step it is on (headphones to listen, glasses to search, a beret to write),
 * with that step's orb beside it as its tool. Touch screens keep what they had, so a phone never draws an extra canvas
 * per frame: `solo` spots show just the orb, the rest the plain cloud.
 */
export function LiveBot({ task, busy = !!task, size, label, solo, interactive = false }: { task?: OrbState; busy?: boolean; size: number; label?: string; solo?: boolean; interactive?: boolean }) {
  if (touch) {
    if (solo) return task ? <ThinkingOrb state={task} size={20} theme="light" color={ORB_INK} aria-hidden="true" /> : null;
    return <AgentBot size={size} busy={busy} label={label} interactive={interactive} />;
  }
  // `solo` sits in a line of text, so the orb goes beside the cloud; elsewhere it rests against the cloud's lower corner
  return (
    <span className={"livebot" + (solo ? " beside" : "")}>
      <span className="lb-bot" style={{ width: size, height: size }}><AgentBot size={size} busy={busy} task={task} label={label} interactive={interactive} /></span>
      {task && <ThinkingOrb className="lb-tool" state={task} size={20} theme="light" color={ORB_INK} speed={TASKS[task].still ? 0.7 : 1} dotSize={1.3} aria-hidden="true" />}
    </span>
  );
}
