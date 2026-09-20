#!/bin/bash
# Run every suite across a set of lanes, N at a time.
#   sweep.sh "<lane> <lane> ..." <suite> <suite> ...
# One line per suite in /tmp/claude-0/sweep-results.txt.
set -u
cd /home/user/rundesk
LANES=($1); shift
OUT=/tmp/claude-0/sweep-results.txt
: > "$OUT"
i=0
PIDS=()
for suite in "$@"; do
  lane=${LANES[$((i % ${#LANES[@]}))]}
  bash /tmp/claude-0/verify.sh "$suite" "$lane" >> "$OUT" 2>&1 &
  PIDS+=($!)
  i=$((i+1))
  if [ $((i % ${#LANES[@]})) -eq 0 ]; then
    for p in "${PIDS[@]}"; do wait "$p"; done
    PIDS=()
  fi
done
for p in "${PIDS[@]:-}"; do wait "$p" 2>/dev/null; done
echo "SWEEP DONE" >> "$OUT"
