// The recorder for teach mode (teach.ts): a script in the agency's page that reports what the person does, by the
// control's accessibility role and name, never by where it sits. It runs in the top page only (not a CAPTCHA's frame).
//
// What never leaves the page: the value of a password field, and of any field that reads as a secret (an SSN, ITIN,
// passport, card, bank or one-time code, by its label, name or autocomplete). For those the page says only that the
// field was filled. Files report only how many were chosen, never their names. Everything else the person types goes
// to the worker in memory, where record() matches it against the approved values and keeps only the placeholder.
import type { Page } from "playwright-core";
import type { RawEvent } from "./teach.ts";

/** The page script. Plain ES2017, no imports: addInitScript runs it in every new document before the agency's own. */
export const RECORDER_JS = String.raw`(() => {
  if (window.top !== window || window.__pcTeachOn) return;
  window.__pcTeachOn = true;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const SECRET = /password|passcode|\bssn\b|social security|\bitin\b|taxpayer identification|passport|card|cvv|cvc|csc|security code|expir|routing|account number|\bacct\b|iban|bank account|one-time|verification code|sms code/i;
  const labelOf = (el) => {
    const id = el.getAttribute("id");
    if (id) { const l = document.querySelector('label[for="' + CSS.escape(id) + '"]'); if (l) return clean(l.textContent); }
    const wrap = el.closest("label"); if (wrap) return clean(wrap.textContent);
    const aria = el.getAttribute("aria-label"); if (aria) return clean(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) return clean(by.split(/\s+/).map((x) => (document.getElementById(x) || {}).textContent || "").join(" "));
    return clean(el.getAttribute("placeholder"));
  };
  const typeOf = (el) => (el.getAttribute("type") || (el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : "text")).toLowerCase();
  const roleOf = (el) => {
    const r = el.getAttribute("role"); if (r) return r;
    const t = typeOf(el);
    if (el.tagName === "A") return "link";
    if (el.tagName === "BUTTON" || ["submit", "button", "reset", "image"].includes(t)) return "button";
    if (el.tagName === "SELECT") return "combobox";
    if (t === "checkbox" || t === "radio" || t === "file") return t;
    return "textbox";
  };
  const heading = () => clean((document.querySelector("h1, h2, h3") || {}).textContent) || clean(document.title);
  const send = (ev) => { try { window.__pcTeach(Object.assign({ url: location.href, heading: heading(), at: Date.now() }, ev)); } catch (e) { /* the worker isn't listening */ } };
  const base = (el) => ({ role: roleOf(el), name: labelOf(el), type: typeOf(el), autocomplete: clean(el.getAttribute("autocomplete")).toLowerCase(), id: clean(el.getAttribute("id")), nameAttr: clean(el.getAttribute("name")) });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    const b = base(el), t = b.type;
    if (t === "checkbox" || t === "radio") return send(Object.assign({ kind: "check", checked: !!el.checked }, b));
    if (t === "file") return send(Object.assign({ kind: "upload", files: (el.files || []).length }, b));
    const secret = t === "password" || SECRET.test(b.name + " " + b.nameAttr + " " + b.id) || /^cc-/.test(b.autocomplete) || b.autocomplete === "one-time-code";
    if (el.tagName === "SELECT") return send(Object.assign({ kind: "select", value: secret ? undefined : clean((el.selectedOptions[0] || {}).textContent), secret }, b));
    send(Object.assign({ kind: "fill", value: secret ? undefined : String(el.value || "").slice(0, 500), secret }, b));
  }, true);
  document.addEventListener("click", (e) => {
    const el = e.target && e.target.closest && e.target.closest("button, a[href], input[type=submit], input[type=button], input[type=image], [role=button], [role=link]");
    if (!el) return;
    const name = clean(el.textContent || el.value || el.getAttribute("aria-label") || el.getAttribute("title"));
    send({ kind: "click", role: roleOf(el), name, id: clean(el.getAttribute("id")), nameAttr: clean(el.getAttribute("name")) });
  }, true);
  const page = () => send({ kind: "page" });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", page); else page();
})();`;

const KINDS = new Set(["fill", "select", "check", "click", "upload", "page"]);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** What the page sent, as a RawEvent, or null. A page could call the binding itself, so nothing it sends is trusted:
 *  known fields only, bounded, and a value from a field the event itself marks as a password or secret is dropped. */
export function rawEvent(x: unknown): RawEvent | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.kind !== "string" || !KINDS.has(o.kind) || typeof o.url !== "string") return null;
  const type = str(o.type, 30)?.toLowerCase();
  const secret = o.secret === true || type === "password";
  return {
    kind: o.kind as RawEvent["kind"], url: o.url.slice(0, 2000), heading: str(o.heading, 200) ?? "", at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : undefined,
    role: str(o.role, 30), name: str(o.name, 200), type, autocomplete: str(o.autocomplete, 60), id: str(o.id, 100), nameAttr: str(o.nameAttr, 100),
    ...(secret ? { secret: true } : { value: str(o.value, 500) }),
    ...(typeof o.checked === "boolean" ? { checked: o.checked } : {}), ...(typeof o.files === "number" ? { files: Math.min(50, Math.max(0, Math.floor(o.files))) } : {}),
  };
}

/** Start recording the page: every event the person causes in the top page goes to onEvent. Installed before the run's
 *  first navigation, so every page of the portal has it. */
export async function startRecorder(page: Page, onEvent: (e: RawEvent) => void): Promise<void> {
  await page.exposeBinding("__pcTeach", (source, ev: unknown) => {
    if (source.frame !== page.mainFrame()) return;
    const e = rawEvent(ev);
    if (e) onEvent(e);
  });
  await page.addInitScript(RECORDER_JS);
}
