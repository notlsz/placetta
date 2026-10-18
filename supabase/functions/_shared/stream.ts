// Streaming model answers, token by token, assembled into the same complete message a non-streaming call returns.
// Two formats: Anthropic's Messages stream, and the OpenAI-compatible chat stream that Gemini, OpenAI, DeepSeek,
// OpenRouter, Groq and Cerebras all speak. Plain TypeScript with nothing but fetch's ReadableStream, so the app
// (src/live.ts, src/cloud/api.ts), the agent function and agent-run (through ./llm.ts) share this one parser.
//
// onText always gets the whole text so far for this one answer (not the newest piece), so whoever shows it can simply
// replace what's on screen; a caller that falls through to another model starts again from that model's first words.

type Block = Record<string, unknown>;
export type OnText = (text: string) => void;

/** A stream that ended in the middle, or with an error event from the vendor. */
export class StreamError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** Server-sent events from a response body: each event's name and its data, in order. Comments and keep-alives are
 *  skipped. Stops reading when the signal is aborted. */
export async function readSSE(body: ReadableStream<Uint8Array>, on: (event: string, data: string) => void, signal?: AbortSignal): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "", event = "", data: string[] = [];
  const dispatch = () => { if (data.length) on(event || "message", data.join("\n")); event = ""; data = []; };
  const line = (l: string) => {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return;   // a comment, or a keep-alive
    const k = l.indexOf(":");
    const field = k < 0 ? l : l.slice(0, k);
    let v = k < 0 ? "" : l.slice(k + 1);
    if (v.startsWith(" ")) v = v.slice(1);
    if (field === "event") event = v;
    else if (field === "data") data.push(v);
  };
  const stop = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw new StreamError("cancelled", "Stopped");
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        line(buf.slice(0, i).replace(/\r$/, ""));
        buf = buf.slice(i + 1);
      }
    }
    buf += dec.decode();
    if (buf) line(buf.replace(/\r$/, ""));
    dispatch();
  } finally {
    signal?.removeEventListener("abort", stop);
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

const textOf = (blocks: Block[]) => blocks.filter((b) => b && b.type === "text").map((b) => String(b.text ?? "")).join("");

/** Anthropic's Messages stream, put back together: text, tool calls (their input arrives as pieces of JSON), the
 *  research tools' blocks, citations, the stop reason and the usage. */
export function anthropicAssembler(onText?: OnText) {
  let msg: Block | null = null, usage: Block = {}, error: Block | null = null, stopped = false;
  const blocks: Block[] = [];
  const json = new Map<number, string>();
  return {
    push(event: string, raw: string) {
      let d: Block;
      try { d = JSON.parse(raw); } catch { return; }
      const type = String(d.type ?? event);
      const i = Number(d.index ?? -1);
      if (type === "message_start") {
        const m = (d.message ?? {}) as Block;
        msg = { ...m, content: [] };
        usage = { ...((m.usage ?? {}) as Block) };
      } else if (type === "content_block_start") {
        blocks[i] = { ...((d.content_block ?? {}) as Block) };
        if (blocks[i].type === "text" && blocks[i].text) onText?.(textOf(blocks));
      } else if (type === "content_block_delta") {
        const b = blocks[i] ?? (blocks[i] = { type: "text", text: "" });
        const delta = (d.delta ?? {}) as Block;
        if (delta.type === "text_delta") { b.text = String(b.text ?? "") + String(delta.text ?? ""); onText?.(textOf(blocks)); }
        else if (delta.type === "input_json_delta") json.set(i, (json.get(i) ?? "") + String(delta.partial_json ?? ""));
        else if (delta.type === "citations_delta") b.citations = [...((b.citations as unknown[]) ?? []), delta.citation];
        else if (delta.type === "thinking_delta") b.thinking = String(b.thinking ?? "") + String(delta.thinking ?? "");
        else if (delta.type === "signature_delta") b.signature = String(delta.signature ?? "");
      } else if (type === "content_block_stop") {
        const b = blocks[i];
        if (b && json.has(i)) {
          const raw = json.get(i)!.trim();
          try { b.input = raw ? JSON.parse(raw) : {}; } catch { b.input = {}; }
          json.delete(i);
        }
      } else if (type === "message_delta") {
        const delta = (d.delta ?? {}) as Block;
        if (msg && delta.stop_reason !== undefined) msg.stop_reason = delta.stop_reason;
        if (msg && delta.stop_sequence !== undefined) msg.stop_sequence = delta.stop_sequence;
        if (d.usage) usage = { ...usage, ...(d.usage as Block) };
      } else if (type === "message_stop") stopped = true;
      else if (type === "error") error = (d.error ?? d) as Block;
    },
    /** The whole message, as the non-streaming call would have returned it. Throws when the stream broke off. */
    message(): Block {
      if (error) throw new StreamError(String(error.type ?? "upstream_error"), String(error.message ?? "The model's stream ended with an error."));
      if (!msg) throw new StreamError("upstream_error", "The model's stream ended before it started.");
      if (!stopped && !msg.stop_reason) throw new StreamError("upstream_error", "The model's stream ended in the middle.");
      // a tool call whose last piece never arrived still gets its input
      for (const [k, raw] of json) { try { blocks[k].input = JSON.parse(raw); } catch { blocks[k].input = {}; } }
      return { ...msg, content: blocks.filter(Boolean), usage };
    },
    text: () => textOf(blocks),
  };
}

/** The OpenAI-compatible chat stream, put back together as one chat completion (the shape ./llm.ts fromOpenAI reads):
 *  the text, every tool call with its arguments joined from their pieces, the finish reason and the usage. */
export function openaiAssembler(onText?: OnText) {
  let id = "", text = "", finish = "", usage: Block | undefined, error: Block | null = null, seen = false, done = false;
  const calls: { id: string; name: string; args: string }[] = [];
  return {
    push(_event: string, raw: string) {
      if (raw.trim() === "[DONE]") { done = true; return; }
      let d: Block;
      try { d = JSON.parse(raw); } catch { return; }
      if (d.error) { error = d.error as Block; return; }
      seen = true;
      if (!id && d.id) id = String(d.id);
      if (d.usage) usage = d.usage as Block;
      for (const ch of (d.choices as Block[]) ?? []) {
        const delta = (ch.delta ?? ch.message ?? {}) as Block;
        if (typeof delta.content === "string" && delta.content) { text += delta.content; onText?.(text); }
        for (const tc of (delta.tool_calls as Block[]) ?? []) {
          const k = typeof tc.index === "number" ? tc.index : calls.length;
          const c = calls[k] ?? (calls[k] = { id: "", name: "", args: "" });
          const fn = (tc.function ?? {}) as Block;
          if (tc.id) c.id = String(tc.id);
          if (fn.name) c.name += String(fn.name);
          if (fn.arguments) c.args += String(fn.arguments);
        }
        if (ch.finish_reason) finish = String(ch.finish_reason);
      }
    },
    completion(): Block {
      if (error) throw new StreamError(String(error.code ?? error.type ?? "upstream_error"), String(error.message ?? "The model's stream ended with an error."));
      if (!seen) throw new StreamError("upstream_error", "The model's stream ended before it started.");
      // every vendor ends a whole answer with a finish reason (and most with [DONE]); without either it broke off,
      // perhaps in the middle of a tool call's arguments, which must never be run half-written
      if (!finish && !done) throw new StreamError("upstream_error", "The model's stream ended in the middle.");
      const tool_calls = calls.filter((c) => c && c.name).map((c, k) => ({ id: c.id || `call_${k}_${Date.now().toString(36)}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } }));
      return { id, choices: [{ message: { content: text || null, ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: finish || (tool_calls.length ? "tool_calls" : "stop") }], ...(usage ? { usage } : {}) };
    },
    text: () => text,
  };
}

const isStream = (res: Response) => /text\/event-stream/i.test(res.headers.get("content-type") ?? "");

/** An Anthropic answer from a response: streamed when the server streamed it, or read whole when it answered in one
 *  piece (an older proxy, a test stand-in). Either way the same message comes back. */
export async function anthropicMessage(res: Response, onText?: OnText, signal?: AbortSignal): Promise<Block> {
  if (!isStream(res) || !res.body) {
    const m = JSON.parse(await res.text()) as Block;
    const t = textOf((m.content as Block[]) ?? []);
    if (t) onText?.(t);
    return m;
  }
  const a = anthropicAssembler(onText);
  await readSSE(res.body, a.push, signal);
  return a.message();
}

/** An OpenAI-compatible chat completion from a response, streamed or whole. */
export async function openaiCompletion(res: Response, onText?: OnText, signal?: AbortSignal): Promise<Block> {
  if (!isStream(res) || !res.body) {
    const d = JSON.parse(await res.text()) as Block;
    const m = (((d.choices as Block[]) ?? [])[0]?.message ?? {}) as Block;
    if (typeof m.content === "string" && m.content) onText?.(m.content);
    return d;
  }
  const a = openaiAssembler(onText);
  await readSSE(res.body, a.push, signal);
  return a.completion();
}

/** Server-sent event text for one event. */
export const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
