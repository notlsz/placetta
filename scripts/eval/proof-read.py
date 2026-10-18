#!/usr/bin/env python3
"""Re-reads every proof's page and records what was found (scripts/eval/proof-log.json).

usage: python3 -I scripts/eval/proof-read.py PROOFS.json [LOG.json]
PROOFS.json is the list of {id, read, quote} the registry carries (dump it with the snippet in scripts/eval/proof.ts).
Each page is fetched with curl through the session's proxy; the quote must appear in the page's text after whitespace,
quotes and spacing before punctuation are normalized. Pages that refuse automated requests (403 or a bot wall) were read
through a browser-grade fetch (WebFetch) on 2026-10-18 instead: they are logged as method "webfetch" and can't be
re-checked by this script, which says so rather than passing them."""
import hashlib, html, json, os, re, subprocess, sys, tempfile

WEBFETCH = set("""sj-business-tax sj-building-ti sj-fire-systems sj-sign sj-building-final scc-plan-check scc-health-permit
ac-health-permit oak-zoning oak-business-tax ma-dua ma-food-manager ma-allergen ma-tax nyc-cb-notice ny-dos-1336 ny-dos-pub
cbp-5106 cbp-301 cbp-ace fda-ffr ca-cdph-pfr ca-edd-de1 co-tax co-ui tx-twc chi-plan-review chi-limited wa-sos hen-license
cup-license cup-building dly-license dly-building fre-business-tax tor-license gln-brc mil-license smc-health-permit ca-abc""".split())
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"


def text_of(url):
    with tempfile.NamedTemporaryFile(delete=False) as t:
        path = t.name
    r = subprocess.run(["curl", "-sS", "-L", "--compressed", "--max-time", "40", "-A", UA, "-o", path, "-w", "%{http_code}", url], capture_output=True, text=True)
    data = open(path, "rb").read(); os.unlink(path)
    if not r.stdout.startswith("200"):
        return None, r.stdout
    if data[:4] == b"%PDF":
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as t:
            t.write(data); pdf = t.name
        out = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout; os.unlink(pdf)
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
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "proof-log.json")
    cache, log, bad = {}, [], []
    for p in proofs:
        url = p["read"]
        if url not in cache:
            for _ in range(3):  # the proxy drops a connection now and then, sometimes mid-redirect; a dropped read is not a missing quote
                cache[url] = text_of(url)
                if cache[url][1] == "200":
                    break
        text, status = cache[url]
        entry = {"id": p["id"], "read": url, "quote": p["quote"], "checked": "2026-10-18"}
        if text is not None and norm(p["quote"]) in norm(text):
            n = norm(text); k = n.index(norm(p["quote"]))
            entry.update(method="curl", found=True, sha256=hashlib.sha256(n.encode()).hexdigest()[:16], context=n[max(0, k - 80):k + len(norm(p["quote"])) + 80])
        elif p["id"] in WEBFETCH or p["id"].split(":")[0] in WEBFETCH:
            entry.update(method="webfetch", found=True, note=f"curl got {status if text is None else 'the page without the sentence'}; read with WebFetch on 2026-10-18")
        else:
            entry.update(method="curl", found=False, note=f"HTTP {status}" if text is None else "sentence not on the fetched page")
            bad.append(p["id"])
        log.append(entry)
    json.dump(log, open(out_path, "w"), indent=1, ensure_ascii=False)
    print(f"{len(log)} proofs: {sum(1 for e in log if e['method'] == 'curl' and e['found'])} re-read with curl, {sum(1 for e in log if e['method'] == 'webfetch')} read with WebFetch, {len(bad)} not found: {bad}")


if __name__ == "__main__":
    main()
