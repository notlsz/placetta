// Placetta's MCP server tools, resources and prompts (src/mcpServer.ts) and the argument checker (src/toolArgs.ts), for
// the mcp function. Built by `npm run build:agent` into supabase/functions/mcp/tools.js.
export { TOOLS, SCOPES, ToolError, runMcpTool, page, PROMPTS, RESOURCE_TEMPLATES, listResources, readResource, resourceScope, getPrompt } from "../mcpServer";
export { checkArgs } from "../toolArgs";
