import type { BotAvatarProps } from "bot-avatars";
import type { OrbState } from "thinking-orbs";
import { B, type Bi } from "./bi";

/* What Odelia's cloud puts on for each kind of step, and the word for it. The step's own orb is the tool it works with.
   Kept apart from Bot.tsx so that file only exports components (fast refresh). */
export type Task = { verb: Bi; gear: Pick<BotAvatarProps, "hat" | "glasses" | "headphones" | "bowTie">; still?: boolean };
export const TASKS: Record<OrbState, Task> = {
  listening: { verb: B("Listening", "正在聆听"), gear: { headphones: true } },
  searching: { verb: B("Searching", "正在搜索"), gear: { glasses: "round" } },
  solving: { verb: B("Solving", "正在推算"), gear: { glasses: "square" } },
  weaving: { verb: B("Planning", "正在规划"), gear: { hat: "beanie" } },
  composing: { verb: B("Writing", "正在撰写"), gear: { hat: "beret" } },
  shaping: { verb: B("Shaping", "正在整理"), gear: {} },
  connecting: { verb: B("Connecting", "正在连接"), gear: { bowTie: true } },
  working: { verb: B("Working", "正在处理"), gear: { hat: "beanie" } },
  breathing: { verb: B("Thinking", "正在思考"), gear: {}, still: true },
};
/** The headline for a step: "Searching", "Planning", "Thinking". */
export const taskVerb = (s: OrbState): Bi => TASKS[s].verb;
