// Per-brand teardown for outreach: what one more store in a given city takes, from the form library.
import { planStores } from "../src/plan";
const T: [string, string, string][] = JSON.parse(process.argv[2]);
const out = T.map(([brand, biz, where]) => {
  const [p] = planStores([{ name: brand, address: where, opening: "2027-04-01" }], biz, [], "2026-10-10");
  const agencies = new Set(p.forms.map(f => f.form.agency.en));
  const slow = p.forms.filter(f => f.days != null).sort((a, b) => b.days! - a.days!)[0];
  const renew = p.forms.filter(f => f.everyMonths);
  return { brand, where, forms: p.forms.length, agencies: agencies.size, fees: p.fees, varies: p.varies,
    slowest: slow ? { form: slow.form.form, title: slow.form.title.en, agency: slow.form.agency.en, days: slow.days } : null,
    fileFirst: p.fileFirst, renewing: renew.length, list: p.forms.map(f => `${f.form.form} | ${f.form.title.en} | ${f.form.agency.en} | ${f.form.fee ?? "varies"} | ${f.days ?? ""}`) };
});
console.log(JSON.stringify(out, null, 1));
