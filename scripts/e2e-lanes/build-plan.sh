#!/usr/bin/env bash
# BUILD ONE ROUND'S BREAK PLAN, OR SAY THE PLANNER FAILED.
#
#   build-plan.sh <plan-file> <log-file>
#
# Asks `never-run-plan.mjs` twice — for sets never measured, and (`--drifted`)
# for sets measured on a tree that has since moved — and merges the two on the
# suite, so a set that arrives from both modes runs once.
#
# `chain-plan.sh` and `sweep-until-clean.sh` each carried these lines, and
# neither checked any of the three steps. A planner that threw wrote nothing to
# the plan, the empty plan read as zero sets, and both scripts then said
# "nothing left — every log on disk measured the current tree" and exited 0:
# a crash reported as the best possible news. Replicated with a planner that
# throws; a syntax error in `log-tree.mjs` or a missing /tmp/claude-0 would do
# it for real.
#
# So every step's exit status is read, and an EMPTY answer is only accepted
# from a planner that finished: each mode must print its
# `[never-run-plan] N patch(es)` summary, which is the last thing it does. A
# run that exits 0 without it did not get there.
#
# Exit 0 with the plan written (possibly empty, meaning genuinely nothing
# left); exit 4 with the reason in the log when the plan cannot be trusted.
# `PLANNER` overrides the planner, for `scripts/check-build-plan.sh`.
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -uo pipefail
cd "$(dirname "$0")/../.."
plan="$1"
log="$2"
PLANNER="${PLANNER:-scripts/e2e-lanes/never-run-plan.mjs}"

: > "$plan"
for mode in plain --drifted; do
  args=()
  [ "$mode" = --drifted ] && args=(--drifted)
  err=$(mktemp)
  node "$PLANNER" "${args[@]}" >> "$plan" 2> "$err"
  rc=$?
  cat "$err" >> "$log"
  if [ "$rc" != 0 ]; then
    echo "planner failed: $PLANNER ${args[*]} exited $rc" >> "$log"
    rm -f "$err"
    exit 4
  fi
  if ! grep -qE '^\[never-run-plan\] [0-9]+ patch\(es\)' "$err"; then
    echo "planner failed: $PLANNER ${args[*]} exited 0 without its summary — it did not finish" >> "$log"
    rm -f "$err"
    exit 4
  fi
  rm -f "$err"
done

# One suite can arrive from both modes — a set with a new patch AND a moved
# tree. Running it twice would be two logs for one question and a second
# claimant for the lane, so the lines are merged on the suite.
if ! node - "$plan" > "$plan.merged" 2>> "$log" <<'JS'
const { readFileSync } = require('node:fs')
const by = new Map()
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  const [suite, ...patches] = line.trim().split(/\s+/).filter(Boolean)
  if (!suite || !patches.length) continue
  if (!by.has(suite)) by.set(suite, new Set())
  for (const p of patches) by.get(suite).add(p)
}
// A suite whose patches want a model AND no model is two sets, one per lane
// kind: wt-break refuses the mixture (`found-29-sep/no-model-patches-run-with-a-model`).
const BREAKS = process.env.BREAKS_DIR ?? 'test/e2e/breaks'
const header = (p) => { try { return readFileSync(`${BREAKS}/${p}.py`, 'utf8') } catch { return '' } }
const wantsModel = (p) => /^# Reddens only where a model answers/m.test(header(p))
const wantsNone = (p) => /^# Reddens only where no model answers/m.test(header(p))
for (const [suite, patches] of [...by].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) {
  const all = [...patches].sort()
  const model = all.filter(wantsModel)
  if (model.length && all.some(wantsNone)) {
    console.log([suite, ...all.filter((p) => !wantsModel(p))].join(' '))
    console.log([suite, ...model].join(' '))
  } else console.log([suite, ...all].join(' '))
}
JS
then
  echo "planner failed: merging the two plans failed" >> "$log"
  rm -f "$plan.merged"
  exit 4
fi
mv "$plan.merged" "$plan"
exit
}
