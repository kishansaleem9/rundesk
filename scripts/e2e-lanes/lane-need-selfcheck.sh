#!/bin/bash
# A suite runs on a lane whose model it can pass on (`suite_lane_need`,
# `lane_need_refusal`, `lane_model_remove`, lane-env.sh;
# `harness/model-lane-routing-unbuilt`).
#
#   bash scripts/e2e-lanes/lane-need-selfcheck.sh [--mutate]
#
# The need is read from a suite's header; the refusal is decided for every pair
# of need and lane answer; and a lane taken out of `RUNDESK_LANE_MODEL` (the
# break runner's answer to a suite that needs no model) is out of it, whether
# the lanes were listed or `all`. With --mutate, helpers that read no header,
# refuse nothing, or take nothing away must each be caught by the same cases.
# No lane, no API: CI's verify job runs it too.
# READ WHOLE BEFORE IT RUNS (`lane-scripts-read-as-they-run`).
{
set -u
# Beside this script, so CI's checkout (not /home/user/rundesk) reads it too.
. "$(cd "$(dirname "$0")" && pwd)/lane-env.sh"
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
printf '%s\n' "// Lane: no-model — asserts the refusal" "chk(true, 'x')" > "$DIR/refusal.mjs"
printf '%s\n' "// Lane: model — stages the stub" "chk(true, 'x')" > "$DIR/staged.mjs"
printf '%s\n' "/** a suite */" "chk(true, 'x')" > "$DIR/plain.mjs"
printf '%s\n' "chk(true, 'x') // Lane: no-model is not a header here" > "$DIR/inline.mjs"

run_cases () {
  local bad=0 got want f pair
  for f in refusal:no-model staged:model plain:any inline:any; do
    want=${f#*:}; f=${f%%:*}
    got=$(suite_lane_need "$DIR/$f.mjs")
    if [ "$got" = "$want" ]; then echo "  ok   $f.mjs needs $got"
    else echo "  FAIL $f.mjs needs $got, expected $want"; bad=1; fi
  done
  for pair in no-model:yes:refuse no-model:no:run no-model:unknown:run model:no:refuse model:yes:run model:unknown:run any:yes:run any:no:run; do
    want=${pair##*:}; f=${pair%:*}
    if [ -n "$(lane_need_refusal "${f%%:*}" "${f#*:}")" ]; then got=refuse; else got=run; fi
    if [ "$got" = "$want" ]; then echo "  ok   a ${f%%:*} suite on a lane answering ${f#*:}: $got"
    else echo "  FAIL a ${f%%:*} suite on a lane answering ${f#*:}: $got, expected $want"; bad=1; fi
  done
  got=$(RUNDESK_LANE_MODEL="1 3 7"; lane_model_remove 3; echo "$RUNDESK_LANE_MODEL")
  if [ "$got" = "1 7" ]; then echo "  ok   lane 3 taken out of \"1 3 7\" leaves \"1 7\""
  else echo "  FAIL lane 3 taken out of \"1 3 7\" leaves \"$got\""; bad=1; fi
  got=$(RUNDESK_LANE_MODEL=all; lane_model_remove 5; lane_has_model 5 && echo 5-has; lane_has_model 4 && echo 4-has)
  if [ "$got" = "4-has" ]; then echo "  ok   lane 5 taken out of \"all\" has none, and lane 4 still has one"
  else echo "  FAIL lane 5 taken out of \"all\": $(echo $got)"; bad=1; fi
  return $bad
}

echo "lane needs, on stand-in suites:"
if ! run_cases; then echo "lane-need selfcheck FAILED"; exit 1; fi

if [ "${1:-}" = "--mutate" ]; then
  for m in "a need read from no header" "a refusal that refuses nothing" "a remove that takes nothing"; do
    (
      case "$m" in
        "a need read from no header") suite_lane_need () { echo any; } ;;
        "a refusal that refuses nothing") lane_need_refusal () { :; } ;;
        "a remove that takes nothing") lane_model_remove () { return 0; } ;;
      esac
      if run_cases > "$DIR/mutant.out" 2>&1; then
        echo "  FAIL mutation not caught: $m"; exit 1
      fi
      echo "  ok   caught: $m ($(grep -c FAIL "$DIR/mutant.out") case(s) failed)"
    ) || exit 1
  done
fi
echo "lane-need selfcheck ok"
exit
}
