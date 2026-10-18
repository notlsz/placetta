import { B, type Bi } from "./bi";
import { activeSkills } from "./skills";
import type { Lang } from "./i18n";
import type { Workspace } from "./model";

/* Commands, the way Claude Code has slash commands and skills: type "/" in the message box for a list of the jobs
   people ask for most, plus one command per playbook. Picking one fills the box (or sends it, when it needs nothing
   more); sending turns it into the full request Odelia works from. "/plan" stays as it is: the run itself sees it
   and plans first (src/autonomy.ts). "/forget" never reaches her: the app starts a fresh conversation. */

export type Command = {
  cmd: string;            // what's typed, with the slash
  label: Bi;              // what it does, in a few words
  hint?: Bi;              // a line more
  args?: Bi;              // what to type after it, when it takes something
  needs?: boolean;        // it does nothing useful without what follows
  local?: "forget";       // handled by the app, not sent
  prompt?: (args: string, lang: Lang) => string;
};

const zhOr = (lang: Lang, en: string, zh: string) => (lang === "zh" ? zh : en);

export const BUILTIN_COMMANDS: Command[] = [
  { cmd: "/plan", label: B("Plan first", "先做计划"), hint: B("Odelia writes the plan for a job and waits for your approval", "Odelia 先写好计划，等您批准后再做"), args: B("the job", "要做的事"), needs: true,
    prompt: a => `/plan ${a}`.trim() },
  { cmd: "/status", label: B("What's blocking us", "什么在拖慢我们"), hint: B("Where everything stands, and the one next step", "各项进展，以及下一步"),
    prompt: (a, l) => zhOr(l, `What's blocking us right now${a ? ` with ${a}` : ""}? Check where everything stands and give me the one next step.`, `现在${a ? `在${a}上` : ""}有什么在拖慢我们？查看各项进展，告诉我下一步该做什么。`) },
  { cmd: "/renew", label: B("Start renewals", "开始续期"), hint: B("Everything that expires in the next 90 days, prepared for your approval", "未来 90 天内到期的一切，准备好等您批准"), args: B("what to renew (optional)", "要续期的项目（可选）"),
    prompt: (a, l) => a ? zhOr(l, `Start the renewal of ${a}: check when it expires, prepare the renewal and put it up for my approval.`, `开始续办${a}：查看到期日，准备续期申请并提交给我批准。`)
      : zhOr(l, "Find every license, permit and certificate that expires in the next 90 days and prepare each renewal for my approval.", "找出未来 90 天内到期的所有执照、许可和证书，逐一准备续期并提交给我批准。") },
  { cmd: "/inspection", label: B("Get ready for an inspection", "准备迎检"), hint: B("The inspector's checklist, what's still open, and the fixes", "检查员的清单、尚未完成的项目和整改"), args: B("which store (optional)", "哪家门店（可选）"),
    prompt: (a, l) => zhOr(l, `Get ${a || "our store"} ready for its next inspection: walk through the inspector's checklist, tell me what's still open and fix what you can.`, `让${a || "我们的门店"}为下一次检查做好准备：对照检查员的清单逐项过一遍，告诉我还有哪些没完成，能处理的先处理。`) },
  { cmd: "/map", label: B("Map permits", "梳理许可"), hint: B("Every license a business needs in a city, prepared and dated", "某个城市所需的全部许可，准备好并标好日期"), args: B("business, city", "业务，城市"),
    prompt: (a, l) => {
      const [what, ...where] = a.split(/[,，]/).map(x => x.trim()).filter(Boolean);
      return what && where.length ? zhOr(l, `Map every license and permit a ${what} needs in ${where.join(", ")}: prepare each application and add the deadlines.`, `梳理${where.join("，")}的${what}需要的全部执照和许可：逐一准备申请并添加截止日期。`)
        : what ? zhOr(l, `Map every license and permit we need in ${what}: prepare each application and add the deadlines.`, `梳理我们在${what}需要的全部执照和许可：逐一准备申请并添加截止日期。`)
        : zhOr(l, "Map every license and permit this business needs: prepare each application and add the deadlines.", "梳理这家企业需要的全部执照和许可：逐一准备申请并添加截止日期。");
    } },
  { cmd: "/deadlines", label: B("What's due", "到期事项"), hint: B("The next 30 days, and what to do for each", "未来 30 天，以及每项该做什么"),
    prompt: (_a, l) => zhOr(l, "What's due in the next 30 days, and what do I need to do for each?", "未来 30 天有哪些到期事项？每一项我需要做什么？") },
  { cmd: "/forget", label: B("Start fresh", "重新开始"), hint: B("Odelia forgets this conversation. Your workspace and memory stay", "Odelia 忘掉这次对话。工作区和记忆保持不变"), local: "forget" },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

/** Every command for this workspace: the built-in ones, then one per playbook that's turned on (form skills are
 *  for filling forms, not jobs to start). */
export function commandsFor(w: Workspace): Command[] {
  const taken = new Set(BUILTIN_COMMANDS.map(c => c.cmd));
  const books: Command[] = [];
  for (const s of activeSkills(w).filter(x => x.kind !== "form")) {
    const cmd = "/" + (slug(s.name.en) || slug(s.id) || s.id);
    if (taken.has(cmd)) continue;
    taken.add(cmd);
    books.push({ cmd, label: s.name, hint: s.description, args: B("details (optional)", "补充说明（可选）"),
      prompt: (a, l) => zhOr(l, `Run the playbook "${s.name.en}" (${s.id}).${a ? ` ${a}` : ""}`, `按手册“${s.name.zh}”（${s.id}）来做。${a}`) });
  }
  return [...BUILTIN_COMMANDS, ...books];
}

/** The commands that fit what's typed so far ("/re" finds /renew and Keep everything current's command), while the
 *  first word is still being typed. Empty when the box isn't a command. */
export function matchCommands(list: Command[], draft: string): Command[] {
  const m = /^\/(\S*)$/.exec(draft.trimStart());
  if (!m) return [];
  const q = m[1].toLowerCase();
  if (!q) return list;
  // the ones that start with what's typed first, then the ones that only mention it
  const starts = list.filter(c => c.cmd.slice(1).startsWith(q));
  return [...starts, ...list.filter(c => !starts.includes(c) && (c.cmd.includes(q) || c.label.en.toLowerCase().includes(q) || c.label.zh.includes(q)))];
}

/** What sending a command does: the request it becomes, or the app's own action. null when it isn't a command. */
export function expandCommand(list: Command[], text: string, lang: Lang): { prompt: string } | { local: "forget" } | null {
  const m = /^\s*(\/\S+)\s*([\s\S]*)$/.exec(text);
  if (!m) return null;
  const c = list.find(x => x.cmd === m[1].toLowerCase());
  if (!c) return null;
  if (c.local) return { local: c.local };
  return { prompt: c.prompt ? c.prompt(m[2].trim(), lang) : text };
}
