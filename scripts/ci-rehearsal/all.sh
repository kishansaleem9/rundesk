#!/bin/bash
# Rehearse every job of ci.yml before a push, from what is committed.
#
#   bash scripts/ci-rehearsal/all.sh [OUT]
#
# Verify and Postgres harnesses at once, on two CPUs each, then Browser suites.
# About two hours here; the run that passed on 1 October took 141 minutes. Each
# job's steps are in OUT (default /home/runner/ci-rh/run-<time>), a line per
# step in OUT/<job>.out, and the last lines say what failed. Exits 0 only when
# every step of every job passed.
#
# Everything runs (`full`), and nothing is trusted; the made-sweep's mutation
# run only if its own code changed since the upstream, as on CI. When every
# step passed, `docs/rehearsals/latest.json` records it, and a push of the code
# with that record is trusted by CI (`scripts/ci-affected.mjs`).
# `affected.sh` rehearses only what a push can affect.
{
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT=${1:-/home/runner/ci-rh/run-$(date +%Y%m%d-%H%M)}

missing=
[ "$(id -u)" = 0 ] || missing="$missing root (for namespaces and mounts);"
[ -x /usr/lib/postgresql/16/bin/initdb ] || missing="$missing Postgres 16 server binaries;"
python3 -c 'import pyroute2, yaml' 2>/dev/null || missing="$missing python3 with pyroute2 and yaml;"
locale -a 2>/dev/null | grep -qi '^en_US\.utf8$' || missing="$missing the en_US.utf8 locale (localedef -i en_US -f UTF-8 en_US.UTF-8);"
if [ -n "$missing" ]; then echo "cannot rehearse here, missing:$missing"; exit 2; fi

REPO=$(git -C "$HERE" rev-parse --show-toplevel)
HEAD_SHA=$(git -C "$REPO" rev-parse HEAD)
BASE=$(git -C "$REPO" rev-parse '@{u}' 2>/dev/null)
SEL=$(cd "$REPO" && node scripts/ci-affected.mjs --event pull_request --action synchronize --base "${BASE:-none}" --head "$HEAD_SHA" --json 2>/dev/null) \
  || SEL='{"sweepMutate":false}'
SEL=$(node -e 'const s = JSON.parse(process.argv[1]); console.log(JSON.stringify({ code: true, full: true, suites: [], web: true, harness: true, sweepMutate: Boolean(s.sweepMutate), trusted: false }))' "$SEL")

mkdir -p "$OUT"
for j in verify postgres browser; do
  bash "$HERE/checkout.sh" "/home/runner/work-$j" || exit 1
done
echo "rehearsing into $OUT"
(
  bash "$HERE/launch.sh" verify 2,3 none /home/runner/work-verify "$OUT/verify" --changes "$SEL" > "$OUT/verify.out" 2>&1
  bash "$HERE/launch.sh" browser-suites 2,3 none /home/runner/work-browser "$OUT/browser" --changes "$SEL" > "$OUT/browser.out" 2>&1
) &
bash "$HERE/launch.sh" postgres-harnesses 0,1 private-pg /home/runner/work-postgres "$OUT/postgres" \
  --step-timeout 900 --changes "$SEL" > "$OUT/postgres.out" 2>&1
wait
status=0
results='{}'
for j in verify browser postgres; do
  sed -n '/ steps passed in /,$p' "$OUT/$j.out"
  grep -q ' FAILED \[' "$OUT/$j.out" && status=1
  line=$(grep -m1 ' steps passed in ' "$OUT/$j.out") || { echo "$j: no summary, so it did not finish"; status=1; continue; }
  results=$(node -e 'const r = JSON.parse(process.argv[1]); r[process.argv[2]] = process.argv[3]; console.log(JSON.stringify(r))' \
    "$results" "$j" "$(echo "$line" | sed -E 's/^[^:]*: ([0-9]+ of [0-9]+) steps.*/\1/')")
done
if [ "$status" = 0 ]; then
  mkdir -p "$REPO/docs/rehearsals"
  node "$HERE/record.mjs" "$HEAD_SHA" "${BASE:-none}" "$SEL" "$results" "$OUT" > "$REPO/docs/rehearsals/latest.json"
  echo "recorded: docs/rehearsals/latest.json — commit it with the code it names, and push"
fi
exit $status
}
