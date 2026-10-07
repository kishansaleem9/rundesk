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
#     (`found-6-oct/verify-takes-a-bundle-of-other-sources-as-fresh`);
#   · a suite started from a shell that sets no locale runs in UTF-8
#     (`LANE_SUITE_LOCALE`), and `verify.sh` and `wt-break.sh` start every
#     suite so (`found-30-sep/lanes-save-downloads-in-ascii`).
#
# With --mutate, each helper is replaced by what `verify.sh` did before —
# whole seconds from `ps -o lstart`, `timeout` with no kill, the newest mtime,
# no locale, a runner line without it — and the same cases must catch each
# one. No lane, no API: CI's verify job runs it too.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lane-env.sh"
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
# The scripts that start a suite on a lane, read by case 6.
RUNNERS=("$HERE/verify.sh" "$HERE/wt-break.sh")

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
  # 5. A suite's locale, from a shell that sets none, as the lanes' shells do
  #    (CI's runner has one, so it is taken away first). `locale charmap` reads
  #    the charset as Chromium does: setlocale, then nl_langinfo(CODESET).
  got=$(env -u LANG -u LANGUAGE -u LC_ALL -u LC_CTYPE env "${LANE_SUITE_LOCALE[@]}" locale charmap 2>/dev/null)
  if [ "$got" = "UTF-8" ]; then echo "  ok   a suite started from a shell with no locale runs in UTF-8"
  else echo "  FAIL a suite started from a shell with no locale reads its charset as ${got:-nothing}"; bad=1; fi
  # 6. Every line of a runner that starts a suite starts it under that locale.
  local f runs bare
  for f in "${RUNNERS[@]}"; do
    runs=$(grep -cE 'node "(\$WT/)?test/e2e/\$SUITE\.mjs"' "$f")
    bare=$(grep -E 'node "(\$WT/)?test/e2e/\$SUITE\.mjs"' "$f" | grep -cvF 'env "${LANE_SUITE_LOCALE[@]}" node')
    if [ "$runs" -gt 0 ] && [ "$bare" -eq 0 ]; then echo "  ok   $(basename "$f") starts each of its $runs suite runs in that locale"
    else echo "  FAIL $(basename "$f") starts $bare of its $runs suite runs without it"; bad=1; fi
  done
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
  . "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
  # no locale for the suite
  LANE_SUITE_LOCALE=()
  if run_cases > "$DIR/m4.log" 2>&1; then echo "  NOT CAUGHT: a suite started in the shell's own locale"; fails=1
  else echo "  caught: a suite started in the shell's own locale"; fi
  . "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
  # a runner that starts its suite without it, as verify.sh did
  sed 's/env "${LANE_SUITE_LOCALE\[@\]}" node/node/' "$HERE/verify.sh" > "$DIR/verify.sh"
  RUNNERS=("$DIR/verify.sh" "$HERE/wt-break.sh")
  if run_cases > "$DIR/m5.log" 2>&1; then echo "  NOT CAUGHT: verify.sh starting its suite without the locale"; fails=1
  else echo "  caught: verify.sh starting its suite without the locale"; fi
  RUNNERS=("$HERE/verify.sh" "$HERE/wt-break.sh")
  if [ "$fails" -ne 0 ]; then echo "verify-guards selfcheck FAILED: a mutation went uncaught"; exit 1; fi
fi
echo "verify-guards selfcheck: ok"
exit
}
