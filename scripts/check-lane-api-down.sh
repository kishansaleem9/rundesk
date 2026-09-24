#!/bin/bash
# `lane_api_down` stops whatever listens on a lane's port and waits until the
# port is free — the step three lane scripts skipped or got wrong (see its
# comment in scripts/e2e-lanes/lane-env.sh). Held to that here with real
# servers on a spare port:
#
#   polite     a server that exits on SIGTERM    → 0, the port is free, and it
#              was free BEFORE the grace ran out — SIGTERM did it, not SIGKILL
#   stubborn   a server that ignores SIGTERM     → 0, and the port is free
#   empty      nothing listening                 → 0
#
# and in every case the break runner's stamp for the lane is gone afterwards,
# because each caller then starts the main tree's build on that port.
#
# --mutate then runs the same cases against broken copies of the function and
# requires every one to be caught: a check that cannot fail is not a check.
#
#   bash scripts/check-lane-api-down.sh [--mutate]
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=3039
export LANE_API_DOWN_GRACE=2

serve () {  # serve <polite|stubborn>
  local trap=''
  [ "$1" = stubborn ] && trap="process.on('SIGTERM', () => {});"
  node -e "$trap require('http').createServer((q, r) => r.end('ok')).listen($PORT)" &
  for _ in $(seq 1 50); do
    lsof -t -i ":$PORT" -sTCP:LISTEN > /dev/null 2>&1 && return 0
    sleep 0.1
  done
  echo "could not start the $1 server on $PORT" >&2
  return 1
}
held () { [ -n "$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null)" ]; }
# The break runner's stamp for this port's lane (19, which no fleet has): a
# stop must clear it, since the caller then starts the main tree's build.
STAMP="/tmp/claude-0/wt$((PORT - 3020)).serving"
stamped () { mkdir -p /tmp/claude-0 && echo "some-commit" > "$STAMP"; }

# run_cases <lane-env file> — prints one line per failing case, returns their count.
run_cases () {
  local env="$1" bad=0 rc
  for kind in polite stubborn; do
    serve "$kind" || return 99
    stamped
    local t0 ms
    t0=$(date +%s%N)
    bash -c ". '$env'; lane_api_down $PORT" > /dev/null 2>&1; rc=$?
    ms=$(( ($(date +%s%N) - t0) / 1000000 ))
    if [ "$rc" != 0 ] || held; then
      echo "  $kind: returned $rc with the port $(held && echo STILL HELD || echo free)"
      bad=$((bad + 1))
    elif [ -e "$STAMP" ]; then
      echo "  $kind: the port is free, and the break runner's stamp still claims the lane"
      bad=$((bad + 1))
    elif [ "$kind" = polite ] && [ "$ms" -ge $((LANE_API_DOWN_GRACE * 1000)) ]; then
      # A kill that stops nothing still ends with a free port, because the
      # SIGKILL after the grace frees it — every stop then costs the whole grace
      # and no API ever shuts down cleanly. Only the time tells.
      echo "  polite: took ${ms}ms — the grace ran out, so SIGTERM stopped nothing"
      bad=$((bad + 1))
    fi
    # Whatever the function under test left behind is not the next case's problem.
    kill -9 $(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null) 2>/dev/null
    wait 2>/dev/null
  done
  stamped
  bash -c ". '$env'; lane_api_down $PORT" > /dev/null 2>&1; rc=$?
  [ "$rc" = 0 ] || { echo "  empty: returned $rc with nothing listening"; bad=$((bad + 1)); }
  # Nothing listening is still a stop: the caller starts the main tree next.
  [ -e "$STAMP" ] && { echo "  empty: the break runner's stamp still claims the lane"; bad=$((bad + 1)); }
  rm -f "$STAMP"
  return $bad
}

held && { echo "port $PORT is in use — free it before running this check" >&2; exit 2; }
if run_cases "$REPO/scripts/e2e-lanes/lane-env.sh"; then
  echo "ok lane_api_down: polite, stubborn and empty ports all end free"
else
  echo "not ok lane_api_down"
  exit 1
fi

[ "${1:-}" = --mutate ] || exit 0

# Each mutation is a way this function has been, or could plausibly be, wrong.
MUTANTS=(
  # The fleet-restart shape: ask it to go and carry on without waiting.
  's/^  kill \$pids 2>\/dev\/null$/  kill $pids 2>\/dev\/null; return 0/'
  # No SIGKILL: a process that ignores SIGTERM keeps the port.
  's/^  \[ -n "\$left" \] && kill -9 \$left 2>\/dev\/null$/  :/'
  # The fleet-up shape: a pattern that kills nothing.
  's/^  kill \$pids 2>\/dev\/null$/  pkill -f "PORTMARK=nobody " 2>\/dev\/null/'
  # The stamp left behind, as it was until 24 September.
  's/^  rm -f "\/tmp\/claude-0\/wt.*\.serving"$/  :/'
)
# Not mutated: the "still held after SIGKILL" refusal. SIGKILL cannot be
# ignored, so no server a test can start reaches that branch, and a mutation
# there would survive for a reason that says nothing about the function.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
caught=0
for i in "${!MUTANTS[@]}"; do
  m="$TMP/lane-env-$i.sh"
  sed -E "${MUTANTS[$i]}" "$REPO/scripts/e2e-lanes/lane-env.sh" > "$m"
  if cmp -s "$m" "$REPO/scripts/e2e-lanes/lane-env.sh"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches the function"
    continue
  fi
  if run_cases "$m" > /dev/null; then
    echo "  mutation $((i + 1)) SURVIVED: ${MUTANTS[$i]}"
  else
    caught=$((caught + 1))
  fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of lane_api_down are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"
  exit 1
fi
