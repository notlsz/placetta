// Run: deno test -A supabase/functions/agent-run/forms_test.ts
// Filling the agencies' forms on the server: the same fill and read-back the app runs (src/forms/), from agent.js, in
// Deno with npm:pdf-lib. Every agency PDF comes the way agent-run gets it (formPdf, from the site's /app/forms/), here
// read from public/forms/; the SS-4 and CBP 5106 too, which aren't inside agent.js (the 5 MB deploy limit). Each filled
// copy is read back, and no SSN is ever on it.
// @ts-types="./agent.d.ts"
import { answersHash, fillForm, pdfFile, readBack, type Field, type LoadPdf } from "./agent.js";
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { filledLines, filledSay, formFileName, formLinkUrl, formToken } from "../_shared/form_links.ts";
import { sendMail } from "../_shared/mail.ts";

const root = new URL("../../../", import.meta.url);
/** As agent-run's formPdf (sitePdf): the site's copy, "pdf/irs-fss4.pdf" served as /app/forms/irs-fss4.pdf. */
const disk: LoadPdf = async (file) => await Deno.readFile(new URL("public/forms/" + file.replace(/^pdf\//, ""), root));
const F = (id: string, value: string): Field => ({ id, label: { en: id, zh: id }, value });
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;

async function textOf(pdf: Uint8Array): Promise<string[]> {
  const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
  const d = await PDFDocument.load(pdf, { ignoreEncryption: true });
  // deno-lint-ignore no-explicit-any
  return d.getForm().getFields().map((f: any) => { try { return String(f.getText?.() ?? ""); } catch { return ""; } }).filter(Boolean);
}

Deno.test("the SS-4 fills on the server from the site's copy, reads back, and never carries an SSN", async () => {
  assertEquals(pdfFile("irs-ss4"), "pdf/irs-fss4.pdf");
  const fields = [F("l1", "Moonleaf Tea LLC"), F("l2", "Moonleaf Tea"), F("l4a", "100 N First St"), F("l4b", "San Jose, CA 95113"), F("l7a", "Mei Lin"),
    F("l7b", "123-45-6789"), F("l8a", "Yes"), F("l10", "Started a new milk tea shop"), F("l16", "Accommodation & food service"), F("phone", "(408) 555-0142")];
  const out = await fillForm("irs-ss4", fields, disk);
  assert(out && out.pdf.length > 50_000, "a filled PDF came back");
  const r = await readBack("irs-ss4", out!);
  assert(r.checked >= 8, `the read-back checked every line it wrote (${r.checked})`);
  assertEquals(r.issues.map((i) => [i.id, i.kind]), [["l7b", "secret"]], "the only problem: an SSN on line 7b, which isn't printed");
  const texts = await textOf(out!.pdf);
  assert(texts.includes("Moonleaf Tea LLC") && texts.includes("100 N First St"), "the answers are in the form's own boxes");
  assert(!texts.some((t) => SSN.test(t)), "no SSN anywhere on the PDF");
  // line 10 runs on to the line below by whole words, so nothing is cut off in the short blank
  assert(texts.includes("Started a") && texts.includes("new milk tea shop"), JSON.stringify(texts.filter((t) => /milk|Started/.test(t))));
  const clean = await readBack("irs-ss4", (await fillForm("irs-ss4", fields.map((f) => (f.id === "l7b" ? F("l7b", "Foreign") : f)), disk))!);
  assert(clean.ok, JSON.stringify(clean.issues));
});

Deno.test("a flat form (no fillable boxes) fills by its map and its printed words read back", async () => {
  assertEquals(pdfFile("aus-food-permit"), "aus-food-permit.pdf");
  const fields = [F("name", "Moonleaf Tea LLC"), F("address", "100 Congress Ave, Austin, TX 78701")];
  const out = await fillForm("aus-food-permit", fields, disk);
  const r = await readBack("aus-food-permit", out!);
  assert(r.ok && r.checked === 2, JSON.stringify(r));
  // too long for its line, even at the smallest size: the read-back says so
  const long = await fillForm("aus-food-permit", [F("name", "Moonleaf Tea and Snacks Limited Liability Company of the Greater Austin Metropolitan Area, Texas, doing business as Moonleaf Tea House and Bakery")], disk);
  const r2 = await readBack("aus-food-permit", long!);
  assertEquals(r2.issues.map((i) => [i.id, i.kind]), [["name", "overflow"]]);
  // characters the form can't print
  const zh = await readBack("aus-food-permit", (await fillForm("aus-food-permit", [F("name", "月叶茶 Moonleaf Tea")], disk))!);
  assert(zh.issues.some((i) => i.id === "name" && i.kind === "characters"), JSON.stringify(zh.issues));
});

Deno.test("the same answers have the same fingerprint, whatever their order", () => {
  assertEquals(answersHash({ fields: [F("a", "1"), F("b", "2")] }), answersHash({ fields: [F("b", "2 "), F("a", "1")] }));
  assert(answersHash({ fields: [F("a", "1")] }) !== answersHash({ fields: [F("a", "2")] }));
});

Deno.test("the filled form's line and link for a text or chat", () => {
  const t = formToken();
  assert(/^[A-Za-z0-9]{14}$/.test(t) && t !== formToken(), "a random token, as the database accepts");
  assertEquals(formLinkUrl("https://app.placetta.test", "w1", t), `https://app.placetta.test/app/?ws=w1&f=${t}`);
  assertEquals(formFileName({ form: "DE 1", version: 2 }), "DE 1, filled, version 2.pdf");
  const f = { app: "edd", form: "DE 1", version: 2, changed: 3, filled: 19, ok: true, link: "https://x/app/?ws=w1&f=abc" };
  assertEquals(filledSay(f, "en"), "Filled: DE 1, version 2, 3 lines changed");
  assertEquals(filledSay({ ...f, version: 1 }, "zh"), "已填写：DE 1，第 1 版，已填 19 行");
  assertEquals(filledLines([f], "en"), "Filled: DE 1, version 2, 3 lines changed. View it: https://x/app/?ws=w1&f=abc");
  assertEquals(filledLines([{ ...f, link: undefined }], "zh"), "已填写：DE 1，第 2 版，3 行有改动。");
  assert(/Not ready to file yet: line 4/.test(filledSay({ ...f, ok: false, problem: { en: "line 4", zh: "第 4 行" } }, "en")));
});

Deno.test("an email carries the filled PDF as an attachment (Resend and Postmark)", async () => {
  const sent: Record<string, unknown>[] = [];
  const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ id: "m1", MessageID: "m1" }), { status: 200 }); }) as unknown as typeof fetch;
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const env = (k: string) => ({ ODELIA_EMAIL: "odelia@placetta.test", RESEND_API_KEY: "re" } as Record<string, string>)[k] ?? "";
  const r = await sendMail(env, { to: "mei@moonleaf.test", subject: "Re: DE 1", text: "t", html: "<p>t</p>", attachments: [{ name: "DE 1, filled, version 2.pdf", content: pdf, type: "application/pdf" }] }, f);
  assert(r.ok);
  assertEquals((sent[0].attachments as { filename: string; content: string }[])[0], { filename: "DE 1, filled, version 2.pdf", content: btoa("%PDF-1"), content_type: "application/pdf" });
  const pm = (k: string) => ({ ODELIA_EMAIL: "odelia@placetta.test", POSTMARK_SERVER_TOKEN: "pm" } as Record<string, string>)[k] ?? "";
  await sendMail(pm, { to: "mei@moonleaf.test", subject: "x", text: "t", html: "t", attachments: [{ name: "a.pdf", content: pdf, type: "application/pdf" }] }, f);
  assertEquals((sent[1].Attachments as { Name: string }[])[0].Name, "a.pdf");
});
