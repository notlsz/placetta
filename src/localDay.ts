/* "Today" where the stores are. A deadline is a calendar date in the agency's own time zone, but the server runs in
   UTC: at 6 pm in California it is already tomorrow in UTC, and in Shanghai it is already tomorrow while UTC is still
   today. The monitor counts days to a deadline from the stores' own date instead (supabase/functions/monitor), and
   for a workspace with stores in several time zones from the date furthest ahead, so a deadline is never said to be
   further away than it is anywhere. No imports: the Deno functions read this file as it is. */

/** The main time zone of each US state and the countries Placetta files in (a state split across zones takes the one
 *  most of its people live in; Placetta's markets are all in those). */
const US_TZ: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York",
  DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis", IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago",
  OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York", SD: "America/Chicago",
  TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York",
  WI: "America/Chicago", WY: "America/Denver", PR: "America/Puerto_Rico",
};
const COUNTRY_TZ: [RegExp, string][] = [
  [/\b(china|prc)\b|中国/i, "Asia/Shanghai"], [/\bhong kong\b|香港/i, "Asia/Hong_Kong"], [/\btaiwan\b|台湾/i, "Asia/Taipei"], [/\bsingapore\b|新加坡/i, "Asia/Singapore"],
  [/\bjapan\b|日本/i, "Asia/Tokyo"], [/\b(south )?korea\b|韩国/i, "Asia/Seoul"], [/\bmexico\b|墨西哥/i, "America/Mexico_City"], [/\bcanada\b|加拿大/i, "America/Toronto"],
  [/\b(united kingdom|uk|england|london)\b|英国/i, "Europe/London"], [/\bfrance\b|法国/i, "Europe/Paris"], [/\bgermany\b|德国/i, "Europe/Berlin"], [/\bspain\b|西班牙/i, "Europe/Madrid"],
  [/\bitaly\b|意大利/i, "Europe/Rome"], [/\bnetherlands\b|荷兰/i, "Europe/Amsterdam"], [/\b(uae|dubai|united arab emirates)\b|迪拜/i, "Asia/Dubai"],
];

/** The time zone of an address, or null when it can't be told. */
export function timeZoneOf(address: string): string | null {
  const s = String(address ?? "");
  for (const [re, tz] of COUNTRY_TZ) if (re.test(s)) return tz;
  const m = /,\s*([A-Z]{2})\.?(\s+\d{5}(-\d{4})?)?\s*(,\s*(usa|us|united states))?\s*$/i.exec(s);
  return m && US_TZ[m[1].toUpperCase()] ? US_TZ[m[1].toUpperCase()] : null;
}

/** The calendar date at a moment in a time zone, YYYY-MM-DD (UTC when the zone is unknown). */
export function dayIn(now: Date, tz: string | null): string {
  if (!tz) return now.toISOString().slice(0, 10);
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const g = (t: string) => p.find(x => x.type === t)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  } catch { return now.toISOString().slice(0, 10); }
}

/** Today for a workspace: its stores' own date, the one furthest ahead when they are in several zones; UTC when no
 *  store's zone can be told. */
export function workspaceToday(stores: unknown, now: Date): string {
  const zones = (Array.isArray(stores) ? stores : []).map(s => timeZoneOf(String((s as { address?: unknown })?.address ?? ""))).filter((z): z is string => !!z);
  if (!zones.length) return dayIn(now, null);
  return zones.map(z => dayIn(now, z)).sort().at(-1)!;
}
