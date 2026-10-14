var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dep:npm:pdf-lib@1.17.1
var require_npm_pdf_lib_1_17 = __commonJS({
  "dep:npm:pdf-lib@1.17.1"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:pdf-lib@1.17.1"];
  }
});

// dep:npm:@supabase/supabase-js@2
var require_supabase_js_2 = __commonJS({
  "dep:npm:@supabase/supabase-js@2"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:@supabase/supabase-js@2"];
  }
});

// placetta-agent/supabase/functions/file/index.ts
var import_npm_pdf_lib_1_17 = __toESM(require_npm_pdf_lib_1_17(), 1);

// placetta-agent/supabase/functions/file/shared.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
var ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
var NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });
var STATUS = {
  unauthorized: 401,
  mfa_required: 401,
  forbidden: 403,
  bad_request: 400,
  not_found: 404,
  not_connected: 409,
  not_configured: 503,
  upstream_error: 502,
  too_late: 409
};
var HttpError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
};
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }
  });
}
var ok = (data = {}) => json({ ok: true, ...data });
var errorResponse = (code, message) => json({ error: { code, message } }, STATUS[code]);
function serve(handler) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.code, e.message);
      console.error("unhandled:", describe(e));
      return json({ error: { code: "internal", message: "Something went wrong. Try again." } }, 500);
    }
  });
}
function describe(e) {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return "unknown error";
}
async function readBody(req) {
  if (req.method !== "POST") throw new HttpError("bad_request", "Use POST.");
  let body;
  try {
    body = await req.json();
  } catch {
    throw new HttpError("bad_request", "Send a JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("bad_request", "Send a JSON object.");
  return body;
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return typeof v === "string" && UUID.test(v);
}
function uuidParam(v, label) {
  if (!isUuid(v)) throw new HttpError("bad_request", `${label} must be a valid id.`);
  return v.toLowerCase();
}
async function requireUser(req) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new HttpError("unauthorized", "Sign in to continue.");
  const { data, error } = await admin.auth.getUser(m[1]);
  if (error || !data?.user) throw new HttpError("unauthorized", "Your session has expired. Sign in again.");
  return { user: data.user, jwt: m[1] };
}
function aalOf(jwt) {
  try {
    const part = jwt.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims = JSON.parse(atob(b64));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch {
    return "aal1";
  }
}
async function accessFor(ws, user, jwt) {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data);
  if (error.code !== "PGRST202") throw new Error(`access lookup failed: ${error.code ?? ""}`);
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  return await isStaff(user) ? "staff" : "none";
}
async function requireAccess(ws, user, jwt, need) {
  const a = await accessFor(ws, user, jwt);
  if (a === "mfa_required") throw new HttpError("mfa_required", "Finish two-step sign-in to continue.");
  if (a === "owner" || need === "member" && a === "member") return a;
  if (a === "member") throw new HttpError("forbidden", "Only an owner of this workspace can do that.");
  throw new HttpError("forbidden", "You are not a member of this workspace.");
}
async function isStaff(user) {
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return false;
  const { data, error } = await admin.from("staff_emails").select("email").eq("email", email).maybeSingle();
  if (error) throw new Error(`staff lookup failed: ${error.code ?? ""}`);
  return !!data;
}
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var utf8 = (s) => new TextEncoder().encode(s);
var STATE_TTL_MS = 10 * 60 * 1e3;

// placetta-agent/supabase/functions/file/destinations.ts
var DEST = {
  "irs-ss4": {
    // Foreign applicants: the IRS lists 855-215-1627 for faxes sent from within the US (Placetta's fax number is
    // in the US) and 304-707-9471 from outside it.
    fax: { us: "+18556416935", foreign: "+18552151627" },
    mail: {
      name: "Internal Revenue Service",
      line1: "Attn: EIN Operation",
      city: "Cincinnati",
      state: "OH",
      zip: "45999",
      foreign: { name: "Internal Revenue Service", line1: "Attn: EIN International Operation", city: "Cincinnati", state: "OH", zip: "45999" }
    },
    signature: "wet",
    // until the IRS e-signature list includes Form SS-4
    checked: "2026-10-07",
    // page last reviewed 28-Apr-2026
    source: "https://www.irs.gov/filing/where-to-file-your-taxes-for-form-ss-4"
  },
  // ---- From the line-by-line research of 2026-10-13 (research/lines). Each value is copied from the source page. ----
  "hou-food-dealer": {
    email: "Food-COO@houstontx.gov",
    // "Applications can be submitted via email at Food-COO@houstontx.gov."
    signature: "none",
    // the form has no signature line
    checked: "2026-10-13",
    source: "https://www.houstonhealth.org/media/14901/download"
  },
  "hou-co": {
    email: "Occupancy.Inspections@houstontx.gov",
    // printed on CE-1045-A
    mail: { name: "City of Houston, Occupancy Inspections Section", line1: "P.O. Box 2688", city: "Houston", state: "TX", zip: "77252-2688" },
    signature: "wet",
    // an "Applicant Signature" line; electronic signatures not addressed
    checked: "2026-10-13",
    source: "https://www.houstonpermittingcenter.org/media/941/download"
  },
  "ny-dol-100": {
    fax: { us: "+15184858010" },
    mail: { name: "NYS Department of Labor, Unemployment Insurance Division, Registration Section", line1: "Harriman State Office Campus, Building 12", city: "Albany", state: "NY", zip: "12240-0339" },
    portal: "www.businessexpress.ny.gov",
    signature: "wet",
    // "This form must be signed by the person completing it."
    checked: "2026-10-13",
    source: "https://dol.ny.gov/system/files/documents/2021/02/nys100-1.pdf"
  },
  "ny-dos-pub": {
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0"
  },
  "tx-ap201": {
    email: "sales.applications@cpa.texas.gov",
    // paper AP-201, for owners without an SSN
    fax: { us: "+15129360010" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://comptroller.texas.gov/taxes/permit/"
  },
  "tx-205": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn",
    // "A wet ink signature is not required. Copies and electronically signed documents are accepted."
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml"
  },
  "tx-304": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    portal: "direct.sos.state.tx.us",
    // SOSDirect: "Payments for web filings may be made by credit card or client account" (help-corp-filing-304)
    signature: "drawn",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml"
  },
  "tx-503": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml"
  },
  "aus-food-plan-review": {
    email: "ehsd.service@austintexas.gov",
    mail: { name: "Environmental Health Services Division", line1: "P.O. Box 142529", city: "Austin", state: "TX", zip: "78714" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://austintexas.gov/sites/default/files/files/APH%20Comms/Plan_Review_FFE_EN_061424.pdf"
  },
  "aus-food-preopening": {
    email: "ehsd.service@austintexas.gov",
    mail: { name: "Environmental Health Services Division", line1: "P.O. Box 142529", city: "Austin", state: "TX", zip: "78714" },
    portal: "myhealthdepartment.com",
    signature: "wet",
    checked: "2026-10-13",
    source: "https://www.austintexas.gov/sites/default/files/files/APH%20Comms/Food-Pre-Opening-Revise.pdf"
  },
  "aus-food-permit": {
    mail: { name: "Environmental Health Services Division", line1: "P.O. Box 142529", city: "Austin", state: "TX", zip: "78714" },
    signature: "wet",
    // names must match the photo ID; email is not a route for this form
    checked: "2026-10-13",
    source: "https://www.austintexas.gov/sites/default/files/files/Health/Environmental/Food/Operational_Permit_Application_FFE_EN_110118_TC.pdf"
  },
  "dal-co": { portal: "aca-prod.accela.com", signature: "typed", checked: "2026-10-13", source: "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Pages/certificate_occupancy.aspx" },
  "dal-building": { portal: "aca-prod.accela.com", signature: "typed", checked: "2026-10-13", source: "https://dallascityhall.com/departments/sustainabledevelopment/DCH%20documents/3.%20Applying%20for%20a%20Commercial%20Alteration%20and%20Addition%20Application.pdf" },
  "sf-business-registration": { portal: "etaxstatement.sfgov.org", signature: "typed", checked: "2026-10-13", source: "https://sftreasurer.org/business/register-business" },
  "sj-building-ti": { portal: "sjpermits.org", signature: "drawn", checked: "2026-10-13", source: "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/tenant-improvement" },
  "sj-sign": { portal: "sjpermits.org", signature: "drawn", checked: "2026-10-13", source: "https://www.sanjoseca.gov/business/development-services-permit-center/online-permits-at-sjpermits-org/planning-online-permits" },
  "aus-building": { portal: "abc.austintexas.gov", signature: "typed", checked: "2026-10-13", source: "https://www.austintexas.gov/development-services/commercial-plan-review" },
  "la-ladbs": { portal: "eplanla.lacity.org", signature: "typed", checked: "2026-10-13", source: "https://dbs.lacity.gov/" },
  // ---- Read from the agencies' own pages on 2026-10-13 (federal, California, Los Angeles, New York). ----
  "irs-5472": {
    // Foreign-owned U.S. DEs: "Fax ... to 855-887-7737" (300 DPI or higher) or mail; "you cannot file Form 5472 electronically."
    fax: { us: "+18558877737", foreign: "+18558877737" },
    faxQuality: "very_high",
    mail: { name: "Internal Revenue Service", line1: "1973 Rulon White Blvd", line2: "M/S 6112 Attn: PIN Unit", city: "Ogden", state: "UT", zip: "84201" },
    signature: "wet",
    // signed with the pro forma Form 1120
    checked: "2026-10-13",
    source: "https://www.irs.gov/zh-hant/instructions/i5472"
  },
  "irs-w7": {
    // Mailed with original or certified identity documents, so the person or the team always sends it.
    mail: { name: "Internal Revenue Service, Austin Service Center", line1: "ITIN Operation", line2: "P.O. Box 149342", city: "Austin", state: "TX", zip: "78714-9342" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://irs.gov/tin/itin/how-to-apply-for-an-itin"
  },
  "fincen-boir": {
    // "Go to boiefiling.fincen.gov"; no account; an hCaptcha before submitting, which the worker hands to the person.
    // Since March 21, 2025 only companies formed under a foreign country's law and registered in a US state file.
    portal: "boiefiling.fincen.gov",
    noLogin: true,
    signature: "none",
    checked: "2026-10-13",
    source: "https://boiefiling.fincen.gov/resources/BOIR_E-File_Online_Step-by-Step_Instructions.pdf"
  },
  "ca-cdtfa": {
    // "Register Online" links to onlineservices.cdtfa.ca.gov; "There is no charge for a seller's permit."
    portal: "onlineservices.cdtfa.ca.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://cdtfa.ca.gov/formspubs/pub107/applying-for-a-sellers-permit.htm"
  },
  "ca-edd-de1": {
    // e-Services for Business, eddservices.edd.ca.gov: "Register, close, or re-open an employer payroll tax account."
    portal: "eddservices.edd.ca.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://edd.ca.gov/e-services-for-business/"
  },
  "la-btrc": {
    // "The fastest way to register is online": latax.lacity.org/businessregapp
    portal: "latax.lacity.org",
    signature: "none",
    checked: "2026-10-13",
    source: "https://finance.lacity.gov/tax-education/new-business-registration/how-register-btrc"
  },
  "ny-dtf-17": {
    // "register with the Tax Department through New York Business Express"; needs a NY.gov Business account
    portal: "www.businessexpress.ny.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://tax.ny.gov/bus/st/register.htm"
  },
  "ny-dos-1336": {
    // "$200 ... forwarded to the New York Department of State, Division of Corporations"; a fee, so the team sends it
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://dos.ny.gov/limited-liability-company-articles-organization"
  },
  "fda-ffr": {
    // FDA Industry Systems at www.access.fda.gov, "created to facilitate making submissions to FDA, including registrations"
    portal: "www.access.fda.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://www.fda.gov/food/registration-food-facilities"
  }
};
function staleDestinations(today, days = 90, dest = DEST) {
  const now = Date.parse(today + "T00:00:00Z");
  return Object.entries(dest).filter(([, d]) => now - Date.parse(d.checked + "T00:00:00Z") > days * 864e5).map(([id, d]) => ({ id, checked: d.checked, source: d.source }));
}

// placetta-agent/supabase/functions/file/logic.ts
function envFrom(get) {
  const list = (k) => (get(k) ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const two = Number(get("FILER_TWO_KEY") ?? "10");
  return {
    agencies: list("FILER_AGENCIES"),
    channels: list("FILER_CHANNELS").filter((c) => ["email", "fax", "mail", "portal"].includes(c)),
    portalWorker: get("FILER_ENABLED") === "1",
    dryRun: get("FILER_DRY_RUN") === "1",
    twoKey: Number.isFinite(two) && two >= 0 ? Math.floor(two) : 10,
    fax: !!(get("TELNYX_API_KEY") && get("TELNYX_FAX_CONNECTION_ID") && get("TELNYX_FAX_FROM")),
    mail: !!(get("LOB_API_KEY") && get("LOB_FROM"))
  };
}
var killSwitchOn = (f, env2) => !!f.payload.official && env2.agencies.includes(f.payload.official.toLowerCase());
var SECRET_NUMBER = /\b\d{3}-?\d{2}-?\d{4}\b|\b9\d{2}-?[78]\d-?\d{4}\b/;
var SECRET_LABEL = /\b(ssn|itin|social security|passport)\b|社会安全号|护照号/i;
function isForeign(p) {
  if (p.us_address === false) return true;
  const l7b = p.fields?.find((x) => x.id === "l7b")?.value ?? "";
  return /^\s*foreign\s*$/i.test(l7b);
}
function check(f, d, ctx) {
  const out = [];
  const p = f.payload;
  for (const x of p.fields ?? []) {
    const v = (x.value ?? "").trim();
    if (SECRET_NUMBER.test(v)) {
      out.push({ kind: "secret", en: `${x.label.en} has an SSN or ITIN. Placetta never sends one; that line is filled on the agency's own site or by hand.`, zh: `${x.label.zh}\u542B\u6709 SSN \u6216 ITIN\u3002\u5FEB\u54C9\u4ECE\u4E0D\u53D1\u9001\u8FD9\u7C7B\u53F7\u7801\uFF0C\u8BF7\u5728\u673A\u6784\u7F51\u7AD9\u4E0A\u6216\u624B\u5199\u586B\u5199\u3002` });
    } else if (!v && !SECRET_LABEL.test(x.label.en)) {
      out.push({ kind: "missing", en: `${x.label.en} is empty`, zh: `${x.label.zh}\u672A\u586B\u5199` });
    }
  }
  for (const c of p.checklist ?? []) {
    if (c.state === "missing") out.push({ kind: "missing", en: `Not ready: ${c.label.en}`, zh: `\u5C1A\u672A\u5B8C\u6210\uFF1A${c.label.zh}` });
  }
  for (const a of p.attachments ?? []) {
    if (!a.path?.startsWith(`${f.workspace_id}/`) || !ctx.docPaths.has(a.path)) out.push({ kind: "file", en: `${a.name} isn't in Documents`, zh: `\u6587\u4EF6\u4E2D\u627E\u4E0D\u5230 ${a.name}` });
  }
  const signed2 = signedCopy(f);
  if (signed2 && (!signed2.startsWith(`${f.workspace_id}/`) || !ctx.docPaths.has(signed2))) out.push({ kind: "file", en: "The signed copy isn't in Documents. Upload it again.", zh: "\u6587\u4EF6\u4E2D\u627E\u4E0D\u5230\u7B7E\u540D\u4EF6\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20\u3002" });
  const paperless = !!d?.portal;
  if (d && !paperless) {
    if (!p.pdf_path) out.push({ kind: "file", en: "The filled official form is missing. Approve it again from the application.", zh: "\u7F3A\u5C11\u5DF2\u586B\u5199\u7684\u5B98\u65B9\u8868\u683C\u3002\u8BF7\u5728\u7533\u8BF7\u4E2D\u91CD\u65B0\u6279\u51C6\u3002" });
    else if (!p.pdf_path.startsWith(`${f.workspace_id}/`) || !ctx.docPaths.has(p.pdf_path)) out.push({ kind: "file", en: "The filled official form isn't in Documents.", zh: "\u6587\u4EF6\u4E2D\u627E\u4E0D\u5230\u5DF2\u586B\u5199\u7684\u5B98\u65B9\u8868\u683C\u3002" });
    if ((d.signature === "typed" || d.signature === "drawn") && !p.signature) {
      out.push({ kind: "signature", en: "The form needs the signer's signature. Approve it again and sign in the card.", zh: "\u8868\u683C\u9700\u8981\u7B7E\u7F72\u4EBA\u7B7E\u540D\u3002\u8BF7\u91CD\u65B0\u6279\u51C6\u5E76\u5728\u5361\u7247\u4E2D\u7B7E\u540D\u3002" });
    }
    if (d.signature === "drawn" && p.signature?.kind === "typed") {
      out.push({ kind: "signature", en: "This agency needs a drawn signature, not a typed one.", zh: "\u8BE5\u673A\u6784\u9700\u8981\u624B\u7ED8\u7B7E\u540D\uFF0C\u800C\u4E0D\u662F\u6253\u5B57\u7B7E\u540D\u3002" });
    }
  }
  return out;
}
var feeDue = (f) => Number(f.fee_estimate ?? 0) > 0;
function pick(f, d, env2, facts2) {
  if (!d) return "team";
  const on = (c) => env2.channels.includes(c);
  if (d.portal && (facts2.hasLogin || d.noLogin) && env2.portalWorker && on("portal")) return "portal";
  if (feeDue(f)) return "team";
  if (d.signature === "wet") return signedCopy(f) && canFaxSigned(d, env2) ? "fax" : "team";
  if (d.email && facts2.mailConnected && on("email")) return "email";
  if (d.fax && env2.fax && on("fax")) return "fax";
  if (d.mail && env2.mail && on("mail")) return "mail";
  return "team";
}
function faxTo(d, p) {
  if (!d.fax) return null;
  return isForeign(p) ? d.fax.foreign ?? null : d.fax.us;
}
function mailTo(d, p) {
  if (!d.mail) return null;
  return isForeign(p) && d.mail.foreign ? d.mail.foreign : d.mail;
}
var signedCopy = (f) => [...f.agent_log].reverse().find((e) => e.kind === "signed_copy")?.ref;
var faxFile = (f) => signedCopy(f) ?? f.payload.pdf_path;
var canFaxSigned = (d, env2) => !!d?.fax && env2.fax && env2.channels.includes("fax");
var teamApproved = (f) => f.agent_log.some((e) => e.kind === "two_key_ok");
function emailFor(f) {
  const form = f.payload.form?.en || f.title.en;
  const name = f.payload.fields?.find((x) => x.id === "l1")?.value || "";
  return {
    subject: `${form}${name ? `: ${name}` : ""}`.slice(0, 280),
    body: [
      "Hello,",
      "",
      `Attached is ${form}${name ? ` for ${name}` : ""}, submitted on the applicant's behalf with their authorization.`,
      "Please reply to this email with any questions or the result.",
      "",
      "Thank you."
    ].join("\n")
  };
}

// placetta-agent/supabase/functions/file/index.ts
var env = () => envFrom((k) => Deno.env.get(k));
var COLS = "id, workspace_id, app_id, title, status, payload, channel, agent_state, agent_log, handoff_url, provider_ref, submit_clicked_at, attempts, requirements_checked, confirmation_number, portal_url, receipt_path, fee_estimate";
var log = (en, zh, kind = "info", ref) => ({ en, zh, kind, ...ref ? { ref } : {} });
async function loadFiling(ws, id) {
  const { data, error } = await admin.from("filings").select(COLS).eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (error) throw new Error(`filing lookup failed: ${error.code ?? ""}`);
  if (!data) throw new HttpError("not_found", "No such filing in this workspace.");
  return data;
}
async function step(f, entry, patch = {}, auditIt = true) {
  const { data, error } = await admin.rpc("filing_agent_step", { p_id: f.id, p_entry: entry, p_patch: patch, p_audit: auditIt });
  if (error) throw new Error(`filing step failed: ${error.message?.slice(0, 200) ?? error.code}`);
  return data;
}
function view(f) {
  return {
    filing: {
      id: f.id,
      status: f.status,
      channel: f.channel,
      agent_state: f.agent_state,
      agent_log: f.agent_log,
      handoff_url: f.handoff_url,
      confirmation_number: f.confirmation_number,
      submit_clicked_at: f.submit_clicked_at
    }
  };
}
async function alertTeam(f, kind, title) {
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("MAIL_FROM");
  if (!key || !from) return;
  const { data: staff } = await admin.from("staff_emails").select("email");
  const to = (staff ?? []).map((s) => s.email).filter(Boolean);
  if (!to.length) return;
  const { data: w } = await admin.from("workspaces").select("name").eq("id", f.workspace_id).maybeSingle();
  const app = (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean)[0] ?? "";
  const esc = (x) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const what = f.title?.en ?? "A filing", who = w?.name ?? "a customer";
  const subject = kind === "destination_stale" ? `Team task: ${title}` : `New for the team: ${what} (${who})`;
  const text = `${what} for ${who}

${title}

${app ? `Filing queue: ${app}/app/` : ""}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><p><b>${esc(what)}</b> for ${esc(who)}</p><p>${esc(title)}</p>${app ? `<p><a href="${esc(app)}/app/">Open the filing queue</a></p>` : ""}</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, html })
    });
    if (!r.ok) console.error("team alert failed:", r.status);
  } catch (e) {
    console.error("team alert failed:", e.message);
  }
}
async function teamTask(f, kind, title, detail) {
  const { data, error } = await admin.from("team_tasks").upsert(
    { kind, filing_id: f.id, workspace_id: f.workspace_id, title, detail: detail ?? null, dedupe: `${kind}:${f.id}:${f.attempts}` },
    { onConflict: "dedupe", ignoreDuplicates: true }
  ).select("id");
  if (error) {
    console.error("team task insert failed:", error.code ?? "");
    return;
  }
  if (data?.length) await alertTeam(f, kind, title);
}
async function toTeam(f, en, zh, kind = "handoff") {
  const g = await step(f, log(en, zh, "handoff"), { channel: "team", agent_state: "handoff" });
  await teamTask(g, kind, en);
  return view(g);
}
async function needsYou(f, en, zh, handoff_url = null, kind = "needs_you") {
  return view(await step(f, log(en, zh, kind), { agent_state: "needs_you", handoff_url }));
}
async function docPaths(f) {
  const p = f.payload;
  const want = [p.pdf_path, signedCopy(f), ...(p.attachments ?? []).map((a) => a.path)].filter((x) => typeof x === "string");
  if (!want.length) return /* @__PURE__ */ new Set();
  const { data, error } = await admin.from("documents").select("path").eq("workspace_id", f.workspace_id).in("path", want);
  if (error) throw new Error(`documents lookup failed: ${error.code ?? ""}`);
  return new Set((data ?? []).map((r) => r.path));
}
var hostOf = (u) => {
  try {
    return u ? new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
};
async function facts(f, d) {
  const [logins, mail] = await Promise.all([
    d?.portal ? admin.from("agency_logins").select("url").eq("workspace_id", f.workspace_id) : Promise.resolve({ data: [], error: null }),
    admin.from("integrations").select("kind").eq("workspace_id", f.workspace_id).in("kind", ["gmail", "outlook_mail"]).eq("status", "connected")
  ]);
  if (logins.error || mail.error) throw new Error("workspace lookup failed");
  return {
    hasLogin: !!d?.portal && (logins.data ?? []).some((r) => hostOf(r.url) === d.portal),
    mailConnected: (mail.data ?? []).length > 0
  };
}
async function selfFiledCount(official) {
  const { count, error } = await admin.from("filings").select("id", { count: "exact", head: true }).eq("payload->>official", official).in("channel", ["email", "fax", "mail", "portal"]).in("status", ["submitted", "accepted"]);
  if (error) throw new Error(`count failed: ${error.code ?? ""}`);
  return count ?? 0;
}
async function signedUrl(path) {
  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Couldn't make a link to the form.");
  return data.signedUrl;
}
async function saveReceipt(f, name, bytes, mime) {
  const path = `${f.workspace_id}/receipts/${f.id}-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
  const up = await admin.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("receipt upload failed:", up.error.message?.slice(0, 120));
    return null;
  }
  const { error } = await admin.from("documents").insert({ workspace_id: f.workspace_id, app_id: f.app_id, filing_id: f.id, name, path, size: bytes.length, mime, source: "agent", uploaded_by: null });
  if (error) {
    await admin.storage.from("documents").remove([path]);
    return null;
  }
  return path;
}
async function receiptPdf(lines) {
  const doc = await import_npm_pdf_lib_1_17.PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(import_npm_pdf_lib_1_17.StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l.replace(/[^\x20-\x7e]/g, " "), { x: 56, y: 720 - i * 18, size: i === 0 ? 14 : 10, font }));
  return await doc.save();
}
async function markSubmit(f, en, zh) {
  if (f.submit_clicked_at) throw new HttpError("forbidden", "This filing was already sent. Placetta checks with the agency instead of sending it again.");
  return await step(f, log(en, zh, "submit"), { submit_clicked_at: (/* @__PURE__ */ new Date()).toISOString() });
}
async function holdForTeam(f, d) {
  const e = env();
  if (e.dryRun) {
    return await toTeam(f, "Dry run: everything is ready to send. The Placetta team reviews it; nothing was sent.", "\u6F14\u7EC3\uFF1A\u5DF2\u51C6\u5907\u597D\u53D1\u9001\uFF0C\u7531\u5FEB\u54C9\u56E2\u961F\u5BA1\u6838\uFF0C\u672A\u5B9E\u9645\u53D1\u9001\u3002", "review");
  }
  if (!teamApproved(f) && await selfFiledCount(f.payload.official) < e.twoKey) {
    const g = await step(f, log("With the Placetta team for a final check before it's sent", "\u5FEB\u54C9\u56E2\u961F\u6B63\u5728\u53D1\u9001\u524D\u505A\u6700\u540E\u6838\u5BF9", "review_wait"), { agent_state: "handoff" });
    await teamTask(g, "review", `Two-key review before Placetta sends ${f.payload.official} (${f.channel}). Approve or take it over.`, { source: d.source });
    return view(g);
  }
  return null;
}
async function sendEmail(f, d) {
  const held = await holdForTeam(f, d);
  if (held) return held;
  const secret = Deno.env.get("FILER_SECRET") ?? "";
  if (secret.length < 32) return await toTeam(f, "Email filing isn't set up yet (FILER_SECRET).", "\u90AE\u4EF6\u63D0\u4EA4\u5C1A\u672A\u914D\u7F6E\u3002");
  const { subject, body } = emailFor(f);
  const g = await markSubmit(f, `Emailing it to ${d.email}`, `\u6B63\u5728\u53D1\u9001\u90AE\u4EF6\u81F3 ${d.email}`);
  const files = [f.payload.pdf_path, ...(f.payload.attachments ?? []).map((a) => a.path)].filter(Boolean).slice(0, 5).map((path) => ({ path }));
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/integrations`, {
      method: "POST",
      // The gateway checks a JWT on integrations: the service role's passes it; x-filer-secret is what integrations checks.
      headers: { "Content-Type": "application/json", "x-filer-secret": secret, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}` },
      body: JSON.stringify({ action: "mail_send", workspace_id: f.workspace_id, filing_id: f.id, to: [d.email], subject, body, attachments: files }),
      signal: AbortSignal.timeout(6e4)
    });
  } catch (e) {
    console.error("filer mail_send:", describe(e));
    await teamTask(g, "check_agency", "Email send timed out. Check the customer's Sent folder before sending again.");
    return await toTeam(g, "The email didn't confirm. The team is checking whether it went.", "\u90AE\u4EF6\u672A\u786E\u8BA4\u9001\u51FA\uFF0C\u56E2\u961F\u6B63\u5728\u6838\u5B9E\u3002", "check_agency");
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(out?.error?.message ?? `error ${res.status}`).slice(0, 200);
    return await toTeam(g, `The email wasn't sent: ${msg}`, `\u90AE\u4EF6\u672A\u53D1\u9001\uFF1A${msg}`);
  }
  const from = String(out.account ?? "");
  const h = await step(
    g,
    log(`Emailed the ${f.payload.form?.en ?? "form"} to ${d.email}${from ? ` from ${from}` : ""}`, `\u5DF2\u4ECE ${from || "\u60A8\u7684\u90AE\u7BB1"} \u5C06${f.payload.form?.zh ?? "\u8868\u683C"}\u53D1\u9001\u81F3 ${d.email}`, "submitted", String(out.id ?? "")),
    { provider_ref: String(out.id ?? ""), status: "submitted", agent_state: "done", requirements_checked: true }
  );
  return view(h);
}
var TELNYX = "https://api.telnyx.com/v2";
async function sendFax(f, d, retry = false) {
  if (!retry) {
    const held = await holdForTeam(f, d);
    if (held) return held;
  }
  const to = faxTo(d, f.payload);
  if (!to) return await toTeam(f, "There's no fax number for this applicant.", "\u6CA1\u6709\u9002\u7528\u4E8E\u8BE5\u7533\u8BF7\u4EBA\u7684\u4F20\u771F\u53F7\u7801\u3002");
  const g = retry ? f : await markSubmit(f, `Faxing it to ${to}${isForeign(f.payload) ? " (international applicants)" : ""}`, `\u6B63\u5728\u4F20\u771F\u81F3 ${to}`);
  const media_url = await signedUrl(faxFile(f));
  const res = await fetch(`${TELNYX}/faxes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("TELNYX_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ connection_id: Deno.env.get("TELNYX_FAX_CONNECTION_ID"), from: Deno.env.get("TELNYX_FAX_FROM"), to, media_url, quality: d.faxQuality ?? "high", monochrome: true }),
    signal: AbortSignal.timeout(3e4)
  }).catch((e) => {
    console.error("telnyx:", describe(e));
    return null;
  });
  const body = res ? await res.json().catch(() => ({})) : {};
  const id = body?.data?.id;
  if (!res || !res.ok || !id) {
    console.error("telnyx refused:", res?.status, JSON.stringify(body?.errors ?? "").slice(0, 200));
    return await toTeam(g, "The fax service didn't take the fax. The team will send it.", "\u4F20\u771F\u670D\u52A1\u672A\u63A5\u6536\uFF0C\u56E2\u961F\u4F1A\u5904\u7406\u3002");
  }
  return view(await step(g, log("Fax queued with the fax service", "\u4F20\u771F\u5DF2\u8FDB\u5165\u53D1\u9001\u961F\u5217", "fax_queued", id), { provider_ref: id, agent_state: "running", channel: "fax" }));
}
async function applyFax(f, status, info = {}) {
  if (f.agent_state !== "running" || f.channel !== "fax") return view(f);
  if (status === "delivered") {
    const d = DEST[f.payload.official ?? ""];
    const to = d ? faxTo(d, f.payload) : "";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const pdf = await receiptPdf([
      "Fax delivery confirmation",
      `Form: ${f.payload.form?.en ?? f.payload.official}`,
      `To: ${to}`,
      `Fax id: ${f.provider_ref}`,
      ...info.pages ? [`Pages: ${info.pages}`] : [],
      `Delivered: ${now}`,
      "Sent by Placetta on the applicant's behalf."
    ]);
    const path = await saveReceipt(f, "fax-confirmation.pdf", pdf, "application/pdf");
    return view(await step(
      f,
      log(`Faxed to the agency at ${to}. Delivered.`, `\u5DF2\u4F20\u771F\u81F3\u673A\u6784 ${to}\uFF0C\u5DF2\u9001\u8FBE\u3002`, "submitted", f.provider_ref ?? void 0),
      { status: "submitted", agent_state: "done", requirements_checked: true, ...path ? { receipt_path: path } : {} }
    ));
  }
  if (status === "failed") {
    const fails = f.agent_log.filter((e) => e.kind === "fax_failed").length + 1;
    const g = await step(f, log(`The fax didn't go through${info.reason ? ` (${info.reason})` : ""}`, `\u4F20\u771F\u672A\u9001\u8FBE${info.reason ? `\uFF08${info.reason}\uFF09` : ""}`, "fax_failed"));
    if (fails <= 2) return await sendFax(g, DEST[f.payload.official ?? ""], true);
    return await toTeam(g, "The fax failed 3 times. The team will send it.", "\u4F20\u771F 3 \u6B21\u672A\u9001\u8FBE\uFF0C\u56E2\u961F\u4F1A\u5904\u7406\u3002");
  }
  return view(f);
}
async function refreshFax(f) {
  if (!f.provider_ref || !Deno.env.get("TELNYX_API_KEY")) return view(f);
  const res = await fetch(`${TELNYX}/faxes/${encodeURIComponent(f.provider_ref)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get("TELNYX_API_KEY")}` },
    signal: AbortSignal.timeout(15e3)
  }).catch(() => null);
  if (!res?.ok) return view(f);
  const data = (await res.json().catch(() => ({})))?.data ?? {};
  return await applyFax(f, String(data.status ?? ""), { pages: data.page_count, reason: data.failure_reason });
}
var LOB = "https://api.lob.com/v1";
var lobAuth = () => `Basic ${btoa(`${Deno.env.get("LOB_API_KEY")}:`)}`;
var lobAddress = (a) => ({
  name: a.name.slice(0, 40),
  address_line1: a.line1,
  ...a.line2 ? { address_line2: a.line2 } : {},
  address_city: a.city,
  address_state: a.state,
  address_zip: a.zip,
  address_country: a.country ?? "US"
});
async function sendMail(f, d) {
  const held = await holdForTeam(f, d);
  if (held) return held;
  const to = mailTo(d, f.payload);
  let from;
  try {
    from = JSON.parse(Deno.env.get("LOB_FROM") ?? "");
  } catch {
    return await toTeam(f, "Certified mail isn't set up yet (return address).", "\u6302\u53F7\u4FE1\u5C1A\u672A\u914D\u7F6E\u5BC4\u4EF6\u5730\u5740\u3002");
  }
  if (!to) return await toTeam(f, "There's no mailing address for this form.", "\u8BE5\u8868\u683C\u6CA1\u6709\u90AE\u5BC4\u5730\u5740\u3002");
  const g = await markSubmit(f, `Mailing it by certified mail to ${to.name}, ${to.city}`, `\u6B63\u5728\u4EE5\u6302\u53F7\u4FE1\u5BC4\u5F80 ${to.name}\uFF0C${to.city}`);
  const file = await signedUrl(f.payload.pdf_path);
  const res = await fetch(`${LOB}/letters`, {
    method: "POST",
    headers: { Authorization: lobAuth(), "Content-Type": "application/json", "Idempotency-Key": f.id },
    body: JSON.stringify({
      description: `Placetta ${f.payload.official} ${f.id}`.slice(0, 255),
      to: lobAddress(to),
      from,
      file,
      color: false,
      extra_service: "certified",
      use_type: "operational",
      address_placement: "insert_blank_page",
      metadata: { filing: f.id }
    }),
    signal: AbortSignal.timeout(3e4)
  }).catch((e) => {
    console.error("lob:", describe(e));
    return null;
  });
  const body = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok || !body?.id) {
    console.error("lob refused:", res?.status, JSON.stringify(body?.error ?? "").slice(0, 200));
    return await toTeam(g, "The mail service didn't take the letter. The team will mail it.", "\u90AE\u5BC4\u670D\u52A1\u672A\u63A5\u6536\u4FE1\u4EF6\uFF0C\u56E2\u961F\u4F1A\u5904\u7406\u3002", "check_agency");
  }
  const tracking = String(body.tracking_number ?? "");
  const h = await step(
    g,
    log(
      `Sent by certified mail to ${to.name}${tracking ? `. Tracking ${tracking}` : ""}${body.expected_delivery_date ? `, expected ${body.expected_delivery_date}` : ""}`,
      `\u5DF2\u4EE5\u6302\u53F7\u4FE1\u5BC4\u5F80 ${to.name}${tracking ? `\uFF0C\u8FFD\u8E2A\u53F7 ${tracking}` : ""}${body.expected_delivery_date ? `\uFF0C\u9884\u8BA1 ${body.expected_delivery_date} \u9001\u8FBE` : ""}`,
      "submitted",
      body.id
    ),
    { provider_ref: body.id, status: "submitted", agent_state: "done", requirements_checked: true, ...tracking ? { confirmation_number: tracking } : {} }
  );
  await admin.from("updates").upsert({
    workspace_id: f.workspace_id,
    kind: "filing",
    app_id: f.app_id,
    dedupe: `mailed:${f.id}`,
    title: { en: `Mailed: ${f.title.en}`, zh: `\u5DF2\u5BC4\u51FA\uFF1A${f.title.zh}` },
    body: { en: "Answers to mailed forms usually come back by post in about 4 to 5 weeks.", zh: "\u90AE\u5BC4\u8868\u683C\u7684\u56DE\u590D\u901A\u5E38\u7EA6 4 \u81F3 5 \u5468\u540E\u5BC4\u56DE\u3002" }
  }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  return view(h);
}
async function refreshMail(f) {
  if (!f.provider_ref || !Deno.env.get("LOB_API_KEY") || f.channel !== "mail") return view(f);
  const res = await fetch(`${LOB}/letters/${encodeURIComponent(f.provider_ref)}`, { headers: { Authorization: lobAuth() }, signal: AbortSignal.timeout(15e3) }).catch(() => null);
  if (!res?.ok) return view(f);
  const l = await res.json().catch(() => ({}));
  const events = Array.isArray(l.tracking_events) ? l.tracking_events : [];
  const seen = new Set(f.agent_log.filter((e) => e.kind === "mail_event").map((e) => e.ref));
  let g = f;
  for (const ev of events) {
    const id = String(ev.id ?? ev.name ?? "");
    if (!id || seen.has(id)) continue;
    const what = String(ev.name ?? ev.type ?? "Update").slice(0, 80);
    g = await step(g, log(`Mail: ${what}${ev.location ? `, ${ev.location}` : ""}`, `\u90AE\u4EF6\uFF1A${what}${ev.location ? `\uFF0C${ev.location}` : ""}`, "mail_event", id), {}, false);
  }
  const receipt = f.receipt_path;
  if (!receipt && typeof l.url === "string" && l.url.startsWith("https://")) {
    const pdf = await fetch(l.url, { signal: AbortSignal.timeout(2e4) }).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null);
    if (pdf) {
      const path = await saveReceipt(g, "certified-mail-proof.pdf", new Uint8Array(pdf), "application/pdf");
      if (path) g = await step(g, log("Saved the mail proof", "\u5DF2\u4FDD\u5B58\u90AE\u5BC4\u51ED\u8BC1", "receipt"), { receipt_path: path }, false);
    }
  }
  return view(g);
}
async function start(f, req, by) {
  if (f.agent_state) return view(f);
  if (["canceled", "accepted", "rejected", "submitted"].includes(f.status)) throw new HttpError("bad_request", "This filing is already finished.");
  const e = env();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const s = f.payload.signature;
  if (s && !f.agent_log.some((x) => x.kind === "signature")) f = await step(f, log(`Signed by ${s.name}${s.title ? `, ${s.title}` : ""} at ${s.signed_at}${ip ? ` from ${ip}` : ""}`, `\u7531 ${s.name}${s.title ? `\uFF08${s.title}\uFF09` : ""} \u4E8E ${s.signed_at} \u7B7E\u7F72${ip ? `\uFF0CIP ${ip}` : ""}`, "signature", `${by} ${ua}`.trim()));
  if (!killSwitchOn(f, e)) return await toTeam(f, "Self-filing isn't on for this agency yet. The Placetta team submits it.", "\u8BE5\u673A\u6784\u5C1A\u672A\u5F00\u901A\u81EA\u52A8\u63D0\u4EA4\uFF0C\u7531\u5FEB\u54C9\u56E2\u961F\u63D0\u4EA4\u3002");
  const d = DEST[f.payload.official ?? ""];
  const problems = check(f, d, { docPaths: await docPaths(f) });
  if (problems.length) {
    return await needsYou(f, problems.map((p) => p.en).join(". ").slice(0, 900), problems.map((p) => p.zh).join("\uFF1B").slice(0, 900), null, "needs_you");
  }
  const channel = pick(f, d, e, await facts(f, d));
  if (channel === "team" && d?.signature === "wet" && !d.portal) {
    const where = d.fax ? `fax it to ${faxTo(d, f.payload)}` : d.mail ? `mail it to ${mailTo(d, f.payload)?.name}, ${mailTo(d, f.payload)?.city}` : "send it to the agency";
    const whereZh = d.fax ? `\u4F20\u771F\u81F3 ${faxTo(d, f.payload)}` : d.mail ? `\u5BC4\u5F80 ${mailTo(d, f.payload)?.name}` : "\u4EA4\u7ED9\u673A\u6784";
    if (canFaxSigned(d, e)) {
      return view(await step(f, log(
        "This agency needs a handwritten signature. Download the filled form from Documents, sign it by hand, then upload a scan or a clear photo of the signed page here. Placetta faxes it to the agency and saves the confirmation.",
        "\u8BE5\u673A\u6784\u8981\u6C42\u624B\u5199\u7B7E\u540D\u3002\u8BF7\u4ECE\u201C\u6587\u4EF6\u201D\u4E0B\u8F7D\u5DF2\u586B\u5199\u7684\u8868\u683C\uFF0C\u624B\u5199\u7B7E\u540D\u540E\uFF0C\u5728\u6B64\u4E0A\u4F20\u7B7E\u540D\u9875\u7684\u626B\u63CF\u4EF6\u6216\u6E05\u6670\u7167\u7247\u3002\u5FEB\u54C9\u4F1A\u5C06\u5176\u4F20\u771F\u7ED9\u673A\u6784\u5E76\u4FDD\u5B58\u9001\u8FBE\u786E\u8BA4\u3002",
        "wet_signature",
        "upload"
      ), { channel: "team", requirements_checked: true, agent_state: "needs_you", handoff_url: null }));
    }
    return await needsYou(
      await step(f, null, { channel: "team", requirements_checked: true }),
      `This agency needs a handwritten signature. Download the filled form from Documents, sign it by hand, then ${where}. Tap "I've done it" when it's sent.`,
      `\u8BE5\u673A\u6784\u8981\u6C42\u624B\u5199\u7B7E\u540D\u3002\u8BF7\u4ECE\u201C\u6587\u4EF6\u201D\u4E0B\u8F7D\u5DF2\u586B\u5199\u7684\u8868\u683C\uFF0C\u624B\u5199\u7B7E\u540D\u540E${whereZh}\u3002\u53D1\u51FA\u540E\u70B9\u51FB\u201C\u6211\u5DF2\u5B8C\u6210\u201D\u3002`,
      null,
      "wet_signature"
    );
  }
  f = await step(
    f,
    log("Checked against the agency's requirements", "\u5DF2\u6309\u673A\u6784\u8981\u6C42\u6838\u5BF9", "check"),
    { channel, agent_state: channel === "team" ? "handoff" : "running", requirements_checked: true, status: "in_progress" }
  );
  switch (channel) {
    case "email":
      return await sendEmail(f, d);
    case "fax":
      return await sendFax(f, d);
    case "mail":
      return await sendMail(f, d);
    case "portal":
      return view(await step(f, log("Opening the agency's site", "\u6253\u5F00\u673A\u6784\u7F51\u7AD9", "queued"), { agent_state: "queued" }));
    default:
      await teamTask(f, "handoff", "No automatic channel for this form yet.");
      return view(await step(f, log("No automatic channel for this form yet. The Placetta team submits it.", "\u8BE5\u8868\u683C\u6682\u65E0\u81EA\u52A8\u63D0\u4EA4\u65B9\u5F0F\uFF0C\u7531\u5FEB\u54C9\u56E2\u961F\u63D0\u4EA4\u3002", "handoff")));
  }
}
async function resume(f, by) {
  if (f.agent_state !== "needs_you") return view(f);
  const last = [...f.agent_log].reverse().find((e) => ["needs_you", "wet_signature", "need_person"].includes(e.kind));
  if (last?.kind === "wet_signature") {
    const g2 = await step(f, log("You signed and sent it yourself. The Placetta team confirms it reached the agency.", "\u60A8\u5DF2\u4EB2\u81EA\u7B7E\u7F72\u5E76\u53D1\u51FA\uFF0C\u5FEB\u54C9\u56E2\u961F\u4F1A\u786E\u8BA4\u673A\u6784\u5DF2\u6536\u5230\u3002", "you_sent"), { agent_state: "handoff", channel: "team" });
    await teamTask(g2, "review", "Customer says they signed and sent the form themselves. Confirm with the agency and record the submission.");
    return view(g2);
  }
  if (f.channel === "portal") {
    return view(await step(f, log("You finished your step. Placetta carries on.", "\u60A8\u5DF2\u5B8C\u6210\u8FD9\u4E00\u6B65\uFF0C\u5FEB\u54C9\u7EE7\u7EED\u529E\u7406\u3002", "resume", by), { agent_state: "queued", handoff_url: null }));
  }
  const g = await step(f, log("Checking it again", "\u91CD\u65B0\u6838\u5BF9", "resume", by), { agent_state: null, handoff_url: null }, false);
  return await startAgain(g);
}
var startAgain = (f) => start(f, new Request("https://local"), "resume");
async function signed(f, path, by) {
  if (f.agent_state !== "needs_you") throw new HttpError("bad_request", "This filing isn't waiting for a signed copy.");
  const last = [...f.agent_log].reverse().find((e) => ["needs_you", "wet_signature", "need_person"].includes(e.kind));
  if (last?.kind !== "wet_signature") throw new HttpError("bad_request", "This filing isn't waiting for a signed copy.");
  const d = DEST[f.payload.official ?? ""];
  if (!canFaxSigned(d, env())) throw new HttpError("bad_request", `Placetta can't fax this form yet. Send it yourself, then tap "I've done it".`);
  if (!path.startsWith(`${f.workspace_id}/`)) throw new HttpError("bad_request", "That file isn't in this workspace.");
  const { data: doc, error } = await admin.from("documents").select("path, name, mime").eq("workspace_id", f.workspace_id).eq("path", path).maybeSingle();
  if (error) throw new Error(`documents lookup failed: ${error.code ?? ""}`);
  if (!doc) throw new HttpError("bad_request", "Upload the signed copy to Documents first.");
  const mime = String(doc.mime ?? "").toLowerCase();
  let faxPath = path;
  if (mime !== "application/pdf") {
    if (!/^image\/(jpeg|jpg|png)$/.test(mime)) throw new HttpError("bad_request", "Upload the signed copy as a PDF, JPG or PNG.");
    const dl = await admin.storage.from("documents").download(path);
    if (dl.error || !dl.data) throw new Error("Couldn't read the signed copy.");
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) throw new HttpError("bad_request", "The photo is too large. Upload one under 15 MB.");
    const pdf = await import_npm_pdf_lib_1_17.PDFDocument.create();
    const img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const W = 612, H = 792, M = 36, k = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height);
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k });
    const saved = await saveReceipt(f, "signed-form.pdf", await pdf.save(), "application/pdf");
    if (!saved) throw new Error("Couldn't save the signed copy as a PDF.");
    faxPath = saved;
  }
  const g = await step(
    f,
    log("You signed it by hand and uploaded it. Placetta faxes it to the agency.", "\u60A8\u5DF2\u624B\u5199\u7B7E\u540D\u5E76\u4E0A\u4F20\uFF0C\u5FEB\u54C9\u5C06\u4F20\u771F\u7ED9\u673A\u6784\u3002", "signed_copy", faxPath),
    { agent_state: null, handoff_url: null }
  );
  console.log("signed copy uploaded by", by.slice(0, 120));
  return await startAgain(g);
}
async function refreshStatus(f) {
  if (f.channel === "fax") return await refreshFax(f);
  if (f.channel === "mail") return await refreshMail(f);
  return view(f);
}
async function teamApprove(f, by) {
  const waiting = f.agent_log.at(-1)?.kind === "review_wait" || f.agent_log.some((e) => e.kind === "review_wait" || e.kind === "review_page");
  if (f.agent_state !== "handoff" || !waiting) throw new HttpError("bad_request", "This filing isn't waiting for the team's review.");
  if (env().dryRun) throw new HttpError("bad_request", "Dry run is on: nothing is sent. Turn FILER_DRY_RUN off first.");
  const g = await step(f, log("The Placetta team checked it. Sending now.", "\u5FEB\u54C9\u56E2\u961F\u5DF2\u6838\u5BF9\uFF0C\u73B0\u5728\u53D1\u9001\u3002", "two_key_ok", by), { agent_state: "running" });
  const d = DEST[f.payload.official ?? ""];
  switch (g.channel) {
    case "email":
      return await sendEmail(g, d);
    case "fax":
      return await sendFax(g, d);
    case "mail":
      return await sendMail(g, d);
    case "portal":
      return view(await step(g, null, { agent_state: "queued" }, false));
    default:
      throw new HttpError("bad_request", "No channel to send it on.");
  }
}
async function takeOver(f, by) {
  return view(await step(f, log("The Placetta team took over this filing", "\u5FEB\u54C9\u56E2\u961F\u5DF2\u63A5\u624B\u6B64\u7533\u8BF7", "take_over", by), { agent_state: "handoff", channel: "team" }));
}
async function stop(f, by) {
  const { data, error } = await admin.rpc("stop_agent_filing", { p_id: f.id, p_by: by });
  if (error) {
    if (/too_late/.test(error.message ?? "")) throw new HttpError("too_late", "It has already gone to the agency, so it can't be stopped. If something is wrong, tell us and the team contacts the agency.");
    throw new Error(`stop failed: ${error.message?.slice(0, 200) ?? error.code}`);
  }
  return view(data);
}
async function telnyxWebhook(req) {
  const pub = Deno.env.get("TELNYX_PUBLIC_KEY") ?? "";
  const sig = req.headers.get("telnyx-signature-ed25519") ?? "", ts = req.headers.get("telnyx-timestamp") ?? "";
  const raw = await req.text();
  if (!pub || !sig || !ts || Math.abs(Date.now() / 1e3 - Number(ts)) > 300) throw new HttpError("unauthorized", "Bad webhook.");
  const bytes = (b64) => new Uint8Array(b64urlDecode(b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")));
  const key = await crypto.subtle.importKey("raw", bytes(pub), { name: "Ed25519" }, false, ["verify"]);
  const good = await crypto.subtle.verify("Ed25519", key, bytes(sig), utf8(`${ts}|${raw}`));
  if (!good) throw new HttpError("unauthorized", "Bad webhook signature.");
  const ev = JSON.parse(raw)?.data ?? {};
  const type = String(ev.event_type ?? ""), p = ev.payload ?? {};
  const id = String(p.fax_id ?? p.id ?? "");
  if (!id || !/^fax\.(delivered|failed)$/.test(type)) return ok({});
  const { data } = await admin.from("filings").select(COLS).eq("provider_ref", id).eq("channel", "fax").maybeSingle();
  if (!data) return ok({});
  await applyFax(data, type.slice(4), { pages: p.page_count, reason: p.failure_reason });
  return ok({});
}
async function sweep() {
  const { data: n } = await admin.rpc("requeue_stuck_filings");
  const { data: rows } = await admin.from("filings").select(COLS).in("channel", ["fax", "mail"]).or("agent_state.eq.running,and(channel.eq.mail,receipt_path.is.null,status.eq.submitted)").limit(100);
  for (const r of rows ?? []) {
    try {
      await refreshStatus(r);
    } catch (e) {
      console.error("sweep status:", describe(e));
    }
  }
  for (const s of staleDestinations((/* @__PURE__ */ new Date()).toISOString().slice(0, 10))) {
    await admin.from("team_tasks").upsert(
      { kind: "destination_stale", title: `Re-check ${s.id} destinations (last checked ${s.checked}) on ${s.source}`, dedupe: `stale:${s.id}:${s.checked}` },
      { onConflict: "dedupe", ignoreDuplicates: true }
    );
  }
  return { requeued: n ?? 0, refreshed: rows?.length ?? 0 };
}
serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("provider") === "telnyx") return await telnyxWebhook(req);
  const mk = req.headers.get("x-monitor-key");
  if (mk) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: mk });
    if (good !== true) throw new HttpError("unauthorized", "Wrong monitor key.");
    return ok(await sweep());
  }
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = String(body.action ?? "");
  if (action === "team_approve" || action === "take_over") {
    if (!await isStaff(user) || aalOf(jwt) !== "aal2") throw new HttpError("forbidden", "Placetta team, with two-step sign-in, only.");
    const f2 = await loadFiling(ws, uuidParam(body.filing_id, "filing_id"));
    return ok(action === "team_approve" ? await teamApprove(f2, user.email ?? user.id) : await takeOver(f2, user.email ?? user.id));
  }
  await requireAccess(ws, user, jwt, "member");
  const f = await loadFiling(ws, uuidParam(body.filing_id, "filing_id"));
  if (action === "status") return ok(await refreshStatus(f));
  if (action === "resume") return ok(await resume(f, user.email ?? user.id));
  if (action === "start") return ok(await start(f, req, user.email ?? user.id));
  if (action === "signed") return ok(await signed(f, String(body.path ?? "").slice(0, 500), user.email ?? user.id));
  if (action === "stop") return ok(await stop(f, user.email ?? user.id));
  throw new HttpError("bad_request", "action must be start, resume, signed, stop or status.");
});
