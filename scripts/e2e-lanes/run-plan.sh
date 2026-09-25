#!/usr/bin/env bash
# ONE DISPATCHER, THREE LANES, AND THAT IS THE POINT.
#
# The queues this replaces were one background shell per suite, each waiting on
# its own lane's lock and then launching. Two of them woke on the same freed
# lane within seconds of each other, and `ui-sweep` ran TWICE — once on lane 2
# and once on lane 3, both appending to `/tmp/claude-0/break-ui-sweep.txt`. The
# log came out with a patch result above the baseline that produced it, two
# `DONE` markers, and a `restoring /tmp/claude-0/wt2` line in the middle of a
# lane-4 run. Every per-patch number in the ledger is read off those files.
#
# `wt-break.sh` takes the lane lock, so nothing was corrupted in the WORKTREES.
# What was corrupted was the record — which is worse, because it is the part
# nobody re-derives.
#
# So the work list lives in ONE process that hands a set to a lane only when
# that lane's previous child has exited AND its lock is gone. There is no second
# claimant to race with, and a lockfile stops this script racing itself.
#
#   node scripts/e2e-lanes/never-run-plan.mjs > /tmp/claude-0/plan.txt
#   nohup bash scripts/e2e-lanes/run-plan.sh /tmp/claude-0/plan.txt &
#
# Each plan line is `<suite> <patch> <patch> ...` — exactly `wt-break.sh`'s
# arguments after the lane. The canonical log is removed before each set so the
# file belongs to one run; `wt-break.sh`'s per-run archive keeps what came
# before.
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -uo pipefail
# RUN_PLAN_REPO only for `scripts/check-run-plan.sh`, whose broken copies of
# this file live outside the repo and would otherwise find no lane-env.sh.
cd "${RUN_PLAN_REPO:-$(dirname "$0")/../..}"

PLAN="${1:?usage: run-plan.sh <plan file> [log file]}"
LOG="${2:-/tmp/claude-0/run-plan.log}"
LANES="${LANES:-2 3 4}"
# Where the locks and the canonical logs live, and what runs a set: both moved
# only by `scripts/check-run-plan.sh`, which dispatches a plan to a stand-in.
DIR="${BREAK_LOCK_DIR:-/tmp/claude-0}"
WT_BREAK="${WT_BREAK:-scripts/e2e-lanes/wt-break.sh}"
GUARD="$DIR/run-plan.lock"
# The locks carry their holder's PID — see `lock_take` in lane-env.sh for the
# reaped dispatcher whose bare directory made every later one refuse for ever.
. scripts/e2e-lanes/lane-env.sh

if ! lock_take "$GUARD"; then
  echo "run-plan.sh is already running (PID $(cat "$GUARD/pid" 2>/dev/null || echo 'unsigned'), holding $GUARD) — refusing to start a second dispatcher" >&2
  exit 3
fi
trap 'lock_drop "$GUARD"' EXIT

mapfile -t WORK < "$PLAN"
declare -A PID=()
declare -A WHAT=()
# Which plan entries are spoken for. Not a cursor: a set whose suite is busy
# is passed over, and a later one for another suite goes first.
declare -A TAKEN=()
taken=0
started=0
say() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" >> "$LOG"; }

say "PLAN: ${#WORK[@]} set(s) from $PLAN across lanes $LANES"
while :; do
  for lane in $LANES; do
    pid="${PID[$lane]:-}"
    if [ -n "$pid" ]; then
      if kill -0 "$pid" 2>/dev/null; then continue; fi
      wait "$pid"; rc=$?
      say "done ${WHAT[$lane]} on lane $lane (exit $rc)"
      PID[$lane]=''
    fi
    [ "$taken" -ge "${#WORK[@]}" ] && continue
    # A lock still held after the child exited means somebody else has the lane.
    # Skipping rather than launching is what keeps a refusal (exit 3) from
    # burning a plan entry. HELD means a live holder: a lock left by a reaped
    # run is not waited on — `wt-break.sh` takes it and says so.
    lock_held "$DIR/wt$lane.lock" && continue
    # THE FIRST ENTRY WHOSE SUITE IS FREE. A suite's results file is one per
    # suite, so two of its sets must never overlap: `wt-break.sh` refuses the
    # second (`break_locks_take`), and handing it one would burn the entry.
    # Busy means running here on another lane — its lock may not be taken
    # yet, the child having only just started — or held by any other run.
    pick=-1
    for ((j = 0; j < ${#WORK[@]}; j++)); do
      [ -n "${TAKEN[$j]:-}" ] && continue
      if [ -z "${WORK[$j]// /}" ]; then TAKEN[$j]=1; taken=$((taken + 1)); continue; fi
      cand="${WORK[$j]%% *}"
      busy=''
      for l in $LANES; do
        [ -n "${PID[$l]:-}" ] && [ "${WHAT[$l]:-}" = "$cand" ] && busy=yes
      done
      [ -z "$busy" ] && lock_held "$DIR/break-$cand.lock" && busy=yes
      [ -n "$busy" ] && continue
      pick=$j
      break
    done
    [ "$pick" -lt 0 ] && continue
    TAKEN[$pick]=1
    taken=$((taken + 1))
    # shellcheck disable=SC2086
    set -- ${WORK[$pick]}
    suite=$1
    shift
    say "start $suite on lane $lane ($# patch(es))"
    rm -f "$DIR/break-$suite.txt"
    bash "$WT_BREAK" "$lane" "$suite" "$@" >> "$LOG" 2>&1 &
    PID[$lane]=$!
    WHAT[$lane]=$suite
    started=$((started + 1))
  done

  running=0
  for lane in $LANES; do
    p="${PID[$lane]:-}"
    [ -n "$p" ] && kill -0 "$p" 2>/dev/null && running=$((running + 1))
  done
  if [ "$running" = 0 ] && [ "$taken" -ge "${#WORK[@]}" ]; then break; fi
  # WORK LEFT, NOTHING OF OURS RUNNING, AND NOTHING LAUNCHED: every lane, or
  # every remaining set's suite, is held by somebody else. This used to sleep
  # here for ever, logging nothing after "PLAN:". Said once, and given up on
  # after a bound, with its own exit code.
  if [ "$running" = 0 ]; then
    if [ -z "${held_since:-}" ]; then
      held_since=$(date +%s)
      say "waiting: every lane in $LANES, or the suite of every set left, is held by another run — $(for l in $LANES; do printf 'wt%s=%s ' "$l" "$(cat "$DIR/wt$l.lock/pid" 2>/dev/null || echo unsigned)"; done)"
    elif [ $(( $(date +%s) - held_since )) -ge "${LANE_WAIT_MAX:-3600}" ]; then
      say "GAVE UP: held by another run for $(( ($(date +%s) - held_since) / 60 )) min — $((${#WORK[@]} - taken)) set(s) not launched"
      exit 5
    fi
  else
    held_since=''
  fi
  sleep "${DISPATCH_TICK:-20}"
done
say "PLAN DRAINED: $started set(s) launched of ${#WORK[@]}"
exit
}
