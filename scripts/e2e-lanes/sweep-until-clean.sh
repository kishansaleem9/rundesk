#!/usr/bin/env bash
# RUN THE SWEEP, AND HEAL THE FLEET UNDER IT.
#
# `chain-plan.sh` re-asks what is drifted between rounds, which is the right
# answer to a plan going stale. It assumes the lanes are up, which is the wrong
# assumption on this machine: a fleet started with `nohup` — and the chain
# itself, started the same way — was reaped between one tool call and the next.
# Four lanes, four object stores and the dispatcher all vanished mid-round, 40
# minutes passed before anything noticed, and the only evidence was a plan that
# had stopped advancing.
#
# THE DIAGNOSIS MATTERS MORE THAN THE FIX. `nohup`, `setsid` and `disown` do not
# make a process survive here. Nothing does except being held by the harness, so
# this script is meant to BE the held process: it runs its rounds in the
# foreground and never backgrounds the work it is waiting on.
#
# Between rounds it checks each lane and brings back only the ones that are
# down, because `fleet-up.sh` on a healthy lane would drop and restore its
# database for nothing — twenty minutes of the sweep's own time, per round.
#
# A round that asks for exactly what the last round asked for is the end of it:
# either a baseline REFUSES and its patches can never be recorded, or the tree
# is moving under the sweep. Saying so once beats running all night to say it
# never.
#
#   bash scripts/e2e-lanes/sweep-until-clean.sh          # until drained
#   ROUNDS=3 bash scripts/e2e-lanes/sweep-until-clean.sh
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -uo pipefail
cd "$(dirname "$0")/../.."

ROUNDS="${ROUNDS:-8}"
LANES="${LANES:-2 3 4}"
LOG="${LOG:-/tmp/claude-0/sweep.log}"
say() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$LOG"; }

# Lane 1 is not a sweep lane, but `fleet-up.sh` takes a LIST and the health
# check below is per-lane, so only what is actually down is rebuilt.
heal () {
  local down=()
  for k in $LANES; do
    curl -s --noproxy '*' -o /dev/null --max-time 3 "http://127.0.0.1:$((3020 + k))/api/v1/health" \
      || down+=("$k")
  done
  if [ ${#down[@]} -gt 0 ]; then
    say "lanes down: ${down[*]} — bringing them back"
    # fleet-up exits 1 when a lane did not come up; that is worth a line here,
    # because the round below will otherwise find the lane down in silence.
    bash scripts/e2e-lanes/fleet-up.sh "${down[*]}" >> "$LOG" 2>&1 \
      || say "fleet-up could not bring back every one of: ${down[*]} — see $LOG"
  fi
  # The stores are separate processes and die separately; `lane_store_up` keeps
  # a healthy one and its objects, so this is cheap when nothing is wrong.
  . scripts/e2e-lanes/lane-env.sh
  for k in $LANES; do lane_store_up "$k" >> "$LOG" 2>&1; lane_model_up "$k" >> "$LOG" 2>&1; lane_calendar_up "$k" >> "$LOG" 2>&1; done
  # NOT THE SEARCH STUB, which is not restarted under a running API: the index
  # is in its memory and the API makes it only at boot, so a fresh stub beside
  # an old API answers every search 404 (lane-env.sh). A lane whose stub is
  # gone or stale is restarted whole, stub first.
  for k in $LANES; do
    lane_has_search "$k" || continue
    stub_is_current "$(lane_search_port "$k")" "$LANE_ENV_DIR/meili-stub.mjs" && continue
    say "lane $k: its search stub is gone or stale — restarting the lane"
    bash scripts/e2e-lanes/fleet-restart.sh "$k" >> "$LOG" 2>&1 \
      || say "fleet-restart could not bring lane $k back searching — see $LOG"
  done
}

# The shared loop, with the fleet healed before each round. Exit codes are the
# loop's: 0 nothing left, 2 no progress, 3 rounds used up, 4 planner failed.
before_round () { heal; }
. scripts/e2e-lanes/rounds.sh
run_rounds sweep
exit
}
