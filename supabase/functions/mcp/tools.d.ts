// Types for tools.js (bundled from src/mcpServer.ts and src/toolArgs.ts by scripts/build-agent.mjs). Kept by hand.
export type Scope = "status" | "deadlines" | "readiness" | "plan" | "filings";
export type McpToolDef = { name: string; scope: Scope; title: string; description: string; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean }; annotations: Record<string, unknown> };
export type FilingRow = { app_id: string; title: { en?: string; zh?: string } | null; agency: { en?: string; zh?: string } | null; status: string; confirmation_number: string | null; submitted_at: string | null; decided_at: string | null; updated_at: string };
export declare const TOOLS: McpToolDef[];
export declare const SCOPES: Scope[];
export declare class ToolError extends Error {}
export declare function runMcpTool(name: string, args: Record<string, unknown>, ctx: { workspace: { name: string; state: unknown }; filings: FilingRow[]; today: string }): unknown;
export declare function checkArgs(schema: unknown, input: unknown): { ok: boolean; errors: string[]; unknown: string[] };
