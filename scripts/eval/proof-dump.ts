// Every proof the plans can show: the library's forms (src/forms/proof.ts and src/forms/beachhead.ts) and the generic
// rows' sources (src/plan/preview.ts). `npm run proof:read` dumps them and re-reads each page (scripts/eval/proof-read.py).
import { FORMS } from "../../src/forms/registry";
import { GENERIC_SOURCES } from "../../src/plan/preview";
import { STATE_SOURCES } from "../../src/plan/ask";
import { KIND_FACTS } from "../../src/forms/kinds";
const out: { id: string; read: string; quote: string }[] = [];
for (const f of FORMS) if (f.proof) out.push({ id: f.id, read: f.proof.read, quote: f.proof.quote });
// what differs by kind of food business (src/forms/kinds.ts)
for (const k of KIND_FACTS) out.push({ id: `kind:${k.id}`, read: k.proof.read, quote: k.proof.quote });
for (const s of [...GENERIC_SOURCES, ...STATE_SOURCES]) out.push({ id: `generic:${s.label}:${s.url}`, read: s.url, quote: s.quote });
console.log(JSON.stringify(out, null, 1));
