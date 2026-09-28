#!/bin/bash
# Run suites across a set of lanes, one per lane at a time, and say which failed.
#
#   sweep.sh "<lane> <lane> ..." [<suite> ...]    # no suites: every test/e2e/*.mjs
#
# One line per suite in /tmp/claude-0/sweep-results.txt, a summary at the end,
# and a non-zero exit when any suite did not pass.
#
# WHAT THIS REPLACED, because each part of it was a defect:
#
#   · it ran `bash /tmp/claude-0/verify.sh` — an uncommitted copy two days
#     older than the repo's, without the refusal to run against an API built
#     from older source. A sweep through it could report green for a build
#     that no longer existed;
#   · it never read a status: the summary was whatever the runs printed, and
#     the script's own exit was the last `wait`'s;
#   · it ran lanes in ROUNDS, so one slow suite held three idle lanes until it
#     finished;
#   · `batch.sh` was a second copy of it with the lanes fixed at 1–4.
#
# Now a shared queue feeds one worker per lane, each suite's exit status is
# recorded beside its name, and `batch.sh` calls this.
# READ WHOLE BEFORE IT RUNS. Bash reads a script as it goes, by offset, so an
# edit to this file while it runs shifts what the run reads next — two break
# sets died that way (`lane-scripts-read-as-they-run`). The body is one brace
# group, which bash parses entirely before running any of it, and it ends in
# `exit`, so nothing appended after it runs either.
{
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"

LANES=(${1:-})
shift || true
if [ "${#LANES[@]}" -eq 0 ]; then
  echo 'usage: sweep.sh "<lane> <lane> ..." [<suite> ...]' >&2
  exit 2
fi
SUITES=("$@")
if [ "${#SUITES[@]}" -eq 0 ]; then
  mapfile -t SUITES < <(ls test/e2e/*.mjs | xargs -n1 basename | sed 's/\.mjs$//')
fi

# EACH SWEEP HAS ITS OWN RECORD. The status, results, queue and lock were four
# fixed paths, truncated when a sweep started: a second sweep emptied the
# first's status and results mid-run, so the first's summary counted a mixture,
# and it overwrote the first's QUEUE, so the first's workers could take the
# second's suites (`found-24-sep/two-sweeps-share-one-record`). Now they live in
# `sweeps/<pid>/`, and the familiar paths are links to the newest sweep's files
# for a reader who wants "the last sweep". `SWEEP_DIR` and `SWEEP_VERIFY` move
# the record and stand in for verify.sh, for `sweep-selfcheck.sh`.
BASE="${SWEEP_DIR:-/tmp/claude-0}"
RUN="$BASE/sweeps/$$"
mkdir -p "$RUN"
OUT="$RUN/sweep-results.txt"
STATUS="$RUN/sweep-status.txt"
QUEUE="$RUN/sweep-queue.txt"
LOCK="$RUN/sweep-queue.lock"
VERIFY="${SWEEP_VERIFY:-$HERE/verify.sh}"
: > "$OUT"
: > "$STATUS"
printf '%s\n' "${SUITES[@]}" > "$QUEUE"
ln -sfn "$OUT" "$BASE/sweep-results.txt"
ln -sfn "$STATUS" "$BASE/sweep-status.txt"

# Take the next suite off the queue, under a lock, so two lanes never run one.
next_suite() {
  (
    flock 9
    local s
    s="$(head -n1 "$QUEUE")"
    [ -n "$s" ] && sed -i '1d' "$QUEUE"
    printf '%s' "$s"
  ) 9> "$LOCK"
}

worker() {
  local lane="$1" suite code
  while :; do
    suite="$(next_suite)"
    [ -z "$suite" ] && return 0
    bash "$VERIFY" "$suite" "$lane" >> "$OUT" 2>&1
    code=$?
    ( flock 9; echo "$code $suite lane$lane" >> "$STATUS" ) 9> "$LOCK"
  done
}

echo "sweep: ${#SUITES[@]} suite(s) across lanes ${LANES[*]} at $(git rev-parse --short HEAD) — its record is $RUN"
PIDS=()
for lane in "${LANES[@]}"; do
  worker "$lane" &
  PIDS+=($!)
done
for p in "${PIDS[@]}"; do wait "$p"; done

total=$(wc -l < "$STATUS")
bad=$(awk '$1 != 0' "$STATUS" | wc -l)
echo "SWEEP DONE" >> "$OUT"
echo "sweep: $((total - bad)) of $total passed at $(git rev-parse --short HEAD)"
if [ "$total" -ne "${#SUITES[@]}" ]; then
  echo "sweep: $total of ${#SUITES[@]} suites reported a status — the rest never ran" >&2
  exit 1
fi
if [ "$bad" -gt 0 ]; then
  echo "sweep: these did not pass (exit, suite, lane) — 6 to 9 are verify.sh refusing: a stale bundle or build, another tree on the port, or a database whose schema differs:"
  awk '$1 != 0' "$STATUS" | sort -k2
  exit 1
fi
exit 0
exit
}
