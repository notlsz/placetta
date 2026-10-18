import { B, type Bi } from "./bi";
import type { HqRow } from "./hq";
import type { Level, Status, Workspace } from "./model";

/* The review table (Legora's Tabular Review, for a chain): stores as rows, permits and requirements as columns grouped
   formation, tax, health, building, staff certificates and renewals, each cell the state of that requirement at that
   store with its next date. One model for both places it shows: Permits in a workspace with two or more stores (built
   from the workspace), and Headquarters across every franchisee that shared with it (built from hq_review(), which
   only carries names, dates and statuses). Pure functions, so the grid, its filters, its CSV and the prompt for
   "Ask Odelia to prepare" are tested on their own (scripts/extreme-test.ts). */

export type GroupId = "formation" | "tax" | "health" | "building" | "staff" | "renewals" | "other";
export const GROUPS: { id: GroupId; label: Bi }[] = [
  { id: "formation", label: B("Formation", "企业设立") },
  { id: "tax", label: B("Tax", "税务") },
  { id: "health", label: B("Health", "卫生") },
  { id: "building", label: B("Building", "建筑") },
  { id: "staff", label: B("Staff certificates", "员工证书") },
  { id: "renewals", label: B("Renewals", "续期") },
  { id: "other", label: B("Other", "其他") },
];

/** What a cell says, worst first: a permit or certificate past its date, a document still missing, one expiring in
 *  60 days or less, work not filed yet, filed with Placetta's team, with the agency, approved. "none": not on this
 *  store's list. */
export type CellStatus = "lapsed" | "missing" | "expiring" | "todo" | "filed" | "review" | "approved" | "none";
export const RANK: Record<CellStatus, number> = { lapsed: 0, missing: 1, expiring: 2, todo: 3, filed: 4, review: 5, approved: 6, none: 7 };
export const STATUS_WORDS: Record<Exclude<CellStatus, "none">, Bi> = {
  approved: B("Approved", "已批准"), review: B("In review", "审核中"), filed: B("Filed", "已提交"), todo: B("To do", "待办"),
  missing: B("Missing document", "缺少文件"), expiring: B("Expiring", "即将到期"), lapsed: B("Lapsed", "已过期"),
};
/** "Expiring in 19 days", "Lapsed 3 days ago": the status as a cell says it. */
export function statusSay(s: CellStatus, days: number | undefined, lang: "en" | "zh"): string {
  if (s === "none") return lang === "zh" ? "未列入" : "Not listed";
  if (s === "expiring" && days !== undefined) return lang === "zh" ? (days <= 0 ? "今天到期" : `${days} 天后到期`) : days <= 0 ? "Expires today" : days === 1 ? "Expiring tomorrow" : `Expiring in ${days} days`;
  if (s === "lapsed" && days !== undefined && days < 0) return lang === "zh" ? `已过期 ${-days} 天` : `Lapsed ${-days} day${days === -1 ? "" : "s"} ago`;
  return STATUS_WORDS[s][lang];
}
const SOON = 60;

/** One thing on a store's list: an application (it has a drawer), a permit already on file, or a staff certificate
 *  (by its kind, never whose it is). */
export type ReviewItem = {
  kind: "app" | "permit" | "cert";
  id: string;
  name: Bi;
  official?: string;
  level?: Level;
  status?: Status;
  /** an application still waiting on a document */
  missing?: boolean;
  /** the next date on an application: when it's due, a decision expected, a reminder */
  due?: string | null;
  /** when it renews or expires */
  expires?: string | null;
  /** open comments (in Headquarters: open comments shared with it) */
  comments?: number;
  assignee?: string | null;
};
export type ReviewStore = {
  /** unique across franchisees: "<workspace>:<store>" in Headquarters, the store id in a workspace */
  key: string;
  id: string;
  name: Bi;
  stage: "open" | "opening" | "business";
  address: string;
  region: string;
  opens?: string | null;
  franchisee?: string;
  workspaceId?: string;
  items: ReviewItem[];
};
export type ReviewColumn = { key: string; group: GroupId; label: Bi };
export type ReviewCell = { status: CellStatus; days?: number; next?: { date: string; kind: "due" | "expires" } | null; items: ReviewItem[]; app?: string; comments: number; assignees: string[] };
export type ReviewRow = { store: ReviewStore; cells: Record<string, ReviewCell>; worst: CellStatus; next: string | null };
export type ReviewGrid = { columns: ReviewColumn[]; rows: ReviewRow[] };

