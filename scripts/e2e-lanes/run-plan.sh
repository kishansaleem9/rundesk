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
set -uo pipefail
cd "$(dirname "$0")/../.."

PLAN="${1:?usage: run-plan.sh <plan file> [log file]}"
LOG="${2:-/tmp/claude-0/run-plan.log}"
LANES="${LANES:-2 3 4}"
GUARD=/tmp/claude-0/run-plan.lock

if ! mkdir "$GUARD" 2>/dev/null; then
  echo "run-plan.sh is already running (holding $GUARD) — refusing to start a second dispatcher" >&2
  exit 3
fi
trap 'rmdir "$GUARD" 2>/dev/null' EXIT

mapfile -t WORK < "$PLAN"
declare -A PID=()
declare -A WHAT=()
next=0
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
    [ "$next" -ge "${#WORK[@]}" ] && continue
    # A lock still held after the child exited means somebody else has the lane.
    # Skipping rather than launching is what keeps a refusal (exit 3) from
    # burning a plan entry.
    [ -d "/tmp/claude-0/wt$lane.lock" ] && continue
    line="${WORK[$next]}"
    next=$((next + 1))
    [ -z "$line" ] && continue
    # shellcheck disable=SC2086
    set -- $line
    suite=$1
    shift
    say "start $suite on lane $lane ($# patch(es))"
    rm -f "/tmp/claude-0/break-$suite.txt"
    bash scripts/e2e-lanes/wt-break.sh "$lane" "$suite" "$@" >> "$LOG" 2>&1 &
    PID[$lane]=$!
    WHAT[$lane]=$suite
    started=$((started + 1))
  done

  running=0
  for lane in $LANES; do
    p="${PID[$lane]:-}"
    [ -n "$p" ] && kill -0 "$p" 2>/dev/null && running=$((running + 1))
  done
  if [ "$running" = 0 ] && [ "$next" -ge "${#WORK[@]}" ]; then break; fi
  sleep 20
done
say "PLAN DRAINED: $started set(s) launched of ${#WORK[@]}"
