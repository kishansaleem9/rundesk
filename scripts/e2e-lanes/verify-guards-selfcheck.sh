#!/bin/bash
# What `verify.sh` asks of a lane before a suite runs on it, on stand-ins
# (`lane_started_at`, `started_before`, `run_bounded`, `web_sources_hash`,
# lane-env.sh):
#
#   bash scripts/e2e-lanes/verify-guards-selfcheck.sh [--mutate]
#
#   · a process's start is read to the hundredth, and one started just after a
#     build stamp is not "before" it, while one started a second earlier is
#     (`found-6-oct/verify-refuses-a-lane-restarted-in-its-builds-second`);
#   · a suite that ignores SIGTERM is killed after its grace
#     (`found-6-oct/verify-timeout-ends-no-hung-suite`);
#   · a bundle's sources are told apart by content, not mtime: a file put back
#     with an earlier mtime and other bytes is another tree, while staging, or
#     restoring the same bytes, is the same one
#     (`found-6-oct/verify-takes-a-bundle-of-other-sources-as-fresh`).
#
# With --mutate, each helper is replaced by what `verify.sh` did before —
# whole seconds from `ps -o lstart`, `timeout` with no kill, the newest mtime
# — and the same cases must catch each one. No lane, no API: CI's verify job
# runs it too.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
. "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT

# A stand-in source tree, in a repository of its own.
REPO="$DIR/repo"
mkdir -p "$REPO/apps/web/src" "$REPO/apps/web/public"
( cd "$REPO" && git init -q && git config user.email selfcheck@rundesk.invalid && git config user.name selfcheck \
  && printf 'export const a = 1\n' > apps/web/src/a.ts && printf 'b\n' > apps/web/public/b.txt \
  && git add -A && git commit -qm base )

