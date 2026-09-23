#!/usr/bin/env bash
# The one round loop (`scripts/e2e-lanes/rounds.sh`) ends the way its header
# says, driven here by a fake planner and a fake dispatcher:
#
#   empty       the planner lists nothing                       → 0
#   stuck       the same plan twice, each round dispatched      → 2
#   busy        the dispatcher says 3 (lanes held elsewhere),
#               then the same plan again, then nothing          → 0, dispatched twice
#   broken      the planner fails                               → 4
#   endless     a new plan every round, ROUNDS=2                → 3
#   dead lock   the dispatcher's lock names a PID that is gone  → runs as if free
#   live lock   held by a live process past LOCK_WAIT_MAX       → 5, nothing dispatched
#
# `busy` is the case `sweep-until-clean.sh` got wrong before the two loops
# became one: a refusal counted as a round, and the identical next plan
# stopped it on "no progress" having run nothing.
#
# --mutate runs the cases against broken copies of the loop.
#
#   bash scripts/check-rounds.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
TMP=$(mktemp -d)
trap 'kill "$LIVE" 2>/dev/null; rm -rf "$TMP"' EXIT
export PLAN_DIR="$TMP" RUN_PLAN_LOCK="$TMP/no-such-lock" ROUND_BUSY_WAIT=0 LOCK_POLL=1 LOCK_WAIT_MAX=2
sleep 300 & LIVE=$!
( exit 0 ) & DEAD=$!; wait "$DEAD" 2>/dev/null

# A fake planner: $TMP/plans/<n> is the plan for its nth call; a missing file
# means an empty plan; FAIL_PLANNER=1 means fail.
cat > "$TMP/build.sh" <<'SH'
n=$(( $(cat "$PLAN_DIR/calls" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$PLAN_DIR/calls"
[ "${FAIL_PLANNER:-0}" = 1 ] && exit 4
if [ -f "$PLAN_DIR/plans/$n" ]; then cp "$PLAN_DIR/plans/$n" "$1"; else : > "$1"; fi
SH
# A fake dispatcher: exits with the nth word of DISPATCH_RCS (0 when absent).
cat > "$TMP/dispatch.sh" <<'SH'
n=$(( $(cat "$PLAN_DIR/dispatched" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$PLAN_DIR/dispatched"
rc=$(echo "${DISPATCH_RCS:-}" | awk -v n="$n" '{print $n}')
exit "${rc:-0}"
SH

# run <rounds.sh> <case> <rounds> <plans...> — prints "exit dispatched"
run () {
  local loop="$1" case="$2" rounds="$3"; shift 3
  rm -rf "$TMP/plans" "$TMP/calls" "$TMP/dispatched"; mkdir -p "$TMP/plans"
  local i=1
  for p in "$@"; do [ "$p" = - ] || printf '%s\n' "$p" > "$TMP/plans/$i"; i=$((i + 1)); done
  # Its own shell, time-limited: a mutant that waits for ever must come back
  # as a wrong answer (124), not hang the check that is trying to catch it.
  ROUNDS="$rounds" LOG="$TMP/log" BUILD_PLAN="$TMP/build.sh" RUN_PLAN="$TMP/dispatch.sh" \
    timeout 20 bash -c 'say () { :; }; . "$1"; run_rounds "check-$2"' _ "$loop" "$case"
  echo "$? $(cat "$TMP/dispatched" 2>/dev/null || echo 0)"
}

cases () {
  local loop="$1" bad=0 got
  expect () { if [ "$got" != "$2" ]; then echo "  $1: got '$got', want '$2'"; bad=$((bad + 1)); fi; }
  got=$(run "$loop" empty 5 -);                                           expect empty '0 0'
  got=$(run "$loop" stuck 5 'a p1' 'a p1');                                expect stuck '2 1'
  got=$(DISPATCH_RCS='3 0' run "$loop" busy 5 'a p1' 'a p1' -);            expect busy '0 2'
  got=$(FAIL_PLANNER=1 run "$loop" broken 5 'a p1');                       expect broken '4 0'
  got=$(run "$loop" endless 2 'a p1' 'b p2' 'c p3');                       expect endless '3 2'
  rm -rf "$TMP/lock"; mkdir "$TMP/lock"; echo "$DEAD" > "$TMP/lock/pid"
  got=$(RUN_PLAN_LOCK="$TMP/lock" run "$loop" deadlock 5 'a p1' -);       expect 'dead lock' '0 1'
  echo "$LIVE" > "$TMP/lock/pid"
  got=$(RUN_PLAN_LOCK="$TMP/lock" run "$loop" livelock 5 'a p1' -);       expect 'live lock' '5 0'
  return $bad
}

if cases "$REPO/scripts/e2e-lanes/rounds.sh"; then
  echo "ok rounds: empty 0, stuck 2, busy waits and carries on, broken 4, endless 3, a dead lock ignored, a live one 5"
else
  echo "not ok rounds"; exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

MUTANTS=(
  # sweep-until-clean as it was: a refusal is a round like any other.
  's/^      prev=.{2}$/      :/'
  # A failed planner read as nothing left.
  's/^      return 4$/      return 0/'
  # No progress guard at all: the same plan runs until ROUNDS is spent.
  's/^    if \[ "\$now" = "\$prev" \]; then$/    if false; then/'
  # Nothing-left forgotten: an empty plan is dispatched like any other.
  's/^    if \[ "\$sets" = 0 \]; then$/    if false; then/'
  # The old wait: a directory is a holder, alive or not.
  's/^    while lock_held "\$lock"; do$/    while [ -d "$lock" ] \&\& [ "$waited" -lt 3 ]; do/'
  # Waits for ever: the bound never fires.
  's/^      if \[ "\$waited" -ge "\$\{LOCK_WAIT_MAX:-14400\}" \]; then$/      if false; then/'
)
caught=0
for i in "${!MUTANTS[@]}"; do
  m="$TMP/rounds-$i.sh"
  sed -E "${MUTANTS[$i]}" "$REPO/scripts/e2e-lanes/rounds.sh" > "$m"
  if cmp -s "$m" "$REPO/scripts/e2e-lanes/rounds.sh"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"; continue
  fi
  if cases "$m" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: ${MUTANTS[$i]}"
  else caught=$((caught + 1)); fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of the round loop are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"; exit 1
fi
