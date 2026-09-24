#!/usr/bin/env bash
# A break set with a patch that only a model can redden runs with a model
# (`patches_needing_model`, `lane_model_add` and `lane_serving_id` in
# scripts/e2e-lanes/lane-env.sh, wired into scripts/e2e-lanes/wt-break.sh).
# Held to that:
#
#   the header        a patch saying "Reddens only where a model answers" is
#                     named; one that does not, or is not there, is not
#   the lane list     the lane is added to RUNDESK_LANE_MODEL, which keeps the
#                     lanes it had; `all` and a lane already there are left be
#   the stamp         a lane serving a revision with a model is not the lane
#                     serving it without one
#   the runner        asks every patch of the set, adds the lane when one needs
#                     it, and stamps and compares what the lane serves, not the
#                     revision alone
#
# `found-24-sep/model-patches-measured-without-a-model`: the second drifted plan
# ran `wra-11` and `wra-12` with no model, and both read as reddening nothing.
#
# --mutate runs the cases against broken copies of the helpers and the runner.
#
#   bash scripts/check-model-lanes.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/breaks"
printf '# Reddens only where a model answers: run it on a lane with a model.\n# Reddens: s: "x"\n' > "$TMP/breaks/needs-1.py"
printf '# Reddens: s: "y"\n# a comment that mentions where a model answers, not as the header says it\n' > "$TMP/breaks/plain-1.py"

cases () {
  local env="$1" runner="$2" bad=0 out
  fail () { echo "  $1"; bad=$((bad + 1)); }

  out=$(bash -c ". '$env'; patches_needing_model '$TMP/breaks' plain-1 needs-1 absent-1")
  [ "$out" = "needs-1" ] || fail "the header: named '$(echo "$out" | tr '\n' ' ')', not 'needs-1'"

  out=$(env -u RUNDESK_LANE_MODEL bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "7" ] || fail "the lane list, none before: '$out'"
  out=$(RUNDESK_LANE_MODEL=1 bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "1 7" ] || fail "the lane list, lane 1 before: '$out'"
  out=$(RUNDESK_LANE_MODEL=all bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "all" ] || fail "the lane list, all before: '$out'"
  out=$(RUNDESK_LANE_MODEL="3 7" bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "3 7" ] || fail "the lane list, lane 7 already there: '$out'"
  env -u RUNDESK_LANE_MODEL bash -c ". '$env'; lane_model_add 7; lane_has_model 7" || fail 'the lane list: lane 7 added and still has no model'

  local without with
  without=$(env -u RUNDESK_LANE_MODEL bash -c ". '$env'; lane_serving_id abc123 7")
  with=$(RUNDESK_LANE_MODEL=7 bash -c ". '$env'; lane_serving_id abc123 7")
  [ "$without" = "abc123" ] || fail "the stamp without a model: '$without'"
  [ -n "$with" ] && [ "$with" != "$without" ] || fail "the stamp: with a model '$with', without '$without'"

  grep -q 'patches_needing_model "$REPO/test/e2e/breaks" "$@"' "$runner" || fail 'the runner: does not ask the set’s patches'
  grep -q '^\[ -n "$NEEDS_MODEL" \] && lane_model_add "$LANE"$' "$runner" || fail 'the runner: does not add the lane'
  grep -q '^SERVING="$(lane_serving_id "$REV" "$LANE")"$' "$runner" || fail 'the runner: does not work out what it serves'
  grep -q '!= "$SERVING" \]; then$' "$runner" || fail 'the runner: compares the stamp with the revision alone'
  grep -q '"$REV" > "$STAMP"' "$runner" && fail 'the runner: stamps the revision alone'
  [ "$(grep -c '"$SERVING" > "$STAMP"' "$runner")" = 2 ] || fail 'the runner: does not stamp what it serves, after the sync and after the set'
  # The model is decided before the stamp is read, or the stamp answers for a
  # lane that is about to change.
  local add stamp
  add=$(grep -n 'lane_model_add "$LANE"' "$runner" | head -1 | cut -d: -f1)
  stamp=$(grep -n '^SERVING=' "$runner" | head -1 | cut -d: -f1)
  [ -n "$add" ] && [ -n "$stamp" ] && [ "$add" -lt "$stamp" ] || fail "the runner: the lane is added at line ${add:-none}, after the stamp at ${stamp:-none}"
  return $bad
}

ENV="$REPO/scripts/e2e-lanes/lane-env.sh"
RUNNER="$REPO/scripts/e2e-lanes/wt-break.sh"
if cases "$ENV" "$RUNNER"; then
  echo "ok model lanes: a set with a patch only a model can redden runs with one, and the stamp says so"
else
  echo "not ok model lanes"; exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

# FILE|sed expression. Each is applied to a copy of that file alone.
MUTANTS=(
  # The header not read: no patch ever needs a model.
  "env|s/^    grep -q '\\^# Reddens only where a model answers' \"\\\$dir\\/\\\$p.py\" 2>\\/dev\\/null \\&\\& echo \"\\\$p\"\$/    :/"
  # The lane list replaced, not added to: the lanes it had lose their model.
  "env|s/^  export RUNDESK_LANE_MODEL=\"\\\$\\{RUNDESK_LANE_MODEL:\\+\\\$RUNDESK_LANE_MODEL \\}\\\$k\"\$/  export RUNDESK_LANE_MODEL=\"\\\$k\"/"
  # The stamp blind to the model: a lane without one passes for a lane with.
  "env|s/^  if lane_has_model \"\\\$k\"; then echo \"\\\$rev \\+model\"; else echo \"\\\$rev\"; fi\$/  echo \"\\\$rev\"/"
  # The runner never adds the lane.
  "runner|s/^\\[ -n \"\\\$NEEDS_MODEL\" \\] \\&\\& lane_model_add \"\\\$LANE\"\$/:/"
  # The runner stamps the revision alone at the end of a set.
  "runner|s/^restart \\&\\& echo \"\\\$SERVING\" > \"\\\$STAMP\"\$/restart \\&\\& echo \"\\\$REV\" > \"\\\$STAMP\"/"
)
caught=0
for i in "${!MUTANTS[@]}"; do
  which="${MUTANTS[$i]%%|*}"
  expr="${MUTANTS[$i]#*|}"
  e="$ENV"; r="$RUNNER"
  if [ "$which" = env ]; then
    e="$TMP/env-$i.sh"; sed -E "$expr" "$ENV" > "$e"; orig="$ENV"; m="$e"
  else
    r="$TMP/runner-$i.sh"; sed -E "$expr" "$RUNNER" > "$r"; orig="$RUNNER"; m="$r"
  fi
  if cmp -s "$m" "$orig"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"; continue
  fi
  if cases "$e" "$r" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: $expr"
  else caught=$((caught + 1)); fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of the model-lane rule are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"; exit 1
fi
