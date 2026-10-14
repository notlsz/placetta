// Prints a form's questions as Placetta asks them (id, printed line, label, options): the left side of a box map.
//   npx tsx scripts/forms-fields.mts tx-205
import { FORMS } from "../src/forms/registry.ts";
const f = FORMS.find(x => x.id === process.argv[2]);
if (!f) throw new Error("no such form");
console.log(`${f.id}: ${f.form} - ${f.title.en}\npdf: ${f.pdf}\n`);
for (const q of f.fields) console.log(`${q.id}\tline ${q.line}\t${q.label.en}${q.options ? `\toptions: ${q.options.join(" | ")}` : ""}${q.hint ? `\thint: ${q.hint.en}` : ""}`);
