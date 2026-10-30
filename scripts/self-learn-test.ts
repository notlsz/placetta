/* Odelia learns from her own slips (src/selfLearn.ts): a refusal and the call that fixed it become a lesson, written in
   Placetta's words, carrying no business's data, and every later run starts from it. */
import { makeTools, type Made, type X } from "../src/live";
import { SAMPLE, type Workspace } from "../src/model";
import { noteCall, fixLessons, shape, type SelfState } from "../src/selfLearn";
import { lessonsBrief, lessonKeys, lessonUsable, type Lesson } from "../src/learning";

let fails = 0;
const ok = (c: unknown, name: string, detail?: unknown) => { if (c) console.log("ok  ", name); else { fails++; console.log("FAIL", name, detail ?? ""); } };

let w: Workspace = structuredClone(SAMPLE);
const made: Made = { apps: new Set(), approvals: [], memory: [], skills: [], files: [], lastToolAt: 0 };
const x = { model: {} as X["model"], files: new Map(), signal: new AbortController().signal } as X;
const tools = makeTools(() => w, p => { w = p(w); }, () => undefined, made, "en", () => 0, false, x);
const self: SelfState = { slips: [], fixes: [] };
const call = async (name: string, input: Record<string, unknown>) => {
  let content: unknown, error = false;
  try { content = JSON.stringify(await (tools.find(t => t.name === name)!.execute as (i: Record<string, unknown>) => unknown)(input)); } catch (e) { content = (e as Error).message; error = true; }
  noteCall(self, { name, input, content, error }, w);
  return { content: String(content), error };
};

// a store and the Boston Common Victualler form, whose patio line takes Private, Public or Both
const s = JSON.parse((await call("add_store", { name: "Harbor", address: "88 Beach St, Boston, MA 02111", city: "Boston", state: "MA" })).content);
const a = JSON.parse((await call("prepare_application", { official_form_id: "bos-cv", store_id: s.store_id })).content);
const id = a.application_id;
const patio = "Patio: on private property, public property or both";

// 1. a value that isn't one of the line's choices, then the choice that fits
const r1 = await call("fill_fields", { application_id: id, fields: [{ label: patio, value: "Sidewalk patio for Mei Chen's dim sum" }] });
ok(/not_a_choice/.test(r1.content), "the first answer is refused as not a choice", r1.content.slice(0, 200));
ok(self.slips.some(x => x.line === "patio_property"), "the refusal is noted as a slip on its line", self.slips);
await call("fill_fields", { application_id: id, fields: [{ label: patio, value: "Public" }] });
ok(self.fixes.some(f => f.line === "patio_property" && f.good === "Public"), "the accepted choice fixes it", self.fixes);

// 2. a tool error, then the same tool working
await call("fill_fields", { application_id: "nope", fields: [{ label: "x", value: "y" }] });
await call("fill_fields", { application_id: id, fields: [{ label: "Email", value: "owner@example.com" }] });
ok(self.fixes.some(f => f.tool === "fill_fields" && !f.label), "a tool error then a working call is a fix", self.fixes);

// 3. the lessons: Placetta's words, the business's value only as its shape
const ls = fixLessons(self.fixes);
ok(ls.length >= 2 && ls.every(l => l.kind === "fix" && l.official), "fixes become live fix lessons", ls);
ok(ls.some(l => l.key === "form:bos-cv" && /Public/.test(l.text.en)), "the form's lesson names the line and the choice that worked", ls.map(l => l.text.en));
ok(ls.every(l => !/Mei|Chen|dim sum|owner@|Harbor|Beach|nope|victualler-license-1/i.test(l.text.en + l.text.zh)), "no business data in a lesson, and no quoted ids", ls.map(l => l.text.en));
ok(shape("Mei Chen, 88 Beach St") === "Xxx Xxxx, 99 Xxxxx Xx" && shape("2\n0\n1") === "9 / 9 / 9", "a value is kept only as its shape", shape("Mei Chen, 88 Beach St"));

// 4. every later run starts from them: the keys include the form and the tools, and the brief shows them
const keys = lessonKeys(w);
ok(keys.includes("form:bos-cv") && keys.includes("tool:fill_fields"), "a run's lesson keys include its forms and the tools", keys);
const asLesson = ls.map((l, k): Lesson => ({ id: "f" + k, kind: "fix", key: l.key, text: l.text, businesses: 0, confirms: 0, contradicts: 0, wins: 0, losses: 0 }));
ok(asLesson.every(lessonUsable), "a fix is usable without a second business", asLesson);
const brief = lessonsBrief(asLesson, "en");
ok(/Fixes from your own earlier runs/.test(brief) && /Public/.test(brief), "the brief puts the fixes in front of the next run", brief.slice(0, 400));
ok(!lessonUsable({ ...asLesson[0], contradicts: 2 }), "a fix businesses contradict stops being used");

if (fails) { console.error(`\n${fails} failed`); process.exit(1); } else console.log("\nall passed");
