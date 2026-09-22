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
  # The classifier lives in `classify-break-log.awk`, because the reporter asks
  # the same question of the same file and two copies of it is the duplicated
  # list this audit keeps finding.
  eval "$(awk -f "$(dirname "$0")/classify-break-log.awk" "$RES" 2>/dev/null)"
  : "${RAN:=0}" "${GREEN:=0}" "${UNBUILT:=0}" "${MISSING:=0}" "${NOCHANGE:=0}" "${SHORT:=0}" "${CRASHED:=0}" "${RED:=0}"
  echo "== $SUITE done rc=$RC · $BASE · patches $RAN · REDDENED $RED · STILL-GREEN $GREEN · UNBUILT $UNBUILT · MISSING $MISSING · NO-CHANGE $NOCHANGE · SHORT $SHORT · CRASHED $CRASHED" >> "$OUT"
  # THE PARTITION IS ASSERTED, NOT TRUSTED. The whole reason the old arithmetic
  # was wrong is that nothing checked whether the columns accounted for the
  # patches, so a double-counted patch showed up as a plausible smaller number.
  SUM=$((RED + GREEN + UNBUILT + MISSING + NOCHANGE + SHORT + CRASHED))
  [ "$SUM" -ne "$RAN" ] && echo "== $SUITE TALLY IS BROKEN — $SUM accounted for, $RAN patches ran; do not read the line above" >> "$OUT"
  # A SHORT RUN IS NOT A PROOF. Such a patch reddens some checks AND makes
  # others unreachable, and only the first half is evidence: the ones that never
  # ran are exactly as unproven as they were before it applied.
  [ "$SHORT" -gt 0 ] && echo "== $SUITE has $SHORT patch(es) whose run STOPPED EARLY — those runs prove nothing about the checks that never happened" >> "$OUT"
  # A CRASH IS NOT A PROOF EITHER, and it looked most like one: a patch line with
  # FAIL lines under it and no totals is byte-identical to a patch that reddened.
  # `emoji-picker-2-data-inlined` killed the suite on an unguarded click, and the
  # first version of this tally counted it as REDDENED.
  [ "$CRASHED" -gt 0 ] && echo "== $SUITE has $CRASHED patch(es) whose run CRASHED before printing totals — fix the suite, then re-run" >> "$OUT"
  # SAY IT TWICE WHEN NOTHING RAN. A set is a claim about patches that
  # executed, and a line reading "patches 4" for four files nobody opened is
  # the claim without the thing it is about.
  [ "$RED" -le 0 ] && echo "== $SUITE PROVED NOTHING — no patch reddened the suite" >> "$OUT"
done < "$QUEUE"
echo "== QUEUE DONE" >> "$OUT"
