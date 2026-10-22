#!/usr/bin/env python3
"""Re-reads every proof's page and records what was found (scripts/eval/proof-log.json), and what the app may claim
(src/forms/proofChecks.json).

usage: python3 -I scripts/eval/proof-read.py PROOFS.json [LOG.json] [CHECKS.json]
PROOFS.json is the list of {id, read, quote} the registry carries (dump it with the snippet in scripts/eval/proof.ts).
Each page is fetched with curl through the session's proxy (with a browser's user agent, then curl's own: some .gov
sites wall off one and not the other); the quote must appear in the page's text after whitespace, quotes and spacing
before punctuation are normalized. A quote found today is logged with today's date. Pages that refuse automated requests
(403 or a bot wall) were read through a browser-grade fetch (WebFetch) instead: they are logged as method "webfetch"
with the day they were last read that way, which this script can't advance.

The checks file is what keeps the app's claims current: for each (page, quote) found, the day it was last seen. A plan
row claims a requirement only while its quote was seen within the last 90 days (src/plan/ask.ts); after that, or when a
re-read no longer finds it, the row abstains and names who to ask. Run this at least monthly."""
import datetime, hashlib, html, json, os, re, subprocess, sys, tempfile

WEBFETCH = set("""sj-business-tax sj-building-ti sj-fire-systems sj-sign sj-building-final scc-plan-check scc-health-permit
ac-health-permit oak-zoning oak-business-tax ma-dua ma-food-manager ma-allergen ma-tax nyc-cb-notice ny-dos-1336 ny-dos-pub
cbp-5106 cbp-301 cbp-ace fda-ffr ca-cdph-pfr ca-edd-de1 co-tax co-ui tx-twc chi-plan-review chi-limited wa-sos hen-license
cup-license cup-building dly-license dly-building fre-business-tax tor-license gln-brc mil-license smc-health-permit ca-abc""".split())
# pages that refuse curl, read word for word through WebFetch (asked whether the exact sentence is on the page), by day
WEBFETCH_SEEN = {
    "https://admin.publichealth.lacounty.gov/eh/inspection/construction-requirements-retail-food-facilities.htm": "2026-10-21",
    "https://permits.lacounty.gov/?p=315": "2026-10-21",
    "https://publichealth.lacounty.gov/eh/inspection/how-to-obtain-restaurant-food-facility-permit.htm": "2026-10-21",
    "https://atlantaga.gov/government/departments/finance/office-of-revenue/frequently-asked-questions": "2026-10-21",
    "https://atlantaga.gov/home/showdocument?id=19215": "2026-10-21",
    "https://edd.ca.gov/en/payroll_taxes/am_i_required_to_register_as_an_employer": "2026-10-21",
    "https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration/register-for-a-business-tax-certificate": "2026-10-21",
    "https://www.chicago.gov/content/dam/city/depts/bacp/general/Retail%20Food%20Guide.pdf": "2026-10-21",
    # what differs by kind of food business (src/forms/kinds.ts): each page refused curl (403, or no connection)
    "https://agriculture.ny.gov/food-business-licensing": "2026-10-21",
    "https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/PFRFAQs.aspx": "2026-10-21",
    "https://chicago.gov/content/city/en/sites/chicago-business-licensing/home/wholesalefood.html": "2026-10-21",
    # furniture (src/forms/kinds.ts): EUR-Lex answers curl with an empty 202 (a bot wall)
    "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R0988": "2026-10-21",
    # the finishing pass (src/forms/finish.ts): pages that build their text in script, so curl gets the frame without it
    "https://www.skatteverket.se/foretag/arbetsgivare/arbetsgivarregistrering/registreradig.4.18e1b10334ebe8bc80003496.html": "2026-10-22",
    "https://cro.ie/registration/company/required-steps/": "2026-10-22",
}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"


