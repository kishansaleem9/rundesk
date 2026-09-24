#!/usr/bin/env bash
# `run-plan.sh` hands each plan line to a free lane, and a suite's results go
# to ONE file per suite, so two sets of the same suite must never run at once
# (`found-24-sep/one-suite-two-lanes-share-a-results-file`). Held to that with
# a stand-in for `wt-break.sh` that takes the same two locks
# (`break_locks_take`), writes down when it held them, and sleeps:
#
#   one suite, three sets    never two at once, and none refused or lost
#   other suites             run beside it meanwhile — the lanes stay busy
#   held by another run      a suite locked by somebody else is waited for,
#                            not handed out and refused
#   drained                  every line started once; "PLAN DRAINED: 5 of 5"
#
# --mutate runs the same plan against broken copies of the dispatcher.
#
#   bash scripts/check-run-plan.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$TMP"' EXIT

# The stand-in: the real locks, a pause BEFORE taking them (as the real runner
# has — it syncs first), and a trace line at each end of its hold.
cat > "$TMP/fake-wt-break.sh" <<'FAKE'
lane="$1"; suite="$2"
. "$REPO/scripts/e2e-lanes/lane-env.sh"
sleep 0.4
if ! break_locks_take "$lane" "$suite" 2>/dev/null; then echo "refused $lane $suite" >> "$TRACE"; exit 3; fi
echo "start $(date +%s%N) $lane $suite $*" >> "$TRACE"
sleep 1.2
echo "end $(date +%s%N) $lane $suite" >> "$TRACE"
break_locks_drop "$lane" "$suite"
FAKE

printf '%s\n' 'a p1' 'a p2' 'b q1' 'a p3' 'c r1' > "$TMP/plan.txt"

# run <run-plan copy> <case dir> — dispatches the plan; prints what went wrong, one line each.
run () {
  local dispatcher="$1" dir="$2" rc bad=0 began
  rm -rf "$dir"; mkdir -p "$dir"
  # Another run holds suite c for the first two seconds.
  began=$(date +%s%N)
  sleep 2 & local other=$!
  mkdir "$dir/break-c.lock"; echo "$other" > "$dir/break-c.lock/pid"
  ( cd "$REPO" && REPO="$REPO" TRACE="$dir/trace" BREAK_LOCK_DIR="$dir" WT_BREAK="$TMP/fake-wt-break.sh" \
      RUN_PLAN_REPO="$REPO" LANES="7 8 9" DISPATCH_TICK=0.2 \
      timeout 60 bash "$dispatcher" "$TMP/plan.txt" "$dir/log" >/dev/null 2>&1 ); rc=$?
  wait "$other" 2>/dev/null
  [ "$rc" = 0 ] || { echo "  the dispatcher exited $rc"; bad=$((bad + 1)); }
  grep -q '^refused' "$dir/trace" 2>/dev/null && { echo "  handed out a set that was then refused: $(grep '^refused' "$dir/trace" | tr '\n' ';')"; bad=$((bad + 1)); }
  local starts
  starts=$(grep -c '^start' "$dir/trace" 2>/dev/null || true)
  [ "${starts:-0}" = 5 ] || { echo "  $starts of 5 sets ran"; bad=$((bad + 1)); }
  grep -q 'PLAN DRAINED: 5 set(s) launched of 5' "$dir/log" 2>/dev/null || { echo "  never drained: $(tail -1 "$dir/log" 2>/dev/null)"; bad=$((bad + 1)); }
  # Overlap, by suite, and whether anything ran beside anything at all.
  node -e '
    const lines = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map((l) => l.split(" "))
    const open = new Map(), spans = []
    for (const [what, at, lane, suite] of lines) {
      if (what === "start") open.set(lane, { suite, from: BigInt(at) })
      if (what === "end") { const o = open.get(lane); spans.push({ ...o, to: BigInt(at) }); open.delete(lane) }
    }
    const overlap = (x, y) => x.from < y.to && y.from < x.to
    const clash = spans.some((x, i) => spans.some((y, j) => i < j && x.suite === y.suite && overlap(x, y)))
    const beside = spans.some((x, i) => spans.some((y, j) => i < j && overlap(x, y)))
    // The other holder lives two seconds from `began`; c may start only after.
    const cEarly = spans.some((x) => x.suite === "c" && x.from < BigInt(process.argv[2]) + 1900000000n)
    if (clash) console.log("  two sets of one suite ran at once")
    if (!beside) console.log("  nothing ran beside anything — the lanes were not used")
    if (cEarly) console.log("  suite c ran while another run held it")
  ' "$dir/trace" "$began" 2>/dev/null | tee "$dir/verdict"
  [ -s "$dir/verdict" ] && bad=$((bad + 1))
  return $bad
}

if out=$(run "$REPO/scripts/e2e-lanes/run-plan.sh" "$TMP/real"); then
  echo "ok run-plan: one suite never runs twice at once, other suites run beside it, a suite held elsewhere is waited for, the plan drains"
else
  echo "not ok run-plan"; echo "$out"; exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

MUTANTS=(
  # A set handed out while this dispatcher has the same suite running elsewhere.
  's/^        \[ -n "\$\{PID\[\$l\]:-\}" \] && \[ "\$\{WHAT\[\$l\]:-\}" = "\$cand" \] && busy=yes$/        :/'
  # A suite held by another run handed out anyway.
  's/^      \[ -z "\$busy" \] && lock_held "\$DIR\/break-\$cand.lock" && busy=yes$/      :/'
  # Plan order and nothing else, as it was: the next line whatever its suite.
  's/^      \[ -n "\$busy" \] && continue$/      :/'
)
caught=0
for i in "${!MUTANTS[@]}"; do
  m="$TMP/run-plan-$i.sh"
  sed -E "${MUTANTS[$i]}" "$REPO/scripts/e2e-lanes/run-plan.sh" > "$m"
  if cmp -s "$m" "$REPO/scripts/e2e-lanes/run-plan.sh"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"; continue
  fi
  if run "$m" "$TMP/m$i" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: ${MUTANTS[$i]}"
  else caught=$((caught + 1)); fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of the dispatcher are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"; exit 1
fi
