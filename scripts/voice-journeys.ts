/* The voice journeys end to end, through the code each step runs, with the network simulated: the data-channel events a
   voice brain sends, the tools it calls, and what Placetta does with them. Run from scripts/agent-test.ts.
     1. An owner talks to Odelia in the app and a job starts: the brain's start_task becomes a typed request, and that
        request runs as a real job (runRounds, Odelia's own rules and tools, a scripted model).
     2. Odelia calls an agency (simulated): the call is allowed (filed, official line, open hours), opens with the
        disclosure, presses the menu, logs the status to the filing's timeline as a phone call, refuses to pay and asks
        the owner instead, and saves the recap; the transcript has nothing she shouldn't have said.
     3. An interpreter session at the counter: a bilingual transcript with the trade's terms translated as the trade
        says them, a bad translation caught, and the filing's own registry names in the glossary. */
import { journeyAsk as askTool, journeyRun as run, journeySay as say, journeyWorkspace as workspace } from "./journeys-test";
import { answerTool, pairLines, readEvent, type Heard } from "../src/voice/realtime";
import { agencyTool, planAgencyCall, type Effect, type FilingRow } from "../supabase/functions/_shared/voice_calls";
import { callSteps, commitAsked, commitmentsSaid, disclosesFirst, mergeTurns } from "../supabase/functions/_shared/voice_rules";
import { bilingualTranscript, GLOSSARY, interpreterInstructions, registryTerms } from "../supabase/functions/_shared/interpreter";
import { sessionConfig } from "../supabase/functions/_shared/voice_brain";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;
const env = (k: string) => ({ OPENAI_API_KEY: "sk-test", OPENAI_SIP_PROJECT: "proj_test", TELNYX_API_KEY: "k", TELNYX_ASSISTANT_ID: "a" } as Record<string, string>)[k];

