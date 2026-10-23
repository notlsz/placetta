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
import { confirmPattern, fieldFor, isFinal, mustStop, onPortal, optionFor, reviewMismatch, type PageState } from "./guards.ts";
import type { Model } from "./model.ts";
import { headingOf, locate, pageState } from "./page.ts";
import { finalOn, type FormSteps, guideLines, navOn, payOn, type Playbook } from "./playbooks.ts";
import { backoffMinutes, heal, type KeyLock, portalDown, receiptCheck, receiptLine } from "./heal.ts";
import type { Store } from "./store.ts";
import { harden, linkAllowed, safeConfirm, wipe, withTimeout, type Blocked } from "./sandbox.ts";
import { scoreText } from "../../../supabase/functions/_shared/injection.ts";
import type { Act, Filing, Login, Result, Skill, TraceStep } from "./types.ts";

export type Session = { browser: Browser; page: Page; liveUrl: string | null; close(): Promise<void> };
/** The destination's details the worker needs beyond its host: the agency's path on a host many agencies share (so
    its own saved login is used), the other hosts the portal sends the browser to, and the page to start from. */
export type Route = { tenant?: string; alsoOn?: string[]; start?: string };
export type Config = {
  store: Store; model: Model; open(): Promise<Session>;
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
};

const PAY = {
  en: "The agency is asking for its fee. Open the live view and pay it yourself, then tap \"I've done it\". Placetta never pays an agency.",
  zh: "机构要求支付费用。请打开实时画面自行支付后点击“我已完成”。快哉从不替您向机构付款。",
};

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
        message: { en: "An earlier run may have submitted this. The team checks the agency before anything else.", zh: "之前的运行可能已提交，团队会先向机构核实。" } });
      return null;
    }
    // A playbook written from the agency's guide but never run on the live site waits for staff to watch its first run.
    const pb = this.c.playbookOf?.(host, official) ?? null;
    if (pb && !pb.playbook.verified && !this.c.allowUnverified) {
      await this.finish(f, { kind: "handoff", reason: "unverified_playbook", task: "first_run", trace: [],
        message: { en: `Placetta's steps for ${pb.playbook.name} come from the agency's published guide and haven't had their supervised first run. The Placetta team files this one and watches the steps.`, zh: `快哉在${pb.playbook.name}上的操作步骤来自机构公布的指南，尚未经过有人监督的首次运行。这一份由快哉团队提交，并核对这些步骤。` } });
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
      session = await this.c.open();
      track.session = session;
      await assertFresh(session);
      const page = session.page;
      // the sandbox (sandbox.ts): navigation only to the run's hosts, no file: or other schemes, no downloads, dialogs
      // dismissed, popups closed; each refusal goes in the filing's log
      const blocked: Blocked[] = [];
      await harden(page, hosts, (b) => { blocked.push(b); });
      const login = await store.login(f, host, route?.tenant);
      f = await store.step(f, log(`Opening ${host}`, `打开 ${host}`, "visit"), { provider_ref: null });
      if (pb) f = await store.step(f, log(`Following the published guide for ${pb.playbook.name}${pb.playbook.verified ? "" : " (first run, watched by the Placetta team)"}`, `按${pb.playbook.name}公布的指南操作${pb.playbook.verified ? "" : "（首次运行，由快哉团队监督）"}`, "playbook"));
      // The agency's own start page when the destination names one (on a host many agencies share, it's the agency's path).
      const start = pb?.form.start ?? route?.start;
      await page.goto(this.c.startUrl ? this.c.startUrl(host) : start && onAny(start, hosts) ? start : `https://${host}/`);
      const ctx: Ctx = { f, host, hosts, login, page, session, trace: [], t0: Date.now(), files: new Map(), pb, dir };
      const key = portalKey(host, f.payload.official!);
      const skill = await store.skill(key);
      let res: Result | null = null;
      if (skill?.enabled) {
        const r = await this.replay(ctx, skill);
        if ("end" in r) res = r.end;
        else if (!r.ok) {
          const { disabled } = await store.skillFailed(key);
          if (disabled) await store.teamTask(ctx.f, "skill_broken", `Replay of ${key} failed 3 times in a row; it's switched off. Check the portal.`);
        }
      }
      res ??= await this.drive(ctx, skill?.enabled ? "The recorded steps stopped matching this page; carry on from here." : undefined);
      for (const b of blocked.slice(0, 10)) ctx.f = await store.step(ctx.f, log(`Refused ${b.kind === "navigation" ? "to leave the agency's site" : b.kind === "scheme" ? "a local or script address" : b.kind === "download" ? "a download" : b.kind === "dialog" ? "a pop-up dialog" : "a new window"}`, `已拒绝${b.kind === "download" ? "下载" : b.kind === "dialog" ? "弹出对话框" : b.kind === "popup" ? "新窗口" : "离开机构网站或打开本地地址"}`, "refused", b.detail));
      await this.finish(ctx.f, res, ctx);
      // selector drift goes to the team once per run, whatever the run's end: the recorded skill needs a look
      if (ctx.drift?.length) await store.teamTask(ctx.f, "selector_drift", `${key}: ${ctx.drift.length} recorded step${ctx.drift.length === 1 ? "" : "s"} found again by their words; check the skill`, { key, drift: ctx.drift });
      if (res.kind === "submitted") await this.learn(key, ctx.f, res, skill);
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
    if (stop) return { end: await this.handBack(ctx, stop.reason, { en: stop.en, zh: stop.zh }) };
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
      const from = optionFor(opt, p);
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
    const missing = reviewMismatch(st.text, ctx.f.payload);
    if (missing.length) {
      return { kind: "handoff", reason: "review_differs", task: "handoff", trace: ctx.trace,
        message: { en: `The agency's review page doesn't match what you approved (${missing.join(", ")}). Nothing was submitted; the team is checking.`, zh: `机构的核对页面与您批准的内容不一致（${missing.join("、")}），未提交，团队正在核查。` } };
    }
    const official = ctx.f.payload.official!;
    const approved = ctx.f.agent_log.some((e) => e.kind === "two_key_ok");
    // A playbook's supervised first run always stops here for the team, whatever the two-key count says.
    const firstRun = !!ctx.pb && !ctx.pb.playbook.verified;
    if (this.c.dryRun || (!approved && (firstRun || (await this.c.store.selfFiled(official)) < this.c.twoKey))) {
      ctx.f = await this.c.store.step(ctx.f, log(this.c.dryRun ? "Dry run: stopped at the final submit" : "With the Placetta team for a final check before submitting",
        this.c.dryRun ? "演练：停在最终提交前" : "快哉团队正在提交前做最后核对", "review_page", path ?? undefined));
      return { kind: "review", trace: ctx.trace, message: { en: "Ready to submit. The team reviews the agency's review page first.", zh: "已准备提交，团队先核对机构的核对页面。" } };
    }
    ctx.f = await this.c.store.step(ctx.f, log("Checked the review page against what you approved. Submitting.", "已核对页面与您批准的内容一致，正在提交。", "submit", path ?? undefined),
      { submit_clicked_at: new Date().toISOString() });
    return null;
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

  private async handBack(ctx: Ctx, reason: string, message: { en: string; zh: string }): Promise<Result> {
    const until = new Date(Date.now() + this.c.holdMs).toISOString();
    ctx.f = await this.c.store.step(ctx.f, { ...message, kind: "need_person", ref: reason },
      { agent_state: "needs_you", handoff_url: ctx.session.liveUrl, provider_ref: `held-until:${until}` });
    await this.c.store.notify(ctx.f, { en: "Placetta needs you for one step", zh: "需要您完成一步" }, message);
    const end = Date.now() + this.c.holdMs;
    while (Date.now() < end) {
      await sleep(this.c.pollMs);
      const now = await this.c.store.reload(ctx.f.id).catch(() => ctx.f);
      if (now.status === "canceled") { ctx.f = now; return { ...STOPPED, trace: ctx.trace }; }
      if (await this.takeBack(ctx.f.id)) {
        ctx.f = await this.c.store.reload(ctx.f.id);
        return { kind: "needs_you", reason: "resumed", message, trace: ctx.trace };   // marker: drive continues
      }
    }
    ctx.f = await this.c.store.step(ctx.f, log("Closed the browser while waiting. Placetta starts again when you tap carry on.", "等待时已关闭浏览器，您点击继续后快哉会重新开始。", "quiet"), { provider_ref: null, handoff_url: null });
    return { kind: "needs_you", reason, message, trace: ctx.trace };
  }
  private async takeBack(id: string): Promise<boolean> {
    const s = this.c.store as Store & { takeHeld?(id: string): Promise<boolean> };
    return s.takeHeld ? await s.takeHeld(id) : false;
  }

  // ---------------------------------------------------------------- replay and drive

  private async replay(ctx: Ctx, skill: Skill): Promise<Exec> {
    for (const s0 of skill.body.steps) {
      const st = await pageState(ctx.page);
      if (headingOf(st) !== s0.heading) return { ok: false, error: "page changed" };
      let s = s0;
      if (!(await locate(ctx.page, s0.selector).count())) {
        // the step's control moved or was relabelled: found again by its words, only when exactly one matches
        const healed = heal(s0.selector, st, s0.action);
        if (!healed || !(await locate(ctx.page, healed).count())) return { ok: false, error: "page changed" };
        s = { ...s0, selector: healed };
        ctx.drift = [...(ctx.drift ?? []), `${s0.selector} -> ${healed}`];
        ctx.f = await this.c.store.step(ctx.f, log("The agency's page changed a little; found the same field again by its words", "机构页面略有变化，已按文字重新找到同一字段", "drift", `${s0.selector} -> ${healed}`.slice(0, 200)));
      }
      const value = s.action === "fill" && s.field ? ctx.f.payload.fields?.find((x) => x.label.en === s.field)?.value
        : s.action === "select" && s.field ? ctx.f.payload.fields?.find((x) => x.label.en === s.field)?.value : undefined;
      if ((s.action === "fill" && !s.login && value === undefined) || (s.action === "select" && value === undefined)) return { ok: false, error: "no value" };
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
      const stop = mustStop(st) ?? (payOn(ctx.pb?.playbook, st) ? { reason: "payment" as const, ...PAY } : null);
      if (stop) {
        const r = await this.handBack(ctx, stop.reason, { en: stop.en, zh: stop.zh });
        if (r.kind === "needs_you" && r.reason === "resumed") continue;
        return r;
      }
      // A page with instructions aimed at an AI (in sight, or in text hidden from a person) isn't the agency talking to
      // the customer: the run stops before the model reads it, and the team takes the filing.
      const inj = pageInjection(st);
      if (inj) return { kind: "handoff", reason: "page_injection", trace: ctx.trace,
        message: { en: `The agency's page had text aimed at an AI (${inj}), so Placetta stopped before reading it. The team takes this filing from here.`, zh: "机构页面中含有针对 AI 的文字，快哉在读取前已停止，由团队接手这份申请。" } };
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
    return { kind: "handoff", reason: "limit", trace: ctx.trace, message: { en: "Placetta couldn't finish on the agency's site. The team takes it from here.", zh: "快哉未能在机构网站上完成，由团队接手。" } };
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
      const g = await store.step(f, { ...res.message, kind: "handoff", ref: res.reason }, { agent_state: "handoff", channel: "team", handoff_url: null });
      await store.teamTask(g, res.task ?? "handoff", res.message.en);
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
      const g = await this.c.store.step(cur, log("The run stopped after pressing submit. The team checks with the agency.", "运行在点击提交后中断，团队会向机构核实。", "handoff", msg), { agent_state: "handoff", channel: "team" });
      await this.c.store.teamTask(g, "check_agency", "Run stopped after submit was pressed. Check the agency first.");
    } else if (cur.attempts >= 3) {
      // ref portal_failed: the file function's sweep tries another way the agency takes (email, fax, certified mail, or
      // the owner's packet) before the team files it by hand (supabase/functions/file reroute); the error is in the task
      const g = await this.c.store.step(cur, log("The agency's site failed 3 times. Placetta tries another way the agency takes, or the team files it.", "机构网站 3 次未能完成。快哉会改用机构接受的其他方式，否则由团队提交。", "handoff", "portal_failed"), { agent_state: "handoff", channel: "team" });
      await this.c.store.teamTask(g, "handoff", `Portal run failed 3 times: ${msg}`);
    } else if (portalDown(msg)) {
      // the agency's site is down or slow: wait before the next try (2, 10, 30 minutes), not straight back into it
      const mins = backoffMinutes(cur.attempts), at = new Date(Date.now() + mins * 60_000).toISOString();
      await this.c.store.step(cur, log(`The agency's site isn't answering. Trying again in ${mins} minutes.`, `机构网站暂时无法访问，${mins} 分钟后重试。`, "retry", msg), { agent_state: "queued", provider_ref: `retry-after:${at}` });
    } else {
      await this.c.store.step(cur, log("Something went wrong on the agency's site. Trying again.", "机构网站出现问题，正在重试。", "retry", msg), { agent_state: "queued" });
    }
  }
}
