# THE ONE ROUND LOOP — sourced by `chain-plan.sh` and `sweep-until-clean.sh`.
#
#   run_rounds <plan-prefix>
#
# Each round: wait for the dispatcher's lock, run the caller's `before_round`
# if it has one, re-ask what is left (`build-plan.sh`), and run it. It ends:
#
#   0  nothing left — every log on disk measured the current tree
#   2  a round asked for exactly what the last one did: no progress, stopping
#   3  ROUNDS ran out with work still listed
#   4  the planner failed, which is NOT "nothing left"
#   5  gave up waiting for another dispatcher's lock
#
# ONE LOOP BECAUSE THERE WERE TWO AND THEY HAD ALREADY DRIFTED. `chain-plan.sh`
# learned (e9a90d2) that run-plan's exit 3 is "somebody else has the lanes",
# not a round that happened; `sweep-until-clean.sh` was written twelve hours
# later without that guard, so a lock refusal counted as a round, the next
# plan was identical, and it stopped on "no progress" having run nothing. They
# also ended the same outcomes with different codes (1 here, 2 or 3 there).
# `d840b55` deleted `break-queue.sh` for the same exit-3 mistake.
#
# The caller defines `say` and sets ROUNDS and LOG. The rest can be pointed
# elsewhere, which is how `scripts/check-rounds.sh` drives the loop with fakes.
run_rounds () {
  . scripts/e2e-lanes/lane-env.sh
  local prefix="$1" prev='' round plan sets patches now rc waited
  local build="${BUILD_PLAN:-scripts/e2e-lanes/build-plan.sh}"
  local dispatch="${RUN_PLAN:-scripts/e2e-lanes/run-plan.sh}"
  local lock="${RUN_PLAN_LOCK:-/tmp/claude-0/run-plan.lock}"
  local dir="${PLAN_DIR:-/tmp/claude-0}"
  for round in $(seq 1 "$ROUNDS"); do
    # The dispatcher refuses a second copy of itself by holding this directory,
    # so waiting on it is waiting for the previous round — whoever started it.
    # HELD by a live process, not merely present: a reaped dispatcher's lock
    # made this wait for ever, silently. Said once, and bounded.
    waited=0
    while lock_held "$lock"; do
      if [ "$waited" = 0 ]; then
        say "round $round: waiting for the dispatcher holding $lock (PID $(cat "$lock/pid" 2>/dev/null || echo 'unsigned'))"
      fi
      if [ "$waited" -ge "${LOCK_WAIT_MAX:-14400}" ]; then
        say "round $round: GAVE UP after $((waited / 60)) min waiting for $lock"
        return 5
      fi
      sleep "${LOCK_POLL:-30}"
      waited=$((waited + ${LOCK_POLL:-30}))
    done
    if declare -F before_round > /dev/null; then before_round; fi

    plan="$dir/$prefix-$round.txt"
    if ! bash "$build" "$plan" "$LOG"; then
      say "round $round: the PLANNER FAILED — this is not 'nothing left'; the reason is above in $LOG"
      return 4
    fi
    sets=$(grep -c . "$plan")
    patches=$(tr ' ' '\n' < "$plan" | grep -c .)
    if [ "$sets" = 0 ]; then
      say "round $round: nothing left — every log on disk measured the current tree"
      return 0
    fi
    now=$(sha1sum < "$plan" | cut -c1-12)
    if [ "$now" = "$prev" ]; then
      say "round $round: the same $sets set(s) as last round — no progress, stopping"
      say "   these sets cannot be brought current by re-running them; read $plan"
      return 2
    fi
    prev="$now"

    say "round $round: $sets set(s), $((patches - sets)) patch(es)"
    # FOREGROUND, on purpose: backgrounding it is what lost a sweep once.
    bash "$dispatch" "$plan" "$LOG"
    rc=$?
    say "round $round: dispatcher returned ($rc)"
    # EXIT 3 IS "SOMEBODY ELSE HAS THE LANES", not a round that happened.
    # Counting it would make the next round's identical plan look like a loop
    # that stopped making progress. So the round is taken back and waited out.
    if [ "$rc" = 3 ]; then
      prev=''
      sleep "${ROUND_BUSY_WAIT:-60}"
    fi
  done
  say "stopped after $ROUNDS round(s) with work still listed"
  return 3
}
