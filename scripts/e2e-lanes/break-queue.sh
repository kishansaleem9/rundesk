#!/bin/bash
# Run several break sets back to back on ONE lane, waiting for the lock between
# them.
#
#   break-queue.sh 2 queue.txt
#
# where each line of queue.txt is a suite followed by its patch names:
#
#   task-merge task-merge-1-self-merge-allowed task-merge-2-into-own-subtask
#   list-export list-export-1-formula-lead-unescaped
#
# WHY A QUEUE AND NOT THREE TERMINALS. Three break sets at once on four cores is
# slower than three in a row — every patch is a full `vite build` — and it also
# makes each result unattributable if anything restarts a lane underneath them.
# One at a time is the rule; this just stops the lane sitting idle between sets
# while somebody notices the last one finished.
#
# `wt-break.sh` refuses with exit 3 when the lane's lock is held, so the wait is
# on the lock rather than on a sleep: a set that overruns simply delays the next
# one instead of colliding with it.
set -u
LANE="${1:?usage: break-queue.sh <lane> <queue-file>}"
QUEUE="${2:?usage: break-queue.sh <lane> <queue-file>}"
R=/home/user/rundesk
LOCK="/tmp/claude-0/wt$LANE.lock"
OUT="/tmp/claude-0/break-queue-$LANE.log"

: > "$OUT"
while IFS= read -r line; do
  # Blank lines and comments, so a queue can be edited while it runs.
  [ -z "${line// }" ] && continue
  case "$line" in \#*) continue ;; esac
  set -- $line
  SUITE="$1"; shift
  [ $# -eq 0 ] && { echo "== $SUITE has no patches listed — skipped" >> "$OUT"; continue; }

  # Wait for whatever holds the lane, without racing for it: `wt-break.sh` takes
  # the lock itself, so this only waits until there is nothing to wait for.
  for _ in $(seq 1 360); do [ -d "$LOCK" ] || break; sleep 10; done
  if [ -d "$LOCK" ]; then
    echo "== $SUITE SKIPPED — lane $LANE still locked after an hour" >> "$OUT"
    continue
  fi

  echo "== starting $SUITE ($# patches) at $(date +%H:%M:%S)" >> "$OUT"
  bash "$R/scripts/e2e-lanes/wt-break.sh" "$LANE" "$SUITE" "$@" >> "$OUT" 2>&1
  RC=$?
  RES="/tmp/claude-0/break-$SUITE.txt"
  BASE=$(grep -m1 '^== BASELINE' "$RES" 2>/dev/null)
  RAN=$(grep -E '^== ' "$RES" 2>/dev/null | grep -vcE '^== (syncing|BASELINE|restoring|REFUSING)')
  GREEN=$(grep -A1 -E '^== ' "$RES" 2>/dev/null | grep -c ', 0 failed')
  UNBUILT=$(grep -cE '^== .*(BUILD|PATCH) FAILED' "$RES" 2>/dev/null)
  # STILL-GREEN AND UNBUILT ARE REPORTED SEPARATELY, ALWAYS. A patch that never
  # built prints no "N passed, M failed" line, so it is not counted as still
  # green — which is exactly what a patch that reddened looks like. Reporting
  # only still-green counted five unbuilt patches across five sets as proven.
  echo "== $SUITE done rc=$RC · $BASE · patches $RAN · STILL-GREEN $GREEN · UNBUILT $UNBUILT" >> "$OUT"
done < "$QUEUE"
echo "== QUEUE DONE" >> "$OUT"
