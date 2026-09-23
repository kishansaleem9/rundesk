#!/usr/bin/env bash
# `build-plan.sh` builds a round's break plan and must never let a planner that
# failed read as "nothing left" — which is what the two scripts it replaces did
# for a planner that threw. Held to that here with fake planners:
#
#   throws            exits 1 before its summary           → 4
#   dies-after        prints its summary, then exits 1     → 4   (only the exit status tells)
#   silent            exits 0 without its summary          → 4   (only the summary tells)
#   empty             "0 patch(es)" in both modes          → 0, and an empty plan
#   overlapping       the same suite from both modes       → 0, merged onto one line
#
# --mutate runs the cases against broken copies of build-plan.sh and requires
# every one to be caught.
#
#   bash scripts/check-build-plan.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
# The mutants live beside the real script (it cds relative to itself), so they
# are cleaned up here too if the check is interrupted.
trap 'rm -rf "$TMP" "$REPO"/scripts/e2e-lanes/.build-plan-mutant-*.sh' EXIT

planner () {  # planner <name> <node body> — the body sees `drifted` (boolean)
  printf 'const drifted = process.argv.includes("--drifted")\n%s\n' "$2" > "$TMP/$1.mjs"
}
planner throws      'throw new Error("log-tree.mjs: SyntaxError")'
planner dies-after  'console.error("[never-run-plan] 1 patch(es) across 1 suite(s)"); console.log("s p1"); process.exit(1)'
planner silent      'if (!drifted) console.log("s p1")'
planner empty       'console.error("[never-run-plan] 0 patch(es) across 0 suite(s)")'
planner overlapping 'console.log(drifted ? "a p2 p3" : "a p1 p2\nb q1"); console.error("[never-run-plan] 2 patch(es) across 2 suite(s)")'

# run_cases <build-plan.sh> — one line per failing case; returns their count.
run_cases () {
  local script="$1" bad=0 rc plan
  expect () {  # expect <case> <want-rc>
    plan="$TMP/plan-$1.txt"
    PLANNER="$TMP/$1.mjs" bash "$script" "$plan" "$TMP/log-$1.txt"; rc=$?
    if [ "$rc" != "$2" ]; then echo "  $1: exited $rc, want $2"; bad=$((bad + 1)); return 1; fi
    return 0
  }
  expect throws 4
  expect dies-after 4
  expect silent 4
  if expect empty 0 && [ -s "$TMP/plan-empty.txt" ]; then
    echo "  empty: wrote a plan for nothing: $(cat "$TMP/plan-empty.txt")"; bad=$((bad + 1))
  fi
  if expect overlapping 0; then
    local got; got=$(tr '\n' '|' < "$TMP/plan-overlapping.txt")
    [ "$got" = "a p1 p2 p3|b q1|" ] || { echo "  overlapping: merged into '$got'"; bad=$((bad + 1)); }
  fi
  return $bad
}

if run_cases "$REPO/scripts/e2e-lanes/build-plan.sh"; then
  echo "ok build-plan: a failed planner is exit 4, never an empty plan; empty and merged plans are right"
else
  echo "not ok build-plan"
  exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

MUTANTS=(
  # The old scripts: nobody read the exit status.
  's/^  if \[ "\$rc" != 0 \]; then$/  if false; then/'
  # Nor asked whether the planner finished.
  "s/^  if ! grep -qE '\\^\\\\\\[never-run-plan\\\\\\] \\[0-9\\]\\+ patch\\\\\\(es\\\\\\)' \"\\\$err\"; then\$/  if false; then/"
  # A failure named in the log and then reported as success.
  '0,/^    exit 4$/s//    exit 0/'
  # Merged on nothing: both modes' lines kept as they came.
  's/^mv "\$plan.merged" "\$plan"$/rm -f "$plan.merged"/'
)
caught=0
for i in "${!MUTANTS[@]}"; do
  m="$REPO/scripts/e2e-lanes/.build-plan-mutant-$i.sh"
  sed -E "${MUTANTS[$i]}" "$REPO/scripts/e2e-lanes/build-plan.sh" > "$m"
  if cmp -s "$m" "$REPO/scripts/e2e-lanes/build-plan.sh"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"
    rm -f "$m"; continue
  fi
  if run_cases "$m" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: ${MUTANTS[$i]}"
  else caught=$((caught + 1)); fi
  rm -f "$m"
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of build-plan are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"
  exit 1
fi
