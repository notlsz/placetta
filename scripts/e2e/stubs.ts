// Stand-ins for the outside services the edge functions call: Anthropic (a scripted model, so the real agent loop and
// the real tools run), Telnyx, Linq (iMessage), Stripe and Resend. globalThis.fetch is patched in the function runtime so a request to
// one of their hosts is answered here and recorded; anything else that isn't local is refused, so nothing leaves the
// sandbox. Each stub checks requests the way the real API would (shapes, required fields, the documented rules the
// functions rely on) and answers with realistic bodies.

export type Rec = { service: "anthropic" | "telnyx" | "linq" | "stripe" | "resend"; method: string; path: string; headers: Record<string, string>; body: any; raw: string; status: number; at: number };
export const recorded: Rec[] = [];
export const blockedHosts: string[] = [];
export const stubErrors: string[] = [];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rid = (p: string) => `${p}${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

/* ------------------------------ Telnyx ------------------------------ */

export const telnyxState = { blocked: new Set<string>(), failActions: new Set<string>(), messages: 0 };

/** A texted photo, as Telnyx serves inbound MMS media (a 1x1 PNG). */
export const MMS_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
function telnyx(req: Request, path: string, body: any): Response {
  if (req.method === "GET" && path.startsWith("/media/")) return new Response(MMS_PNG, { status: 200, headers: { "Content-Type": "image/png" } });
  if (!/^Bearer \S+/.test(req.headers.get("authorization") ?? "")) return json(401, { errors: [{ code: "10009", title: "Authentication failed" }] });
  if (req.method === "POST" && path === "/v2/messages") {
    for (const k of ["from", "to", "text"]) if (typeof body?.[k] !== "string" || !body[k]) return json(422, { errors: [{ code: "10004", title: "Missing required parameter", detail: k }] });
    if (!/^\+[1-9]\d{7,14}$/.test(body.to)) return json(422, { errors: [{ code: "40310", title: "Invalid 'to' address" }] });
    if (!body.messaging_profile_id) return json(422, { errors: [{ code: "40305", title: "Invalid 'from' address", detail: "messaging_profile_id is required with a number" }] });
    if (telnyxState.blocked.has(body.to)) return json(403, { errors: [{ code: "40300", title: "Blocked due to STOP message", detail: "The destination opted out." }] });
    const parts = /^[\x20-\x7e\n\r]*$/.test(body.text) ? (body.text.length <= 160 ? 1 : Math.ceil(body.text.length / 153)) : (body.text.length <= 70 ? 1 : Math.ceil(body.text.length / 67));
    telnyxState.messages++;
    return json(200, { data: { record_type: "message", id: crypto.randomUUID(), direction: "outbound", type: "SMS", from: { phone_number: body.from }, to: [{ phone_number: body.to, status: "queued" }], text: body.text, parts, messaging_profile_id: body.messaging_profile_id } });
  }
  const action = /^\/v2\/calls\/([^/]+)\/actions\/([a-z_]+)$/.exec(path);
  if (req.method === "POST" && action) {
    const ccid = decodeURIComponent(action[1]);
    if (telnyxState.failActions.has(`${ccid}:${action[2]}`)) return json(422, { errors: [{ code: "90018", title: "Call has already ended" }] });
    if (!["answer", "speak", "hangup", "ai_assistant_start", "ai_assistant_stop", "transfer"].includes(action[2])) return json(404, { errors: [{ code: "10005", title: "Resource not found" }] });
    if (action[2] === "speak" && (!body?.payload || !body?.voice)) return json(422, { errors: [{ code: "10004", title: "Missing required parameter", detail: "payload and voice" }] });
    if (action[2] === "ai_assistant_start" && !body?.assistant?.id) return json(422, { errors: [{ code: "10004", title: "Missing required parameter", detail: "assistant.id" }] });
    return json(200, { data: { result: "ok" } });
  }
  if (req.method === "POST" && path === "/v2/calls") {
    for (const k of ["connection_id", "to", "from"]) if (!body?.[k]) return json(422, { errors: [{ code: "10004", title: "Missing required parameter", detail: k }] });
    const id = rid("");
    return json(200, { data: { record_type: "call", call_control_id: `v3:${id}`, call_leg_id: crypto.randomUUID(), call_session_id: crypto.randomUUID(), is_alive: false } });
  }
  if (req.method === "POST" && path === "/v2/faxes") return json(202, { data: { id: crypto.randomUUID(), status: "queued", record_type: "fax" } });
  const fax = /^\/v2\/faxes\/([^/]+)$/.exec(path);
  if (req.method === "GET" && fax) return json(200, { data: { id: fax[1], status: "delivered", page_count: 2 } });
  return json(404, { errors: [{ code: "10005", title: "Resource not found" }] });
}

/* ------------------------------ Linq (iMessage) ------------------------------ */

/** Linq's API V3 as the functions use it: chats keyed on from + to, the first message of a new chat refused when it has
 *  a link (1005), opted-out recipients refused (2024) unless override_optout, restricted lines refused (2027), typing,
 *  line reputation, and presigned media (which must not get an API key). */
export const linqState = {
  lines: new Set<string>(), optedOut: new Set<string>(), restricted: new Set<string>(), android: new Set<string>(),
  reputation: new Map<string, string>(), chats: new Map<string, { id: string; from: string; to: string; messages: number }>(), typing: [] as string[],
};
function linq(req: Request, path: string, body: any): Response {
  const err = (status: number, code: number, message: string) => json(status, { success: false, error: { status, code, message, doc_url: `https://docs.linqapp.com/error/${code}` }, trace_id: rid("tr_") });
  if (req.method === "GET" && path.startsWith("/media/")) {
    if (req.headers.get("authorization")) return new Response("presigned URLs take no credentials", { status: 400 });
    return new Response(MMS_PNG, { status: 200, headers: { "Content-Type": "image/png" } });
  }
  if (!/^Bearer \S+/.test(req.headers.get("authorization") ?? "")) return err(401, 1001, "Unauthorized");
  const text = (m: any) => (Array.isArray(m?.parts) ? m.parts : []).filter((p: any) => p?.type === "text").map((p: any) => String(p.value ?? "")).join("\n");
  const send = (from: string, to: string, msg: any, override: boolean) => {
    if (!Array.isArray(msg?.parts) || !msg.parts.length || msg.parts.some((p: any) => p?.type === "text" && !String(p.value ?? "").trim())) return err(400, 1002, "message.parts is required");
    if (linqState.restricted.has(from)) return err(403, 2027, "Sender number is restricted from sending due to its line reputation");
    if (linqState.optedOut.has(to) && !override) return err(403, 2024, "Recipient asked you to stop messaging them");
    return null;
  };
  if (req.method === "POST" && path === "/api/partner/v3/chats") {
    const from = body?.from, to = body?.to;
    if (!linqState.lines.has(from)) return err(403, 4008, "Sender not eligible");
    if (!Array.isArray(to) || to.length !== 1 || !/^\+[1-9]\d{7,14}$/.test(to[0])) return err(400, 1005, "Invalid parameter value: to");
    const bad = send(from, to[0], body.message, body.override_optout === true);
    if (bad) return bad;
    const key = `${from}|${to[0]}`;
    let chat = linqState.chats.get(key);
    if (!chat && /https?:\/\//.test(text(body.message))) return err(400, 1005, "The first message of a new chat cannot contain a link");
    if (!chat) { chat = { id: crypto.randomUUID(), from, to: to[0], messages: 0 }; linqState.chats.set(key, chat); }
    chat.messages++;
    return json(201, { chat: { id: chat.id, display_name: null, is_group: false, service: linqState.android.has(to[0]) ? "SMS" : "iMessage", handles: [], health_status: { status: "HEALTHY", doc_url: "" }, message: { id: crypto.randomUUID(), created_at: new Date().toISOString(), delivery_status: "queued", is_read: false } } });
  }
  const m = /^\/api\/partner\/v3\/chats\/([^/]+)\/(messages|typing)$/.exec(path);
  if (req.method === "POST" && m) {
    const chat = [...linqState.chats.values()].find((c) => c.id === decodeURIComponent(m[1]));
    if (!chat) return err(404, 3001, "Chat not found");
    if (m[2] === "typing") { linqState.typing.push(chat.id); return new Response(null, { status: 204 }); }
    const bad = send(chat.from, chat.to, body?.message, body?.override_optout === true);
    if (bad) return bad;
    chat.messages++;
    return json(201, { chat_id: chat.id, message: { id: crypto.randomUUID(), created_at: new Date().toISOString(), delivery_status: "queued", is_read: false } });
  }
  if (req.method === "GET" && path === "/api/partner/v3/phone_numbers") {
    return json(200, { phone_numbers: [...linqState.lines].map((n, i) => ({ id: `pn_${i}`, phone_number: n, forwarding_number: null, line_type: "iMessage",
      reputation: { status: linqState.reputation.get(n) ?? "HEALTHY", doc_url: "https://docs.linqapp.com/channel/imessage/guides/phone-numbers/phone-reputation" } })) });
  }
  return err(404, 3000, "Not found");
}

