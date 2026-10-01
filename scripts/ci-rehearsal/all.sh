#!/bin/bash
# Rehearse every job of ci.yml before a push, from what is committed.
#
#   bash scripts/ci-rehearsal/all.sh [OUT]
#
# Verify and Postgres harnesses at once, on two CPUs each, then Browser suites.
# About six hours here, for about two and a half on the runner. Each job's
# steps are in OUT (default /home/runner/ci-rh/run-<time>), a line per step in
# OUT/<job>.out, and the last lines say what failed. Exits 0 only when every
# step of every job passed.
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

mkdir -p "$OUT"
for j in verify postgres browser; do
  bash "$HERE/checkout.sh" "/home/runner/work-$j" || exit 1
done
echo "rehearsing into $OUT"
(
  bash "$HERE/launch.sh" verify 2,3 none /home/runner/work-verify "$OUT/verify" > "$OUT/verify.out" 2>&1
  bash "$HERE/launch.sh" browser-suites 2,3 none /home/runner/work-browser "$OUT/browser" > "$OUT/browser.out" 2>&1
) &
bash "$HERE/launch.sh" postgres-harnesses 0,1 private-pg /home/runner/work-postgres "$OUT/postgres" \
  --step-timeout 900 > "$OUT/postgres.out" 2>&1
wait
status=0
for j in verify browser postgres; do
  sed -n '/ steps passed in /,$p' "$OUT/$j.out"
  grep -q ' FAILED \[' "$OUT/$j.out" && status=1
  grep -q ' steps passed in ' "$OUT/$j.out" || { echo "$j: no summary, so it did not finish"; status=1; }
done
exit $status
}
