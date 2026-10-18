// Every proof the plans can show: the library's forms (src/forms/proof.ts and src/forms/beachhead.ts) and the generic
// rows' sources (src/plan/preview.ts). `npm run proof:read` dumps them and re-reads each page (scripts/eval/proof-read.py).
import { FORMS } from "../../src/forms/registry";
import { GENERIC_SOURCES } from "../../src/plan/preview";
const out: { id: string; read: string; quote: string }[] = [];
for (const f of FORMS) if (f.proof) out.push({ id: f.id, read: f.proof.read, quote: f.proof.quote });
for (const s of GENERIC_SOURCES) out.push({ id: `generic:${s.label}:${s.url}`, read: s.url, quote: s.quote });
console.log(JSON.stringify(out, null, 1));
