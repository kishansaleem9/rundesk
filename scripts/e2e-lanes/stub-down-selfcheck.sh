#!/bin/bash
# A stale stub is stopped before its replacement starts (`stub_down`,
# lane-env.sh; `found-29-sep/stale-model-stub-never-replaced`).
#
#   bash scripts/e2e-lanes/stub-down-selfcheck.sh [--mutate]
#
# Starts the real model stub (whose command line ends at its port), the real
# store stub and the real search stub (whose command lines go on past it) on
# spare loopback ports, and holds `stub_down` to stopping each, and a stub on a
# port that merely begins with the same digits to being left alone. With
# --mutate, the pattern the launchers used before (a space after the port) must
# be caught: it leaves the model stub running. No lane, no API: CI's verify job
# runs it too.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lane-env.sh"
# Four digits, so the port with a 9 after them is still a port (6300..64999).
BASE=$((6300 + $$ % 200))
MODEL=$BASE; STORE=$((BASE + 1)); NEIGHBOUR="${BASE}9"; SEARCH=$((BASE + 2))
PIDS=()
cleanup () { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

answers () { curl -s --noproxy '*' --max-time 1 -o /dev/null "http://127.0.0.1:$1/__control/version" 2>/dev/null; }
start_model () { RUNDESK_MODEL_STUB=1 node "$HERE/model-stub.mjs" --port "$1" > /dev/null 2>&1 & PIDS+=($!); }
start_store () { RUNDESK_S3_STUB=1 node "$HERE/s3-stub.mjs" --port "$1" --bucket selfcheck --strict > /dev/null 2>&1 & PIDS+=($!); }
start_search () { RUNDESK_MEILI_STUB=1 node "$HERE/meili-stub.mjs" --port "$1" --key selfcheck > /dev/null 2>&1 & PIDS+=($!); }
wait_up () { for _ in $(seq 1 50); do answers "$1" && return 0; sleep 0.1; done; return 1; }

run_cases () {
  local bad=0
  start_model "$MODEL"; start_store "$STORE"; start_model "$NEIGHBOUR"; start_search "$SEARCH"
  for p in "$MODEL" "$STORE" "$NEIGHBOUR" "$SEARCH"; do
    wait_up "$p" || { echo "  FAIL a stub never answered on $p, so nothing below says anything"; return 1; }
  done
  stub_down "$MODEL" "$HERE/model-stub.mjs"
  if answers "$MODEL"; then echo "  FAIL the model stub on $MODEL still answers — its replacement would die on EADDRINUSE"; bad=1
  else echo "  ok   the model stub, whose command line ends at its port, is stopped"; fi
  stub_down "$STORE" "$HERE/s3-stub.mjs"
  if answers "$STORE"; then echo "  FAIL the store stub on $STORE still answers"; bad=1
  else echo "  ok   the store stub, whose command line goes on past its port, is stopped"; fi
  stub_down "$SEARCH" "$HERE/meili-stub.mjs"
  if answers "$SEARCH"; then echo "  FAIL the search stub on $SEARCH still answers"; bad=1
  else echo "  ok   the search stub, whose command line goes on past its port to its key, is stopped"; fi
  if answers "$NEIGHBOUR"; then echo "  ok   and the stub on $NEIGHBOUR, whose port begins with $MODEL, is left alone"
  else echo "  FAIL stopping $MODEL stopped the stub on $NEIGHBOUR too"; bad=1; fi
  stub_down "$NEIGHBOUR" "$HERE/model-stub.mjs"
  return $bad
}

echo "stopping stubs by port:"
if ! run_cases; then echo "stub-down selfcheck FAILED"; exit 1; fi

if [ "${1:-}" = "--mutate" ]; then
  for m in "the pattern the launchers used, a space after the port" "a pattern with no end to the port"; do
    (
      case "$m" in
        "the pattern the launchers used, a space after the port")
          stub_down () { pkill -f "$(basename "$2") --port $1 " 2>/dev/null; sleep 0.5; } ;;
        "a pattern with no end to the port")
          stub_down () { pkill -f "$(basename "$2") --port $1" 2>/dev/null; sleep 0.5; } ;;
      esac
      if run_cases > /tmp/claude-stub-down-mutant.$$ 2>&1; then
        echo "  FAIL mutation not caught: $m"; exit 1
      fi
      echo "  ok   caught: $m ($(grep -c FAIL /tmp/claude-stub-down-mutant.$$) case(s) failed)"
      rm -f /tmp/claude-stub-down-mutant.$$
    ) || exit 1
    for p in "$MODEL" "$STORE" "$NEIGHBOUR" "$SEARCH"; do pkill -f "stub.mjs --port $p( |\$)" 2>/dev/null; done
    sleep 0.3
  done
fi
echo "stub-down selfcheck ok"
exit
}
