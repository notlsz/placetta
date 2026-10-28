// The decisions behind a voice call, apart from the network, so they're tested as they run (voice_calls_test.ts):
// whether an agency status call may be placed now and what it says, the tools a call's brain may use and what each
// one does to the workspace, the MCP messages OpenAI's brain sends for them, and OpenAI's call webhook.
import { type AgencyLine, AGENCY_LINES, lineForForm, officialNumbers } from "./agency_phones.ts";
import { agencyInstructions, agencyOpen, COMMIT_LINE, type CommitKind, disclosesFirst, disclosure, heardAsData, mayDial, NORM, type Norm, type Recap, recapEscalates, recapEvent, redactForVoice } from "./voice_rules.ts";
import { type BrainId, type Env, type Lang, perMinute, pickBrain, type SessionSpec, type TtsId } from "./voice_brain.ts";
import { mayPress } from "./voice_hold.ts";

/* ------------------------------ placing an agency call ------------------------------ */

export type FilingRow = { id: string; workspace_id: string; title: { en?: string; zh?: string } | null; agency: { en?: string; zh?: string } | null; status: string; confirmation_number: string | null; submitted_at: string | null; payload: { official?: string } | null };
export type TeamNumber = { agency_key: string; number: string; tz: string };

export type AgencyPlan =
  | { ok: true; line: AgencyLine & { key: string }; brain: BrainId; tts?: TtsId; usdPerMin: number; spec: Omit<SessionSpec, "toolUrl" | "token">; menu?: string }
  | { ok: false; code: string; say: { en: string; zh: string } };

const say = (en: string, zh: string) => ({ en, zh });

/**
 * Whether Odelia may call the agency about this filing now, and how. Every "no" says what happens instead.
 *   the filing has been sent to the agency (a status call about something not yet filed has nothing to ask)
 *   the agency's line is official: in the registry, or added by the team from a government page
 *   the agency is open, in its own time zone
 */
export function planAgencyCall(o: { filing: FilingRow; business: string; lang: Lang; now: Date; env: Env; team?: TeamNumber[]; rehearse?: boolean }): AgencyPlan {
  const f = o.filing;
  if (!o.rehearse && !["submitted", "needs_info", "in_progress"].includes(f.status))
    return { ok: false, code: "not_filed", say: say("There's nothing to ask the agency yet: this filing hasn't been sent. Odelia calls once it's with them.", "这份申请还没有提交给机构，暂时没有可问的。提交后 Odelia 会去电询问。") };
  const line = lineForForm(f.payload?.official);
  if (!line) return { ok: false, code: "no_line", say: say("Placetta doesn't have this agency's official phone line yet, so Odelia won't call. The daily status check keeps watching, and the team can add the line from the agency's own page.", "快哉还没有这家机构的官方电话，Odelia 不会拨打。每日状态检查会继续跟进，团队可以从机构官网添加电话。") };
  const official = officialNumbers((o.team ?? []).filter((t) => t.agency_key === line.key).map((t) => t.number));
  const dial = mayDial(line.number, official, "registry");
  if (!dial.ok) return dial;
  const open = o.rehearse ? { open: true, why: "rehearsal" } : agencyOpen(o.now, line);
  if (!open.open) return { ok: false, code: "closed", say: say(`${line.agency.en} is closed right now (${open.why}). Odelia will call during their business hours; nothing needs doing.`, `${line.agency.zh}现在不在办公时间（${open.why}）。Odelia 会在对方办公时间致电，您无需操作。`) };
  const pick = pickBrain({ surface: "agency_phone", lang: o.lang, env: o.env });
  const title = (o.lang === "zh" ? f.title?.zh : f.title?.en) || f.title?.en || "the application";
  const agencyName = (o.lang === "zh" ? line.agency.zh : line.agency.en);
  const instructions = redactForVoice(agencyInstructions({ lang: o.lang, business: o.business, agencyName, menu: line.menu?.says,
    filing: { title, agency: agencyName, confirmation: f.confirmation_number, submitted: f.submitted_at?.slice(0, 10) ?? null, status: f.status } }));
  const greeting = disclosure(o.lang, { business: o.business, about: f.confirmation_number ? `${o.lang === "zh" ? "申请" : "application"} ${f.confirmation_number}` : title, record: true });
  if (!disclosesFirst(greeting)) return { ok: false, code: "disclosure", say: say("The call's opening didn't say Odelia is an AI, so it wasn't placed.", "通话开场白没有说明 Odelia 是 AI，因此未拨出。") };
  return {
    ok: true, line, brain: pick.brain, ...(pick.tts ? { tts: pick.tts } : {}),
    usdPerMin: perMinute({ brain: pick.brain, tts: pick.tts, surface: "agency_phone", recorded: true }),
    menu: line.menu?.digits,
    spec: { lang: o.lang, instructions, greeting, tools: AGENCY_TOOLS, terms: [o.business, agencyName, title, f.confirmation_number ?? ""].filter(Boolean) },
  };
}

