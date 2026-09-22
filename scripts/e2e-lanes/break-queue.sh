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
# ONE LOG PER RUN, NOT PER LANE.
#
# This was `break-queue-$LANE.log`, truncated at startup — so arming a second
# queue on the same lane erased the first one's log while it was still writing
# to it. Nothing of substance was lost, because the authoritative results are
# the per-suite `break-<suite>.txt` files and the timestamped archives
# `wt-break.sh` now takes on exit; the summary was the only casualty. That is
# the archive change earning its keep about two hours after it was written.
#
# Two queues on one lane still interleave at SET granularity and that is fine —
# each set holds the lock alone, which is the property that matters.
OUT="/tmp/claude-0/break-queue-$LANE-$(date +%Y%m%d-%H%M%S).log"

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
  # A STILL-GREEN PATCH IS A PATCH LINE FOLLOWED IMMEDIATELY BY ITS RESULT —
  # `wt-break.sh` prints any FAIL lines in between, so adjacency IS the test.
  #
  # The first version was `grep -A1 -E '^== '`, which also matches the BASELINE
  # line, and a green baseline reads "58 passed, 0 failed". So every set came
  # back claiming one more still-green patch than it had, and the first set it
  # ran reported STILL-GREEN 1 for five patches that all reddened. A wrong
  # number in the metric this script exists to report honestly.
  GREEN=$(awk '
    /^== (syncing|BASELINE|restoring|REFUSING)/ { patch=0; next }
    /^== / { patch=1; next }
    patch && /, 0 failed/ { n++ }
    { patch=0 }
    END { print n+0 }
  ' "$RES" 2>/dev/null)
  UNBUILT=$(grep -cE '^== .*(BUILD|PATCH) FAILED' "$RES" 2>/dev/null)
  # AND MISSING IS A THIRD THING, which this line learned the same way it
  # learned the second.
  #
  # `wt-break.sh` prints "== <name> MISSING" for a patch file it cannot find.
  # That matches `^== `, so it counted towards `patches`; it is followed by no
  # result line, so it did not count as still-green; and it says neither BUILD
  # nor PATCH FAILED, so it did not count as unbuilt. Two sets of four came
  # back reading "patches 4 · STILL-GREEN 0 · UNBUILT 0" — byte-identical to
  # four patches that all reddened — having run nothing at all.
  #
  # That is the confident zero, in the script whose entire purpose is to report
  # these numbers honestly, and it is the second time this line has had to grow
  # a column rather than let a category fall between the ones it had.
  MISSING=$(grep -cE '^== .* MISSING' "$RES" 2>/dev/null)
  # `PATCH CHANGED NOTHING` is a fourth one, and it fell through the same gap:
  # `wt-break.sh` prints it when a patch applied and left the tree identical,
  # which is not a build failure and not a MISSING file. Counted here rather
  # than discovered later, because the lesson of the line above is that every
  # outcome needs a column of its own the first time it is noticed.
  NOCHANGE=$(grep -cE '^== .*PATCH CHANGED NOTHING' "$RES" 2>/dev/null)
  # STILL-GREEN, UNBUILT AND MISSING ARE REPORTED SEPARATELY, ALWAYS. A patch
  # that never built prints no "N passed, M failed" line, so it is not counted
  # as still green — which is exactly what a patch that reddened looks like.
  # Reporting only still-green counted five unbuilt patches across five sets as
  # proven.
  RED=$((RAN - GREEN - UNBUILT - MISSING - NOCHANGE))
  echo "== $SUITE done rc=$RC · $BASE · patches $RAN · REDDENED $RED · STILL-GREEN $GREEN · UNBUILT $UNBUILT · MISSING $MISSING · NO-CHANGE $NOCHANGE" >> "$OUT"
  # SAY IT TWICE WHEN NOTHING RAN. A set is a claim about patches that
  # executed, and a line reading "patches 4" for four files nobody opened is
  # the claim without the thing it is about.
  [ "$RED" -le 0 ] && echo "== $SUITE PROVED NOTHING — no patch reddened the suite" >> "$OUT"
done < "$QUEUE"
echo "== QUEUE DONE" >> "$OUT"
