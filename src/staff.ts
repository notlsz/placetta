import { B, type Bi } from "./bi";
import type { Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * The language each staff member reads. Every compliance tool writes
 * to line staff in English only; many US kitchen crews read Spanish
 * first, and Chinese brands' crews often read Chinese. Each staff
 * contact (a person on a store's certificate list) has a language for
 * the messages Odelia drafts to them: food handler reminders,
 * inspection checklists, shift notices. The app itself stays in English
 * and Chinese; only the drafted message changes.
 * ------------------------------------------------------------------ */

export type StaffLang = "en" | "zh" | "es";
export const STAFF_LANGS: { id: StaffLang; name: string; en: string }[] = [
  { id: "en", name: "English", en: "English" }, { id: "zh", name: "中文", en: "Chinese" }, { id: "es", name: "Español", en: "Spanish" },
];
const LANG_ZH: Record<StaffLang, string> = { en: "英文", zh: "中文", es: "西班牙语" };

/** Every staff contact with a language set, by name: one person across stores counts once. */
export function staffLanguages(w: Workspace): { name: string; lang: StaffLang }[] {
  const out = new Map<string, { name: string; lang: StaffLang }>();
  for (const s of w.stores ?? []) for (const c of s.certs ?? []) if (c.lang && !out.has(c.person.toLowerCase())) out.set(c.person.toLowerCase(), { name: c.person, lang: c.lang });
  return [...out.values()];
}

/** The language a short message is written in: Chinese by its characters, Spanish by its everyday words and accents,
 *  English otherwise. Good enough to catch a reminder drafted in the wrong one. */
export function langOf(text: string): StaffLang {
  const han = (text.match(/[一-鿿]/g) ?? []).length, letters = (text.match(/[A-Za-zÀ-ſ]/g) ?? []).length;
  if (han > 0 && han * 3 >= letters) return "zh";
  const words = text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  const es = words.filter(x => /^(hola|gracias|por|favor|para|tu|tus|su|sus|usted|el|la|los|las|del|que|con|antes|tiene|tienes|necesitas|necesita|debe|debes|renovar|vence|tarjeta|manipulador|manipuladores|alimentos|curso|turno|hoy|mañana|semana|lunes|martes|miércoles|jueves|viernes|sábado|domingo|está|es|y|en|de|un|una)$/.test(x)).length;
  const en = words.filter(x => /^(the|and|your|you|please|thanks|thank|before|card|need|must|renew|expires|shift|today|tomorrow|week|is|are|of|to|for|with)$/.test(x)).length;
  return es > en || (/[ñ¿¡]/.test(text) && es >= en) ? "es" : "en";
}

/** The staff named in a message's recipients ("Ana P.", "Ana P. and Marco D.", "Ana"), with the language each reads. */
export function recipients(w: Workspace, to: string): { name: string; lang: StaffLang }[] {
  const t = to.toLowerCase(), all = staffLanguages(w);
  return all.filter(p => {
    const full = p.name.toLowerCase();
    if (t.includes(full)) return true;
    const first = full.split(/\s+/)[0];
    // a first name alone, when no one else on staff shares it
    return first.length >= 3 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t) && all.filter(x => x.name.toLowerCase().split(/\s+/)[0] === first).length === 1;
  });
}

/** The check draft_message makes: an error for the model when the message isn't in the language its staff recipients
 *  read (or they read different ones), else the line the approval shows. Nothing when no recipient has one set. */
export function staffLanguageCheck(w: Workspace, to: string, message: string): { error?: string; does?: Bi } {
  const who = recipients(w, to);
  if (!who.length) return {};
  const langs = [...new Set(who.map(p => p.lang))];
  const name = (l: StaffLang) => STAFF_LANGS.find(x => x.id === l)!.en;
  if (langs.length > 1) return { error: `These staff read different languages (${who.map(p => `${p.name}: ${name(p.lang)}`).join(", ")}). Draft one message per language, each to the people who read it.` };
  const want = langs[0], got = langOf(message);
  const names = who.map(p => p.name).join(", ");
  if (got !== want) return { error: `${names} read${who.length === 1 ? "s" : ""} ${name(want)}, as set on their staff contact. Write the whole message in ${name(want)} and call draft_message again; keep names, dates, amounts and links as they are.` };
  if (want === "en") return {};
  return { does: B(`Written in ${name(want)} for ${names}, the language set on their staff contact`, `按员工联系人的设置，用${LANG_ZH[want]}写给 ${names}`) };
}
