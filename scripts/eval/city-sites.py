#!/usr/bin/env python3
"""Builds src/forms/citySites.ts: who to ask where the library has no entry for a city.

usage: python3 -I scripts/eval/city-sites.py PLACES.json CISA.csv [OUT.ts]
PLACES.json is scripts/eval/city-places.ts's output; CISA.csv is CISA's .gov registry
(https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-full.csv). For each city, the .gov domain registered to
it (Domain type City, or a consolidated city and county, in its state, the organization named for it) whose name is the
city's own (cityname, cityofname, namestate...: never a police, fire, library or other department's); for an
unincorporated place, its county's. Then each home page is fetched: kept when it answers and names the place (pageRead
1), or when it refuses an automated request (pageRead 0: the registry entry is the proof); dropped when it answers
without naming the place. A few big cities whose domain isn't their name are listed in EXTRA, each checked in the CSV."""
import concurrent.futures as cf, csv, datetime, html, json, re, subprocess, sys

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
STN = {"CA": "california", "TX": "texas", "NV": "nevada", "GA": "georgia", "NJ": "newjersey", "MA": "mass", "WA": "washington", "IL": "illinois", "FL": "florida",
       "AZ": "arizona", "CO": "colorado", "UT": "utah", "MD": "maryland", "VA": "virginia", "OR": "oregon", "PA": "pa", "OH": "ohio", "MN": "minnesota",
       "NY": "newyork", "TN": "tennessee", "MI": "michigan", "NC": "northcarolina"}
EXTRA = {
    "los angeles|CA": ("lacity.gov", "City of Los Angeles"), "san francisco|CA": ("sf.gov", "City and County of San Francisco"),
    "philadelphia|PA": ("phila.gov", "Office of Innovation and Technology"), "washington, dc|DC": ("dc.gov", "Government of the District of Columbia"),
    "arlington|VA": ("arlingtonva.gov", "Arlington County Government"), "fairfax county|VA": ("fairfaxcounty.gov", "Fairfax County Government"),
    "salt lake city|UT": ("slc.gov", "Salt Lake City Corporation"), "new york|NY": ("nyc.gov", "The NYC Office of Technology and Innovation"),
}
COUNTY_EXTRA = {"Los Angeles County|CA": ("lacounty.gov", "County of Los Angeles")}
squash = lambda s: re.sub(r"[^a-z]", "", s.lower())


def match(places, rows):
    def org_ok(org, city):
        return squash(city) in squash(org) and not re.search(r"police|fire|library|court|school|water|county of", org, re.I)

    def rest_ok(dom, city, st):
        r = dom.split(".")[0].lower().replace("-", "").replace(squash(city), "", 1)
        for t in ["cityof", "townof", "boroughof", "townshipof", "villageof", "city", "town", "twp", "boro", "ci", STN.get(st, "~"), st.lower(), "gov"]:
            r = r.replace(t, "", 1)
        return r == ""

    res = {}
    for key, p in places.items():
        city, st = p["city"], p["state"]
        if key in EXTRA:
            res[key] = {"kind": "city", "domain": EXTRA[key][0], "org": EXTRA[key][1]}
            continue
        if not p["uninc"]:
            cand = [r for r in rows if r["Domain type"] in ("City", "County") and r["State"] == st and org_ok(r["Organization name"], city)
                    and (r["Domain type"] == "City" or re.search(r"city and county|metropolitan", r["Organization name"], re.I)) and rest_ok(r["Domain name"], city, st)]
            if cand:
                best = sorted(cand, key=lambda r: len(r["Domain name"]))[0]
                res[key] = {"kind": "city", "domain": best["Domain name"], "org": best["Organization name"]}
        elif p.get("county") and f"{p['county']}|{st}" in COUNTY_EXTRA:
            d, o = COUNTY_EXTRA[f"{p['county']}|{st}"]
            res[key] = {"kind": "county", "domain": d, "org": o, "county": p["county"]}
        elif p.get("county"):
            c = p["county"].lower().replace(" county", "")
            cand = [r for r in rows if r["Domain type"].startswith("County") and "Election" not in r["Organization name"] and r["State"] == st and re.search(rf"\b{re.escape(c)}\b", r["Organization name"].lower())
                    and rest_ok(r["Domain name"].replace("county", "").replace("co", "", 1), c, st)]
            if cand:
                best = sorted(cand, key=lambda r: len(r["Domain name"]))[0]
                res[key] = {"kind": "county", "domain": best["Domain name"], "org": best["Organization name"], "county": p["county"]}
    return res


def fetch(dom):
    code = "000"
    for ua in [UA, "curl/8.5.0"]:
        r = subprocess.run(["curl", "-sS", "-L", "--compressed", "--max-time", "25", "-A", ua, "-o", "-", "-w", "\n%{http_code}", f"https://{dom}/"], capture_output=True)
        body, _, code = r.stdout.decode("utf-8", "replace").rpartition("\n")
        if code == "200":
            t = re.search(r"(?is)<title[^>]*>(.*?)</title>", body)
            return code, (re.sub(r"\s+", " ", html.unescape(t.group(1))) if t else "") + " " + re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body)))[:20000]
    return code or "000", ""


def check(item):
    k, v = item
    name = k.split("|")[0]
    names = [name] + ([v["county"].lower()] if v["kind"] == "county" else []) + (["district of columbia"] if k.endswith("|DC") else []) + (["new york city", "nyc"] if k.startswith("new york") else [])
    code, text = fetch(v["domain"])
    seen = code == "200" and any(n in text.lower() for n in names)
    if code == "200" and not seen:
        return k, None
    return k, [v["domain"], v["org"].strip(), 1 if seen else 0]


def main():
    places = json.load(open(sys.argv[1]))
    rows = list(csv.DictReader(open(sys.argv[2], encoding="utf-8")))
    out_path = sys.argv[3] if len(sys.argv) > 3 else "src/forms/citySites.ts"
    found = match(places, rows)
    with cf.ThreadPoolExecutor(12) as ex:
        kept = dict(sorted((k, v) for k, v in ex.map(check, found.items()) if v))
    today = datetime.date.today().isoformat()
    lines = [f"  {json.dumps(k)}: [{json.dumps(v[0])}, {json.dumps(v[1])}, {v[2]}]," for k, v in kept.items()]
    open(out_path, "w").write(f"""// Who to ask where the library has no entry for a city: the city's own .gov site (for an unincorporated place, its
// county's), from CISA's .gov domain registry (github.com/cisagov/dotgov-data, current-full.csv), read {today}. Built by
// scripts/eval/city-sites.py, never typed by hand: the domain registered to that city or county and named for it. The last
// field is 1 when its home page was fetched on {today} and names the place, 0 when the site refused an automated request
// (the registry entry is then the proof). A place not listed gets USA.gov's local governments directory (src/plan/ask.ts).
export const CITY_SITES_READ = "{today}";
export const CITY_SITES: Record<string, [domain: string, org: string, pageRead: 0 | 1]> = {{
{chr(10).join(lines)}
}};
""")
    print(f"{len(kept)} places with their own .gov site ({sum(v[2] for v in kept.values())} home pages read); {len(places) - len(kept)} get USA.gov's directory")


if __name__ == "__main__":
    main()
