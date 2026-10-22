import { strings } from "./policy";
import type { Shield } from "./secure";

/* ------------------------------------------------------------------ *
 * Web pages the model reads through the vendor's own tools (web_fetch,
 * web_search) reach it inside the same call, before Placetta's code can
 * touch them. They can't be stripped first, so they're scored after:
 * every fetched page and search result in a response goes through the
 * shield like any other untrusted content. A poisoned page taints the run
 * (src/security/policy.ts then refuses payments, removals, settings and
 * unknown recipients) and is written to the audit trail, and its
 * addresses join the untrusted ones a message can't go to.
 * ------------------------------------------------------------------ */

type Block = { type: string; [k: string]: unknown };
const RESULT = /^(web_fetch_tool_result|web_search_tool_result|server_tool_result)$/;

export function scanServerResults(content: Block[], shield: Shield): number {
  let found = 0;
  for (const b of content) {
    if (!RESULT.test(String(b.type))) continue;
    const c = b.content as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const pages = Array.isArray(c) ? c : c ? [c] : [];
    for (const p of pages) {
      const url = String((p as Record<string, unknown>).url ?? ((p as Record<string, unknown>).content as Record<string, unknown> | undefined)?.url ?? "");
      // encrypted search snippets aren't readable here; the page text a fetch returns is
      const text = strings(p).filter(([k]) => k !== "encrypted_content" && k !== "encrypted_index" && k !== "type" && k !== "media_type" && k !== "url").map(([, v]) => v).join("\n").slice(0, 60000);
      if (!text.trim()) continue;
      const ing = shield.take(text, { source: "web", from: url, tool: String(b.type) }, url ? `the web page ${url}` : "a web page");
      if (ing.detection.verdict !== "clean") found++;
    }
  }
  return found;
}
