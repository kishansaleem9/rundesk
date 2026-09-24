#!/usr/bin/env bash
# A lane argument has one reading everywhere: a LIST (`lane_list` in
# scripts/e2e-lanes/lane-env.sh), read by `fleet-up.sh` and `fleet-restart.sh`.
# Held to that:
#
#   one number    "3" is lane three, never lanes one to three
#   a list        "9 10" is lanes nine and ten, in that order
#   refused       0, 11, a word and nothing at all, each with exit 2
#   the scripts   both read their argument through `lane_list`, and
#                 `fleet-up.sh` no longer turns a number into a `seq`
#
# `commit-log/log-8ac33d9-1`: `fleet-up.sh` read a bare number as a count and
# drops the database of every lane it is given, so healing one down lane with
# `fleet-up.sh "3"` (`sweep-until-clean.sh`) would have dropped lanes 1 and 2.
#
# --mutate runs the cases against broken copies of the helper and the scripts.
#
#   bash scripts/check-lane-lists.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cases () {
  local env="$1" up="$2" restart="$3" bad=0 out rc
  fail () { echo "  $1"; bad=$((bad + 1)); }

  out=$(bash -c ". '$env'; lane_list 3" 2>/dev/null | tr '\n' ' ')
  [ "$out" = "3 " ] || fail "one number: '3' read as '$out'"
  out=$(bash -c ". '$env'; lane_list 9 10" 2>/dev/null | tr '\n' ' ')
  [ "$out" = "9 10 " ] || fail "a list: '9 10' read as '$out'"
  out=$(bash -c ". '$env'; lane_list '4 2'" 2>/dev/null | tr '\n' ' ')
  [ "$out" = "4 2 " ] || fail "a list in one word: '4 2' read as '$out'"
  for arg in 0 11 lane ''; do
    bash -c ". '$env'; lane_list $arg" > /dev/null 2>&1; rc=$?
    [ "$rc" = 2 ] || fail "refused: '$arg' answered $rc, not 2"
  done

  grep -q 'LANES=($(lane_list ${\*:-1 2 3 4})) || exit 2' "$up" || fail 'fleet-up.sh: does not read its lanes through lane_list'
  grep -q 'seq 1 "$ARG"' "$up" && fail 'fleet-up.sh: still turns a number into a range'
  grep -q 'LANES=($(lane_list ${\*:-1 2 3 4 5 6 7 8 9 10})) || exit 2' "$restart" || fail 'fleet-restart.sh: does not read its lanes through lane_list'
  return $bad
}

ENV="$REPO/scripts/e2e-lanes/lane-env.sh"
UP="$REPO/scripts/e2e-lanes/fleet-up.sh"
RESTART="$REPO/scripts/e2e-lanes/fleet-restart.sh"
if cases "$ENV" "$UP" "$RESTART"; then
  echo "ok lane lists: a number is one lane, a list is those lanes, and both fleet scripts read them so"
else
  echo "not ok lane lists"; exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

# FILE|sed expression, applied to a copy of that file alone.
MUTANTS=(
  # The count again: a bare number is lanes one to it.
  'env|s/^    out\+=\("\$k"\)$/    out+=($(seq 1 "$k"))/'
  # No range check: lane 0 and lane 11 are lanes.
  'env|s/^    if \[ "\$k" -lt 1 \] \|\| \[ "\$k" -gt 10 \]; then echo "lane out of range: \$k" >\&2; return 2; fi$/    :/'
  # A word is let through as a lane.
  "env|s/^      ''\\|\\*\\[!0-9\\]\\*\\) echo \"not a lane number: '\\\$k'\" >\\&2; return 2 ;;\$/      '') return 2 ;;/"
  # fleet-up.sh reads its argument as a count, as it did.
  'up|s/^LANES=\(\$\(lane_list \$\{\*:-1 2 3 4\}\)\) \|\| exit 2$/LANES=($(seq 1 "$ARG"))/'
  # fleet-restart.sh takes whatever it is given.
  'restart|s/^LANES=\(\$\(lane_list \$\{\*:-1 2 3 4 5 6 7 8 9 10\}\)\) \|\| exit 2$/LANES=(${*:-1 2 3 4 5 6 7 8 9 10})/'
)
caught=0
for i in "${!MUTANTS[@]}"; do
  which="${MUTANTS[$i]%%|*}"
  expr="${MUTANTS[$i]#*|}"
  e="$ENV"; u="$UP"; r="$RESTART"
  case "$which" in
    env) orig="$ENV"; e="$TMP/env-$i.sh"; m="$e" ;;
    up) orig="$UP"; u="$TMP/up-$i.sh"; m="$u" ;;
    restart) orig="$RESTART"; r="$TMP/restart-$i.sh"; m="$r" ;;
  esac
  sed -E "$expr" "$orig" > "$m"
  if cmp -s "$m" "$orig"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"; continue
  fi
  if cases "$e" "$u" "$r" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: $expr"
  else caught=$((caught + 1)); fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of the lane-list rule are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"; exit 1
fi