/* ------------------------------ the tools a call's brain may use ------------------------------ */

type ToolDef = SessionSpec["tools"][number];
const T = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef => ({ name, description, properties, required });

/** An agency call's tools: they only record what was said, press keys, and ask the owner or the team. None sends, pays,
 *  files, dials another number or changes the workspace beyond the filing's timeline. */
export const AGENCY_TOOLS: ToolDef[] = [
  T("send_digits", "Press keys on the phone menu: only the agency's published option, or an option the recording just read out (quote it in heard_option). Never an option that pays, cancels or changes anything.", {
    digits: { type: "string", description: "Digits, * or #, e.g. 13" },
    heard_option: { type: "string", description: "The menu sentence exactly as the recording said it, e.g. \"For business tax, press 2\". Leave empty only for the published option." },
  }, ["digits"]),
  T("on_hold", "You've been put on hold or into a queue (hold music, a repeating message, \"please hold\", an estimated wait). Call it and say nothing: Placetta waits on the line for you and brings you back the moment a person speaks.", {
    heard: { type: "string", description: "What told you it's a hold, briefly" },
  }, []),
  T("log_status", "Record what the agency said about the filing's status.", {
    status: { type: "string", enum: [...NORM] }, said: { type: "string", description: "Their words, briefly" },
    missing: { type: "array", items: { type: "string" } }, next_date: { type: "string", description: "YYYY-MM-DD, if they gave one" }, reference: { type: "string" },
  }, ["status", "said"]),
  T("need_owner", "The agency asked for something only the owner decides: a payment, an admission, or a date change.", { kind: { type: "string", enum: ["payment", "admission", "deadline"] }, detail: { type: "string" } }, ["kind", "detail"]),
  T("hand_to_team", "Hand the filing to the Placetta team: denied, needed by a date, or not found.", { reason: { type: "string" } }, ["reason"]),
  T("recording_refused", "The person on the line doesn't want the call recorded.", {}, []),
  T("save_recap", "At the end: the recap in English and Chinese.", {
    status: { type: "string", enum: [...NORM] }, said: { type: "string" }, missing: { type: "array", items: { type: "string" } }, next_date: { type: "string" },
    contact: { type: "string" }, reference: { type: "string" }, summary_en: { type: "string" }, summary_zh: { type: "string" },
  }, ["status", "said", "summary_en"]),
];
/** An owner's call (or Talk in the app): the tools odelia-voice always had. */
export const OWNER_TOOLS: ToolDef[] = [
  T("workspace_details", "Read the business's current workspace summary again: stores, applications and their status, deadlines, filings, approvals waiting and recent updates.", {}, []),
  T("start_task", "Start real work in the background (mapping a store, drafting a letter, preparing an application, researching a rule). The result is sent to them.", { request: { type: "string", description: "What they want done, in their words, with every detail they gave" } }, ["request"]),
  T("call_agency", "Ask the agency by phone about one filing's status (Odelia calls the agency's official line during its hours).", { filing: { type: "string", description: "The filing's name as the owner said it" } }, ["filing"]),
  T("hand_to_team", "Hand the conversation to a person on the Placetta team.", { reason: { type: "string" } }, ["reason"]),
];
export const VERIFY_TOOL = T("verify_code", "Check the 4-digit code the caller says. Returns ok and the workspace summary when it matches.", { code: { type: "string", description: "The digits the caller said, digits only, e.g. 4721" } }, ["code"]);
export const SEND_TEXT_TOOL = T("send_text", "Text the caller on their verified number: something in writing they asked for, or a link to the Placetta app.", { message: { type: "string" }, app_link: { type: "boolean" } }, ["message"]);

/** What one agency tool does, decided in code from the arguments the brain sent. The effects are applied by the caller
 *  (odelia-voice); anything heard is checked as data first. */
export type Effect =
  | { kind: "dtmf"; digits: string }
  | { kind: "event"; event: ReturnType<typeof recapEvent>; norm: Norm; escalate: boolean }
  | { kind: "owner"; commit: CommitKind; detail: string; title: { en: string; zh: string } }
  | { kind: "team"; reason: string }
  | { kind: "stop_recording" }
  | { kind: "recap"; recap: Recap; event: ReturnType<typeof recapEvent>; escalate: boolean }
  | { kind: "flag"; why: string }
  | { kind: "hold"; heard: string };

