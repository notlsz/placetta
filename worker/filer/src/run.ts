// The portal worker: claims a queued portal filing, replays the portal's skill or lets Claude drive, enforces the
// guards, hands back to the person for CAPTCHAs, ID checks, payments and SSNs, and never submits twice.
//
// Isolation between runs (and so between customers): every run opens its own browser session (open(): a new Chromium
// process with a new, empty browser context, or a new Browserbase session) and gets its own temporary folder for the
// files it uploads. The session must start empty (no cookies, one blank page) or the run is refused before it visits
// anything. When the run ends, however it ends, the browser is closed and the folder deleted. Up to FILER_CONCURRENCY
// runs go side by side in one worker container (main.ts), never two for one workspace on one portal: this is per-run
// browser and file isolation inside that container, not a separate virtual machine per run.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { confirmPattern, fieldFor, isFinal, mustStop, onPortal, optionFor, reviewMismatch, stopLinesFilled, type PageState } from "./guards.ts";
import type { Model } from "./model.ts";
import { captchaAnswered, headingOf, locate, pageState } from "./page.ts";
import { finalOn, type FormSteps, guideLines, navOn, pageOutline, payOn, type Playbook } from "./playbooks.ts";
import { backoffMinutes, heal, type KeyLock, portalDown, receiptCheck, receiptLine } from "./heal.ts";
import type { Store, Taught } from "./store.ts";
import { harden, linkAllowed, safeConfirm, wipe, withTimeout, type Blocked } from "./sandbox.ts";
import { scoreText } from "../../../supabase/functions/_shared/injection.ts";
import { checkValue, confirmationIn, customerData, draftProblems, factKey, factsOf, fileFor, fillFacts, generalize, type Labeler, type RawEvent, record } from "./teach.ts";
import { startRecorder } from "./recorder.ts";
import { blockedPage } from "./env.ts";
import type { LiveViews } from "./live.ts";
import type { Act, Filing, Login, Result, Skill, TraceStep } from "./types.ts";

export type Session = { browser: Browser; page: Page; liveUrl: string | null; close(): Promise<void> };
/** The destination's details the worker needs beyond its host: the agency's path on a host many agencies share (so
    its own saved login is used), the other hosts the portal sends the browser to, and the page to start from. */
export type Route = { tenant?: string; alsoOn?: string[]; start?: string };
export type Config = {
  store: Store; model: Model;
  /** A new, empty browser session for a run on this host (main.ts: local Chromium, or Browserbase for the hosts that
   *  refuse a cloud server's address). */
  open(host?: string): Promise<Session>;
  /** The worker's own live browser for hand-backs on a session with no hosted view (live.ts). */
  live?: LiveViews;
  portalOf(official: string): string | null;          // the server-side destination host
  routeOf?(official: string): Route | null;           // from the same destination
  playbookOf?(host: string, official: string): { playbook: Playbook; form: FormSteps } | null;
  allowUnverified?: boolean;                          // FILER_ALLOW_UNVERIFIED=1: staff are watching a playbook's first run
  startUrl?(host: string): string;
  dryRun: boolean; twoKey: number; maxSteps: number; maxMs: number; holdMs: number; pollMs: number;
  beforeSubmitClick?(f: Filing): Promise<void>;        // tests: kill the run right after submit_clicked_at
  tmpRoot?: string;                                    // where each run's own folder is made (the system's temp folder)
  runMs?: number;                                      // the whole run's hard limit (default maxMs + holdMs + 5 minutes)
  lock?: KeyLock;                                      // shared by the worker's slots: one run per workspace and portal at a time
  /** Teach mode: names the recorded pages and maps unmapped fields (teach.ts Labeler); without it, labels are plain. */
  labeler?: Labeler;
  teachMs?: number;                                    // how long a person has to file while Odelia watches (default holdMs)
  teachSettleMs?: number;                              // after the confirmation shows, how long before the recording ends
  teachWithoutLive?: boolean;                          // tests: the person's browser is the test itself, not a live view
};

const TEACH = {
  en: "Show Odelia how: open the live browser and file it yourself, the way you always do. Odelia watches and writes down the steps (never your password or any secret number). When the agency shows its confirmation, she keeps it. Tap \"I've done it\" if you finish another way.",
  zh: "教 Odelia 一次：打开实时浏览器，像平时一样亲自提交。Odelia 在旁观看并记下步骤（从不记录您的密码或任何保密号码）。机构显示确认信息后，她会保存下来。如果您以其他方式完成，请点击“我已完成”。",
};
const ASSIST = {
  en: "Odelia filled every page from what you approved. These steps for this agency's site are new and the Placetta team hasn't checked them yet, so you press submit: open the live browser, check the page, press the agency's submit button, then tap \"I've done it\".",
  zh: "Odelia 已按您批准的内容填好每一页。这个机构网站的步骤是新学的，快哉团队尚未核对，所以由您来点提交：打开实时浏览器，检查页面，点击机构的提交按钮，然后点击“我已完成”。",
};
/** The filing asked for teach mode ("Show Odelia how", file function action teach) and hasn't been taught yet. */
export const teachRequested = (f: Filing) => [...f.agent_log].reverse().find((e) => e.kind === "teach" || e.kind === "taught")?.kind === "teach";
/** The registry's field ids for this form, when the payload carries them (the app builds it from the registry). */
const registryOf = (f: Filing) => { const ids = (f.payload.fields ?? []).map((x) => x.id).filter((x): x is string => !!x); return ids.length ? ids : undefined; };

const PAY = {
  en: "The agency is asking for its fee. Open the live view and pay it yourself, then tap \"I've done it\". Placetta never pays an agency.",
  zh: "机构要求支付费用。请打开实时画面自行支付后点击“我已完成”。快哉从不替您向机构付款。",
};

/** The agency's site refused the worker's server (env.ts blockedPage). The file function's sweep tries another way the
 *  agency takes before the team (logic.ts PORTAL_FAILED). */
const BLOCKED_MSG = {
  en: "The agency's site refused Placetta's server before anything was entered. Odelia tries another way the agency takes, or gives it to you to send.",
  zh: "机构网站在填写任何内容前拒绝了快哉的服务器。Odelia 会改用机构接受的其他方式，否则交由您自行提交。",
};
/** Hand-backs a person finishes on the page itself: once the page no longer needs them, Odelia carries on by herself. */
const SELF_CLEARING = new Set(["captcha", "code", "identity", "account", "secret_number", "payment"]);

