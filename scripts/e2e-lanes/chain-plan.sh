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
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -uo pipefail
cd "$(dirname "$0")/../.."

ROUNDS="${ROUNDS:-8}"
LOG="${LOG:-/tmp/claude-0/chain.log}"
say() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" >> "$LOG"; }

. scripts/e2e-lanes/rounds.sh
run_rounds chain
exit
}
