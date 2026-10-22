#!/bin/bash
# npm run scan:local: OWASP ZAP (baseline, then active) and nuclei (safe templates) against LOCAL targets only:
#   the built site and app, served from dist/ with vercel.json's headers   http://127.0.0.1:4173  (scripts/scan/serve-dist.mjs)
#   the edge functions, PostgREST and a throwaway database                  http://127.0.0.1:54321 (scripts/scan/backend.ts)
# Reports go to scan-results/ (not committed). Never point it at production: scan-production.yml does the passive part
# there, by hand only.
#
# Tools (not installed by npm; see docs/SECURITY-AUDIT.md, "Two-account test and scanners"):
#   ZAP_HOME          a ZAP install: zap.sh, or zap-<version>.jar with lib/ and plugin/ beside it  (needs Java 17+)
#   NUCLEI            the nuclei binary (default: nuclei on PATH)
#   NUCLEI_TEMPLATES  a nuclei-templates checkout (default: nuclei's own ~/nuclei-templates)
#   SCAN=zap|nuclei|all (default all); ZAP_ACTIVE=0 / ZAP_BASELINE=0 skip either ZAP run; NO_BACKEND=1 scans the site only
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=${OUT:-$PWD/scan-results}; mkdir -p "$OUT"
SITE=http://127.0.0.1:4173 API=http://127.0.0.1:54321
SCAN=${SCAN:-all}
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; wait 2>/dev/null; }
trap cleanup EXIT

[ -f dist/index.html ] || { echo "scan:local: no dist/; run npm run build first"; exit 1; }
node scripts/scan/serve-dist.mjs 4173 dist > "$OUT/serve.log" 2>&1 & pids+=($!)
if [ "${NO_BACKEND:-0}" != 1 ]; then
  deno run -A --no-check --no-lock --node-modules-dir=none scripts/scan/backend.ts > "$OUT/backend.log" 2>&1 & pids+=($!)
  for i in $(seq 1 300); do grep -q "backend ready" "$OUT/backend.log" && break; sleep 1; done
  grep -q "backend ready" "$OUT/backend.log" || { echo "scan:local: the backend didn't start"; tail -20 "$OUT/backend.log"; exit 1; }
fi
for i in $(seq 1 50); do curl -fs -o /dev/null "$SITE/" && break; sleep 0.2; done
echo "targets: $SITE and $API"

status=0
if [ "$SCAN" = all ] || [ "$SCAN" = zap ]; then
  [ -n "${ZAP_HOME:-}" ] || { echo "scan:local: set ZAP_HOME to a ZAP install"; exit 1; }
  zap() {
    local home; home=$(mktemp -d)
    if [ -x "$ZAP_HOME/zap.sh" ]; then "$ZAP_HOME/zap.sh" -cmd -dir "$home" "$@"
    else java -Xmx1g -cp "$(ls "$ZAP_HOME"/zap-*.jar | head -1):$ZAP_HOME/lib/*" org.zaproxy.zap.ZAP -cmd -installdir "$ZAP_HOME" -dir "$home" -silent "$@"; fi
    local s=$?; rm -rf "$home"; return $s
  }
  if [ "${ZAP_BASELINE:-1}" = 1 ]; then
    echo "== ZAP baseline (passive)"
    SITE=$SITE API=$API OUT=$OUT zap -autorun "$PWD/scripts/scan/zap-baseline.yaml" > "$OUT/zap-baseline.log" 2>&1 || status=1
    tail -5 "$OUT/zap-baseline.log"
  fi
  if [ "${ZAP_ACTIVE:-1}" = 1 ]; then
    echo "== ZAP active scan (local targets only)"
    SITE=$SITE API=$API OUT=$OUT zap -autorun "$PWD/scripts/scan/zap-active.yaml" > "$OUT/zap-active.log" 2>&1 || status=1
    tail -5 "$OUT/zap-active.log"
  fi
fi
if [ "$SCAN" = all ] || [ "$SCAN" = nuclei ]; then
  echo "== nuclei (exposures, misconfiguration, technologies, JavaScript library CVEs; nothing intrusive, no out-of-band callbacks)"
  N=${NUCLEI:-nuclei}; T=${NUCLEI_TEMPLATES:-$HOME/nuclei-templates}
  # templates that send to a fixed third-party host (an Azure tenant lookup, checking a found token with its provider)
  # would leave this machine: left out
  ext=(); while read -r f; do ext+=(-et "$f"); done < <(grep -rlE '@Host:\s*https?://' "$T/http" 2>/dev/null)
  targets=(-u "$SITE" -u "$SITE/app/" -u "$SITE/help/" -u "$SITE/guides/")
  [ "${NO_BACKEND:-0}" != 1 ] && targets+=(-u "$API" -u "$API/functions/v1/partner-api/v1/plan" -u "$API/rest/v1/")
  "$N" "${targets[@]}" -duc -ni -silent -nc \
    -t "$T/http/exposures" -t "$T/http/misconfiguration" -t "$T/http/technologies" "${ext[@]}" \
    -etags intrusive,dos,fuzz,bruteforce,oast,headless -rl 50 -c 10 -timeout 5 \
    -jsonl -o "$OUT/nuclei.jsonl" > "$OUT/nuclei.log" 2>&1 || status=1
  # CVEs in JavaScript libraries: the CVE templates whose tags name a front-end library, against the same targets
  "$N" "${targets[@]}" -duc -ni -silent -nc -t "$T/http/cves" "${ext[@]}" -tags js,javascript,jquery,angular,vue,react,lodash,bootstrap,npm,nodejs \
    -etags intrusive,dos,fuzz,bruteforce,oast,headless -rl 50 -c 10 -timeout 5 -jsonl -o "$OUT/nuclei-cves.jsonl" >> "$OUT/nuclei.log" 2>&1 || status=1
  echo "nuclei findings: $(cat "$OUT"/nuclei*.jsonl 2>/dev/null | wc -l)"
fi
node scripts/scan/summary.mjs "$OUT" || true
exit $status