const log = (en: string, zh: string, kind = "info", ref?: string) => ({ en, zh, kind, ...(ref ? { ref } : {}) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SECRET = /\b(ssn|social security|itin|e?in|fein|tax ?id|tin|account|routing|card|password)\b/i;
/** What the customer's live view shows for a value: numbers that identify a person or an account keep only their last four. */
export const shown = (label: string, value: string) => {
  if (!SECRET.test(label)) return value.slice(0, 200);
  const d = value.replace(/\D/g, "");
  return d.length >= 4 ? "•••" + d.slice(-4) : "••••";
};
const STOPPED: Result = { kind: "stopped", trace: [] };

/** A session another run (or anything else) has used is refused: a new run starts with no cookies and one blank page. */
export async function assertFresh(session: Session): Promise<void> {
  const ctx = session.page.context();
  const cookies = await ctx.cookies();
  const pages = ctx.pages().filter((p) => p !== session.page);
  const url = session.page.url();
  const onSite = /^https?:/i.test(url);
  if (cookies.length || pages.length || onSite) {
    throw new Error(`browser session isn't fresh (${cookies.length} cookies, ${pages.length} other pages${onSite ? ", already on a website" : ""})`);
  }
}
/** Why a page reads like instructions to an AI, or null: its visible text, labels and buttons, and what it hides. */
export function pageInjection(st: PageState): string | null {
  const seen = [st.title, ...st.headings, st.text, ...st.controls.map((c) => c.label), ...st.buttons.map((b) => b.text)].join("\n");
  const v = scoreText(seen);
  if (v.verdict !== "clean") return v.hits[0];
  const hidden = (st.hidden ?? []).join("\n");
  const h = hidden ? scoreText(hidden) : null;
  return h && h.score > 0 ? `hidden text: ${h.hits[0]}` : null;
}
const urlKey = (u: string) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };
export const portalKey = (host: string, official: string) => `portal:${host}:${official}`;

type Ctx = {
  f: Filing; host: string; hosts: string[]; login: Login | null; page: Page; session: Session; trace: TraceStep[]; t0: number; files: Map<string, string>;
  dir: string;                                         // this run's own folder, deleted when it ends
  pb: { playbook: Playbook; form: FormSteps } | null; seen?: string; pages?: number;
  drift?: string[];                                    // recorded selectors found again by their words this run
  taught?: Taught | null;                              // the portal's taught playbook this run follows
  assist?: boolean;                                    // its draft isn't reviewed: Odelia fills, a person presses submit
  replayFailed?: boolean;
  /** The hand-back the person just finished, and the page it was on (handBack, waived). */
  waive?: { reason: string; at: string };
};
/** The URL is on the portal or one of the other hosts its destination names. */
const onAny = (url: string, hosts: string[]) => hosts.some((h) => onPortal(url, h));
type Exec = { ok: true } | { ok: false; error: string } | { end: Result };

export class Worker {
  private c: Config;
  constructor(c: Config) { this.c = c; }

  /** Claim and run one filing. False when the queue was empty. */
  async once(): Promise<boolean> {
    const f = await this.c.store.claim();
    if (!f) return false;
    // two slots never run one workspace's filings on the same portal at once (one saved login, one session)
    const host = this.c.portalOf(f.payload.official ?? "") ?? "";
    await (this.c.lock ? this.c.lock.run(`${f.workspace_id}|${host}`, () => this.run(f)) : this.run(f));
    return true;
  }

  /** One filing, under the run's hard time limit: past it the browser is closed, whatever it was waiting on. */
  async run(f0: Filing): Promise<Result | null> {
    const track: { session?: Session; dir?: string } = {};
    const alive = { on: true };
    const limit = this.c.runMs ?? this.c.maxMs + this.c.holdMs + 5 * 60_000;
    try {
      // past the limit: storage wiped, browser closed, the run's folder gone and its token ended now, not when the
      // model or the page finally answers
      return await withTimeout(this.runInner(f0, track, alive), limit, async () => {
        alive.on = false;
        if (track.session) { await wipe(track.session.page).catch(() => undefined); await track.session.close().catch(() => undefined); }
        if (track.dir) await rm(track.dir, { recursive: true, force: true }).catch(() => undefined);
        await this.c.store.end?.().catch(() => undefined);
      });
    } catch (e) {
      await this.fail(f0, e);
      return null;
    }
  }

  private async runInner(f0: Filing, track: { session?: Session; dir?: string }, alive: { on: boolean } = { on: true }): Promise<Result | null> {
    const { store } = this.c;
    let f = f0;
    const official = f.payload.official ?? "";
    const host = this.c.portalOf(official);
    if (!host) { await this.finish(f, { kind: "handoff", reason: "no_portal", message: { en: "No approved portal for this form.", zh: "该表格没有经核准的网站。" }, trace: [] }); return null; }
    if (f.submit_clicked_at) {
      await this.finish(f, { kind: "handoff", reason: "maybe_submitted", task: "check_agency", trace: [],
        message: { en: "An earlier run may have submitted this, so nothing more is sent until it's checked with the agency.", zh: "之前的运行可能已提交，在向机构确认之前不会再提交。" } });
      return null;
    }
    // A playbook written from the agency's guide but never run on the live site waits for staff to watch its first run.
    const teaching = teachRequested(f);
    let pb = this.c.playbookOf?.(host, official) ?? null;
    // No playbook from a published guide: one taught on this portal by an earlier customer or the team, if any. A
    // reviewed one runs like any playbook; a draft runs only in assist mode, where a person presses submit.
    // A playbook from a guide that nobody has watched on the live site gives way to steps recorded there and reviewed by
    // the team: what someone actually did on the portal beats what its guide says.
    let taught: Taught | null = null;
    if ((!pb || !pb.playbook.verified) && !teaching) {
      taught = await store.taught?.(host, official).catch((e) => { console.error("filer: taught lookup", e instanceof Error ? e.message : e); return null; }) ?? null;
      const form = taught?.body?.playbook?.forms?.[official];
      if (taught && form && (!pb || taught.status === "approved")) pb = { playbook: { ...taught.body.playbook, verified: taught.status === "approved" ? { on: "reviewed", by: "the Placetta team", filing: "" } : null }, form };
      else taught = null;
    }
    if (pb && !pb.playbook.verified && !this.c.allowUnverified && !taught && !teaching) {
      await this.finish(f, { kind: "handoff", reason: "unverified_playbook", task: "first_run", trace: [],
        message: { en: `Placetta's steps for ${pb.playbook.name} come from the agency's published guide and haven't had their supervised first run, so Odelia doesn't use them on her own yet.`, zh: `快哉在${pb.playbook.name}上的操作步骤来自机构公布的指南，尚未经过有人监督的首次运行，Odelia 暂不独自使用。` } });
      return null;
    }
    const route = this.c.routeOf?.(official) ?? null;
    const hosts = [host, ...(route?.alsoOn ?? [])];
    let session: Session | null = null;
    // this run's own folder for what it uploads; nothing else writes there and it goes when the run ends
    const dir = await mkdtemp(join(this.c.tmpRoot ?? tmpdir(), `filer-${f.id.replace(/[^\w-]+/g, "").slice(0, 36)}-`));
    track.dir = dir;
    try {
      // the run's own token for this one filing (store.ts): every database call it makes carries it
      await store.begin?.(f);
      session = await this.c.open(host);
      track.session = session;
      await assertFresh(session);
      const page = session.page;
      // the sandbox (sandbox.ts): navigation only to the run's hosts, no file: or other schemes, no downloads, dialogs
      // dismissed, popups closed; each refusal goes in the filing's log
      const blocked: Blocked[] = [];
      await harden(page, hosts, (b) => { blocked.push(b); });
      const login = await store.login(f, host, route?.tenant);
      f = await store.step(f, log(`Opening ${host}`, `打开 ${host}`, "visit"), { provider_ref: null });
      if (pb && !teaching) f = await store.step(f, taught
        ? log(`Following the steps taught on ${host}${taught.status === "approved" ? ", reviewed by the Placetta team" : " (not yet reviewed: you press submit)"}`, `按在 ${host} 上学到的步骤操作${taught.status === "approved" ? "（已经快哉团队核对）" : "（尚未核对：由您点击提交）"}`, "playbook", JSON.stringify(pageOutline(pb.form)).slice(0, 800))
        : log(`Following the published guide for ${pb.playbook.name}${pb.playbook.verified ? "" : " (first run, watched by the Placetta team)"}`, `按${pb.playbook.name}公布的指南操作${pb.playbook.verified ? "" : "（首次运行，由快哉团队监督）"}`, "playbook", JSON.stringify(pageOutline(pb.form)).slice(0, 800)));
      // Teach mode: the recorder goes in before the first page, so every page of the portal has it.
      const events: RawEvent[] = [];
      if (teaching) await startRecorder(page, (e) => { events.push(e); });
      // The agency's own start page when the destination names one (on a host many agencies share, it's the agency's path).
      const start = pb?.form.start ?? route?.start;
      await page.goto(this.c.startUrl ? this.c.startUrl(host) : start && onAny(start, hosts) ? start : `https://${host}/`);
      // the agency's bot protection refused this server's address: nothing was typed; another route, or Browserbase
      const first = await pageState(page).catch(() => null);
      if (first && blockedPage(first)) {
        const res: Result = { kind: "handoff", reason: "portal_blocked", task: "handoff", trace: [], message: BLOCKED_MSG };
        await this.finish(f, res);
        return res;
      }
      const ctx: Ctx = { f, host, hosts, login, page, session, trace: [], t0: Date.now(), files: new Map(), pb, dir, taught, assist: !!taught && taught.status !== "approved" };
      const key = portalKey(host, f.payload.official!);
      if (teaching) {
        const res = await this.teach(ctx, events, page.url());
        await this.finish(ctx.f, res, ctx);
        return res;
      }
      // A taught playbook replays its own reviewed steps; the skills recorded from runs are for the guides' portals.
      const skill: Skill | null = taught
        ? { key, name: taught.body.name, enabled: true, uses: taught.runs, fails_in_a_row: 0, last_seconds: null, best_seconds: null, body: { version: taught.body.version, steps: taught.body.trace, ...(taught.body.playbook.confirm ? { confirm: { pattern: taught.body.playbook.confirm } } : {}) } }
        : await store.skill(key);
      let res: Result | null = null;
      if (skill?.enabled) {
        const r = await this.replay(ctx, skill);
        if ("end" in r) res = r.end;
        else if (!r.ok) {
          ctx.replayFailed = true;
          if (!taught) {
            const { disabled } = await store.skillFailed(key);
            if (disabled) await store.teamTask(ctx.f, "skill_broken", `Replay of ${key} failed 3 times in a row; it's switched off. Check the portal.`);
          }
        }
      }
      res ??= await this.drive(ctx, skill?.enabled ? "The recorded steps stopped matching this page; carry on from here." : undefined);
      for (const b of blocked.slice(0, 10)) ctx.f = await store.step(ctx.f, log(`Refused ${b.kind === "navigation" ? "to leave the agency's site" : b.kind === "scheme" ? "a local or script address" : b.kind === "download" ? "a download" : b.kind === "dialog" ? "a pop-up dialog" : "a new window"}`, `已拒绝${b.kind === "download" ? "下载" : b.kind === "dialog" ? "弹出对话框" : b.kind === "popup" ? "新窗口" : "离开机构网站或打开本地地址"}`, "refused", b.detail));
      await this.finish(ctx.f, res, ctx);
      // selector drift goes to the team once per run, whatever the run's end: the recorded skill needs a look
      if (ctx.drift?.length) await store.teamTask(ctx.f, "selector_drift", `${key}: ${ctx.drift.length} recorded step${ctx.drift.length === 1 ? "" : "s"} found again by their words; check the skill`, { key, drift: ctx.drift });
      if (taught) {
        // each run of a taught playbook counts for it or against it; drift goes to the Quality tab's nightly queue
        const failed = ctx.replayFailed || (res.kind === "handoff" && ["limit", "left_portal", "review_differs", "page_injection"].includes(res.reason));
        if (res.kind === "submitted" || failed) {
          const now = await store.taughtResult?.(taught.id, ctx.f, res.kind === "submitted", ctx.drift).catch(() => null);
          if (now === "draft" && taught.status === "approved") ctx.f = await store.step(ctx.f, log(`The taught steps for ${host} failed again and went back to the Placetta team for review`, `${host} 的已学步骤再次失败，已退回快哉团队核对`, "quiet"));
        }
      } else if (res.kind === "submitted") await this.learn(key, ctx.f, res, skill);
      return res;
    } catch (e) {
      if (alive.on) await this.fail(f, e);   // a run past its limit was already failed by run()
      return null;
    } finally {
      // storage wiped, then the browser closed, then the run's folder gone; the token stops working
      if (session) await wipe(session.page).catch(() => undefined);
      await session?.close().catch(() => undefined);
      await rm(dir, { recursive: true, force: true }).catch((e) => console.error("filer: couldn't delete the run's folder", e instanceof Error ? e.message : e));
      await store.end?.().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- one action, with every guard

  private async exec(ctx: Ctx, a: Act, valueOverride?: string): Promise<Exec> {
    const { page } = ctx;
    if (ctx.f.status === "canceled") return { end: { ...STOPPED, trace: ctx.trace } };
    const st = await pageState(page);
    await this.proof(ctx, st);
    const stop = mustStop(st);
    if (stop && !(await this.waived(ctx, stop, st))) return { end: await this.handBack(ctx, stop.reason, { en: stop.en, zh: stop.zh }) };
    const loc = locate(page, a.selector).first();
    if (!(await loc.count())) return { ok: false, error: `No element for ${a.selector}` };
    const p = ctx.f.payload;
    const rec = (x: Act) => ctx.trace.push({ ...x, url: urlKey(st.url), heading: headingOf(st), at: Date.now() });
    if (a.action === "fill") {
      if (a.login) {
        if (!ctx.login || !onAny(st.url, ctx.hosts)) return { ok: false, error: "No saved login for this site." };
        await loc.fill(a.login === "username" ? ctx.login.username : ctx.login.password);
        rec({ action: "fill", selector: a.selector, login: a.login });
        ctx.f = await this.c.store.step(ctx.f, log(`Entered the saved ${a.login}`, `已填写保存的${a.login === "username" ? "用户名" : "密码"}`, "quiet"));
        return { ok: true };
      }
      const value = valueOverride ?? "";
      const from = fieldFor(value, p);
      if (!from) {
        ctx.f = await this.c.store.step(ctx.f, log("Refused a value the customer didn't approve", "拒绝填写未经批准的内容", "refused"));
        return { ok: false, error: "Refused: that value isn't one of the approved values." };
      }
      await loc.fill(value);
      rec({ action: "fill", selector: a.selector, field: from.label });
      ctx.f = await this.c.store.step(ctx.f, { ...log(`Filled ${from.label}`, `已填写 ${from.label}`, "fill"), value: shown(from.label, value) });
      return { ok: true };
    }
    if (a.action === "select") {
      const opt = valueOverride ?? a.option ?? "";
      // a fixed choice from the portal's own list that a taught playbook names (the team reviews it with the steps)
      const fixed = !valueOverride && !!a.option && !!ctx.taught && !a.fact;
      const from = optionFor(opt, p) ?? (fixed ? { label: "the agency's fixed choice" } : null);
      if (!from) return { ok: false, error: "Refused: that option isn't one of the approved values." };
      const options = await loc.locator("option").allTextContents();
      const match = options.find((o) => o.trim().toLowerCase() === opt.trim().toLowerCase());
      if (!match) return { ok: false, error: "No such option." };
      await loc.selectOption({ label: match.trim() });
      rec({ action: "select", selector: a.selector, field: from.label });
      ctx.f = await this.c.store.step(ctx.f, { ...log(`Filled ${from.label}`, `已填写 ${from.label}`, "fill"), value: shown(from.label, match.trim()) });
      return { ok: true };
    }
    if (a.action === "check") {
      await loc.setChecked(a.on);
      rec(a);
      return { ok: true };
    }
    if (a.action === "upload") {
      const file = await this.file(ctx, a.attachment);
      if (!file) return { ok: false, error: "Not an approved file." };
      await loc.setInputFiles(file);
      rec(a);
      ctx.f = await this.c.store.step(ctx.f, log(`Attached ${a.attachment}`, `已上传 ${a.attachment}`, "upload"));
      return { ok: true };
    }
    // a link to somewhere off the run's hosts, or to a file: or script address, is never clicked
    const href = await loc.evaluate((el) => (el as HTMLAnchorElement).getAttribute?.("href") ?? "").catch(() => "");
    if (href && !/^(#|\/(?!\/)|\?)/.test(href) && !linkAllowed(new URL(href, page.url()).href, ctx.hosts)) {
      ctx.f = await this.c.store.step(ctx.f, log("Refused a link off the agency's site", "拒绝打开机构网站以外的链接", "refused", href.slice(0, 120)));
      return { ok: false, error: "Refused: that link leaves the agency's site." };
    }
    // click. The words on what's clicked decide whether it sends the application, whatever kind of selector picked it:
    // a "Submit" link or an element chosen by its id gets the same final-submit guard as a "Submit" button.
    const text = a.selector.startsWith("button:") ? a.selector.slice(7) : a.selector.startsWith("link:") ? a.selector.slice(5)
      : await loc.evaluate((el) => (el.textContent || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).catch(() => "");
    // a button the guide shows only opening the next form ("Schedule Inspection" on AB+C's list) isn't a send; the
    // guide's own send button always is
    const final = !!text && !navOn(ctx.pb?.playbook, st, text) && (isFinal(text) || finalOn(ctx.pb?.playbook, st, text));
    if (final && ctx.f.submit_clicked_at) {
      // Already submitted in this run: a second "send" is the agency's fee or a confirmation of it, which is the person's.
      return { end: await this.handBack(ctx, "payment", PAY) };
    }
    // Assist mode: steps nobody at Placetta has reviewed never send anything themselves. Odelia filled the pages; the
    // review page is still checked against the approval, then a person presses the agency's button.
    if (final && ctx.assist) return { end: await this.assistSubmit(ctx, st) };
    if (final) {
      const end = await this.beforeSubmit(ctx, st);
      if (end) return { end };
      if (this.c.beforeSubmitClick) await this.c.beforeSubmitClick(ctx.f);
    }
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => undefined), loc.click()]);
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    rec({ action: "click", selector: a.selector, ...(final ? { submit: true } : {}) });
    if (!onAny(page.url(), ctx.hosts)) return { end: { kind: "handoff", reason: "left_portal", trace: ctx.trace, message: { en: "The run left the agency's site.", zh: "运行离开了机构网站。" } } };
    ctx.f = await this.c.store.step(ctx.f, log(`Pressed ${text || a.selector.replace(/^\w+:/, "")}`, `点击 ${text || a.selector.replace(/^\w+:/, "")}`, "click"));
    return { ok: true };
  }

  /** Each new page of the agency's site, once: a screenshot for the customer's live view and replay. */
  private async proof(ctx: Ctx, st: PageState) {
    const key = urlKey(st.url) + "|" + headingOf(st);
    if (key === ctx.seen || (ctx.pages ?? 0) >= 25) return;
    ctx.seen = key; ctx.pages = (ctx.pages ?? 0) + 1;
    const heading = headingOf(st) || ctx.host;
    let path: string | null = null;
    try { path = await this.c.store.saveProof(ctx.f, `page-${ctx.pages}.jpg`, await ctx.page.screenshot({ fullPage: true, type: "jpeg", quality: 60 }), "image/jpeg"); } catch { /* the page still gets its line */ }
    ctx.f = await this.c.store.step(ctx.f, log(`On “${heading}”`, `在“${heading}”页面`, "page", path ?? undefined));
  }

  /** The final-submit guard: screenshot, compare with the payload, dry run and two-key, then write submit_clicked_at. */
  private async beforeSubmit(ctx: Ctx, st: PageState): Promise<Result | null> {
    const shot = await ctx.page.screenshot({ fullPage: true });
    const path = await this.c.store.saveDoc(ctx.f, "review-page.png", shot, "image/png");
    const missing = this.unconfirmed(ctx, st);
    if (missing.length) {
      return { kind: "handoff", reason: "review_differs", task: "handoff", trace: ctx.trace,
        message: { en: `The agency's review page doesn't match what you approved (${missing.join(", ")}). Nothing was submitted.`, zh: `机构的核对页面与您批准的内容不一致（${missing.join("、")}），未提交。` } };
    }
    const official = ctx.f.payload.official!;
    const approved = ctx.f.agent_log.some((e) => e.kind === "two_key_ok");
    // A playbook's supervised first run always stops here for the team, whatever the two-key count says.
    const firstRun = !!ctx.pb && !ctx.pb.playbook.verified;
    if (this.c.dryRun || (!approved && (firstRun || (await this.c.store.selfFiled(official)) < this.c.twoKey))) {
      ctx.f = await this.c.store.step(ctx.f, log(this.c.dryRun ? "Dry run: stopped at the final submit" : "Placetta checks the agency's review page for the first filings of each form before Odelia submits on her own, and this one is in that check. Nothing for you to do: it goes once checked. If it takes longer than a day, Odelia gives it to you to send.",
        this.c.dryRun ? "演练：停在最终提交前" : "Odelia 自动提交每种表格的前几份时，快哉会先核对机构的核对页面，这一份正在核对中。您无需操作：核对后即提交。若超过一天，Odelia 会把材料交给您自行提交。", "review_page", path ?? undefined));
      return { kind: "review", trace: ctx.trace, message: { en: "Ready to submit once Placetta checks the agency's review page.", zh: "快哉核对机构的核对页面后即可提交。" } };
    }
    ctx.f = await this.c.store.step(ctx.f, log("Checked the review page against what you approved. Submitting.", "已核对页面与您批准的内容一致，正在提交。", "submit", path ?? undefined),
      { submit_clicked_at: new Date().toISOString() });
    return null;
  }

  /** Approved values the agency's sending page doesn't show. A form with no review page (FinCEN's BOIR sends from its
   *  last tab) names review "entered": a value this run typed itself, through the guard that types only approved
   *  values, counts as confirmed; any other approved value must still be on the page. */
  private unconfirmed(ctx: Ctx, st: PageState): string[] {
    const missing = reviewMismatch(st.text, ctx.f.payload);
    if (ctx.pb?.playbook.review !== "entered") return missing;
    const typed = new Set(ctx.trace.filter((t) => (t.action === "fill" || t.action === "select") && t.field).map((t) => (t as { field?: string }).field));
    return missing.filter((label) => !typed.has(label));
  }

  private async file(ctx: Ctx, name: string): Promise<string | null> {
    if (ctx.files.has(name)) return ctx.files.get(name)!;
    const p = ctx.f.payload;
    const path = name === "form.pdf" ? p.pdf_path : p.attachments?.find((a) => a.name === name)?.path;
    if (!path) return null;
    const out = join(ctx.dir, name.replace(/[^\w.-]+/g, "_"));
    await writeFile(out, await this.c.store.download(path));
    ctx.files.set(name, out);
    return out;
  }

  // ---------------------------------------------------------------- hand-back

  /** The page as the person is handed it, and how to tell they're finished with it. */
  private async handBack(ctx: Ctx, reason: string, message: { en: string; zh: string }): Promise<Result> {
    const until = new Date(Date.now() + this.c.holdMs).toISOString();
    // A session with no hosted view (local Chromium) gets the worker's own live browser for this hand-back (live.ts).
    const own = !ctx.session.liveUrl ? this.c.live?.open(ctx.page as unknown as Parameters<LiveViews["open"]>[0], this.c.holdMs) ?? null : null;
    const liveUrl = ctx.session.liveUrl ?? own?.url ?? null;
    const at = await this.pageKey(ctx);
    try {
      ctx.f = await this.c.store.step(ctx.f, { ...message, kind: "need_person", ref: reason },
        { agent_state: "needs_you", handoff_url: liveUrl, provider_ref: `held-until:${until}` });
      await this.c.store.notify(ctx.f, { en: "Placetta needs you for one step", zh: "需要您完成一步" }, message);
      const end = Date.now() + this.c.holdMs;
      let clearFor = 0;
      while (Date.now() < end) {
        await sleep(this.c.pollMs);
        const now = await this.c.store.reload(ctx.f.id).catch(() => ctx.f);
        if (now.status === "canceled") { ctx.f = now; return { ...STOPPED, trace: ctx.trace }; }
        if (await this.takeBack(ctx.f.id)) {
          ctx.f = await this.c.store.reload(ctx.f.id);
          ctx.waive = { reason, at };
          return { kind: "needs_you", reason: "resumed", message, trace: ctx.trace };   // marker: drive continues
        }
        // One tap: Done in the live browser, or the page simply no longer needing the person (the CAPTCHA solved, the
        // code typed, the fee paid and the agency's next page showing), and Odelia carries on by herself. Never while
        // the person's hands are on the page: two quiet polls in a row, nothing clicked or typed for 3 seconds.
        const idle = !own || Date.now() - (this.c.live?.touched(own.token) ?? 0) > 3000;
        const tapped = !!own && !!this.c.live?.done(own.token);
        const cleared = SELF_CLEARING.has(reason) && await this.cleared(ctx, reason, at);
        clearFor = cleared && idle ? clearFor + 1 : 0;
        if (tapped || clearFor >= 2) {
          ctx.f = await this.c.store.step(ctx.f, log(tapped ? "You finished your step. Odelia carries on." : "The step is done. Odelia carries on.", tapped ? "您已完成这一步，Odelia 继续办理。" : "这一步已完成，Odelia 继续办理。", "resume"),
            { agent_state: "running", provider_ref: null, handoff_url: null });
          ctx.waive = { reason, at };
          return { kind: "needs_you", reason: "resumed", message, trace: ctx.trace };
        }
      }
      ctx.f = await this.c.store.step(ctx.f, log("Closed the browser while waiting. Placetta starts again when you tap carry on.", "等待时已关闭浏览器，您点击继续后快哉会重新开始。", "quiet"), { provider_ref: null, handoff_url: null });
      return { kind: "needs_you", reason, message, trace: ctx.trace };
    } finally {
      this.c.live?.close(own?.token);
    }
  }
  private async pageKey(ctx: Ctx): Promise<string> {
    const st = await pageState(ctx.page).catch(() => null);
    return st ? `${urlKey(st.url)}|${headingOf(st)}` : "";
  }
  /** The page no longer needs the person for this reason: it moved on, or what they were asked for is done on it. */
  private async cleared(ctx: Ctx, reason: string, at: string): Promise<boolean> {
    const st = await pageState(ctx.page).catch(() => null);
    if (!st) return false;
    const stop = mustStop(st);
    const moved = `${urlKey(st.url)}|${headingOf(st)}` !== at;
    if (reason === "payment") return moved && stop?.reason !== "payment" && !payOn(ctx.pb?.playbook, st);
    if (reason === "captcha") return stop?.reason !== "captcha" || await captchaAnswered(ctx.page);
    if (reason === "code" || reason === "secret_number") return stop?.reason !== reason || stopLinesFilled(reason, st);
    return moved && stop?.reason !== reason;
  }
  /** The stop the person just finished, on the same page: let it pass once what they did is there. */
  private async waived(ctx: Ctx, stop: { reason: string }, st: PageState): Promise<boolean> {
    if (!ctx.waive || ctx.waive.reason !== stop.reason || ctx.waive.at !== `${urlKey(st.url)}|${headingOf(st)}`) return false;
    if (stop.reason === "captcha") return await captchaAnswered(ctx.page);
    return (stop.reason === "code" || stop.reason === "secret_number") && stopLinesFilled(stop.reason, st);
  }
  private async takeBack(id: string): Promise<boolean> {
    const s = this.c.store as Store & { takeHeld?(id: string): Promise<boolean> };
    return s.takeHeld ? await s.takeHeld(id) : false;
  }

  // ---------------------------------------------------------------- replay and drive

  private async replay(ctx: Ctx, skill: Skill): Promise<Exec> {
    const p = ctx.f.payload;
    for (const r0 of skill.body.steps) {
      const st = await pageState(ctx.page);
      // page text is data: a page with instructions aimed at an AI ends the replay for the team, as it ends a drive
      const inj = pageInjection(st);
      if (inj) return { end: { kind: "handoff", reason: "page_injection", trace: ctx.trace, message: { en: `The agency's page had text aimed at an AI (${inj}), so Placetta stopped.`, zh: "机构页面中含有针对 AI 的文字，快哉已停止。" } } };
      // a taught step names this customer's own values by placeholder ({fact:legal_name} in a link's words)
      const s0 = { ...r0, heading: fillFacts(r0.heading, p), selector: fillFacts(r0.selector, p) } as TraceStep;
      if (headingOf(st) !== s0.heading) return { ok: false, error: "page changed" };
      if (s0.action === "fill" && s0.person) {
        // an SSN, a card or a code: always the person's, on every run
        const h = await this.handBack(ctx, "secret_number", { en: "This page asks for a number only you type (an SSN, a card or a code). Open the live browser, fill that line, then tap \"I've done it\".", zh: "此页面要求填写只能由您输入的号码（SSN、银行卡或验证码）。请打开实时浏览器填写后点击“我已完成”。" });
        if (h.kind === "needs_you" && h.reason === "resumed") continue;
        return { end: h };
      }
      if ((s0.action === "fill" || s0.action === "select") && s0.ask) return { ok: false, error: "no value" };
      let s = s0;
      if (!(await locate(ctx.page, s0.selector).count())) {
        // the step's control moved or was relabelled: found again by its words, only when exactly one matches
        const healed = heal(s0.selector, st, s0.action);
        if (!healed || !(await locate(ctx.page, healed).count())) return { ok: false, error: "page changed" };
        s = { ...s0, selector: healed };
        ctx.drift = [...(ctx.drift ?? []), `${s0.selector} -> ${healed}`];
        ctx.f = await this.c.store.step(ctx.f, log("The agency's page changed a little; found the same field again by its words", "机构页面略有变化，已按文字重新找到同一字段", "drift", `${s0.selector} -> ${healed}`.slice(0, 200)));
      }
      const own = (x: { fact?: string; field?: string }) => (p.fields ?? []).find((f) => (x.fact && factKey(f) === x.fact) || (!!x.field && f.label.en === x.field));
      const value = (s.action === "fill" || s.action === "select") && (s.field || s.fact) ? own(s)?.value : undefined;
      if ((s.action === "fill" && !s.login && value === undefined) || (s.action === "select" && value === undefined && !(s.option && ctx.taught))) return { ok: false, error: "no value" };
      // a taught playbook's checks run in code before a value is typed (the reviewed validators)
      const check = s.action === "fill" && s.fact ? ctx.taught?.body.validators?.[s.fact] : undefined;
      if (s.action === "fill" && check && value !== undefined && !checkValue(check, value)) {
        const what = s.field ?? "value";
        const h = await this.handBack(ctx, "question", { en: `The ${what} you approved doesn't fit this agency's form. Open the live browser, fill that line, then tap "I've done it".`, zh: `您批准的${what}不符合该机构表格的格式。请打开实时浏览器填写这一行后点击“我已完成”。` });
        if (h.kind === "needs_you" && h.reason === "resumed") continue;
        return { end: h };
      }
      if (s.action === "upload" && s.attachment === "{file}") {
        const name = fileFor(s.selector.replace(/^\w+:/, ""), p);
        if (!name) return { ok: false, error: "which file" };
        s = { ...s, attachment: name };
      }
      const r = await this.exec(ctx, s, value);
      if ("end" in r) { if (r.end.kind === "needs_you" && r.end.reason === "resumed") continue; return r; }
      if (!r.ok) return r;
    }
    const st = await pageState(ctx.page);
    const m = skill.body.confirm ? safeConfirm(skill.body.confirm.pattern)?.exec(st.text) ?? null : null;
    if (!m) return { ok: false, error: "no confirmation" };
    return { end: await this.done(ctx, m[1], "Submitted by replaying the recorded steps", true) };
  }

  private async drive(ctx: Ctx, note?: string): Promise<Result> {
    const recent: string[] = [];
    for (let i = 0; i < this.c.maxSteps; i++) {
      if (Date.now() - ctx.t0 > this.c.maxMs) break;
      if (ctx.f.status === "canceled") return { ...STOPPED, trace: ctx.trace };
      const st = await pageState(ctx.page);
      // The guide's fee page goes to the person even before any card field shows.
      const own = mustStop(st);
      const stop = (own && !(await this.waived(ctx, own, st)) ? own : null) ?? (payOn(ctx.pb?.playbook, st) ? { reason: "payment" as const, ...PAY } : null);
      if (stop) {
        const r = await this.handBack(ctx, stop.reason, { en: stop.en, zh: stop.zh });
        if (r.kind === "needs_you" && r.reason === "resumed") continue;
        return r;
      }
      // A page with instructions aimed at an AI (in sight, or in text hidden from a person) isn't the agency talking to
      // the customer: the run stops before the model reads it, and the team takes the filing.
      if (blockedPage(st)) return { kind: "handoff", reason: "portal_blocked", task: "handoff", trace: ctx.trace, message: BLOCKED_MSG };
      const inj = pageInjection(st);
      if (inj) return { kind: "handoff", reason: "page_injection", trace: ctx.trace,
        message: { en: `The agency's page had text aimed at an AI (${inj}), so Placetta stopped before reading it.`, zh: "机构页面中含有针对 AI 的文字，快哉在读取前已停止。" } };
      // After the submit, the guide's confirmation pattern finds the agency's number without asking the model.
      const pattern = ctx.f.submit_clicked_at && ctx.pb?.playbook.confirm ? new RegExp(ctx.pb.playbook.confirm, "i").exec(st.text) : null;
      if (pattern?.[1]) return await this.done(ctx, pattern[1], `Submitted following the published guide for ${ctx.pb!.playbook.name}`, false);
      const call = await this.c.model.next({ filing: ctx.f, agency: ctx.host, state: st, recent, note, guide: ctx.pb ? guideLines(ctx.pb) : undefined });
      note = undefined;
      const x = call.input as Record<string, string & boolean & number>;
      let r: Exec;
      switch (call.name) {
        case "fill": r = await this.exec(ctx, { action: "fill", selector: x.selector }, String(x.value ?? "")); break;
        case "fill_login": r = await this.exec(ctx, { action: "fill", selector: x.selector, login: x.which === "password" ? "password" : "username" }); break;
        case "select": r = await this.exec(ctx, { action: "select", selector: x.selector, option: String(x.option) }); break;
        case "check": r = await this.exec(ctx, { action: "check", selector: x.selector, on: !!x.on }); break;
        case "click": r = await this.exec(ctx, { action: "click", selector: x.selector }); break;
        case "upload": r = await this.exec(ctx, { action: "upload", selector: x.selector, attachment: String(x.attachment) }); break;
        case "wait": await sleep(Math.min(Number(x.ms) || 1000, 10000)); r = { ok: true }; break;
        case "need_person": {
          const msg = { en: String(x.message ?? x.reason).slice(0, 400), zh: String(x.message ?? x.reason).slice(0, 400) };
          const h = await this.handBack(ctx, "question", msg);
          if (h.kind === "needs_you" && h.reason === "resumed") { r = { ok: true }; break; }
          return h;
        }
        case "done": {
          const conf = String(x.confirmation_number ?? "").trim();
          if (!conf || !st.text.includes(conf) || !ctx.f.submit_clicked_at) { r = { ok: false, error: "done needs the confirmation number shown on this page, after the submit." }; break; }
          return await this.done(ctx, conf, String(x.summary ?? ""), false);
        }
        default: r = { ok: false, error: "Unknown tool." };
      }
      if ("end" in r) { if (r.end.kind === "needs_you" && r.end.reason === "resumed") continue; return r.end; }
      recent.push(`${call.name} ${x.selector ?? ""}${r.ok ? "" : ` (failed: ${r.error})`}`);
    }
    return { kind: "handoff", reason: "limit", trace: ctx.trace, message: { en: "Placetta couldn't finish on the agency's site.", zh: "快哉未能在机构网站上完成。" } };
  }

  // ---------------------------------------------------------------- teach mode

  /** Assist mode's send: the review page is checked against the approval as always, then the person presses the
   *  agency's button in the live browser. Odelia never clicks it. submit_clicked_at is written as soon as they say
   *  they did, so the filing is never sent again. */
  private async assistSubmit(ctx: Ctx, st: PageState): Promise<Result> {
    const missing = this.unconfirmed(ctx, st);
    if (missing.length) {
      return { kind: "handoff", reason: "review_differs", task: "handoff", trace: ctx.trace,
        message: { en: `The agency's review page doesn't match what you approved (${missing.join(", ")}). Nothing was submitted.`, zh: `机构的核对页面与您批准的内容不一致（${missing.join("、")}），未提交。` } };
    }
    const shot = await ctx.page.screenshot({ fullPage: true }).catch(() => null);
    const path = shot ? await this.c.store.saveDoc(ctx.f, "review-page.png", shot, "image/png") : null;
    ctx.f = await this.c.store.step(ctx.f, log("Checked the review page against what you approved. Your turn to press submit.", "已核对页面与您批准的内容一致，请您点击提交。", "review_page", path ?? undefined));
    const h = await this.handBack(ctx, "assist_submit", ASSIST);
    if (!(h.kind === "needs_you" && h.reason === "resumed")) return h;
    ctx.f = await this.c.store.step(ctx.f, log("You pressed submit on the agency's site", "您已在机构网站上点击提交", "submit"), { submit_clicked_at: new Date().toISOString() });
    await ctx.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    const now = await pageState(ctx.page);
    const pattern = ctx.pb?.playbook.confirm ? safeConfirm(ctx.pb.playbook.confirm)?.exec(now.text)?.[1] : undefined;
    const conf = pattern ?? confirmationIn(now.text);
    if (conf && now.text.includes(conf)) return await this.done(ctx, conf, "You pressed submit after Odelia filled every page", false);
    return { kind: "handoff", reason: "maybe_submitted", task: "check_agency", trace: ctx.trace,
      message: { en: "You pressed submit, but Placetta didn't see the agency's confirmation.", zh: "您已点击提交，但快哉没有看到机构的确认信息。" } };
  }

  /** "Show Odelia how": the person files in the live browser while the recorder (recorder.ts) writes down each step.
   *  Odelia types nothing and clicks nothing. When the agency's confirmation shows (or the person taps "I've done it"),
   *  the recording becomes a draft playbook (teach.ts) for the team's review, and the confirmation is this filing's. */
  private async teach(ctx: Ctx, events: RawEvent[], start: string): Promise<Result> {
    const { store } = this.c;
    const span0 = this.c.teachMs ?? this.c.holdMs;
    // with no hosted view, the worker's own live browser (live.ts) for the whole teaching run
    const ownView = !ctx.session.liveUrl ? this.c.live?.open(ctx.page as unknown as Parameters<LiveViews["open"]>[0], span0) ?? null : null;
    const teachUrl = ctx.session.liveUrl ?? ownView?.url ?? null;
    if (!teachUrl && !this.c.teachWithoutLive) {
      return { kind: "handoff", reason: "no_live_view", trace: [], message: { en: "The live browser isn't available right now, so Odelia can't watch this filing.", zh: "实时浏览器暂时不可用，Odelia 无法观看这次提交。" } };
    }
    const official = ctx.f.payload.official ?? "";
    const span = this.c.teachMs ?? this.c.holdMs, settle = this.c.teachSettleMs ?? 3000;
    const until = new Date(Date.now() + span).toISOString();
    ctx.f = await store.step(ctx.f, { ...TEACH, kind: "need_person", ref: "teach" }, { agent_state: "needs_you", handoff_url: teachUrl, provider_ref: `held-until:${until}` });
    await store.notify(ctx.f, { en: "Show Odelia how", zh: "教 Odelia 一次" }, TEACH);
    // page events get what the worker reads from the page: its text (for the confirmation, kept in memory only),
    // whether it reads as instructions to an AI, and whether it takes a card
    const seen = new Set<RawEvent>();
    const readPages = async () => {
      for (const e of events) {
        if (e.kind !== "page" || seen.has(e)) continue;
        seen.add(e);
        const st = await pageState(ctx.page).catch(() => null);
        if (!st) continue;
        e.text = st.text; e.injection = pageInjection(st); e.card = mustStop(st)?.reason === "payment";
        if (e.injection) ctx.f = await store.step(ctx.f, log("A page had text aimed at an AI. Odelia didn't use it, and the team checks those steps.", "某个页面含有针对 AI 的文字。Odelia 没有采用，团队会核对这些步骤。", "refused", e.injection.slice(0, 120)));
      }
    };
    let sawAt = 0;
    const end = Date.now() + span;
    while (Date.now() < end) {
      await sleep(this.c.pollMs);
      const now = await store.reload(ctx.f.id).catch(() => ctx.f);
      if (now.status === "canceled") { ctx.f = now; return { ...STOPPED, trace: [] }; }
      await readPages();
      const { confirmation } = record(events, { payload: ctx.f.payload, host: ctx.host, official, start });
      // the person sent it: written at once, so nothing ever sends this filing again
      if (confirmation && !ctx.f.submit_clicked_at) ctx.f = await store.step(ctx.f, log("You submitted it on the agency's site", "您已在机构网站上提交", "submit"), { submit_clicked_at: new Date().toISOString() });
      if (confirmation) { sawAt ||= Date.now(); if (Date.now() - sawAt >= settle) break; }
      if (await this.takeBack(ctx.f.id)) { ctx.f = await store.reload(ctx.f.id); break; }
      if (ownView && this.c.live?.done(ownView.token)) break;
    }
    this.c.live?.close(ownView?.token);
    await readPages();
    const { recording, confirmation } = record(events, { payload: ctx.f.payload, host: ctx.host, official, start });
    let learned = false;
    if (recording.steps.some((s) => s.submit) && recording.steps.length >= 2) {
      const draft = await generalize(recording, { facts: factsOf(ctx.f.payload), registry: registryOf(ctx.f), name: `${ctx.f.payload.form?.en ?? official} on ${ctx.host}`, label: this.c.labeler });
      const problems = draftProblems(draft), leaks = customerData(draft, ctx.f.payload);
      if (leaks.length) {
        // never shared: a playbook that would carry this customer's data to the next one
        await store.teamTask(ctx.f, "playbook_review", `Teach run on ${ctx.host} for ${official}: the recording still named the customer's own data (${leaks.join(", ")}); nothing was saved.`);
      } else {
        const saved = await store.saveTaught?.(ctx.f, draft).catch((e) => { console.error("filer: taught save", e instanceof Error ? e.message : e); return null; });
        learned = !!saved && saved.status === "draft";
        if (saved && saved.status === "approved") ctx.f = await store.step(ctx.f, log(`This agency's site already has reviewed steps; the team compares yours with them.`, `该机构网站已有核对过的步骤，团队会与您的步骤比对。`, "quiet"));
        if (learned && problems.length) await store.teamTask(ctx.f, "playbook_review", `Taught steps for ${official} on ${ctx.host} need work before approval: ${problems.join(", ")}.`);
      }
    }
    ctx.f = await store.step(ctx.f, learned
      ? log(`Odelia learned the ${recording.steps.length} steps on ${ctx.host}. The Placetta team checks them; then she files this form there for every business, and you still approve each filing.`, `Odelia 学会了 ${ctx.host} 上的 ${recording.steps.length} 个步骤。快哉团队核对后，她会为每家企业在该网站提交这份表格，每次提交仍需您批准。`, "taught", String(recording.steps.length))
      : log("Odelia couldn't learn the steps from this run. The Placetta team looks at it.", "Odelia 未能从这次操作中学会步骤，快哉团队会查看。", "taught", "0"), { handoff_url: null });
    if (confirmation) return await this.done(ctx, confirmation, "You submitted it while Odelia watched", false);
    if (ctx.f.submit_clicked_at) return { kind: "handoff", reason: "maybe_submitted", task: "check_agency", trace: [], message: { en: "You pressed submit, but Placetta didn't see the agency's confirmation.", zh: "您已点击提交，但快哉没有看到机构的确认信息。" } };
    return { kind: "handoff", reason: "teach_incomplete", trace: [], message: { en: "Odelia didn't see the filing sent.", zh: "Odelia 没有看到申请被提交。" } };
  }

  private async done(ctx: Ctx, confirmation: string, summary: string, replayed: boolean): Promise<Result> {
    const st = await pageState(ctx.page);
    const png = await ctx.page.screenshot({ fullPage: true });
    const shot = await this.c.store.saveDoc(ctx.f, "confirmation.png", png, "image/png");
    let pdfPath: string | null = null;
    try { const pdf = await ctx.page.pdf(); pdfPath = await this.c.store.saveDoc(ctx.f, "confirmation.pdf", pdf, "application/pdf"); } catch { /* not headless */ }
    (ctx as Ctx & { receipt?: string | null; pattern?: string | null }).receipt = pdfPath ?? shot;
    // the receipt checklist: what Placetta kept as proof, ticked or missing, in the filing's log for the owner and team
    const check = receiptCheck({ text: st.text, heading: headingOf(st), confirmation, screenshot: shot, pdf: pdfPath, receiptWords: ctx.pb?.playbook.receipt });
    ctx.f = await this.c.store.step(ctx.f, { ...receiptLine(check), kind: "receipt_check", ref: JSON.stringify(check).slice(0, 300) });
    const pattern = confirmPattern(st.text, confirmation);
    return { kind: "submitted", confirmation, summary, trace: ctx.trace, seconds: Math.round((Date.now() - ctx.t0) / 1000), replayed, pattern } as Result;
  }

  // ---------------------------------------------------------------- finishing

  async finish(f: Filing, res: Result, ctx?: Ctx) {
    const { store } = this.c;
    const extra = ctx as (Ctx & { receipt?: string | null }) | undefined;
    if (res.kind === "submitted") {
      const g = await store.step(f, log(`Submitted on ${ctx?.host}. Confirmation ${res.confirmation}`, `已在 ${ctx?.host} 提交，确认号 ${res.confirmation}`, "submitted", res.confirmation),
        { status: "submitted", agent_state: "done", confirmation_number: res.confirmation, requirements_checked: true, handoff_url: null, ...(extra?.receipt ? { receipt_path: extra.receipt } : {}) });
      await store.notify(g, { en: `Submitted: ${f.title.en}`, zh: `已提交：${f.title.zh}` }, { en: `Confirmation ${res.confirmation}.`, zh: `确认号 ${res.confirmation}。` });
    } else if (res.kind === "stopped") {
      // the customer stopped it; the database already says so, and nothing was submitted
    } else if (res.kind === "needs_you") {
      // already recorded by handBack
    } else if (res.kind === "review") {
      const g = await store.step(f, null, { agent_state: "handoff" });
      await store.teamTask(g, "review", `Review the agency's review page for ${f.payload.official} before Placetta submits (Documents, review-page.png).`);
    } else {
      // The file function's sweep decides what happens next (another way the agency takes, or the business's packet);
      // Placetta keeps a task only for what it must look into itself (a submit it can't confirm, a first run to watch).
      const g = await store.step(f, { ...res.message, kind: "handoff", ref: res.reason }, { agent_state: "handoff", channel: "team", handoff_url: null });
      // (and text aimed at an AI on an agency's page, which Placetta always looks at)
      if ((res.task && res.task !== "handoff") || res.reason === "page_injection") await store.teamTask(g, res.task ?? "handoff", res.message.en);
    }
  }

  private async learn(key: string, f: Filing, res: Extract<Result, { kind: "submitted" }>, old: Skill | null) {
    const pattern = (res as unknown as { pattern?: string }).pattern;
    const steps = res.trace.filter((s) => !s.handback);
    await this.c.store.saveSkill({
      key, name: `${f.payload.form?.en ?? f.payload.official} on ${key.split(":")[1]}`, enabled: true, uses: (old?.uses ?? 0) + 1, fails_in_a_row: 0,
      last_seconds: res.seconds, best_seconds: Math.min(res.seconds, old?.best_seconds ?? Infinity),
      body: { version: (old?.body.version ?? 0) + (res.replayed ? 0 : 1), steps, confirm: pattern ? { pattern } : old?.body.confirm },
    });
  }

  private async fail(f: Filing, e: unknown) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    const cur = await this.c.store.reload(f.id).catch(() => f);
    if (cur.status === "canceled") return;   // stopped by the customer: nothing to retry
    if (cur.submit_clicked_at) {
      const g = await this.c.store.step(cur, log("The run stopped after pressing submit, so nothing more is sent until it's checked with the agency.", "运行在点击提交后中断，在向机构确认之前不会再提交。", "handoff", "maybe_submitted"), { agent_state: "handoff", channel: "team" });
      console.error("filer: stopped after submit:", msg);
      await this.c.store.teamTask(g, "check_agency", "Run stopped after submit was pressed. Check the agency first.");
    } else if (cur.attempts >= 3) {
      // ref portal_failed: the file function's sweep tries another way the agency takes (email, fax, certified mail, or
      // the business's packet) (supabase/functions/file handBacks)
      await this.c.store.step(cur, log("The agency's site failed 3 times. Odelia tries another way the agency takes, or gives it to you to send.", "机构网站 3 次未能完成。Odelia 会改用机构接受的其他方式，否则交由您自行提交。", "handoff", "portal_failed"), { agent_state: "handoff", channel: "team" });
      console.error("filer: portal failed 3 times:", msg);
    } else if (portalDown(msg)) {
      // the agency's site is down or slow: wait before the next try (2, 10, 30 minutes), not straight back into it
      const mins = backoffMinutes(cur.attempts), at = new Date(Date.now() + mins * 60_000).toISOString();
      await this.c.store.step(cur, log(`The agency's site isn't answering. Trying again in ${mins} minutes.`, `机构网站暂时无法访问，${mins} 分钟后重试。`, "retry", msg), { agent_state: "queued", provider_ref: `retry-after:${at}` });
    } else {
      await this.c.store.step(cur, log("Something went wrong on the agency's site. Trying again.", "机构网站出现问题，正在重试。", "retry", msg), { agent_state: "queued" });
    }
  }
}
