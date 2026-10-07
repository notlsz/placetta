// Claude picks one tool per step from the compact page state. The worker carries the tool out and the guards apply
// whatever is chosen. Tests swap in a scripted model.
import type { PageState } from "./guards.ts";
import { headingOf, shortText } from "./page.ts";
import type { Filing } from "./types.ts";

export type ToolCall = { name: string; input: Record<string, unknown> };
export type StepInput = { filing: Filing; agency: string; state: PageState; recent: string[]; note?: string };
export interface Model { calls: number; next(i: StepInput): Promise<ToolCall> }

const str = { type: "string" } as const;
export const TOOLS = [
  { name: "fill", description: "Type an approved value into a text field. The value must be exactly one of the approved values.", input_schema: { type: "object", properties: { selector: str, value: str }, required: ["selector", "value"] } },
  { name: "fill_login", description: "On the portal's own sign-in page, type the saved username or password. You never see the values.", input_schema: { type: "object", properties: { selector: str, which: { type: "string", enum: ["username", "password"] } }, required: ["selector", "which"] } },
  { name: "select", description: "Choose an option in a dropdown. The option must equal an approved value.", input_schema: { type: "object", properties: { selector: str, option: str }, required: ["selector", "option"] } },
  { name: "check", description: "Tick or untick a checkbox or radio button.", input_schema: { type: "object", properties: { selector: str, on: { type: "boolean" } }, required: ["selector", "on"] } },
  { name: "click", description: "Click a button or link.", input_schema: { type: "object", properties: { selector: str }, required: ["selector"] } },
  { name: "upload", description: "Attach one of the approved files to a file input.", input_schema: { type: "object", properties: { selector: str, attachment: str }, required: ["selector", "attachment"] } },
  { name: "wait", description: "Wait for the page (at most 10000 ms).", input_schema: { type: "object", properties: { ms: { type: "number" } }, required: ["ms"] } },
  { name: "need_person", description: "Stop and ask the customer: anything you can't do from the approved values, any question the form asks that the values don't answer.", input_schema: { type: "object", properties: { reason: str, message: str }, required: ["reason", "message"] } },
  { name: "done", description: "The agency confirmed the submission on this page.", input_schema: { type: "object", properties: { confirmation_number: str, summary: str }, required: ["confirmation_number", "summary"] } },
];

export function prompt(i: StepInput): string {
  const p = i.filing.payload, s = i.state;
  const controls = s.controls.map((c) => `- ${c.selector} | ${c.type}${c.label ? ` | "${c.label}"` : ""}${c.value ? ` | now: ${c.value}` : ""}${c.options ? ` | options: ${c.options.join(" / ")}` : ""}${c.checked !== undefined ? ` | ${c.checked ? "checked" : "unchecked"}` : ""}`).join("\n");
  return [
    `You are filing ${p.form?.en ?? "a form"} (${p.official}) with ${i.agency} for the customer, who approved exactly these values. Use only these values. Never invent, reword or combine values. If the page asks for something they don't cover, call need_person.`,
    "",
    "Approved values:",
    ...(p.fields ?? []).filter((f) => f.value).map((f) => `- ${f.label.en}: ${f.value}`),
    "",
    `Approved files: ${[...(p.attachments ?? []).map((a) => a.name), ...(p.pdf_path ? ["the filled official form (form.pdf)"] : [])].join(", ") || "none"}`,
    "",
    `Page: ${s.url}`, `Title: ${s.title}`, `Heading: ${headingOf(s)}`,
    "", "Form controls (selector | type | label | current):", controls || "(none)",
    "", "Buttons:", ...s.buttons.map((b) => `- ${b.selector}`),
    "", "Links:", ...s.links.slice(0, 20).map((l) => `- ${l.selector}`),
    "", "Visible text:", shortText(s),
    "", `Your last steps: ${i.recent.slice(-10).join("; ") || "none"}`,
    ...(i.note ? ["", `Note: ${i.note}`] : []),
    "", "Choose exactly one tool. Fill every field on the page before continuing. Call done only when the agency shows a confirmation.",
  ].join("\n");
}

export class AnthropicModel implements Model {
  calls = 0;
  private key: string; private model: string;
  constructor(key: string, model = process.env.FILER_MODEL ?? "claude-sonnet-5-5") { this.key = key; this.model = model; }
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: this.model, max_tokens: 800, tools: TOOLS, tool_choice: { type: "any" }, messages: [{ role: "user", content: prompt(i) }] }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`model error ${res.status}`);
    const body = await res.json() as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
    const use = body.content?.find((c) => c.type === "tool_use");
    if (!use?.name) throw new Error("model chose no tool");
    return { name: use.name, input: use.input ?? {} };
  }
}
