// npm test (needs a Chromium, like filer.test.ts): each playbook replayed against a static copy of the pages its
// published guide documents (test/mocks/<host>.html, one <template> per page in the order of one form's steps).
// Nothing here opens a real portal or signs in. For every page it checks what the worker's guards key on: the step's
// page name is the page's heading, the control the guide names is there, the final-submit guard fires only on the
// guide's sending page, the fee pages go to the person, and the last page is the guide's receipt.
import { test, after } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { mustStop, type PageState } from "../src/guards.ts";
import { locate, pageState } from "../src/page.ts";
import { finalOn, payOn, PLAYBOOKS, type Playbook, type Step } from "../src/playbooks.ts";

const DIR = new URL("./mocks/", import.meta.url);
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const heads = (s: PageState) => [s.title, ...s.headings].map(norm).join(" | ");

type Mock = { host: string; form: string; pages: { title: string; html: string }[] };
function readMock(file: string): Mock {
  const src = readFileSync(new URL(file, DIR), "utf8");
  const form = /<meta name="replay-form" content="([^"]+)">/.exec(src)?.[1] ?? "";
  const pages = [...src.matchAll(/<template data-title="([^"]*)">([\s\S]*?)<\/template>/g)].map((m) => ({ title: m[1], html: m[2] }));
  return { host: file.replace(/\.html$/, ""), form, pages };
}
const MOCKS = readdirSync(DIR).filter((f) => f.endsWith(".html")).sort().map(readMock);

/** The guide's sending step: a step that reviews, submits or agrees, on the page the playbook's `final` names (or, when
    `final` names only a button, the step that names that button). */
const sends = (p: Playbook, s: Step) => ["review", "submit", "agree"].includes(s.do)
  && p.final.some((f) => f.page ? norm(s.page).includes(norm(f.page)) : !!f.button && s.selector === `button:${f.button}`);

let browser: Browser | null = null;
after(async () => { await browser?.close(); });
const open = async () => {
  browser ??= await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_PATH ? ["--no-sandbox"] : [] });
  return (await browser.newContext()).newPage();
};

test("every playbook has a mock of its documented pages", () => {
  assert.deepEqual(MOCKS.map((m) => m.host).sort(), PLAYBOOKS.map((p) => p.host).sort());
});

for (const mock of MOCKS) {
  test(`replays the ${mock.host} playbook (${mock.form}) against its guide's pages`, async () => {
    const p = PLAYBOOKS.find((x) => x.host === mock.host)!;
    const steps = p.forms[mock.form]?.steps;
    assert.ok(steps, `${mock.form} is in the ${mock.host} playbook`);
    assert.equal(mock.pages.length, steps.length, "one mock page per step");
    const page = await open();
    let sent = 0;
    for (const [i, step] of steps.entries()) {
      const m = mock.pages[i];
      await page.setContent(`<!doctype html><html><head><title>${m.title}</title></head><body>${m.html}</body></html>`);
      const s = await pageState(page);
      const at = `${mock.host} step ${i + 1} (${step.page})`;
      assert.ok(heads(s).includes(norm(step.page)), `${at}: the page's heading names it`);
      if (step.selector) assert.equal(await locate(page, step.selector).count(), 1, `${at}: ${step.selector} is on the page`);
      if (step.do === "sign_in") assert.ok(s.controls.some((c) => c.type === "password"), `${at}: a sign-in form`);
      // The final-submit guard: on the sending page the guide's button (or any forward button) triggers it; on every
      // other page no button or link does, so nothing is sent early and nothing after it counts as a second send.
      const firing = [...s.buttons.map((b) => b.text), ...s.links.map((l) => l.text)].filter((t) => finalOn(p, s, t));
      if (sends(p, step)) {
        sent++;
        assert.ok(firing.length >= 1, `${at}: the guide's send button triggers the final-submit guard`);
        for (const f of p.final) if (f.button && heads(s).includes(norm(f.page))) assert.ok(firing.map(norm).includes(norm(f.button)), `${at}: ${f.button}`);
        assert.ok(!firing.some((t) => /back|save|cancel|edit|previous|print/i.test(t)), `${at}: back and save never send`);
      } else {
        assert.deepEqual(firing, [], `${at}: no send here`);
      }
      // The fee: its pages go to the person, and a card field on one stops the worker; nothing else stops it.
      assert.equal(payOn(p, s), step.do === "pay", `${at}: fee page`);
      const stop = mustStop(s);
      if (step.do === "pay") assert.ok(!stop || stop.reason === "payment", `${at}: ${stop?.reason}`);
      else assert.equal(stop, null, `${at}: no guard stops a documented page`);
      if (step.do === "receipt") assert.ok(p.receipt.some((w) => heads(s).includes(norm(w))), `${at}: the guide's receipt page`);
    }
    assert.equal(sent, 1, `${mock.host}: exactly one page sends the application`);
    await page.context().close();
  });
}
