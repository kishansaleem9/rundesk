#!/usr/bin/env bash
# RE-ASK WHAT IS LEFT, RATHER THAN CARRY A LIST.
#
# Each plan I have run was a snapshot: generate a list, run it for three hours,
# and by the end the list is wrong in both directions. `aar-24` was written after
# `plan3.txt` was generated and so was never in it. `fd-7` and `sw-4` were
# measured against suites that changed during the very run that measured them.
# Three patches needing a run, in a plan that could not say so.
#
# So this asks the question again between rounds instead: when the dispatcher's
# lock is gone, regenerate from what is on disk — the patches with no log, plus
# the ones whose log is about a tree that has since moved — and run that. When a
# round comes back empty, everything on disk is a measurement of the current
# tree, which is the only end state worth having.
#
#   nohup bash scripts/e2e-lanes/chain-plan.sh > /tmp/claude-0/chain.log 2>&1 &
#
# TWO WAYS THIS COULD NEVER STOP, and both are guarded. A suite whose baseline
# REFUSES records no patch lines at all, so its patches stay unmeasured however
# often they run — and a suite I keep editing between rounds drifts again each
# time. So a round that asks for exactly what the last round asked for is the
# end of it: the loop has stopped making progress, and saying that once beats
# burning the machine all night to say it never.
set -uo pipefail
cd "$(dirname "$0")/../.."

ROUNDS="${ROUNDS:-8}"
LOG="${LOG:-/tmp/claude-0/chain.log}"
say() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" >> "$LOG"; }

prev=''
for round in $(seq 1 "$ROUNDS"); do
  # The dispatcher refuses a second copy of itself by holding this directory, so
  # waiting on it is waiting for the previous round — whoever started it.
  while [ -d /tmp/claude-0/run-plan.lock ]; do sleep 30; done

  plan="/tmp/claude-0/chain-$round.txt"
  : > "$plan"
  node scripts/e2e-lanes/never-run-plan.mjs >> "$plan" 2>>"$LOG"
  node scripts/e2e-lanes/never-run-plan.mjs --drifted >> "$plan" 2>>"$LOG"
  # One suite can arrive from both modes — a set with a new patch AND a moved
  # tree. Running it twice would be two logs for one question and a second
  # claimant for the lane, so the lines are merged on the suite.
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
  patches=$(tr ' ' '\n' < "$plan" | grep -c . )
  if [ "$sets" = 0 ]; then
    say "round $round: nothing left — every log on disk measured the current tree"
    exit 0
  fi
  now=$(sha1sum < "$plan" | cut -c1-12)
  if [ "$now" = "$prev" ]; then
    say "round $round: the same $sets set(s) as last round — no progress, stopping"
    say "   these sets cannot be brought current by re-running them; read $plan"
    exit 2
  fi
  prev="$now"

  say "round $round: $sets set(s), $((patches - sets)) patch(es)"
  bash scripts/e2e-lanes/run-plan.sh "$plan" "$LOG"
  rc=$?
  say "round $round: dispatcher returned ($rc)"
  # EXIT 3 IS "SOMEBODY ELSE HAS THE LANES", not a round that happened. Counting
  # it as one would make the next round's identical plan look like a loop that
  # stopped making progress, and the progress guard would stop a chain that had
  # not started. So the round is taken back and the wait repeats.
  if [ "$rc" = 3 ]; then
    prev=''
    sleep 60
  fi
done
say "stopped after $ROUNDS round(s) with work still listed"
exit 3
