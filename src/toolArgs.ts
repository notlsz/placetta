/* Checks a tool call's arguments against the tool's own JSON schema before it runs, and says exactly what's wrong so the
   model can fix the call in the next round. The subset of JSON Schema the tools use: type (string, number, integer,
   boolean, object, array, or a list of them), enum, required, properties, items, minimum and maximum, minItems and
   maxItems, maxLength. Arguments the schema doesn't name are reported separately (unknown) and never block a call: the
   tools ignore them, and a model adding a harmless extra key shouldn't cost a round. Pure, shared by the agent loop
   (runTool in src/live.ts) and the live evaluation's tool-calling checks (scripts/live-eval.ts). */

export type Schema = {
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  minimum?: number; maximum?: number;
  minItems?: number; maxItems?: number;
  maxLength?: number;
  description?: string;
};
export type ArgCheck = { ok: boolean; errors: string[]; unknown: string[] };

const typeOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);
const fits = (want: string, got: string) => want === got || (want === "number" && got === "integer");
const show = (v: unknown) => { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 40 ? s.slice(0, 37) + "..." : s; };

function walk(s: Schema, v: unknown, at: string, errors: string[], unknown: string[]) {
  if (errors.length >= 8) return;
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  const got = typeOf(v);
  if (types.length && !types.some(t => fits(t, got))) {
    const hint = types.includes("integer") && got === "string" && /^-?\d+$/.test(String(v)) ? ` (send ${v} without quotes)` : types.includes("array") && got === "string" ? " (send a list, even of one)" : "";
    errors.push(`${at || "arguments"} must be ${types.join(" or ")}, got ${got} ${show(v)}${hint}`);
    return;
  }
  if (s.enum && !s.enum.some(e => e === v)) { errors.push(`${at} must be one of ${s.enum.map(e => JSON.stringify(e)).join(", ")}, got ${show(v)}${s.description ? ` (${s.description})` : ""}`); return; }
  if (typeof v === "number") {
    if (s.minimum !== undefined && v < s.minimum) errors.push(`${at} must be at least ${s.minimum}, got ${v}`);
    if (s.maximum !== undefined && v > s.maximum) errors.push(`${at} must be at most ${s.maximum}, got ${v}`);
  }
  if (typeof v === "string" && s.maxLength !== undefined && v.length > s.maxLength) errors.push(`${at} is ${v.length} characters; the most is ${s.maxLength}`);
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) errors.push(`${at} needs at least ${s.minItems} item${s.minItems === 1 ? "" : "s"}`);
    if (s.maxItems !== undefined && v.length > s.maxItems) errors.push(`${at} takes at most ${s.maxItems} items, got ${v.length}`);
    if (s.items) v.forEach((x, k) => walk(s.items!, x, `${at}[${k}]`, errors, unknown));
  }
  if (got === "object" && (s.properties || s.required)) {
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (o[k] === undefined || o[k] === null || o[k] === "") errors.push(`${at ? at + "." : ""}${k} is required`);
    for (const [k, x] of Object.entries(o)) {
      const p = s.properties?.[k];
      if (!p) { if (s.properties) unknown.push(at ? `${at}.${k}` : k); continue; }
      // a null for an optional argument means "not given": the tools read it that way
      if (x === null && !(s.required ?? []).includes(k)) continue;
      walk(p, x, at ? `${at}.${k}` : k, errors, unknown);
    }
  }
}

/** Validates arguments against a tool's input schema. */
export function checkArgs(schema: Schema | undefined, input: unknown): ArgCheck {
  const errors: string[] = [], unknown: string[] = [];
  if (!schema) return { ok: true, errors, unknown };
  walk({ ...schema, type: schema.type ?? "object" }, input ?? {}, "", errors, unknown);
  return { ok: errors.length === 0, errors, unknown };
}

/** The error the model reads when a call doesn't fit: every problem at once, then what the tool takes. */
export function argError(name: string, schema: Schema, c: ArgCheck): string {
  const props = Object.entries(schema.properties ?? {}).map(([k, p]) => `${k}${(schema.required ?? []).includes(k) ? " (required)" : ""}: ${p.enum ? p.enum.map(e => JSON.stringify(e)).join("|") : Array.isArray(p.type) ? p.type.join("|") : p.type ?? "any"}`);
  return `Invalid arguments for ${name}: ${c.errors.join("; ")}. Nothing was done. ${name} takes ${props.join(", ") || "no arguments"}. Fix the call and try again.`;
}