/* ------------------------------ Stripe ------------------------------ */

/** The account's default API version: a request without Stripe-Version gets this one, as on a new Stripe account. */
export const STRIPE_DEFAULT_VERSION = "2025-09-30.clover";
export const stripeState = {
  prices: {
    price_location: { id: "price_location", object: "price", unit_amount: 178800, currency: "usd", type: "recurring", recurring: { interval: "year", interval_count: 1 } },
    price_location_pro: { id: "price_location_pro", object: "price", unit_amount: 358800, currency: "usd", type: "recurring", recurring: { interval: "year", interval_count: 1 } },
    price_opening: { id: "price_opening", object: "price", unit_amount: 350000, currency: "usd", type: "one_time", recurring: null },
    price_opening_food: { id: "price_opening_food", object: "price", unit_amount: 650000, currency: "usd", type: "one_time", recurring: null },
    price_guarantee: { id: "price_guarantee", object: "price", unit_amount: 250000, currency: "usd", type: "one_time", recurring: null },
    price_entry: { id: "price_entry", object: "price", unit_amount: 29900, currency: "usd", type: "one_time", recurring: null },
    price_pack: { id: "price_pack", object: "price", unit_amount: 4900, currency: "usd", type: "one_time", recurring: null },
  } as Record<string, any>,
  coupons: new Map<string, any>(),
  subscriptions: new Map<string, any>(),
  invoiceItems: [] as any[],
};

