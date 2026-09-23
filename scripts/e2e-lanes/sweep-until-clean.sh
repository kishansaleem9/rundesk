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
    bash scripts/e2e-lanes/fleet-up.sh "${down[*]}" >> "$LOG" 2>&1
  fi
  # The stores are separate processes and die separately; `lane_store_up` keeps
  # a healthy one and its objects, so this is cheap when nothing is wrong.
  . scripts/e2e-lanes/lane-env.sh
  for k in $LANES; do lane_store_up "$k" >> "$LOG" 2>&1; lane_model_up "$k" >> "$LOG" 2>&1; done
}

prev=''
for round in $(seq 1 "$ROUNDS"); do
  heal

  plan="/tmp/claude-0/sweep-$round.txt"
  : > "$plan"
  node scripts/e2e-lanes/never-run-plan.mjs >> "$plan" 2>>"$LOG"
  node scripts/e2e-lanes/never-run-plan.mjs --drifted >> "$plan" 2>>"$LOG"
  # One suite can arrive from both modes — a new patch AND a moved tree. Running
  # it twice would be two logs for one question and a second claimant for the
  # lane, so the lines are merged on the suite.
  node - "$plan" <<'JS' > "$plan.merged"
const { readFileSync } = require('node:fs')
const by = new Map()
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  const [suite, ...patches] = line.trim().split(/\s+/).filter(Boolean)
  if (!suite || !patches.length) continue
  if (!by.has(suite)) by.set(suite, new Set())
  for (const p of patches) by.get(suite).add(p)
}
for (const [suite, patches] of [...by].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])))
  console.log([suite, ...[...patches].sort()].join(' '))
JS
  mv "$plan.merged" "$plan"

  sets=$(grep -c . "$plan")
  patches=$(tr ' ' '\n' < "$plan" | grep -c .)
  if [ "$sets" = 0 ]; then
    say "round $round: nothing left — every log on disk measured the current tree"
    exit 0
  fi
  now=$(cat "$plan")
  if [ "$now" = "$prev" ]; then
    say "round $round: asked for exactly what round $((round - 1)) asked for — stopping rather than looping"
    say "  $sets set(s) unmoved: $(cut -d' ' -f1 "$plan" | tr '\n' ' ')"
    exit 1
  fi
  prev="$now"

  say "round $round: $sets set(s), $((patches - sets)) patch(es)"
  # FOREGROUND, on purpose. Backgrounding it here is what lost the last sweep.
  bash scripts/e2e-lanes/run-plan.sh "$plan" >> "$LOG" 2>&1
  say "round $round: dispatcher returned ($?)"
done
say "stopped after $ROUNDS round(s) with work still outstanding"
exit 1
