// Privacy (20261105090600_privacy_recording_age.sql): 18 or older (src/age.ts), the words people agree to before being
// recorded (src/recordingConsent.ts, the same as the database's), the region the site's middleware reads, and the
// policy text. Run from scripts/agent-test.ts.
import { readFileSync } from "node:fs";
import { ageOn, ageVerdict, parseBirthdate } from "../src/age";
import { RECORDING_CONSENT_VERSION, RECORDING_KINDS } from "../src/recordingConsent";
import { LEGAL } from "../src/legal.ts";
// @ts-expect-error the middleware is plain JavaScript
import { regionOf } from "../middleware.js";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

export function privacyTests(ok: Ok, eq: Eq) {
  console.log("\n# Privacy: 18 or older, recording consent, the region");
  const today = { y: 2026, m: 11, d: 5 };
  eq(ageVerdict("2008-11-05", today), "adult", "18 today is an adult");
  eq(ageVerdict("2008-11-06", today), "minor", "18 tomorrow is still a minor");
  eq(ageVerdict("2013-11-05", today), "minor", "13 today is a minor, not a child");
  eq(ageVerdict("2013-11-06", today), "child", "13 tomorrow is a child: nothing leaves the device");
  eq(ageVerdict("1960-02-29", today), "adult", "a leap-day birthday");
  eq(ageVerdict("2026-11-06", today), "invalid", "a date in the future");
  eq(ageVerdict("1899-12-31", today), "invalid", "before 1900");
  for (const bad of ["", "2001-02-30", "2001-13-01", "11/05/2000", "2000-1-1", "abc"]) eq(ageVerdict(bad, today), "invalid", `not a date: ${JSON.stringify(bad)}`);
  eq(ageOn(parseBirthdate("2000-02-29")!, { y: 2026, m: 2, d: 28 }), 25, "a leap-day birthday counts on Mar 1 in other years");

  // the words the app shows are the words the database stores, in both languages, at the same version
  const sql = readFileSync("supabase/migrations/20261105090600_privacy_recording_age.sql", "utf8");
  const quoted = (s: string) => s.replace(/'/g, "''");
  for (const k of RECORDING_KINDS) for (const lang of ["en", "zh"] as const) {
    ok(sql.includes(`when '${k.kind}:${lang}' then '${quoted(k.text[lang])}'`), `the ${k.kind} consent in ${lang} matches the database's words`);
    ok(!/[–—]/.test(k.text[lang] + k.name[lang]), `no em or en dash in the ${k.kind} consent (${lang})`);
  }
  ok(sql.includes(`select '${RECORDING_CONSENT_VERSION}'::text`), "the consent version matches the database's");

  // the site's middleware: country and state only, checked to their shapes
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  eq(regionOf(h({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "San%20Jose" })), { country: "US", region: "CA" }, "California, and nothing finer");
  eq(regionOf(h({})), { country: null, region: null }, "nothing known");
  eq(regionOf(h({ "x-vercel-ip-country": "USA", "x-vercel-ip-country-region": "CA" })), { country: null, region: null }, "a malformed country is dropped, region with it");
  eq(regionOf(h({ "x-vercel-ip-country": "us", "x-vercel-ip-country-region": "<script>" })), { country: "US", region: null }, "a malformed region is dropped");

  // the policy says what the code does
  const doc = (id: string) => LEGAL.find(d => d.id === id)!.body;
  const privacy = doc("privacy"), terms = doc("terms"), ai = doc("ai");
  for (const text of [privacy.en, privacy.zh, ai.en, ai.zh]) ok(!/does not record call audio|不录制通话音频/.test(text), "no policy claims calls are never recorded");
  ok(/## Recording/.test(privacy.en) && /## 录制/.test(privacy.zh), "the Privacy Policy has a Recording section in English and Chinese");
  ok(/In California, and wherever we can't tell where you or the business are/.test(privacy.en), "it states the California rule");
  ok(/keep only that you confirmed you are 18 or older/.test(terms.en) && /只保存您已确认年满 18 周岁/.test(terms.zh), "the Terms state the age check and what's kept");
  ok(/under 13/.test(privacy.en) && /未满 13 周岁/.test(privacy.zh), "the Privacy Policy covers under 13");
}