function stripeError(status: number, message: string, param?: string) {
  return json(status, { error: { type: "invalid_request_error", message, ...(param ? { param } : {}) } });
}

/** Form fields to a nested object: line_items[0][price] -> {line_items: {0: {price}}}. */
function formObject(raw: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of new URLSearchParams(raw)) {
    const keys = k.replace(/\]/g, "").split("[");
    let o = out;
    keys.forEach((key, i) => { if (i === keys.length - 1) o[key] = v; else o = (o[key] ??= {}); });
  }
  return out;
}
const list = (o: any) => (o ? Object.keys(o).sort((a, b) => Number(a) - Number(b)).map((k) => o[k]) : []);

function stripe(req: Request, path: string, raw: string): Response {
  if (!/^Bearer sk_test_/.test(req.headers.get("authorization") ?? "")) return stripeError(401, "Invalid API Key provided");
  const version = req.headers.get("stripe-version") ?? STRIPE_DEFAULT_VERSION;
  const basil = version >= "2025-03-31";
  const p = req.method === "POST" ? formObject(raw) : {};
  if (req.method === "POST" && raw && !/^[^=&]+=[^&]*(&[^=&]+=[^&]*)*$/.test(raw)) return stripeError(400, "Invalid request body");
  let m: RegExpExecArray | null;
  if (req.method === "GET" && (m = /^\/v1\/prices\/([^/]+)$/.exec(path))) {
    const price = stripeState.prices[decodeURIComponent(m[1])];
    return price ? json(200, price) : stripeError(404, `No such price: '${m[1]}'`, "id");
  }
  if (req.method === "POST" && path === "/v1/coupons") {
    if (p.amount_off && !p.currency) return stripeError(400, "You must specify a currency when amount_off is set.", "currency");
    if (p.amount_off && !/^\d+$/.test(p.amount_off)) return stripeError(400, "Invalid integer: " + p.amount_off, "amount_off");
    if (!p.amount_off && !p.percent_off) return stripeError(400, "Must specify one of amount_off or percent_off.");
    if (!["once", "repeating", "forever"].includes(p.duration ?? "once")) return stripeError(400, "Invalid duration", "duration");
    const c = { id: rid("cpn_"), object: "coupon", amount_off: Number(p.amount_off), currency: p.currency, duration: p.duration ?? "once", max_redemptions: p.max_redemptions ? Number(p.max_redemptions) : null, name: p.name ?? null, metadata: p.metadata ?? {} };
    stripeState.coupons.set(c.id, c);
    return json(200, c);
  }
  if (req.method === "POST" && path === "/v1/checkout/sessions") {
    if (!["payment", "subscription", "setup"].includes(p.mode)) return stripeError(400, "Missing required param: mode.", "mode");
    if (!p.success_url) return stripeError(400, "Missing required param: success_url.", "success_url");
    const items = list(p.line_items);
    if (!items.length) return stripeError(400, "line_items is required in payment and subscription mode.", "line_items");
    for (const [i, li] of items.entries()) {
      const price = stripeState.prices[li.price];
      if (!price) return stripeError(400, `No such price: '${li.price}'`, `line_items[${i}][price]`);
      if (!/^[1-9]\d*$/.test(li.quantity ?? "")) return stripeError(400, "Invalid quantity", `line_items[${i}][quantity]`);
      if (p.mode === "payment" && price.recurring) return stripeError(400, "You must be in subscription mode to use recurring prices.");
    }
    if (p.mode === "subscription" && !items.some((li) => stripeState.prices[li.price].recurring)) return stripeError(400, "You must provide at least one recurring price in subscription mode.");
    if (p.allow_promotion_codes && p.discounts) return stripeError(400, "You may only specify one of these parameters: allow_promotion_codes, discounts.");
    if (p.customer && p.customer_email) return stripeError(400, "You may only specify one of these parameters: customer, customer_email.");
    if (p.customer_creation && p.mode !== "payment") return stripeError(400, "customer_creation can only be used in payment mode.");
    for (const d of list(p.discounts)) if (d.coupon && !stripeState.coupons.has(d.coupon)) return stripeError(400, `No such coupon: '${d.coupon}'`);
    const id = rid("cs_test_");
    return json(200, { id, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${id}`, mode: p.mode, metadata: p.metadata ?? {}, client_reference_id: p.client_reference_id ?? null });
  }
  if (req.method === "POST" && path === "/v1/billing_portal/sessions") {
    if (!p.customer) return stripeError(400, "Missing required param: customer.", "customer");
    return json(200, { id: rid("bps_"), object: "billing_portal.session", url: `https://billing.stripe.com/p/session/${rid("")}` });
  }
  if (req.method === "GET" && (m = /^\/v1\/subscriptions\/([^/]+)$/.exec(path))) {
    const s = stripeState.subscriptions.get(decodeURIComponent(m[1]));
    return s ? json(200, s) : stripeError(404, `No such subscription: '${m[1]}'`, "id");
  }
  if (req.method === "POST" && (m = /^\/v1\/subscription_items\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    const item = [...stripeState.subscriptions.values()].flatMap((s) => s.items.data).find((i: any) => i.id === id);
    if (!item) return stripeError(404, `No such subscription item: '${id}'`, "id");
    if (p.proration_behavior && !["create_prorations", "none", "always_invoice"].includes(p.proration_behavior)) return stripeError(400, "Invalid proration_behavior", "proration_behavior");
    if (p.quantity) item.quantity = Number(p.quantity);
    return json(200, item);
  }
  if (req.method === "POST" && path === "/v1/invoiceitems") {
    if (!p.customer) return stripeError(400, "Missing required param: customer.", "customer");
    if (basil && (p.price || p.unit_amount)) return stripeError(400, `Received unknown parameter: ${p.price ? "price" : "unit_amount"}`, p.price ? "price" : "unit_amount");
    const price = basil ? p.pricing?.price : p.price;
    if (price && !stripeState.prices[price]) return stripeError(400, `No such price: '${price}'`);
    if (price && stripeState.prices[price].recurring) return stripeError(400, "The price specified is set to `type=recurring` but this field only accepts prices with `type=one_time`.");
    if (!price && (!p.amount || !p.currency)) return stripeError(400, "Must provide either amount and currency, or a price.");
    if (p.amount && !/^-?\d+$/.test(p.amount)) return stripeError(400, "Invalid integer: " + p.amount, "amount");
    if (p.subscription && !stripeState.subscriptions.has(p.subscription)) return stripeError(400, `No such subscription: '${p.subscription}'`);
    const ii = { id: rid("ii_"), object: "invoiceitem", customer: p.customer, subscription: p.subscription ?? null, quantity: Number(p.quantity ?? 1),
      amount: price ? stripeState.prices[price].unit_amount * Number(p.quantity ?? 1) : Number(p.amount), currency: p.currency ?? "usd", price: price ?? null, description: p.description ?? null, metadata: p.metadata ?? {} };
    stripeState.invoiceItems.push(ii);
    return json(200, ii);
  }
  return stripeError(404, `Unrecognized request URL (${req.method}: ${path}).`);
}

/* ------------------------------ Resend ------------------------------ */

export const resendState = { fail: false };
function resend(req: Request, path: string, body: any): Response {
  if (!/^Bearer re_/.test(req.headers.get("authorization") ?? "")) return json(401, { name: "missing_api_key", message: "Missing API key" });
  if (req.method !== "POST" || path !== "/emails") return json(404, { name: "not_found", message: "Not found" });
  if (resendState.fail) return json(500, { name: "application_error", message: "Down" });
  const to = Array.isArray(body?.to) ? body.to : typeof body?.to === "string" ? [body.to] : [];
  if (!body?.from || !to.length || !body?.subject || !(body?.text || body?.html)) return json(422, { name: "validation_error", message: "from, to, subject and text or html are required" });
  if (to.length > 50) return json(422, { name: "validation_error", message: "Too many recipients" });
  if (to.some((t: string) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t))) return json(422, { name: "validation_error", message: "Invalid `to` field." });
  return json(200, { id: crypto.randomUUID() });
}

/* ------------------------------ Anthropic: a scripted model ------------------------------ */

type Block = Record<string, any>;
export type Ctx = { payload: any; prompt: string; round: number; results: { name: string; content: string; is_error: boolean }[]; toolNames: string[] };
export type Turn = { tool: string; input: Record<string, unknown> | ((c: Ctx) => Record<string, unknown>); say?: string; delayMs?: number } | { text: string | ((c: Ctx) => string); delayMs?: number } | { error: number; delayMs?: number };
export type Script = { name: string; match: (prompt: string) => boolean; turns: Turn[] };
export const scripts: Script[] = [];
export type ModelCall = { script: string | null; round: number; payload: any; beta: string | null; reply: any };
export const modelCalls: ModelCall[] = [];

/** What the real Messages API would refuse: roles out of order, a tool_result without its tool_use, unknown tools. */
function invalid(p: any, headers: Headers): string | null {
  if (!headers.get("x-api-key")) return "x-api-key header is required";
  if (headers.get("anthropic-version") !== "2023-06-01") return "anthropic-version header is required";
  if (typeof p?.model !== "string" || !p.model) return "model: Field required";
  if (!Number.isInteger(p?.max_tokens) || p.max_tokens < 1) return "max_tokens: Field required";
  if (!Array.isArray(p?.messages) || !p.messages.length) return "messages: at least one message is required";
  if (p.messages[0].role !== "user") return "messages: first message must use the \"user\" role";
  for (let i = 0; i < p.messages.length; i++) {
    const m = p.messages[i];
    if (m.role !== "user" && m.role !== "assistant") return `messages.${i}.role: Input should be 'user' or 'assistant'`;
    if (i && p.messages[i - 1].role === m.role) return `messages: roles must alternate between "user" and "assistant", but found multiple "${m.role}" roles in a row`;
    if (typeof m.content !== "string" && !Array.isArray(m.content)) return `messages.${i}.content: Input should be a valid string or list`;
    if (typeof m.content === "string" && !m.content.trim() && i !== p.messages.length - 1) return `messages.${i}: text content blocks must be non-empty`;
    const uses = Array.isArray(m.content) ? m.content.filter((b: Block) => b.type === "tool_use").map((b: Block) => b.id) : [];
    if (uses.length) {
      const next = p.messages[i + 1];
      const got = Array.isArray(next?.content) ? next.content.filter((b: Block) => b.type === "tool_result").map((b: Block) => b.tool_use_id) : [];
      for (const u of uses) if (!got.includes(u)) return `messages.${i + 1}: tool_use ids were found without tool_result blocks immediately after: ${u}`;
    }
    if (Array.isArray(m.content)) for (const b of m.content) if (b.type === "tool_result") {
      const prev = p.messages[i - 1];
      if (!Array.isArray(prev?.content) || !prev.content.some((x: Block) => x.type === "tool_use" && x.id === b.tool_use_id)) return `messages.${i}: unexpected tool_use_id found in tool_result blocks: ${b.tool_use_id}`;
    }
  }
  const names = new Set<string>();
  for (const t of p.tools ?? []) {
    const n = t.name;
    if (!n) return "tools: each tool needs a name";
    if (names.has(n)) return `tools: Tool names must be unique (${n})`;
    names.add(n);
    if (!("type" in t) && (!t.input_schema || t.input_schema.type !== "object")) return `tools.${n}.input_schema: type must be object`;
    if (t.type?.startsWith("web_fetch") && !(headers.get("anthropic-beta") ?? "").includes("web-fetch")) return "web_fetch requires the web-fetch beta header";
  }
  return null;
}

const textOf = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((b: Block) => (b.type === "text" ? b.text : typeof b.content === "string" ? b.content : textOf(b.content))).join("") : "");

async function anthropic(req: Request, path: string, body: any): Promise<Response> {
  if (req.method !== "POST" || path !== "/v1/messages") return json(404, { type: "error", error: { type: "not_found_error", message: "Not found" } });
  const bad = invalid(body, req.headers);
  if (bad) { stubErrors.push(`anthropic 400: ${bad}`); return json(400, { type: "error", error: { type: "invalid_request_error", message: bad } }); }
  const msgs = body.messages as { role: string; content: unknown }[];
  let pi = -1;
  // The prompt is the last user turn that's the person's words: a string, or (with an image or PDF attached) blocks
  // that carry text and no tool results.
  const words = (c: unknown) => typeof c === "string" ? c : Array.isArray(c) && !c.some((b: Block) => b.type === "tool_result") ? c.filter((b: Block) => b.type === "text").map((b: Block) => b.text).join("\n") : null;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user" && words(msgs[i].content) !== null) { pi = i; break; }
  const prompt = pi >= 0 ? String(words(msgs[pi].content)) : "";
  const round = msgs.slice(pi + 1).filter((m) => m.role === "assistant").length;
  const results: Ctx["results"] = [];
  const nameOf = new Map<string, string>();
  for (const m of msgs.slice(pi + 1)) for (const b of Array.isArray(m.content) ? m.content as Block[] : []) {
    if (b.type === "tool_use") nameOf.set(b.id, b.name);
    if (b.type === "tool_result") results.push({ name: nameOf.get(b.tool_use_id) ?? "", content: textOf(b.content), is_error: !!b.is_error });
  }
  const toolNames = (body.tools ?? []).filter((t: Block) => !("type" in t)).map((t: Block) => t.name);
  const script = scripts.find((s) => s.match(prompt)) ?? null;
  const ctx: Ctx = { payload: body, prompt, round, results, toolNames };
  let content: Block[], stop: string;
  if (!script) {
    stubErrors.push(`anthropic: no script for prompt ${JSON.stringify(prompt.slice(0, 120))}`);
    content = [{ type: "text", text: "No script." }]; stop = "end_turn";
  } else {
    const turn = script.turns[round] ?? { text: "Done." };
    if (turn.delayMs) await new Promise((r) => setTimeout(r, turn.delayMs));
    if ("error" in turn) {
      modelCalls.push({ script: script.name, round, payload: body, beta: req.headers.get("anthropic-beta"), reply: null });
      return json(turn.error, { type: "error", error: { type: turn.error === 529 ? "overloaded_error" : "api_error", message: turn.error === 529 ? "Overloaded" : "Internal server error" } });
    }
    if ("tool" in turn) {
      if (!toolNames.includes(turn.tool)) stubErrors.push(`anthropic: script ${script.name} wants tool ${turn.tool}, which wasn't offered (${toolNames.join(", ")})`);
      const input = typeof turn.input === "function" ? turn.input(ctx) : turn.input;
      content = [...(turn.say ? [{ type: "text", text: turn.say }] : []), { type: "tool_use", id: rid("toolu_"), name: turn.tool, input }];
      stop = "tool_use";
    } else {
      content = [{ type: "text", text: typeof turn.text === "function" ? turn.text(ctx) : turn.text }];
      stop = "end_turn";
    }
  }
  const reply = { id: rid("msg_"), type: "message", role: "assistant", model: body.model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1200 + JSON.stringify(msgs).length / 4 | 0, output_tokens: 60 } };
  modelCalls.push({ script: script?.name ?? null, round, payload: body, beta: req.headers.get("anthropic-beta"), reply });
  return json(200, reply);
}

