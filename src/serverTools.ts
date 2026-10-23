/* The vendor's own research tools (web_fetch, web_search) run inside the model call: the call returns the request
   (server_tool_use) and its result (web_fetch_tool_result, web_search_tool_result) as blocks of the assistant's turn.
   A long one can stop the call midway (stop_reason "pause_turn"): the turn is sent back as it is and the next call
   carries on, so one turn arrives as two assistant messages, the first ending on a request whose result is in the
   second. Anthropic refuses the whole conversation if any request isn't followed by its result ("web_fetch tool use
   ... was found without a corresponding web_fetch_tool_result block"), which stopped a production run on 2026-10-23
   (the probe's EIN case). So before each call the conversation is put right:
     - consecutive assistant messages are one turn: they're merged, so a paused request sits with its result
     - in any turn but the last one sent (a pause being continued), a request with no result is dropped, and so is a
       result with no request
   Nothing else changes, and a conversation that's already right comes back as the same array. */

type Block = { type?: string; id?: unknown; tool_use_id?: unknown; [k: string]: unknown };
type Msg = { role: string; content: unknown };

const SERVER_USE = "server_tool_use";
const isResult = (b: Block) => typeof b.type === "string" && b.type !== "tool_result" && b.type.endsWith("_tool_result");
const asBlocks = (c: unknown): Block[] => (Array.isArray(c) ? (c as Block[]) : typeof c === "string" && c ? [{ type: "text", text: c }] : []);

export function pairServerTools<M extends Msg>(messages: M[]): M[] {
  let changed = false;
  const merged: M[] = [];
  for (const m of messages) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === "assistant" && m.role === "assistant") {
      merged[merged.length - 1] = { ...prev, content: [...asBlocks(prev.content), ...asBlocks(m.content)] };
      changed = true;
    } else merged.push(m);
  }
  const out = merged.map((m, i) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
    const last = i === merged.length - 1;
    const bs = m.content as Block[];
    const uses = new Set(bs.filter((b) => b.type === SERVER_USE).map((b) => String(b.id)));
    const results = new Set(bs.filter(isResult).map((b) => String(b.tool_use_id)));
    const keep = bs.filter((b) => (b.type === SERVER_USE ? last || results.has(String(b.id)) : isResult(b) ? uses.has(String(b.tool_use_id)) : true));
    if (keep.length === bs.length) return m;
    changed = true;
    return { ...m, content: keep.length ? keep : [{ type: "text", text: "(looked something up)" }] };
  });
  return changed ? out : messages;
}
