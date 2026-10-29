// node --experimental-strip-types --test test/tick.test.ts: ticking boxes the way government sites draw them.
import { test, after } from "node:test";
import assert from "node:assert";
import { chromium, type Browser } from "playwright-core";
import { portalDown } from "../src/heal.ts";
import { tick } from "../src/page.ts";

let browser: Browser | undefined;
const open = async () => (browser ??= await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_PATH ? ["--no-sandbox"] : [] }));
after(async () => { await browser?.close(); });

// FinCEN's BOI e-filing (USWDS): the real radio is moved off screen and the label draws the circle.
const USWDS = `<style>.usa-radio__input{position:absolute;left:-999em}</style>
<fieldset><legend>Filing type</legend>
<input class="usa-radio__input" type="radio" id="fi.filingType.value1" name="fi.filingType" value="INITIAL"><label for="fi.filingType.value1">Initial report</label>
<input class="usa-radio__input" type="radio" id="fi.filingType.value2" name="fi.filingType" value="CORRECTED"><label for="fi.filingType.value2">Correct the prior report</label>
<input class="usa-checkbox__input" style="position:absolute;left:-999em" type="checkbox" id="agree"><label for="agree">I agree</label></fieldset>`;

test("a radio hidden behind its label, as FinCEN draws it, is ticked through the label", { timeout: 60000 }, async () => {
  const page = await (await open()).newPage();
  await page.setContent(USWDS);
  const t0 = Date.now();
  await tick(page.locator('[id="fi.filingType.value1"]'), true);
  assert.ok(await page.locator('[id="fi.filingType.value1"]').isChecked());
  assert.ok(!(await page.locator('[id="fi.filingType.value2"]').isChecked()));
  await tick(page.locator("#agree"), true);
  assert.ok(await page.locator("#agree").isChecked());
  await tick(page.locator("#agree"), false);
  assert.ok(!(await page.locator("#agree").isChecked()));
  assert.ok(Date.now() - t0 < 45000, "well under the old 30 seconds a box");
  await page.close();
});

test("a box that never ticks is an error about the box, not the site being down", { timeout: 60000 }, async () => {
  const page = await (await open()).newPage();
  await page.setContent(`<input type="checkbox" id="x" disabled><label for="x">Locked</label>`);
  await assert.rejects(tick(page.locator("#x"), true), /Couldn't tick that box/);
  assert.equal(portalDown("locator.setChecked: Timeout 30000ms exceeded."), false);
  assert.equal(portalDown("page.goto: Timeout 30000ms exceeded."), true, "a page that won't load is still the site");
  assert.equal(portalDown("net::ERR_CONNECTION_RESET"), true);
  await page.close();
});

test("the page reader lists a radio or checkbox drawn on its label, so Odelia can see and answer it", { timeout: 60000 }, async () => {
  const { pageState } = await import("../src/page.ts");
  const page = await (await open()).newPage();
  await page.setContent(`<p>Would you like to receive information about City-offered additional opportunities and programs?</p>${USWDS}<input type="radio" id="gone" style="display:none"><label for="gone" style="display:none">Hidden both</label>`);
  const st = await pageState(page);
  const labels = st.controls.map((c) => c.label);
  assert.ok(labels.includes("Initial report") && labels.includes("I agree"), labels.join(", "));
  assert.ok(!labels.includes("Hidden both"), "a control hidden with its label stays out");
  await page.close();
});
