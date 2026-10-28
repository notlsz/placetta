// Run: deno test supabase/functions/_shared/stream_test.ts
// The streamed answer must be the same answer: text, tool calls, citations, stop reason and usage, whichever vendor
// streamed it, however the bytes were cut up on the way, and falling through to the next model when one breaks off.
import { anthropicAssembler, anthropicMessage, openaiAssembler, readSSE, sse } from "./stream.ts";
import { callModel } from "./llm.ts";

const enc = new TextEncoder();
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}\n got  ${JSON.stringify(a)}\n want ${JSON.stringify(b)}`); };
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
/** A body that arrives in the given pieces, each a little after the one before. */
const body = (pieces: string[], gap = 0) => new ReadableStream<Uint8Array>({
  async start(c) { for (const p of pieces) { if (gap) await new Promise((r) => setTimeout(r, gap)); c.enqueue(enc.encode(p)); } c.close(); },
});
/** Cut a string at awkward places: mid-line, mid-JSON, between \r and \n. */
const shred = (s: string, n = 7) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

const ANTHROPIC = [
  sse("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, usage: { input_tokens: 120, cache_read_input_tokens: 50, output_tokens: 1 } } }),
  ": keep-alive\n\n",
  sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Prepared your " } }),
  sse("ping", { type: "ping" }),
  sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "EIN application." } }),
  sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "citations_delta", citation: { type: "web_search_result_location", url: "https://www.irs.gov/ein", title: "IRS" } } }),
  sse("content_block_stop", { type: "content_block_stop", index: 0 }),
  sse("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} } }),
  sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"query\": \"ss-4" } }),
  sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: " form\"}" } }),
  sse("content_block_stop", { type: "content_block_stop", index: 1 }),
  sse("content_block_start", { type: "content_block_start", index: 2, content_block: { type: "web_search_tool_result", tool_use_id: "srv_1", content: [{ type: "web_search_result", url: "https://www.irs.gov/ein", title: "IRS" }] } }),
  sse("content_block_stop", { type: "content_block_stop", index: 2 }),
  sse("content_block_start", { type: "content_block_start", index: 3, content_block: { type: "tool_use", id: "toolu_1", name: "fill_fields", input: {} } }),
  sse("content_block_delta", { type: "content_block_delta", index: 3, delta: { type: "input_json_delta", partial_json: "" } }),
  sse("content_block_delta", { type: "content_block_delta", index: 3, delta: { type: "input_json_delta", partial_json: "{\"application_id\":\"a1\",\"fields\":[{\"label\":\"Line 1\"," } }),
  sse("content_block_delta", { type: "content_block_delta", index: 3, delta: { type: "input_json_delta", partial_json: "\"value\":\"Lucky Leaf Tea LLC\"}]}" } }),
  sse("content_block_stop", { type: "content_block_stop", index: 3 }),
  sse("content_block_start", { type: "content_block_start", index: 4, content_block: { type: "tool_use", id: "toolu_2", name: "check_progress", input: {} } }),
  sse("content_block_stop", { type: "content_block_stop", index: 4 }),
  sse("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 87, server_tool_use: { web_search_requests: 1 } } }),
  sse("message_stop", { type: "message_stop" }),
].join("").replace(/\n/g, "\r\n");

Deno.test("readSSE: events, comments and keep-alives, however the bytes are cut", async () => {
  const got: [string, string][] = [];
  await readSSE(body(shred("event: a\ndata: {\"x\":1}\n\n: comment\n\ndata: line one\ndata: line two\n\nevent: b\r\ndata: last\r\n")), (e, d) => got.push([e, d]));
  eq(got, [["a", "{\"x\":1}"], ["message", "line one\nline two"], ["b", "last"]], "three events, the unterminated last one included");
});

Deno.test("Anthropic: the streamed message equals the whole one, cut anywhere", async () => {
  for (const n of [1, 3, 7, 64, 100000]) {
    const texts: string[] = [];
    const m = await anthropicMessage(new Response(body(shred(ANTHROPIC, n)), { headers: { "content-type": "text/event-stream" } }), (t) => texts.push(t)) as Record<string, any>;
    eq(m.content[0], { type: "text", text: "Prepared your EIN application.", citations: [{ type: "web_search_result_location", url: "https://www.irs.gov/ein", title: "IRS" }] }, `text with its citation (pieces of ${n})`);
    eq(m.content[1].input, { query: "ss-4 form" }, "a research tool's input, joined from its pieces");
    eq(m.content[2].content[0].url, "https://www.irs.gov/ein", "the search results block arrives whole");
    eq(m.content[3], { type: "tool_use", id: "toolu_1", name: "fill_fields", input: { application_id: "a1", fields: [{ label: "Line 1", value: "Lucky Leaf Tea LLC" }] } }, "a tool call's input, joined from its pieces");
    eq(m.content[4].input, {}, "a tool call with no input pieces keeps {}");
    eq(m.stop_reason, "tool_use", "stop reason from message_delta");
    eq(m.usage, { input_tokens: 120, cache_read_input_tokens: 50, output_tokens: 87, server_tool_use: { web_search_requests: 1 } }, "usage: input from the start, output and searches from the end");
    eq(texts, ["Prepared your ", "Prepared your EIN application."], "onText gets the whole text so far, once per piece of text");
  }
});

Deno.test("Anthropic: a stream that breaks off or reports an error is an error, not a short answer", () => {
  const a = anthropicAssembler();
  a.push("message_start", JSON.stringify({ type: "message_start", message: { id: "m", content: [], usage: {} } }));
  a.push("content_block_start", JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
  a.push("content_block_delta", JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Half" } }));
  let threw = false; try { a.message(); } catch { threw = true; }
  ok(threw, "no message_stop: it broke off");
  const b = anthropicAssembler();
  b.push("error", JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
  threw = false; try { b.message(); } catch (e) { threw = (e as { code?: string }).code === "overloaded_error"; }
  ok(threw, "an error event carries the vendor's code");
});

Deno.test("OpenAI-compatible: text and several tool calls, their arguments joined from pieces", () => {
  const texts: string[] = [];
  const a = openaiAssembler((t) => texts.push(t));
  const chunk = (delta: unknown, finish: string | null = null, extra = {}) => JSON.stringify({ id: "c1", choices: [{ index: 0, delta, finish_reason: finish }], ...extra });
  a.push("", chunk({ role: "assistant", content: "" }));
  a.push("", chunk({ content: "Checking " }));
  a.push("", chunk({ content: "two things." }));
  a.push("", chunk({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "check_progress", arguments: "" } }] }));
  a.push("", chunk({ tool_calls: [{ index: 1, id: "call_b", type: "function", function: { name: "find_official_forms", arguments: "{\"place\":" } }] }));
  a.push("", chunk({ tool_calls: [{ index: 1, function: { arguments: "\"Flushing, NY\"}" } }] }));
  a.push("", chunk({}, "tool_calls"));
  a.push("", JSON.stringify({ id: "c1", choices: [], usage: { prompt_tokens: 300, completion_tokens: 40 } }));
  a.push("", "[DONE]");
  const c = a.completion() as Record<string, any>;
  eq(c.choices[0].message.content, "Checking two things.", "the text");
  eq(c.choices[0].message.tool_calls.map((t: any) => [t.id, t.function.name, t.function.arguments]), [["call_a", "check_progress", "{}"], ["call_b", "find_official_forms", "{\"place\":\"Flushing, NY\"}"]], "both calls, arguments joined");
  eq([c.choices[0].finish_reason, c.usage.prompt_tokens], ["tool_calls", 300], "finish reason and usage");
  eq(texts, ["Checking ", "Checking two things."], "onText: the whole text so far");
});

/* ---------------- callModel with onText: the same router, streaming ---------------- */

const payload = { model: "m", max_tokens: 500, system: "sys", messages: [{ role: "user", content: "Where are we?" }] };
const anthSSE = (text: string) => [
  sse("message_start", { type: "message_start", message: { id: "m", content: [], usage: { input_tokens: 10 } } }),
  sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
  ...text.split(" ").map((w, i) => sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: (i ? " " : "") + w } })),
  sse("content_block_stop", { type: "content_block_stop", index: 0 }),
  sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }),
  sse("message_stop", { type: "message_stop" }),
];
const oaiSSE = (text: string, usage = true) => [
  ...text.split(" ").map((w, i) => `data: ${JSON.stringify({ id: "x", choices: [{ index: 0, delta: { content: (i ? " " : "") + w }, finish_reason: null }] })}\n\n`),
  `data: ${JSON.stringify({ id: "x", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
  ...(usage ? [`data: ${JSON.stringify({ id: "x", choices: [], usage: { prompt_tokens: 9, completion_tokens: 4 } })}\n\n`] : []),
  "data: [DONE]\n\n",
];
const streamed = (pieces: string[], gap = 0) => new Response(body(pieces, gap), { status: 200, headers: { "content-type": "text/event-stream" } });

Deno.test("callModel streams from Anthropic and returns the same message shape", async () => {
  const sent: Record<string, unknown>[] = [], texts: string[] = [];
  const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return streamed(anthSSE("Two permits are ready.")); }) as unknown as typeof fetch;
  const r = await callModel((k) => ({ ANTHROPIC_API_KEY: "a" } as Record<string, string>)[k], { payload, role: "plan", research: false, beta: null }, "claude-sonnet-5-5", null, f, (t) => texts.push(t));
  ok(r.ok && r.model === "anthropic:claude-sonnet-5-5", "answered by Anthropic");
  eq(sent[0].stream, true, "the request asked for a stream");
  eq((r.data as any).content, [{ type: "text", text: "Two permits are ready." }], "the whole text");
  eq([(r.data as any).stop_reason, (r.data as any).usage.output_tokens], ["end_turn", 5], "stop reason and usage");
  eq(texts.at(-1), "Two permits are ready.", "the last onText is the whole answer");
  ok(texts.length === 4, "one onText per piece");
});

