/* Tools by intent. Every round used to send every tool's schema (about 45 of Placetta's own plus up to 40 from connected
   apps). Most requests need a core of about 20. The rest come in groups (stores, documents, mail, routines, spending, and
   each connected app on its own), offered when the request is about them, when the model asks for them (load_tools),
   or when the model calls one of their tools by name anyway: that call still runs, through the same policy gate as any
   other, and its group is offered from then on. The groups only grow during a run (RunState.toolGroups), so the prompt
   cache's prefix changes at most a couple of times. Pure apart from the Tool objects it is handed. */

import type { Tool } from "./live";

export type Group = "stores" | "documents" | "mail" | "routines" | "spending";
export const GROUPS: Record<Group, { tools: string[]; about: string; words: RegExp }> = {
  stores: {
    tools: ["add_store", "update_store", "remove_store", "split_job", "inspection_guide", "inspection_booking", "plan_markets"],
    about: "add, change or remove stores, split a job across stores, the inspection guide, plan several markets at once",
    words: /\b(stores?|locations?|markets|cities|expan(d|ding|sion)|branch(es)?|outlets?|franchis\w*|inspections?|inspectors?|health grade|each store|every store|all stores)\b|门店|分店|店铺|加盟|检查|卫生/i,
  },
  documents: {
    tools: ["review_documents", "import_file", "find_files"],
    about: "read uploaded documents, import a file, find files in a connected drive",
    words: /\b(documents?|files?|uploads?|uploaded|attach\w*|pdfs?|docx|lease|certificates?|letters?|scans?|import|spreadsheet|drive|dropbox|folder)\b|文件|上传|附件|合同|租约|证书|信函|文档/i,
  },
  mail: {
    tools: ["search_email", "read_email", "send_email", "add_calendar_event"],
    about: "search and read email, send an email, add a calendar event",
    words: /\b(e-?mails?|inbox|mail|gmail|outlook|calendar|meetings?|appointments?)\b|邮件|邮箱|日历|会议|预约/i,
  },
  routines: {
    tools: ["schedule_routine", "cancel_routine", "change_setting", "skill_read", "skill_save", "network_lessons", "search_past_chats"],
    about: "recurring routines, settings, saved playbooks, other businesses' lessons, past conversations",
    words: /\b(every (day|week|month|morning|monday|year)|daily|weekly|monthly|routines?|recurring|remind\w*|schedul\w*|settings?|autonomy|playbooks?|skills?|lessons?|other businesses|last time|past (chats?|conversations?)|we (talked|discussed))\b|每天|每周|每月|定期|提醒|设置|流程|经验|上次|之前|聊过/i,
  },
  spending: {
    tools: ["request_purchase", "set_budgets", "get_income", "get_sales", "get_staff"],
    about: "buy something, spending budgets, income, sales and staff from the connected books and POS",
    words: /\b(buy|purchase|pay(ment)?|spend\w*|budgets?|income|sales|revenue|profit|staff|employees?|payroll|quickbooks|square|toast|pos)\b|购买|付款|支付|预算|收入|销售|营业额|员工|工资/i,
  },
};
const IN_GROUP = new Map<string, Group>(Object.entries(GROUPS).flatMap(([g, x]) => x.tools.map(t => [t, g as Group] as const)));
const APP = /^mcp__([^_]+(?:_[^_]+)*?)__/;
/** A connected app's tools are their own group, "app:<id>". */
export const groupOf = (tool: string): string | null => {
  const m = APP.exec(tool);
  return m ? "app:" + m[1] : IN_GROUP.get(tool) ?? null;
};
export const LOAD_TOOLS = "load_tools";