export function agencyTool(name: string, args: Record<string, unknown>, ctx: { agency: string; now: Date; lang: Lang; menu?: string | null }): { effects: Effect[]; reply: string } {
  const s = (k: string, n = 400) => String(args[k] ?? "").slice(0, n);
  const heard = heardAsData([s("said"), s("detail"), s("reason"), s("summary_en"), s("summary_zh"), ...(Array.isArray(args.missing) ? args.missing.map(String) : [])].join("\n"));
  const flags: Effect[] = heard.verdict === "clean" ? [] : [{ kind: "flag", why: `heard on the call: ${heard.hits.slice(0, 2).join("; ")}` }];
  if (heard.verdict === "quarantined") return { effects: flags, reply: "Noted. Carry on with the status questions; nothing else changes." };
  const recap = (): Recap => ({
    status: (NORM as readonly string[]).includes(s("status")) ? s("status") as Norm : "unknown", said: s("said", 300),
    missing: Array.isArray(args.missing) ? args.missing.map((x) => String(x).slice(0, 80)).slice(0, 5) : [],
    next_date: /^\d{4}-\d{2}-\d{2}$/.test(s("next_date")) ? s("next_date") : null, contact: s("contact", 80) || null, reference: s("reference", 60) || null,
    summary_en: s("summary_en", 1200), summary_zh: s("summary_zh", 1200) || undefined,
  });
  switch (name) {
    case "send_digits": {
      const p = mayPress(s("digits", 20), { published: ctx.menu ?? null, heard: s("heard_option", 600) || null });
      return p.ok ? { effects: [{ kind: "dtmf", digits: p.digits }], reply: "Pressed." } : { effects: [], reply: p.why };
    }
    case "on_hold": return { effects: [{ kind: "hold", heard: s("heard", 200) }], reply: "Holding for you. Say nothing; you'll be brought back when a person answers." };
    case "log_status": {
      const r = recap(), ev = recapEvent(r, ctx.agency, ctx.now);
      return { effects: [...flags, { kind: "event", event: ev, norm: r.status, escalate: recapEscalates(r) }], reply: "Logged on the filing's timeline." };
    }
    case "need_owner": {
      const k = (["payment", "admission", "deadline"] as const).find((x) => x === s("kind")) ?? "deadline";
      const title = { en: `The agency asked for something only you can decide (${k}): ${s("detail", 200)}`, zh: `机构提出了需要您决定的事项（${{ payment: "付款", admission: "表态", deadline: "日期" }[k]}）：${s("detail", 200)}` };
      return { effects: [...flags, { kind: "owner", commit: k, detail: s("detail"), title }], reply: `Sent to the owner to decide. Say: "${COMMIT_LINE[k][ctx.lang]}"` };
    }
    case "hand_to_team": return { effects: [...flags, { kind: "team", reason: s("reason") }], reply: "The Placetta team has it. Tell them someone from the business will follow up." };
    case "recording_refused": return { effects: [{ kind: "stop_recording" }], reply: "Recording stopped. Nothing of this call will be recorded or transcribed. Say that's fine and carry on." };
    case "save_recap": {
      const r = recap();
      return { effects: [...flags, { kind: "recap", recap: r, event: recapEvent(r, ctx.agency, ctx.now), escalate: recapEscalates(r) }], reply: "Saved. Thank them and hang up." };
    }
  }
  return { effects: [], reply: "That isn't something Odelia can do on this call." };
}

/* ------------------------------ MCP, for OpenAI's brain ------------------------------ */

/** One JSON-RPC message from OpenAI's Realtime MCP client to Placetta's tools, and the answer. tools/call's work is done
 *  by `run`, which only ever sees the tools this call was given. */
export async function mcpAnswer(msg: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }, tools: ToolDef[], run: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<Record<string, unknown> | null> {
  const id = msg.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  switch (msg.method) {
    case "initialize": return ok({ protocolVersion: String(msg.params?.protocolVersion ?? "2025-06-18"), capabilities: { tools: {} }, serverInfo: { name: "placetta-voice", version: "1" } });
    case "notifications/initialized": return null;
    case "ping": return ok({});
    case "tools/list": return ok({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: { type: "object", properties: t.properties, required: t.required } })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!tools.some((t) => t.name === name)) return ok({ content: [{ type: "text", text: "That tool isn't available on this call." }], isError: true });
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Record<string, unknown>;
      const out = await run(name, args);
      return ok({ content: [{ type: "text", text: JSON.stringify(out) }], isError: out.ok === false });
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
}

/** The signed call token Placetta put in the SIP header when it bridged a call to OpenAI, read from the webhook. */
export function sipToken(ev: { type?: string; data?: { call_id?: string; sip_headers?: { name?: string; value?: string }[] } }): { callId: string; token: string } | null {
  if (ev.type !== "realtime.call.incoming" || !ev.data?.call_id) return null;
  const h = (ev.data.sip_headers ?? []).find((x) => String(x.name ?? "").toLowerCase() === "x-placetta-call");
  return h?.value ? { callId: ev.data.call_id, token: h.value } : null;
}

/** The registry's lines, for staff views and tests. */
export const agencyLines = () => Object.entries(AGENCY_LINES).map(([key, l]) => ({ key, ...l }));
