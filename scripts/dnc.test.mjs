// npm run test:dnc: the do-not-contact list keys and filters as the call lists expect.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { dncKey } from "./dnc.mjs";
import { build } from "./leads.mjs";

test("phone numbers, emails and FDA firms key the same however they're written", () => {
  assert.equal(dncKey("(212) 555-0142"), "2125550142");
  assert.equal(dncKey("+1 212 555 0142"), "2125550142");
  assert.equal(dncKey("Owner@Shop.com"), "owner@shop.com");
  assert.equal(dncKey("FEI:30-123"), "fei:30123");
  assert.equal(dncKey("555"), "");
});

test("the NYC call list skips a suppressed number and carries the calling window", () => {
  const row = (camis, phone) => ({ camis, dba: "Golden Ox", phone, building: "1", street: "Main St", boro: "Queens", zipcode: "11354", cuisine_description: "Chinese", inspection_date: "2026-10-10T00:00:00", inspection_type: "Pre-permit (Operational) / Initial Inspection", score: "30", critical_flag: "Critical", action: "Violations were cited" });
  const suppress = { has: (v) => dncKey(v) === "2125550142" };
  const out = build([row("1", "2125550142"), row("2", "7185550199")], ["chinese"], suppress);
  assert.equal(out.length, 1);
  assert.equal(out[0].phone, "(718) 555-0199");
  assert.match(out[0].call_window, /9 AM to 8 PM Eastern/);
});