// words too common to tie a request to a connected app (and the third-party note every app tool's description carries)
const COMMON = new Set("about after again also before being could doing every first from have here into just like make more most much need only other over please should some still than that their them then there these they this those through under until using want were what when where which while will with within would your yours tool tools output party third treat never instructions comes come data search query fetch create update delete lookup".split(" "));
const wordsOf = (t: string) => new Set((t.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter(w => !COMMON.has(w)));

/** The groups a request is about: its words, files sent with it, a store's bot, and each connected app it names or
 *  whose tools share a distinctive word with it (apps: the app's id and its tools' names and descriptions). */
export function groupsFor(text: string, o: { files?: number; child?: boolean; apps?: { id: string; text: string }[] } = {}): string[] {
  const out = new Set<string>();
  for (const [g, x] of Object.entries(GROUPS)) if (x.words.test(text)) out.add(g);
  if (o.files) out.add("documents");
  if (o.child) out.add("stores");
  const asked = wordsOf(text);
  for (const a of o.apps ?? []) {
    const name = a.id.replace(/[_-]+/g, " ").toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${name}\\b`, "i").test(text) || [...wordsOf(a.text)].some(w => asked.has(w))) out.add("app:" + a.id);
  }
  return [...out];
}

export type Loader = {
  /** The tools to offer this round: the core, the loaded groups, and load_tools while anything is left to load. */
  offered(): Tool[];
  /** Every tool the run may use (runTool looks them up here, so a call by name works whether or not it was offered). */
  all: Tool[];
  /** A tool was called: its group is offered from now on. */
  used(name: string): void;
  /** The groups loaded so far, kept on the run's state so a resumed chunk offers the same tools. */
  loaded(): string[];
};

/** Narrows a run's tools by intent. `all` is the full list after the policy gate (secureTools) and the controls have
 *  wrapped it; load_tools is added here and is itself a "plan" scope call through the same gate when `wrap` is given. */
export function toolLoader(all: Tool[], start: string[], wrap: (t: Tool) => Tool = t => t): Loader {
  const loaded = new Set(start);
  const groups = new Map<string, Tool[]>();
  for (const t of all) { const g = groupOf(t.name); if (g) groups.set(g, [...(groups.get(g) ?? []), t]); }
  const left = () => [...groups.keys()].filter(g => !loaded.has(g));
  const describe = (g: string) => g.startsWith("app:") ? `${g}: the connected app ${g.slice(4)} (${groups.get(g)!.length} tools)` : `${g}: ${GROUPS[g as Group].about} (${groups.get(g)!.map(t => t.name).join(", ")})`;
  const load: Tool = wrap({
    name: LOAD_TOOLS,
    description: "Load more tools for this conversation. Only the core tools are offered at first; call this with the groups you need and their tools are offered from the next step on. You may also call any tool named in your instructions directly.",
    inputSchema: { type: "object", properties: { groups: { type: "array", items: { type: "string" }, minItems: 1, description: "Group names from the list in this tool's result or the instructions" } }, required: ["groups"] },
    execute(input) {
      const want = (Array.isArray(input.groups) ? input.groups : []).map(String);
      const bad = want.filter(g => !groups.has(g));
      const ok = want.filter(g => groups.has(g));
      for (const g of ok) loaded.add(g);
      const rest = left();
      return [
        ok.length ? `Loaded ${ok.join(", ")}: ${ok.flatMap(g => groups.get(g)!.map(t => t.name)).join(", ")}. They're offered from your next step.` : "",
        bad.length ? `No group named ${bad.join(", ")}.` : "",
        rest.length ? `Still available: ${rest.map(describe).join("; ")}.` : "Every tool is loaded.",
      ].filter(Boolean).join(" ");
    },
  });
  const core = all.filter(t => !groupOf(t.name));
  return {
    all: [...all, load],
    offered() {
      const extra = [...loaded].flatMap(g => groups.get(g) ?? []);
      const rest = left();
      if (!rest.length) return [...core, ...extra];
      // the groups still to load, named in load_tools' own description, so the model knows what it can ask for
      return [...core, ...extra, { ...load, description: `${load.description} Groups: ${rest.map(describe).join("; ")}.` }];
    },
    used(name) { const g = groupOf(name); if (g && groups.has(g)) loaded.add(g); },
    loaded: () => [...loaded],
  };
}

/** About how many tokens a list of tool definitions costs in a request (4 characters a token, the usual estimate for
 *  JSON schemas in English). */
export const toolTokens = (defs: unknown[]) => Math.round(JSON.stringify(defs).length / 4);
