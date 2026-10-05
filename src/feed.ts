import type { Reply, Step } from "./agent";
import { B, type Bi } from "./model";
import { ago } from "./time";

/* The agent panel's feed: what you said, each run with its steps and reply, and memories it committed. */

export type Turn = { id: number; kind: "turn"; at: string; steps: Step[]; active: number; reply?: Reply; ms?: number; draft?: string };
export type FeedItem =
  | { id: number; kind: "user"; text: string }
  | Turn
  | { id: number; kind: "memory"; text: Bi };

/** What the panel shows when you arrive: the morning's work, led by where things stand, then a nudge. */
export const INITIAL_FEED: FeedItem[] = [
  {
    id: 1, kind: "turn", at: ago(180), active: -1,
    steps: [
      { state: "searching", label: B("Checked the Business Tax Certificate: still in review", "查看了营业税证书：仍在审核中"), tool: "sanjoseca.gov" },
      { state: "searching", label: B("Checked San Jose and Santa Clara County for rule changes", "检查了圣何塞市和圣克拉拉县的法规变化"), tool: "sccgov.org" },
      { state: "shaping", label: B("Filled the sign permit application from your photos and lease", "根据门店照片和租约填写了招牌许可申请"), tool: "sanjoseca.gov" },
      { state: "weaving", label: B("Drew the sign drawing with dimensions", "绘制了带尺寸的招牌图纸") },
    ],
    reply: {
      text: [B("Here's where things stand: 2 applications are approved, 1 is with the city, and 3 need you. The sign permit is ready to file and only needs your approval.", "目前进展：2 项申请已获批准，1 项在市政府审核中，3 项需要您处理。招牌许可已可提交，只等您批准。")],
      apps: ["sign"],
      approvals: ["a-sign"],
    },
  },
  {
    id: 2, kind: "turn", at: ago(60), active: -1, steps: [],
    reply: {
      text: [B("Heads up: your LLC Statement of Information is due in 21 days. I can draft it from what I already know, so it only needs a look from you.", "提醒一下：您的有限责任公司信息声明将在 21 天后到期。我可以根据已有资料起草，您只需看一眼。")],
      next: { label: B("Draft it", "起草"), req: { text: "Prepare the Statement of Information" } },
    },
  },
];
