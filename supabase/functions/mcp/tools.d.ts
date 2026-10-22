// Types for tools.js (bundled from src/mcpServer.ts and src/toolArgs.ts by scripts/build-agent.mjs). Kept by hand.
export type Scope = "status" | "deadlines" | "readiness" | "plan" | "filings";
export type McpToolDef = { name: string; scope: Scope; title: string; description: string; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean }; outputSchema?: unknown; annotations: Record<string, unknown> };
export type FilingRow = { app_id: string; title: { en?: string; zh?: string } | null; agency: { en?: string; zh?: string } | null; status: string; confirmation_number: string | null; submitted_at: string | null; decided_at: string | null; updated_at: string };
export type McpCtx = { workspace: { name: string; state: unknown }; filings: FilingRow[]; today: string };
export type McpResource = { uri: string; name: string; title: string; description: string; mimeType: "application/json"; scope: Scope };
export type McpTemplate = { uriTemplate: string; name: string; title: string; description: string; mimeType: string; scope: Scope };
export type McpPrompt = { name: string; title: string; description: string; arguments: { name: string; description: string; required?: boolean }[]; scopes: Scope[] };
/** Resources, prompts and pagination, as logic.ts takes them. */
export type McpExtras = {
  page<T>(list: T[], cursor: unknown, size?: number): { items: T[]; next?: string };
  RESOURCE_TEMPLATES: McpTemplate[];
  listResources(ctx: McpCtx): McpResource[];
  resourceScope(uri: string): Scope | null;
  readResource(uri: string, ctx: McpCtx): { uri: string; mimeType: "application/json"; text: string };
  PROMPTS: McpPrompt[];
  getPrompt(name: string, args: Record<string, unknown>, ctx: McpCtx): { description: string; messages: unknown[] };
};
export declare const TOOLS: McpToolDef[];
export declare const SCOPES: Scope[];
export declare class ToolError extends Error { code: string; constructor(message: string, code?: string) }
export declare function runMcpTool(name: string, args: Record<string, unknown>, ctx: McpCtx): unknown;
export declare function checkArgs(schema: unknown, input: unknown): { ok: boolean; errors: string[]; unknown: string[] };
export declare function page<T>(list: T[], cursor: unknown, size?: number): { items: T[]; next?: string };
export declare const RESOURCE_TEMPLATES: McpTemplate[];
export declare function listResources(ctx: McpCtx): McpResource[];
export declare function resourceScope(uri: string): Scope | null;
export declare function readResource(uri: string, ctx: McpCtx): { uri: string; mimeType: "application/json"; text: string };
export declare const PROMPTS: McpPrompt[];
export declare function getPrompt(name: string, args: Record<string, unknown>, ctx: McpCtx): { description: string; messages: unknown[] };
