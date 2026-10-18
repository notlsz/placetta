import { B, same } from "./bi";
import type { AgentBackend, Step } from "./core";
import { forModel, planApprovalId, planPending, runMode } from "./autonomy";
import type { Job } from "./jobs";

/* Plan first in the sample demo, which has no model: "/plan …", the Plan first toggle, or the owner's Plan first
   setting gets a scripted plan for
   the job, waiting for approval with Approve plan and Change it, the way a live Odelia writes one. Anything else goes
   to the demo's own script. */

const STEPS = [
  B("Find the official forms and the agencies for it", "找到相关的官方表格和机构"),
  B("Prepare each application and fill it from your business facts", "逐一准备申请，并根据企业资料填写"),
  B("Add the deadlines that matter", "添加相关的截止日期"),
  B("Ask the people involved for what only they have", "向相关人员索取只有他们能提供的材料"),
  B("Put each filing up for your approval", "把每项申请提交给您批准"),
];
const DONE = [B("Every application it needs is in Permits, filled from your facts", "所需申请都已在许可中，并根据企业资料填好"), B("Each filing is waiting for your approval", "每项申请都在等您批准")];

export function withDemoPlan(demo: AgentBackend): AgentBackend {
  return {
    async run(req, ctx, onEvent, signal) {
      // "/plan", or any request while the owner's setting is Plan first (a job whose plan was approved runs as usual)
      if (!("text" in req) || runMode(ctx.current, req.text).mode !== "plan") return demo.run(req, ctx, onEvent, signal);
      const task = forModel(req.text).slice(0, 90), zh = ctx.lang === "zh";
      const steps: Step[] = [
        { state: "searching", label: B("Reading your workspace", "读取您的工作区") },
        { state: "searching", label: B("Looking up what the job needs", "查明这项工作需要什么") },
        { state: "shaping", label: B("Writing the plan", "撰写计划") },
      ];
      for (const [i, s] of steps.entries()) {
        if (signal.aborted) throw { code: "cancelled" };
        onEvent({ type: "step", index: i, step: s });
        await new Promise(r => setTimeout(r, 450));
      }
      const now = new Date().toISOString(), id = "job-plan-" + Date.now().toString(36);
      const job: Job = { id, title: same(task.replace(/[.。]$/, "")), status: "running", steps: STEPS.map(t => ({ title: t, done: false })), done: DONE.map(t => ({ text: t })), started: now, updated: now, seat: 1 };
      onEvent({ type: "update", patch: w => planPending(id)({ ...w, jobs: [job, ...(w.jobs ?? [])] }) });
      onEvent({ type: "reply", reply: {
        text: [zh ? same(`这是“${task}”的计划：${STEPS.length} 步，先找表格，最后把每项申请交给您批准。您批准后我就开始。`)
          : same(`Here's the plan for "${task}": ${STEPS.length} steps, from finding the forms to putting each filing up for your approval. I start once you approve it.`)],
        approvals: [planApprovalId(id)],
      } });
    },
  };
}
