import { B, type Bi, type Store, type Workspace, type LogKind } from "./model";
import { daysUntil, inDays } from "./time";

/* Inspection readiness, every day: a score per store from what an inspector would look at, and the three
   numbers that show the value: opened on time, stayed open, no fines. */

export const LOG_KINDS: { kind: LogKind; label: Bi; hint: Bi }[] = [
  { kind: "temps", label: B("Fridge and freezer temperatures", "冰箱和冷冻柜温度"), hint: B("Cold holding at 41°F or below", "冷藏保持在 41°F 以下") },
  { kind: "cleaning", label: B("Cleaning and sanitizing", "清洁与消毒"), hint: B("Surfaces, equipment, sanitizer strength", "台面、设备、消毒液浓度") },
  { kind: "pest", label: B("Pest check", "虫害检查"), hint: B("No signs; service log current", "无迹象，防治记录最新") },
];

/** NYC Fair Workweek covers fast-food chains with 30 or more establishments nationally. */
export const FWW_THRESHOLD = 30;
export const FWW_SOURCE = "https://www.nyc.gov/site/dca/workers/workersrights/fast-food-workers.page";
export const GRADES_SOURCE = "https://www.nyc.gov/site/doh/services/restaurant-grades.page";

export type Part = { key: "permits" | "logs" | "certs" | "schedule" | "mock" | "apps"; label: Bi; got: number; max: number; note: Bi };
export type Readiness = { score: number; band: "ready" | "gaps" | "risk" | "progress"; label: Bi; parts: Part[] };

const certScore = (expires: string) => { const d = daysUntil(expires); return d < 0 ? 0 : d <= 30 ? 0.5 : 1; };

export function readiness(s: Store, w: Workspace): Readiness {
  if (s.stage === "opening") {
    const apps = w.apps.filter(a => s.apps?.includes(a.id));
    const weight = { approved: 1, review: 0.75, filing: 0.65, ready: 0.5, needs: 0.25, draft: 0.25, waiting: 0, todo: 0 } as const;
    const got = apps.reduce((t, a) => t + weight[a.status], 0);
    const score = apps.length ? Math.round((100 * got) / apps.length) : 0;
    const done = apps.filter(a => a.status === "approved").length;
    // a store just added has nothing mapped yet: say that, not "0, ready to open"
    if (!apps.length) return { score: 0, band: "progress", label: B("Permits not mapped yet", "尚未梳理许可"),
      parts: [{ key: "apps", label: B("Licenses and permits", "执照与许可"), got: 0, max: 1, note: B("Ask Odelia to map this store's permits", "请 Odelia 梳理该门店的许可") }] };
    return {
      score, band: score >= 90 ? "ready" : "progress", label: B("Ready to open", "开业就绪度"),
      parts: [{ key: "apps", label: B("Licenses and permits", "执照与许可"), got, max: apps.length || 1, note: B(`${done} of ${apps.length} approved`, `已批准 ${done}/${apps.length}`) }],
    };
  }
  const parts: Part[] = [];
  const permits = s.permits ?? [];
  const pOk = permits.length ? permits.reduce((t, p) => t + certScore(p.expires), 0) / permits.length : 1;
  const soon = permits.filter(p => { const d = daysUntil(p.expires); return d >= 0 && d <= 45; }).length;
  parts.push({ key: "permits", label: B("Permits", "许可证"), got: 35 * pOk, max: 35, note: soon ? B(`${soon} renewing soon`, `${soon} 项即将续期`) : B("All current", "全部有效") });

  const week = Array.from({ length: 7 }, (_, i) => inDays(-7 + i));
  const expected = week.length * 3;
  const done = s.logs.filter(l => week.includes(l.date) && l.done).length;
  parts.push({ key: "logs", label: B("Daily logs, last 7 days", "近 7 天每日记录"), got: (25 * done) / expected, max: 25, note: B(`${done} of ${expected} done`, `完成 ${done}/${expected}`) });

  const certs = s.certs.length ? s.certs.reduce((t, c) => t + certScore(c.expires), 0) / s.certs.length : 0;
  const expiring = s.certs.filter(c => { const d = daysUntil(c.expires); return d >= 0 && d <= 30; }).length;
  parts.push({ key: "certs", label: B("Staff certificates", "员工证书"), got: 20 * certs, max: 20, note: expiring ? B(`${expiring} expiring within 30 days`, `${expiring} 张 30 天内到期`) : B("All valid", "全部有效") });

  const covered = s.rules.includes("nyc_fww") && usLocations(w) >= FWW_THRESHOLD;
  if (s.schedule) {
    const ahead = daysUntil(s.schedule.postedThrough);
    const ok = ahead >= 14;
    parts.push({ key: "schedule", label: B("Schedules 14 days ahead", "提前 14 天排班"), got: covered ? (ok ? 10 : (10 * Math.max(0, ahead)) / 14) : 10, max: 10,
      note: covered ? (ok ? B(`Posted through ${s.schedule.postedThrough}`, `已排至 ${s.schedule.postedThrough}`) : B(`Only ${Math.max(0, ahead)} days posted`, `仅排了 ${Math.max(0, ahead)} 天`)) : B(`Required from ${FWW_THRESHOLD} US locations`, `美国门店达 ${FWW_THRESHOLD} 家起适用`) });
  }
  if (s.mock) {
    const ok = s.mock.checks.filter(c => c.ok).length;
    parts.push({ key: "mock", label: B("Mock inspection", "模拟检查"), got: (10 * ok) / s.mock.checks.length, max: 10, note: B(`${ok} of ${s.mock.checks.length} passed`, `通过 ${ok}/${s.mock.checks.length}`) });
  }
  const max = parts.reduce((t, p) => t + p.max, 0);
  const score = Math.round((100 * parts.reduce((t, p) => t + p.got, 0)) / max);
  return { score, band: score >= 90 ? "ready" : score >= 75 ? "gaps" : "risk", label: B("Inspection ready", "迎检就绪度"), parts };
}

