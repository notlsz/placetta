// Fills an agency PDF from its box map with test answers and writes the filled PDF plus one PNG per page, so a person
// (or the checks) can look at where every answer landed. Also lists answers that went nowhere.
//   npx tsx scripts/forms-check.mts tx-205 [answers.json] [outdir]
// answers.json: { "<field id>": "<value>" }; without it, every field gets a recognizable test value.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import type { FormMap } from "../src/forms/boxes.ts";
import { pdfLibWriter, writeAnswers } from "../src/forms/boxes.ts";
import { FORMS } from "../src/forms/registry.ts";

const [id, answersPath, out = `/tmp/forms-check/${process.argv[2]}`] = process.argv.slice(2);
const map: FormMap = JSON.parse(readFileSync(new URL(`../src/forms/maps/${id}.json`, import.meta.url), "utf8"));
const form = FORMS.find(f => f.id === id);
if (!form) throw new Error(`No form ${id} in the registry`);
const values: Record<string, string> = answersPath ? JSON.parse(readFileSync(answersPath, "utf8")) : Object.fromEntries(form.fields.map(f => [f.id, f.options?.[0] ?? `${f.line} ${f.label.en}`.slice(0, 40)]));
const doc = await PDFDocument.load(readFileSync(new URL(`../public/forms/${map.pdf}`, import.meta.url)), { ignoreEncryption: true });
const pdfForm = doc.getForm();
const missingBoxes: string[] = [];
const w = pdfLibWriter(pdfForm);
const logged = { text: (n: string, v: string) => w.text(n, v) || (missingBoxes.push(n), false), check: (n: string) => w.check(n) || (missingBoxes.push(n), false), radio: (n: string, v: string) => w.radio(n, v) || (missingBoxes.push(`${n}=${v}`), false), choice: (n: string, v: string) => w.choice(n, v) || (missingBoxes.push(`${n}=${v}`), false) };
const filled = writeAnswers(map, values, logged);
try { pdfForm.deleteXFA(); } catch { /* none */ }
try { pdfForm.updateFieldAppearances(); } catch (e) { console.log("appearance:", String(e).slice(0, 120)); }
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/${id}-filled.pdf`, await doc.save());
execFileSync("python3", ["-c", `import pymupdf as f,sys\nd=f.open(sys.argv[1])\nfor p in d: p.get_pixmap(dpi=90).save(f"{sys.argv[2]}/page{p.number+1}.png")`, `${out}/${id}-filled.pdf`, out]);
const unmapped = form.fields.filter(f => !map.boxes[f.id]).map(f => f.id);
const blank = form.fields.filter(f => map.boxes[f.id] && values[f.id] && !filled.has(f.id)).map(f => f.id);
console.log(JSON.stringify({ out, pages: doc.getPageCount(), fields: form.fields.length, mapped: Object.keys(map.boxes).length, unmappedFields: unmapped, answeredButNotWritten: blank, boxNamesNotFound: missingBoxes, unknownFieldIds: Object.keys(map.boxes).filter(k => !form.fields.some(f => f.id === k)) }, null, 1));
