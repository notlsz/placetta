import type { Reply, Step } from "./agent";
import { B, SAMPLE, type Bi, type Workspace } from "./model";
import { ago, inDays } from "./time";
import { headline, todos } from "./doNext";

/* The agent panel's feed: what you said, each run with its steps and reply, and memories it committed. */

export type Turn = { id: number; kind: "turn"; at: string; steps: Step[]; active: number; reply?: Reply; ms?: number; draft?: string };
export type FeedItem =
  | { id: number; kind: "user"; text: string }
  | Turn
  | { id: number; kind: "memory"; text: Bi };

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Where things stand, said from the workspace: the same count of what needs you as Home's badge and "Waiting on you",
 *  and the same first thing as Home's "Do this next" (src/doNext.ts todos). Never a fixed sentence: the sample once
 *  said "3 need you" and named the sign permit while Home counted 5 and put the staff text first. */
export function standing(w: Workspace, today: string): { text: Bi; approvals: string[] } {
  const done = w.apps.filter(a => a.status === "approved").length;
  const withAgency = w.apps.filter(a => a.status === "review" || a.status === "filing").length;
  const list = todos(w, today), first = list[0];
  const need = list.length;
  const lead = B(`Here's where things stand: ${n(done, "license is", "licenses are")} approved, ${withAgency} ${withAgency === 1 ? "is" : "are"} with the agency, and ${n(need, "thing needs", "things need")} you.`,
    `目前进展：${done} 项执照已获批准，${withAgency} 项在机构审核中，${need} 项需要您处理。`);
  const next = first ? B(` First: ${lowerFirst(headline(first).en)}.`, `先做这一项：${headline(first).zh}。`) : B(" Nothing needs you right now.", "目前没有需要您处理的事项。");
  return { text: B(lead.en + next.en, lead.zh + next.zh), approvals: first?.kind === "approval" ? [first.a.id] : [] };
}

/** What the panel shows when you arrive: the morning's work, led by where things stand. */
export function initialFeed(w: Workspace, today: string): FeedItem[] {
  const s = standing(w, today);
  return [
    {
      id: 1, kind: "turn", at: ago(180), active: -1,
      steps: [
        { state: "searching", label: B("Checked the Business Tax Certificate: still in review", "查看了营业税证书：仍在审核中"), tool: "sanjoseca.gov" },
        { state: "searching", label: B("Checked San Jose and Santa Clara County for rule changes", "检查了圣何塞市和圣克拉拉县的法规变化"), tool: "deh.santaclaracounty.gov" },
        { state: "shaping", label: B("Filled the sign permit application from your photos and lease", "根据门店照片和租约填写了招牌许可申请"), tool: "sanjoseca.gov" },
        { state: "weaving", label: B("Drew the sign drawing with dimensions", "绘制了带尺寸的招牌图纸") },
      ],
      reply: { text: [s.text], approvals: s.approvals },
    },
  ];
}

/** The sample's greeting as it opens (the voice clips are recorded from it: scripts/dump-replies.ts). */
export const INITIAL_FEED: FeedItem[] = initialFeed(SAMPLE, inDays(0));