run_cases () {
  local bad=0 t0 pid start err stamp got h1 h2 h3 h4 h5 t1 elapsed
  # 1. A start, to the hundredth. Begun in the second half of a second, so a
  #    reading in whole seconds is off by half a second at least, whatever the
  #    boot time's fraction: the mutation below is caught on every machine.
  while [ "$(date +%N | cut -c1)" -lt 5 ] || [ "$(date +%N | cut -c1)" -gt 7 ]; do sleep 0.02; done
  t0=$(date +%s.%N); sleep 3 & pid=$!
  start=$(lane_started_at "$pid")
  err=$(awk -v s="$start" -v t="$t0" 'BEGIN { d = s - t; if (d < 0) d = -d; printf "%.2f", d }')
  if awk -v e="$err" 'BEGIN { exit !(e < 0.1) }'; then echo "  ok   a process's start is read to within a tenth of a second (off by $err)"
  else echo "  FAIL a process's start is read $err seconds off"; bad=1; fi
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  # 2. Just after a build stamp is not before it; a second earlier is.
  touch "$DIR/stamp"; sleep 3 & pid=$!
  stamp=$(stat -c %.2Y "$DIR/stamp"); start=$(lane_started_at "$pid")
  if ! started_before "$start" "$stamp"; then echo "  ok   a process started just after the stamp is not before it ($start, the stamp $stamp)"
  else echo "  FAIL a process started just after the stamp reads as before it ($start, the stamp $stamp)"; bad=1; fi
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  sleep 4 & pid=$!; sleep 1.2; touch "$DIR/stamp2"
  stamp=$(stat -c %.2Y "$DIR/stamp2"); start=$(lane_started_at "$pid")
  if started_before "$start" "$stamp"; then echo "  ok   a process started 1.2 s before the stamp is before it"
  else echo "  FAIL a process started 1.2 s before the stamp is not read as before it ($start, the stamp $stamp)"; bad=1; fi
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  # 3. A suite that ignores its TERM is ended by the KILL after it.
  t1=$(date +%s.%N)
  run_bounded 1 1 bash -c 'trap "" TERM; sleep 20' 2>/dev/null
  elapsed=$(awk -v a="$t1" -v b="$(date +%s.%N)" 'BEGIN { printf "%.1f", b - a }')
  if awk -v e="$elapsed" 'BEGIN { exit !(e < 6) }'; then echo "  ok   a suite that ignores SIGTERM is killed after its grace (ended in ${elapsed}s)"
  else echo "  FAIL a suite that ignores SIGTERM ran ${elapsed}s, past its 1 s and 1 s of grace"; bad=1; fi
  # 4. Sources by content.
  h1=$(web_sources_hash "$REPO")
  cp -p "$REPO/apps/web/src/a.ts" "$DIR/a.ts.orig"
  printf 'export const a = 2\n' > "$DIR/a.ts.other"; touch -d '2 days ago' "$DIR/a.ts.other"
  cp -p "$DIR/a.ts.other" "$REPO/apps/web/src/a.ts"
  h2=$(web_sources_hash "$REPO")
  if [ -n "$h1" ] && [ "$h1" != "$h2" ]; then echo "  ok   a source put back with an earlier mtime and other bytes is another tree"
  else echo "  FAIL a source with other bytes and an earlier mtime reads as the same tree ($h1 / $h2)"; bad=1; fi
  ( cd "$REPO" && git add -A ) ; h3=$(web_sources_hash "$REPO")
  if [ "$h2" = "$h3" ]; then echo "  ok   staging a change is the same tree"
  else echo "  FAIL staging a change reads as another tree ($h2 / $h3)"; bad=1; fi
  cp -p "$DIR/a.ts.orig" "$REPO/apps/web/src/a.ts"; ( cd "$REPO" && git reset -q )
  h4=$(web_sources_hash "$REPO")
  if [ "$h1" = "$h4" ]; then echo "  ok   the same bytes put back are the same tree"
  else echo "  FAIL the same bytes put back read as another tree ($h1 / $h4)"; bad=1; fi
  printf 'new\n' > "$REPO/apps/web/src/c.ts"; touch -d '2 days ago' "$REPO/apps/web/src/c.ts"
  h5=$(web_sources_hash "$REPO"); rm -f "$REPO/apps/web/src/c.ts"
  if [ "$h5" != "$h1" ]; then echo "  ok   a new file, however old its mtime, is another tree"
  else echo "  FAIL a new, old-dated file reads as the same tree"; bad=1; fi
  return $bad
}

echo "verify's guards, on stand-ins:"
if ! run_cases; then echo "verify-guards selfcheck FAILED"; exit 1; fi

if [ "${1:-}" = "--mutate" ]; then
  echo
  echo "and what it did before, each of which the cases must catch:"
  fails=0
  # whole seconds, from ps
  lane_started_at () { date -d "$(ps -o lstart= -p "$1" 2>/dev/null)" +%s.00 2>/dev/null; }
  if run_cases > "$DIR/m1.log" 2>&1; then echo "  NOT CAUGHT: the start in whole seconds from ps -o lstart"; fails=1
  else echo "  caught: the start in whole seconds from ps -o lstart"; fi
  . "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
  # timeout with no kill
  run_bounded () { local secs=$1; shift 2; timeout "$secs" "$@"; }
  if run_cases > "$DIR/m2.log" 2>&1; then echo "  NOT CAUGHT: timeout with no KILL after its TERM"; fails=1
  else echo "  caught: timeout with no KILL after its TERM"; fi
  . "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
  # the newest mtime
  web_sources_hash () { ( cd "${1:-.}" && find apps/web/src apps/web/public -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 ); }
  if run_cases > "$DIR/m3.log" 2>&1; then echo "  NOT CAUGHT: the newest mtime for the tree"; fails=1
  else echo "  caught: the newest mtime for the tree"; fi
  if [ "$fails" -ne 0 ]; then echo "verify-guards selfcheck FAILED: a mutation went uncaught"; exit 1; fi
fi
echo "verify-guards selfcheck: ok"
exit
}
