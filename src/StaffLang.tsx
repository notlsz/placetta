import { useApp } from "./ctx";
import { B, same } from "./bi";
import { audit } from "./core";
import { STAFF_LANGS, type StaffLang } from "./staff";

/** The language a staff member reads (src/staff.ts), on their row in Stores: what Odelia drafts to them is written in it.
 *  Set once per person, across every store they work at. The app's own words stay in English and Chinese. */
export function StaffLangPick({ person, value }: { person: string; value?: StaffLang }) {
  const { b, editWs } = useApp();
  const set = (lang: StaffLang) => editWs(w => audit("you", B("Set the language for messages", "设置消息语言"), same(person), same(STAFF_LANGS.find(l => l.id === lang)!.name))({
    ...w, stores: (w.stores ?? []).map(s => ((s.certs ?? []).some(c => c.person === person) ? { ...s, certs: s.certs.map(c => (c.person === person ? { ...c, lang } : c)) } : s)),
  }));
  return (
    <label className="staff-lang" title={b(B("Messages Odelia drafts to this person are written in this language", "Odelia 起草给此人的消息使用这种语言"))}>
      <span className="sr">{b(B(`Messages to ${person} in`, `发给 ${person} 的消息语言`))}</span>
      <select value={value ?? "en"} onChange={e => set(e.target.value as StaffLang)}>
        {STAFF_LANGS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  );
}
