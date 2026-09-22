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
  # ONE PASS, ONE OUTCOME PER PATCH, AND THE COLUMNS ADD UP BY CONSTRUCTION.
  #
  # This was six greps over the same file with overlapping patterns, and it grew
  # a column every time a category was found falling between the ones it had:
  # STILL-GREEN, then UNBUILT, then MISSING, then NO-CHANGE, then SHORT. Each
  # addition was right and the SHAPE was wrong — `RED` was whatever was left
  # after subtracting five independently-counted sets, so any patch matching two
  # of them was subtracted twice. A short run that also reports `0 failed` was
  # counted as still-green AND as short, which takes REDDENED below zero and
  # trips "PROVED NOTHING" on a set that proved something.
  #
  # That is the duplicated list, in the script whose entire purpose is to report
  # these numbers honestly — five patterns describing one partition, drifting
  # apart. So each patch block is classified exactly once, in the order a reader
  # would: the header says MISSING, FAILED or CHANGED NOTHING, else the body
  # says the run stopped early, else the summary says 0 failed, else it
  # reddened. The sum is asserted below rather than assumed.
  eval "$(awk '
    function flush() {
      if (!inpatch) return
      if      (hdr ~ / MISSING/)                 missing++
      else if (hdr ~ /(BUILD|PATCH) FAILED/)     unbuilt++
      else if (hdr ~ /PATCH CHANGED NOTHING/)    nochange++
      else if (nosummary)                       crashed++
      else if (isshort)                          short++
      else if (isgreen)                          green++
      else                                       red++
      inpatch = 0
    }
    /^== (syncing|BASELINE|restoring|REFUSING)/ { flush(); next }
    /^== / { flush(); inpatch = 1; hdr = $0; isshort = 0; isgreen = 0; nosummary = 0; next }
    inpatch && /^  NO SUMMARY:/ { nosummary = 1; next }
    inpatch && /^  SHORT RUN:/  { isshort = 1; next }
    # AND THE OTHER WORDING FOR THE SAME FACT. Suites report a short run two
    # ways: the `\u2717 N of M checks ran` line `wt-break.sh` tags as SHORT RUN,
    # and `FAIL ran N checks, expected M`, which several suites print as an
    # ordinary failure. `app-catalogue-10-frame-app-missing` stopped at 16 of 25
    # and was classified RED here — a patch that reddened four checks, three of
    # which it never reached. One partition, two spellings, and only one of them
    # was being read.
    inpatch && /FAIL ran [0-9]+ checks, expected/ { isshort = 1; next }
    inpatch && /, 0 failed/     { isgreen = 1; next }
    END {
      flush()
      printf "RAN=%d GREEN=%d UNBUILT=%d MISSING=%d NOCHANGE=%d SHORT=%d CRASHED=%d RED=%d\n",
        missing+unbuilt+nochange+short+crashed+green+red, green+0, unbuilt+0, missing+0,
        nochange+0, short+0, crashed+0, red+0
    }
  ' "$RES" 2>/dev/null)"
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