/* ------------------------------ the patched fetch ------------------------------ */

const HOSTS: Record<string, Rec["service"]> = { "api.anthropic.com": "anthropic", "api.telnyx.com": "telnyx", "media.telnyx.com": "telnyx", "api.linqapp.com": "linq", "cdn.linqapp.com": "linq", "api.stripe.com": "stripe", "api.resend.com": "resend" };

export function patchFetch(local: (u: URL) => boolean) {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const service = HOSTS[u.hostname];
    if (service) {
      const raw = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
      let body: any = raw;
      try { body = raw && (req.headers.get("content-type") ?? "").includes("json") ? JSON.parse(raw) : raw; } catch { /* left as text */ }
      const res = service === "telnyx" ? telnyx(req, u.pathname, body) : service === "linq" ? linq(req, u.pathname, body) : service === "stripe" ? stripe(req, u.pathname, raw) : service === "resend" ? resend(req, u.pathname, body) : await anthropic(req, u.pathname, body);
      recorded.push({ service, method: req.method, path: u.pathname + u.search, headers: Object.fromEntries(req.headers), body: service === "stripe" ? formObject(raw) : body, raw, status: res.status, at: Date.now() });
      return res;
    }
    if (local(u)) return realFetch(req);
    blockedHosts.push(u.host);
    throw new TypeError(`e2e: outbound network to ${u.host} is blocked`);
  };
}