export async function voiceJourneys(ok: Ok, eq: Eq) {
  /* ---------------------------------------------------------------- 1. talk, and a job starts */
  console.log("\n# Voice journey: an owner talks to Odelia in the app and a job starts");
  {
    const events: Record<string, unknown>[] = [
      { type: "response.output_audio_transcript.done", transcript: "Hi, it's Odelia, Placetta's AI assistant. What can I do for you?" },
      { type: "input_audio_buffer.speech_started" },
      { type: "conversation.item.input_audio_transcription.completed", transcript: "帮我查一下圣何塞新店需要哪些许可。" },
      { type: "response.function_call_arguments.done", call_id: "fc_1", name: "start_task", arguments: JSON.stringify({ request: "Find every permit the new San José milk tea store needs" }) },
    ];
    const heard: Heard[] = [], asked: string[] = [], toServer: { name: string; args: Record<string, unknown> }[] = [];
    let answer = "";
    for (const e of events) {
      const r = readEvent(e);
      if (r.heard) heard.push({ ...r.heard, at: heard.length });
      if (r.tool) answer = await answerTool(r.tool, { mode: "talk", ask: t => asked.push(t),
        // the voice function's answer to start_task: it records the action and hands the request back to the app
        call: async (name, args) => { toServer.push({ name, args }); return { ok: true, result: "Started in the chat.", start: String(args.request) }; } });
    }
    ok(disclosesFirst(heard[0].text), "she opens by saying she's an AI", heard[0]);
    eq(heard.map(h => h.who), ["odelia", "them"], "captions for both sides");
    eq(toServer, [{ name: "start_task", args: { request: "Find every permit the new San José milk tea store needs" } }], "the tool goes to Placetta's server, with the person's own access");
    eq(asked, ["Find every permit the new San José milk tea store needs"], "and the request goes into the chat like a typed one");
    eq(JSON.parse(answer), { ok: true, result: "Started in the chat." }, "the brain hears that it started");
    const job = await run({ ws: workspace(), prompt: asked[0], script: [
      () => askTool(["find_official_forms", { business: "milk tea shop", place: "San Jose, CA", hires_staff: true, new_us_company: false, builds_out: true, exterior_sign: true }]),
      () => say("San José needs a business tax certificate, a health permit from Santa Clara County, a seller's permit, and a sign permit."),
    ] });
    const found = job.calls.find(c => c.name === "find_official_forms");
    ok(found?.ok && ((found.parsed?.forms ?? []) as { official_form_id: string }[]).some(f => f.official_form_id === "sj-business-tax"), "the job ran Odelia's own tools on the registry", found?.out.slice(0, 200));
    ok(/business tax certificate/.test(job.text), "and answered", job.text);
    const rehearse = await answerTool({ name: "log_status", args: { status: "approved", said: "x" } }, { mode: "rehearse", ask: t => asked.push(t), call: async () => { throw new Error("a rehearsal never reaches the server"); } });
    ok(/Rehearsal/.test(rehearse) && asked.length === 1, "a rehearsal runs nothing");
  }

  /* ---------------------------------------------------------------- 2. Odelia calls the agency */
  console.log("\n# Voice journey: Odelia calls San José's business tax line about a filing (simulated)");
  {
    const filing: FilingRow = { id: "f-sj", workspace_id: "ws", title: { en: "Business tax certificate", zh: "营业税证书" }, agency: { en: "City of San José", zh: "圣何塞市" },
      status: "submitted", confirmation_number: "BT-778812", submitted_at: "2026-10-12T18:00:00Z", payload: { official: "sj-business-tax" } };
    const at = new Date("2026-10-27T18:00:00Z");   // a Tuesday, 11:00 in San José
    const plan = planAgencyCall({ filing, business: "Lucky Leaf Tea", lang: "en", now: at, env });
    ok(plan.ok, "a filed application, an official line, inside its hours: the call may be placed", plan);
    if (!plan.ok) return;
    eq([plan.line.number, plan.brain, plan.menu], ["+14085357055", "openai_mini", "2"], "the registry's number, the speech-to-speech brain (mini for a status call), the menu option the city's page gives");
    eq(plan.spec.greeting, "Hi, this is Odelia, an AI assistant calling for Lucky Leaf Tea about application BT-778812. This call is recorded and transcribed; if you'd rather it isn't, just say so.", "the disclosure first, with the recording announced");
    const cfg = sessionConfig("openai", { ...plan.spec, toolUrl: "https://placetta.test/functions/v1/odelia-voice?mcp=1", token: "tok" }, env) as { instructions: string; tools: { allowed_tools: string[] }[] };
    ok(cfg.instructions.startsWith("Start the conversation by saying exactly this") && /B T - 7 7 8 8 1 2/.test(cfg.instructions), "the playbook's script, with the confirmation number spelled out", cfg.instructions.slice(0, 400));
    eq(callSteps({ lang: "en", business: "x", filing: { title: "t", agency: "a", confirmation: "1", submitted: null, status: "submitted" } }).map(s => s.step), ["greet", "identify", "ask", "recap"], "greet, identify, ask, recap");
    eq(cfg.tools[0].allowed_tools, ["send_digits", "log_status", "need_owner", "hand_to_team", "recording_refused", "save_recap"], "and only the call's own tools");

    // the conversation, as the brain would drive it; each tool's effects as odelia-voice applies them
    const timeline: { source: string; title: string }[] = [], approvals: string[] = [], team: string[] = [], pressed: string[] = [];
    let summary = "";
    const apply = (effects: Effect[]) => { for (const e of effects) {
      if (e.kind === "dtmf") pressed.push(e.digits);
      if ((e.kind === "event" || e.kind === "recap") && !timeline.length) timeline.push({ source: e.event.source, title: e.event.title.en });
      if (e.kind === "recap") summary = e.recap.summary_en;
      if (e.kind === "owner") approvals.push(e.title.en);
      if (e.kind === "team") team.push(e.reason);
    } };
    const ctx = { agency: "City of San José, Business Tax", now: at, lang: "en" as const };
    apply(agencyTool("send_digits", { digits: "2" }, ctx).effects);
    const clerk = ["Business tax, this is Dana.", "Let me look that up. BT-778812 is in review; we still need the copy of your seller's permit. Can you pay the $195 balance over the phone today?", "Okay. Anything else?"];
    eq(commitAsked(clerk[1]), "payment", "the clerk asks for a payment");
    const owner = agencyTool("need_owner", { kind: "payment", detail: "The city asks for the $195 business tax balance" }, ctx);
    apply(owner.effects);
    ok(/can't make payments on a call/.test(owner.reply), "Odelia says she can't pay on a call", owner.reply);
    apply(agencyTool("log_status", { status: "needs_info", said: "In review; needs a copy of the seller's permit", missing: ["copy of the seller's permit"] }, ctx).effects);
    apply(agencyTool("save_recap", { status: "needs_info", said: "In review; needs a copy of the seller's permit", missing: ["copy of the seller's permit"], contact: "Dana", reference: "BT-778812",
      summary_en: "San José has the business tax application in review and needs a copy of the seller's permit. They asked for the $195 balance; that went to the owner.", summary_zh: "圣何塞市正在审核营业税申请，需要销售许可证复印件。对方要求支付 195 美元余额，已交给业主决定。" }, ctx).effects);
    eq(pressed, ["2"], "the menu option pressed");
    eq(timeline, [{ source: "phone_call", title: "City of San José, Business Tax said by phone: needs more information; still needs copy of the seller's permit" }], "the status is on the filing's timeline, as a phone call");
    ok(approvals.length === 1 && /\$195/.test(approvals[0]), "the payment went to the owner as a decision, not paid", approvals);
    ok(/review/.test(summary), "the recap is saved");
    eq(team, [], "nothing needed the team");
    const transcript = mergeTurns({ who: "agency", segs: clerk.map((t, i) => ({ start: 3 + i * 9, text: t })) },
      { who: "odelia", segs: [{ start: 0, text: plan.spec.greeting }, { start: 6, text: "The confirmation number is B T 7 7 8 8 1 2." }, { start: 15, text: "I can't make payments on a call. I'll send this to the owner to approve." }, { start: 24, text: "Let me read that back: in review, you need the seller's permit copy. Thank you, Dana." }] });
    ok(transcript[0].who === "odelia" && disclosesFirst(transcript[0].text), "the transcript starts with the disclosure");
    eq(commitmentsSaid(transcript.filter(t => t.who === "odelia").map(t => t.text)), [], "and has nothing Odelia shouldn't have agreed to");
    const closed = planAgencyCall({ filing, business: "Lucky Leaf Tea", lang: "en", now: new Date("2026-10-31T18:00:00Z"), env });
    ok(!closed.ok && closed.code === "closed", "on a Saturday the call waits for business hours");
  }

  /* ---------------------------------------------------------------- 3. the interpreter */
  console.log("\n# Voice journey: an interpreter session at the counter");
  {
    const terms = [...registryTerms([{ title: { en: "Health permit to operate a food facility", zh: "食品设施营业卫生许可证" }, agency: { en: "Santa Clara County Department of Environmental Health", zh: "圣克拉拉县环境卫生局" } }]), ...GLOSSARY];
    const text = interpreterInstructions({ business: "Lucky Leaf Tea", terms, place: "counter" });
    ok(text.includes("Health permit to operate a food facility = 食品设施营业卫生许可证") && text.includes("grease interceptor = 隔油池"), "the glossary carries the trade's words and the filing's own registry names");
    const said: Heard[] = [
      { who: "them", at: 1, text: "You need a grease interceptor, and the plan check has to be approved before the final inspection." },
      { who: "odelia", at: 4, text: "您需要安装隔油池，而且图纸审查必须在最终验收之前通过。" },
      { who: "them", at: 9, text: "我们申请的是 41 类酒牌，什么时候可以检查？" },
      { who: "odelia", at: 12, text: "We applied for a Type 41 license. When can the inspection be?" },
      { who: "them", at: 16, text: "Bring the plan check number next time." },
      { who: "odelia", at: 18, text: "下次请带上支票号码。" },
    ];
    const tx = bilingualTranscript(pairLines(said));
    eq(tx.map(l => [l.who, l.lang]), [["clerk", "en"], ["owner", "zh"], ["clerk", "en"]], "a bilingual transcript, each line with its translation");
    ok(!tx[0].missing_terms && !tx[1].missing_terms, "grease interceptor, plan check, final inspection and Type 41 came through as the trade says them", tx.slice(0, 2));
    eq(tx[2].missing_terms, ["plan check"], "and \"plan check\" translated as a bank cheque is caught for the owner to check");
  }
}