/* ---------------------------- which column a requirement belongs to ---------------------------- */

type ColDef = ReviewColumn & { match: RegExp };
/* Matched in this order (the more specific first) against the form id, the English name and the agency. */
const COLS: ColDef[] = [
  { key: "manager", group: "staff", label: B("Food manager certificate", "食品经理证书"), match: /food protection|food (safety )?manager|certified food|food safety certificate|sanitation certificate|allergen|\bfpc\b/i },
  { key: "handlers", group: "staff", label: B("Food handler cards", "食品从业人员卡"), match: /food handler|food worker|handler card/i },
  { key: "plan", group: "health", label: B("Health plan check", "卫生图纸审查"), match: /plan check|plan review/i },
  { key: "occupancy", group: "building", label: B("Certificate of occupancy", "使用许可证"), match: /certificate of occupancy|certificate of use|zoning/i },
  { key: "building", group: "building", label: B("Building permit", "建筑许可"), match: /building (permit|final)|tenant (improvement|finish)|ladbs|dbi-building/i },
  { key: "fire", group: "building", label: B("Fire permits", "消防许可"), match: /\bfire\b|kitchen hood|hazardous materials (storage|business)|hazmat|high-piled|place of assembly|cupa/i },
  { key: "sign", group: "building", label: B("Sign permit", "招牌许可"), match: /\bsigns?\b|signage|awning/i },
  { key: "health", group: "health", label: B("Health permit", "卫生许可"), match: /health permit|permit to operate|food service establishment|food establishment (permit|license|health)|food (service|dealer|enterprise|services business|preparation|service business) (permit|license)|retail food|pre-opening health|food facility (health|registration)|fda-ffr/i },
  { key: "ein", group: "formation", label: B("EIN", "EIN"), match: /\bein\b|employer identification|irs-ss4|\bitin\b|irs-w7/i },
  { key: "entity", group: "formation", label: B("Business entity", "企业实体"), match: /articles of organization|certificate of formation|llc formation|foreign llc|statement of information|llc publication|\bdos-1336\b|\bllc-1\b|\bllc-5\b|tx-205|tx-304|az-llc/i },
  { key: "dba", group: "formation", label: B("Business name (DBA)", "经营名称（DBA）"), match: /assumed name|\bdba\b|fictitious business|business certificate/i },
  { key: "owners", group: "formation", label: B("Ownership reports", "所有权申报"), match: /beneficial ownership|boir|irs-5472|foreign-owned/i },
  { key: "annual", group: "tax", label: B("Annual state tax", "州年度税"), match: /annual tax|franchise tax|ftb-3522/i },
  { key: "sales", group: "tax", label: B("Sales tax", "销售税"), match: /seller'?s permit|sales (and use )?tax|sales tax vendor|certificate of authority|\btpt\b|transaction privilege|cdtfa|dtf-17|ap201/i },
  { key: "payroll", group: "tax", label: B("Payroll tax", "工资税"), match: /payroll|employer (registration|account)|commercial employers|unemployment|withholding|edd-de1|dol-100|tx-twc|nv-esd|il-ides|va-vec|dc-does/i },
  { key: "local", group: "tax", label: B("Local business tax", "地方营业税"), match: /business tax|business license|business registration|tax receipt|btrc|bpol|commercial activity license|business operations tax|commercial rent tax|tax account|tax registration|common victualler/i },
];
export const RENEWALS: ReviewColumn = { key: "renewals", group: "renewals", label: B("Next renewal", "下一项续期") };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";

/** The column a requirement goes in: a known kind of permit, or its own column under Other. */
export function columnOf(it: Pick<ReviewItem, "official" | "name">, agency = ""): ReviewColumn {
  const text = `${it.official ?? ""} ${it.name.en} ${agency}`;
  const c = COLS.find(x => x.match.test(text));
  return c ? { key: c.key, group: c.group, label: c.label } : { key: "x-" + slug(it.name.en), group: "other", label: it.name };
}

/* ---------------------------- a cell's state ---------------------------- */

const DAY = 864e5;
const daysBetween = (today: string, d: string) => Math.round((Date.parse(d.slice(0, 10) + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / DAY);
/** Anything this far off (or "never", as a sales tax certificate is kept) shows no date. */
const FOREVER = 3650;

/** One item's state on the day. */
export function itemStatus(it: ReviewItem, today: string): { status: CellStatus; days?: number; next?: ReviewCell["next"] } {
  const exp = it.expires && daysBetween(today, it.expires) < FOREVER ? it.expires : null;
  const until = exp ? daysBetween(today, exp) : undefined;
  if (it.kind !== "app") {
    if (until === undefined) return { status: "approved" };
    return { status: until < 0 ? "lapsed" : until <= SOON ? "expiring" : "approved", days: until, next: { date: exp!, kind: "expires" } };
  }
  const due = it.due ? { date: it.due, kind: "due" as const } : null;
  switch (it.status) {
    case "approved":
      if (until !== undefined && until < 0) return { status: "lapsed", days: until, next: { date: exp!, kind: "expires" } };
      if (until !== undefined && until <= SOON) return { status: "expiring", days: until, next: { date: exp!, kind: "expires" } };
      return { status: "approved", next: exp ? { date: exp, kind: "expires" } : null };
    case "review": return { status: "review", next: due };
    case "filing": return { status: "filed", next: due };
    case "needs": return { status: "missing", next: due };
    default: return { status: it.missing ? "missing" : "todo", next: due };
  }
}

/** A cell from its items: the worst status, the soonest date, the application to open (the most urgent one). */
export function cellOf(items: ReviewItem[], today: string): ReviewCell {
  if (!items.length) return { status: "none", items, comments: 0, assignees: [] };
  const st = items.map(i => ({ i, ...itemStatus(i, today) })).sort((a, b) => RANK[a.status] - RANK[b.status] || (a.days ?? 1e9) - (b.days ?? 1e9));
  const worst = st[0];
  const dated = st.map(x => x.next).filter((x): x is NonNullable<ReviewCell["next"]> => !!x).sort((a, b) => a.date.localeCompare(b.date));
  const app = st.find(x => x.i.kind === "app")?.i.id;
  return {
    status: worst.status, days: worst.status === "expiring" || worst.status === "lapsed" ? worst.days : undefined, next: dated[0] ?? null, items, app,
    comments: items.reduce((n, i) => n + (i.comments ?? 0), 0),
    assignees: [...new Set(items.map(i => i.assignee).filter((x): x is string => !!x))],
  };
}

/* ---------------------------- stores, from either side ---------------------------- */

/** "NY" from "Main St, Flushing, NY 11354"; the city when there's no state. */
export function regionOf(address: string): string {
  const m = /,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/.exec(address);
  if (m) return m[1];
  const parts = address.split(",").map(s => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** The stores of one workspace with every requirement on their lists. An application belongs to the store that lists
 *  it, or to the only store; with two or more stores, what no store lists is the whole business's own row. */
export function storesOfWorkspace(w: Workspace, o: { comments?: (appId: string) => number; assignee?: (appId: string) => string | null | undefined } = {}): ReviewStore[] {
  const stores = w.stores ?? [];
  const nextDue = (id: string, approved: boolean) => w.deadlines.filter(d => d.app === id && d.kind !== "renewal" && !(d.kind === "due" && approved)).map(d => d.date).sort()[0] ?? null;
  const renews = (id: string) => w.deadlines.filter(d => d.app === id && d.kind === "renewal").map(d => d.date).sort()[0] ?? null;
  const appItem = (id: string): ReviewItem | null => {
    const a = w.apps.find(x => x.id === id);
    if (!a) return null;
    return { kind: "app", id: a.id, name: a.name, official: a.official, level: a.level, status: a.status, missing: a.checklist.some(c => c.state === "missing" && !c.dep),
      due: nextDue(a.id, a.status === "approved"), expires: renews(a.id), comments: o.comments?.(a.id) ?? 0, assignee: o.assignee?.(a.id) ?? null };
  };
  const listed = new Set(stores.flatMap(s => s.apps ?? []));
  const out: ReviewStore[] = stores.map(s => {
    const apps = (stores.length === 1 ? w.apps.map(a => a.id) : s.apps ?? []).map(appItem).filter((x): x is ReviewItem => !!x);
    const permits: ReviewItem[] = (s.permits ?? []).map((p, k) => ({ kind: "permit", id: `${s.id}:permit:${k}`, name: p.name, expires: p.expires }));
    const certs: ReviewItem[] = s.certs.map(c => ({ kind: "cert", id: `${s.id}:cert:${c.id}`, name: c.kind, expires: c.expires }));
    return { key: s.id, id: s.id, name: s.name, stage: s.stage, address: s.address, region: regionOf(s.address), opens: s.stage === "opening" ? s.projectedOpen ?? s.plannedOpen ?? null : null, items: [...apps, ...permits, ...certs] };
  });
  const loose = stores.length >= 2 ? w.apps.filter(a => !listed.has(a.id)).map(a => appItem(a.id)!).filter(Boolean) : [];
  if (loose.length) out.push({ key: "_business", id: "_business", name: B("Whole business", "整个企业"), stage: "business", address: "", region: "", items: loose });
  return out;
}

/** What hq_review() returns for one franchisee. */
export type HqReviewStore = {
  id: string; name: Bi; stage: "open" | "opening" | "business"; address: string; planned_open: string | null; projected_open: string | null; opened: string | null;
  apps: { id: string; name: Bi; level: Level | null; official: string | null; status: Status; missing: boolean; due: string | null; renews: string | null; comments: number }[];
  permits: { name: Bi; expires: string | null }[];
  certs: { kind: Bi; expires: string | null }[];
};
export type HqReviewRow = Omit<HqRow, "stores"> & { stores: HqReviewStore[] };

/** Every store of every franchisee that shared with this headquarters. */
export function storesOfHq(rows: HqReviewRow[]): ReviewStore[] {
  return rows.flatMap(r => (Array.isArray(r.stores) ? r.stores : []).map((s): ReviewStore => ({
    key: `${r.workspace_id}:${s.id}`, id: s.id, name: s.name, stage: s.stage, address: s.address ?? "", region: regionOf(s.address ?? ""),
    opens: s.stage === "opening" ? s.projected_open ?? s.planned_open : null, franchisee: r.name, workspaceId: r.workspace_id,
    items: [
      ...(s.apps ?? []).map((a): ReviewItem => ({ kind: "app", id: a.id, name: a.name, official: a.official ?? undefined, level: a.level ?? undefined, status: a.status, missing: a.missing, due: a.due, expires: a.renews, comments: a.comments })),
      ...(s.permits ?? []).map((p, k): ReviewItem => ({ kind: "permit", id: `${s.id}:permit:${k}`, name: p.name, expires: p.expires })),
      ...(s.certs ?? []).map((c, k): ReviewItem => ({ kind: "cert", id: `${s.id}:cert:${k}`, name: c.kind, expires: c.expires })),
    ],
  })));
}

/* ---------------------------- the grid ---------------------------- */

const GROUP_ORDER = GROUPS.map(g => g.id);
/** The order the columns read in, left to right: the order a business usually gets them. */
const DISPLAY = ["entity", "ein", "dba", "owners", "sales", "payroll", "local", "annual", "plan", "health", "occupancy", "building", "sign", "fire", "manager", "handlers", RENEWALS.key];
const colRank = (c: ReviewColumn) => GROUP_ORDER.indexOf(c.group) * 100 + (DISPLAY.includes(c.key) ? DISPLAY.indexOf(c.key) : 99);

/** Stores as rows, the requirements any of them has as columns (grouped and in a fixed order), and the renewals column. */
export function buildGrid(stores: ReviewStore[], today: string): ReviewGrid {
  const cols = new Map<string, ReviewColumn>();
  const placed = stores.map(s => {
    const by = new Map<string, ReviewItem[]>();
    for (const it of s.items) {
      const c = columnOf(it);
      cols.set(c.key, cols.get(c.key) ?? c);
      by.set(c.key, [...(by.get(c.key) ?? []), it]);
    }
    // everything with an expiry or a renewal date, in one column: the soonest is what needs doing next
    const renewing = s.items.filter(it => it.expires && daysBetween(today, it.expires) < FOREVER);
    by.set(RENEWALS.key, renewing.map(it => (it.kind === "app" ? { ...it, status: "approved" as const, kind: "permit" as const } : it)));
    return { s, by };
  });
  const columns = [...cols.values(), RENEWALS].sort((a, b) => colRank(a) - colRank(b) || a.label.en.localeCompare(b.label.en));
  const rows = placed.map(({ s, by }): ReviewRow => {
    const cells: Record<string, ReviewCell> = {};
    for (const c of columns) cells[c.key] = cellOf(by.get(c.key) ?? [], today);
    // the renewals cell opens its application only when the soonest renewal is one
    const r = cells[RENEWALS.key];
    if (r.items.length) { const soon = [...r.items].sort((a, b) => (a.expires ?? "").localeCompare(b.expires ?? ""))[0]; r.app = s.items.find(i => i.kind === "app" && i.id === soon.id)?.id; }
    const live = Object.values(cells).filter(c => c.status !== "none");
    const worst = live.reduce<CellStatus>((w, c) => (RANK[c.status] < RANK[w] ? c.status : w), "none");
    const next = live.map(c => c.next?.date).filter((d): d is string => !!d).sort()[0] ?? null;
    return { store: s, cells, worst, next };
  });
  return { columns, rows };
}

export type ReviewFilter = { store?: string; status?: CellStatus | "all"; region?: string; stage?: "all" | "open" | "opening"; mine?: string | null };
export type ReviewSort = "risk" | "next" | "name" | "opening";

/** The grid as filtered: rows with at least one matching cell, columns with at least one, and which cells match. */
export function filterGrid(g: ReviewGrid, f: ReviewFilter): ReviewGrid & { match: (row: ReviewRow, col: string) => boolean } {
  const status = f.status && f.status !== "all" ? f.status : null;
  const match = (row: ReviewRow, col: string) => {
    const c = row.cells[col];
    if (!c || c.status === "none") return false;
    if (status && c.status !== status) return false;
    if (f.mine && !c.assignees.includes(f.mine)) return false;
    return true;
  };
  const narrowed = !!status || !!f.mine;
  const rows = g.rows.filter(r => (!f.store || f.store === "all" || r.store.key === f.store)
    && (!f.region || f.region === "all" || r.store.region === f.region)
    && (!f.stage || f.stage === "all" || r.store.stage === f.stage)
    && (!narrowed || g.columns.some(c => match(r, c.key))));
  const columns = narrowed ? g.columns.filter(c => rows.some(r => match(r, c.key))) : g.columns;
  return { columns, rows, match };
}

export function sortRows(rows: ReviewRow[], by: ReviewSort, lang: "en" | "zh" = "en"): ReviewRow[] {
  const name = (r: ReviewRow) => `${r.store.franchisee ?? ""} ${r.store.name[lang]}`;
  // the whole business's own row stays last
  const biz = (r: ReviewRow) => Number(r.store.stage === "business");
  const cmp = {
    risk: (a: ReviewRow, b: ReviewRow) => RANK[a.worst] - RANK[b.worst] || (a.next ?? "9999").localeCompare(b.next ?? "9999"),
    next: (a: ReviewRow, b: ReviewRow) => (a.next ?? "9999").localeCompare(b.next ?? "9999"),
    name: (a: ReviewRow, b: ReviewRow) => name(a).localeCompare(name(b), lang === "zh" ? "zh-CN" : "en"),
    opening: (a: ReviewRow, b: ReviewRow) => (a.store.opens ?? "9999").localeCompare(b.store.opens ?? "9999"),
  }[by];
  return [...rows].sort((a, b) => biz(a) - biz(b) || cmp(a, b) || name(a).localeCompare(name(b)));
}

/** Counts per status across the grid's cells, for the filter. */
export function statusCounts(g: ReviewGrid): Record<CellStatus, number> {
  const out = { lapsed: 0, missing: 0, expiring: 0, todo: 0, filed: 0, review: 0, approved: 0, none: 0 } as Record<CellStatus, number>;
  for (const r of g.rows) for (const c of g.columns) out[r.cells[c.key].status]++;
  return out;
}

/* ---------------------------- export ---------------------------- */

/* A franchisee names its own stores, and headquarters opens the file in a spreadsheet: anything that would start a
   formula there (=, +, -, @) is written as text. */
const q = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
/** The grid as a CSV: one line per store, one column per requirement with its status and next date. */
export function gridCsv(g: ReviewGrid, lang: "en" | "zh", o: { hq?: boolean } = {}): string {
  const zh = lang === "zh";
  const stage = (r: ReviewRow) => r.store.stage === "open" ? (zh ? "已开业" : "Open") : r.store.stage === "opening" ? (zh ? "筹备中" : "Opening") : (zh ? "整个企业" : "Whole business");
  const head = [...(o.hq ? [zh ? "加盟商" : "Franchisee"] : []), zh ? "门店" : "Store", zh ? "阶段" : "Stage", zh ? "地址" : "Address",
    ...g.columns.map(c => `${GROUPS.find(x => x.id === c.group)!.label[lang]}: ${c.label[lang]}`)];
  const lines = g.rows.map(r => [...(o.hq ? [r.store.franchisee ?? ""] : []), r.store.name[lang], stage(r), r.store.address,
    ...g.columns.map(c => {
      const cell = r.cells[c.key];
      if (cell.status === "none") return "";
      const when = cell.next ? `${cell.next.kind === "due" ? (zh ? "截止" : "due") : (zh ? "到期" : "expires")} ${cell.next.date}` : "";
      return statusSay(cell.status, cell.days, lang) + (when ? (zh ? `（${when}）` : ` (${when})`) : "");
    })]);
  return "﻿" + [head, ...lines].map(l => l.map(q).join(",")).join("\r\n");
}

/* ---------------------------- "Ask Odelia to prepare" ---------------------------- */

/** Applications picked in the table that still need preparing (not issued, not with the team or the agency), by store. */
export function toPrepare(grid: ReviewGrid, picked: { row: string; col: string }[]): { store: ReviewStore; apps: ReviewItem[] }[] {
  const by = new Map<string, { store: ReviewStore; apps: ReviewItem[] }>();
  for (const p of picked) {
    const row = grid.rows.find(r => r.store.key === p.row);
    const cell = row?.cells[p.col];
    if (!row || !cell) continue;
    for (const it of cell.items) {
      if (it.kind !== "app" || it.status === "approved" || it.status === "filing" || it.status === "review") continue;
      const g = by.get(row.store.key) ?? { store: row.store, apps: [] };
      if (!g.apps.some(a => a.id === it.id)) g.apps.push(it);
      by.set(row.store.key, g);
    }
  }
  return [...by.values()];
}

/** The request for Odelia: one job per store through split_job when two or more stores are picked, the store's own
 *  job when one is, and the whole business's registrations done by her directly. */
export function preparePrompt(groups: { store: ReviewStore; apps: ReviewItem[] }[], lang: "en" | "zh"): string {
  const stores = groups.filter(g => g.store.stage !== "business"), biz = groups.find(g => g.store.stage === "business");
  const list = (g: { store: ReviewStore; apps: ReviewItem[] }) => g.apps.map(a => `${a.name[lang]} (${a.id})`).join(lang === "zh" ? "、" : ", ");
  const each = lang === "zh"
    ? "每一项：用企业资料、记忆和文件填好能填的每一栏，说明还缺什么，完整的就提交给我批准。"
    : "For each one: fill every line you can from the business facts, memory and documents, say what's still missing, and put the complete ones up for my approval.";
  const lines = stores.map(g => lang === "zh" ? `- ${g.store.name.zh}（store ${g.store.id}）：${list(g)}` : `- ${g.store.name.en} (store ${g.store.id}): ${list(g)}`);
  if (biz) lines.push(lang === "zh" ? `- 整个企业：${list(biz)}` : `- The whole business: ${list(biz)}`);
  const ids = stores.map(g => g.store.id), apps = stores.flatMap(g => g.apps.map(a => a.id));
  if (stores.length >= 2) return lang === "zh"
    ? `准备这些申请，每家门店一项工作：用 split_job，store_ids 为 [${ids.join(", ")}]，application_ids 为 [${apps.join(", ")}]，让每家门店的助手处理自己的申请。${biz ? "整个企业的那几项由你自己完成。" : ""}${each}\n${lines.join("\n")}`
    : `Prepare these applications, one job per store: use split_job with store_ids [${ids.join(", ")}] and application_ids [${apps.join(", ")}] so each store's bot works its own.${biz ? " Do the whole business's ones yourself." : ""} ${each}\n${lines.join("\n")}`;
  const one = stores[0] ?? biz!;
  return lang === "zh"
    ? `准备这些申请${one.store.stage === "business" ? "（整个企业）" : `，${one.store.name.zh}（store ${one.store.id}）`}。${each}\n${lines.join("\n")}`
    : `Prepare these applications${one.store.stage === "business" ? " for the whole business" : ` for ${one.store.name.en} (store ${one.store.id})`}. ${each}\n${lines.join("\n")}`;
}