def text_of(url, ua=UA):
    with tempfile.NamedTemporaryFile(delete=False) as t:
        path = t.name
    r = subprocess.run(["curl", "-sS", "-L", "--compressed", "--max-time", "40", "-A", ua, "-o", path, "-w", "%{http_code}", url], capture_output=True, text=True)
    data = open(path, "rb").read(); os.unlink(path)
    if not r.stdout.startswith("200"):
        return None, r.stdout
    if data[:4] == b"%PDF":
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as t:
            t.write(data); pdf = t.name
        # both readings of the page: laid out as printed, and in reading order (a two-column brochure splits sentences
        # across columns when laid out, so a quote is found in either)
        out = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout + "\n\f\n" + subprocess.run(["pdftotext", pdf, "-"], capture_output=True, text=True).stdout; os.unlink(pdf)
        return out, "200"
    s = data.decode("utf-8", errors="replace")
    s = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s), "200"


def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace(" ", " ")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([.,;:)])", r"\1", s)
    return s.strip().lower()


def main():
    proofs = json.load(open(sys.argv[1]))
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "proof-log.json")
    checks_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, "..", "..", "src", "forms", "proofChecks.json")
    today = datetime.date.today().isoformat()
    # the day each WebFetch-only proof was last read that way (this script can't re-read them)
    try:
        before = {(e["read"], e["quote"]): e for e in json.load(open(out_path))}
    except (OSError, ValueError):
        before = {}
    cache, log, bad = {}, [], []
    for p in proofs:
        url = p["read"]
        if url not in cache:
            for ua in [UA, "curl/8.5.0", UA]:  # a browser's agent, then curl's (mass.gov walls off the first); the proxy drops a connection now and then
                cache[url] = text_of(url, ua)
                if cache[url][1] == "200":
                    break
        text, status = cache[url]
        entry = {"id": p["id"], "read": url, "quote": p["quote"], "checked": today}
        if text is not None and norm(p["quote"]) in norm(text):
            n = norm(text); k = n.index(norm(p["quote"]))
            entry.update(method="curl", found=True, sha256=hashlib.sha256(n.encode()).hexdigest()[:16], context=n[max(0, k - 80):k + len(norm(p["quote"])) + 80])
        elif url in WEBFETCH_SEEN or p["id"] in WEBFETCH or p["id"].split(":")[0] in WEBFETCH:
            prev = before.get((url, p["quote"]), {})
            on = WEBFETCH_SEEN.get(url) or (prev.get("checked", "2026-10-18") if prev.get("method") == "webfetch" else "2026-10-18")
            entry.update(checked=on, method="webfetch", found=True, note=f"curl got {status if text is None else 'the page without the sentence'}; read with WebFetch on {on}")
        elif text is None and before.get((url, p["quote"]), {}).get("found"):
            # the page couldn't be read today (a bot wall, a timeout): that is not evidence the sentence is gone, so the
            # day it was last seen stands, and the claim ages out MAX_PROOF_AGE days after it unless a read finds it again
            prev = before[(url, p["quote"])]
            entry.update(checked=prev["checked"], method=prev["method"], found=True, note=f"HTTP {status} on {today}; last seen {prev['checked']}")
        else:
            entry.update(method="curl", found=False, note=f"HTTP {status}" if text is None else "sentence not on the fetched page")
            bad.append(p["id"])
        log.append(entry)
    json.dump(log, open(out_path, "w"), indent=1, ensure_ascii=False)
    checks = {}
    for e in log:
        if e["found"]:
            k = e["read"] + "\n" + e["quote"]
            checks[k] = max(checks.get(k, ""), e["checked"])
    json.dump(dict(sorted(checks.items())), open(checks_path, "w"), indent=0, ensure_ascii=False)
    carried = [e["id"] for e in log if "last seen" in e.get("note", "")]
    print(f"{len(log)} proofs: {sum(1 for e in log if e['method'] == 'curl' and e['found']) - len(carried)} found today with curl, {sum(1 for e in log if e['method'] == 'webfetch')} read with WebFetch, "
          f"{len(carried)} unreadable today (last-seen day kept: {carried}), {len(bad)} not found: {bad}")


if __name__ == "__main__":
    main()