Deno.test("callModel streams from an OpenAI-compatible vendor (Gemini), asking for usage only where it's supported", async () => {
  const sent: Record<string, any>[] = [], texts: string[] = [];
  const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return streamed(oaiSSE("Nothing is due this week.", false)); }) as unknown as typeof fetch;
  const env = { GEMINI_API_KEY: "g", GEMINI_PAID: "1" } as Record<string, string>;
  const r = await callModel((k) => env[k], { payload, role: "plan", research: false, beta: null }, "x", null, f, (t) => texts.push(t));
  ok(r.ok && r.model === "gemini:gemini-3.8-flash", "answered by Gemini 3.8 Flash");
  ok(sent[0].stream === true && sent[0].stream_options === undefined, "Gemini is asked to stream, without stream_options");
  eq((r.data as any).content[0].text, "Nothing is due this week.", "the text");
  ok((r.data as any).usage.input_tokens > 0 && (r.data as any).usage.output_tokens > 0 && (r.data as any).usage.estimated === true, "no usage in the stream: estimated, never free");
  const g = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return streamed(oaiSSE("ok")); }) as unknown as typeof fetch;
  const r2 = await callModel((k) => ({ GROQ_API_KEY: "q" } as Record<string, string>)[k], { payload, role: "plan", research: false, beta: null }, "x", null, g, () => {});
  ok(sent.at(-1)!.stream_options?.include_usage === true && (r2.data as any).usage.input_tokens === 9, "Groq is asked for usage and it's used");
});

