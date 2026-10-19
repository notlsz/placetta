import type { OrbState } from "thinking-orbs";
import { B, type Bi } from "./bi";

/* What Odelia's cloud puts on for each kind of step, and the word for it. The step's own orb is the tool it works with.
   Kept apart from Bot.tsx so that file only exports components (fast refresh). */
/** What the cloud can wear. The canvas cloud draws these in its face (scripts/patch-bot-avatars.mjs), the small
 *  vector cloud in CloudSvg.tsx, both in the landing page navy. */
export type Wear = "glasses-round" | "glasses-square" | "beanie" | "beret" | "headphones" | "bowtie" | "cap" | "bow";
/** Every step reads on the cloud itself, with no badge beside it: each working step has its own outfit, and thinking
 *  (the one bare step) closes its eyes, so idle (bare, eyes open) is never mistaken for work.
 *  `open`: listens with its mouth a little open; every other step smiles with it closed. `still`: no hopping.
 *  `shut`: eyes closed in a content curve. `look`: where the eyes rest while on the step (x right, y down, in face
 *  units; about 3 is a clear glance), when it isn't looking at the work beside it. */
export type Task = { verb: Bi; wear?: Wear; open?: boolean; still?: boolean; shut?: boolean; look?: [number, number] };
export const TASKS: Record<OrbState, Task> = {
  listening: { verb: B("Listening", "正在聆听"), wear: "headphones", open: true },
  searching: { verb: B("Searching", "正在搜索"), wear: "glasses-round" },
  solving: { verb: B("Solving", "正在推算"), wear: "glasses-square", look: [1.6, -1.8] },
  weaving: { verb: B("Planning", "正在规划"), wear: "beanie" },
  composing: { verb: B("Writing", "正在撰写"), wear: "beret", look: [0.6, 2] },
  shaping: { verb: B("Shaping", "正在整理"), wear: "bow" },
  connecting: { verb: B("Connecting", "正在连接"), wear: "bowtie" },
  working: { verb: B("Working", "正在处理"), wear: "cap" },
  breathing: { verb: B("Thinking", "正在思考"), still: true, shut: true },
};
/** The headline for a step: "Searching", "Planning", "Thinking". */
export const taskVerb = (s: OrbState): Bi => TASKS[s].verb;
