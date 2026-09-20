#!/bin/bash
# Run a list of suites across the four lanes, four at a time.
#   batch.sh <suite> <suite> ...
# Results collect in /tmp/claude-0/batch-results.txt, one line per suite.
set -u
cd /home/user/rundesk
OUT=/tmp/claude-0/batch-results.txt
: > "$OUT"
LANE=1
PIDS=()
run_one() {
  local suite="$1" lane="$2"
  bash /tmp/claude-0/verify.sh "$suite" "$lane" >> "$OUT" 2>&1
}
for suite in "$@"; do
  run_one "$suite" "$LANE" &
  PIDS+=($!)
  LANE=$((LANE + 1))
  if [ "$LANE" -gt 4 ]; then
    for p in "${PIDS[@]}"; do wait "$p"; done
    PIDS=()
    LANE=1
  fi
done
for p in "${PIDS[@]:-}"; do wait "$p" 2>/dev/null; done
echo "BATCH DONE" >> "$OUT"
grep -E '^== |passed,|FAIL' "$OUT" | sed 's/\x1b\[[0-9;]*m//g'