Deno.test("callModel streaming falls through: busy before a word, and broken off mid-answer", async () => {
  const texts: string[] = [];
  let n = 0;
  const f = (async (u: string) => {
    n++;
    // the plan role (2026-10-28): Sonnet first; busy before a word, then 3.8 Flash breaks off, then 2.5 Flash answers
    if (u.includes("anthropic")) return new Response("busy", { status: 429 });
    if (u.includes("googleapis") && n === 2) return streamed([...oaiSSE("Half an ans").slice(0, 2), `data: ${JSON.stringify({ error: { code: 503, message: "backend died" } })}\n\n`]);
    return streamed(oaiSSE("The whole answer."));
  }) as unknown as typeof fetch;
  const env = { GEMINI_API_KEY: "g", GEMINI_PAID: "1", ANTHROPIC_API_KEY: "a" } as Record<string, string>;
  const r = await callModel((k) => env[k], { payload, role: "plan", research: false, beta: null }, "claude-sonnet-5-5", null, f, (t) => texts.push(t));
  ok(r.ok && r.model === "gemini:gemini-2.5-flash", `Sonnet busy, 3.8 Flash broke off, 2.5 Flash answered (${r.model})`);
  eq((r.data as any).content[0].text, "The whole answer.", "the answer is the one that finished");
  ok(texts.includes("Half an") && texts.at(-1) === "The whole answer.", "the broken one's words showed, then the next model's started over");
});

Deno.test("callModel streaming: a server that answers whole (no event stream) is read the same", async () => {
  const f = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: "In one piece." }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 3 } }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  const texts: string[] = [];
  const r = await callModel((k) => ({ ANTHROPIC_API_KEY: "a" } as Record<string, string>)[k], { payload, role: "plan", research: false, beta: null }, "c", null, f, (t) => texts.push(t));
  eq([r.ok, (r.data as any).content[0].text, texts], [true, "In one piece.", ["In one piece."]], "parsed whole, onText once");
});

Deno.test("time to first word: streaming shows the first word when the model writes it, not when it finishes", async () => {
  // simulated latency: the model starts writing after 120 ms and writes a word every 15 ms, 30 words
  const words = Array.from({ length: 30 }, (_, i) => "word" + i).join(" ");
  const slow = (async () => { await new Promise((r) => setTimeout(r, 120)); return streamed(anthSSE(words), 15); }) as unknown as typeof fetch;
  const env = (k: string) => ({ ANTHROPIC_API_KEY: "a" } as Record<string, string>)[k];
  const t0 = performance.now(); let first = 0;
  const r = await callModel(env, { payload, role: "plan", research: false, beta: null }, "c", null, slow, () => { if (!first) first = performance.now() - t0; });
  const total = performance.now() - t0;
  ok(r.ok && first > 0 && first < total / 2, `first word at ${first.toFixed(0)} ms of ${total.toFixed(0)} ms`);
  console.log(`  time to first word, streamed: ${first.toFixed(0)} ms; the whole answer: ${total.toFixed(0)} ms (without streaming nothing shows before ${total.toFixed(0)} ms)`);
});