/** US locations the brand runs: its stores here, open or opening. */
export const usLocations = (w: Workspace) => (w.stores ?? []).length;

/** The three numbers that show what Placetta is worth for a store. */
export function valueOf(s: Store): { onTime: Bi; open: Bi; fines: Bi; good: [boolean, boolean, boolean] } {
  const planned = s.plannedOpen, actual = s.opened ?? s.projectedOpen;
  let onTime = B("No opening date yet", "尚无开业日期"), onTimeGood = true;
  if (planned && actual) {
    const late = Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 86_400_000);
    onTimeGood = late <= 0;
    onTime = s.stage === "open"
      ? late <= 0 ? (late < 0 ? B(`Opened ${-late} days early`, `提前 ${-late} 天开业`) : B("Opened on schedule", "按期开业")) : B(`Opened ${late} days late`, `晚 ${late} 天开业`)
      : late <= 0 ? (late < 0 ? B(`On track, ${-late} days early`, `进度正常，预计提前 ${-late} 天`) : B("On track", "进度正常")) : B(`${late} days behind plan`, `比计划晚 ${late} 天`);
  }
  const g = s.grade?.letter;
  const openGood = s.value.closures === 0 && (s.stage === "opening" || g === "A");
  const open = s.stage === "opening" ? B("Not open yet", "尚未开业")
    : B(`${g === "P" ? "Grade pending" : g ? `${g} grade` : "No grade yet"}, ${s.value.closures ? `${s.value.closures} closure${s.value.closures > 1 ? "s" : ""}` : "no closures"}`,
        `${g === "P" ? "评级待定" : g ? `${g} 级` : "暂无评级"}，${s.value.closures ? `停业 ${s.value.closures} 次` : "零停业"}`);
  const fines = s.value.fines
    ? B(`${s.value.fines} fine${s.value.fines > 1 ? "s" : ""}`, `罚款 ${s.value.fines} 次`)
    : B(`No fines. ${s.value.caught} problem${s.value.caught === 1 ? "" : "s"} caught early`, `零罚款，提前发现 ${s.value.caught} 个问题`);
  return { onTime, open, fines, good: [onTimeGood, openGood, s.value.fines === 0] };
}

export const todayLogs = (s: Store) => LOG_KINDS.map(k => ({ ...k, log: s.logs.find(l => l.date === inDays(0) && l.kind === k.kind) }));
